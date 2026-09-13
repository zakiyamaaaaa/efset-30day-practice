import { createServer, type IncomingMessage, type ServerResponse } from 'node:http';
import { createReadStream } from 'node:fs';
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { AiApiError, generateAi } from './ai';

type LocalRecord = Record<string, unknown>;
type LocalStore = Record<string, Record<string, LocalRecord>>;

const projectRoot = path.resolve(__dirname, '../..');
const dataDirectory = path.join(projectRoot, '.local-data');
const dataFile = path.join(dataDirectory, 'records.json');
const port = Number(process.env.PORT ?? 8000);

async function loadStore(): Promise<LocalStore> {
  try {
    return JSON.parse(await readFile(dataFile, 'utf8')) as LocalStore;
  } catch {
    return {};
  }
}

async function saveStore(store: LocalStore) {
  await mkdir(dataDirectory, { recursive: true });
  await writeFile(dataFile, JSON.stringify(store, null, 2));
}

function sendJson(res: ServerResponse, statusCode: number, body: unknown) {
  res.writeHead(statusCode, {
    'content-type': 'application/json; charset=utf-8',
    'access-control-allow-origin': '*',
    'access-control-allow-headers': 'content-type',
    'access-control-allow-methods': 'GET,POST,OPTIONS',
  });
  res.end(JSON.stringify(body));
}

function readBody(req: IncomingMessage): Promise<string> {
  return new Promise((resolve, reject) => {
    let body = '';
    req.setEncoding('utf8');
    req.on('data', (chunk: string) => {
      body += chunk;
      if (body.length > 100_000) reject(new Error('body too large'));
    });
    req.on('end', () => resolve(body));
    req.on('error', reject);
  });
}

function safeStaticPath(requestPath: string) {
  const relative = requestPath === '/' ? 'EF_SET_30日教材.html' : decodeURIComponent(requestPath.slice(1));
  if (relative.includes('..') || relative.includes('\\')) return undefined;
  return path.join(projectRoot, relative);
}

const server = createServer(async (req, res) => {
  try {
    const url = new URL(req.url ?? '/', `http://${req.headers.host ?? 'localhost'}`);
    if (url.pathname === '/api/records') {
      if (req.method === 'OPTIONS') return sendJson(res, 204, {});
      const store = await loadStore();
      if (req.method === 'GET') {
        const userId = url.searchParams.get('userId') ?? '';
        return sendJson(res, 200, { records: store[userId] ?? {} });
      }
      if (req.method === 'POST') {
        const payload = JSON.parse(await readBody(req)) as { userId?: string; recordKey?: string; record?: LocalRecord };
        if (!payload.userId || !payload.recordKey || !payload.record) return sendJson(res, 400, { error: 'invalid record' });
        const updatedAt = new Date().toISOString();
        store[payload.userId] ??= {};
        store[payload.userId][payload.recordKey] = { ...payload.record, updatedAt };
        await saveStore(store);
        return sendJson(res, 200, { ok: true, recordKey: payload.recordKey, updatedAt });
      }
      return sendJson(res, 405, { error: 'method not allowed' });
    }

    if (url.pathname === '/api/ai') {
      if (req.method === 'OPTIONS') return sendJson(res, 204, {});
      if (req.method !== 'POST') return sendJson(res, 405, { error: 'method not allowed' });
      try {
        const result = await generateAi(JSON.parse(await readBody(req)) as unknown, process.env.GEMINI_API_KEY, process.env.GEMINI_MODEL);
        return sendJson(res, 200, result);
      } catch (error) {
        if (error instanceof AiApiError) return sendJson(res, error.statusCode, { error: error.message });
        return sendJson(res, 500, { error: 'AI解説で予期しないエラーが発生しました。' });
      }
    }

    if (req.method !== 'GET') return sendJson(res, 405, { error: 'method not allowed' });
    const filePath = safeStaticPath(url.pathname);
    if (!filePath) return sendJson(res, 400, { error: 'invalid path' });
    const contentType = filePath.endsWith('.html') ? 'text/html; charset=utf-8' : 'application/octet-stream';
    res.writeHead(200, { 'content-type': contentType });
    createReadStream(filePath).on('error', () => res.destroy()).pipe(res);
  } catch (error) {
    sendJson(res, 400, { error: error instanceof Error ? error.message : 'request failed' });
  }
});

server.listen(port, '127.0.0.1', () => {
  console.log(`EF SET local server: http://localhost:${port}`);
});
