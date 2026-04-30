const express = require('express');
const mysql = require('mysql2/promise');
const cors = require('cors');

const app = express();
app.use(cors());
app.use(express.json());

// MySQL connection pool
const pool = mysql.createPool({
  host: process.env.DB_HOST || 'localhost',
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

module.exports = app;
