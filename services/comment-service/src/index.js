const express = require('express');
const morgan = require('morgan');
const pool = require('./db');

const app = express();
app.use(express.json());
app.use(morgan('dev'));

const PORT = process.env.PORT || 4003;

async function initDb() {
  await pool.query(`
    CREATE TABLE IF NOT EXISTS comments (
      id BIGINT PRIMARY KEY AUTO_INCREMENT,
      post_id BIGINT NOT NULL,
      user_id BIGINT NOT NULL,
      content TEXT NOT NULL,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP
    )
  `);
}

async function initDbWithRetry(retries = 10, delayMs = 3000) {
  for (let i = 0; i < retries; i++) {
    try {
      await initDb();
      console.log('Comment DB init success');
      return;
    } catch (err) {
      console.error(`Comment init DB failed (attempt ${i + 1}/${retries}):`, err.code || err.message);
      if (i === retries - 1) throw err;
      await new Promise((resolve) => setTimeout(resolve, delayMs));
    }
  }
}

app.get('/comments', async (req, res) => {
  try {
    const { post_id } = req.query;
    if (!post_id) return res.status(400).json({ error: 'post_id required' });

    if (Array.isArray(post_id)) {
      post_id = post_id[0];
    }
    
    const [rows] = await pool.query(
      'SELECT c.id, c.post_id, c.user_id, c.content, c.created_at, u.username,u.email FROM comments c, users u WHERE c.user_id = u.id and  c.post_id = ? ORDER BY c.created_at ASC',
      [post_id]
    );
    res.json(rows);
  } catch (err) {
    console.error('List comments error:', err);
    res.status(500).json({ error: 'Failed to fetch comments' });
  }
});

app.post('/comments', async (req, res) => {
  try {
    const userId = req.headers['x-user-id'];
    if (!userId) return res.status(401).json({ error: 'No user id header' });

    const { post_id, content } = req.body;
    if (!post_id || !content) {
      return res.status(400).json({ error: 'post_id and content required' });
    }

    const [result] = await pool.query(
      'INSERT INTO comments (post_id, user_id, content) VALUES (?, ?, ?)',
      [post_id, userId, content]
    );

    const [rows] = await pool.query(
      'SELECT id, post_id, user_id, content, created_at FROM comments WHERE id = ?',
      [result.insertId]
    );
    res.status(201).json(rows[0]);
  } catch (err) {
    console.error('Create comment error:', err);
    res.status(500).json({ error: 'Failed to create comment' });
  }
});

app.get('/', (req, res) => {
  res.json({ message: 'Comment service OK' });
});

initDbWithRetry()
  .then(() => {
    app.listen(PORT, () => {
      console.log('Comment service running on port', PORT);
    });
  })
  .catch((err) => {
    console.error('Comment service DB init failed after retries:', err);
    process.exit(1);
  });