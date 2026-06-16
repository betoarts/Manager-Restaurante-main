import React, { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import {
  Box,
  Card,
  CardContent,
  TextField,
  Button,
  Typography,
  Alert,
  InputAdornment,
  IconButton,
  CircularProgress,
} from '@mui/material';
import { Eye, EyeOff, Lock, Mail } from 'lucide-react';
import { useStore } from '../store/useStore';
import { api } from '../utils/api';

export const Login: React.FC = () => {
  const navigate = useNavigate();
  const loginStore = useStore((state) => state.login);

  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  const handleTogglePassword = () => setShowPassword(!showPassword);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    setLoading(true);

    try {
      const response = await api.post<{ token: string; usuario: any; empresa: any }>('/api/auth/login', {
        email,
        senha: password,
      });

      loginStore(response.token, response.usuario, response.empresa);
      if (response.usuario.role === 'garcom') {
        navigate('/garcom');
      } else {
        navigate('/');
      }
    } catch (err: any) {
      setError(err.message || 'Erro de conexão ou credenciais inválidas.');
    } finally {
      setLoading(false);
    }
  };

  return (
    <Box
      sx={{
        minHeight: '100vh',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        background: 'linear-gradient(135deg, #0f172a 0%, #1e293b 100%)',
        p: 2,
      }}
    >
      <Card
        sx={{
          maxWidth: 420,
          width: '100%',
          bgcolor: 'rgba(30, 41, 59, 0.7)',
          backdropFilter: 'blur(16px)',
          border: '1px solid rgba(255, 255, 255, 0.08)',
          boxShadow: '0 20px 40px rgba(0,0,0,0.5)',
          color: '#ffffff',
          overflow: 'visible',
        }}
      >
        <CardContent sx={{ p: 4 }}>
          {/* Logo / Title */}
          <Box sx={{ textAlign: 'center', mb: 4 }}>
            <Typography
              variant="h4"
              sx={{
                fontWeight: 800,
                background: 'linear-gradient(90deg, #38bdf8 0%, #818cf8 100%)',
                WebkitBackgroundClip: 'text',
                WebkitTextFillColor: 'transparent',
                letterSpacing: '-1px',
              }}
            >
              Manager REST
            </Typography>
            <Typography variant="body2" sx={{ color: 'rgba(255,255,255,0.6)', mt: 1 }}>
              Insira suas credenciais para acessar o painel ERP/PDV
            </Typography>
          </Box>

          {error && (
            <Alert severity="error" sx={{ mb: 3, bgcolor: 'rgba(239, 68, 68, 0.1)', color: '#f87171' }}>
              {error}
            </Alert>
          )}

          <Box component="form" onSubmit={handleSubmit}>
            <TextField
              fullWidth
              label="E-mail"
              variant="outlined"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              required
              disabled={loading}
              placeholder="admin@sabor.com"
              sx={{
                mb: 2.5,
                '& .MuiOutlinedInput-root': {
                  color: '#ffffff',
                  '& fieldset': { borderColor: 'rgba(255,255,255,0.15)' },
                  '&:hover fieldset': { borderColor: 'rgba(255,255,255,0.3)' },
                  '&.Mui-focused fieldset': { borderColor: '#38bdf8' },
                },
                '& .MuiInputLabel-root': { color: 'rgba(255,255,255,0.5)' },
                '& .MuiInputLabel-root.Mui-focused': { color: '#38bdf8' },
              }}
              slotProps={{
                input: {
                  startAdornment: (
                    <InputAdornment position="start" sx={{ color: 'rgba(255,255,255,0.4)' }}>
                      <Mail size={18} />
                    </InputAdornment>
                  ),
                }
              }}
            />

            <TextField
              fullWidth
              label="Senha"
              type={showPassword ? 'text' : 'password'}
              variant="outlined"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              required
              disabled={loading}
              placeholder="••••••"
              sx={{
                mb: 4,
                '& .MuiOutlinedInput-root': {
                  color: '#ffffff',
                  '& fieldset': { borderColor: 'rgba(255,255,255,0.15)' },
                  '&:hover fieldset': { borderColor: 'rgba(255,255,255,0.3)' },
                  '&.Mui-focused fieldset': { borderColor: '#38bdf8' },
                },
                '& .MuiInputLabel-root': { color: 'rgba(255,255,255,0.5)' },
                '& .MuiInputLabel-root.Mui-focused': { color: '#38bdf8' },
              }}
              slotProps={{
                input: {
                  startAdornment: (
                    <InputAdornment position="start" sx={{ color: 'rgba(255,255,255,0.4)' }}>
                      <Lock size={18} />
                    </InputAdornment>
                  ),
                  endAdornment: (
                    <InputAdornment position="end">
                      <IconButton
                        onClick={handleTogglePassword}
                        edge="end"
                        sx={{ color: 'rgba(255,255,255,0.4)' }}
                      >
                        {showPassword ? <EyeOff size={18} /> : <Eye size={18} />}
                      </IconButton>
                    </InputAdornment>
                  ),
                }
              }}
            />

            <Button
              type="submit"
              fullWidth
              variant="contained"
              disabled={loading}
              sx={{
                py: 1.5,
                fontWeight: 700,
                fontSize: '16px',
                borderRadius: 2,
                background: 'linear-gradient(90deg, #38bdf8 0%, #818cf8 100%)',
                color: '#ffffff',
                boxShadow: '0 8px 16px rgba(56, 189, 248, 0.25)',
                '&:hover': {
                  background: 'linear-gradient(90deg, #0ea5e9 0%, #6366f1 100%)',
                  transform: 'translateY(-1px)',
                },
              }}
            >
              {loading ? <CircularProgress size={24} sx={{ color: '#ffffff' }} /> : 'Entrar no Sistema'}
            </Button>
          </Box>
        </CardContent>
      </Card>
      
      {/* Demo Credentials Helper */}
      <Box sx={{ position: 'absolute', bottom: 20, textAlign: 'center', opacity: 0.7, color: 'rgba(255,255,255,0.4)', fontSize: '12px' }}>
        Acesso de Teste: admin@sabor.com | Senha: 123456
      </Box>
    </Box>
  );
};
