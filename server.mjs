import { createServer } from 'node:http';
import { readFile } from 'node:fs/promises';
import { extname, join, dirname } from 'node:path';
import { fileURLToPath, URL } from 'node:url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const distDir = join(__dirname, 'dist');

const mimeTypes = {
  '.html': 'text/html',
  '.js': 'text/javascript',
  '.css': 'text/css',
  '.json': 'application/json',
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.svg': 'image/svg+xml',
  '.ts': 'text/javascript',
  '.tsx': 'text/javascript'
};

const basePath = '/tuner-lab';

const server = createServer(async (req, res) => {
  // Parse the incoming URL to ignore query strings when resolving files
  const { pathname } = new URL(req.url, 'http://localhost');

  let urlPath = pathname === '/' ? '/index.html' : pathname;
  if (urlPath.startsWith(basePath)) {
    urlPath = urlPath.slice(basePath.length) || '/index.html';
  }

  const filePath = join(distDir, urlPath);

  try {
    const data = await readFile(filePath);
    const ext = extname(filePath).toLowerCase();
    res.writeHead(200, { 'Content-Type': mimeTypes[ext] || 'application/octet-stream' });
    res.end(data);
  } catch {
    // Fallback to index.html for SPA routes
    try {
      const data = await readFile(join(distDir, 'index.html'));
      res.writeHead(200, { 'Content-Type': 'text/html' });
      res.end(data);
    } catch {
      res.writeHead(404);
      res.end('Not found');
    }
  }
});

const port = process.env.PORT || 3000;
server.listen(port, () => {
  console.log(`Servidor iniciado en http://localhost:${port}`);
});
