let me = null;
let timer = null;
const S = { game: null, standings: [], matches: [], tab: null };
const app = $('app');

(async function boot() {
  try {
    const d = await api('/api/auth/me');
    if (d.role !== 'team') return (location.href = d.banned ? 'index.html?banned=1' : 'index.html');
    me = d.team;
  } catch (e) { return (location.href = 'index.html'); }
  $('who').textContent = me.name;
  $('logout').onclick = logout;
  window.addEventListener('hashchange', route);
  route();
})();

async function route() {
  clearInterval(timer);
  const h = location.hash;
  $('nMy').classList.toggle('on', h.startsWith('#/my'));
  $('nGames').classList.toggle('on', !h.startsWith('#/my'));
  const m = h.match(/^#\/game\/(\d+)/);
  try {
    if (m) await showGame(Number(m[1]), true);
    else await showGames(h.startsWith('#/my'));
  } catch (e) {
    app.innerHTML = `<p class="notice">${esc(e.message)}</p>`;
  }
}

function gameCard(g) {
  const pct = Math.round((g.registered / 16) * 100);
  return `<article class="gcard">
    <div class="gimg" style="${gameBg(g)}"><span class="tag st-${g.status}">${STATUS_LABEL[g.status]}</span><b>${esc(g.name)}</b></div>
    <div class="gbody">
      <div class="muted">${esc(fmtDate(g.tournament_date))}</div>
      <div style="display:flex;justify-content:space-between;font-weight:700"><span>${g.registered} / 16 Teams</span><span>${g.isRegistered ? 'Registered' : ''}</span></div>
      <div class="bar" aria-hidden="true"><i style="width:${pct}%"></i></div>
      <a class="btn" href="#/game/${g.id}">${g.isRegistered ? 'Open dashboard' : 'See details'}</a>
    </div></article>`;
}

async function showGames(mine) {
  const games = await api(mine ? '/api/my/games' : '/api/games');
  app.innerHTML = `<h1 class="big">${mine ? 'My tournaments' : 'Pick the tournaments you want to win'}</h1>
    <div class="grid">${games.map(gameCard).join('') || '<p class="empty" style="grid-column:1/-1">You have not registered for any game yet. Open Games and pick one.</p>'}</div>`;
}

async function loadGame(id) {
  const [game, standings, matches] = await Promise.all([
    api('/api/games/' + id), api(`/api/games/${id}/standings`), api(`/api/games/${id}/matches`)]);
  S.game = game; S.standings = standings; S.matches = matches;
}

async function showGame(id, first) {
  await loadGame(id);
  if (first) S.tab = S.game.status === 'open' ? 'teams' : 'standings';
  renderGame();
  timer = setInterval(async () => {
    if ($('matchDlg').open) return;
    try { await loadGame(id); renderGame(); } catch (e) { /* ignore */ }
  }, 10000);
}

function renderGame() {
  const g = S.game;
  let btn;
  if (g.isRegistered) btn = '<button class="btn" disabled>Your team is registered</button>';
  else if (g.status === 'open') btn = '<button class="btn green block" id="regBtn" type="button">Register Team</button>';
  else btn = '<button class="btn block" disabled>Registration closed</button>';

  const slots = Array.from({ length: 16 }, (_, i) => g.teams[i]
    ? `<div class="slot" title="${esc(g.teams[i])}">${esc(g.teams[i])}</div>` : '<div class="slot free">Open slot</div>').join('');

  let body = '';
  if (S.tab === 'teams') {
    body = `<div class="slots">${slots}</div>`;
  } else if (S.tab === 'standings') {
    body = S.standings.length ? `<div class="tscroll"><table><thead><tr><th>Rank</th><th>Team</th><th>Played</th><th>Wins</th><th>Losses</th><th>Points</th></tr></thead><tbody>
      ${S.standings.map(r => `<tr class="${r.team_id === me.id ? 'me' : ''}"><td>${r.rank}</td><td>${esc(r.name)}${r.team_id === me.id ? ' (you)' : ''}${r.banned ? ' <span class="tag st-completed">Disqualified</span>' : ''}</td><td>${r.played}</td><td>${r.wins}</td><td>${r.losses}</td><td><b>${r.points}</b></td></tr>`).join('')}
      </tbody></table></div>` : '<p class="empty">No teams yet. Registered teams appear here instantly.</p>';
  } else {
    if (!S.matches.length) body = '<p class="empty">Fixtures are created automatically when the 16th team registers.</p>';
    else {
      const rounds = [];
      S.matches.forEach(m => { let r = rounds.find(x => x.name === m.round_name); if (!r) rounds.push(r = { name: m.round_name, list: [] }); r.list.push(m); });
      body = rounds.map(r => `<h3 class="round">${esc(r.name)}</h3>` + r.list.map(m => `
        <button class="match" type="button" data-id="${m.id}">
          <b>${esc(m.team_a_name || 'TBD')} vs ${esc(m.team_b_name || 'TBD')}</b>
          <span class="muted">${m.status === 'completed' ? m.score_a + ' - ' + m.score_b : esc(fmtDate(m.scheduled_at))}</span>
          <span class="sp st-${m.status}">${MATCH_LABEL[m.status]}${m.stream_url && m.status !== 'completed' ? ' · Watch' : ''}</span>
        </button>`).join('')).join('');
    }
  }

  app.innerHTML = `<a href="#/games" class="muted">&larr; All games</a>
    <div class="detail-head" style="margin-top:12px">
      <div class="card" style="padding:0;overflow:hidden;display:flex"><div class="gimg" style="flex:1;height:auto;min-height:190px;${gameBg(g)}"><span class="tag st-${g.status}">${STATUS_LABEL[g.status]}</span><b style="font-size:40px">${esc(g.name)}</b></div></div>
      <div class="card">
        <div style="display:flex;justify-content:space-between;align-items:center;gap:8px;flex-wrap:wrap"><b style="font-size:22px">${g.registered} / 16 Teams Registered</b></div>
        <div class="bar" style="margin:10px 0 14px" aria-hidden="true"><i style="width:${Math.round(g.registered / 16 * 100)}%"></i></div>
        <div class="stats"><div><b>${esc(new Date(g.tournament_date).toLocaleDateString([], { day: 'numeric', month: 'short' }))}</b><span>${esc(new Date(g.tournament_date).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }))}</span></div><div><b>${money(g.champion_prize)}</b><span>Champion prize</span></div><div><b>${money(g.runnerup_prize)}</b><span>Runner-up prize</span></div></div>
        <div style="margin-top:16px">${btn}</div>
      </div>
    </div>
    <div class="tabs" role="tablist"><button data-tab="teams" class="${S.tab === 'teams' ? 'on' : ''}">Teams</button><button data-tab="standings" class="${S.tab === 'standings' ? 'on' : ''}">Standings</button><button data-tab="fixtures" class="${S.tab === 'fixtures' ? 'on' : ''}">Fixtures &amp; live</button></div>
    <div>${body}</div>`;

  app.querySelectorAll('.tabs button').forEach(b => b.onclick = () => { S.tab = b.dataset.tab; renderGame(); });
  app.querySelectorAll('.match').forEach(b => b.onclick = () => openMatch(b.dataset.id));
  const reg = $('regBtn');
  if (reg) reg.onclick = async () => {
    reg.disabled = true;
    try {
      const r = await api(`/api/games/${g.id}/register`, { method: 'POST' });
      toast(r.started ? 'Tournament started! Round 1 fixtures are ready.' : 'Your team is registered.');
      await loadGame(g.id);
      if (r.started) S.tab = 'fixtures';
      renderGame();
    } catch (e) { toast(e.message, true); reg.disabled = false; await loadGame(g.id).then(renderGame).catch(() => {}); }
  };
}

async function openMatch(id) {
  const dlg = $('matchDlg');
  try {
    const m = await api('/api/matches/' + id);
    const emb = m.stream_url ? embedUrl(m.stream_url) : null;
    let player;
    if (emb) player = `<iframe class="player" src="${esc(emb)}" title="Live stream" allow="autoplay; encrypted-media; picture-in-picture" allowfullscreen referrerpolicy="strict-origin-when-cross-origin"></iframe>`;
    else if (m.stream_url) player = `<div class="nostream"><div><p>This stream cannot be embedded here.</p><a class="btn" href="${esc(m.stream_url)}" target="_blank" rel="noopener noreferrer">Open live stream</a></div></div>`;
    else player = '<div class="nostream">The live stream link has not been added yet. Check back near match time.</div>';
    dlg.innerHTML = `<div style="display:flex;justify-content:space-between;align-items:center;gap:8px"><div><b style="font-size:20px">${esc(m.round_name)} · Match ${m.match_no}</b><div class="muted">${esc(fmtDate(m.scheduled_at))}</div></div><span class="sp st-${m.status}">${MATCH_LABEL[m.status]}</span></div>
      <div class="versus"><div><h4>${esc(m.team_a_name || 'TBD')}</h4><div class="muted">Manager: ${esc(m.team_a_manager || '-')}</div><div class="muted">${esc(m.team_a_members || '')}</div></div>
      <div class="score">${m.score_a} - ${m.score_b}</div>
      <div style="text-align:right"><h4>${esc(m.team_b_name || 'TBD')}</h4><div class="muted">Manager: ${esc(m.team_b_manager || '-')}</div><div class="muted">${esc(m.team_b_members || '')}</div></div></div>
      ${m.winner_name ? `<p><span class="tag">Winner: ${esc(m.winner_name)}</span></p>` : ''}
      ${player}
      <div style="margin-top:16px;text-align:right"><button class="btn" id="closeDlg" type="button">Close</button></div>`;
    $('closeDlg').onclick = () => { dlg.close(); dlg.innerHTML = ''; };
    dlg.onclose = () => { dlg.innerHTML = ''; };
    dlg.showModal();
  } catch (e) { toast(e.message, true); }
}
