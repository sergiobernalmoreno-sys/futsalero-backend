import express from "express";
import cors from "cors";
import Database from "better-sqlite3";
import fs from "fs";

const DB_PATH = process.env.DB_PATH || "/data/futsalero.db";
const ALLOW_ORIGIN = process.env.ALLOW_ORIGIN || "*";
const MAT = /^[A-Z]{3}\d{4}$/;

const app = express();
app.use(cors({ origin: ALLOW_ORIGIN.split(","), credentials: false }));
app.use(express.json());

function dbConn() { const db = new Database(DB_PATH); db.pragma("journal_mode = WAL"); return db; }
const nowISO = () => new Date().toISOString();
const safeCats = ["LOCAL","PROVINCIAL","AUTONOMICA","3_DIVISION","2_DIVISION_B","2_DIVISION","PRIMERA_DIVISION","SELECCION_ESPAÑOLA"];

if (process.argv.includes("--init")) {
  const db = dbConn(); const schema = fs.readFileSync("./schema.sql","utf8"); db.exec(schema);
  console.log("DB inicializada ✅"); process.exit(0);
}

// Players
app.post("/players/sync",(req,res)=>{
  const { matricula, username, categories } = req.body||{};
  if(!matricula||!MAT.test(matricula)) return res.status(400).json({error:"Matrícula inválida"});
  const db=dbConn(); const get=db.prepare("SELECT * FROM players WHERE matricula=?").get(matricula);
  const cats=JSON.stringify(Array.isArray(categories)?categories:[]);
  if(get){ db.prepare("UPDATE players SET username=?, categories=? WHERE id=?").run(username||get.username||matricula,cats,get.id); res.json({ok:true,id:get.id}); }
  else { const info=db.prepare("INSERT INTO players(matricula,username,categories) VALUES(?,?,?)").run(matricula,username||matricula,cats); res.json({ok:true,id:info.lastInsertRowid}); }
});
app.get("/players/:matricula",(req,res)=>{ const m=(req.params.matricula||"").toUpperCase();
  const db=dbConn(); const p=db.prepare("SELECT * FROM players WHERE matricula=?").get(m);
  if(!p) return res.status(404).json({error:"No existe"}); p.categories=JSON.parse(p.categories||"[]"); res.json(p);
});

// Friendships (+1 social)
app.post("/friendships",(req,res)=>{
  const { follower_matricula, target_matricula } = req.body||{};
  const f=(follower_matricula||"").toUpperCase(), t=(target_matricula||"").toUpperCase();
  if(!MAT.test(f)||!MAT.test(t)||f===t) return res.status(400).json({error:"Datos inválidos"});
  const db=dbConn(); try{ db.prepare("INSERT INTO friendships(follower_matricula,target_matricula) VALUES(?,?)").run(f,t); }
  catch{ return res.json({ok:true,message:"Ya seguía"}); }
  db.prepare("UPDATE players SET social_points=COALESCE(social_points,0)+1 WHERE matricula=?").run(t); res.json({ok:true});
});

// Matches
app.post("/matches",(req,res)=>{
  const { player_matricula, category, points=0, goals=0, assists=0, is_goalkeeper=false } = req.body||{};
  const m=(player_matricula||"").toUpperCase(); if(!MAT.test(m)) return res.status(400).json({error:"Matrícula inválida"});
  if(!safeCats.includes(category)) return res.status(400).json({error:"Categoría inválida"});
  const db=dbConn(); const info=db.prepare(`
    INSERT INTO matches(player_matricula,category,points,goals,assists,is_goalkeeper,created_date)
    VALUES(?,?,?,?,?,?,?)
  `).run(m,category,Number(points||0),Number(goals||0),Number(assists||0),is_goalkeeper?1:0,nowISO());
  res.json({ok:true,id:info.lastInsertRowid});
});
app.get("/matches",(req,res)=>{
  const { player_matricula, category, limit=50, offset=0 } = req.query; const db=dbConn();
  let q="SELECT * FROM matches WHERE 1=1", args=[];
  if(player_matricula){ q+=" AND player_matricula=?"; args.push(String(player_matricula).toUpperCase()); }
  if(category){ q+=" AND category=?"; args.push(category); }
  q+=" ORDER BY datetime(created_date) DESC LIMIT ? OFFSET ?"; args.push(Number(limit),Number(offset));
  res.json(db.prepare(q).all(...args));
});

// Posts
app.post("/posts",(req,res)=>{ const { author_matricula, body="", match_id=null } = req.body||{};
  const m=(author_matricula||"").toUpperCase(); if(!MAT.test(m)) return res.status(400).json({error:"Matrícula inválida"});
  const db=dbConn(); const info=db.prepare(`INSERT INTO posts(author_matricula,body,match_id,created_date) VALUES(?,?,?,?)`).run(m,String(body),match_id??null,nowISO());
  res.json({ok:true,id:info.lastInsertRowid});
});
app.get("/posts",(req,res)=>{ const { limit=10, offset=0 }=req.query; const db=dbConn();
  res.json(db.prepare(`SELECT * FROM posts ORDER BY datetime(created_date) DESC LIMIT ? OFFSET ?`).all(Number(limit),Number(offset)));
});

// Comments
app.post("/comments",(req,res)=>{ const { post_id, author_matricula, text }=req.body||{};
  const m=(author_matricula||"").toUpperCase(); if(!post_id||!text||String(text).trim()==="") return res.status(400).json({error:"Faltan datos"});
  if(String(text).length>140) return res.status(400).json({error:"Máx 140"}); if(!MAT.test(m)) return res.status(400).json({error:"Matrícula inválida"});
  const db=dbConn(); const info=db.prepare(`INSERT INTO comments(post_id,author_matricula,text,created_date) VALUES(?,?,?,?)`).run(Number(post_id),m,String(text),nowISO());
  res.json({ok:true,id:info.lastInsertRowid});
});
app.get("/comments",(req,res)=>{ const { post_id }=req.query; if(!post_id) return res.status(400).json({error:"post_id requerido"});
  const db=dbConn(); res.json(db.prepare("SELECT * FROM comments WHERE post_id=? ORDER BY datetime(created_date) ASC").all(Number(post_id)));
});

// Votes
app.post("/votes",(req,res)=>{ const { post_id, voter_matricula, value }=req.body||{};
  const m=(voter_matricula||"").toUpperCase(); if(!post_id||!MAT.test(m)) return res.status(400).json({error:"Datos inválidos"});
  const val=(value===true||value===1||value==="true")?1:0; const db=dbConn();
  const ex=db.prepare("SELECT * FROM votes WHERE post_id=? AND voter_matricula=?").get(Number(post_id),m);
  if(ex) db.prepare("UPDATE votes SET value=? WHERE id=?").run(val,ex.id); else db.prepare("INSERT INTO votes(post_id,voter_matricula,value) VALUES(?,?,?)").run(Number(post_id),m,val);
  const t=db.prepare("SELECT COUNT(*) c FROM votes WHERE post_id=? AND value=1").get(Number(post_id)).c;
  const f=db.prepare("SELECT COUNT(*) c FROM votes WHERE post_id=? AND value=0").get(Number(post_id)).c;
  res.json({ok:true,trueCount:t,falseCount:f});
});
app.get("/votes/counts",(req,res)=>{ const { post_id }=req.query; if(!post_id) return res.status(400).json({error:"post_id requerido"});
  const db=dbConn(); const t=db.prepare("SELECT COUNT(*) c FROM votes WHERE post_id=? AND value=1").get(Number(post_id)).c;
  const f=db.prepare("SELECT COUNT(*) c FROM votes WHERE post_id=? AND value=0").get(Number(post_id)).c; res.json({trueCount:t,falseCount:f});
});

// Reports (auto-delete 30)
app.post("/reports",(req,res)=>{ const { post_id, reporter_matricula }=req.body||{};
  const m=(reporter_matricula||"").toUpperCase(); if(!post_id||!MAT.test(m)) return res.status(400).json({error:"Datos inválidos"});
  const db=dbConn(); try{ db.prepare("INSERT INTO reports(post_id,reporter_matricula,created_date) VALUES(?,?,?)").run(Number(post_id),m,nowISO()); }
  catch{ return res.json({ok:true,message:"Ya reportado"}); }
  const c=db.prepare("SELECT COUNT(*) c FROM reports WHERE post_id=?").get(Number(post_id)).c;
  if(c>=30){ db.prepare("DELETE FROM comments WHERE post_id=?").run(Number(post_id));
    db.prepare("DELETE FROM votes WHERE post_id=?").run(Number(post_id));
    db.prepare("DELETE FROM reports WHERE post_id=?").run(Number(post_id));
    db.prepare("DELETE FROM posts WHERE id=?").run(Number(post_id));
    return res.json({ok:true,removed:true,reports:c});
  }
  res.json({ok:true,reports:c});
});

// Ranking categoría
app.get("/ranking/:category",(req,res)=>{
  const cat=req.params.category; const scope=(req.query.scope||"global"); const viewer=(req.query.viewer||"").toUpperCase();
  if(!safeCats.includes(cat)) return res.status(400).json({error:"Categoría inválida"});
  const db=dbConn(); const rows=db.prepare("SELECT player_matricula, SUM(points) pts, COUNT(*) cnt FROM matches WHERE category=? GROUP BY player_matricula").all(cat);
  const getP=db.prepare("SELECT * FROM players WHERE matricula=?"); let friends=new Set();
  if(scope==="friends"&&MAT.test(viewer)){ const list=db.prepare("SELECT target_matricula FROM friendships WHERE follower_matricula=?").all(viewer); friends=new Set(list.map(x=>x.target_matricula)); }
  const result=rows.map(r=>{ const p=getP.get(r.player_matricula); const social=p?.social_points??0; const cats=p?.categories?JSON.parse(p.categories):[];
    return { matricula:r.player_matricula, username:p?.username||r.player_matricula, categories:cats, puntos:Number(r.pts)+Number(social), partidos:Number(r.cnt) }; })
    .filter(r=>scope==="global"?true:friends.has(r.matricula))
    .sort((a,b)=>(b.puntos-a.puntos)||(b.partidos-a.partidos));
  res.json(result);
});

// Search
app.get("/search",(req,res)=>{ const q=String(req.query.matricula||"").toUpperCase().trim();
  if(!MAT.test(q)) return res.status(400).json({error:"Formato AAA1234"});
  const db=dbConn(); const p=db.prepare("SELECT * FROM players WHERE matricula=?").get(q);
  if(!p) return res.status(404).json({error:"No existe esa matrícula"}); res.json({ok:true,matricula:q});
});

// Health
app.get("/",(_req,res)=>res.json({ok:true,time:new Date().toISOString()}));
app.listen(process.env.PORT||8080,()=>console.log("API ON"));
