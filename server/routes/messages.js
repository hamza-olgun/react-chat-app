const express = require('express');
const router = express.Router();
const db = require('../database/db');
const auth = require('../middleware/auth');

// Mesaj gönder
router.post('/send', auth, async (req, res) => {
  try {
    const { receiver_id, content } = req.body;
    const sender_id = req.user.id;

    // Alıcıyı kontrol et
    const receiver = await db.getAsync(
      'SELECT id FROM users WHERE id = ?',
      [receiver_id]
    );

    if (!receiver) {
      return res.status(404).json({ message: 'Alıcı bulunamadı' });
    }

    // Mesajı kaydet
    const result = await db.runAsync(
      'INSERT INTO messages (sender_id, receiver_id, content) VALUES (?, ?, ?)',
      [sender_id, receiver_id, content]
    );

    // Mesaj bilgilerini getir
    const message = await db.getAsync(
      `SELECT m.*, u.username as sender_name 
       FROM messages m 
       JOIN users u ON m.sender_id = u.id 
       WHERE m.id = ?`,
      [result.lastID]
    );

    // Socket.io ile mesajı gönder
    req.app.get('io').to(`user_${receiver_id}`).emit('receiveMessage', {
      id: message.id,
      sender_id: message.sender_id,
      receiver_id: message.receiver_id,
      content: message.content,
      created_at: message.created_at,
      is_read: message.is_read,
      sender_name: message.sender_name
    });

    res.status(201).json(message);
  } catch (error) {
    console.error('Mesaj gönderme hatası:', error);
    res.status(500).json({ message: 'Sunucu hatası' });
  }
});

// Mesajları getir
router.get('/:userId', auth, async (req, res) => {
  try {
    const messages = await db.allAsync(
      `SELECT m.*, u.username as sender_name 
       FROM messages m 
       JOIN users u ON m.sender_id = u.id 
       WHERE (m.sender_id = ? AND m.receiver_id = ?) 
       OR (m.sender_id = ? AND m.receiver_id = ?) 
       ORDER BY m.created_at ASC`,
      [req.user.id, req.params.userId, req.params.userId, req.user.id]
    );

    // Okunmamış mesajları okundu olarak işaretle
    await db.runAsync(
      `UPDATE messages 
       SET is_read = 1 
       WHERE receiver_id = ? AND sender_id = ? AND is_read = 0`,
      [req.user.id, req.params.userId]
    );

    res.json(messages);
  } catch (error) {
    console.error('Mesaj getirme hatası:', error);
    res.status(500).json({ message: 'Sunucu hatası' });
  }
});

// Okunmamış mesaj sayısını getir
router.get('/unread/count', auth, async (req, res) => {
  try {
    const result = await db.getAsync(
      'SELECT COUNT(*) as count FROM messages WHERE receiver_id = ? AND is_read = 0',
      [req.user.id]
    );

    res.json({ count: result.count });
  } catch (error) {
    console.error('Okunmamış mesaj sayısı hatası:', error);
    res.status(500).json({ message: 'Sunucu hatası' });
  }
});

// Mesajı okundu olarak işaretle
router.put('/:messageId/read', auth, async (req, res) => {
  try {
    const result = await db.runAsync(
      'UPDATE messages SET is_read = 1 WHERE id = ? AND receiver_id = ?',
      [req.params.messageId, req.user.id]
    );

    if (result.changes === 0) {
      return res.status(404).json({ message: 'Mesaj bulunamadı' });
    }

    res.json({ message: 'Mesaj okundu olarak işaretlendi' });
  } catch (error) {
    console.error('Mesaj okundu işaretleme hatası:', error);
    res.status(500).json({ message: 'Sunucu hatası' });
  }
});

module.exports = router; 