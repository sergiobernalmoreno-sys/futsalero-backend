PRAGMA foreign_keys = ON;

CREATE TABLE IF NOT EXISTS players (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  matricula TEXT UNIQUE NOT NULL,
  username TEXT,
  categories TEXT,
  social_points INTEGER DEFAULT 0,
  total_points INTEGER DEFAULT 0
);

CREATE TABLE IF NOT EXISTS friendships (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  follower_matricula TEXT NOT NULL,
  target_matricula TEXT NOT NULL,
  UNIQUE(follower_matricula, target_matricula)
);

CREATE TABLE IF NOT EXISTS matches (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  player_matricula TEXT NOT NULL,
  category TEXT NOT NULL,
  points INTEGER DEFAULT 0,
  goals INTEGER DEFAULT 0,
  assists INTEGER DEFAULT 0,
  is_goalkeeper INTEGER DEFAULT 0,
  created_date TEXT DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS posts (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  author_matricula TEXT NOT NULL,
  body TEXT,
  match_id INTEGER,
  created_date TEXT DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS comments (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  post_id INTEGER NOT NULL,
  author_matricula TEXT NOT NULL,
  text TEXT NOT NULL,
  created_date TEXT DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS votes (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  post_id INTEGER NOT NULL,
  voter_matricula TEXT NOT NULL,
  value INTEGER NOT NULL,
  UNIQUE(post_id, voter_matricula)
);

CREATE TABLE IF NOT EXISTS reports (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  post_id INTEGER NOT NULL,
  reporter_matricula TEXT NOT NULL,
  created_date TEXT DEFAULT (datetime('now')),
  UNIQUE(post_id, reporter_matricula)
);
-- schema.sql
CREATE TABLE IF NOT EXISTS users (
  id INTEGER PRIMARY KEY,
  email TEXT UNIQUE,
  username TEXT,
  role TEXT,                 -- 'player' | 'fan'
  matricula TEXT UNIQUE,     -- AAA1234
  created_at TEXT DEFAULT (DATETIME('now'))
);

CREATE UNIQUE INDEX IF NOT EXISTS idx_users_matricula ON users(matricula);
