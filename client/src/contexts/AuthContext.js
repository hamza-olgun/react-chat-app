import React, { createContext, useContext, useState, useEffect } from 'react';
import axios from 'axios';

const AuthContext = createContext(null);

export const AuthProvider = ({ children }) => {
  const [user, setUser] = useState(null);
  const [loading, setLoading] = useState(true);

  const verifyToken = async (token) => {
    try {
      const response = await axios.get('http://localhost:5000/api/auth/me', {
        headers: { Authorization: `Bearer ${token}` }
      });
      return response.data;
    } catch (error) {
      console.error('Token doğrulama hatası:', error);
      localStorage.removeItem('token');
      return null;
    }
  };

  useEffect(() => {
    const checkAuth = async () => {
      try {
        const token = localStorage.getItem('token');
        if (token) {
          const userData = await verifyToken(token);
          if (userData) {
            setUser(userData);
          }
        }
      } catch (error) {
        console.error('Kimlik doğrulama hatası:', error);
        localStorage.removeItem('token');
        setUser(null);
      } finally {
        setLoading(false);
      }
    };

    checkAuth();
  }, []);

  const login = async (username, password) => {
    if (!username || !password) {
      throw new Error('Kullanıcı adı ve şifre gerekli');
    }

    try {
      const response = await axios.post('http://localhost:5000/api/auth/login', {
        username,
        password
      });

      if (response.data.token && response.data.user) {
        const { token, user } = response.data;
        localStorage.setItem('token', token);
        setUser(user);
        return user;
      } else {
        throw new Error('Geçersiz sunucu yanıtı');
      }
    } catch (error) {
      if (error.response?.data?.message) {
        throw new Error(error.response.data.message);
      }
      throw error;
    }
  };

  const register = async (username, email, password) => {
    if (!username || !email || !password) {
      throw new Error('Tüm alanlar gerekli');
    }

    try {
      const response = await axios.post('http://localhost:5000/api/auth/register', {
        username,
        email,
        password
      });

      if (response.data.token && response.data.user) {
        const { token, user } = response.data;
        localStorage.setItem('token', token);
        setUser(user);
        return user;
      } else {
        throw new Error('Geçersiz sunucu yanıtı');
      }
    } catch (error) {
      if (error.response?.data?.message) {
        throw new Error(error.response.data.message);
      }
      throw error;
    }
  };

  const logout = () => {
    localStorage.removeItem('token');
    setUser(null);
  };

  const value = {
    user,
    loading,
    login,
    register,
    logout
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