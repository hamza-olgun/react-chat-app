const sqlite3 = require('sqlite3').verbose();
const path = require('path');

const dbPath = path.resolve(__dirname, 'chat.db');
const db = new sqlite3.Database(dbPath);

// Promise tabanlı veritabanı işlemleri
db.getAsync = function (sql, params) {
  return new Promise((resolve, reject) => {
    db.get(sql, params, (err, result) => {
      if (err) reject(err);
      else resolve(result);
    });
  });
};

db.allAsync = function (sql, params) {
  return new Promise((resolve, reject) => {
    db.all(sql, params, (err, rows) => {
      if (err) reject(err);
      else resolve(rows);
    });
  });
};

db.runAsync = function (sql, params) {
  return new Promise((resolve, reject) => {
    db.run(sql, params, function (err) {
      if (err) reject(err);
      else resolve(this);
    });
  });
};

// Veritabanı tablolarını oluştur
db.serialize(() => {
  // Kullanıcılar tablosu
  db.run(`
    CREATE TABLE IF NOT EXISTS users (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      username TEXT UNIQUE NOT NULL,
      email TEXT UNIQUE NOT NULL,
      password TEXT NOT NULL,
      status TEXT DEFAULT 'offline',
      last_seen DATETIME DEFAULT CURRENT_TIMESTAMP,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
    )
  `);

  // Kullanıcılar tablosu için indeksler
  db.run('CREATE INDEX IF NOT EXISTS idx_users_username ON users(username)');
  db.run('CREATE INDEX IF NOT EXISTS idx_users_email ON users(email)');
  db.run('CREATE INDEX IF NOT EXISTS idx_users_status ON users(status)');

  // Arkadaşlıklar tablosu
  db.run(`
    CREATE TABLE IF NOT EXISTS friendships (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      sender_id INTEGER NOT NULL,
      receiver_id INTEGER NOT NULL,
      status TEXT DEFAULT 'pending',
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      updated_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      FOREIGN KEY (sender_id) REFERENCES users (id),
      FOREIGN KEY (receiver_id) REFERENCES users (id),
      UNIQUE(sender_id, receiver_id)
    )
  `);

  // Arkadaşlıklar tablosu için indeksler
  db.run('CREATE INDEX IF NOT EXISTS idx_friendships_sender ON friendships(sender_id)');
  db.run('CREATE INDEX IF NOT EXISTS idx_friendships_receiver ON friendships(receiver_id)');
  db.run('CREATE INDEX IF NOT EXISTS idx_friendships_status ON friendships(status)');

  // Mesajlar tablosu
  db.run(`
    CREATE TABLE IF NOT EXISTS messages (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      sender_id INTEGER NOT NULL,
      receiver_id INTEGER NOT NULL,
      content TEXT NOT NULL,
      is_read BOOLEAN DEFAULT 0,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      FOREIGN KEY (sender_id) REFERENCES users (id),
      FOREIGN KEY (receiver_id) REFERENCES users (id)
    )
  `);

  // Mesajlar tablosu için indeksler
  db.run('CREATE INDEX IF NOT EXISTS idx_messages_sender ON messages(sender_id)');
  db.run('CREATE INDEX IF NOT EXISTS idx_messages_receiver ON messages(receiver_id)');
  db.run('CREATE INDEX IF NOT EXISTS idx_messages_created_at ON messages(created_at)');
  db.run('CREATE INDEX IF NOT EXISTS idx_messages_is_read ON messages(is_read)');
});

console.log('Veritabanına başarıyla bağlandı');

module.exports = db; 