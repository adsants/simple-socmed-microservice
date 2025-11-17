const express = require('express');
const morgan = require('morgan');
const cors = require('cors');
const jwt = require('jsonwebtoken');
const axios = require('axios');
const { createProxyMiddleware } = require('http-proxy-middleware');

const app = express();

const PORT = process.env.PORT || 4000;
const AUTH_SERVICE_URL = process.env.AUTH_SERVICE_URL;
const POST_SERVICE_URL = process.env.POST_SERVICE_URL;
const COMMENT_SERVICE_URL = process.env.COMMENT_SERVICE_URL;
const LIKE_SERVICE_URL = process.env.LIKE_SERVICE_URL;
const MEDIA_SERVICE_URL = process.env.MEDIA_SERVICE_URL;
const JWT_ACCESS_SECRET = process.env.JWT_ACCESS_SECRET || 'access-secret';

app.use(cors());
app.use(express.json());
app.use(morgan('dev'));

// Middleware: cek JWT
function authMiddleware(req, res, next) {
  const authHeader = req.headers['authorization'];
  if (!authHeader) return res.status(401).json({ error: 'No token' });

  const token = authHeader.replace('Bearer ', '');
  jwt.verify(token, JWT_ACCESS_SECRET, (err, payload) => {
    if (err) return res.status(401).json({ error: 'Invalid token' });
    req.user = payload; // { userId, username }
    next();
  });
}

function createProxy(baseUrl, requireAuth = false) {
  return async (req, res) => {
    try {
      const path = req.originalUrl.replace(/^\/api/, '');
      const url = baseUrl + path;

      const method = req.method.toLowerCase();
      const headers = { ...req.headers };
      delete headers['host'];

      if (requireAuth && req.user) {
        headers['x-user-id'] = req.user.userId;
        headers['x-username'] = req.user.username;
      }

      const response = await axios({
        url,
        method,
        headers,
        data: req.body,
        // ❌ JANGAN pakai params di sini
        // params: req.query,
        validateStatus: () => true
      });

      res.status(response.status).send(response.data);
    } catch (err) {
      console.error('Gateway error:', err.message);
      res.status(500).json({ error: 'Internal Gateway Error' });
    }
  };
}



// Public routes
app.use('/api/auth', createProxy(AUTH_SERVICE_URL, false));
// Protected routes
app.use('/api/posts', authMiddleware, createProxy(POST_SERVICE_URL, true));
app.use('/api/comments', authMiddleware, createProxy(COMMENT_SERVICE_URL, true));
app.use('/api/likes', authMiddleware, createProxy(LIKE_SERVICE_URL, true));

// Protected routes (MEDIA – pakai streaming proxy)
app.use(
  '/api/media/upload',
  authMiddleware,
  createProxyMiddleware({
    target: MEDIA_SERVICE_URL,
    changeOrigin: true,
    pathRewrite: { '^/api': '' }   // /api/media/upload -> /media/upload
  })
);

app.use(
  '/api/media/files',
  createProxyMiddleware({
    target: MEDIA_SERVICE_URL,
    changeOrigin: true,
    pathRewrite: { '^/api': '' }   // /api/media/files/... -> /media/files/...
  })
);

app.get('/', (req, res) => {
  res.json({ message: 'Gateway up' });
});

app.listen(PORT, () => {
  console.log(`API Gateway running on port ${PORT}`);
});
