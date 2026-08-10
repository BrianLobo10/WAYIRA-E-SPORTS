const { execSync } = require('child_process');
const fs = require('fs');
const path = require('path');

const ROOT = path.resolve(__dirname, '..', '..');

function envFilePath() {
  return path.join(ROOT, 'server', '.env');
}

function normalizeSecretValue(name, raw) {
  if (!raw) return null;
  let value = raw.trim().replace(/^["']|["']$/g, '');
  if (name === 'RIOT_API_KEY') {
    while (value.startsWith('RGAPI-RGAPI-')) {
      value = value.replace(/^RGAPI-/, '');
    }
  }
  if (name === 'OPENAI_API_KEY') {
    while (value.startsWith('sk-sk-')) {
      value = value.replace(/^sk-/, '');
    }
  }
  return value;
}

function readServerEnv() {
  const result = { riot: null, openai: null };
  const envPath = envFilePath();
  if (!fs.existsSync(envPath)) {
    return result;
  }
  const content = fs.readFileSync(envPath, 'utf8');
  const riot = content.match(/^RIOT_API_KEY\s*=\s*(.+)$/m);
  const openai = content.match(/^OPENAI_API_KEY\s*=\s*(.+)$/m);
  if (riot) {
    result.riot = normalizeSecretValue('RIOT_API_KEY', riot[1]);
  }
  if (openai) {
    result.openai = normalizeSecretValue('OPENAI_API_KEY', openai[1]);
  }
  return result;
}

function setFirebaseSecret(name, value) {
  if (!value) {
    throw new Error(`Valor vacío para ${name}`);
  }
  console.log(`\n📦 Guardando secreto ${name} en Firebase...`);
  execSync(`firebase functions:secrets:set ${name}`, {
    cwd: ROOT,
    input: `${value}\n`,
    stdio: ['pipe', 'inherit', 'inherit'],
    shell: true
  });
  console.log(`✅ ${name} actualizado.`);
}

function syncSecretsFromEnv(options = {}) {
  const { requireOpenai = true } = options;
  const { riot, openai } = readServerEnv();

  if (!riot || !riot.startsWith('RGAPI-')) {
    console.error('❌ Falta RIOT_API_KEY válida en server/.env');
    console.error('   Archivo esperado:', envFilePath());
    process.exit(1);
  }

  if (requireOpenai && (!openai || !openai.startsWith('sk-'))) {
    console.error('❌ Falta OPENAI_API_KEY válida en server/.env');
    process.exit(1);
  }

  setFirebaseSecret('RIOT_API_KEY', riot);
  if (openai && openai.startsWith('sk-')) {
    setFirebaseSecret('OPENAI_API_KEY', openai);
  }

  return { riot, openai };
}

module.exports = {
  ROOT,
  envFilePath,
  readServerEnv,
  setFirebaseSecret,
  syncSecretsFromEnv
};
