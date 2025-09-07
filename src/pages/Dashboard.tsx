//src/pages/Dashboard.tsx
import React, { useState } from 'react';
import { useEffect } from 'react';
import { useFiles } from '../contexts/FileContext';  
import { 
  Box,
  Container,
  Typography,
  LinearProgress,
  Button,
  AppBar,
  Toolbar,
  IconButton,
  Menu,
  MenuItem,
  Divider,
  Paper,
  Tab,
  Tabs
} from '@mui/material';
import { 
  Menu as MenuIcon, 
  AccountCircle,
  Add as AddIcon,
  Groups as GroupsIcon
} from '@mui/icons-material';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '../contexts/AuthContext';
import FileList from '../components/FileList';
import FileUpload from '../components/FileUpload';
import JoinTeamDialog from '../components/JoinTeamDialog';

const Dashboard: React.FC = () => {
  const { user, logout } = useAuth();
  const { uploading, uploadProgress, cancelUpload } = useFiles();
  const navigate = useNavigate();
  // remove local uploading
  const [menuAnchor, setMenuAnchor] = useState<null | HTMLElement>(null);
  const [showUpload, setShowUpload] = useState(false);
  const [tabValue, setTabValue] = useState(0);
  const [joinTeamDialogOpen, setJoinTeamDialogOpen] = useState(false);

  // ─── prevent reload while an upload is in progress ─────────────────────
  useEffect(() => {
    const handler = (e: BeforeUnloadEvent) => {
      if (uploading) {
        e.preventDefault();
        e.returnValue = 'If you reload now, the upload will be cancelled. Stay on this page?';
      }
    };
    window.addEventListener('beforeunload', handler);
    return () => window.removeEventListener('beforeunload', handler);
  }, [uploading]);
  
  const handleMenuOpen = (event: React.MouseEvent<HTMLElement>) => {
    setMenuAnchor(event.currentTarget);
  };

  const handleMenuClose = () => {
    setMenuAnchor(null);
  };

  const handleLogout = () => {
    handleMenuClose();
    logout();
    navigate('/login');
  };

  const handleTabChange = (_event: React.SyntheticEvent, newValue: number) => {
    setTabValue(newValue);
  };

  const toggleUpload = () => {
    if (!uploading) setShowUpload(!showUpload);
  };

  return (
    <Box sx={{ display: 'flex', flexDirection: 'column', minHeight: '100vh' }}>
      <AppBar position="static">
        <Toolbar>
          <IconButton
            size="large"
            edge="start"
            color="inherit"
            sx={{ mr: 2 }}
          >
            <MenuIcon />
          </IconButton>
          <Typography variant="h6" component="div" sx={{ flexGrow: 1 }}>
            SwarupDrive
          </Typography>
          
          <Button
            color="inherit"
            startIcon={<GroupsIcon />}
            onClick={() => setJoinTeamDialogOpen(true)}
            sx={{ mr: 2 }}
          >
            Join Team
          </Button>
          
          <IconButton
            size="large"
            edge="end"
            color="inherit"
            onClick={handleMenuOpen}
          >
            <AccountCircle />
          </IconButton>
          <Menu
            id="menu-appbar"
            anchorEl={menuAnchor}
            anchorOrigin={{
              vertical: 'bottom',
              horizontal: 'right',
            }}
            keepMounted
            transformOrigin={{
              vertical: 'top',
              horizontal: 'right',
            }}
            open={Boolean(menuAnchor)}
            onClose={handleMenuClose}
          >
            <MenuItem disabled>
              <Typography variant="body2" color="text.secondary">
                Signed in as {user?.email}
              </Typography>
            </MenuItem>
            <Divider />
            <MenuItem onClick={handleLogout}>Logout</MenuItem>
          </Menu>
        </Toolbar>
      </AppBar>
      
      <Container maxWidth="lg" sx={{ mt: 4, mb: 4, flexGrow: 1 }}>
        <Box sx={{ mb: 4 }}>
          <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', mb: 3 }}>
            <Typography variant="h4" component="h1" gutterBottom>
              My Files
            </Typography>
            <Button
              variant="contained"
              startIcon={!showUpload && !uploading ? <AddIcon /> : undefined}
              onClick={toggleUpload}
              disabled={uploading}
            >
              {uploading ? "Uploading…" : showUpload ? "Close" : "Upload File"}
            </Button>
          </Box>
          
          {(showUpload || uploading) && <FileUpload />}
          <Paper sx={{ width: '100%' }}>
            <Tabs
              value={tabValue}
              onChange={handleTabChange}
              indicatorColor="primary"
              textColor="primary"
              variant="fullWidth"
            >
              <Tab label="All Files" />
              <Tab label="Shared with me" />
              <Tab label="Recent" />
            </Tabs>
            
            <Box sx={{ p: { xs: 2, md: 3 } }}>
              <FileList />
            </Box>
          </Paper>
        </Box>
      </Container>
      
      <JoinTeamDialog
        open={joinTeamDialogOpen}
        onClose={() => setJoinTeamDialogOpen(false)}
      />
    </Box>
  );
};

export default Dashboard;
