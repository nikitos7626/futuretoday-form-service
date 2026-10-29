const { PORT } = require('./config');
const { initDatabase, closeDatabase } = require('./db');
const createApp = require('./app');

// Initialize SQLite database
initDatabase();

const app = createApp();

const server = app.listen(PORT, '0.0.0.0', () => {
  console.log(`=======================================================`);
  console.log(`🚀 Сервис опросов запущен на порту ${PORT}`);
  console.log(`📡 URL сервера: http://localhost:${PORT}`);
  console.log(`⚙️  Админ-панель для создания опросов: http://localhost:${PORT}/admin`);
  console.log(`=======================================================`);
});

function gracefulShutdown(signal) {
  console.log(`\nПолучен сигнал ${signal}. Завершение работы сервера...`);
  server.close(() => {
    closeDatabase();
    console.log('База данных SQLite закрыта. Сервер остановлен.');
    process.exit(0);
  });
}

process.on('SIGINT', () => gracefulShutdown('SIGINT'));
process.on('SIGTERM', () => gracefulShutdown('SIGTERM'));
