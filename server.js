const express = require('express');
const http = require('http');
const { Server } = require('socket.io');
const path = require('path');
const pool = require('./db');

const app = express();
const server = http.createServer(app);
const io = new Server(server);

app.use(express.json());
app.use(express.static(path.join(__dirname, 'public')));

// API: Get riders for assignment modal
app.get('/api/riders', async (req, res) => {
  try {
    const [rows] = await pool.query(
      `SELECT id, full_name, phone_number FROM users WHERE role = 'RIDER'`
    );
    res.json(rows);
  } catch (err) {
    console.error('Error fetching riders:', err.message);
    res.status(500).json({ error: 'Database error fetching riders' });
  }
});

// API: Get active delivery queue
app.get('/api/deliveries', async (req, res) => {
  try {
    const [rows] = await pool.query(
      `SELECT d.*, u.full_name as rider_name 
       FROM deliveries d 
       LEFT JOIN users u ON d.rider_id = u.id 
       ORDER BY d.created_at DESC`
    );
    res.json(rows);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// API: Get delivery audit logs
app.get('/api/deliveries/:id/logs', async (req, res) => {
  try {
    const [rows] = await pool.query(
      `SELECT l.*, u.full_name as user_name 
       FROM delivery_status_logs l
       LEFT JOIN users u ON l.changed_by_user_id = u.id
       WHERE l.delivery_id = ?
       ORDER BY l.timestamp ASC`,
      [req.params.id]
    );
    res.json(rows);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// API: Create new delivery request
app.post('/api/deliveries', async (req, res) => {
  const { customer_name, customer_phone, delivery_address, item_description } = req.body;

  if (!customer_name || !customer_phone || !delivery_address || !item_description) {
    return res.status(400).json({ error: 'All fields are required.' });
  }

  const qrCode = `TP-${Math.random().toString(36).substring(2, 8).toUpperCase()}`;

  try {
    const [result] = await pool.query(
      `INSERT INTO deliveries (retailer_id, customer_name, customer_phone, delivery_address, item_description, qr_verification_code, status)
       VALUES (1, ?, ?, ?, ?, ?, 'CREATED')`,
      [customer_name, customer_phone, delivery_address, item_description, qrCode]
    );

    const deliveryId = result.insertId;

    await pool.query(
      `INSERT INTO delivery_status_logs (delivery_id, new_status, changed_by_user_id) VALUES (?, 'CREATED', 1)`,
      [deliveryId]
    );

    const [newDelivery] = await pool.query(
      `SELECT d.*, u.full_name as rider_name FROM deliveries d LEFT JOIN users u ON d.rider_id = u.id WHERE d.id = ?`,
      [deliveryId]
    );

    io.emit('delivery:updated', newDelivery[0]);
    res.status(201).json(newDelivery[0]);
  } catch (err) {
    console.error('Error creating delivery:', err.message);
    res.status(500).json({ error: err.message });
  }
});

// API: Assign rider with MySQL row-level locking
app.post('/api/deliveries/:id/assign', async (req, res) => {
  const deliveryId = req.params.id;
  const { rider_id } = req.body;

  if (!rider_id) {
    return res.status(400).json({ error: 'Rider ID is required for assignment' });
  }

  const connection = await pool.getConnection();

  try {
    await connection.beginTransaction();

    const [lock] = await connection.query('SELECT * FROM deliveries WHERE id = ? FOR UPDATE', [deliveryId]);

    if (lock.length === 0) {
      await connection.rollback();
      return res.status(404).json({ error: 'Delivery record not found' });
    }

    if (lock[0].status !== 'CREATED') {
      await connection.rollback();
      return res.status(400).json({ error: 'Order has already been assigned or processed' });
    }

    await connection.query(
      `UPDATE deliveries SET rider_id = ?, dispatcher_id = 2, status = 'ASSIGNED' WHERE id = ?`,
      [rider_id, deliveryId]
    );

    await connection.query(
      `INSERT INTO delivery_status_logs (delivery_id, previous_status, new_status, changed_by_user_id)
       VALUES (?, 'CREATED', 'ASSIGNED', 2)`,
      [deliveryId]
    );

    await connection.commit();

    const [updated] = await pool.query(
      `SELECT d.*, u.full_name as rider_name FROM deliveries d LEFT JOIN users u ON d.rider_id = u.id WHERE d.id = ?`,
      [deliveryId]
    );

    io.emit('delivery:updated', updated[0]);
    res.json(updated[0]);
  } catch (err) {
    await connection.rollback();
    res.status(500).json({ error: err.message });
  } finally {
    connection.release();
  }
});

// API: Status updates and QR verification (Dynamic actor fix)
app.post('/api/deliveries/:id/status', async (req, res) => {
  const deliveryId = req.params.id;
  const { status, qr_code } = req.body;

  try {
    const [current] = await pool.query('SELECT * FROM deliveries WHERE id = ?', [deliveryId]);
    if (current.length === 0) return res.status(404).json({ error: 'Delivery record not found' });

    const previousStatus = current[0].status;
    const actorUserId = current[0].rider_id; // Dynamically sets the log user to assigned rider

    if (status === 'DELIVERED') {
      if (current[0].qr_verification_code !== qr_code) {
        return res.status(400).json({ error: 'Invalid verification code' });
      }
    }

    await pool.query('UPDATE deliveries SET status = ? WHERE id = ?', [status, deliveryId]);

    await pool.query(
      `INSERT INTO delivery_status_logs (delivery_id, previous_status, new_status, changed_by_user_id)
       VALUES (?, ?, ?, ?)`,
      [deliveryId, previousStatus, status, actorUserId]
    );

    const [updated] = await pool.query(
      `SELECT d.*, u.full_name as rider_name FROM deliveries d LEFT JOIN users u ON d.rider_id = u.id WHERE d.id = ?`,
      [deliveryId]
    );

    io.emit('delivery:updated', updated[0]);
    res.json(updated[0]);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

io.on('connection', (socket) => {
  console.log('TrackPulse Client Connected:', socket.id);
});

const PORT = process.env.PORT || 3000;
server.listen(PORT, () => console.log(`TrackPulse server running on http://localhost:${PORT}`));