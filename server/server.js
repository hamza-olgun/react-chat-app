require('dotenv').config();
const express = require('express');
const cors = require('cors');
const http = require('http');
const socketIo = require('socket.io');
const db = require('./database/db');
const authRoutes = require('./routes/auth');
const userRoutes = require('./routes/users');
const messageRoutes = require('./routes/messages');
const friendshipRoutes = require('./routes/friendships');
const jwt = require('jsonwebtoken');

const app = express();
const server = http.createServer(app);
const io = socketIo(server, {
  cors: {
    origin: "http://localhost:3000",
    methods: ["GET", "POST"],
    credentials: true
  },
  pingTimeout: 60000,
  pingInterval: 25000,
  transports: ['websocket', 'polling'],
  allowEIO3: true,
  path: '/socket.io/'
});

// Socket.io instance'ını app'e ekle
app.set('io', io);

// Middleware
app.use(cors({
  origin: 'http://localhost:3000',
  credentials: true
}));
app.use(express.json());

// Routes
app.use('/api/auth', authRoutes);
app.use('/api/users', userRoutes);
app.use('/api/messages', messageRoutes);
app.use('/api/friendships', friendshipRoutes);

// Socket.io bağlantı yönetimi
io.on('connection', async (socket) => {
  console.log('Yeni bir kullanıcı bağlandı');

  // Kullanıcı kimlik doğrulama
  socket.on('authenticate', async (token) => {
    try {
      const decoded = jwt.verify(token, process.env.JWT_SECRET || 'gizli-anahtar');
      const userId = decoded.id;

      // Kullanıcıyı kendi odasına ekle
      socket.join(`user_${userId}`);

      // Kullanıcı durumunu güncelle
      await db.runAsync(
        'UPDATE users SET status = ?, last_seen = CURRENT_TIMESTAMP WHERE id = ?',
        ['online', userId]
      );

      // Arkadaşlara durum bildirimi gönder
      const friends = await db.allAsync(
        `SELECT u.id FROM users u
         JOIN friendships f ON (
           CASE 
             WHEN f.sender_id = ? THEN f.receiver_id = u.id
             WHEN f.receiver_id = ? THEN f.sender_id = u.id
           END
         )
         WHERE (f.sender_id = ? OR f.receiver_id = ?)
         AND f.status = 'accepted'`,
        [userId, userId, userId, userId]
      );

      friends.forEach(friend => {
        io.to(`user_${friend.id}`).emit('userStatusChanged', {
          userId,
          status: 'online'
        });
      });
    } catch (error) {
      console.error('Socket kimlik doğrulama hatası:', error);
    }
  });

  // Bağlantı koptuğunda
  socket.on('disconnect', async () => {
    console.log('Bir kullanıcı ayrıldı');
  });
});

// Hata yakalama middleware'i
app.use((err, req, res, next) => {
  console.error('Sunucu hatası:', err);
  res.status(500).json({ message: 'Sunucu hatası', error: err.message });
});

// Sunucuyu başlat
const PORT = process.env.PORT || 5000;
server.listen(PORT, () => {
  console.log(`Server ${PORT} portunda çalışıyor`);
}); 