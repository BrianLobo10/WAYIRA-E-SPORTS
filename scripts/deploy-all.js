#!/usr/bin/env node
/**
 * Script único: build, instalar deps de functions, deploy Firebase (hosting + functions).
 * Uso: npm run release             → deploy completo
 *      npm run release:hosting     → solo hosting
 *      npm run release:no-functions → hosting + firestore (sin Functions; útil si falla la cuenta de servicio)
 *      node scripts/deploy-all.js [--hosting-only] [--no-functions]
 */

const { execSync } = require('child_process');
const path = require('path');
const fs = require('fs');

const hostOnly = process.argv.includes('--hosting-only');
const noFunctions = process.argv.includes('--no-functions');
const rootDir = path.resolve(__dirname, '..');
const functionsDir = path.join(rootDir, 'functions');

function run(cmd, opts = {}) {
  const cwd = opts.cwd || rootDir;
  console.log('\n> ' + cmd + (opts.cwd ? `  [en ${opts.cwd}]` : ''));
  try {
    execSync(cmd, {
      cwd,
      stdio: 'inherit',
      shell: true,
      ...opts,
    });
  } catch (e) {
    console.error('\nError ejecutando:', cmd);
    process.exit(e.status || 1);
  }
}

function step(name, fn) {
  console.log('\n' + '='.repeat(60));
  console.log('  ' + name);
  console.log('='.repeat(60));
  fn();
}

step('1. Build de producción (Angular)', () => {
  run('npm run build:prod');
});

step('2. Verificar carpeta de build (Hosting sube desde aquí, NO desde public)', () => {
  const outDir = path.join(rootDir, 'dist', 'WAYIRAE-SPORTS', 'browser');
  if (!fs.existsSync(outDir)) {
    console.error('No se encontró la build en:', outDir);
    process.exit(1);
  }
  const files = fs.readdirSync(outDir);
  console.log('Build en dist/WAYIRAE-SPORTS/browser →', files.length, 'archivos. firebase.json debe tener "public": "dist/WAYIRAE-SPORTS/browser"');
  if (files.length < 5) {
    console.warn('Advertencia: hay pocos archivos en la build.');
  }
});

if (!hostOnly && !noFunctions) {
  step('3. Dependencias de Cloud Functions', () => {
    if (!fs.existsSync(path.join(functionsDir, 'package.json'))) {
      console.log('No hay functions/package.json, omitiendo.');
      return;
    }
    run('npm install', { cwd: functionsDir });
  });
}

// Obtener RIOT_API_KEY de server/.env o de la variable de entorno (nunca del código)
function getRiotApiKey() {
  if (process.env.RIOT_API_KEY) return process.env.RIOT_API_KEY.trim();
  const envPath = path.join(rootDir, 'server', '.env');
  if (!fs.existsSync(envPath)) return null;
  const content = fs.readFileSync(envPath, 'utf8');
  const m = content.match(/RIOT_API_KEY\s*=\s*["']?([^\s"'#]+)/);
  return m ? m[1].trim() : null;
}

if (!hostOnly && !noFunctions) {
  step('3b. Configurar secreto RIOT_API_KEY en Firebase (si existe en server/.env)', () => {
    const riotKey = getRiotApiKey();
    if (!riotKey) {
      console.log('No se encontró RIOT_API_KEY en server/.env ni en variable de entorno.');
      console.log('Si el deploy falla por "Secret not found", ejecuta: firebase functions:secrets:set RIOT_API_KEY');
      return;
    }
    console.log('Configurando secreto RIOT_API_KEY en Firebase...');
    try {
      execSync('firebase functions:secrets:set RIOT_API_KEY', {
        cwd: rootDir,
        input: riotKey + '\n',
        stdio: ['pipe', 'inherit', 'inherit'],
        shell: true,
      });
      console.log('Secreto RIOT_API_KEY actualizado.');
    } catch (e) {
      console.warn('No se pudo configurar el secreto (puede ser permisos). Si el deploy falla, ejecuta: firebase functions:secrets:set RIOT_API_KEY');
    }
  });
}

const deployStepName = hostOnly ? '3. Deploy solo Hosting' : (noFunctions ? '3. Deploy Hosting + Firestore + Storage (sin Functions)' : '4. Deploy a Firebase (hosting + functions + firestore + storage)');
step(deployStepName, () => {
  if (hostOnly) {
    run('firebase deploy --only hosting');
    console.log('\n(Si necesitas desplegar Functions o Storage, ejecuta: firebase deploy --only functions,storage)');
  } else if (noFunctions) {
    run('firebase deploy --only hosting,firestore:rules,storage');
    console.log('\n(Desplegado sin Functions. Cuando exista la cuenta wayira-e-sports@appspot.gserviceaccount.com, ejecuta: npm run release)');
  } else {
    // Desplegar hosting, functions, firestore rules y storage rules (portadas y posts)
    run('firebase deploy --only hosting,functions,firestore:rules,storage');
  }
});

console.log('\n' + '='.repeat(60));
console.log('  Listo: build guardada y deploy completado.');
console.log('='.repeat(60) + '\n');
