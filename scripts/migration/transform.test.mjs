// node --test transform.test.mjs  — prueba la transformación con datos de ejemplo con la forma real de Firestore.
import test from 'node:test';
import assert from 'node:assert/strict';
import { writeFileSync } from 'node:fs';
import { transform, stableUuid, toIso, firebaseStorageUrls } from './transform.mjs';

const ts = (iso) => ({ _seconds: Math.floor(Date.parse(iso) / 1000), _nanoseconds: 0 });
export const sample = {
  firestore: {
    users: {
      fbA: { displayName: 'Mario', role: 'user', followers: ['fbB'], following: ['fbB', 'fbC'], createdAt: ts('2026-07-11T17:21:00Z'),
        photoURL: 'https://firebasestorage.googleapis.com/v0/b/wayira-e-sports.firebasestorage.app/o/profiles%2FfbA%2Favatar.jpg?alt=media&token=x',
        __sub: { potatoChat: { session: { messages: [{ sender: 'user', text: 'hola' }] } } } },
      fbB: { displayName: 'Rafa', role: 'admin', followers: ['fbA'], following: ['fbA'], createdAt: ts('2026-07-12T10:00:00Z') },
      fbC: { displayName: 'Cami', createdAt: ts('2026-07-12T11:00:00Z'), puuid: 'puuid-c' }
    },
    posts: {
      p1: { authorId: 'fbA', authorName: 'Mario', content: 'El comienzo de todo', likes: ['fbA', 'fbB'], dislikes: [],
        createdAt: ts('2026-07-12T17:22:00Z'), updatedAt: ts('2026-07-13T15:36:00Z'),
        comments: [{ id: 'c1', authorId: 'fbB', content: '🔥', likes: ['fbA'], dislikes: [], createdAt: ts('2026-07-12T18:14:00Z'),
          replies: [{ id: 'c2', authorId: 'fbA', content: 'gracias', likes: [], dislikes: [], createdAt: ts('2026-07-12T18:20:00Z') }] }] }
    },
    notifications: {
      n1: { userId: 'fbA', type: 'follow', fromUserId: 'fbB', fromUserName: 'Rafa', read: true, createdAt: ts('2026-07-12T13:44:00Z') },
      n2: { userId: 'fbA', type: 'like', fromUserId: 'fbB', postId: 'p1', read: false, createdAt: ts('2026-07-12T13:45:00Z') },
      n3: { userId: 'fbZ', type: 'like', fromUserId: 'fbB', read: false, createdAt: ts('2026-07-12T13:46:00Z') }
    },
    conversations: {
      fbA_fbB: { user1Id: 'fbA', user2Id: 'fbB', createdAt: ts('2026-07-12T12:00:00Z'),
        messages: [{ fromId: 'fbA', toId: 'fbB', content: 'hola', timestamp: ts('2026-07-12T12:00:00Z'), read: true },
                   { fromId: 'fbB', toId: 'fbA', content: 'qué tal', timestamp: ts('2026-07-12T12:01:00Z'), read: false }] }
    },
    tournaments: {
      t1: { name: 'Copa Guajira', game: 'League of Legends', maxTeams: 4, status: 'finished', format: 'single', createdBy: 'fbB',
        startDate: ts('2026-08-01T20:00:00Z'), endDate: ts('2026-08-02T20:00:00Z'), createdAt: ts('2026-07-20T00:00:00Z'),
        championTeamId: 'team-1', championTeamName: 'Gallos',
        teams: [{ id: 'team-1', name: 'Gallos', captainId: 'fbA', captainName: 'Mario', players: [], substitutes: [], registeredAt: ts('2026-07-21T00:00:00Z'),
          playerInfo: [{ name: 'Mario', phone: '3000000000', email: 'mario@example.com', gameName: 'Mario', tagLine: 'LAN', role: 'Mid' }] },
                { id: 'team-2', name: 'Lobos', captainId: 'fbX', captainName: 'Externo', players: [], substitutes: [], registeredAt: ts('2026-07-22T00:00:00Z') }],
        bracket: [{ id: 'm1', round: 'Final', team1Id: 'team-1', team2Id: 'team-2', winnerId: 'team-1', score1: 2, score2: 1 }] }
    },
    teamTournamentStats: { 'team-1': { teamId: 'team-1', teamName: 'Gallos', tournamentsWon: 1 } },
    news: { nw1: { title: 'Bienvenidos', content: 'x', excerpt: 'x', category: 'Comunidad', authorId: 'fbB', published: true, createdAt: ts('2026-07-01T00:00:00Z') } },
    contactMessages: {},
    config: { socialStats: { discord: null, registeredUsers: 3, updatedAt: '2026-06-24T00:00:00Z', cachedAt: ts('2026-06-24T19:25:00Z') } }
  },
  authUsers: [
    { uid: 'fbA', email: 'a@example.com', providers: ['google.com'] },
    { uid: 'fbB', email: 'b@example.com', providers: ['google.com'] },
    { uid: 'fbC', email: 'c@example.com', providers: ['google.com'] },
    { uid: 'fbP', email: null, phoneNumber: '+573000000000', providers: ['phone'] }
  ]
};
export const uidMap = { fbA: stableUuid('u', 'A'), fbB: stableUuid('u', 'B'), fbC: stableUuid('u', 'C'), fbP: stableUuid('u', 'P') };

test('toIso convierte timestamps de Firestore', () => {
  assert.equal(toIso(ts('2026-07-12T17:22:00Z')), '2026-07-12T17:22:00.000Z');
  assert.equal(toIso(null), null);
});

test('ids deterministas con formato UUID', () => {
  const id = stableUuid('post', 'p1');
  assert.match(id, /^[0-9a-f]{8}-[0-9a-f]{4}-5[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/);
  assert.equal(id, stableUuid('post', 'p1'));
});

test('transforma la forma real de los datos', () => {
  const { rows, warnings } = transform(sample, uidMap);
  assert.equal(rows.profiles.length, 3);
  assert.equal(rows.profiles.find((p) => p.firebase_uid === 'fbB').role, 'admin');
  assert.equal(rows.follows.length, 3, 'A->B, A->C, B->A sin duplicados');
  assert.equal(rows.potato_chat_sessions.length, 1);
  assert.equal(rows.posts.length, 1);
  assert.equal(rows.post_reactions.length, 2);
  assert.equal(rows.comments.length, 2);
  assert.equal(rows.comments[1].parent_id, rows.comments[0].id, 'respuesta enlazada a su comentario');
  assert.equal(rows.comment_reactions.length, 1);
  assert.equal(rows.conversations.length, 1);
  assert.ok(rows.conversations[0].user1_id < rows.conversations[0].user2_id);
  assert.equal(rows.messages.length, 2);
  assert.equal(rows.notifications.length, 2, 'la notificación del usuario inexistente se omite');
  assert.ok(warnings.some((w) => w.includes('fbZ')));
  assert.equal(rows.tournament_teams.length, 2);
  assert.equal(rows.tournament_player_contacts.length, 1);
  assert.equal(rows.tournaments[0].champion_team_id, rows.tournament_teams[0].id);
  assert.equal(rows.tournaments[0].bracket[0].winnerId, rows.tournament_teams[0].id, 'bracket reapuntado a los nuevos ids');
  assert.equal(rows.site_config[0].value.cachedAt, '2026-06-24T19:25:00.000Z');
  assert.equal(firebaseStorageUrls(rows).length, 1);
});

test('es idempotente', () => {
  assert.deepEqual(transform(sample, uidMap).rows, transform(sample, uidMap).rows);
});

if (process.env.WRITE_SAMPLE_ROWS) {
  writeFileSync(process.env.WRITE_SAMPLE_ROWS, JSON.stringify({ uidMap, rows: transform(sample, uidMap).rows }));
}
