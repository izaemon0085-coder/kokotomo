// どの画面でも：ネットがなくても開けるように Service Worker を登録する（localhost か https のときだけ動く）
if ('serviceWorker' in navigator) {
  navigator.serviceWorker.register('/sw.js').catch(() => { /* 使えない環境では、ふつうに動く */ });
}

// いまの画面のナビに印をつける
for (const a of document.querySelectorAll('.top-bar nav a')) {
  if (a.getAttribute('href') === location.pathname) a.setAttribute('aria-current', 'page');
}

export async function api(path, { method = 'GET', body } = {}) {
  let res;
  try {
    res = await fetch(`/api${path}`, {
      method,
      headers: body ? { 'Content-Type': 'application/json' } : undefined,
      body: body ? JSON.stringify(body) : undefined,
    });
  } catch {
    throw Object.assign(new Error('つながっていません（オフライン）'), { offline: true });
  }
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw Object.assign(new Error(data.error || `エラー (${res.status})`), { status: res.status, offline: Boolean(data.offline) });
  return data;
}

export function escapeHtml(s) {
  return String(s).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
}
