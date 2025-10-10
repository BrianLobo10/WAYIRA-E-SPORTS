import { environment } from '../../environments/environment';

export const API_CONFIG = {
  // URL base del API backend
  // En desarrollo: se usa el proxy configurado en proxy.conf.json
  // En producción: debe apuntar a tu servidor backend desplegado
  BASE_URL: environment.apiUrl
};

// Función para obtener la URL completa del API
export function getApiUrl(endpoint: string = ''): string {
  return `${API_CONFIG.BASE_URL}${endpoint}`;
}
