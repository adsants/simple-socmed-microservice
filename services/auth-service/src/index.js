const express = require('express');
const morgan = require('morgan');
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const pool = require('./db');

const app = express();
app.use(express.json());
app.use(morgan('dev'));

const PORT = process.env.PORT || 4001;
const JWT_ACCESS_SECRET = process.env.JWT_ACCESS_SECRET || 'access-secret';
const JWT_REFRESH_SECRET = process.env.JWT_REFRESH_SECRET || 'refresh-secret';

async function initDb() {
  await pool.query(`
    CREATE TABLE IF NOT EXISTS users (
      id BIGINT PRIMARY KEY AUTO_INCREMENT,
      username VARCHAR(50) UNIQUE NOT NULL,
      email VARCHAR(100) UNIQUE NOT NULL,
      password_hash VARCHAR(255) NOT NULL,
      bio TEXT NULL,
      avatar_url VARCHAR(255) NULL,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP
    )
  `);

  await pool.query(`
    CREATE TABLE IF NOT EXISTS refresh_tokens (
      id BIGINT PRIMARY KEY AUTO_INCREMENT,
      user_id BIGINT NOT NULL,
      token VARCHAR(255) NOT NULL,
      user_agent VARCHAR(150),
      ip_address VARCHAR(64),
      expired_at DATETIME NOT NULL,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      INDEX (user_id)
    )
  `);

  await pool.query(`
    CREATE TABLE IF NOT EXISTS auth_logs (
      id BIGINT PRIMARY KEY AUTO_INCREMENT,
      user_id BIGINT NULL,
      action VARCHAR(50) NOT NULL,
      ip_address VARCHAR(64),
      user_agent VARCHAR(150),
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP
    )
  `);
}

async function initDbWithRetry(retries = 10, delayMs = 3000) {
  for (let i = 0; i < retries; i++) {
    try {
      await initDb();
      console.log('Auth DB init success');
      return;
    } catch (err) {
      console.error(`Init DB failed (attempt ${i + 1}/${retries}):`, err.code || err.message);
      if (i === retries - 1) throw err;
      await new Promise((resolve) => setTimeout(resolve, delayMs));
    }
  }
}

function generateTokens(user) {
  const payload = { userId: user.id, username: user.username };
  const accessToken = jwt.sign(payload, JWT_ACCESS_SECRET, { expiresIn: '30m' });
  const refreshToken = jwt.sign(payload, JWT_REFRESH_SECRET, { expiresIn: '7d' });
  return { accessToken, refreshToken };
}

app.post('/auth/register', async (req, res) => {
  try {
    const { username, email, password } = req.body;
    if (!username || !email || !password)
      return res.status(400).json({ error: 'username, email, password required' });

    const [rows] = await pool.query(
      'SELECT id FROM users WHERE email = ? OR username = ?',
      [email, username]
    );
    if (rows.length > 0) {
      return res.status(400).json({ error: 'Email or username already used' });
    }

    const hash = await bcrypt.hash(password, 10);
    const [result] = await pool.query(
      'INSERT INTO users (username, email, password_hash) VALUES (?, ?, ?)',
      [username, email, hash]
    );

    res.status(201).json({ id: result.insertId, username, email });
  } catch (err) {
    console.error('Register error:', err);
    res.status(500).json({ error: 'Register failed' });
  }
});

app.post('/auth/login', async (req, res) => {
  try {
    const { emailOrUsername, password } = req.body;
    if (!emailOrUsername || !password) {
      return res.status(400).json({ error: 'emailOrUsername and password required' });
    }

    const [rows] = await pool.query(
      'SELECT * FROM users WHERE email = ? OR username = ? LIMIT 1',
      [emailOrUsername, emailOrUsername]
    );
    if (rows.length === 0) {
      return res.status(400).json({ error: 'Invalid credentials' });
    }

    const user = rows[0];
    const match = await bcrypt.compare(password, user.password_hash);
    if (!match) {
      await pool.query(
        'INSERT INTO auth_logs (user_id, action, ip_address, user_agent) VALUES (?, ?, ?, ?)',
        [user.id, 'LOGIN_FAILED', req.ip, req.headers['user-agent'] || null]
      );
      return res.status(400).json({ error: 'Invalid credentials' });
    }

    const { accessToken, refreshToken } = generateTokens(user);

    await pool.query(
      'INSERT INTO refresh_tokens (user_id, token, user_agent, ip_address, expired_at) VALUES (?, ?, ?, ?, DATE_ADD(NOW(), INTERVAL 7 DAY))',
      [user.id, refreshToken, req.headers['user-agent'] || null, req.ip]
    );

    await pool.query(
      'INSERT INTO auth_logs (user_id, action, ip_address, user_agent) VALUES (?, ?, ?, ?)',
      [user.id, 'LOGIN_SUCCESS', req.ip, req.headers['user-agent'] || null]
    );

    res.json({
      accessToken,
      refreshToken,
      user: { id: user.id, username: user.username, email: user.email }
    });
  } catch (err) {
    console.error('Login error:', err);
    res.status(500).json({ error: 'Login failed' });
  }
});

app.post('/auth/refresh', async (req, res) => {
  try {
    const { refreshToken } = req.body;
    if (!refreshToken) return res.status(400).json({ error: 'No refresh token' });

    const [rows] = await pool.query(
      'SELECT * FROM refresh_tokens WHERE token = ? LIMIT 1',
      [refreshToken]
    );
    if (rows.length === 0) return res.status(401).json({ error: 'Invalid refresh token' });

    jwt.verify(refreshToken, JWT_REFRESH_SECRET, (err, payload) => {
      if (err) return res.status(401).json({ error: 'Invalid refresh token' });

      const accessToken = jwt.sign(
        { userId: payload.userId, username: payload.username },
        JWT_ACCESS_SECRET,
        { expiresIn: '30m' }
      );

      res.json({ accessToken });
    });
  } catch (err) {
    console.error('Refresh error:', err);
    res.status(500).json({ error: 'Refresh failed' });
  }
});

app.get('/auth/me', async (req, res) => {
  res.json({ message: 'Auth service OK' });
});

app.get('/', (req, res) => {
  res.json({ message: 'Auth service root' });
});

initDbWithRetry()
  .then(() => {
    app.listen(PORT, () => {
      console.log('Auth service running on port', PORT);
    });
  })
  .catch((err) => {
    console.error('Failed to init auth DB after retries:', err);
    process.exit(1);
  });