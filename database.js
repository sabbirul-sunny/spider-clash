// Creates the SQLite database file and tables on first run.
// Seeds ONLY the 8 games and 1 default admin. No teams, registrations, standings or matches.
const Database = require('better-sqlite3');
const bcrypt = require('bcryptjs');
const path = require('path');

const db = new Database(path.join(__dirname, 'spiderclash.db'));
db.pragma('journal_mode = WAL');
db.pragma('foreign_keys = ON');

db.exec(`
CREATE TABLE IF NOT EXISTS admins (
  id INTEGER PRIMARY KEY,
  name TEXT NOT NULL UNIQUE COLLATE NOCASE,
  password_hash TEXT NOT NULL
);
CREATE TABLE IF NOT EXISTS teams (
  id INTEGER PRIMARY KEY,
  name TEXT NOT NULL UNIQUE COLLATE NOCASE,
  members TEXT NOT NULL,
  manager TEXT NOT NULL,
  password_hash TEXT NOT NULL,
  banned INTEGER NOT NULL DEFAULT 0,
  created_at TEXT DEFAULT CURRENT_TIMESTAMP
);
CREATE TABLE IF NOT EXISTS games (
  id INTEGER PRIMARY KEY,
  slug TEXT NOT NULL UNIQUE,
  name TEXT NOT NULL,
  tournament_date TEXT NOT NULL,
  champion_prize INTEGER NOT NULL,
  runnerup_prize INTEGER NOT NULL,
  status TEXT NOT NULL DEFAULT 'open' CHECK (status IN ('open','live','completed'))
);
CREATE TABLE IF NOT EXISTS registrations (
  id INTEGER PRIMARY KEY,
  game_id INTEGER NOT NULL REFERENCES games(id),
  team_id INTEGER NOT NULL REFERENCES teams(id),
  created_at TEXT DEFAULT CURRENT_TIMESTAMP,
  UNIQUE (game_id, team_id)
);
CREATE TABLE IF NOT EXISTS standings (
  game_id INTEGER NOT NULL REFERENCES games(id),
  team_id INTEGER NOT NULL REFERENCES teams(id),
  played INTEGER NOT NULL DEFAULT 0,
  wins INTEGER NOT NULL DEFAULT 0,
  losses INTEGER NOT NULL DEFAULT 0,
  points INTEGER NOT NULL DEFAULT 0,
  manual_rank INTEGER,
  PRIMARY KEY (game_id, team_id)
);
CREATE TABLE IF NOT EXISTS matches (
  id INTEGER PRIMARY KEY,
  game_id INTEGER NOT NULL REFERENCES games(id),
  round_name TEXT NOT NULL,
  round_no INTEGER NOT NULL DEFAULT 1,
  match_no INTEGER NOT NULL DEFAULT 1,
  team_a_id INTEGER REFERENCES teams(id),
  team_b_id INTEGER REFERENCES teams(id),
  scheduled_at TEXT,
  status TEXT NOT NULL DEFAULT 'upcoming' CHECK (status IN ('upcoming','live','completed')),
  stream_url TEXT NOT NULL DEFAULT '',
  score_a INTEGER NOT NULL DEFAULT 0,
  score_b INTEGER NOT NULL DEFAULT 0,
  winner_id INTEGER REFERENCES teams(id)
);
`);

function daysFromNow(days) {
  const d = new Date();
  d.setDate(d.getDate() + days);
  d.setHours(18, 0, 0, 0);
  return d.toISOString();
}

if (db.prepare('SELECT COUNT(*) AS c FROM games').get().c === 0) {
  const games = [
    ['pubg', 'PUBG', 14, 50000, 25000],
    ['mlbb', 'MLBB', 16, 40000, 20000],
    ['efootball', 'eFootball', 18, 30000, 15000],
    ['valorant', 'Valorant', 20, 60000, 30000],
    ['cod', 'COD', 22, 35000, 17500],
    ['coc', 'CoC', 24, 25000, 12500],
    ['fifa', 'FIFA', 26, 30000, 15000],
    ['freefire', 'Free Fire', 28, 45000, 22500],
  ];
  const ins = db.prepare('INSERT INTO games (slug,name,tournament_date,champion_prize,runnerup_prize) VALUES (?,?,?,?,?)');
  for (const g of games) ins.run(g[0], g[1], daysFromNow(g[2]), g[3], g[4]);
}

if (db.prepare('SELECT COUNT(*) AS c FROM admins').get().c === 0) {
  const name = process.env.ADMIN_NAME || 'admin';
  const pass = process.env.ADMIN_PASSWORD || 'Admin@12345';
  db.prepare('INSERT INTO admins (name,password_hash) VALUES (?,?)').run(name, bcrypt.hashSync(pass, 10));
  console.log(`Default admin created -> name: ${name}  password: ${pass}  (change it!)`);
}

module.exports = db;
