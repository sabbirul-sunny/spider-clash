const router = require('express').Router();
const db = require('../database');
const { requireAdmin } = require('../middleware');

router.use(requireAdmin);

const ROUND_NO = { 'round of 16': 1, 'quarterfinal': 2, 'quarterfinals': 2, 'semifinal': 3, 'semifinals': 3, 'final': 4 };
const STATUSES = ['upcoming', 'live', 'completed'];

const isNonNegInt = (v) => Number.isInteger(v) && v >= 0;
const toIdOrNull = (v) => (v === null || v === undefined || v === '' ? null : Number(v));

// ---- Games & prizes
router.put('/games/:id', (req, res) => {
  const g = db.prepare('SELECT * FROM games WHERE id=?').get(Number(req.params.id));
  if (!g) return res.status(404).json({ error: 'Game not found.' });
  const b = req.body || {};
  const date = new Date(b.tournament_date);
  const cp = Number(b.champion_prize), rp = Number(b.runnerup_prize);
  if (isNaN(date)) return res.status(400).json({ error: 'Enter a valid date and time.' });
  if (!isNonNegInt(cp) || !isNonNegInt(rp)) return res.status(400).json({ error: 'Prizes must be whole numbers (0 or more).' });
  let status = g.status;
  if (b.status && b.status !== g.status) {
    if (g.status === 'open' || !['live', 'completed'].includes(b.status))
      return res.status(400).json({ error: 'Status can only switch between Live and Completed after the tournament starts.' });
    status = b.status;
  }
  db.prepare('UPDATE games SET tournament_date=?, champion_prize=?, runnerup_prize=?, status=? WHERE id=?')
    .run(date.toISOString(), cp, rp, status, g.id);
  res.json({ ok: true });
});

// ---- Standings
router.put('/standings/:gameId/:teamId', (req, res) => {
  const b = req.body || {};
  const vals = [b.played, b.wins, b.losses, b.points].map(Number);
  if (!vals.every(isNonNegInt)) return res.status(400).json({ error: 'Played, wins, losses and points must be whole numbers (0 or more).' });
  let rank = toIdOrNull(b.manual_rank);
  if (rank !== null && (!Number.isInteger(rank) || rank < 1)) return res.status(400).json({ error: 'Rank must be 1 or higher, or empty for automatic.' });
  const info = db.prepare('UPDATE standings SET played=?,wins=?,losses=?,points=?,manual_rank=? WHERE game_id=? AND team_id=?')
    .run(...vals, rank, Number(req.params.gameId), Number(req.params.teamId));
  if (!info.changes) return res.status(404).json({ error: 'Standing not found.' });
  res.json({ ok: true });
});

// ---- Matches
function validateMatch(gameId, m) {
  if (!m.round_name || m.round_name.length > 40) return 'Enter a round name (max 40 characters).';
  if (m.team_a_id && m.team_a_id === m.team_b_id) return 'A team cannot play against itself.';
  for (const t of [m.team_a_id, m.team_b_id]) {
    if (!t) continue;
    const ok = db.prepare('SELECT 1 FROM registrations r JOIN teams t ON t.id=r.team_id WHERE r.game_id=? AND r.team_id=? AND t.banned=0').get(gameId, t);
    if (!ok) return 'Both teams must be registered in this game and not banned.';
  }
  if (!STATUSES.includes(m.status)) return 'Invalid match status.';
  if (m.stream_url && !(/^https?:\/\//i.test(m.stream_url) && m.stream_url.length <= 300)) return 'Live stream URL must start with http:// or https://';
  if (!isNonNegInt(m.score_a) || !isNonNegInt(m.score_b)) return 'Scores must be whole numbers (0 or more).';
  if (m.winner_id && m.winner_id !== m.team_a_id && m.winner_id !== m.team_b_id) return 'Winner must be one of the two teams.';
  return null;
}

function cleanMatch(b, base = {}) {
  const m = { ...base, ...b };
  let when = null;
  if (m.scheduled_at) { const d = new Date(m.scheduled_at); when = isNaN(d) ? 'invalid' : d.toISOString(); }
  return {
    round_name: String(m.round_name || '').trim(),
    team_a_id: toIdOrNull(m.team_a_id), team_b_id: toIdOrNull(m.team_b_id),
    scheduled_at: when,
    status: m.status || 'upcoming',
    stream_url: String(m.stream_url || '').trim(),
    score_a: Number(m.score_a || 0), score_b: Number(m.score_b || 0),
    winner_id: toIdOrNull(m.winner_id),
  };
}

router.post('/games/:id/matches', (req, res) => {
  const game = db.prepare('SELECT * FROM games WHERE id=?').get(Number(req.params.id));
  if (!game) return res.status(404).json({ error: 'Game not found.' });
  const m = cleanMatch(req.body || {});
  if (m.scheduled_at === 'invalid') return res.status(400).json({ error: 'Enter a valid match time.' });
  const err = validateMatch(game.id, m);
  if (err) return res.status(400).json({ error: err });
  const roundNo = ROUND_NO[m.round_name.toLowerCase()] || 5;
  const next = db.prepare('SELECT COALESCE(MAX(match_no),0)+1 AS n FROM matches WHERE game_id=? AND round_name=?').get(game.id, m.round_name).n;
  const info = db.prepare(`INSERT INTO matches (game_id,round_name,round_no,match_no,team_a_id,team_b_id,scheduled_at,status,stream_url,score_a,score_b,winner_id)
    VALUES (?,?,?,?,?,?,?,?,?,?,?,?)`).run(game.id, m.round_name, roundNo, next, m.team_a_id, m.team_b_id, m.scheduled_at, m.status, m.stream_url, m.score_a, m.score_b, m.winner_id);
  res.json({ ok: true, id: Number(info.lastInsertRowid) });
});

router.put('/matches/:id', (req, res) => {
  const cur = db.prepare('SELECT * FROM matches WHERE id=?').get(Number(req.params.id));
  if (!cur) return res.status(404).json({ error: 'Match not found.' });
  const m = cleanMatch(req.body || {}, cur);
  if (m.scheduled_at === 'invalid') return res.status(400).json({ error: 'Enter a valid match time.' });
  const err = validateMatch(cur.game_id, m);
  if (err) return res.status(400).json({ error: err });
  const roundNo = ROUND_NO[m.round_name.toLowerCase()] || (m.round_name === cur.round_name ? cur.round_no : 5);
  db.prepare(`UPDATE matches SET round_name=?,round_no=?,team_a_id=?,team_b_id=?,scheduled_at=?,status=?,stream_url=?,score_a=?,score_b=?,winner_id=? WHERE id=?`)
    .run(m.round_name, roundNo, m.team_a_id, m.team_b_id, m.scheduled_at, m.status, m.stream_url, m.score_a, m.score_b, m.winner_id, cur.id);
  res.json({ ok: true });
});

router.delete('/matches/:id', (req, res) => {
  db.prepare('DELETE FROM matches WHERE id=?').run(Number(req.params.id));
  res.json({ ok: true });
});

// ---- Teams & bans
router.get('/teams', (req, res) => {
  res.json(db.prepare(`SELECT t.id,t.name,t.manager,t.members,t.banned,t.created_at,
    (SELECT COUNT(*) FROM registrations r WHERE r.team_id=t.id) AS games
    FROM teams t ORDER BY t.created_at DESC, t.id DESC`).all());
});

const banTx = db.transaction((teamId) => {
  db.prepare('UPDATE teams SET banned=1 WHERE id=?').run(teamId);
  // Games not started yet: free the slot.
  const open = db.prepare("SELECT r.game_id FROM registrations r JOIN games g ON g.id=r.game_id WHERE r.team_id=? AND g.status='open'").all(teamId);
  for (const { game_id } of open) {
    db.prepare('DELETE FROM registrations WHERE game_id=? AND team_id=?').run(game_id, teamId);
    db.prepare('DELETE FROM standings WHERE game_id=? AND team_id=?').run(game_id, teamId);
  }
  // Active matches: opponent wins by forfeit.
  const active = db.prepare("SELECT * FROM matches WHERE status!='completed' AND (team_a_id=? OR team_b_id=?)").all(teamId, teamId);
  for (const m of active) {
    const opp = m.team_a_id === teamId ? m.team_b_id : m.team_a_id;
    db.prepare("UPDATE matches SET status='completed', winner_id=?, score_a=0, score_b=0 WHERE id=?").run(opp, m.id);
  }
});

router.post('/teams/:id/ban', (req, res) => {
  const id = Number(req.params.id);
  if (!db.prepare('SELECT 1 FROM teams WHERE id=?').get(id)) return res.status(404).json({ error: 'Team not found.' });
  banTx(id);
  res.json({ ok: true });
});

router.post('/teams/:id/unban', (req, res) => {
  db.prepare('UPDATE teams SET banned=0 WHERE id=?').run(Number(req.params.id));
  res.json({ ok: true });
});

module.exports = router;
