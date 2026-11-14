const A = { tab: 'games', games: [], gameId: null };
const app = $('app');
const ROUNDS = ['Round of 16', 'Quarterfinal', 'Semifinal', 'Final'];

(async function boot() {
  try {
    const d = await api('/api/auth/me');
    if (d.role !== 'admin') return (location.href = 'index.html');
  } catch (e) { return (location.href = 'index.html'); }
  $('logout').onclick = logout;
  document.querySelectorAll('.pill button').forEach(b => b.onclick = () => {
    A.tab = b.dataset.tab;
    document.querySelectorAll('.pill button').forEach(x => x.classList.toggle('on', x === b));
    render();
  });
  render();
})();

async function act(fn, okMsg) {
  try { await fn(); if (okMsg) toast(okMsg); return true; }
  catch (e) { toast(e.message, true); return false; }
}

async function render() {
  try {
    A.games = await api('/api/games');
    if (!A.gameId) A.gameId = A.games[0].id;
    if (A.tab === 'games') renderGames();
    else if (A.tab === 'matches') await renderMatches();
    else if (A.tab === 'standings') await renderStandings();
    else await renderTeams();
  } catch (e) { app.innerHTML = `<p class="notice">${esc(e.message)}</p>`; }
}

function gamePicker() {
  return `<div class="toolbar"><div><label for="gsel">Game</label><select id="gsel">${A.games.map(g => `<option value="${g.id}" ${g.id === A.gameId ? 'selected' : ''}>${esc(g.name)} (${g.registered} / 16)</option>`).join('')}</select></div></div>`;
}
function bindPicker() { $('gsel').onchange = (e) => { A.gameId = Number(e.target.value); render(); }; }

/* ---------- Games & prizes ---------- */
function renderGames() {
  app.innerHTML = `<h1 class="big">Games &amp; prizes</h1><div class="grid">${A.games.map(g => `
    <form class="card gform" data-id="${g.id}">
      <h3 style="margin:0 0 4px">${esc(g.name)} <span class="tag st-${g.status}">${STATUS_LABEL[g.status]}</span></h3>
      <span class="muted">${g.registered} / 16 teams</span>
      <label>Tournament date &amp; time<input type="datetime-local" name="date" value="${toLocalInput(g.tournament_date)}" required></label>
      <label>Champion prize (${CURRENCY})<input type="number" name="cp" min="0" step="1" value="${g.champion_prize}" required></label>
      <label>Runner-up prize (${CURRENCY})<input type="number" name="rp" min="0" step="1" value="${g.runnerup_prize}" required></label>
      ${g.status === 'open' ? '' : `<label>Tournament status<select name="status"><option value="live" ${g.status === 'live' ? 'selected' : ''}>Live</option><option value="completed" ${g.status === 'completed' ? 'selected' : ''}>Completed</option></select></label>`}
      <div class="actions"><button class="btn green" type="submit">Save changes</button></div>
    </form>`).join('')}</div>`;
  app.querySelectorAll('.gform').forEach(f => f.onsubmit = async (e) => {
    e.preventDefault();
    const d = new FormData(f);
    await act(() => api('/api/admin/games/' + f.dataset.id, { method: 'PUT', body: {
      tournament_date: fromLocalInput(d.get('date')), champion_prize: Number(d.get('cp')), runnerup_prize: Number(d.get('rp')), status: d.get('status') || undefined } }), 'Game saved.');
    render();
  });
}

/* ---------- Matches ---------- */
function teamSelect(name, teams, val) {
  return `<select name="${name}"><option value="">TBD</option>${teams.map(t => `<option value="${t.team_id}" ${t.team_id === val ? 'selected' : ''}>${esc(t.name)}</option>`).join('')}</select>`;
}
function matchForm(m, teams) {
  const v = m || { round_name: 'Round of 16', status: 'upcoming', score_a: 0, score_b: 0, stream_url: '' };
  return `<form class="mform" ${m ? `data-id="${m.id}"` : 'id="newMatch"'}>
    <b>${m ? `${esc(m.round_name)} · Match ${m.match_no}` : 'Add a match'}</b>
    <div class="row">
      <div><label>Round<input name="round_name" list="rounds" value="${esc(v.round_name)}" required></label></div>
      <div><label>Team A${teamSelect('team_a_id', teams, v.team_a_id)}</label></div>
      <div><label>Team B${teamSelect('team_b_id', teams, v.team_b_id)}</label></div>
      <div><label>Match time<input type="datetime-local" name="scheduled_at" value="${toLocalInput(v.scheduled_at)}"></label></div>
      <div><label>Status<select name="status">${['upcoming', 'live', 'completed'].map(s => `<option value="${s}" ${v.status === s ? 'selected' : ''}>${MATCH_LABEL[s]}</option>`).join('')}</select></label></div>
      <div><label>Score A<input type="number" min="0" name="score_a" value="${v.score_a}"></label></div>
      <div><label>Score B<input type="number" min="0" name="score_b" value="${v.score_b}"></label></div>
      <div><label>Winner${teamSelect('winner_id', teams, v.winner_id).replace('TBD', 'No winner yet')}</label></div>
    </div>
    <label>Live stream URL (YouTube or Twitch)<input type="url" name="stream_url" value="${esc(v.stream_url)}" placeholder="https://www.youtube.com/watch?v=..."></label>
    <div class="actions"><button class="btn green sm" type="submit">${m ? 'Save match' : 'Add match'}</button>${m ? '<button class="btn danger sm" type="button" data-del="1">Delete</button>' : ''}</div>
  </form>`;
}
function readMatch(f) {
  const d = new FormData(f);
  return { round_name: d.get('round_name'), team_a_id: d.get('team_a_id') || null, team_b_id: d.get('team_b_id') || null,
    scheduled_at: fromLocalInput(d.get('scheduled_at')), status: d.get('status'), score_a: Number(d.get('score_a') || 0),
    score_b: Number(d.get('score_b') || 0), winner_id: d.get('winner_id') || null, stream_url: d.get('stream_url') };
}
async function renderMatches() {
  const [teams, matches] = await Promise.all([api(`/api/games/${A.gameId}/standings`), api(`/api/games/${A.gameId}/matches`)]);
  const active = teams.filter(t => !t.banned);
  app.innerHTML = `<h1 class="big">Matches</h1>${gamePicker()}
    <datalist id="rounds">${ROUNDS.map(r => `<option value="${r}">`).join('')}</datalist>
    <p class="muted">Round 1 is created automatically when 16 teams register. You can change who plays whom, add later rounds, set times, status and stream links.</p>
    ${matchForm(null, active)}
    ${matches.length ? matches.map(m => matchForm(m, active)).join('') : '<p class="empty">No matches yet. They appear automatically when the 16th team registers, or add one above.</p>'}`;
  bindPicker();
  const nm = $('newMatch');
  nm.onsubmit = async (e) => { e.preventDefault(); if (await act(() => api(`/api/admin/games/${A.gameId}/matches`, { method: 'POST', body: readMatch(nm) }), 'Match added.')) render(); };
  app.querySelectorAll('.mform[data-id]').forEach(f => {
    f.onsubmit = async (e) => { e.preventDefault(); if (await act(() => api('/api/admin/matches/' + f.dataset.id, { method: 'PUT', body: readMatch(f) }), 'Match saved.')) render(); };
    f.querySelector('[data-del]').onclick = async () => { if (confirm('Delete this match?') && await act(() => api('/api/admin/matches/' + f.dataset.id, { method: 'DELETE' }), 'Match deleted.')) render(); };
  });
}

/* ---------- Standings ---------- */
async function renderStandings() {
  const rows = await api(`/api/games/${A.gameId}/standings`);
  app.innerHTML = `<h1 class="big">Standings</h1>${gamePicker()}
    <p class="muted">Ranks are automatic (points, then wins). Type a number in "Manual rank" to force a position, or leave it empty.</p>
    ${rows.length ? `<div class="tscroll"><table><thead><tr><th>Rank</th><th>Team</th><th>Played</th><th>Wins</th><th>Losses</th><th>Points</th><th>Manual rank</th><th></th></tr></thead><tbody>
    ${rows.map(r => `<tr data-team="${r.team_id}"><td>${r.rank}</td><td>${esc(r.name)}${r.banned ? ' <span class="tag st-completed">Banned</span>' : ''}</td>
      <td><input type="number" min="0" name="played" value="${r.played}" aria-label="Played"></td><td><input type="number" min="0" name="wins" value="${r.wins}" aria-label="Wins"></td>
      <td><input type="number" min="0" name="losses" value="${r.losses}" aria-label="Losses"></td><td><input type="number" min="0" name="points" value="${r.points}" aria-label="Points"></td>
      <td><input type="number" min="1" name="manual_rank" value="${r.manual_rank ?? ''}" aria-label="Manual rank"></td>
      <td><button class="btn green sm" type="button">Save</button></td></tr>`).join('')}</tbody></table></div>` : '<p class="empty">No teams registered for this game yet.</p>'}`;
  bindPicker();
  app.querySelectorAll('tr[data-team]').forEach(tr => tr.querySelector('button').onclick = async () => {
    const g = (n) => tr.querySelector(`[name=${n}]`).value;
    if (await act(() => api(`/api/admin/standings/${A.gameId}/${tr.dataset.team}`, { method: 'PUT', body: {
      played: Number(g('played')), wins: Number(g('wins')), losses: Number(g('losses')), points: Number(g('points')), manual_rank: g('manual_rank') || null } }), 'Standing saved.')) render();
  });
}

/* ---------- Teams ---------- */
async function renderTeams() {
  const teams = await api('/api/admin/teams');
  app.innerHTML = `<h1 class="big">Teams</h1>${teams.length ? `<div class="tscroll"><table><thead><tr><th>Team</th><th>Manager</th><th>Members</th><th>Games</th><th>Status</th><th></th></tr></thead><tbody>
    ${teams.map(t => `<tr><td><b>${esc(t.name)}</b></td><td>${esc(t.manager)}</td><td>${esc(t.members)}</td><td>${t.games}</td>
      <td>${t.banned ? '<span class="tag st-completed">Banned</span>' : '<span class="tag st-open">Active</span>'}</td>
      <td>${t.banned ? `<button class="btn ghost sm" data-unban="${t.id}">Unban</button>` : `<button class="btn danger sm" data-ban="${t.id}" data-name="${esc(t.name)}">Ban team</button>`}</td></tr>`).join('')}</tbody></table></div>` : '<p class="empty">No teams have registered yet.</p>'}`;
  app.querySelectorAll('[data-ban]').forEach(b => b.onclick = async () => {
    if (confirm(`Ban "${b.dataset.name}"? They are disqualified, lose their open slots and forfeit active matches.`) && await act(() => api(`/api/admin/teams/${b.dataset.ban}/ban`, { method: 'POST' }), 'Team banned.')) render();
  });
  app.querySelectorAll('[data-unban]').forEach(b => b.onclick = async () => {
    if (await act(() => api(`/api/admin/teams/${b.dataset.unban}/unban`, { method: 'POST' }), 'Team unbanned.')) render();
  });
}
