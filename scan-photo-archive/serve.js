const http = require('http');
const https = require('https');
const tls = require('tls');
const net = require('net');
const fs = require('fs');
const path = require('path');

const BASE = __dirname;
const ROOT = path.join(BASE, 'webroot');
const TLS_OPTS = {
  key: fs.readFileSync(path.join(BASE, 'key.pem')),
  cert: fs.readFileSync(path.join(BASE, 'cert.pem')),
};
const MIME = {
  '.html': 'text/html; charset=utf-8',
  '.htm': 'text/html; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.js': 'application/javascript; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg',
  '.png': 'image/png',
  '.svg': 'image/svg+xml',
  '.ico': 'image/x-icon',
};

function handler(req, res) {
  let urlPath = decodeURIComponent((req.url || '/').split('?')[0]);
  if (urlPath === '/') urlPath = '/index.html';
  const filePath = path.join(ROOT, path.normalize(urlPath).replace(/^(\.\.[/\\])+/, ''));
  if (!filePath.startsWith(ROOT)) {
    res.writeHead(403).end('Forbidden');
    return;
  }
  fs.readFile(filePath, (err, data) => {
    if (err) {
      res.writeHead(404, { 'Content-Type': 'text/plain; charset=utf-8' });
      res.end('404 Not Found');
      return;
    }
    res.writeHead(200, {
      'Content-Type': MIME[path.extname(filePath).toLowerCase()] || 'application/octet-stream',
      'Cache-Control': 'no-cache',
    });
    res.end(data);
  });
}

// ---- plain HTTP (used by the multiplexer and by port 8080) ----
const httpServer = http.createServer(handler);
httpServer.listen(8080, '0.0.0.0', () => console.log('[8080] HTTP   http://0.0.0.0:8080/'));

// ---- HTTPS on 8443 (for when the router forwards it) ----
https
  .createServer(TLS_OPTS, handler)
  .listen(8443, '0.0.0.0', () => console.log('[8443] HTTPS  https://0.0.0.0:8443/'));

// ---- Port 8000: auto-detect TLS vs plain HTTP on the SAME port ----
const tlsServer = tls.createServer(TLS_OPTS, (tlsSocket) => {
  httpServer.emit('connection', tlsSocket);
});
tlsServer.on('tlsClientError', () => {});

net
  .createServer((socket) => {
    socket.once('data', (buf) => {
      // 0x16 0x03 == TLS ClientHello; anything else is treated as plain HTTP
      if (buf[0] === 0x16 && buf[1] === 0x03) tlsServer.emit('connection', socket);
      else httpServer.emit('connection', socket);
      socket.unshift(buf);
    });
    socket.on('error', () => {});
  })
  .listen(8000, '0.0.0.0', () => {
    console.log('[8000] HTTP+HTTPS mixed  http://0.0.0.0:8000/  and  https://0.0.0.0:8000/');
  });
