require('dotenv').config();
const express = require('express');
const cors = require('cors');
const http = require('http');
const socketIo = require('socket.io');
const jwt = require('jsonwebtoken');
const bcrypt = require('bcryptjs');
const helmet = require('helmet');
const rateLimit = require('express-rate-limit');
const { v4: uuidv4 } = require('uuid');
const Turn = require('node-turn');
const messagesRouter = require('./server/routes/messages');
const friendshipsRouter = require('./server/routes/friendships');
const authRouter = require('./server/routes/auth');
const usersRouter = require('./server/routes/users');
const db = require('./server/database/db');

const app = express();
const server = http.createServer(app);

// Güvenlik middleware'leri
app.use(helmet());
app.use(express.json({ limit: '10kb' }));

// Rate limiting
const limiter = rateLimit({
  windowMs: 15 * 60 * 1000, // 15 dakika
  max: 100 // IP başına limit
});
app.use(limiter);

// CORS yapılandırması
app.use(cors({
  origin: process.env.CLIENT_URL || 'http://localhost:3000',
  credentials: true,
  methods: ['GET', 'POST', 'PUT', 'DELETE'],
  allowedHeaders: ['Content-Type', 'Authorization']
}));

// STUN/TURN sunucu yapılandırması
const turnServer = new Turn({
  authMech: 'long-term',
  credentials: {
    username: process.env.TURN_USERNAME,
    credential: process.env.TURN_PASSWORD
  }
});

// Socket.io yapılandırması
const io = socketIo(server, {
  cors: {
    origin: process.env.CLIENT_URL || "http://localhost:3000",
    methods: ["GET", "POST"],
    credentials: true
  },
  pingTimeout: 60000,
  pingInterval: 25000,
  transports: ['websocket', 'polling'],
  allowEIO3: true,
  path: '/socket.io/',
  connectTimeout: 45000,
  reconnection: true,
  reconnectionAttempts: 5,
  reconnectionDelay: 1000
});

// Socket.io instance'ını app'e ekle
app.set('io', io);

// Socket.io olaylarını dinle
io.on('connection', (socket) => {
  console.log('Yeni bir kullanıcı bağlandı');

  // Kullanıcı kimlik doğrulama
  socket.on('authenticate', (token) => {
    try {
      const decoded = jwt.verify(token, process.env.JWT_SECRET || 'gizli-anahtar');
      socket.userId = decoded.id;
      socket.username = decoded.username;
      socket.uuid = uuidv4(); // Benzersiz UUID atama
      console.log(`Kullanıcı kimlik doğrulandı: ${decoded.username}`);
      
      // Kullanıcıyı kendi odasına katıl
      socket.join(`user_${decoded.id}`);
    } catch (error) {
      console.error('Socket kimlik doğrulama hatası:', error);
      socket.disconnect();
    }
  });

  // Bağlantı hatası durumunda
  socket.on('connect_error', (error) => {
    console.error('Socket bağlantı hatası:', error);
  });

  // Yeniden bağlanma denemesi
  socket.on('reconnect_attempt', (attemptNumber) => {
    console.log(`Yeniden bağlanma denemesi: ${attemptNumber}`);
  });

  // Yeniden bağlanma başarılı
  socket.on('reconnect', () => {
    console.log('Socket yeniden bağlandı');
    if (socket.userId) {
      socket.join(`user_${socket.userId}`);
    }
  });

  // Arama olayları
  socket.on('startCall', (data) => {
    console.log('Arama başlatıldı:', data);
    if (data.receiverId) {
      io.to(`user_${data.receiverId}`).emit('incomingCall', {
        caller: data.caller,
        timestamp: new Date().toISOString()
      });
    }
  });

  socket.on('offer', (data) => {
    console.log('Arama teklifi gönderildi:', data);
    if (data.receiverId && data.offer) {
      io.to(`user_${data.receiverId}`).emit('incomingCall', {
        caller: {
          id: socket.userId,
          username: socket.username
        },
        offer: data.offer
      });
    }
  });

  socket.on('answer', (data) => {
    console.log('Arama cevabı gönderildi:', data);
    if (data.receiverId && data.answer) {
      io.to(`user_${data.receiverId}`).emit('callAccepted', {
        answer: data.answer,
        callerId: socket.userId
      });
    }
  });

  socket.on('ice-candidate', (data) => {
    console.log('ICE adayı gönderildi:', data);
    if (data.receiverId && data.candidate) {
      io.to(`user_${data.receiverId}`).emit('ice-candidate', {
        candidate: data.candidate,
        senderId: socket.userId
      });
    }
  });

  // STUN/TURN sunucu bilgilerini gönder
  socket.on('request-turn-credentials', () => {
    const credentials = turnServer.getCredentials();
    socket.emit('turn-credentials', credentials);
  });

  // Kullanıcı katılma
  socket.on('join', (userId) => {
    if (userId) {
      socket.join(`user_${userId}`);
      console.log(`Kullanıcı odaya katıldı: ${userId}`);
    }
  });

  // Arkadaşlık isteği gönderme
  socket.on('friendRequest', (data) => {
    if (data.receiverId) {
      io.to(`user_${data.receiverId}`).emit('newFriendRequest', {
        senderId: data.senderId,
        senderUsername: data.senderUsername,
        timestamp: new Date().toISOString()
      });
      console.log(`Arkadaşlık isteği gönderildi: ${data.senderUsername} -> ${data.receiverId}`);
    }
  });

  // Arkadaşlık isteği kabul edildiğinde
  socket.on('friendRequestAccepted', (data) => {
    if (data.senderId) {
      io.to(`user_${data.senderId}`).emit('friendRequestAccepted', {
        friendId: data.friendId,
        friendUsername: data.friendUsername,
        timestamp: new Date().toISOString()
      });
      console.log(`Arkadaşlık isteği kabul edildi: ${data.friendUsername}`);
    }
  });

  // Arkadaşlık isteği reddedildiğinde
  socket.on('friendRequestRejected', (data) => {
    if (data.senderId) {
      io.to(`user_${data.senderId}`).emit('friendRequestRejected', {
        friendId: data.friendId,
        friendUsername: data.friendUsername,
        timestamp: new Date().toISOString()
      });
      console.log(`Arkadaşlık isteği reddedildi: ${data.friendUsername}`);
    }
  });

  // Bağlantı koptuğunda
  socket.on('disconnect', (reason) => {
    console.log(`Kullanıcı ayrıldı: ${reason}`);
    if (socket.userId) {
      // Kullanıcının durumunu güncelle
      db.runAsync(
        'UPDATE users SET status = ?, last_seen = datetime("now") WHERE id = ?',
        ['offline', socket.userId]
      ).catch(err => console.error('Kullanıcı durumu güncellenirken hata:', err));
    }
  });

  // Hata durumunda
  socket.on('error', (error) => {
    console.error('Socket hatası:', error);
  });

  // Mesaj gönderme olayı
  socket.on('sendMessage', (data) => {
    console.log('Mesaj gönderildi:', data);
    if (data.receiver_id) {
      io.to(`user_${data.receiver_id}`).emit('receiveMessage', data);
    }
  });

  // Mesaj okundu bildirimi
  socket.on('messageRead', (data) => {
    console.log('Mesaj okundu bildirimi:', data);
    if (data.senderId) {
      // Gönderen kullanıcıya bildir
      io.to(`user_${data.senderId}`).emit('messageRead', {
        messageId: data.messageId,
        senderId: socket.userId
      });
    }
  });

  // Mesaj okundu olarak işaretleme
  socket.on('markMessageAsRead', async (data) => {
    try {
      const { messageId, senderId } = data;
      
      // Veritabanında mesajı okundu olarak işaretle
      await db.runAsync(
        'UPDATE messages SET is_read = 1 WHERE id = ? AND receiver_id = ?',
        [messageId, socket.userId]
      );

      // Gönderen kullanıcıya bildir
      io.to(`user_${senderId}`).emit('messageRead', {
        messageId,
        senderId: socket.userId
      });

      console.log(`Mesaj okundu olarak işaretlendi: ${messageId}`);
    } catch (error) {
      console.error('Mesaj okundu işaretleme hatası:', error);
    }
  });

  // Tüm mesajlar okundu bildirimi
  socket.on('messagesRead', (data) => {
    console.log('Tüm mesajlar okundu:', data);
    // Mesajları okundu olarak işaretle
    db.runAsync(
      `UPDATE messages 
       SET is_read = 1 
       WHERE receiver_id = ? AND sender_id = ? AND is_read = 0`,
      [socket.userId, data.friendId]
    )
    .then(result => {
      // Okundu bildirimini gönderen kullanıcıya ilet
      io.to(`user_${data.friendId}`).emit('messagesRead', {
        receiverId: socket.userId,
        count: result.changes
      });
    })
    .catch(err => console.error('Mesajlar okundu olarak işaretlenirken hata:', err));
  });

  // Arama olayları
  socket.on('endCall', (data) => {
    console.log('Arama sonlandırıldı:', data);
    if (data.receiverId) {
      io.to(`user_${data.receiverId}`).emit('callEnded', {
        callerId: socket.userId
      });
    }
  });
});

// Routes
app.use('/api/auth', authRouter);
app.use('/api/users', usersRouter);
app.use('/api/friendships', friendshipsRouter);
app.use('/api/messages', messagesRouter);

// Hata yakalama middleware'i
app.use((err, req, res, next) => {
  console.error(err.stack);
  res.status(500).json({
    error: 'Sunucu hatası',
    message: process.env.NODE_ENV === 'development' ? err.message : 'Bir hata oluştu'
  });
});

// Sunucuyu başlat
const PORT = process.env.PORT || 5000;
server.listen(PORT, () => {
  console.log(`Server ${PORT} portunda çalışıyor`);
}); 