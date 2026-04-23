const express = require('express');
const { pool, redis } = require('../db');

const router = express.Router();
const CACHE_KEY_ALL = 'tasks:all';
const CACHE_TTL = 60;

router.get('/', async (req, res) => {
  try {
    const cached = await redis.get(CACHE_KEY_ALL).catch(() => null);
    if (cached) {
      return res.json({ source: 'cache', data: JSON.parse(cached) });
    }
    const { rows } = await pool.query('SELECT * FROM tasks ORDER BY id DESC');
    await redis.setex(CACHE_KEY_ALL, CACHE_TTL, JSON.stringify(rows)).catch(() => {});
    res.json({ source: 'db', data: rows });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

router.get('/:id', async (req, res) => {
  try {
    const { rows } = await pool.query('SELECT * FROM tasks WHERE id = $1', [req.params.id]);
    if (rows.length === 0) return res.status(404).json({ error: 'Task not found' });
    res.json(rows[0]);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

router.post('/', async (req, res) => {
  const { title, description, completed } = req.body;
  if (!title) return res.status(400).json({ error: 'title is required' });
  try {
    const { rows } = await pool.query(
      'INSERT INTO tasks (title, description, completed) VALUES ($1, $2, $3) RETURNING *',
      [title, description || null, completed === true]
    );
    await redis.del(CACHE_KEY_ALL).catch(() => {});
    res.status(201).json(rows[0]);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

router.put('/:id', async (req, res) => {
  const { title, description, completed } = req.body;
  try {
    const { rows } = await pool.query(
      `UPDATE tasks
       SET title = COALESCE($1, title),
           description = COALESCE($2, description),
           completed = COALESCE($3, completed),
           updated_at = NOW()
       WHERE id = $4
       RETURNING *`,
      [title ?? null, description ?? null, typeof completed === 'boolean' ? completed : null, req.params.id]
    );
    if (rows.length === 0) return res.status(404).json({ error: 'Task not found' });
    await redis.del(CACHE_KEY_ALL).catch(() => {});
    res.json(rows[0]);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

router.delete('/:id', async (req, res) => {
  try {
    const { rowCount } = await pool.query('DELETE FROM tasks WHERE id = $1', [req.params.id]);
    if (rowCount === 0) return res.status(404).json({ error: 'Task not found' });
    await redis.del(CACHE_KEY_ALL).catch(() => {});
    res.status(204).send();
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

module.exports = router;
