// Script simple para iniciar servidor y ngrok
// Uso: node start-with-ngrok.js
// O mejor: ejecuta ngrok manualmente en otra terminal

console.log('📝 Para usar este script, primero instala ngrok:');
console.log('   1. npm install -g ngrok');
console.log('   2. O descarga desde https://ngrok.com/download');
console.log('   3. Configura tu token: ngrok config add-authtoken TU_TOKEN');
console.log('\n🚀 Iniciando servidor...');
console.log('   Luego, en otra terminal ejecuta: ngrok http 3001');
console.log('   Y copia la URL que aparece (ej: https://abc123.ngrok.io)\n');

// Simplemente iniciar el servidor
import('./server.js').catch(err => {
  console.error('Error:', err);
  process.exit(1);
});

