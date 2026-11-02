// 会場のバリアフリーメモを保存する。みんなで書く「公開の情報」だけを置く。
// おたすけカードはここには来ない（スマホの中だけに保存する）
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname } from 'node:path';
import { randomUUID } from 'node:crypto';

export const TOPICS = [
  { key: 'elevator', label: 'エレベーター・スロープ' },
  { key: 'toilet', label: '多目的トイレ' },
  { key: 'seat', label: '車いす席・入り口' },
  { key: 'rest', label: '休める場所' },
  { key: 'crowd', label: '混む時間・場所' },
  { key: 'other', label: 'そのほか' },
];
const TOPIC_KEYS = TOPICS.map((t) => t.key);

export const MAX_NAME = 40;
export const MAX_NOTE = 200;
const MAX_VENUES = 2000;
const MAX_NOTES_PER_VENUE = 300;

export class HttpError extends Error {
  constructor(status, message) {
    super(message);
    this.status = status;
  }
}

const newId = (prefix) => `${prefix}_${randomUUID().slice(0, 8)}`;

// 書きこみの安全：会場の情報だけを書く場所。電話番号・住所・メール・トゲのある言葉は止める
const PERSONAL = [
  /0\d{1,4}[-ー－−\s]?\d{1,4}[-ー－−\s]?\d{3,4}/,
  /〒|\d{3}[-ー－−]\d{4}/,
  /\S+@\S+\.\S+/,
];
const HARSH = [/死ね(?!る)/, /消えろ/, /うざい/, /きもい/, /キモい/, /ばか(?!り)/, /バカ(?!ンス)/, /ブス/, /障害者のくせに|障がい者のくせに|迷惑なんだよ/];

function cleanText(value, max, label) {
  if (typeof value !== 'string') throw new HttpError(400, `${label}を入力してください`);
  const text = value.trim();
  if (!text) throw new HttpError(400, `${label}を入力してください`);
  if ([...text].length > max) throw new HttpError(400, `${label}は${max}文字以内にしてください`);
  if (PERSONAL.some((re) => re.test(text))) {
    throw new HttpError(400, '電話番号・住所・メールアドレスのようなものは書けません。会場のことだけを書いてください');
  }
  if (HARSH.some((re) => re.test(text))) throw new HttpError(400, 'トゲのある言葉は書けません');
  return text;
}

// 会場の名前を比べやすくする（全角・半角、大文字・小文字、空白、「・」のちがいを無視）
export function normalizeName(name) {
  return String(name).normalize('NFKC').toLowerCase().replace(/[\s・･･\-‐ー－_]/g, '');
}

export function createStore({ file = null, now = () => new Date().toISOString() } = {}) {
  const state = file && existsSync(file) ? JSON.parse(readFileSync(file, 'utf8')) : { venues: [] };
  let saveTimer = null;

  function save() {
    if (!file || saveTimer) return;
    saveTimer = setTimeout(() => {
      saveTimer = null;
      mkdirSync(dirname(file), { recursive: true });
      writeFileSync(file, JSON.stringify(state, null, 2));
    }, 200);
  }

  const requireVenue = (id) => {
    const venue = state.venues.find((v) => v.id === id);
    if (!venue) throw new HttpError(404, '会場が見つかりません');
    return venue;
  };

  return {
    flush() {
      if (!file) return;
      clearTimeout(saveTimer);
      saveTimer = null;
      mkdirSync(dirname(file), { recursive: true });
      writeFileSync(file, JSON.stringify(state, null, 2));
    },

    searchVenues(q = '') {
      const key = normalizeName(q);
      return state.venues
        .filter((v) => !key || normalizeName(v.name).includes(key))
        .sort((a, b) => (b.updatedAt || '').localeCompare(a.updatedAt || ''))
        .slice(0, 50);
    },
    getVenue: requireVenue,
    addVenue(name) {
      const clean = cleanText(name, MAX_NAME, '会場の名前');
      const existing = state.venues.find((v) => normalizeName(v.name) === normalizeName(clean));
      if (existing) return { venue: existing, created: false };
      if (state.venues.length >= MAX_VENUES) throw new HttpError(400, 'これ以上、会場を足せません');
      const venue = { id: newId('v'), name: clean, notes: [], createdAt: now(), updatedAt: now() };
      state.venues.push(venue);
      save();
      return { venue, created: true };
    },
    addNote(venueId, { topic, text }) {
      const venue = requireVenue(venueId);
      if (!TOPIC_KEYS.includes(topic)) throw new HttpError(400, '項目をえらんでください');
      if (venue.notes.length >= MAX_NOTES_PER_VENUE) throw new HttpError(400, 'この会場のメモはいっぱいです');
      const note = { id: newId('n'), topic, text: cleanText(text, MAX_NOTE, 'メモ'), createdAt: now() };
      venue.notes.push(note);
      venue.updatedAt = note.createdAt;
      save();
      return note;
    },

    // ともはねなど、ほかのアプリ用：会場名にいちばん近い会場（同じ名前 → 名前をふくむ の順）
    findVenueForLink(name) {
      const key = normalizeName(name);
      if (!key) return null;
      return state.venues.find((v) => normalizeName(v.name) === key)
        || state.venues.find((v) => normalizeName(v.name).includes(key) || key.includes(normalizeName(v.name)))
        || null;
    },
  };
}

// 項目ごとに、いちばん新しいメモだけ（要点）
export function latestByTopic(venue) {
  return TOPICS.map((t) => {
    const notes = venue.notes.filter((n) => n.topic === t.key);
    const latest = notes.at(-1);
    return latest ? { topic: t.key, label: t.label, text: latest.text, createdAt: latest.createdAt, count: notes.length } : null;
  }).filter(Boolean);
}
