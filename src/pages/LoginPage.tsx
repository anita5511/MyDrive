
//swarupdrive/src/pages/LoginPage.tsx
import React, { useState } from 'react';
import { 
  Box, 
  Typography, 
  TextField, 
  Button, 
  Paper,
  Container,
  Avatar,
  Link,
  Grid,
  CircularProgress,
  Alert,
  Checkbox,
  FormControlLabel
} from '@mui/material';
import { LockOutlined as LockIcon , Face as FaceIcon } from '@mui/icons-material';
import { Link as RouterLink, useNavigate } from 'react-router-dom';
import { useAuth } from '../contexts/AuthContext';
import { useEffect } from 'react';
import LoadingScreen from '../components/LoadingScreen';
import { checkSession } from '../utils/sessionUtils';

  const LoginPage: React.FC = () => {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [formErrors, setFormErrors] = useState<{email?: string, password?: string}>({});
  const [checking, setChecking] = useState(true);
  const { login, loading, error, clearError } = useAuth();
  const navigate = useNavigate();

  const validateForm = () => {
    const errors: {email?: string, password?: string} = {};
    let isValid = true;

    if (!email) {
      errors.email = 'Email is required';
      isValid = false;
    } else if (!/\S+@\S+\.\S+/.test(email)) {
      errors.email = 'Email is invalid';
      isValid = false;
    }

    if (!password) {
      errors.password = 'Password is required';
      isValid = false;
    } else if (password.length < 6) {
      errors.password = 'Password must be at least 6 characters';
      isValid = false;
    }

    setFormErrors(errors);
    return isValid;
  };

  // on mount, verify session and redirect if valid
  useEffect(() => {
   const verify = async () => {
     setChecking(true);
     clearError();
     try {
       const ip = await fetchIP();
       const deviceId = getDeviceId();
       const session = await checkSession(ip, deviceId);

       if (session.valid) {
         return navigate('/dashboard');
       }
     } catch {
       clearError();
       // you could set a local message via another state if you like
     } finally {
       setChecking(false);
     }
   };

    verify();
  }, [navigate]);


  

  if (checking) {
    return (
      <LoadingScreen>
        <Typography variant="h6" sx={{ mt: 2 }}>
          Checking credentials in Swarup Workspace…
        </Typography>
      </LoadingScreen>
    );
  }

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    clearError();
    
    if (validateForm()) {
      try {
        await login(email, password);
        navigate('/dashboard');
      } catch (err) {
        // Error is handled by the context
      }
    }
  };

return (
  <Box sx={{ display: 'flex', minHeight: '100vh' }}>
    {/* Left Side Image */}
    <Box
      sx={{
        flex: 1,
        position: 'relative',
        backgroundImage:
          'url(https://images.pexels.com/photos/3184291/pexels-photo-3184291.jpeg?auto=compress&cs=tinysrgb&dpr=2&h=750&w=1260)',
        backgroundSize: 'cover',
        backgroundPosition: 'center',
      }}
    >
      <Box
        sx={{
          position: 'absolute',
          inset: 0,
          bgcolor: 'rgba(0,0,0,0.4)',
        }}
      />
      <Box
        sx={{
          position: 'relative',
          zIndex: 1,
          height: '100%',
          display: 'flex',
          alignItems: 'center',
          pl: 8,
        }}
      >
        <Typography
          variant="h2"
          sx={{
            color: '#fff',
            fontWeight: 700,
            fontSize: { xs: '2rem', md: '3rem' },
            lineHeight: 1.1,
          }}
        >
          Swarup Drive
        </Typography>
      </Box>
    </Box>

    {/* Right Login Section */}
    <Box
      component="section"
      sx={{
        width: '100%',
        maxWidth: 420,
        ml: 'auto',
        mr: 8, // 👉 right shifted, not stuck
        bgcolor: '#fff',
        display: 'flex',
        flexDirection: 'column',
        justifyContent: 'center',
        px: 4,
        py: 8,
      }}
    >
      <Box component="form" onSubmit={handleSubmit} noValidate>
        {/* Logo */}
        <Box sx={{ display: 'flex', justifyContent: 'center', mb: 4 }}>
          <Avatar
            src="/assets/icon.png"
            sx={{ width: 56, height: 56 }}
            variant="square"
          />
        </Box>

        <Typography
          component="h1"
          variant="h5"
          sx={{ fontWeight: 600, mb: 1.5, textAlign: 'center' }}
        >
          Sign In
        </Typography>
        <Typography
          variant="body2"
          color="text.secondary"
          sx={{ mb: 3, textAlign: 'center' }}
        >
          Access your personal drive
        </Typography>

        {error && (
          <Alert severity="error" sx={{ mb: 2 }}>
            {error}
          </Alert>
        )}

        <TextField
          fullWidth
          variant="standard"
          label="Email"
          value={email}
          onChange={(e) => setEmail(e.target.value)}
          error={!!formErrors.email}
          helperText={formErrors.email}
          InputLabelProps={{ shrink: true }}
          sx={{ mb: 3 }}
        />

        <TextField
          fullWidth
          variant="standard"
          label="Password"
          type="password"
          value={password}
          onChange={(e) => setPassword(e.target.value)}
          error={!!formErrors.password}
          helperText={formErrors.password}
          InputLabelProps={{ shrink: true }}
          sx={{ mb: 2 }}
        />

        <Box
          sx={{
            display: 'flex',
            justifyContent: 'flex-end',
            mb: 4,
          }}
        >
          <Link
            component={RouterLink}
            to="#"
            underline="hover"
            sx={{ fontSize: '0.85rem' }}
          >
            Forgot password?
          </Link>
        </Box>

        <Button
          type="submit"
          fullWidth
          variant="contained"
          disabled={loading}
          sx={{
            py: 1.5,
            fontWeight: 600,
            fontSize: '1rem',
            backgroundColor: '#1a1a1a',
            '&:hover': { backgroundColor: '#111' },
            borderRadius: '8px',
          }}
        >
          {loading ? <CircularProgress size={22} sx={{ color: '#fff' }} /> : 'Login'}
        </Button>
        {/* OR separator + Face Login */}
        <Box sx={{ textAlign: 'center', mt: 2, mb: 2 }}>
          <Typography variant="body2" color="text.secondary" sx={{ mb: 1 }}>
            or
          </Typography>
          <Button
            fullWidth
            variant="outlined"
            startIcon={<FaceIcon />}
            sx={{
              py: 1.5,
              fontWeight: 600,
              fontSize: '1rem',
              borderRadius: '8px',
            }}
            onClick={() => {
              /* TODO: trigger Face ID flow */
            }}
          >
            Login with Face
          </Button>
        </Box>
        <Box sx={{ textAlign: 'center', mt: 4 }}>
          <Typography variant="body2" color="text.secondary">
            Not registered yet?{' '}
            <Link
              component={RouterLink}
              to="https://workspace-new.vercel.app/signup"
              underline="hover"
              sx={{ fontWeight: 600 }}
            >
              Create an account
            </Link>
          </Typography>
        </Box>
      </Box>
    </Box>
  </Box>
);

};
export default LoginPage;
