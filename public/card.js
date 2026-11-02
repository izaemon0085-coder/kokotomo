// おたすけカード：選んだこと・書いたことは、このスマホ（localStorage）にだけ保存する。サーバーには送らない
import { escapeHtml } from '/app.js';

const KEY = 'kokotomo:card';
const PRESETS = [
  { key: 'elevator', text: 'エレベーターの場所を教えてください' },
  { key: 'step', text: '段差のない道を教えてください' },
  { key: 'guide', text: '席（行き先）まで案内してください' },
  { key: 'slow', text: 'ゆっくり、はっきり話してください' },
  { key: 'write', text: '耳がきこえにくいです。筆談でお願いします' },
  { key: 'voice', text: '目が見えにくいです。声で教えてください' },
  { key: 'rest', text: '人ごみが苦手です。少し休ませてください' },
  { key: 'help', text: '困っています。近くの係の人を呼んでください' },
];
const MAX_FREE = 100;
const $ = (sel) => document.querySelector(sel);

function load() {
  try {
    const saved = JSON.parse(localStorage.getItem(KEY));
    return { items: Array.isArray(saved?.items) ? saved.items : [], free: typeof saved?.free === 'string' ? saved.free : '' };
  } catch {
    return { items: [], free: '' };
  }
}
function save(card) {
  try {
    localStorage.setItem(KEY, JSON.stringify(card));
    $('#saved').textContent = 'このスマホに保存しました';
  } catch {
    $('#saved').textContent = '保存できませんでした（このままでも見せられます）';
  }
}

let card = load();

$('#choices').innerHTML = PRESETS.map((p) => `<label class="choice">
    <input type="checkbox" value="${p.key}"${card.items.includes(p.key) ? ' checked' : ''}>
    <span>${escapeHtml(p.text)}</span>
  </label>`).join('');
$('#free').value = card.free;

function current() {
  return {
    items: [...document.querySelectorAll('#choices input:checked')].map((i) => i.value),
    free: $('#free').value.trim().slice(0, MAX_FREE),
  };
}
const lines = (c) => [...PRESETS.filter((p) => c.items.includes(p.key)).map((p) => p.text), ...(c.free ? [c.free] : [])];

$('#card-form').addEventListener('change', () => { card = current(); save(card); });
$('#free').addEventListener('input', () => { card = current(); save(card); });

// ---- 見せる ----
const show = $('#show-card');
let lastFocus = null;
$('#card-form').addEventListener('submit', (e) => {
  e.preventDefault();
  card = current();
  save(card);
  const list = lines(card);
  if (!list.length) {
    $('#card-error').textContent = '手伝ってほしいことを、ひとつ以上えらぶか、書いてください';
    return;
  }
  $('#card-error').textContent = '';
  $('#show-list').innerHTML = list.map((t) => `<li>${escapeHtml(t)}</li>`).join('');
  $('#writing').hidden = true;
  lastFocus = document.activeElement;
  show.hidden = false;
  document.body.style.overflow = 'hidden';
  $('#speak-btn').focus();
});
function closeCard() {
  speechSynthesis?.cancel();
  show.hidden = true;
  document.body.style.overflow = '';
  lastFocus?.focus();
}
$('#close-btn').addEventListener('click', closeCard);
show.addEventListener('keydown', (e) => { if (e.key === 'Escape') closeCard(); });

$('#speak-btn').addEventListener('click', () => {
  if (!('speechSynthesis' in window)) return;
  speechSynthesis.cancel();
  const u = new SpeechSynthesisUtterance(`お手数ですが、お願いします。${lines(card).join('。')}`);
  u.lang = 'ja-JP';
  u.rate = 0.9;
  speechSynthesis.speak(u);
});
if (!('speechSynthesis' in window)) $('#speak-btn').hidden = true;

// 筆談：相手に書いてもらう大きな欄
$('#write-btn').addEventListener('click', () => {
  const w = $('#writing');
  w.hidden = !w.hidden;
  if (!w.hidden) {
    w.value = '';
    w.focus();
  }
});
