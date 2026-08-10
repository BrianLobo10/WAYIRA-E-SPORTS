#!/usr/bin/env node
/**
 * Release completo: build + secretos + deploy por partes.
 * Uso: npm run release
 */
const { execSync } = require('child_process');
const fs = require('fs');
const path = require('path');
const { syncSecretsFromEnv, ROOT } = require('./lib/env-secrets');

const hostOnly = process.argv.includes('--hosting-only');
const noFunctions = process.argv.includes('--no-functions');
const skipSecrets = process.argv.includes('--no-secrets');

function run(cmd, opts = {}) {
  console.log('\n> ' + cmd);
  execSync(cmd, {
    cwd: opts.cwd || ROOT,
    stdio: 'inherit',
    shell: true
  });
}

function step(title, fn) {
  console.log('\n' + '='.repeat(60));
  console.log('  ' + title);
  console.log('='.repeat(60));
  fn();
}

step('1. Build producción (Angular)', () => {
  run('npm run build:prod');
});

step('2. Verificar build', () => {
  const outDir = path.join(ROOT, 'dist', 'WAYIRAE-SPORTS', 'browser');
  if (!fs.existsSync(outDir)) {
    console.error('No existe:', outDir);
    process.exit(1);
  }
  console.log('OK →', outDir);
});

if (!hostOnly && !noFunctions) {
  step('3. Dependencias Cloud Functions', () => {
    run('npm install', { cwd: path.join(ROOT, 'functions') });
  });

  if (!skipSecrets) {
    step('4. Secretos Firebase (server/.env → Secret Manager)', () => {
      syncSecretsFromEnv({ requireOpenai: true });
    });
  } else {
    console.log('\n(Omitiendo sync de secretos: --no-secrets)');
  }
}

step(hostOnly ? '3. Deploy hosting' : noFunctions ? '3. Deploy sin functions' : '5. Deploy Firebase', () => {
  if (hostOnly) {
    run('node scripts/deploy-stack.js --hosting-only');
  } else if (noFunctions) {
    run('firebase deploy --only hosting,firestore:rules,storage');
  } else {
    run('node scripts/deploy-stack.js');
  }
});

console.log('\n' + '='.repeat(60));
console.log('  Release completado.');
console.log('  Web: https://wayira-e-sports.web.app');
console.log('  API: https://wayira-e-sports.web.app/api/health');
console.log('='.repeat(60) + '\n');
