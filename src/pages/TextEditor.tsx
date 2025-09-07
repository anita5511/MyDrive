//src/pages/TextEditor.tsx
import React, { useState, useEffect, useCallback } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import {
  Box,
  AppBar,
  Toolbar,
  IconButton,
  Typography,
  TextField,
  Paper,
  CircularProgress,
  Alert,
  Button,
  Chip,
  Avatar,
} from '@mui/material';
import {
  ArrowBack as ArrowBackIcon,
  Save as SaveIcon,
  GroupWork as GroupWorkIcon,
} from '@mui/icons-material';
import { useFiles } from '../contexts/FileContext';
import { useSocket } from '../contexts/SocketContext';
import { useAuth } from '../contexts/AuthContext';
import { AUTOSAVE_INTERVAL } from '../config';

interface EditorUser {
  id: string;
  name: string;
  color: string;
}

const TextEditor: React.FC = () => {
  const { fileId } = useParams<{ fileId: string }>();
  const navigate = useNavigate();
  const { getFileContent, updateFileContent, files, loading } = useFiles();
  const { socket, joinEditRoom, leaveEditRoom, connected } = useSocket();
  const { user } = useAuth();
  
  const [content, setContent] = useState<string>('');
  const [originalContent, setOriginalContent] = useState<string>('');
  const [saveStatus, setSaveStatus] = useState<'saved' | 'saving' | 'error'>('saved');
  const [lastSaved, setLastSaved] = useState<Date | null>(null);
  const [activeUsers, setActiveUsers] = useState<EditorUser[]>([]);
  const [error, setError] = useState<string | null>(null);

  // Get random color for user identification
  const getUserColor = useCallback(() => {
    const colors = [
      '#F44336', '#E91E63', '#9C27B0', '#673AB7', 
      '#3F51B5', '#2196F3', '#03A9F4', '#00BCD4',
      '#009688', '#4CAF50', '#8BC34A', '#CDDC39',
      '#FFC107', '#FF9800', '#FF5722'
    ];
    
    // Generate a consistent color based on user ID
    if (user?.id) {
      const hash = user.id.split('').reduce((acc, char) => acc + char.charCodeAt(0), 0);
      return colors[hash % colors.length];
    }
    
    return colors[Math.floor(Math.random() * colors.length)];
  }, [user?.id]);

  // Initialize editor with file content
  useEffect(() => {
    const loadFileContent = async () => {
      if (!fileId) return;
      
      try {
        const fileContent = await getFileContent(fileId);
        setContent(fileContent);
        setOriginalContent(fileContent);
      } catch (err: any) {
        console.error('Error loading file content:', err);
        // if we threw our "not-authorized" sentinel, show the access‐denied copy
        if (err.message === 'not-authorized') {
          setError("You don't have access to this file");
        } else {
          setError('Failed to load file content');
        }
      }
    };

    loadFileContent();
  }, [fileId, getFileContent]);

  // Join edit room and set up socket listeners
  useEffect(() => {
    if (!socket || !connected || !fileId || !user) return;

    const userColor = getUserColor();
    
    // Join edit room
    joinEditRoom(fileId);
    
    // Announce presence
    socket.emit('user-joined', { 
      fileId, 
      userId: user.id, 
      userName: user.name,
      userColor
    });
    
    // Listen for content changes from other users
    socket.on('content-changed', (data: { content: string, userId: string }) => {
      if (data.userId !== user.id) {
        setContent(data.content);
      }
    });
    
    // Listen for active users updates
    socket.on('active-users', (data: { users: EditorUser[] }) => {
      setActiveUsers(data.users);
    });
    
    return () => {
      socket.off('content-changed');
      socket.off('active-users');
      leaveEditRoom(fileId);
    };
  }, [socket, connected, fileId, user, joinEditRoom, leaveEditRoom, getUserColor]);

  // Autosave functionality
  useEffect(() => {
    if (content === originalContent) return;
    
    const hasChanges = content !== originalContent;
    
    if (!hasChanges) return;
    
    const timerId = setTimeout(async () => {
      if (fileId && hasChanges) {
        try {
          setSaveStatus('saving');
          await updateFileContent(fileId, content);
          setOriginalContent(content);
          setSaveStatus('saved');
          setLastSaved(new Date());
        } catch (err) {
          console.error('Autosave failed:', err);
          setSaveStatus('error');
        }
      }
    }, AUTOSAVE_INTERVAL);
    
    return () => clearTimeout(timerId);
  }, [content, originalContent, fileId, updateFileContent]);

  // Handle content change and broadcast to other users
  const handleContentChange = (e: React.ChangeEvent<HTMLTextAreaElement>) => {
    const newContent = e.target.value;
    setContent(newContent);
    
    // Broadcast content changes to other users
    if (socket && connected && fileId && user) {
      socket.emit('content-change', { 
        fileId, 
        content: newContent,
        userId: user.id 
      });
    }
  };

  // Manual save
  const handleSave = async () => {
    if (!fileId) return;
    
    try {
      setSaveStatus('saving');
      await updateFileContent(fileId, content);
      setOriginalContent(content);
      setSaveStatus('saved');
      setLastSaved(new Date());
    } catch (err) {
      console.error('Save failed:', err);
      setSaveStatus('error');
    }
  };

  const fileName = files.find(f => f.id === fileId)?.name || 'Untitled Document';

  return (
    <Box sx={{ display: 'flex', flexDirection: 'column', height: '100vh' }}>
      <AppBar position="static">
        <Toolbar>
          <IconButton
            edge="start"
            color="inherit"
            onClick={() => navigate('/dashboard')}
            sx={{ mr: 2 }}
          >
            <ArrowBackIcon />
          </IconButton>
          <Typography variant="h6" component="div" sx={{ flexGrow: 1 }}>
            {fileName}
          </Typography>
          
          <Box sx={{ display: 'flex', alignItems: 'center', mr: 2 }}>
            {saveStatus === 'saved' && lastSaved && (
              <Typography variant="body2" sx={{ mr: 2, color: 'white' }}>
                Saved {lastSaved.toLocaleTimeString()}
              </Typography>
            )}
            {saveStatus === 'saving' && (
              <CircularProgress size={20} color="inherit" sx={{ mr: 2 }} />
            )}
            {saveStatus === 'error' && (
              <Typography variant="body2" color="error" sx={{ mr: 2 }}>
                Save failed
              </Typography>
            )}
          </Box>
          
          <Box sx={{ display: 'flex', alignItems: 'center', mr: 2 }}>
            <GroupWorkIcon sx={{ mr: 1 }} />
            <Box sx={{ display: 'flex', gap: 1 }}>
              {activeUsers.map(activeUser => (
                <Chip
                  key={activeUser.id}
                  avatar={
                    <Avatar 
                      sx={{ 
                        bgcolor: activeUser.color, 
                        color: 'white',
                      }}
                    >
                      {activeUser.name.charAt(0).toUpperCase()}
                    </Avatar>
                  }
                  label={activeUser.name}
                  variant="outlined"
                  sx={{ borderColor: 'white', color: 'white' }}
                />
              ))}
            </Box>
          </Box>
          
          <Button
            variant="contained"
            color="secondary"
            startIcon={<SaveIcon />}
            onClick={handleSave}
            disabled={saveStatus === 'saving' || content === originalContent}
          >
            Save
          </Button>
        </Toolbar>
      </AppBar>
      
      <Box sx={{ flexGrow: 1, p: 3, bgcolor: '#f5f5f5' }}>
        {loading ? (
          <Box sx={{ display: 'flex', justifyContent: 'center', mt: 4 }}>
            <CircularProgress />
          </Box>
        ) : error ? (
          <Alert severity="error" sx={{ mb: 2 }}>
            {error}
          </Alert>
        ) : (
          <Paper 
            sx={{ 
              height: '100%', 
              display: 'flex', 
              flexDirection: 'column',
              boxShadow: '0 0 10px rgba(0,0,0,0.1)'
            }}
          >
            <TextField
              multiline
              fullWidth
              variant="outlined"
              value={content}
              onChange={handleContentChange}
              sx={{
                height: '100%',
                '& .MuiOutlinedInput-root': {
                  height: '100%',
                  alignItems: 'flex-start',
                },
                '& .MuiInputBase-inputMultiline': {
                  height: '100% !important',
                  overflowY: 'auto',
                  fontFamily: 'monospace',
                  fontSize: '1rem',
                  lineHeight: 1.5,
                  p: 2,
                }
              }}
            />
          </Paper>
        )}
      </Box>
    </Box>
  );
};

export default TextEditor;
