#!/usr/bin/env node
/**
 * Sube RIOT + OPENAI desde server/.env a Firebase Secrets.
 * Uso:
 *   npm run setup:secrets          → solo secretos
 *   npm run setup:secrets:deploy   → secretos + deploy functions (con reintentos)
 */
const { execSync } = require('child_process');
const { syncSecretsFromEnv, ROOT } = require('./lib/env-secrets');

const withDeploy = process.argv.includes('--deploy');

function sleep(ms) {
  return new Promise((r) => setTimeout(r, ms));
}

async function deployFunctions(retries = 5) {
  console.log('\n⏳ Esperando 20s (Firebase termina permisos de secretos)...\n');
  await sleep(20000);

  for (let attempt = 1; attempt <= retries; attempt++) {
    try {
      console.log(`\n🚀 Deploy functions (intento ${attempt}/${retries}) — puede tardar 1-2 min...\n`);
      execSync('firebase deploy --only functions:api', {
        cwd: ROOT,
        stdio: 'inherit',
        shell: true
      });
      console.log('\n✅ Functions desplegadas.\n');
      return;
    } catch (e) {
      if (attempt >= retries) throw e;
      console.warn('\n⚠️  Error de Firebase (a veces es temporal). Reintento en 60 segundos...\n');
      await sleep(60000);
    }
  }
}

async function main() {
  console.log('\n=== WAYIRA — Configurar secretos ===\n');
  syncSecretsFromEnv({ requireOpenai: true });

  if (withDeploy) {
    await deployFunctions();
  } else {
    console.log('\n✅ Secretos listos. Despliega con:');
    console.log('   npm run deploy:stack');
    console.log('   npm run release\n');
  }
}

main().catch((e) => {
  console.error('\n❌', e.message || e);
  process.exit(1);
});
