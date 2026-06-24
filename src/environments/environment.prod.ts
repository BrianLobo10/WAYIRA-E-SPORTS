export const environment = {
  production: true,
  apiUrl: (typeof window !== 'undefined' && (window as any).__API_URL__)
    ? (window as any).__API_URL__
    : '/api',
  // Firebase: en CI se puede inyectar desde variables de entorno
  firebase: {
    apiKey: 'AIzaSyBWfxliL4sO5Z4-JN8_O7REFv9aorvWAN8',
    authDomain: 'wayira-e-sports.firebaseapp.com',
    projectId: 'wayira-e-sports',
    storageBucket: 'wayira-e-sports.firebasestorage.app',
    messagingSenderId: '921665995157',
    appId: '1:921665995157:web:531524a6684a835b38b69c',
    measurementId: 'G-H2BNP82PF1'
  }
};
