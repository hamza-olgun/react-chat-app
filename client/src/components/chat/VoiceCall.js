import React, { useEffect, useRef, useState } from 'react';
import {
  Dialog,
  DialogTitle,
  DialogContent,
  DialogActions,
  Button,
  Typography,
  Box,
  IconButton,
  CircularProgress,
} from '@mui/material';
import {
  Call,
  CallEnd,
  Mic,
  MicOff,
  VolumeUp,
  VolumeOff,
} from '@mui/icons-material';

const VoiceCall = ({ open, onClose, callData, socket }) => {
  const [localStream, setLocalStream] = useState(null);
  const [remoteStream, setRemoteStream] = useState(null);
  const [isMuted, setIsMuted] = useState(false);
  const [isSpeakerOff, setIsSpeakerOff] = useState(false);
  const [isConnecting, setIsConnecting] = useState(false);
  const [error, setError] = useState(null);
  
  const peerConnection = useRef(null);
  const localAudioRef = useRef(null);
  const remoteAudioRef = useRef(null);

  // WebRTC bağlantısını başlat
  const startCall = async () => {
    try {
      setIsConnecting(true);
      setError(null);

      // Medya akışını al
      const stream = await navigator.mediaDevices.getUserMedia({
        audio: true,
        video: false
      });
      setLocalStream(stream);

      // WebRTC bağlantısını oluştur
      peerConnection.current = new RTCPeerConnection({
        iceServers: [
          { urls: 'stun:stun.l.google.com:19302' },
          { urls: 'stun:stun1.l.google.com:19302' }
        ]
      });

      // Yerel medya akışını ekle
      stream.getTracks().forEach(track => {
        peerConnection.current.addTrack(track, stream);
      });

      // Uzak medya akışını al
      peerConnection.current.ontrack = (event) => {
        console.log('Uzak medya akışı alındı');
        setRemoteStream(event.streams[0]);
        if (remoteAudioRef.current) {
          remoteAudioRef.current.srcObject = event.streams[0];
        }
      };

      // ICE adaylarını topla ve gönder
      peerConnection.current.onicecandidate = (event) => {
        if (event.candidate) {
          console.log('ICE adayı gönderiliyor');
          socket.emit('ice-candidate', {
            candidate: event.candidate,
            receiverId: callData.receiver.id
          });
        }
      };

      // Teklif oluştur ve gönder
      console.log('Arama teklifi oluşturuluyor');
      const offer = await peerConnection.current.createOffer();
      await peerConnection.current.setLocalDescription(offer);

      socket.emit('offer', {
        offer,
        receiverId: callData.receiver.id
      });

    } catch (err) {
      console.error('Arama başlatma hatası:', err);
      setError('Arama başlatılamadı. Lütfen mikrofon izinlerini kontrol edin.');
    } finally {
      setIsConnecting(false);
    }
  };

  // Arama teklifini kabul et
  const handleAnswer = async (offer) => {
    try {
      setIsConnecting(true);
      setError(null);

      // Medya akışını al
      const stream = await navigator.mediaDevices.getUserMedia({
        audio: true,
        video: false
      });
      setLocalStream(stream);

      // WebRTC bağlantısını oluştur
      peerConnection.current = new RTCPeerConnection({
        iceServers: [
          { urls: 'stun:stun.l.google.com:19302' },
          { urls: 'stun:stun1.l.google.com:19302' }
        ]
      });

      // Yerel medya akışını ekle
      stream.getTracks().forEach(track => {
        peerConnection.current.addTrack(track, stream);
      });

      // Uzak medya akışını al
      peerConnection.current.ontrack = (event) => {
        console.log('Uzak medya akışı alındı');
        setRemoteStream(event.streams[0]);
        if (remoteAudioRef.current) {
          remoteAudioRef.current.srcObject = event.streams[0];
        }
      };

      // ICE adaylarını topla ve gönder
      peerConnection.current.onicecandidate = (event) => {
        if (event.candidate) {
          console.log('ICE adayı gönderiliyor');
          socket.emit('ice-candidate', {
            candidate: event.candidate,
            receiverId: callData.caller.id
          });
        }
      };

      // Teklifi kabul et
      console.log('Arama teklifi kabul ediliyor:', offer);
      if (!offer || !offer.type || !offer.sdp) {
        throw new Error('Geçersiz arama teklifi');
      }

      await peerConnection.current.setRemoteDescription(new RTCSessionDescription(offer));
      const answer = await peerConnection.current.createAnswer();
      await peerConnection.current.setLocalDescription(answer);

      socket.emit('answer', {
        answer,
        receiverId: callData.caller.id
      });

    } catch (err) {
      console.error('Arama kabul hatası:', err);
      setError('Arama kabul edilemedi. Lütfen mikrofon izinlerini kontrol edin.');
    } finally {
      setIsConnecting(false);
    }
  };

  // Aramayı sonlandır
  const endCall = () => {
    console.log('Arama sonlandırılıyor');
    if (localStream) {
      localStream.getTracks().forEach(track => track.stop());
      setLocalStream(null);
    }
    if (remoteStream) {
      remoteStream.getTracks().forEach(track => track.stop());
      setRemoteStream(null);
    }
    if (peerConnection.current) {
      peerConnection.current.close();
      peerConnection.current = null;
    }
    
    // Socket.IO üzerinden arama sonlandırma sinyali gönder
    if (socket && callData) {
      socket.emit('endCall', {
        receiverId: callData.caller.id
      });
    }
    
    onClose();
  };

  // Mikrofonu aç/kapat
  const toggleMute = () => {
    if (localStream) {
      const audioTrack = localStream.getAudioTracks()[0];
      audioTrack.enabled = !audioTrack.enabled;
      setIsMuted(!isMuted);
    }
  };

  // Hoparlörü aç/kapat
  const toggleSpeaker = () => {
    if (remoteAudioRef.current) {
      remoteAudioRef.current.muted = !remoteAudioRef.current.muted;
      setIsSpeakerOff(!isSpeakerOff);
    }
  };

  // Arama başlatma veya kabul etme
  useEffect(() => {
    if (open && !peerConnection.current) {
      if (callData.isIncoming) {
        // Gelen arama durumunda otomatik başlatma yapmıyoruz
        // Kullanıcı "Aramayı Kabul Et" butonuna tıklayacak
      } else {
        startCall();
      }
    }
  }, [open, callData]);

  return (
    <Dialog open={open} onClose={endCall} maxWidth="sm" fullWidth>
      <DialogTitle>
        <Box display="flex" alignItems="center" justifyContent="space-between">
          <Typography variant="h6">
            {callData?.isIncoming ? 'Gelen Arama' : 'Arama Yapılıyor...'}
          </Typography>
          <Typography variant="subtitle1">
            {callData?.caller?.username}
          </Typography>
        </Box>
      </DialogTitle>
      
      <DialogContent>
        <Box display="flex" flexDirection="column" alignItems="center" py={3}>
          {isConnecting ? (
            <CircularProgress />
          ) : error ? (
            <Typography color="error">{error}</Typography>
          ) : (
            <>
              <Box mb={3}>
                <audio ref={localAudioRef} autoPlay muted />
                <audio ref={remoteAudioRef} autoPlay />
              </Box>
              
              {callData?.isIncoming ? (
                <Box display="flex" gap={2}>
                  <Button
                    variant="contained"
                    color="primary"
                    onClick={() => handleAnswer(callData.offer)}
                    startIcon={<Call />}
                  >
                    Aramayı Kabul Et
                  </Button>
                  <Button
                    variant="contained"
                    color="error"
                    onClick={endCall}
                    startIcon={<CallEnd />}
                  >
                    Aramayı Reddet
                  </Button>
                </Box>
              ) : (
                <Box display="flex" gap={2}>
                  <IconButton
                    color={isMuted ? "error" : "primary"}
                    onClick={toggleMute}
                    size="large"
                  >
                    {isMuted ? <MicOff /> : <Mic />}
                  </IconButton>
                  
                  <IconButton
                    color={isSpeakerOff ? "error" : "primary"}
                    onClick={toggleSpeaker}
                    size="large"
                  >
                    {isSpeakerOff ? <VolumeOff /> : <VolumeUp />}
                  </IconButton>
                </Box>
              )}
            </>
          )}
        </Box>
      </DialogContent>

      <DialogActions>
        {(!callData?.isIncoming || localStream) && (
          <Button
            startIcon={<CallEnd />}
            variant="contained"
            color="error"
            onClick={endCall}
          >
            Aramayı Sonlandır
          </Button>
        )}
      </DialogActions>
    </Dialog>
  );
};

export default VoiceCall; 