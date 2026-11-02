// こことも：会場メモの API と、画面（public/）の配信。外部パッケージなし
import http from 'node:http';
import { readFile } from 'node:fs/promises';
import { extname, join, resolve, sep } from 'node:path';
import { fileURLToPath } from 'node:url';
import { createStore, HttpError, TOPICS, latestByTopic } from './store.js';

const ROOT = resolve(fileURLToPath(new URL('.', import.meta.url)));
const PUBLIC = join(ROOT, 'public');

const MIME = {
  '.html': 'text/html; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.svg': 'image/svg+xml',
  '.webmanifest': 'application/manifest+json',
};

async function readJson(req) {
  let size = 0;
  const chunks = [];
  for await (const chunk of req) {
    size += chunk.length;
    if (size > 8 * 1024) throw new HttpError(413, 'リクエストが大きすぎます');
    chunks.push(chunk);
  }
  if (!chunks.length) return {};
  try {
    const body = JSON.parse(Buffer.concat(chunks).toString('utf8'));
    if (typeof body !== 'object' || body === null || Array.isArray(body)) throw new Error();
    return body;
  } catch {
    throw new HttpError(400, 'JSON の形式が正しくありません');
  }
}

const venueView = (v) => ({ id: v.id, name: v.name, notes: v.notes, createdAt: v.createdAt, updatedAt: v.updatedAt });
const venueSummary = (v) => ({ id: v.id, name: v.name, noteCount: v.notes.length, updatedAt: v.updatedAt });

export function createApp({ store, publicUrl = null }) {
  const routes = [
    ['GET', /^\/api\/health$/, () => ({ ok: true })],
    ['GET', /^\/api\/topics$/, () => TOPICS],
    ['GET', /^\/api\/venues$/, ({ query }) => store.searchVenues(query.get('q') || '').map(venueSummary)],
    ['POST', /^\/api\/venues$/, ({ body }) => {
      const { venue, created } = store.addVenue(body.name);
      return [created ? 201 : 200, venueView(venue)];
    }],
    ['GET', /^\/api\/venues\/([\w-]+)$/, ({ params }) => venueView(store.getVenue(params[0]))],
    ['POST', /^\/api\/venues\/([\w-]+)\/notes$/, ({ params, body }) => [201, store.addNote(params[0], body)]],

    // ほかのアプリ（ともはね）用：会場名から、項目ごとの要点だけを返す。おたすけカードの情報はここにはない
    ['GET', /^\/api\/link\/venue$/, ({ query, origin }) => {
      const name = (query.get('name') || '').slice(0, 60);
      const base = publicUrl || origin;
      const venue = store.findVenueForLink(name);
      if (!venue) return { found: false, searchUrl: `${base}/venues.html#q=${encodeURIComponent(name)}` };
      return {
        found: true,
        venue: { id: venue.id, name: venue.name, updatedAt: venue.updatedAt },
        summary: latestByTopic(venue),
        url: `${base}/venues.html#${venue.id}`,
      };
    }],
  ];

  function sendJson(res, status, data) {
    res.writeHead(status, { 'Content-Type': MIME['.json'], 'Cache-Control': 'no-store' });
    res.end(JSON.stringify(data));
  }

  async function serveStatic(pathname, res) {
    let rel;
    try {
      rel = decodeURIComponent(pathname);
    } catch {
      throw new HttpError(400, 'URL が正しくありません');
    }
    if (rel.endsWith('/')) rel += 'index.html';
    const file = resolve(PUBLIC, `.${rel}`);
    if (!file.startsWith(PUBLIC + sep)) throw new HttpError(403, 'Forbidden');
    try {
      const data = await readFile(file);
      res.writeHead(200, { 'Content-Type': MIME[extname(file)] || 'application/octet-stream' });
      res.end(data);
    } catch {
      throw new HttpError(404, 'Not Found');
    }
  }

  return async function handler(req, res) {
    const url = new URL(req.url, 'http://localhost');
    const origin = `http://${req.headers.host || 'localhost'}`;
    try {
      if (url.pathname.startsWith('/api/')) {
        for (const [method, pattern, fn] of routes) {
          const m = url.pathname.match(pattern);
          if (!m || method !== req.method) continue;
          const body = method === 'POST' ? await readJson(req) : {};
          const result = await fn({ params: m.slice(1), body, query: url.searchParams, origin });
          const [status, data] = Array.isArray(result) && typeof result[0] === 'number' ? result : [200, result];
          return sendJson(res, status, data);
        }
        throw new HttpError(404, 'API が見つかりません');
      }
      if (req.method !== 'GET') throw new HttpError(405, 'Method Not Allowed');
      return await serveStatic(url.pathname, res);
    } catch (err) {
      const status = err instanceof HttpError ? err.status : 500;
      if (status === 500) console.error(err);
      return sendJson(res, status, { error: status === 500 ? 'サーバーエラーが発生しました' : err.message });
    }
  };
}

const isMain = process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url);
if (isMain) {
  const port = Number(process.env.PORT) || 3100;
  const store = createStore({ file: join(ROOT, 'data', 'venues.json') });
  const server = http.createServer(createApp({ store, publicUrl: process.env.PUBLIC_URL || null }));
  server.listen(port, () => {
    console.log(`こことも 起動: http://localhost:${port}/`);
  });
  const shutdown = () => {
    store.flush();
    process.exit(0);
  };
  process.on('SIGINT', shutdown);
  process.on('SIGTERM', shutdown);
}
