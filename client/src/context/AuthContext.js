import React, { createContext, useState, useContext, useEffect } from 'react';
import axios from 'axios';
import { useNavigate } from 'react-router-dom';

const AuthContext = createContext(null);

export const AuthProvider = ({ children }) => {
  const [user, setUser] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const navigate = useNavigate();

  // Token'ı localStorage'dan al
  const getToken = () => {
    const token = localStorage.getItem('token');
    return token ? `Bearer ${token}` : null;
  };

  // Axios varsayılan başlıklarını ayarla
  useEffect(() => {
    const token = getToken();
    if (token) {
      axios.defaults.headers.common['Authorization'] = token;
    } else {
      delete axios.defaults.headers.common['Authorization'];
    }
  }, []);

  // Kullanıcı bilgilerini getir
  const fetchUser = async () => {
    try {
      const token = getToken();
      if (!token) {
        setLoading(false);
        return;
      }

      const response = await axios.get('http://localhost:5000/api/auth/me', {
        headers: { Authorization: token }
      });

      setUser(response.data);
      setError(null);
    } catch (error) {
      console.error('Kullanıcı bilgileri getirme hatası:', error);
      if (error.response?.status === 401) {
        localStorage.removeItem('token');
        delete axios.defaults.headers.common['Authorization'];
        setUser(null);
        setError('Oturum süresi doldu. Lütfen tekrar giriş yapın.');
      } else {
        setError('Kullanıcı bilgileri alınamadı. Lütfen tekrar deneyin.');
      }
    } finally {
      setLoading(false);
    }
  };

  // Sayfa yüklendiğinde kullanıcı bilgilerini getir
  useEffect(() => {
    fetchUser();
  }, []);

  // Giriş yap
  const login = async (username, password) => {
    try {
      setError(null);
      const response = await axios.post('http://localhost:5000/api/auth/login', {
        username,
        password
      });

      const { token, user } = response.data;
      localStorage.setItem('token', token);
      axios.defaults.headers.common['Authorization'] = `Bearer ${token}`;
      setUser(user);
      navigate('/chat');
    } catch (error) {
      console.error('Giriş hatası:', error);
      if (error.response?.status === 400) {
        setError(error.response.data.message || 'Geçersiz kullanıcı adı veya şifre');
      } else {
        setError('Giriş yapılırken bir hata oluştu. Lütfen tekrar deneyin.');
      }
      throw error;
    }
  };

  // Kayıt ol
  const register = async (username, email, password) => {
    try {
      setError(null);
      const response = await axios.post('http://localhost:5000/api/auth/register', {
        username,
        email,
        password
      });

      const { token, user } = response.data;
      localStorage.setItem('token', token);
      axios.defaults.headers.common['Authorization'] = `Bearer ${token}`;
      setUser(user);
      navigate('/chat');
    } catch (error) {
      console.error('Kayıt hatası:', error);
      if (error.response?.status === 400) {
        setError(error.response.data.message || 'Kayıt olurken bir hata oluştu');
      } else {
        setError('Kayıt olurken bir hata oluştu. Lütfen tekrar deneyin.');
      }
      throw error;
    }
  };

  // Çıkış yap
  const logout = () => {
    localStorage.removeItem('token');
    delete axios.defaults.headers.common['Authorization'];
    setUser(null);
    setError(null);
    navigate('/login');
  };

  const value = {
    user,
    loading,
    error,
    login,
    register,
    logout,
    fetchUser
  };

  return (
    <AuthContext.Provider value={value}>
      {children}
    </AuthContext.Provider>
  );
};

export const useAuth = () => {
  const context = useContext(AuthContext);
  if (!context) {
    throw new Error('useAuth must be used within an AuthProvider');
  }
  return context;
}; 