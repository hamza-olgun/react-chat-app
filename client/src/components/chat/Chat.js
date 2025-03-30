import React, { useState, useEffect, useRef, useCallback } from 'react';
import {
  Box,
  Paper,
  TextField,
  Button,
  List,
  ListItem,
  Typography,
  IconButton,
  Grid,
  Avatar,
  ListItemAvatar,
  ListItemText,
  Divider,
  Badge,
} from '@mui/material';
import SendIcon from '@mui/icons-material/Send';
import { Check, CheckCircle, Call } from '@mui/icons-material';
import io from 'socket.io-client';
import axios from 'axios';
import VoiceCall from './VoiceCall';
import FriendList from '../friends/FriendList';
import { useAuth } from '../../contexts/AuthContext';
import { format } from 'date-fns';
import { tr } from 'date-fns/locale';

const Chat = () => {
  const [messages, setMessages] = useState([]);
  const [newMessage, setNewMessage] = useState('');
  const [isCallOpen, setIsCallOpen] = useState(false);
  const [callData, setCallData] = useState(null);
  const messagesEndRef = useRef(null);
  const socketRef = useRef(null);
  const [selectedFriend, setSelectedFriend] = useState(null);
  const { user: currentUser } = useAuth();

  const fetchUnreadCount = useCallback(async () => {
    try {
      const response = await axios.get('http://localhost:5000/api/messages/unread/count', {
        headers: { Authorization: `Bearer ${localStorage.getItem('token')}` }
      });
      console.log('Okunmamış mesaj sayısı:', response.data.count);
    } catch (error) {
      console.error('Okunmamış mesaj sayısı alınamadı:', error);
    }
  }, []);

  const fetchMessages = useCallback(async () => {
    if (!selectedFriend) return;
    
    try {
      const response = await axios.get(`http://localhost:5000/api/messages/${selectedFriend.id}`, {
        headers: { Authorization: `Bearer ${localStorage.getItem('token')}` }
      });
      setMessages(response.data);
      fetchUnreadCount();
    } catch (error) {
      console.error('Mesajlar yüklenirken hata:', error);
    }
  }, [selectedFriend, fetchUnreadCount]);

  // Kullanıcı bilgilerini al
  useEffect(() => {
    if (!currentUser) {
      // Kullanıcı oturumu yoksa yönlendir
      window.location.href = '/login';
    }
  }, [currentUser]);

  // Arama başlat
  const startCall = () => {
    if (!selectedFriend) return;
    
    setCallData({
      caller: currentUser,
      receiver: selectedFriend,
      isIncoming: false
    });
    setIsCallOpen(true);

    // Socket.IO üzerinden arama başlatma sinyali gönder
    socketRef.current.emit('startCall', {
      receiverId: selectedFriend.id,
      caller: {
        id: currentUser.id,
        username: currentUser.username
      }
    });
  };

  // Socket.IO bağlantısını kur
  useEffect(() => {
    if (!socketRef.current && currentUser) {
      socketRef.current = io('http://localhost:5000', {
        transports: ['websocket'],
        reconnection: true,
        reconnectionAttempts: 5,
        reconnectionDelay: 1000,
        withCredentials: true,
        path: '/socket.io/',
        forceNew: true,
        timeout: 10000
      });

      // Kullanıcı katıldığında
      socketRef.current.on('connect', () => {
        console.log('Socket.io bağlantısı kuruldu');
        const token = localStorage.getItem('token');
        if (token) {
          socketRef.current.emit('authenticate', token);
        }
      });

      // Bağlantı hatası
      socketRef.current.on('connect_error', (error) => {
        console.error('Socket.io bağlantı hatası:', error);
      });

      // Mesaj alındığında
      socketRef.current.on('receiveMessage', (message) => {
        console.log('Yeni mesaj alındı:', message);
        if (selectedFriend && (message.sender_id === selectedFriend.id || message.receiver_id === selectedFriend.id)) {
          setMessages(prev => {
            const messageExists = prev.some(msg => msg.id === message.id);
            if (messageExists) {
              return prev.map(msg => msg.id === message.id ? message : msg);
            }
            return [...prev, message];
          });
        }
      });

      // Mesaj okundu bildirimi
      socketRef.current.on('messageRead', (data) => {
        if (selectedFriend && data.senderId === selectedFriend.id) {
          setMessages(prev => prev.map(msg => 
            msg.id === data.messageId ? { ...msg, is_read: 1 } : msg
          ));
        }
      });

      // Arama olayları
      socketRef.current.on('incomingCall', (data) => {
        console.log('Gelen arama:', data);
        if (data && data.caller && data.offer) {
          setCallData({
            caller: data.caller,
            receiver: currentUser,
            isIncoming: true,
            offer: data.offer
          });
          setIsCallOpen(true);
        }
      });

      socketRef.current.on('callAccepted', async (data) => {
        console.log('Arama kabul edildi:', data);
        try {
          const peerConnection = new RTCPeerConnection({
            iceServers: [{ urls: 'stun:stun.l.google.com:19302' }],
          });

          await peerConnection.setRemoteDescription(new RTCSessionDescription(data.answer));
          const answer = await peerConnection.createAnswer();
          await peerConnection.setLocalDescription(answer);

          socketRef.current.emit('answer', {
            answer,
            receiverId: data.callerId,
          });
        } catch (error) {
          console.error('Arama kabul hatası:', error);
        }
      });

      socketRef.current.on('callRejected', () => {
        console.log('Arama reddedildi');
        setIsCallOpen(false);
        setCallData(null);
      });

      socketRef.current.on('callEnded', () => {
        console.log('Arama sonlandırıldı');
        setIsCallOpen(false);
        setCallData(null);
      });

      socketRef.current.on('disconnect', (reason) => {
        console.log('Socket.io bağlantısı kesildi:', reason);
      });

      socketRef.current.on('error', (error) => {
        console.error('Socket.io hatası:', error);
      });
    }

    return () => {
      if (socketRef.current) {
        socketRef.current.disconnect();
        socketRef.current = null;
      }
    };
  }, [currentUser, selectedFriend]);

  // Mesajları getir
  useEffect(() => {
    fetchMessages();
  }, [fetchMessages]);

  // Otomatik kaydırma
  useEffect(() => {
    scrollToBottom();
  }, [messages]);

  // Mesaj okundu olarak işaretle
  const markMessageAsRead = useCallback(async (messageId) => {
    try {
      // Socket.IO üzerinden okundu bildirimi gönder
      socketRef.current.emit('markMessageAsRead', {
        messageId,
        senderId: selectedFriend?.id
      });

      // Yerel state'i güncelle
      setMessages(prev => prev.map(msg => 
        msg.id === messageId ? { ...msg, is_read: 1 } : msg
      ));

      // API'ye bildir
      await axios.post(
        `http://localhost:5000/api/messages/${messageId}/read`,
        {},
        {
          headers: { Authorization: `Bearer ${localStorage.getItem('token')}` }
        }
      );

    } catch (error) {
      console.error('Mesaj okundu olarak işaretlenirken hata:', error);
    }
  }, [selectedFriend]);

  // Mesajları görüntülerken okundu olarak işaretle
  useEffect(() => {
    if (selectedFriend && messages.length > 0) {
      const unreadMessages = messages.filter(
        msg => !msg.is_read && msg.sender_id === selectedFriend.id
      );

      // Tüm okunmamış mesajları toplu olarak işaretle
      if (unreadMessages.length > 0) {
        unreadMessages.forEach(msg => {
          markMessageAsRead(msg.id);
        });
      }
    }
  }, [selectedFriend, messages, markMessageAsRead]);

  // Mesaj gönderme işlemi
  const handleSendMessage = async () => {
    if (!newMessage.trim() || !selectedFriend) return;

    try {
      // Mesajı hemen UI'a ekle
      const tempMessage = {
        id: Date.now(), // Geçici ID
        sender_id: currentUser.id,
        receiver_id: selectedFriend.id,
        content: newMessage,
        created_at: new Date().toISOString(),
        is_read: 0,
        sender_name: currentUser.username
      };

      setMessages(prev => [...prev, tempMessage]);
      setNewMessage('');

      // Sunucuya mesajı gönder
      const response = await axios.post(
        'http://localhost:5000/api/messages/send',
        {
          receiver_id: selectedFriend.id,
          content: newMessage
        },
        {
          headers: { Authorization: `Bearer ${localStorage.getItem('token')}` }
        }
      );

      // Geçici mesajı gerçek mesajla değiştir
      setMessages(prev => prev.map(msg => 
        msg.id === tempMessage.id ? response.data : msg
      ));

      // Socket.IO üzerinden mesajı gönder
      socketRef.current.emit('sendMessage', response.data);

    } catch (error) {
      console.error('Mesaj gönderilirken hata:', error);
      // Hata durumunda geçici mesajı kaldır
      setMessages(prev => prev.filter(msg => msg.id !== Date.now()));
    }
  };

  const scrollToBottom = () => {
    messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
  };

  return (
    <Grid container spacing={2} style={{ height: '100vh' }}>
      <Grid item xs={3}>
        <Paper style={{ height: '100%', overflow: 'auto' }}>
          <FriendList onSelectFriend={setSelectedFriend} />
        </Paper>
      </Grid>
      <Grid item xs={9}>
        <Paper style={{ height: '100%', display: 'flex', flexDirection: 'column' }}>
          {selectedFriend ? (
            <>
              <Box p={2} borderBottom={1} borderColor="divider">
                <Typography variant="h6">
                  {selectedFriend.username}
                </Typography>
              </Box>
              <Box flex={1} overflow="auto" p={2}>
                <List>
                  {messages.map((message) => (
                    <ListItem
                      key={message.id}
                      style={{
                        justifyContent: message.sender_id === currentUser?.id ? 'flex-end' : 'flex-start'
                      }}
                    >
                      <Box
                        maxWidth="70%"
                        bgcolor={message.sender_id === currentUser?.id ? 'primary.main' : 'grey.200'}
                        color={message.sender_id === currentUser?.id ? 'white' : 'text.primary'}
                        borderRadius={2}
                        p={1}
                        position="relative"
                      >
                        <Typography variant="body1">{message.content}</Typography>
                        <Typography variant="caption" style={{ opacity: 0.7 }}>
                          {new Date(message.created_at).toLocaleTimeString()}
                        </Typography>
                        {message.sender_id === currentUser?.id && (
                          <IconButton
                            size="small"
                            style={{
                              position: 'absolute',
                              right: -8,
                              bottom: -8,
                              backgroundColor: 'white',
                              boxShadow: '0 2px 4px rgba(0,0,0,0.1)'
                            }}
                          >
                            {message.is_read ? (
                              <CheckCircle color="primary" fontSize="small" />
                            ) : (
                              <Check fontSize="small" />
                            )}
                          </IconButton>
                        )}
                      </Box>
                    </ListItem>
                  ))}
                  <div ref={messagesEndRef} />
                </List>
              </Box>
              <Box p={2} borderTop={1} borderColor="divider">
                <Grid container spacing={1}>
                  <Grid item xs>
                    <TextField
                      fullWidth
                      variant="outlined"
                      placeholder="Mesajınızı yazın..."
                      value={newMessage}
                      onChange={(e) => setNewMessage(e.target.value)}
                      onKeyPress={(e) => e.key === 'Enter' && handleSendMessage()}
                    />
                  </Grid>
                  <Grid item>
                    <IconButton
                      color="primary"
                      onClick={handleSendMessage}
                      disabled={!newMessage.trim()}
                    >
                      <SendIcon />
                    </IconButton>
                  </Grid>
                </Grid>
              </Box>
            </>
          ) : (
            <Box
              display="flex"
              alignItems="center"
              justifyContent="center"
              height="100%"
            >
              <Typography variant="h6" color="textSecondary">
                Sohbet etmek için bir arkadaş seçin
              </Typography>
            </Box>
          )}
        </Paper>
      </Grid>
      {/* Arama butonu */}
      {selectedFriend && (
        <IconButton
          color="primary"
          onClick={startCall}
          sx={{ position: 'absolute', top: 10, right: 10 }}
        >
          <Call />
        </IconButton>
      )}
      {/* Sesli görüşme bileşeni */}
      <VoiceCall
        open={isCallOpen}
        onClose={() => {
          setIsCallOpen(false);
          setCallData(null);
        }}
        callData={callData}
        socket={socketRef.current}
      />
    </Grid>
  );
};

export default Chat; 