import React, { useState, useEffect, useRef, useCallback } from 'react';
import {
  List,
  ListItem,
  ListItemText,
  ListItemAvatar,
  Avatar,
  Typography,
  Button,
  TextField,
  Dialog,
  DialogTitle,
  DialogContent,
  DialogActions,
  IconButton,
  Snackbar,
  Alert
} from '@mui/material';
import { Add as AddIcon, Person as PersonIcon } from '@mui/icons-material';
import axios from 'axios';
import io from 'socket.io-client';

const FriendList = ({ onSelectFriend }) => {
  const [friends, setFriends] = useState([]);
  const [open, setOpen] = useState(false);
  const [username, setUsername] = useState('');
  const [friendRequests, setFriendRequests] = useState([]);
  const [notification, setNotification] = useState({ open: false, message: '', severity: 'info' });
  const socketRef = useRef(null);
  const [currentUser, setCurrentUser] = useState(null);
  const [error, setError] = useState('');

  const fetchFriends = useCallback(async () => {
    try {
      const response = await axios.get('http://localhost:5000/api/friendships/list', {
        headers: { Authorization: `Bearer ${localStorage.getItem('token')}` }
      });
      setFriends(response.data);
    } catch (error) {
      console.error('Arkadaşlar yüklenirken hata:', error);
      setNotification({
        open: true,
        message: error.response?.data?.message || 'Arkadaşlar yüklenirken bir hata oluştu',
        severity: 'error'
      });
    }
  }, []);

  const fetchFriendRequests = useCallback(async () => {
    try {
      const response = await axios.get('http://localhost:5000/api/friendships/requests', {
        headers: { Authorization: `Bearer ${localStorage.getItem('token')}` }
      });
      setFriendRequests(response.data);
    } catch (error) {
      console.error('Arkadaşlık istekleri yüklenirken hata:', error);
    }
  }, []);

  // Kullanıcı bilgilerini al
  useEffect(() => {
    const token = localStorage.getItem('token');
    if (token) {
      try {
        const base64Url = token.split('.')[1];
        const base64 = base64Url.replace(/-/g, '+').replace(/_/g, '/');
        const jsonPayload = decodeURIComponent(atob(base64).split('').map(function(c) {
          return '%' + ('00' + c.charCodeAt(0).toString(16)).slice(-2);
        }).join(''));
        const userData = JSON.parse(jsonPayload);
        setCurrentUser(userData);
      } catch (error) {
        console.error('Token çözümleme hatası:', error);
        localStorage.removeItem('token');
      }
    }
  }, []);

  // İlk yüklemede arkadaşları ve istekleri getir
  useEffect(() => {
    if (currentUser?.id) {
      fetchFriends();
      fetchFriendRequests();
    }
  }, [currentUser, fetchFriends, fetchFriendRequests]);

  // Socket.IO bağlantısını kur
  useEffect(() => {
    if (!socketRef.current && currentUser?.id) {
      const token = localStorage.getItem('token');
      if (!token) {
        console.error('Token bulunamadı');
        return;
      }

      socketRef.current = io('http://localhost:5000', {
        transports: ['websocket', 'polling'],
        reconnection: true,
        reconnectionAttempts: 5,
        reconnectionDelay: 1000,
        withCredentials: true,
        auth: { token }
      });

      // Socket event listeners
      const handleFriendRequest = (request) => {
        console.log('Arkadaşlık isteği alındı:', request);
        setFriendRequests(prev => [...prev, request]);
        setNotification({
          open: true,
          message: `${request.senderUsername} size arkadaşlık isteği gönderdi`,
          severity: 'info'
        });
      };

      const handleFriendRequestAccepted = (data) => {
        console.log('Arkadaşlık isteği kabul edildi:', data);
        setNotification({
          open: true,
          message: `${data.friendUsername} arkadaşlık isteğinizi kabul etti`,
          severity: 'success'
        });
        fetchFriends();
        fetchFriendRequests();
      };

      const handleFriendRequestRejected = (data) => {
        console.log('Arkadaşlık isteği reddedildi:', data);
        setNotification({
          open: true,
          message: `${data.friendUsername} arkadaşlık isteğinizi reddetti`,
          severity: 'error'
        });
        fetchFriendRequests();
      };

      socketRef.current.on('connect', () => {
        console.log('Socket.io bağlantısı kuruldu');
        socketRef.current.emit('authenticate', token);
        socketRef.current.emit('join', currentUser.id);
      });

      socketRef.current.on('connect_error', (error) => {
        console.error('Socket.io bağlantı hatası:', error);
        setNotification({
          open: true,
          message: 'Bağlantı hatası oluştu',
          severity: 'error'
        });
      });

      socketRef.current.on('disconnect', (reason) => {
        console.log('Socket.io bağlantısı kesildi:', reason);
      });

      socketRef.current.on('error', (error) => {
        console.error('Socket.io hatası:', error);
        setNotification({
          open: true,
          message: 'Bağlantı hatası oluştu',
          severity: 'error'
        });
      });

      socketRef.current.on('newFriendRequest', handleFriendRequest);
      socketRef.current.on('friendRequestAccepted', handleFriendRequestAccepted);
      socketRef.current.on('friendRequestRejected', handleFriendRequestRejected);
    }

    return () => {
      if (socketRef.current) {
        socketRef.current.disconnect();
        socketRef.current = null;
      }
    };
  }, [currentUser, fetchFriends, fetchFriendRequests]);

  const handleAddFriend = async () => {
    if (!username.trim()) {
      setNotification({
        open: true,
        message: 'Lütfen bir kullanıcı adı girin',
        severity: 'error'
      });
      return;
    }

    try {
      console.log('Arkadaş ekleme isteği gönderiliyor:', username);
      const token = localStorage.getItem('token');
      if (!token) {
        throw new Error('Oturum bulunamadı');
      }

      // Önce kullanıcıyı bul
      const response = await axios.get(`http://localhost:5000/api/users/search?username=${username}`, {
        headers: { Authorization: `Bearer ${token}` }
      });

      if (!response.data || !response.data.id) {
        throw new Error('Kullanıcı bulunamadı');
      }

      // Kendine istek göndermeyi engelle
      if (response.data.id === currentUser.id) {
        throw new Error('Kendinize arkadaşlık isteği gönderemezsiniz');
      }

      // Arkadaşlık isteği gönder
      const friendResponse = await axios.post(
        `http://localhost:5000/api/friendships/request/${response.data.id}`,
        {},
        {
          headers: {
            Authorization: `Bearer ${token}`
          }
        }
      );

      console.log('Arkadaş ekleme yanıtı:', friendResponse.data);
      setOpen(false);
      setUsername('');
      setNotification({
        open: true,
        message: friendResponse.data.message || 'Arkadaşlık isteği gönderildi',
        severity: 'success'
      });

      // Socket.io ile bildirim gönder
      if (socketRef.current) {
        socketRef.current.emit('friendRequest', {
          senderId: currentUser.id,
          receiverId: response.data.id,
          senderUsername: currentUser.username
        });
      }

      // Arkadaş listesini güncelle
      fetchFriends();
      fetchFriendRequests();
    } catch (error) {
      console.error('Arkadaş eklenirken hata:', error);
      setNotification({
        open: true,
        message: error.response?.data?.error || error.message || 'Arkadaş eklenirken bir hata oluştu',
        severity: 'error'
      });
    }
  };

  const handleAcceptRequest = async (requestId) => {
    try {
      const response = await axios.post(`http://localhost:5000/api/friendships/accept/${requestId}`, {}, {
        headers: { Authorization: `Bearer ${localStorage.getItem('token')}` }
      });
      setFriendRequests(prev => prev.filter(request => request.id !== requestId));
      fetchFriends();
      setNotification({
        open: true,
        message: response.data.message || 'Arkadaşlık isteği kabul edildi',
        severity: 'success'
      });
    } catch (error) {
      console.error('Arkadaşlık isteği kabul edilirken hata:', error);
      setNotification({
        open: true,
        message: error.response?.data?.message || 'Arkadaşlık isteği kabul edilirken bir hata oluştu',
        severity: 'error'
      });
    }
  };

  const handleRejectRequest = async (requestId) => {
    try {
      const response = await axios.post(`http://localhost:5000/api/friendships/reject/${requestId}`, {}, {
        headers: { Authorization: `Bearer ${localStorage.getItem('token')}` }
      });
      setFriendRequests(prev => prev.filter(request => request.id !== requestId));
      setNotification({
        open: true,
        message: response.data.message || 'Arkadaşlık isteği reddedildi',
        severity: 'info'
      });
    } catch (error) {
      console.error('Arkadaşlık isteği reddedilirken hata:', error);
      setNotification({
        open: true,
        message: error.response?.data?.message || 'Arkadaşlık isteği reddedilirken bir hata oluştu',
        severity: 'error'
      });
    }
  };

  return (
    <div>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '10px' }}>
        <Typography variant="h6">Arkadaşlar</Typography>
        <IconButton onClick={() => setOpen(true)}>
          <AddIcon />
        </IconButton>
      </div>

      <List>
        {friends.map((friend) => (
          <ListItem
            key={friend.id}
            button
            onClick={() => onSelectFriend(friend)}
          >
            <ListItemAvatar>
              <Avatar>
                <PersonIcon />
              </Avatar>
            </ListItemAvatar>
            <ListItemText
              primary={friend.username}
              secondary={friend.email}
            />
          </ListItem>
        ))}
      </List>

      <Dialog open={open} onClose={() => setOpen(false)}>
        <DialogTitle>Arkadaş Ekle</DialogTitle>
        <DialogContent>
          <TextField
            autoFocus
            margin="dense"
            label="Kullanıcı Adı veya Email"
            fullWidth
            value={username}
            onChange={(e) => setUsername(e.target.value)}
          />
        </DialogContent>
        <DialogActions>
          <Button onClick={() => setOpen(false)}>İptal</Button>
          <Button onClick={handleAddFriend} color="primary">
            Ekle
          </Button>
        </DialogActions>
      </Dialog>

      {friendRequests.length > 0 && (
        <div style={{ padding: '10px' }}>
          <Typography variant="h6">Arkadaşlık İstekleri</Typography>
          <List>
            {friendRequests.map((request) => (
              <ListItem key={request.id}>
                <ListItemAvatar>
                  <Avatar>
                    <PersonIcon />
                  </Avatar>
                </ListItemAvatar>
                <ListItemText
                  primary={request.username}
                  secondary={request.email}
                />
                <Button
                  variant="contained"
                  color="primary"
                  onClick={() => handleAcceptRequest(request.id)}
                  style={{ marginRight: '10px' }}
                >
                  Kabul Et
                </Button>
                <Button
                  variant="outlined"
                  color="secondary"
                  onClick={() => handleRejectRequest(request.id)}
                >
                  Reddet
                </Button>
              </ListItem>
            ))}
          </List>
        </div>
      )}

      <Snackbar
        open={notification.open}
        autoHideDuration={6000}
        onClose={() => setNotification({ ...notification, open: false })}
      >
        <Alert
          onClose={() => setNotification({ ...notification, open: false })}
          severity={notification.severity}
          sx={{ width: '100%' }}
        >
          {notification.message}
        </Alert>
      </Snackbar>
    </div>
  );
};

export default FriendList; 