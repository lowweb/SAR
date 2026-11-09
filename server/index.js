const express = require('express');
const cors = require('cors');
const path = require('path');
const fs = require('fs');
const https = require('https');
const { initialize } = require('./db');

const app = express();
const PORT = process.env.PORT || 3000;
const HTTPS_PORT = process.env.HTTPS_PORT || 3001;
const HOST = process.env.HOST || '0.0.0.0';

initialize();

app.enable('trust proxy');
// Редирект только для внешних запросов: Vite dev-прокси и локальные обращения
// идут на http://localhost:3000 — 301 без CORS-заголовков ломает preflight и dev
const LOCAL_HOSTS = ['localhost', '127.0.0.1', '::1', '[::1]'];
app.use((req, res, next) => {
  if (req.secure || req.headers['x-forwarded-proto'] === 'https') return next();
  if (LOCAL_HOSTS.includes(req.hostname)) return next();
  const host = req.headers.host.replace(/:\d+$/, `:${HTTPS_PORT}`);
  res.redirect(301, `https://${host}${req.originalUrl}`);
});

app.use(cors());
app.use(express.json());

app.use('/api/auth', require('./routes/auth'));
app.use('/api/equipment', require('./routes/equipment'));
app.use('/api/movements', require('./routes/movements'));
app.use('/api/cartridges', require('./routes/cartridges'));
app.use('/api/cartridge-movements', require('./routes/cartridgeMovements'));
app.use('/api/references', require('./routes/references'));
app.use('/api/settings', require('./routes/settings'));

app.use(express.static(path.join(__dirname, '..', 'client', 'dist')));
app.get('/{*splat}', (req, res) => {
  res.sendFile(path.join(__dirname, '..', 'client', 'dist', 'index.html'));
});

app.listen(PORT, HOST, () => {
  console.log(`SAR HTTP  → http://${HOST}:${PORT} (redirect → HTTPS)`);
});

const certPath = path.join(__dirname, 'cert.pem');
const keyPath = path.join(__dirname, 'key.pem');
if (fs.existsSync(certPath) && fs.existsSync(keyPath)) {
  const options = {
    key: fs.readFileSync(keyPath),
    cert: fs.readFileSync(certPath)
  };
  https.createServer(options, app).listen(HTTPS_PORT, HOST, () => {
    console.log(`SAR HTTPS → https://${HOST}:${HTTPS_PORT}`);
    console.log('Для сканирования камерой откройте приложение по HTTPS');
  });
}
