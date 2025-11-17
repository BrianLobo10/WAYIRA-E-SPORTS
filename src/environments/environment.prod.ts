export const environment = {
  production: true,
  // URL del servidor backend desplegado
  // Si usas Railway, Heroku, o similar, reemplaza con tu URL
  // Ejemplo: 'https://tu-servidor.railway.app/api' o 'https://tu-servidor.herokuapp.com/api'
  apiUrl: (typeof window !== 'undefined' && (window as any).__API_URL__) 
    ? (window as any).__API_URL__ 
    : 'https://wayira-api-production.up.railway.app/api' // Cambia por tu URL real
};
