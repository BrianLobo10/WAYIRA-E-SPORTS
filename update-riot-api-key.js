#!/usr/bin/env node
/**
 * Script para actualizar la API Key de Riot en Firebase Functions
 * 
 * Uso:
 *   node update-riot-api-key.js [API_KEY]
 * 
 * Si no pasas la API key como argumento, la leerá del archivo server/.env
 */

const { execSync } = require('child_process');
const fs = require('fs');
const path = require('path');
const readline = require('readline');

const rl = readline.createInterface({
  input: process.stdin,
  output: process.stdout
});

function question(query) {
  return new Promise(resolve => rl.question(query, resolve));
}

async function updateRiotApiKey() {
  let apiKey = process.argv[2]; // API key desde argumentos de línea de comandos

  // Si no se pasó como argumento, intentar leer del archivo .env
  if (!apiKey) {
    try {
      const envPath = path.join(__dirname, 'server', '.env');
      if (fs.existsSync(envPath)) {
        const envContent = fs.readFileSync(envPath, 'utf8');
        const match = envContent.match(/RIOT_API_KEY=(.+)/);
        if (match) {
          apiKey = match[1].trim();
          console.log('✅ API key encontrada en server/.env');
        }
      }
    } catch (error) {
      console.log('⚠️  No se pudo leer el archivo .env');
    }
  }

  // Si aún no hay API key, pedirla al usuario
  if (!apiKey) {
    apiKey = await question('🔑 Ingresa tu nueva API key de Riot: ');
    if (!apiKey || !apiKey.trim()) {
      console.error('❌ Error: Debes proporcionar una API key');
      process.exit(1);
    }
    apiKey = apiKey.trim();
  }

  console.log('\n📦 Actualizando secret en Firebase Functions...');
  console.log(`   API Key: ${apiKey.substring(0, 10)}...\n`);

  try {
    // Actualizar el secret
    execSync(`echo "${apiKey}" | firebase functions:secrets:set RIOT_API_KEY`, {
      stdio: 'inherit'
    });

    console.log('\n🚀 Redesplegando funciones para aplicar los cambios...\n');

    // Redesplegar funciones
    execSync('firebase deploy --only functions', {
      stdio: 'inherit'
    });

    console.log('\n✅ ¡Listo! La API key ha sido actualizada y las funciones redesplegadas.');
    console.log('   Prueba el endpoint ahora: https://wayirae-sports.web.app/api/summoner/...\n');

  } catch (error) {
    console.error('\n❌ Error al actualizar la API key:', error.message);
    process.exit(1);
  } finally {
    rl.close();
  }
}

updateRiotApiKey();

