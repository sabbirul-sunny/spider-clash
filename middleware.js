const db = require('./database');

exports.requireTeam = (req, res, next) => {
  if (!req.session.teamId) return res.status(401).json({ error: 'Please log in first.' });
  const team = db.prepare('SELECT id,name,manager,members,banned FROM teams WHERE id=?').get(req.session.teamId);
  if (!team) return res.status(401).json({ error: 'Please log in first.' });
  if (team.banned) return res.status(403).json({ error: 'Team Banned', banned: true });
  req.team = team;
  next();
};

exports.requireAdmin = (req, res, next) => {
  if (!req.session.adminId) return res.status(401).json({ error: 'Admin login required.' });
  next();
};
