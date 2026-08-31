const http = require('http');
const fs = require('fs');
const path = require('path');

const root = __dirname;
const port = 4173;

const mime = {
  '.html': 'text/html; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.png': 'image/png',
  '.webp': 'image/webp',
  '.svg': 'image/svg+xml',
  '.otf': 'font/otf',
  '.woff': 'font/woff',
  '.woff2': 'font/woff2',
  '.ttf': 'font/ttf',
  '.json': 'application/json',
};

http.createServer((req, res) => {
  let filePath = decodeURIComponent(req.url.split('?')[0]);
  if (filePath === '/') filePath = '/index.html';
  const full = path.join(root, filePath);
  fs.readFile(full, (err, data) => {
    if (err) {
      res.writeHead(404);
      res.end('Not found: ' + filePath);
      return;
    }
    const ext = path.extname(full);
    res.writeHead(200, { 'Content-Type': mime[ext] || 'application/octet-stream' });
    res.end(data);
  });
}).listen(port, () => console.log('Serving on http://localhost:' + port));
