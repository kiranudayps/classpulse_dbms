const express = require('express');
const path = require('path');
const mysql = require('mysql2/promise');
const cors = require('cors');

const app = express();
app.use(cors());
app.use(express.json());

const useUTC = process.env.DB_UTC === 'true';
const dayExpr = useUTC ? "DAYNAME(CONVERT_TZ(UTC_TIMESTAMP(), '+00:00', '+05:30'))" : "DAYNAME(NOW())";
const timeExpr = useUTC ? "TIME(CONVERT_TZ(UTC_TIMESTAMP(), '+00:00', '+05:30'))" : "TIME(NOW())";

// Serve the frontend static HTML files
app.use(express.static(path.join(__dirname)));
app.use('/pages', express.static(path.join(__dirname, 'pages')));
app.use('/js', express.static(path.join(__dirname, 'js')));

// Serve index.html on root
app.get('/', (req, res) => {
  res.sendFile(path.join(__dirname, 'index.html'));
});

// MySQL connection pool
const pool = mysql.createPool({
  host: process.env.DB_HOST || 'localhost',
  port: parseInt(process.env.DB_PORT) || 3306,
  user: process.env.DB_USER || 'root',
  password: process.env.DB_PASSWORD || '',
  database: process.env.DB_NAME || 'nie_classpulse',
  waitForConnections: true,
  connectionLimit: 10,
  queueLimit: 0
});

// GET /api/rooms - Get all rooms
app.get('/api/rooms', async (req, res) => {
  try {
    const [rows] = await pool.query('SELECT * FROM classrooms ORDER BY room_number');
    res.json(rows);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// GET /api/room/:id - Get a specific room
app.get('/api/room/:id', async (req, res) => {
  try {
    const [rows] = await pool.query('SELECT * FROM classrooms WHERE id = ?', [req.params.id]);
    if (rows.length === 0) return res.status(404).json({ error: 'Room not found' });
    res.json(rows[0]);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// GET /api/room/:id/schedule - Get room schedules
app.get('/api/room/:id/schedule', async (req, res) => {
  try {
    const [rows] = await pool.query('CALL sp_room_schedule(?)', [req.params.id]);
    // Stored procedures return arrays of results, so we get rows[0]
    res.json(rows[0]);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// GET /api/stats - Get room stats
app.get('/api/stats', async (req, res) => {
  try {
    const [rows] = await pool.query('SELECT status FROM classrooms');
    const total = rows.length;
    const vacant = rows.filter(r => r.status === 'vacant').length;
    const occupied = rows.filter(r => r.status === 'occupied').length;
    res.json({ total, vacant, occupied });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// GET /api/health - Check DB connection
app.get('/api/health', async (req, res) => {
  try {
    await pool.query('SELECT 1');
    res.json({ status: 'ok', db: 'connected' });
  } catch (err) {
    console.error('[HEALTH CHECK FAILED]', err);
    res.status(500).json({ status: 'error', db: err.message });
  }
});

// GET /api/time - Test timezone conversion
app.get('/api/time', (req, res) => {
  pool.query(`SELECT ${useUTC ? 'UTC_TIMESTAMP()' : 'NOW()'} as utc, ${dayExpr} as day, ${timeExpr} as time`)
  .then(([rows]) => res.json(rows[0]))
  .catch(err => res.status(500).json({error: err.message}));
});

// PATCH /api/room/:id/status - Update room status
app.patch('/api/room/:id/status', async (req, res) => {
  const { status, sessionInfo, userId, userName } = req.body;
  
  let current_subject = null;
  let current_faculty = null;
  let session_start = null;
  let session_end = null;

  if (status === 'occupied' && sessionInfo) {
    current_subject = sessionInfo.subject || null;
    current_faculty = sessionInfo.faculty || null;
    session_start = sessionInfo.start ? sessionInfo.start + ':00' : null;
    
    if (sessionInfo.end && sessionInfo.end.length >= 4) {
      session_end = sessionInfo.end + ':00';
    } else if (sessionInfo.start && sessionInfo.start.length >= 4) {
      const [h, m] = sessionInfo.start.split(':').map(Number);
      const endH = String((h + 1) % 24).padStart(2, '0');
      const endM = String(m).padStart(2, '0');
      session_end = `${endH}:${endM}:00`;
    } else {
      const now = new Date();
      const utcMs = now.getTime() + (now.getTimezoneOffset() * 60 * 1000);
      const ist = new Date(utcMs + (5.5 * 60 * 60 * 1000) + (60 * 60 * 1000));
      session_end = `${String(ist.getHours()).padStart(2, '0')}:${String(ist.getMinutes()).padStart(2, '0')}:00`;
    }
  }

  try {
    await pool.query(
      `UPDATE classrooms SET status=?, current_subject=?, current_faculty=?, session_start=?, session_end=? WHERE id=?`,
      [status, current_subject, current_faculty, session_start, session_end, req.params.id]
    );

    res.json({ success: true });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: err.message });
  }
});

// LOGIN Endpoint (Universal Password Logic)
app.post('/api/login', async (req, res) => {
  const { email, password } = req.body;
  const UNIVERSAL_PASSWORD = 'password123';

  console.log(`[LOGIN ATTEMPT] Email: ${email}, Password: ${password}`);

  if (password === UNIVERSAL_PASSWORD) {
    try {
      // Try to find the user in the database first
      const [rows] = await pool.query('SELECT * FROM users WHERE email = ?', [email]);
      console.log(`[DB SUCCESS] Found ${rows.length} users for this email.`);
      
      if (rows.length > 0) {
        const user = rows[0];
        res.json({
          user: {
            id: user.id,
            email: user.email,
            role: user.role,
            full_name: user.full_name
          }
        });
      } else {
        // If email doesn't exist in DB, allow login with a default teacher role
        res.json({
          user: {
            id: Date.now(),
            email: email,
            role: 'teacher',
            full_name: email.split('@')[0].toUpperCase()
          }
        });
      }
    } catch (err) {
      res.status(500).json({ error: err.message });
    }
  } else {
    res.status(401).json({ error: 'Invalid password' });
  }
});

const PORT = process.env.PORT || 3000;

// Room status sync function
async function syncRoomStatus() {
  try {
    const useUTC = process.env.DB_UTC === 'true';
    const dayExpr = useUTC 
      ? "DAYNAME(CONVERT_TZ(UTC_TIMESTAMP(), '+00:00', '+05:30'))"
      : "DAYNAME(NOW())";
    const timeExpr = useUTC
      ? "TIME(CONVERT_TZ(UTC_TIMESTAMP(), '+00:00', '+05:30'))"
      : "TIME(NOW())";

    // Mark rooms as occupied if there is an ongoing class (excluding standalone LAB sessions)
    await pool.query(`
      UPDATE classrooms c
      JOIN schedules s ON c.id = s.room_id
      SET c.status = 'occupied',
          c.current_subject = s.subject,
          c.session_start = s.start_time,
          c.session_end = s.end_time
      WHERE s.day = ${dayExpr}
      AND ${timeExpr} BETWEEN s.start_time AND s.end_time
      AND s.subject NOT REGEXP '\\\\bLAB\\\\b'
    `);

    // Mark rooms as vacant if there is no ongoing class
    await pool.query(`
      UPDATE classrooms
      SET status = 'vacant',
          current_subject = NULL,
          session_start = NULL,
          session_end = NULL
      WHERE id NOT IN (
        SELECT room_id FROM schedules
        WHERE day = ${dayExpr}
        AND ${timeExpr} BETWEEN start_time AND end_time
        AND subject NOT REGEXP '\\\\bLAB\\\\b'
      )
    `);
    console.log(`[SYNC] Room status updated at ${new Date().toLocaleTimeString()}`);
  } catch (err) {
    console.error('[SYNC ERROR] Failed to sync room status:', err);
  }
}

// Room status sync scheduler (Runs every 1 minute)
setInterval(syncRoomStatus, 60000);

app.listen(PORT, '0.0.0.0', () => {
  console.log(`ClassPulse running on port ${PORT}`);
});

// Run sync immediately on startup
setTimeout(() => syncRoomStatus(), 3000);

module.exports = app;
