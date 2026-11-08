// Servidorzinho local: serve os arquivos desta pasta em http://localhost:8794
// (o navegador não deixa o app ler arquivos direto do disco).
import { createServer } from 'node:http';
import { readFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import path from 'node:path';

const RAIZ = path.dirname(fileURLToPath(import.meta.url));
const PORTA = 8794;
const TIPOS = { '.html': 'text/html; charset=utf-8', '.json': 'application/json; charset=utf-8', '.csv': 'text/csv; charset=utf-8', '.js': 'text/javascript', '.mjs': 'text/javascript', '.css': 'text/css', '.png': 'image/png', '.svg': 'image/svg+xml' };

createServer(async (req, res) => {
  let caminho = decodeURIComponent(new URL(req.url, 'http://x').pathname);
  if (caminho === '/') caminho = '/index.html';
  const arquivo = path.join(RAIZ, caminho);
  if (!arquivo.startsWith(RAIZ) || caminho.includes('/.')) { res.writeHead(403).end(); return; }
  try {
    const dados = await readFile(arquivo);
    res.writeHead(200, { 'Content-Type': TIPOS[path.extname(arquivo)] || 'application/octet-stream', 'Cache-Control': 'no-store' });
    res.end(dados);
  } catch { res.writeHead(404).end('não achei'); }
}).listen(PORTA, '127.0.0.1', () => console.log(`Radar Corrida em http://localhost:${PORTA}  (feche esta janela pra desligar)`));
