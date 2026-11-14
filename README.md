# Spider Clash - eSports Tournament Management System

Node.js + Express + SQLite + vanilla HTML/CSS/JS (Mint Soft design).

## Run it
1. Install Node.js 18 or newer (https://nodejs.org).
2. Open a terminal in this folder and run:
   ```
   npm install
   npm start
   ```
3. Open http://localhost:3000

The database file `spiderclash.db` is created automatically on first run.
It contains ONLY the 8 games and 1 admin. No teams, registrations, standings or matches.

## Default admin (change before publishing)
- Admin name: `admin`
- Password: `Admin@12345`

Set your own before the first run:
```
ADMIN_NAME=myadmin ADMIN_PASSWORD=MyStrongPass1 SESSION_SECRET=long-random-text npm start
```
(Windows PowerShell: `$env:ADMIN_PASSWORD="MyStrongPass1"; npm start`)
To reset everything, stop the server and delete `spiderclash.db`.

## How it works
- Teams register (team name, members, manager, password) and log in with team name + password.
- Banned teams see "Team Banned" and cannot log in.
- Every team can join many games. Each game holds 16 teams.
- When the 16th team registers (atomic database transaction): registration locks, status becomes
  "Tournament Started", and 8 Round 1 matches are created from a random shuffle.
- Admin panel: edit dates and prizes, swap match teams, add Quarterfinal/Semifinal/Final,
  set time/status/scores/winner/stream link, edit standings and ranks, ban or unban teams.
- Banning: team is disqualified, loses slots in games that have not started, and forfeits active matches.
- Match viewer embeds YouTube or Twitch links. Other links show an "Open live stream" button.

## Photos (Unsplash)
Open `public/js/images.js` and paste Unsplash image URLs for the hero and each game.
Empty values show a green gradient. Credit photographers in your footer.

## Folder map
```
server.js            app entry
database.js          tables + seed (8 games, 1 admin)
middleware.js        team/admin guards
routes/auth.js       register, login, logout
routes/games.js      games, standings, matches, registration + auto-start
routes/admin.js      admin controls
public/              index.html, dashboard.html, admin.html, css/, js/
```

## Before you publish
- Use HTTPS and set a strong SESSION_SECRET and admin password.
- Prizes show the "৳" symbol. Change CURRENCY in public/js/common.js.
- Sessions are stored in memory (fine for one server). For many users, add a persistent session store.
