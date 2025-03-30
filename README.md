# Gerçek Zamanlı Mesajlaşma ve Sesli Görüşme Uygulaması

Bu proje, gerçek zamanlı mesajlaşma ve sesli görüşme özelliklerine sahip modern bir web uygulamasıdır.

## Özellikler

- Kullanıcı kimlik doğrulama ve yetkilendirme
- Gerçek zamanlı mesajlaşma
- Sesli görüşme
- Güvenli veri iletişimi
- Responsive tasarım

## Teknolojiler

- Backend: Node.js + Express.js
- Frontend: React.js
- Veritabanı: MySQL
- WebSocket: Socket.io
- WebRTC

## Kurulum

1. Projeyi klonlayın
2. Backend için:
   ```bash
   npm install
   ```
3. Frontend için:
   ```bash
   cd client
   npm install
   ```
4. `.env` dosyasını oluşturun ve gerekli değişkenleri ayarlayın
5. Veritabanını oluşturun
6. Uygulamayı başlatın:
   ```bash
   npm run dev:full
   ```

## Proje Yapısı

```
├── client/                 # React frontend uygulaması
├── server/                 # Node.js backend uygulaması
│   ├── config/            # Veritabanı ve diğer yapılandırmalar
│   ├── controllers/       # Route kontrolcüleri
│   ├── middleware/        # Ara yazılımlar
│   ├── models/           # Veritabanı modelleri
│   ├── routes/           # API rotaları
│   └── utils/            # Yardımcı fonksiyonlar
├── .env                   # Ortam değişkenleri
└── package.json          # Proje bağımlılıkları
``` 