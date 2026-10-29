const path = require('node:path');
require('dotenv').config();

const PORT = parseInt(process.env.PORT, 10) || 3000;
const DB_PATH = process.env.DB_PATH || path.join(__dirname, '..', 'data', 'surveys.db');

module.exports = {
  PORT,
  DB_PATH
};
