import React, { useState } from 'react';
import {
  Dialog,
  DialogTitle,
  DialogContent,
  DialogActions,
  Button,
  TextField,
  Box,
  Typography,
  CircularProgress,
  Alert,
} from '@mui/material';
import { useFiles } from '../contexts/FileContext';

interface JoinTeamDialogProps {
  open: boolean;
  onClose: () => void;
}

const JoinTeamDialog: React.FC<JoinTeamDialogProps> = ({ open, onClose }) => {
  const { joinTeam } = useFiles();
  const [token, setToken] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState(false);

  const handleTokenChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    setToken(e.target.value);
    if (error) setError(null);
    if (success) setSuccess(false);
  };

  const handleJoinTeam = async () => {
    if (!token.trim()) {
      setError('Please enter a valid token');
      return;
    }

    try {
      setLoading(true);
      setError(null);
      await joinTeam(token);
      setSuccess(true);
      setToken('');
      setTimeout(() => {
        onClose();
      }, 2000);
    } catch (err: any) {
      setError(err.response?.data?.message || 'Failed to join team. Invalid token.');
    } finally {
      setLoading(false);
    }
  };

  return (
    <Dialog open={open} onClose={onClose} maxWidth="sm" fullWidth>
      <DialogTitle>Join Team</DialogTitle>
      <DialogContent>
        <Box sx={{ py: 2 }}>
          <Typography variant="body1" gutterBottom>
            Enter the sharing token to join a team and collaborate on shared files.
          </Typography>
          <TextField
            fullWidth
            label="Sharing Token"
            variant="outlined"
            value={token}
            onChange={handleTokenChange}
            margin="normal"
            placeholder="Enter token here"
            disabled={loading || success}
          />
          {error && (
            <Alert severity="error" sx={{ mt: 2 }}>
              {error}
            </Alert>
          )}
          {success && (
            <Alert severity="success" sx={{ mt: 2 }}>
              Successfully joined the team!
            </Alert>
          )}
        </Box>
      </DialogContent>
      <DialogActions>
        <Button onClick={onClose} disabled={loading}>
          Cancel
        </Button>
        <Button
          variant="contained"
          onClick={handleJoinTeam}
          disabled={loading || success || !token.trim()}
        >
          {loading ? <CircularProgress size={24} /> : "Join Team"}
        </Button>
      </DialogActions>
    </Dialog>
  );
};

export default JoinTeamDialog;