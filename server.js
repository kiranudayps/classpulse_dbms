const express = require('express');
const path = require('path');
const mysql = require('mysql2/promise');
const cors = require('cors');

const app = express();
app.use(cors());
app.use(express.json());

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
  pool.query("SELECT UTC_TIMESTAMP() as utc, CONVERT_TZ(UTC_TIMESTAMP(), '+00:00', '+05:30') as ist, DAYNAME(CONVERT_TZ(UTC_TIMESTAMP(), '+00:00', '+05:30')) as day, TIME(CONVERT_TZ(UTC_TIMESTAMP(), '+00:00', '+05:30')) as time")
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

// LOGIN Endpoint (Simplified replacement for Supabase Auth)
app.post('/api/login', async (req, res) => {
  const { email, password } = req.body;
  try {
    const [rows] = await pool.query('SELECT * FROM users WHERE email = ? AND password = ?', [email, password]);
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
      res.status(401).json({ error: 'Invalid login credentials' });
    }
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

const PORT = process.env.PORT || 3000;

// Room status sync scheduler (Runs every 1 minute)
// Uses IST (UTC+5:30) to check current day and time against schedules
setInterval(async () => {
  try {
    // Mark rooms as occupied if there is an ongoing class
    await pool.query(`
      UPDATE classrooms c
      JOIN schedules s ON c.id = s.room_id
      SET c.status = 'occupied',
          c.current_subject = s.subject,
          c.session_start = s.start_time,
          c.session_end = s.end_time
      WHERE s.day = DAYNAME(CONVERT_TZ(UTC_TIMESTAMP(), '+00:00', '+05:30'))
      AND TIME(CONVERT_TZ(UTC_TIMESTAMP(), '+00:00', '+05:30')) BETWEEN s.start_time AND s.end_time
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
        WHERE day = DAYNAME(CONVERT_TZ(UTC_TIMESTAMP(), '+00:00', '+05:30'))
        AND TIME(CONVERT_TZ(UTC_TIMESTAMP(), '+00:00', '+05:30')) BETWEEN start_time AND end_time
      )
    `);
  } catch (err) {
    console.error('[SYNC ERROR] Failed to sync room status:', err);
  }
}, 60000);

app.listen(PORT, '0.0.0.0', () => {
  console.log(`ClassPulse running on port ${PORT}`);
});

module.exports = app;
