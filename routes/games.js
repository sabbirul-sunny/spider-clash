const router = require('express').Router();
const db = require('../database');
const { requireTeam } = require('../middleware');

const MAX_TEAMS = 16;

// Fisher-Yates shuffle
function shuffle(arr) {
  const a = arr.slice();
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}

const GAME_SQL = `SELECT g.*, (SELECT COUNT(*) FROM registrations r WHERE r.game_id=g.id) AS registered FROM games g`;

function standingsFor(gameId) {
  const rows = db.prepare(`SELECT s.team_id, t.name, t.banned, s.played, s.wins, s.losses, s.points, s.manual_rank
    FROM standings s JOIN teams t ON t.id=s.team_id WHERE s.game_id=?`).all(gameId);
  rows.sort((a, b) =>
    (a.banned - b.banned) ||
    ((a.manual_rank == null) - (b.manual_rank == null)) ||
    (a.manual_rank - b.manual_rank) ||
    (b.points - a.points) || (b.wins - a.wins) || a.name.localeCompare(b.name));
  rows.forEach((r, i) => { r.rank = i + 1; });
  return rows;
}

const MATCH_SQL = `SELECT m.*, ta.name AS team_a_name, tb.name AS team_b_name, tw.name AS winner_name,
    ta.members AS team_a_members, tb.members AS team_b_members, ta.manager AS team_a_manager, tb.manager AS team_b_manager,
    ta.banned AS a_banned, tb.banned AS b_banned
  FROM matches m
  LEFT JOIN teams ta ON ta.id=m.team_a_id
  LEFT JOIN teams tb ON tb.id=m.team_b_id
  LEFT JOIN teams tw ON tw.id=m.winner_id`;

function registeredSet(req) {
  if (!req.session.teamId) return new Set();
  return new Set(db.prepare('SELECT game_id FROM registrations WHERE team_id=?').all(req.session.teamId).map(r => r.game_id));
}

router.get('/games', (req, res) => {
  const mine = registeredSet(req);
  const games = db.prepare(`${GAME_SQL} ORDER BY g.id`).all().map(g => ({ ...g, isRegistered: mine.has(g.id) }));
  res.json(games);
});

router.get('/my/games', requireTeam, (req, res) => {
  const mine = registeredSet(req);
  res.json(db.prepare(`${GAME_SQL} ORDER BY g.id`).all().filter(g => mine.has(g.id)).map(g => ({ ...g, isRegistered: true })));
});

router.get('/games/:id', (req, res) => {
  const g = db.prepare(`${GAME_SQL} WHERE g.id=?`).get(Number(req.params.id));
  if (!g) return res.status(404).json({ error: 'Game not found.' });
  g.isRegistered = registeredSet(req).has(g.id);
  g.teams = db.prepare('SELECT t.name FROM registrations r JOIN teams t ON t.id=r.team_id WHERE r.game_id=? ORDER BY r.id').all(g.id).map(t => t.name);
  res.json(g);
});

router.get('/games/:id/standings', (req, res) => res.json(standingsFor(Number(req.params.id))));

router.get('/games/:id/matches', (req, res) => {
  res.json(db.prepare(`${MATCH_SQL} WHERE m.game_id=? ORDER BY m.round_no, m.match_no`).all(Number(req.params.id)));
});

router.get('/matches/:id', (req, res) => {
  const m = db.prepare(`${MATCH_SQL} WHERE m.id=?`).get(Number(req.params.id));
  if (!m) return res.status(404).json({ error: 'Match not found.' });
  res.json(m);
});

// Atomic registration. The 16th team triggers auto-start + random Round 1 pairing.
const registerTx = db.transaction((gameId, teamId) => {
  const game = db.prepare('SELECT * FROM games WHERE id=?').get(gameId);
  if (!game) return { code: 404, error: 'Game not found.' };
  if (game.status !== 'open') return { code: 409, error: 'Registration is closed for this game.' };
  if (db.prepare('SELECT 1 FROM registrations WHERE game_id=? AND team_id=?').get(gameId, teamId))
    return { code: 409, error: 'Your team is already registered for this game.' };
  const count = db.prepare('SELECT COUNT(*) AS c FROM registrations WHERE game_id=?').get(gameId).c;
  if (count >= MAX_TEAMS) return { code: 409, error: 'This game is full (16 / 16 teams).' };

  db.prepare('INSERT INTO registrations (game_id,team_id) VALUES (?,?)').run(gameId, teamId);
  db.prepare('INSERT INTO standings (game_id,team_id) VALUES (?,?)').run(gameId, teamId);

  let started = false;
  if (count + 1 === MAX_TEAMS) {
    db.prepare("UPDATE games SET status='live' WHERE id=?").run(gameId);
    const ids = shuffle(db.prepare('SELECT team_id FROM registrations WHERE game_id=?').all(gameId).map(r => r.team_id));
    const ins = db.prepare(`INSERT INTO matches (game_id,round_name,round_no,match_no,team_a_id,team_b_id,scheduled_at,status)
      VALUES (?,?,?,?,?,?,?, 'upcoming')`);
    for (let i = 0; i < 8; i++) ins.run(gameId, 'Round of 16', 1, i + 1, ids[i * 2], ids[i * 2 + 1], game.tournament_date);
    started = true;
  }
  return { ok: true, started, registered: count + 1 };
});

router.post('/games/:id/register', requireTeam, (req, res) => {
  const result = registerTx.immediate(Number(req.params.id), req.team.id);
  if (result.error) return res.status(result.code).json({ error: result.error });
  res.json(result);
});

module.exports = router;
