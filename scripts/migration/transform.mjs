// Transformación pura Firestore -> filas de Supabase (sin red, sin credenciales).
// Entrada: el JSON que produce export-firestore.mjs. Salida: filas por tabla + avisos de integridad.
// Las claves de usuario se resuelven con `uidMap` (firebase_uid -> uuid de Supabase).

import { createHash } from 'node:crypto';

/** UUID determinista a partir de un texto: la importación es repetible sin duplicar filas. */
export function stableUuid(namespace, key) {
  const h = createHash('sha1').update(`${namespace}:${key}`).digest('hex');
  return `${h.slice(0, 8)}-${h.slice(8, 12)}-5${h.slice(13, 16)}-${((parseInt(h[16], 16) & 0x3) | 0x8).toString(16)}${h.slice(17, 20)}-${h.slice(20, 32)}`;
}

/** Timestamp de Firestore exportado ({_seconds,_nanoseconds} | {seconds} | ISO | número) -> ISO o null. */
export function toIso(v) {
  if (v == null) return null;
  if (typeof v === 'string') return Number.isNaN(Date.parse(v)) ? null : new Date(v).toISOString();
  if (typeof v === 'number') return new Date(v).toISOString();
  const s = v._seconds ?? v.seconds;
  if (typeof s === 'number') return new Date(s * 1000 + Math.round((v._nanoseconds ?? v.nanoseconds ?? 0) / 1e6)).toISOString();
  return null;
}

const arr = (v) => (Array.isArray(v) ? v : []);
const str = (v) => (typeof v === 'string' && v.trim() !== '' ? v : null);

export function transform(exp, uidMap) {
  const warnings = [];
  const rows = {
    profiles: [], follows: [], potato_chat_sessions: [], posts: [], post_reactions: [], comments: [],
    comment_reactions: [], conversations: [], messages: [], notifications: [], tournaments: [],
    tournament_teams: [], tournament_players: [], tournament_player_contacts: [], team_tournament_stats: [],
    news: [], contact_messages: [], site_config: []
  };
  const user = (fid, ctx) => {
    if (!fid) return null;
    const id = uidMap[fid];
    if (!id) warnings.push(`${ctx}: usuario de Firebase ${fid} sin cuenta en Supabase; se omite la relación`);
    return id ?? null;
  };
  const col = (name) => Object.entries(exp.firestore?.[name] ?? {});

  // users -> profiles, follows, potato_chat_sessions
  const followSeen = new Set();
  for (const [fid, u] of col('users')) {
    const id = user(fid, `users/${fid}`);
    if (!id) continue;
    rows.profiles.push({
      id, firebase_uid: fid,
      display_name: str(u.displayName) ?? 'Jugador',
      avatar_url: str(u.photoURL), cover_url: str(u.coverImageURL), bio: str(u.bio),
      role: u.role === 'admin' ? 'admin' : 'user',
      riot_game_name: str(u.gameName), riot_tag_line: str(u.tagLine), riot_region: str(u.region),
      riot_puuid: str(u.puuid), riot_verified: u.riotVerified === true,
      created_at: toIso(u.createdAt) ?? new Date().toISOString()
    });
    // following del usuario + followers de otros: se unifican sin duplicar
    for (const other of arr(u.following)) {
      const to = user(other, `users/${fid}.following`);
      const k = `${id}>${to}`;
      if (to && to !== id && !followSeen.has(k)) { followSeen.add(k); rows.follows.push({ follower_id: id, following_id: to }); }
    }
    for (const other of arr(u.followers)) {
      const from = user(other, `users/${fid}.followers`);
      const k = `${from}>${id}`;
      if (from && from !== id && !followSeen.has(k)) { followSeen.add(k); rows.follows.push({ follower_id: from, following_id: id }); }
    }
    const chat = u.__sub?.potatoChat?.session;
    if (chat) rows.potato_chat_sessions.push({ user_id: id, messages: arr(chat.messages) });
  }

  // posts (comentarios y reacciones embebidos) -> tablas normalizadas
  for (const [pid, p] of col('posts')) {
    const author = user(p.authorId, `posts/${pid}`);
    if (!author) continue;
    const id = stableUuid('post', pid);
    rows.posts.push({
      id, firebase_id: pid, author_id: author, content: p.content ?? '',
      image_urls: arr(p.images).filter((x) => typeof x === 'string'), video_url: str(p.video),
      created_at: toIso(p.createdAt), updated_at: toIso(p.updatedAt) ?? toIso(p.createdAt)
    });
    const reacted = new Set();
    for (const [kind, list] of [['like', p.likes], ['dislike', p.dislikes]]) {
      for (const fu of arr(list)) {
        const u = user(fu, `posts/${pid}.${kind}s`);
        if (!u || reacted.has(u)) continue; // un voto por persona (si aparece en ambos, gana el primero)
        reacted.add(u);
        rows.post_reactions.push({ post_id: id, user_id: u, kind });
      }
    }
    const walk = (c, parent, path) => {
      const cAuthor = user(c.authorId, `posts/${pid}.${path}`);
      if (!cAuthor) return;
      const cid = stableUuid('comment', `${pid}/${c.id ?? path}`);
      rows.comments.push({
        id: cid, firebase_id: c.id ?? null, post_id: id, parent_id: parent, author_id: cAuthor,
        content: (c.content ?? '').slice(0, 2000) || '(vacío)', created_at: toIso(c.createdAt)
      });
      const seen = new Set();
      for (const [kind, list] of [['like', c.likes], ['dislike', c.dislikes]]) {
        for (const fu of arr(list)) {
          const u = user(fu, `posts/${pid}.${path}.${kind}s`);
          if (u && !seen.has(u)) { seen.add(u); rows.comment_reactions.push({ comment_id: cid, user_id: u, kind }); }
        }
      }
      arr(c.replies).forEach((r, i) => walk(r, cid, `${path}.replies[${i}]`));
    };
    arr(p.comments).forEach((c, i) => walk(c, null, `comments[${i}]`));
  }

  // conversations (array de mensajes) -> conversations + messages
  for (const [cid, c] of col('conversations')) {
    let a = user(c.user1Id, `conversations/${cid}`);
    let b = user(c.user2Id, `conversations/${cid}`);
    if (!a || !b || a === b) continue;
    if (a > b) [a, b] = [b, a]; // la tabla exige user1_id < user2_id
    const id = stableUuid('conversation', cid);
    const msgs = arr(c.messages);
    rows.conversations.push({
      id, firebase_id: cid, user1_id: a, user2_id: b, created_at: toIso(c.createdAt),
      last_message_at: toIso(c.lastMessageTime) ?? toIso(msgs.at(-1)?.timestamp)
    });
    msgs.forEach((m, i) => {
      const sender = user(m.fromId, `conversations/${cid}.messages[${i}]`);
      if (!sender || (sender !== a && sender !== b) || !str(m.content)) return;
      rows.messages.push({
        id: stableUuid('message', `${cid}/${m.id ?? i}`), conversation_id: id, sender_id: sender,
        content: m.content.slice(0, 4000), created_at: toIso(m.timestamp),
        read_at: m.read ? toIso(m.timestamp) : null
      });
    });
  }

  // notifications
  const postIds = new Set(rows.posts.map((p) => p.firebase_id));
  for (const [nid, n] of col('notifications')) {
    const to = user(n.userId, `notifications/${nid}`);
    if (!to) continue;
    const type = ['like', 'comment', 'comment_reply', 'follow', 'message'].includes(n.type) ? n.type : null;
    if (!type) { warnings.push(`notifications/${nid}: tipo desconocido "${n.type}", se omite`); continue; }
    rows.notifications.push({
      id: stableUuid('notification', nid), firebase_id: nid, user_id: to,
      actor_id: uidMap[n.fromUserId] ?? null, type,
      post_id: n.postId && postIds.has(n.postId) ? stableUuid('post', n.postId) : null,
      comment_id: null, message: str(n.message), read: n.read === true, created_at: toIso(n.createdAt)
    });
  }

  // tournaments (equipos y jugadores embebidos)
  for (const [tid, t] of col('tournaments')) {
    const id = stableUuid('tournament', tid);
    const teamIdMap = {};
    for (const team of arr(t.teams)) teamIdMap[team.id] = stableUuid('team', `${tid}/${team.id ?? team.name}`);
    const remapBracket = (list) => arr(list).map((m) => ({
      ...m,
      team1Id: m.team1Id ? teamIdMap[m.team1Id] ?? m.team1Id : m.team1Id,
      team2Id: m.team2Id ? teamIdMap[m.team2Id] ?? m.team2Id : m.team2Id,
      winnerId: m.winnerId ? teamIdMap[m.winnerId] ?? m.winnerId : m.winnerId,
      loserId: m.loserId ? teamIdMap[m.loserId] ?? m.loserId : m.loserId,
      matchDate: m.matchDate ? toIso(m.matchDate) : m.matchDate
    }));
    rows.tournaments.push({
      id, firebase_id: tid, name: t.name ?? 'Torneo', description: t.description ?? '', game: t.game ?? 'League of Legends',
      start_date: toIso(t.startDate), end_date: toIso(t.endDate), max_teams: t.maxTeams ?? 8,
      status: ['upcoming', 'ongoing', 'finished', 'confirmed'].includes(t.status) ? t.status : 'upcoming',
      format: t.format ?? null, configured_rounds: t.configuredRounds ?? null,
      bracket: remapBracket(t.bracket), lower_bracket: remapBracket(t.lowerBracket),
      confirmed: t.confirmed === true, confirmed_at: toIso(t.confirmedAt),
      prize_pool_usd: t.prizePoolUsd ?? null, grand_final_best_of: t.grandFinalBestOf ?? null,
      redemption_final_best_of: t.redemptionFinalBestOf ?? null, finished_at: toIso(t.finishedAt),
      champion_team_id: teamIdMap[t.championTeamId] ?? null, champion_team_name: t.championTeamName ?? null,
      redemption_champion_team_id: teamIdMap[t.redemptionChampionTeamId] ?? null,
      redemption_champion_team_name: t.redemptionChampionTeamName ?? null,
      created_by: uidMap[t.createdBy] ?? null, created_at: toIso(t.createdAt)
    });
    for (const team of arr(t.teams)) {
      const teamId = teamIdMap[team.id];
      rows.tournament_teams.push({
        id: teamId, legacy_id: team.id ?? null, tournament_id: id, name: team.name ?? 'Equipo',
        logo_url: str(team.logoUrl) ?? str(team.logo), captain_id: uidMap[team.captainId] ?? null,
        captain_name: team.captainName ?? null, registered_at: toIso(team.registeredAt)
      });
      arr(team.playerInfo).forEach((pl, i) => {
        const playerId = stableUuid('player', `${tid}/${team.id}/${i}`);
        rows.tournament_players.push({
          id: playerId, team_id: teamId, user_id: uidMap[pl.userId] ?? null, display_name: pl.name ?? 'Jugador',
          game_name: pl.gameName ?? null, tag_line: pl.tagLine ?? null, position: pl.role ?? null,
          main_champion: pl.mainChampion ?? null, is_substitute: false, sort_order: i
        });
        if (pl.phone || pl.email) rows.tournament_player_contacts.push({ player_id: playerId, phone: pl.phone ?? null, email: pl.email ?? null });
      });
    }
  }
  for (const [sid, s] of col('teamTournamentStats')) {
    rows.team_tournament_stats.push({ team_key: sid, team_name: s.teamName ?? sid, tournaments_won: s.tournamentsWon ?? 0 });
  }

  for (const [nid, n] of col('news')) {
    rows.news.push({
      id: stableUuid('news', nid), firebase_id: nid, title: n.title ?? 'Sin título', content: n.content ?? '',
      excerpt: n.excerpt ?? '', category: n.category ?? 'General', image_url: str(n.imageUrl),
      author_id: uidMap[n.authorId] ?? null, author_name: n.authorName ?? null, published: n.published === true,
      created_at: toIso(n.createdAt), updated_at: toIso(n.updatedAt) ?? toIso(n.createdAt)
    });
  }
  for (const [mid, m] of col('contactMessages')) {
    rows.contact_messages.push({
      id: stableUuid('contact', mid), firebase_id: mid, name: m.name ?? '', email: m.email ?? '', subject: m.subject ?? null,
      message: m.message ?? '', contact_type: m.contactType ?? 'general', read: m.read === true, created_at: toIso(m.createdAt)
    });
  }
  for (const [key, value] of col('config')) {
    const { __sub, ...clean } = value;
    rows.site_config.push({ key, value: JSON.parse(JSON.stringify(clean, (k, v) => (v && typeof v === 'object' && '_seconds' in v ? toIso(v) : v))) });
  }

  // Quita created_at nulos para que actúe el default
  for (const list of Object.values(rows)) for (const r of list) for (const k of Object.keys(r)) if (r[k] === null && /_at$/.test(k) && k !== 'read_at' && k !== 'last_message_at' && k !== 'confirmed_at' && k !== 'finished_at') delete r[k];

  return { rows, warnings };
}

/** Rutas de Storage referenciadas por URLs de Firebase dentro de las filas (para copiarlas). */
export function firebaseStorageUrls(rows) {
  const found = new Set();
  const re = /https:\/\/firebasestorage\.googleapis\.com\/v0\/b\/[^/]+\/o\/[^"\s?]+(\?[^"\s]*)?/g;
  const text = JSON.stringify(rows);
  for (const m of text.matchAll(re)) found.add(m[0]);
  return [...found];
}
