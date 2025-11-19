export const environment = {
  production: true,
  // URL del servidor backend
  // Con Firebase Cloud Functions, usa '/api' para rutas relativas
  // Firebase Hosting redirige automáticamente /api/** a la Cloud Function
  apiUrl: (typeof window !== 'undefined' && (window as any).__API_URL__) 
    ? (window as any).__API_URL__ 
    : '/api' // URL relativa para Firebase Cloud Functions
};
