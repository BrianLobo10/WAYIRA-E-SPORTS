#!/usr/bin/env node
/**
 * Despliega Firebase por partes (evita errores "Internal error" en deploy completo).
 * Uso:
 *   npm run deploy:stack              → rules + hosting + functions
 *   npm run deploy:stack -- --functions-only
 */
const { execSync } = require('child_process');
const { ROOT } = require('./lib/env-secrets');

const functionsOnly = process.argv.includes('--functions-only');
const hostingOnly = process.argv.includes('--hosting-only');

function run(cmd) {
  console.log('\n> ' + cmd + '\n');
  execSync(cmd, { cwd: ROOT, stdio: 'inherit', shell: true });
}

function sleep(ms) {
  return new Promise((r) => setTimeout(r, ms));
}

async function deployFunctions(retries = 5) {
  for (let attempt = 1; attempt <= retries; attempt++) {
    try {
      console.log(`\n> firebase deploy --only functions:api (intento ${attempt}/${retries}, ~1-2 min)\n`);
      run('firebase deploy --only functions:api');
      return;
    } catch {
      if (attempt >= retries) {
        console.error('\n❌ Functions falló tras varios intentos.');
        console.error('   Espera 3 min y ejecuta: npm run deploy:functions\n');
        process.exit(1);
      }
      console.warn(`\n⚠️  Reintento en 60 segundos (${attempt + 1}/${retries})...\n`);
      await sleep(60000);
    }
  }
}

async function main() {
  if (functionsOnly) {
    await deployFunctions();
    return;
  }

  if (!hostingOnly) {
    console.log('\n=== 1/3 Firestore + Storage rules ===');
    run('firebase deploy --only firestore:rules,storage');
  }

  if (!functionsOnly) {
    console.log('\n=== 2/3 Hosting (Angular) ===');
    run('firebase deploy --only hosting');
  }

  if (!hostingOnly) {
    console.log('\n=== 3/3 Cloud Functions (API + POTATO) ===');
    await deployFunctions();
  }

  console.log('\n✅ Deploy completado: https://wayira-e-sports.web.app\n');
}

main();
