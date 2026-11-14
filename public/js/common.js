const CURRENCY = '৳'; // change to '$' or anything you like
const $ = (id) => document.getElementById(id);

async function api(url, opts = {}) {
  const init = { method: opts.method || 'GET', credentials: 'same-origin', headers: {} };
  if (opts.body !== undefined) { init.headers['Content-Type'] = 'application/json'; init.body = JSON.stringify(opts.body); }
  const r = await fetch(url, init);
  const data = await r.json().catch(() => ({}));
  if (!r.ok) {
    if (data.banned && !location.pathname.endsWith('index.html') && location.pathname !== '/') { location.href = 'index.html?banned=1'; }
    const e = new Error(data.error || 'Something went wrong.');
    e.status = r.status; e.data = data;
    throw e;
  }
  return data;
}

function esc(s) {
  return String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
}
const money = (n) => CURRENCY + Number(n).toLocaleString('en-US');
function fmtDate(iso) {
  if (!iso) return 'Time to be announced';
  return new Date(iso).toLocaleString([], { weekday: 'short', day: 'numeric', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit' });
}
function toLocalInput(iso) {
  if (!iso) return '';
  const d = new Date(iso);
  return new Date(d.getTime() - d.getTimezoneOffset() * 60000).toISOString().slice(0, 16);
}
const fromLocalInput = (v) => (v ? new Date(v).toISOString() : null);

const GRADS = ['#7fb77e,#c9e6bb', '#4f9d69,#bfe3c8', '#8fbf6a,#dff0c4', '#5aa38f,#c4e8dc', '#6fae5e,#cfe8b4', '#7aa86a,#d6ecc2', '#4d9a7a,#bde4d3', '#85b86f,#d3eec0'];
function gameBg(g) {
  const url = (window.IMAGES && IMAGES.games && IMAGES.games[g.slug]) || '';
  const grad = `linear-gradient(135deg,${GRADS[(g.id - 1) % GRADS.length]})`;
  return url ? `background-image:linear-gradient(0deg,rgba(0,0,0,.45),rgba(0,0,0,.05)),url('${url}')` : `background-image:${grad}`;
}
const STATUS_LABEL = { open: 'Open for Registration', live: 'Tournament Started', completed: 'Tournament Completed' };
const MATCH_LABEL = { upcoming: 'Upcoming', live: 'Live', completed: 'Completed' };

function toast(msg, isErr) {
  const t = $('toast');
  t.textContent = msg; t.className = 'toast' + (isErr ? ' err' : ''); t.hidden = false;
  clearTimeout(toast.t); toast.t = setTimeout(() => { t.hidden = true; }, 3800);
}

function embedUrl(u) {
  try {
    const x = new URL(u);
    const h = x.hostname.replace(/^www\./, '');
    if (h === 'youtu.be' && x.pathname.length > 1) return 'https://www.youtube.com/embed/' + encodeURIComponent(x.pathname.slice(1));
    if (h === 'youtube.com' || h === 'm.youtube.com') {
      if (x.pathname === '/watch' && x.searchParams.get('v')) return 'https://www.youtube.com/embed/' + encodeURIComponent(x.searchParams.get('v'));
      const p = x.pathname.split('/');
      if ((p[1] === 'live' || p[1] === 'embed') && p[2]) return 'https://www.youtube.com/embed/' + encodeURIComponent(p[2]);
    }
    if (h === 'twitch.tv') {
      const ch = x.pathname.split('/')[1];
      if (ch) return 'https://player.twitch.tv/?channel=' + encodeURIComponent(ch) + '&parent=' + encodeURIComponent(location.hostname);
    }
  } catch (e) { /* not a valid URL */ }
  return null;
}

async function logout() {
  await api('/api/auth/logout', { method: 'POST' }).catch(() => {});
  location.href = 'index.html';
}
