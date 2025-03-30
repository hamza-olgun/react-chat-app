const express = require('express');
const router = express.Router();
const db = require('../database/db');
const auth = require('../middleware/auth');

// Kullanıcı arama
router.get('/search', auth, async (req, res) => {
  try {
    const { username } = req.query;
    const currentUserId = req.user.id;

    if (!username) {
      return res.status(400).json({ error: 'Kullanıcı adı gereklidir' });
    }

    const user = await db.getAsync(
      'SELECT id, username, email FROM users WHERE username = ? AND id != ?',
      [username, currentUserId]
    );

    if (!user) {
      return res.status(404).json({ error: 'Kullanıcı bulunamadı' });
    }

    res.json(user);
  } catch (error) {
    console.error('Kullanıcı arama hatası:', error);
    res.status(500).json({ error: 'Sunucu hatası' });
  }
});

// Tüm kullanıcıları getir (arkadaş olmayanlar)
router.get('/all', auth, async (req, res) => {
  try {
    const currentUserId = req.user.id;

    const users = await db.allAsync(
      `SELECT u.id, u.username, u.email
       FROM users u
       WHERE u.id != ?
       AND u.id NOT IN (
         SELECT CASE
           WHEN user_id = ? THEN friend_id
           WHEN friend_id = ? THEN user_id
         END
         FROM friendships
         WHERE (user_id = ? OR friend_id = ?)
       )`,
      [currentUserId, currentUserId, currentUserId, currentUserId, currentUserId]
    );

    res.json(users);
  } catch (error) {
    console.error('Kullanıcı listesi getirme hatası:', error);
    res.status(500).json({ error: 'Sunucu hatası' });
  }
});

// Kullanıcı durumunu güncelle
router.patch('/status', auth, async (req, res) => {
  try {
    await db.runAsync(
      'UPDATE users SET last_seen = CURRENT_TIMESTAMP WHERE id = ?',
      [req.user.id]
    );
    res.json({ message: 'Kullanıcı durumu güncellendi' });
  } catch (error) {
    console.error('Kullanıcı durumu güncellenirken hata:', error);
    res.status(500).json({ message: 'Sunucu hatası', error: error.message });
  }
});

module.exports = router; 