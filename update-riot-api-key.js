#!/usr/bin/env node
const { syncSecretsFromEnv } = require('./scripts/lib/env-secrets');

console.log('\n=== Solo RIOT_API_KEY ===\n');
syncSecretsFromEnv({ requireOpenai: false });
console.log('\n✅ RIOT guardada. Despliega: npm run deploy:functions\n');
