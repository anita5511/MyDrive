//src/components/ShareFileDialog.tsx
import React, { useState, useEffect } from 'react';
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
  Tooltip,
  IconButton,
} from '@mui/material';
import { ContentCopy as CopyIcon } from '@mui/icons-material';
import { useFiles } from '../contexts/FileContext';

interface ShareFileDialogProps {
  open: boolean;
  onClose: () => void;
  fileId: string;
}

const ShareFileDialog: React.FC<ShareFileDialogProps> = ({ open, onClose, fileId }) => {
  const { shareFile, getShareToken, files } = useFiles();
  const [token, setToken] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [copied, setCopied] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Fetch existing token when dialog opens
  useEffect(() => {
  if (!open) return;

  // reset UI state
  setToken(null);
  setError(null);
  setCopied(false);

  // try to fetch any existing share token
  (async () => {
    try {
      const existing = await getShareToken(fileId);
      setToken(existing);
    } catch (err) {
      // 404 or other error → no existing token; user stays on "Generate" UI
    }
  })();
}, [open, fileId, getShareToken]);




  const handleShare = async () => {
    setError(null);
    try {
      setLoading(true);
      const generatedToken = await shareFile(fileId);
      setToken(generatedToken);
    } catch (err: any) {
      console.error('Failed to share file:', err);
      setError(err.message || 'Failed to generate token');
    } finally {
      setLoading(false);
    }
  };

  const handleCopyToken = () => {
    if (token) {
      navigator.clipboard.writeText(token);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    }
  };

  const fileName = files.find(f => f.id === fileId)?.name || 'File';

  return (
    <Dialog open={open} onClose={onClose} maxWidth="sm" fullWidth>
      <DialogTitle>Share "{fileName}"</DialogTitle>
      <DialogContent>
        {error && (
          <Typography color="error" sx={{ mb: 2 }}>
            {error}
          </Typography>
        )}
        {!token ? (
          <Box sx={{ py: 2 }}>
            <Typography variant="body1" gutterBottom>
              Generate a sharing token to allow team members to access this file.
            </Typography>
            <Typography variant="body2" color="text.secondary">
              Anyone with this token can join the team and collaborate on this file.
            </Typography>
          </Box>
        ) : (
          <Box sx={{ py: 2 }}>
            <Typography variant="body1" gutterBottom>
              Share this token with your team members:
            </Typography>
            <Box sx={{ display: 'flex', alignItems: 'center', mt: 1 }}>
              <TextField
                fullWidth
                value={token}
                variant="outlined"
                InputProps={{ readOnly: true }}
                sx={{ mr: 1 }}
              />
              <Tooltip title={copied ? 'Copied!' : 'Copy token'}>
                <IconButton onClick={handleCopyToken} color="primary">
                  <CopyIcon />
                </IconButton>
              </Tooltip>
            </Box>
            <Typography variant="body2" color="warning.main" sx={{ mt: 2 }}>
              Warning: Anyone with this token can access this file. Do not share it publicly.
            </Typography>
          </Box>
        )}
      </DialogContent>
      <DialogActions>
        {!token ? (
          <>
            <Button onClick={onClose}>Cancel</Button>
            <Button
              variant="contained"
              onClick={handleShare}
              disabled={loading}
            >
              {loading ? <CircularProgress size={24} /> : 'Generate Token'}
            </Button>
          </>
        ) : (
          <Button onClick={onClose}>Close</Button>
        )}
      </DialogActions>
    </Dialog>
  );
};

export default ShareFileDialog;
