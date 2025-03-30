const express = require('express');
const router = express.Router();
const db = require('../database/db');
const auth = require('../middleware/auth');

// Arkadaşlık isteği gönder
router.post('/request/:userId', auth, async (req, res) => {
  try {
    const receiver_id = req.params.userId;
    const sender_id = req.user.id;

    // Kendine istek göndermeyi engelle
    if (sender_id === receiver_id) {
      return res.status(400).json({ message: 'Kendinize arkadaşlık isteği gönderemezsiniz' });
    }

    // Alıcıyı kontrol et
    const receiver = await db.getAsync(
      'SELECT id FROM users WHERE id = ?',
      [receiver_id]
    );

    if (!receiver) {
      return res.status(404).json({ message: 'Kullanıcı bulunamadı' });
    }

    // Mevcut istek kontrolü
    const existingRequest = await db.getAsync(
      `SELECT * FROM friendships 
       WHERE (sender_id = ? AND receiver_id = ?) 
       OR (sender_id = ? AND receiver_id = ?)`,
      [sender_id, receiver_id, receiver_id, sender_id]
    );

    if (existingRequest) {
      return res.status(400).json({ message: 'Bu kullanıcı ile zaten bir arkadaşlık isteğiniz var' });
    }

    // İsteği kaydet
    const result = await db.runAsync(
      'INSERT INTO friendships (sender_id, receiver_id, status) VALUES (?, ?, ?)',
      [sender_id, receiver_id, 'pending']
    );

    // Socket.io ile isteği gönder
    req.app.get('io').to(`user_${receiver_id}`).emit('friendRequest', {
      id: result.lastID,
      sender_id,
      receiver_id,
      status: 'pending',
      created_at: new Date()
    });

    res.status(201).json({ message: 'Arkadaşlık isteği gönderildi' });
  } catch (error) {
    console.error('Arkadaşlık isteği gönderme hatası:', error);
    res.status(500).json({ message: 'Sunucu hatası' });
  }
});

// Arkadaşlık isteğini kabul et
router.post('/accept/:requestId', auth, async (req, res) => {
  try {
    const requestId = req.params.requestId;

    // İsteği kontrol et
    const request = await db.getAsync(
      'SELECT * FROM friendships WHERE id = ? AND receiver_id = ? AND status = ?',
      [requestId, req.user.id, 'pending']
    );

    if (!request) {
      return res.status(404).json({ message: 'Arkadaşlık isteği bulunamadı' });
    }

    // İsteği güncelle
    await db.runAsync(
      'UPDATE friendships SET status = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ?',
      ['accepted', requestId]
    );

    // Socket.io ile kabul bildirimini gönder
    req.app.get('io').to(`user_${request.sender_id}`).emit('friendRequestAccepted', {
      requestId,
      receiver_id: req.user.id,
      status: 'accepted'
    });

    res.json({ message: 'Arkadaşlık isteği kabul edildi' });
  } catch (error) {
    console.error('Arkadaşlık isteği kabul hatası:', error);
    res.status(500).json({ message: 'Sunucu hatası' });
  }
});

// Arkadaşlık isteğini reddet
router.post('/reject/:requestId', auth, async (req, res) => {
  try {
    const requestId = req.params.requestId;

    // İsteği kontrol et
    const request = await db.getAsync(
      'SELECT * FROM friendships WHERE id = ? AND receiver_id = ? AND status = ?',
      [requestId, req.user.id, 'pending']
    );

    if (!request) {
      return res.status(404).json({ message: 'Arkadaşlık isteği bulunamadı' });
    }

    // İsteği reddet
    await db.runAsync(
      'UPDATE friendships SET status = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ?',
      ['rejected', requestId]
    );

    // Socket.io ile red bildirimini gönder
    req.app.get('io').to(`user_${request.sender_id}`).emit('friendRequestRejected', {
      requestId,
      receiver_id: req.user.id,
      status: 'rejected'
    });

    res.json({ message: 'Arkadaşlık isteği reddedildi' });
  } catch (error) {
    console.error('Arkadaşlık isteği reddetme hatası:', error);
    res.status(500).json({ message: 'Sunucu hatası' });
  }
});

// Arkadaş listesini getir
router.get('/list', auth, async (req, res) => {
  try {
    const friends = await db.allAsync(
      `SELECT u.id, u.username, u.status, u.last_seen, f.status as friendship_status
       FROM friendships f
       JOIN users u ON (
         CASE 
           WHEN f.sender_id = ? THEN f.receiver_id = u.id
           WHEN f.receiver_id = ? THEN f.sender_id = u.id
         END
       )
       WHERE (f.sender_id = ? OR f.receiver_id = ?)
       AND f.status = 'accepted'`,
      [req.user.id, req.user.id, req.user.id, req.user.id]
    );

    res.json(friends);
  } catch (error) {
    console.error('Arkadaş listesi getirme hatası:', error);
    res.status(500).json({ message: 'Sunucu hatası' });
  }
});

// Arkadaşlık isteklerini getir
router.get('/requests', auth, async (req, res) => {
  try {
    const requests = await db.allAsync(
      `SELECT f.*, u.username as sender_name
       FROM friendships f
       JOIN users u ON f.sender_id = u.id
       WHERE f.receiver_id = ? AND f.status = 'pending'
       ORDER BY f.created_at DESC`,
      [req.user.id]
    );

    res.json(requests);
  } catch (error) {
    console.error('Arkadaşlık istekleri getirme hatası:', error);
    res.status(500).json({ message: 'Sunucu hatası' });
  }
});

module.exports = router; 