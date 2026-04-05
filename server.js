const express = require('express');
const cors = require('cors');
const path = require('path');
const fs = require('fs');
const initSqlJs = require('sql.js');

const app = express();
const PORT = 3000;
const DB_PATH = path.join(__dirname, 'db', 'hotel.db');

app.use(cors());
app.use(express.json());
app.use(express.static(path.join(__dirname, 'public')));

let db;

async function initDB() {
  const SQL = await initSqlJs();

  if (fs.existsSync(DB_PATH)) {
    const fileBuffer = fs.readFileSync(DB_PATH);
    db = new SQL.Database(fileBuffer);
  } else {
    db = new SQL.Database();
  }

  db.run(`
    CREATE TABLE IF NOT EXISTS rooms (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      room_number TEXT UNIQUE NOT NULL,
      floor INTEGER NOT NULL,
      type TEXT DEFAULT 'standard',
      active INTEGER DEFAULT 1
    )
  `);

  db.run(`
    CREATE TABLE IF NOT EXISTS bookings (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      room_id INTEGER NOT NULL,
      guest_name TEXT NOT NULL,
      check_in TEXT NOT NULL,
      check_out TEXT NOT NULL,
      notes TEXT DEFAULT '',
      created_at TEXT DEFAULT (datetime('now')),
      FOREIGN KEY (room_id) REFERENCES rooms(id)
    )
  `);

  // Seed default rooms if empty
  const roomCount = db.exec("SELECT COUNT(*) as c FROM rooms")[0].values[0][0];
  if (roomCount === 0) {
    const defaultRooms = [
      // Floor 1
      ['103', 1], ['104', 1],
      // Floor 2
      ['201', 2], ['202', 2], ['203', 2], ['204', 2], ['205', 2],
      ['206', 2], ['207', 2], ['208', 2], ['209', 2], ['210', 2], ['211', 2],
      // Floor 3
      ['301', 3], ['302', 3], ['303', 3], ['304', 3], ['305', 3],
      ['306', 3], ['307', 3], ['308', 3], ['309', 3], ['310', 3], ['311', 3],
    ];
    const stmt = db.prepare("INSERT INTO rooms (room_number, floor) VALUES (?, ?)");
    for (const [num, floor] of defaultRooms) {
      stmt.run([num, floor]);
    }
    stmt.free();
  }

  saveDB();
}

function saveDB() {
  const data = db.export();
  fs.writeFileSync(DB_PATH, Buffer.from(data));
}

function queryAll(sql, params = []) {
  try {
    const stmt = db.prepare(sql);
    stmt.bind(params);
    const rows = [];
    while (stmt.step()) rows.push(stmt.getAsObject());
    stmt.free();
    return rows;
  } catch (e) {
    return [];
  }
}

function queryRun(sql, params = []) {
  db.run(sql, params);
  saveDB();
  return db.getRowsModified();
}

// ─── ROOMS ───────────────────────────────────────────────────────────────────

app.get('/api/rooms', (req, res) => {
  const rooms = queryAll("SELECT * FROM rooms WHERE active=1 ORDER BY floor, room_number");
  res.json(rooms);
});

app.post('/api/rooms', (req, res) => {
  const { room_number, floor, type } = req.body;
  if (!room_number || !floor) return res.status(400).json({ error: 'room_number and floor required' });
  try {
    db.run("INSERT INTO rooms (room_number, floor, type) VALUES (?, ?, ?)",
      [room_number.trim(), parseInt(floor), type || 'standard']);
    saveDB();
    const room = queryAll("SELECT * FROM rooms WHERE room_number=?", [room_number.trim()]);
    res.json(room[0]);
  } catch (e) {
    res.status(400).json({ error: 'Room number already exists' });
  }
});

app.delete('/api/rooms/:id', (req, res) => {
  queryRun("UPDATE rooms SET active=0 WHERE id=?", [req.params.id]);
  res.json({ ok: true });
});

// ─── BOOKINGS ─────────────────────────────────────────────────────────────────

app.get('/api/bookings', (req, res) => {
  const { start, end } = req.query;
  let sql = `
    SELECT b.*, r.room_number, r.floor
    FROM bookings b
    JOIN rooms r ON b.room_id = r.id
    WHERE r.active=1
  `;
  const params = [];
  if (start && end) {
    sql += ` AND b.check_out > ? AND b.check_in < ?`;
    params.push(start, end);
  }
  sql += ' ORDER BY b.check_in';
  res.json(queryAll(sql, params));
});

app.post('/api/bookings', (req, res) => {
  const { room_id, guest_name, check_in, check_out, notes } = req.body;
  if (!room_id || !guest_name || !check_in || !check_out)
    return res.status(400).json({ error: 'Missing required fields' });
  if (check_in >= check_out)
    return res.status(400).json({ error: 'Check-out must be after check-in' });

  // Conflict check
  const conflicts = queryAll(`
    SELECT id FROM bookings
    WHERE room_id=? AND check_out > ? AND check_in < ?
  `, [room_id, check_in, check_out]);
  if (conflicts.length > 0)
    return res.status(409).json({ error: 'Room already booked for those dates' });

  db.run("INSERT INTO bookings (room_id, guest_name, check_in, check_out, notes) VALUES (?,?,?,?,?)",
    [room_id, guest_name.trim(), check_in, check_out, notes || '']);
  saveDB();
  const id = queryAll("SELECT last_insert_rowid() as id")[0].id;
  const booking = queryAll("SELECT b.*, r.room_number, r.floor FROM bookings b JOIN rooms r ON b.room_id=r.id WHERE b.id=?", [id]);
  res.json(booking[0]);
});

app.put('/api/bookings/:id', (req, res) => {
  const { guest_name, check_in, check_out, notes, room_id } = req.body;
  const { id } = req.params;
  if (check_in >= check_out)
    return res.status(400).json({ error: 'Check-out must be after check-in' });

  const conflicts = queryAll(`
    SELECT id FROM bookings
    WHERE room_id=? AND check_out > ? AND check_in < ? AND id != ?
  `, [room_id, check_in, check_out, id]);
  if (conflicts.length > 0)
    return res.status(409).json({ error: 'Room already booked for those dates' });

  db.run("UPDATE bookings SET guest_name=?, check_in=?, check_out=?, notes=?, room_id=? WHERE id=?",
    [guest_name.trim(), check_in, check_out, notes || '', room_id, id]);
  saveDB();
  const booking = queryAll("SELECT b.*, r.room_number, r.floor FROM bookings b JOIN rooms r ON b.room_id=r.id WHERE b.id=?", [id]);
  res.json(booking[0]);
});

app.delete('/api/bookings/:id', (req, res) => {
  queryRun("DELETE FROM bookings WHERE id=?", [req.params.id]);
  res.json({ ok: true });
});

// ─── AVAILABILITY ──────────────────────────────────────────────────────────────

app.get('/api/availability', (req, res) => {
  const { check_in, check_out } = req.query;
  if (!check_in || !check_out) return res.status(400).json({ error: 'Dates required' });

  const booked = queryAll(`
    SELECT DISTINCT room_id FROM bookings
    WHERE check_out > ? AND check_in < ?
  `, [check_in, check_out]);
  const bookedIds = booked.map(b => b.room_id);

  const rooms = queryAll("SELECT * FROM rooms WHERE active=1 ORDER BY floor, room_number");
  const available = rooms.map(r => ({ ...r, available: !bookedIds.includes(r.id) }));
  res.json(available);
});

// ─── DASHBOARD STATS ───────────────────────────────────────────────────────────

app.get('/api/stats', (req, res) => {
  const today = new Date().toISOString().split('T')[0];
  const totalRooms = queryAll("SELECT COUNT(*) as c FROM rooms WHERE active=1")[0].c;
  const occupied = queryAll("SELECT COUNT(DISTINCT room_id) as c FROM bookings WHERE check_in <= ? AND check_out > ?", [today, today])[0].c;
  const checkinsToday = queryAll("SELECT COUNT(*) as c FROM bookings WHERE check_in=?", [today])[0].c;
  const checkoutsToday = queryAll("SELECT COUNT(*) as c FROM bookings WHERE check_out=?", [today])[0].c;
  const upcoming = queryAll(`
    SELECT b.*, r.room_number FROM bookings b
    JOIN rooms r ON b.room_id=r.id
    WHERE b.check_in >= ? ORDER BY b.check_in LIMIT 5
  `, [today]);

  res.json({ totalRooms, occupied, available: totalRooms - occupied, checkinsToday, checkoutsToday, upcoming });
});

app.listen(PORT, () => {
  console.log(`\n🏨 Hotel Scheduler running at http://localhost:${PORT}\n`);
});

initDB().catch(console.error);
