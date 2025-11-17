const express = require('express');
const morgan = require('morgan');
const multer = require('multer');
const path = require('path');
const fs = require('fs');

const app = express();
app.use(express.json());
app.use(morgan('dev'));

const PORT = process.env.PORT || 4005;
const UPLOAD_DIR = process.env.UPLOAD_DIR || path.join(__dirname, '..', 'uploads');

if (!fs.existsSync(UPLOAD_DIR)) {
  fs.mkdirSync(UPLOAD_DIR, { recursive: true });
}

const storage = multer.diskStorage({
  destination: function (req, file, cb) {
    cb(null, UPLOAD_DIR);
  },
  filename: function (req, file, cb) {
    const uniqueSuffix = Date.now() + '-' + Math.round(Math.random() * 1e9);
    const ext = path.extname(file.originalname);
    cb(null, uniqueSuffix + ext);
  }
});
const upload = multer({ storage });

app.post('/media/upload', upload.single('file'), (req, res) => {
  try {
    const file = req.file;
    if (!file) return res.status(400).json({ error: 'No file uploaded' });

    const urlPath = '/media/files/' + file.filename;
    res.status(201).json({
      filename: file.filename,
      url: urlPath,
      size: file.size,
      mimetype: file.mimetype
    });
  } catch (err) {
    console.error('Upload error:', err);
    res.status(500).json({ error: 'Upload failed' });
  }
});

// serve files
app.use('/media/files', express.static(UPLOAD_DIR));

app.get('/', (req, res) => {
  res.json({ message: 'Media service OK' });
});

app.listen(PORT, () => {
  console.log('Media service running on port', PORT);
});