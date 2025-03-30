const express = require('express');
const router = express.Router();
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const db = require('../database/db');
const auth = require('../middleware/auth');

// Şifre güvenlik kontrolü
const validatePassword = (password) => {
  if (password.length < 6) {
    return { isValid: false, message: 'Şifre en az 6 karakter olmalıdır' };
  }
  if (!/[A-Z]/.test(password)) {
    return { isValid: false, message: 'Şifre en az bir büyük harf içermelidir' };
  }
  if (!/[a-z]/.test(password)) {
    return { isValid: false, message: 'Şifre en az bir küçük harf içermelidir' };
  }
  if (!/[0-9]/.test(password)) {
    return { isValid: false, message: 'Şifre en az bir rakam içermelidir' };
  }
  return { isValid: true };
};

// Email formatı kontrolü
const validateEmail = (email) => {
  const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
  return emailRegex.test(email);
};

// Kayıt ol
router.post('/register', async (req, res) => {
  try {
    const { username, email, password } = req.body;

    // Gerekli alanları kontrol et
    if (!username || !email || !password) {
      return res.status(400).json({ message: 'Tüm alanları doldurun' });
    }

    // Email formatı kontrolü
    if (!validateEmail(email)) {
      return res.status(400).json({ message: 'Geçerli bir email adresi girin' });
    }

    // Şifre güvenlik kontrolü
    const passwordValidation = validatePassword(password);
    if (!passwordValidation.isValid) {
      return res.status(400).json({ message: passwordValidation.message });
    }

    // Kullanıcı adı ve email kontrolü
    const existingUser = await db.getAsync(
      'SELECT * FROM users WHERE username = ? OR email = ?',
      [username, email]
    );

    if (existingUser) {
      return res.status(400).json({ message: 'Bu kullanıcı adı veya email zaten kullanılıyor' });
    }

    // Şifreyi hashle
    const salt = await bcrypt.genSalt(10);
    const hashedPassword = await bcrypt.hash(password, salt);

    // Kullanıcıyı kaydet
    const result = await db.runAsync(
      'INSERT INTO users (username, email, password) VALUES (?, ?, ?)',
      [username, email, hashedPassword]
    );

    // JWT token oluştur
    const token = jwt.sign(
      { id: result.lastID, username },
      process.env.JWT_SECRET || 'gizli-anahtar',
      { expiresIn: '24h' }
    );

    res.status(201).json({
      message: 'Kullanıcı başarıyla kaydedildi',
      token,
      user: {
        id: result.lastID,
        username,
        email
      }
    });
  } catch (error) {
    console.error('Kayıt hatası:', error);
    res.status(500).json({ message: 'Sunucu hatası' });
  }
});

// Giriş yap
router.post('/login', async (req, res) => {
  try {
    const { username, password } = req.body;

    // Gerekli alanları kontrol et
    if (!username || !password) {
      return res.status(400).json({ message: 'Kullanıcı adı ve şifre gerekli' });
    }

    // Kullanıcıyı bul
    const user = await db.getAsync(
      'SELECT * FROM users WHERE username = ?',
      [username]
    );

    if (!user) {
      return res.status(400).json({ message: 'Kullanıcı bulunamadı' });
    }

    // Şifreyi kontrol et
    const isMatch = await bcrypt.compare(password, user.password);
    if (!isMatch) {
      return res.status(400).json({ message: 'Geçersiz şifre' });
    }

    // JWT token oluştur
    const token = jwt.sign(
      { id: user.id, username: user.username },
      process.env.JWT_SECRET || 'gizli-anahtar',
      { expiresIn: '24h' }
    );

    res.json({
      token,
      user: {
        id: user.id,
        username: user.username,
        email: user.email
      }
    });
  } catch (error) {
    console.error('Giriş hatası:', error);
    res.status(500).json({ message: 'Sunucu hatası' });
  }
});

// Kullanıcı bilgilerini getir
router.get('/me', auth, async (req, res) => {
  try {
    const user = await db.getAsync(
      'SELECT id, username, email, status, last_seen FROM users WHERE id = ?',
      [req.user.id]
    );

    if (!user) {
      return res.status(404).json({ message: 'Kullanıcı bulunamadı' });
    }

    res.json(user);
  } catch (error) {
    console.error('Kullanıcı bilgileri hatası:', error);
    res.status(500).json({ message: 'Sunucu hatası' });
  }
});

module.exports = router; 