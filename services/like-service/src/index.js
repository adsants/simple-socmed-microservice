const express = require('express');
const morgan = require('morgan');
const pool = require('./db');

const app = express();
app.use(express.json());
app.use(morgan('dev'));

const PORT = process.env.PORT || 4004;

async function initDb() {
  await pool.query(`
    CREATE TABLE IF NOT EXISTS post_likes (
      id BIGINT PRIMARY KEY AUTO_INCREMENT,
      post_id BIGINT NOT NULL,
      user_id BIGINT NOT NULL,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      UNIQUE KEY uq_post_user (post_id, user_id)
    )
  `);
}

async function initDbWithRetry(retries = 10, delayMs = 3000) {
  for (let i = 0; i < retries; i++) {
    try {
      await initDb();
      console.log('Like DB init success');
      return;
    } catch (err) {
      console.error(`Like init DB failed (attempt ${i + 1}/${retries}):`, err.code || err.message);
      if (i === retries - 1) throw err;
      await new Promise((resolve) => setTimeout(resolve, delayMs));
    }
  }
}

// toggle like
app.post('/likes/toggle', async (req, res) => {
  try {
    const userId = req.headers['x-user-id'];
    if (!userId) return res.status(401).json({ error: 'No user id header' });

    const { post_id } = req.body;
    if (!post_id) return res.status(400).json({ error: 'post_id required' });

    if (Array.isArray(post_id)) {
      post_id = post_id[0];
    }

    const [rows] = await pool.query(
      'SELECT id FROM post_likes WHERE post_id = ? AND user_id = ?',
      [post_id, userId]
    );
    if (rows.length > 0) {
      await pool.query('DELETE FROM post_likes WHERE id = ?', [rows[0].id]);
      return res.json({ liked: false });
    } else {
      await pool.query(
        'INSERT INTO post_likes (post_id, user_id) VALUES (?, ?)',
        [post_id, userId]
      );
      return res.json({ liked: true });
    }
  } catch (err) {
    console.error('Toggle like error:', err);
    res.status(500).json({ error: 'Failed to toggle like' });
  }
});

// count likes per post
app.get('/likes/count', async (req, res) => {
  try {
    let { post_id } = req.query;
    if (!post_id) {
      return res.status(400).json({ error: 'post_id required' });
    }

    // Kalau ?post_id=1&post_id=1 -> req.query.post_id = ['1','1']
    if (Array.isArray(post_id)) {
      post_id = post_id[0];
    }

    const [rows] = await pool.query(
      'SELECT COUNT(*) AS count FROM post_likes WHERE post_id = ?',
      [post_id]
    );

    res.json({ post_id, count: rows[0]?.count || 0 });
  } catch (err) {
    console.error('Count like error:', err);
    res.status(500).json({ error: 'Failed to count like' });
  }
});

app.get('/', (req, res) => {
  res.json({ message: 'Like service OK' });
});

initDbWithRetry()
  .then(() => {
    app.listen(PORT, () => {
      console.log('Like service running on port', PORT);
    });
  })
  .catch((err) => {
    console.error('Like service DB init failed after retries:', err);
    process.exit(1);
  });