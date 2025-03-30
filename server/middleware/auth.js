const jwt = require('jsonwebtoken');
const db = require('../database/db');

module.exports = async (req, res, next) => {
  try {
    // Token'ı header'dan al
    const token = req.header('Authorization')?.replace('Bearer ', '');
    
    if (!token) {
      return res.status(401).json({ message: 'Yetkilendirme token\'ı bulunamadı' });
    }

    // Token'ı doğrula
    const decoded = jwt.verify(token, process.env.JWT_SECRET || 'gizli-anahtar');
    
    // Kullanıcıyı veritabanından kontrol et
    const user = await db.getAsync(
      'SELECT id, username, email, status, last_seen FROM users WHERE id = ?',
      [decoded.id]
    );

    if (!user) {
      return res.status(401).json({ message: 'Kullanıcı bulunamadı' });
    }
    
    // Kullanıcı bilgilerini request nesnesine ekle
    req.user = user;
    next();
  } catch (error) {
    console.error('Token doğrulama hatası:', error);
    res.status(401).json({ message: 'Geçersiz token' });
  }
}; 