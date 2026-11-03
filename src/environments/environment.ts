export const environment: {
  production: boolean;
  apiUrl: string;
  supabase: { url: string; publishableKey: string; functionsUrl: string };
} = {
  production: false,
  apiUrl: '/api',
  // Supabase: URL y clave PÚBLICA (publishable). Nunca la clave service_role aquí.
  supabase: {
    url: 'https://vghcjtdfwtbznowlovxa.supabase.co',
    publishableKey: 'sb_publishable_iLyRy0MQfGYet9NPTVVngA_E2orQxn1',
    functionsUrl: 'https://vghcjtdfwtbznowlovxa.supabase.co/functions/v1'
  }
};
