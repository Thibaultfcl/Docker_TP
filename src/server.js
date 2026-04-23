require('dotenv').config();
const express = require('express');
const { pool, redis, initSchema } = require('./db');
const tasksRouter = require('./routes/tasks');

const app = express();
const PORT = process.env.PORT || 3000;

app.use(express.json());

app.get('/health', async (req, res) => {
  const health = { status: 'healthy', timestamp: new Date().toISOString() };

  try {
    await pool.query('SELECT 1');
    health.database = 'connected';
  } catch (e) {
    health.status = 'unhealthy';
    health.database = 'disconnected';
  }

  try {
    await redis.ping();
    health.cache = 'connected';
  } catch (e) {
    health.status = 'unhealthy';
    health.cache = 'disconnected';
  }

  const code = health.status === 'healthy' ? 200 : 503;
  res.status(code).json(health);
});

app.use('/api/tasks', tasksRouter);

app.use((req, res) => res.status(404).json({ error: 'Not found' }));

async function start() {
  try {
    await initSchema();
    console.log('Schema ready');
  } catch (err) {
    console.error('Schema init failed:', err.message);
  }
  app.listen(PORT, () => console.log(`API listening on :${PORT}`));
}

start();

module.exports = app;
