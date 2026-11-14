const router = require('express').Router();
const bcrypt = require('bcryptjs');
const db = require('../database');

function startSession(req, res, data, payload) {
  req.session.regenerate((err) => {
    if (err) return res.status(500).json({ error: 'Could not start session.' });
    Object.assign(req.session, data);
    res.json(payload);
  });
}

router.post('/team/register', (req, res) => {
  const b = req.body || {};
  const name = String(b.teamName || '').trim();
  const members = String(b.members || '').trim();
  const manager = String(b.manager || '').trim();
  const password = String(b.password || '');
  if (!name || !members || !manager || password.length < 6)
    return res.status(400).json({ error: 'Fill in every field. Password needs at least 6 characters.' });
  if (name.length > 40 || manager.length > 60 || members.length > 300)
    return res.status(400).json({ error: 'One of the fields is too long.' });
  if (db.prepare('SELECT 1 FROM teams WHERE name=?').get(name))
    return res.status(409).json({ error: 'That team name is already taken.' });
  const info = db.prepare('INSERT INTO teams (name,members,manager,password_hash) VALUES (?,?,?,?)')
    .run(name, members, manager, bcrypt.hashSync(password, 10));
  startSession(req, res, { teamId: Number(info.lastInsertRowid) }, { ok: true, role: 'team' });
});

router.post('/team/login', (req, res) => {
  const b = req.body || {};
  const team = db.prepare('SELECT * FROM teams WHERE name=?').get(String(b.teamName || '').trim());
  if (!team || !bcrypt.compareSync(String(b.password || ''), team.password_hash))
    return res.status(401).json({ error: 'Wrong team name or password.' });
  if (team.banned) return res.status(403).json({ error: 'Team Banned', banned: true });
  startSession(req, res, { teamId: team.id }, { ok: true, role: 'team' });
});

router.post('/admin/login', (req, res) => {
  const b = req.body || {};
  const admin = db.prepare('SELECT * FROM admins WHERE name=?').get(String(b.adminName || '').trim());
  if (!admin || !bcrypt.compareSync(String(b.password || ''), admin.password_hash))
    return res.status(401).json({ error: 'Wrong admin name or password.' });
  startSession(req, res, { adminId: admin.id }, { ok: true, role: 'admin' });
});

router.post('/logout', (req, res) => {
  req.session.destroy(() => res.json({ ok: true }));
});

router.get('/me', (req, res) => {
  if (req.session.adminId) return res.json({ role: 'admin' });
  if (req.session.teamId) {
    const t = db.prepare('SELECT id,name,manager,members,banned FROM teams WHERE id=?').get(req.session.teamId);
    if (t && !t.banned) return res.json({ role: 'team', team: t });
    return req.session.destroy(() => res.json({ role: null, banned: !!(t && t.banned) }));
  }
  res.json({ role: null });
});

module.exports = router;
