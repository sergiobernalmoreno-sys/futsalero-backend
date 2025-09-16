// server.js
import express from "express";
import cors from "cors";
import Database from "better-sqlite3";
import fs from "fs";

// -------------------- CONFIG --------------------
const DB_PATH = process.env.DB_PATH || "/data/futsalero.db";
const ALLOW_ORIGIN = process.env.ALLOW_ORIGIN || "*";
const MAT = /^[A-Z]{3}\d{4}$/; // AAA1234

const app = express();
app.use(
  cors({
    origin: ALLOW_ORIGIN.split(","),
    credentials: false,
  })
);
app.use(express.json());

// Helpers de tiempo / categorías (si las necesitas)
const nowISO = () => new Date().toISOString();
const safeCats = [
  "LOCAL",
  "PROVINCIAL",
  "AUTONOMICA",
  "3_DIVISION",
  "2_DIVISION_B",
  "2_DIVISION",
  "PRIMERA_DIVISION",
  "SELECCION_ESPANOLA",
];

// Conexión a BD (WAL para concurrencia)
function dbConn() {
  const db = new Database(DB_PATH);
  db.pragma("journal_mode = WAL");
  return db;
}

// --- Inicializar BD desde schema.sql (solo si ejecutas con --init) ---
if (process.argv.includes("--init")) {
  const db = dbConn();
  const schema = fs.readFileSync("./schema.sql", "utf8");
  db.exec(schema);
  console.log("BD inicializada ✅");
  process.exit(0);
}

// -------------------- MATRÍCULAS --------------------
// Genera AAA1234
function genMatricula() {
  const L = "ABCDEFGHIJKLMNOPQRSTUVWXYZ";
  const pick = (n, s) =>
    Array.from({ length: n }, () => s[Math.floor(Math.random() * s.length)]).join("");
  return pick(3, L) + String(Math.floor(1000 + Math.random() * 9000));
}

// Garantiza unicidad contra la BD
function genUniqueMatricula(db) {
  for (let i = 0; i < 50; i++) {
    const m = genMatricula();
    const exists = db.prepare("SELECT 1 FROM players WHERE matricula = ?").get(m);
    if (!exists) return m;
  }
  throw new Error("no_unique_matricula");
}

// -------------------- ENDPOINTS --------------------

// Registro inicial desde la UI (“Soy Jugador” / “Soy Fan”)
// Crea fila en players con matrícula única y rol.
app.post("/register", (req, res) => {
  try {
    const { role, username } = req.body || {};
    if (!role || !["player", "fan"].includes(role)) {
      return res.status(400).json({ error: "rol_invalido" });
    }

    const db = dbConn();
    const matricula = genUniqueMatricula(db);

    db.prepare(
      `INSERT INTO players (matricula, username, role, created_at)
       VALUES (?, ?, ?, ?)`
    ).run(matricula, username || "", role, nowISO());

    return res.json({ ok: true, matricula, role });
  } catch (e) {
    console.error("register error:", e);
    return res.status(500).json({ error: "register_failed" });
  }
});

// Sincronización por lotes (si ya la utilizabas en el front)
// Body: { matricula, username, categories }
// Mantengo validación de matrícula para no romper nada que ya tengas.
app.post("/players/sync", (req, res) => {
  try {
    const { matricula, username, categories } = req.body || {};
    if (!matricula || !MAT.test(matricula)) {
      return res.status(400).json({ error: "Matricula inválida" });
    }
    const db = dbConn();

    const catsJson = JSON.stringify(Array.isArray(categories) ? categories : []);
    const get = db.prepare("SELECT * FROM players WHERE matricula = ?").get(matricula);

    if (get) {
      db.prepare(
        "UPDATE players SET username = ?, categories = ?, updated_at = ? WHERE matricula = ?"
      ).run(username || "", catsJson, nowISO(), matricula);
    } else {
      db.prepare(
        "INSERT INTO players (matricula, username, categories, created_at) VALUES (?, ?, ?, ?)"
      ).run(matricula, username || "", catsJson, nowISO());
    }

    return res.json({ ok: true });
  } catch (e) {
    console.error("players/sync error:", e);
    return res.status(500).json({ error: "sync_failed" });
  }
});

// Buscar por matrícula exacta (usado por la pantalla “Buscar Matrícula”)
app.get("/search", (req, res) => {
  try {
    const q = String(req.query.matricula || "").toUpperCase().trim();
    if (!MAT.test(q)) return res.status(400).json({ error: "Formato AAA1234" });

    const db = dbConn();
    const p = db.prepare("SELECT * FROM players WHERE matricula = ?").get(q);
    if (!p) return res.status(404).json({ error: "No existe esa matrícula" });

    return res.json({ ok: true, matricula: q, player: p });
  } catch (e) {
    console.error("search error:", e);
    return res.status(500).json({ error: "search_failed" });
  }
});

// Ranking global sencillo y estable (paginado)
// Devuelve mock de contadores a 0 si tu tabla aún no tiene esos campos.
app.get("/ranking", (req, res) => {
  try {
    const limit = Math.min(parseInt(req.query.limit || "20", 10), 50);
    const offset = parseInt(req.query.offset || "0", 10);

    const db = dbConn();
    // Si ya tienes una columna "points" puedes ordenar por ella.
    // Aquí uso rowid DESC como ejemplo neutro.
    const stmt = db.prepare(
      "SELECT matricula, username, role FROM players ORDER BY rowid DESC LIMIT ? OFFSET ?"
    );
    const rows = stmt.all(limit, offset);

    const items = rows.map((r) => ({
      matricula: r.matricula,
      username: r.username,
      role: r.role || null,
      points: 0,
      posts: 0,
      ciertos: 0,
      falsos: 0,
      comments: 0,
    }));

    return res.json({ items, limit, offset });
  } catch (e) {
    console.error("ranking error:", e);
    return res.status(500).json({ error: "ranking_failed" });
  }
});

// Healthcheck
app.get("/", (_req, res) => res.json({ ok: true, time: nowISO() }));

// -------------------- LISTEN --------------------
app.listen(process.env.PORT || 8080, () => console.log("API ON"));
