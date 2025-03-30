const express = require('express');
const router = express.Router();
const db = require('../config/db');
const auth = require('../middleware/auth');

// Kullanıcı arama
router.get('/users', auth, (req, res) => {
  const searchTerm = req.query.q;
  const currentUserId = req.user.userId;

  db.all(
    `SELECT id, username, email 
     FROM users 
     WHERE (username LIKE ? OR email LIKE ?) 
     AND id != ?`,
    [`%${searchTerm}%`, `%${searchTerm}%`, currentUserId],
    (err, users) => {
      if (err) {
        return res.status(500).json({ message: 'Sunucu hatası', error: err.message });
      }
      res.json(users);
    }
  );
});

module.exports = router; 