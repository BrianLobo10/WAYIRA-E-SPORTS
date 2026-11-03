export const environment = {
  production: true,
  apiUrl: (typeof window !== 'undefined' && (window as any).__API_URL__)
    ? (window as any).__API_URL__
    : '/api',
  // Supabase: URL y clave PÚBLICA (publishable). Nunca la clave service_role aquí.
  supabase: {
    url: 'https://vghcjtdfwtbznowlovxa.supabase.co',
    publishableKey: 'sb_publishable_iLyRy0MQfGYet9NPTVVngA_E2orQxn1',
    functionsUrl: 'https://vghcjtdfwtbznowlovxa.supabase.co/functions/v1'
  }
};
