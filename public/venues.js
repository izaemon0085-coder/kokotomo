// 会場のバリアフリーメモ：さがす → 会場のメモを見る → 書き足す
// URL の # で画面を切りかえる（#v_xxxx は会場、#q=〇〇 は検索。ともはねからのリンクもこの形）
import { api, escapeHtml } from '/app.js';

const $ = (sel) => document.querySelector(sel);
const STALE_DAYS = 180; // これより古いメモは「古いかもしれない」と知らせる
let topics = [];
let venue = null;

function dateText(iso) {
  const d = new Date(iso);
  const days = Math.floor((Date.now() - d) / 86400000);
  const ago = days < 1 ? 'きょう' : days < 31 ? `${days}日前` : days < 365 ? `${Math.floor(days / 30)}か月前` : `${Math.floor(days / 365)}年前`;
  return { text: `${d.getFullYear()}年${d.getMonth() + 1}月${d.getDate()}日（${ago}）`, stale: days > STALE_DAYS };
}

// ---- さがす ----
async function search(q) {
  $('#search-error').textContent = '';
  try {
    const list = await api(`/venues?q=${encodeURIComponent(q)}`);
    $('#venue-list').innerHTML = list.length
      ? list.map((v) => `<li><a href="#${v.id}"><strong>${escapeHtml(v.name)}</strong><span class="muted small">メモ ${v.noteCount}件</span></a></li>`).join('')
      : (q ? '<li class="muted">まだメモがありません</li>' : '');
    const add = $('#add-venue');
    add.hidden = !q || list.some((v) => v.name === q);
    $('#add-venue-btn').textContent = `＋「${q}」を足す`;
  } catch (err) {
    $('#search-error').textContent = err.offline ? 'つながっていません。前に見た会場だけ見られます' : err.message;
  }
}

$('#search-form').addEventListener('submit', (e) => {
  e.preventDefault();
  location.hash = `q=${encodeURIComponent($('#q').value.trim())}`;
});
$('#add-venue-btn').addEventListener('click', async () => {
  try {
    const v = await api('/venues', { method: 'POST', body: { name: $('#q').value.trim() } });
    location.hash = v.id;
  } catch (err) {
    $('#search-error').textContent = err.message;
  }
});

// ---- 会場のメモ ----
function renderVenue() {
  $('#venue-name').textContent = venue.name;
  document.title = `${venue.name} | 会場メモ | こことも`;
  $('#topics').innerHTML = topics.map((t) => {
    const notes = venue.notes.filter((n) => n.topic === t.key).slice().reverse(); // 新しい順
    const body = notes.length
      ? notes.map((n) => {
        const d = dateText(n.createdAt);
        return `<div class="note${d.stale ? ' stale' : ''}"><p>${escapeHtml(n.text)}</p>
          <time datetime="${n.createdAt}">${d.text}${d.stale ? '・古いかもしれません' : ''}</time></div>`;
      }).join('')
      : '<p class="muted small">まだメモがありません</p>';
    return `<section class="topic"><h3>${escapeHtml(t.label)}</h3>${body}</section>`;
  }).join('');
}

async function openVenue(id) {
  try {
    venue = await api(`/venues/${id}`);
  } catch (err) {
    $('#search-error').textContent = err.status === 404 ? '会場が見つかりません' : err.message;
    showSearch('');
    return;
  }
  $('#search-view').hidden = true;
  $('#venue-view').hidden = false;
  renderVenue();
  $('#venue-name').setAttribute('tabindex', '-1');
  $('#venue-name').focus();
}

$('#note-form').addEventListener('submit', async (e) => {
  e.preventDefault();
  $('#note-error').textContent = '';
  try {
    await api(`/venues/${venue.id}/notes`, { method: 'POST', body: { topic: $('#topic').value, text: $('#note-text').value } });
    $('#note-text').value = '';
    venue = await api(`/venues/${venue.id}`);
    renderVenue();
  } catch (err) {
    $('#note-error').textContent = err.offline ? 'つながっていません。つながってから書き足してください' : err.message;
  }
});
$('#back-link').addEventListener('click', (e) => {
  e.preventDefault();
  location.hash = '';
});

function showSearch(q) {
  $('#search-view').hidden = false;
  $('#venue-view').hidden = true;
  document.title = '会場のバリアフリーメモ | こことも β版';
  $('#q').value = q;
  search(q);
}

function route() {
  const hash = decodeURIComponent(location.hash.slice(1));
  if (hash.startsWith('v_')) openVenue(hash);
  else showSearch(hash.startsWith('q=') ? hash.slice(2) : '');
}

try {
  topics = await api('/topics');
} catch {
  topics = [];
}
$('#topic').innerHTML = topics.map((t) => `<option value="${t.key}">${escapeHtml(t.label)}</option>`).join('');
window.addEventListener('hashchange', route);
route();
