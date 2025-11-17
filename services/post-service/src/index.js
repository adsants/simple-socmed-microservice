const express = require('express');
const morgan = require('morgan');
const pool = require('./db');

const app = express();
app.use(express.json());
app.use(morgan('dev'));

const PORT = process.env.PORT || 4002;

async function initDb() {
  // tabel posts (tetap ada image_url sebagai thumbnail pertama)
  await pool.query(`
    CREATE TABLE IF NOT EXISTS posts (
      id BIGINT PRIMARY KEY AUTO_INCREMENT,
      user_id BIGINT NOT NULL,
      content TEXT NOT NULL,
      image_url VARCHAR(255) NULL,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      updated_at DATETIME DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP
    )
  `);

  // tabel baru untuk multi image
  await pool.query(`
    CREATE TABLE IF NOT EXISTS post_images (
      id BIGINT PRIMARY KEY AUTO_INCREMENT,
      post_id BIGINT NOT NULL,
      url VARCHAR(255) NOT NULL,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      INDEX (post_id)
    )
  `);
}

async function initDbWithRetry(retries = 10, delayMs = 3000) {
  for (let i = 0; i < retries; i++) {
    try {
      await initDb();
      console.log('Post DB init success');
      return;
    } catch (err) {
      console.error(`Post init DB failed (attempt ${i + 1}/${retries}):`, err.code || err.message);
      if (i === retries - 1) throw err;
      await new Promise((resolve) => setTimeout(resolve, delayMs));
    }
  }
}

// GET /posts  -> kembalikan posts + images[]
app.get('/posts', async (req, res) => {
  try {
    let page = parseInt(req.query.page, 10);
    let limit = parseInt(req.query.limit, 10);

    if (isNaN(page) || page < 1) page = 1;
    if (isNaN(limit) || limit < 1 || limit > 50) limit = 5; // default 5

    const offset = (page - 1) * limit;

    const [posts] = await pool.query(
      "SELECT p.id, p.content, p.created_at, p.image_url, p.user_id, u.username AS user_name  FROM posts p JOIN users u ON u.id = p.user_id ORDER BY p.created_at DESC LIMIT ? OFFSET ?",
      [limit, offset]
    );

    if (posts.length === 0) {
      return res.json([]); // frontend pakai length < limit untuk hasMore
    }

    const ids = posts.map((p) => p.id);
    const [images] = await pool.query(
      'SELECT id, post_id, url, created_at FROM post_images WHERE post_id IN (?)',
      [ids]
    );

    const imagesByPost = {};
    images.forEach((img) => {
      if (!imagesByPost[img.post_id]) imagesByPost[img.post_id] = [];
      imagesByPost[img.post_id].push(img);
    });

    const result = posts.map((p) => ({
      ...p,
      images: imagesByPost[p.id] || []
    }));

    res.json(result);
  } catch (err) {
    console.error('List posts error:', err);
    res.status(500).json({ error: 'Failed to fetch posts' });
  }
});


// POST /posts  -> buat post + simpan banyak image
app.post('/posts', async (req, res) => {
  try {
    const userId = req.headers['x-user-id'];
    if (!userId) return res.status(401).json({ error: 'No user id header' });

    const { content, image_urls } = req.body;
    if (!content || content.trim() === '') {
      return res.status(400).json({ error: 'Content required' });
    }

    const imageUrls = Array.isArray(image_urls) ? image_urls : [];
    const firstImage = imageUrls.length > 0 ? imageUrls[0] : null;

    const [result] = await pool.query(
      'INSERT INTO posts (user_id, content, image_url) VALUES (?, ?, ?)',
      [userId, content, firstImage]
    );

    const postId = result.insertId;

    if (imageUrls.length > 0) {
      const values = imageUrls.map((u) => [postId, u]);
      await pool.query(
        'INSERT INTO post_images (post_id, url) VALUES ?',
        [values]
      );
    }

    // ambil ulang post dengan images
    const [posts] = await pool.query(
      'SELECT id, user_id, content, image_url, created_at, updated_at FROM posts WHERE id = ?',
      [postId]
    );
    const post = posts[0];

    const [imgs] = await pool.query(
      'SELECT id, post_id, url, created_at FROM post_images WHERE post_id = ?',
      [postId]
    );

    res.status(201).json({ ...post, images: imgs });
  } catch (err) {
    console.error('Create post error:', err);
    res.status(500).json({ error: 'Failed to create post' });
  }
});

// GET /posts/:id
app.get('/posts/:id', async (req, res) => {
  try {
    const [rows] = await pool.query(
      'SELECT id, user_id, content, image_url, created_at, updated_at FROM posts WHERE id = ?',
      [req.params.id]
    );
    if (rows.length === 0) return res.status(404).json({ error: 'Post not found' });

    const post = rows[0];
    const [imgs] = await pool.query(
      'SELECT id, post_id, url, created_at FROM post_images WHERE post_id = ?',
      [post.id]
    );

    res.json({ ...post, images: imgs });
  } catch (err) {
    console.error('Get post error:', err);
    res.status(500).json({ error: 'Failed to get post' });
  }
});

app.get('/', (req, res) => {
  res.json({ message: 'Post service OK' });
});

initDbWithRetry()
  .then(() => {
    app.listen(PORT, () => {
      console.log('Post service running on port', PORT);
    });
  })
  .catch((err) => {
    console.error('Post service DB init failed after retries:', err);
    process.exit(1);
  });
