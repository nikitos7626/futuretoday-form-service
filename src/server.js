const { PORT } = require('./config');
const { initDatabase } = require('./db');
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

process.on('SIGTERM', () => {
  server.close(() => {
    console.log('Сервер остановлен');
  });
});
