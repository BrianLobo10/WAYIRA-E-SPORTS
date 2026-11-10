/**
 * Imágenes de League of Legends. Se usan desde CommunityDragon ("latest"), que siempre trae los íconos y
 * campeones nuevos. La versión fija de Data Dragon (14.24.1) no tiene los íconos recientes (p. ej. el 7131).
 */
const CDRAGON = 'https://raw.communitydragon.org/latest/plugins/rcp-be-lol-game-data/global/default/v1';

export const DEFAULT_PROFILE_ICON = `${CDRAGON}/profile-icons/29.jpg`;

export function profileIconUrl(iconId: number | null | undefined): string {
  return Number.isInteger(iconId) && iconId! >= 0 ? `${CDRAGON}/profile-icons/${iconId}.jpg` : DEFAULT_PROFILE_ICON;
}

export function championIconUrl(championId: number | null | undefined): string {
  return Number.isInteger(championId) && championId! > 0 ? `${CDRAGON}/champion-icons/${championId}.png` : `${CDRAGON}/champion-icons/-1.png`;
}
