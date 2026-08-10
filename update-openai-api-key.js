#!/usr/bin/env node
const { readServerEnv, setFirebaseSecret } = require('./scripts/lib/env-secrets');

const { openai } = readServerEnv();
if (!openai || !openai.startsWith('sk-')) {
  console.error('❌ OPENAI_API_KEY no encontrada en server/.env');
  process.exit(1);
}

console.log('\n=== Solo OPENAI_API_KEY ===\n');
setFirebaseSecret('OPENAI_API_KEY', openai);
console.log('\n✅ OPENAI guardada. Despliega: npm run deploy:functions\n');
