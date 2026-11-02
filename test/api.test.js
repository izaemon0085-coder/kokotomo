import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import http from 'node:http';
import { createApp } from '../server.js';
import { createStore, normalizeName } from '../store.js';

let server;
let base;
let store;
let clock = '2026-11-03T10:00:00.000Z';

before(async () => {
  store = createStore({ now: () => clock });
  server = http.createServer(createApp({ store }));
  await new Promise((r) => server.listen(0, r));
  base = `http://localhost:${server.address().port}`;
});
after(() => server.close());

async function call(path, { method = 'GET', body } = {}) {
  const res = await fetch(base + path, {
    method,
    headers: body ? { 'Content-Type': 'application/json' } : undefined,
    body: body ? JSON.stringify(body) : undefined,
  });
  return { status: res.status, data: await res.json() };
}

test('画面が配信される（トップ・おたすけカード・会場メモ）', async () => {
  for (const [path, marker] of [['/', 'こことも'], ['/card.html', 'おたすけカード'], ['/venues.html', '会場のバリアフリーメモ']]) {
    const res = await fetch(base + path);
    assert.equal(res.status, 200, path);
    assert.match(await res.text(), new RegExp(marker));
  }
  assert.notEqual((await fetch(`${base}/..%2Fpackage.json`)).status, 200, 'public の外は配信しない');
});

test('会場を足す → メモを書き足す → さがす', async () => {
  const { status, data: v } = await call('/api/venues', { method: 'POST', body: { name: 'さくらホール' } });
  assert.equal(status, 201);
  const again = await call('/api/venues', { method: 'POST', body: { name: ' さくら ホール ' } });
  assert.equal(again.status, 200, '同じ会場は2つ作らない');
  assert.equal(again.data.id, v.id);

  const note = await call(`/api/venues/${v.id}/notes`, { method: 'POST', body: { topic: 'elevator', text: '東口を入って右にエレベーター' } });
  assert.equal(note.status, 201);
  assert.equal(note.data.createdAt, clock, '書いた日が残る');

  const { data: found } = await call(`/api/venues?q=${encodeURIComponent('さくら')}`);
  assert.equal(found[0].name, 'さくらホール');
  assert.equal(found[0].noteCount, 1);
  const { data: detail } = await call(`/api/venues/${v.id}`);
  assert.equal(detail.notes[0].text, '東口を入って右にエレベーター');
});

test('書きこみの安全：会場のことだけ', async () => {
  const { data: v } = await call('/api/venues', { method: 'POST', body: { name: 'あおぞらドーム' } });
  const bad = async (text, topic = 'other') => (await call(`/api/venues/${v.id}/notes`, { method: 'POST', body: { topic, text } })).status;
  assert.equal(await bad('係の人の電話 090-1234-5678'), 400, '電話番号');
  assert.equal(await bad('a@example.com に聞いて'), 400, 'メール');
  assert.equal(await bad('障害者のくせに来るな'), 400, 'トゲのある言葉');
  assert.equal(await bad('   '), 400);
  assert.equal(await bad('あ'.repeat(201)), 400);
  assert.equal(await bad('ふつうのメモ', 'unknown'), 400, '項目は決まったものだけ');
  assert.equal((await call('/api/venues/v_nothing')).status, 404);
});

test('ともはね用：会場名から、項目ごとの要点だけを返す', async () => {
  const { data: v } = await call('/api/venues', { method: 'POST', body: { name: 'みなとアリーナ' } });
  await call(`/api/venues/${v.id}/notes`, { method: 'POST', body: { topic: 'toilet', text: '1階の北側にある' } });
  clock = '2026-11-04T10:00:00.000Z';
  await call(`/api/venues/${v.id}/notes`, { method: 'POST', body: { topic: 'toilet', text: '2階にも新しくできた' } });

  const { data } = await call(`/api/link/venue?name=${encodeURIComponent('ミナトアリーナ')}`);
  assert.equal(data.found, false, 'ひらがなとカタカナはちがう名前あつかい');

  const { data: hit } = await call(`/api/link/venue?name=${encodeURIComponent('みなと アリーナ')}`);
  assert.equal(hit.found, true);
  assert.equal(hit.venue.name, 'みなとアリーナ');
  assert.deepEqual(hit.summary.map((s) => [s.topic, s.text, s.count]), [['toilet', '2階にも新しくできた', 2]], 'いちばん新しいメモだけ');
  assert.match(hit.url, new RegExp(`/venues.html#${v.id}$`));

  const { data: miss } = await call(`/api/link/venue?name=${encodeURIComponent('まだない会場')}`);
  assert.equal(miss.found, false);
  assert.match(miss.searchUrl, /venues\.html#q=/);
});

test('会場名の比べ方', () => {
  assert.equal(normalizeName('ＡＢＣ ホール'), normalizeName('abcホール'));
  assert.equal(normalizeName('さくら・ホール'), normalizeName('さくらホール'));
});
