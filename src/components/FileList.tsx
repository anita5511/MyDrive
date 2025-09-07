//src/componenets/FileList.tsx
import React, { useState } from 'react';
import { 
  Box, 
  List, 
  ListItem, 
  ListItemAvatar, 
  ListItemText, 
  IconButton, 
  Avatar, 
  Menu, 
  MenuItem,
  Typography,
  Paper,
  Divider,
  CircularProgress,
  Dialog,
  DialogTitle,
  DialogContent,
  DialogActions,
  Button,
} from '@mui/material';
import { 
  InsertDriveFile as FileIcon, 
  Description as TextIcon,
  Image as ImageIcon,
  PictureAsPdf as PdfIcon,
  MoreVert as MoreVertIcon,
  Edit as EditIcon,
  Share as ShareIcon,
  Download as DownloadIcon,
  Delete as DeleteIcon,
  VideoLibrary as VideoIcon,
  Audiotrack as AudioIcon,
  PlayArrow as PlayIcon,
  OpenInNew as OpenIcon,
} from '@mui/icons-material';
import { useNavigate } from 'react-router-dom';
import { useFiles, FileItem } from '../contexts/FileContext';
import ShareFileDialog from './ShareFileDialog';
import { Tooltip } from '@mui/material';
import { useAuth } from '../contexts/AuthContext';
import { getOrCreateDeviceId } from '../utils/device';

const FileList: React.FC = () => {
  const { files, loading, deleteFile, downloadFile } = useFiles();
  const { user } = useAuth();
  const navigate = useNavigate();
  const [anchorEl, setAnchorEl] = useState<null | HTMLElement>(null);
  const [selectedFileId, setSelectedFileId] = useState<string | null>(null);
  const [confirmOpen, setConfirmOpen] = useState(false);
  const [shareDialogOpen, setShareDialogOpen] = useState(false);

  const handleMoreClick = (event: React.MouseEvent<HTMLElement>, fileId: string) => {
    setAnchorEl(event.currentTarget);
    setSelectedFileId(fileId);
  };

  const handleMenuClose = () => {
    setAnchorEl(null);
  };

  const handleShare = () => {
    setShareDialogOpen(true);
    handleMenuClose();
  };

  const handleDownload = async () => {
    if (selectedFileId) {
      await downloadFile(selectedFileId);
    }
    handleMenuClose();
  };

  const handleEdit = () => {
    if (selectedFileId) {
      navigate(`/edit/${selectedFileId}`);
    }
    handleMenuClose();
  };

  // open confirmation dialog instead of immediate delete
  const handleDelete = () => {
    setConfirmOpen(true);
    handleMenuClose();
  };

  // if user confirms, actually delete and close dialog
  const handleConfirmDelete = async () => {
    try {
      if (selectedFileId) {
        await deleteFile(selectedFileId);
      }
    } catch (err: any) {
      // you can show a Snackbar or console log
      console.error('Delete failed:', err);
    } finally {
      // always close the dialog and reset selection
      setConfirmOpen(false);
      setSelectedFileId(null);
    }
  };

  // close dialog without deleting
  const handleCancelDelete = () => {
    setConfirmOpen(false);
  };

  const getFileIcon = (file: FileItem) => {
    if (file.type.startsWith('text/')) {
      return <TextIcon color="primary" />;
    } else if (file.type.startsWith('image/')) {
      return <ImageIcon color="success" />;
    } else if (file.type === 'application/pdf') {
      return <PdfIcon color="error" />;
    } else if (file.type.startsWith('video/')) {
      return <VideoIcon color="secondary" />;
    } else if (file.type.startsWith('audio/')) {
      return <AudioIcon color="secondary" />;
    } else {
      return <FileIcon color="action" />;
    }
  };

  const formatFileSize = (size: number) => {
    if (size < 1024) {
      return `${size} B`;
    } else if (size < 1024 * 1024) {
      return `${(size / 1024).toFixed(2)} KB`;
    } else {
      return `${(size / (1024 * 1024)).toFixed(2)} MB`;
    }
  };

  const formatDate = (dateString: string) => {
    const date = new Date(dateString);
    return date.toLocaleDateString('en-US', { 
      year: 'numeric', 
      month: 'short', 
      day: 'numeric',
      hour: '2-digit',
      minute: '2-digit'
    });
  };

  if (loading) {
    return (
      <Box sx={{ display: 'flex', justifyContent: 'center', my: 4 }}>
        <CircularProgress />
      </Box>
    );
  }

  if (files.length === 0) {
    return (
      <Paper sx={{ p: 3, my: 2, textAlign: 'center' }}>
        <Typography variant="body1" color="text.secondary">
          No files found. Upload a file to get started.
        </Typography>
      </Paper>
    );
  }

  return (
    <Box sx={{ width: '100%', bgcolor: 'background.paper', borderRadius: 1 }}>
      <Paper sx={{ width: '100%', mb: 2 }}>
        <List>
          {files.map((file) => (
            <React.Fragment key={file.id}>
              


              {/* Combined action buttons: play / open / edit / more */}
              <ListItem
                secondaryAction={
                  <Box sx={{ display: 'flex', alignItems: 'center' }}>
                    {/* Audio: open in SwarupMusic (port 9001) */}
                    {file.type.startsWith('audio/') && (
                      <IconButton
                        edge="end"
                        onClick={async () => {
                          try {
                            // 1) Call Drive backend’s new /api/play-link
                            const resp = await fetch(
                              'https://swarupdrive.onrender.com/api/play-link',
                              {
                                method: 'POST',
                                headers: { 'Content-Type': 'application/json' },
                                body: JSON.stringify({ fileId: file.id }),
                              }
                            );
                            if (!resp.ok) {
                              console.error('Failed to get play link:', await resp.text());
                              return;
                            }
                            const { playUrl } = await resp.json();
                            // 2) Immediately open the short‐lived playUrl
                            window.open(playUrl, '_blank');
                          } catch (err) {
                            console.error('Error generating play link:', err);
                          }
                        }}
                        title="Play audio"
                      >
                        <PlayIcon />
                      </IconButton>
                    )}

                    {/* Video: redirect to SwarupVideo (port 8001) with a video icon */}
                    {file.type.startsWith('video/') && (
                      <IconButton
                        edge="end"
                        onClick={() => window.open( 
                          `https://swarupplay-play3.vercel.app/watch?play=${file.id}`,
                          '_blank'
                        )}
                        title="Play video"
                      >
                        <VideoIcon />
                      </IconButton>
                    )}


                    {/* Open (disabled) for images */}
                    {file.type.startsWith('image/') && (
                    <IconButton edge="end" disabled>
                        <OpenIcon />
                      </IconButton>
                    )}
                    {/* Edit for text */}
                    {file.type === 'text/plain' && (
                      <IconButton edge="end" onClick={() => navigate(`/edit/${file.id}`)}>
                        <EditIcon />
                      </IconButton>
                    )}
                    {/* More menu */}
                    <IconButton edge="end" onClick={(e) => handleMoreClick(e, file.id)}>
                      <MoreVertIcon />
                    </IconButton>
                  </Box>
                }

                sx={{
                  '&:hover': {
                    bgcolor: 'rgba(0, 0, 0, 0.04)',
                  },
                  transition: 'background-color 0.2s',
                }}
              >
                <ListItemAvatar>
                  <Avatar sx={{ bgcolor: 'transparent' }}>
                    {getFileIcon(file)}
                  </Avatar>
                </ListItemAvatar>
                <ListItemText
                  primary={
                    <Typography variant="body1" sx={{ fontWeight: 500 }}>
                      {file.name}
                      {file.is_shared && (
                        <Typography
                          component="span"
                          variant="caption"
                          sx={{
                            ml: 1,
                            py: 0.3,
                            px: 1,
                            borderRadius: 1,
                            bgcolor: 'primary.light',
                            color: 'white',
                          }}
                        >
                          Shared
                        </Typography>
                      )}

                      {file.owner_id === user?.id && (
                        <Typography
                          component="span"
                          variant="caption"
                          sx={{
                            ml: 1,
                            py: 0.3,
                            px: 1,
                            borderRadius: 1,
                            bgcolor: 'success.light',
                            color: 'white',
                          }}
                        >
                          Owner
                        </Typography>
                      )} 
                    </Typography>
                  }
                  secondary={
                    <React.Fragment>
                      <Typography
                        component="span"
                        variant="body2"
                        color="text.primary"
                      >
                        {formatFileSize(file.size)}
                      </Typography>
                      {" — "}
                      <Typography
                        component="span"
                        variant="body2"
                        color="text.secondary"
                      >
                        Last modified: {formatDate(file.updated_at)}
                      </Typography>
                    </React.Fragment>
                  }
                />
              </ListItem>
              <Divider component="li" />
            </React.Fragment>
          ))}
        </List>
      </Paper>

      <Menu
        anchorEl={anchorEl}
        open={Boolean(anchorEl)}
        onClose={handleMenuClose}
        PaperProps={{
          elevation: 3,
          sx: { width: 200, borderRadius: 2 },
        }}
      >
        <MenuItem onClick={handleShare}>
          <ShareIcon fontSize="small" sx={{ mr: 1 }} /> Share
        </MenuItem>

        <MenuItem onClick={handleDownload}>
          <DownloadIcon fontSize="small" sx={{ mr: 1 }} /> Download
        </MenuItem>

        {selectedFileId && (() => {
          const file = files.find(f => f.id === selectedFileId);
          const isTxt = file?.type === 'text/plain';
          return (
            <Tooltip title={isTxt ? '' : 'Only .txt files supported'} placement="right">
              <span>
                <MenuItem onClick={handleEdit} disabled={!isTxt}>
                  <EditIcon fontSize="small" sx={{ mr: 1 }} /> Edit
                </MenuItem>
              </span>
            </Tooltip>
          );
        })()}

        <Divider />
        <MenuItem onClick={handleDelete} sx={{ color: 'error.main' }}>
          <DeleteIcon fontSize="small" sx={{ mr: 1 }} /> Delete
        </MenuItem>
      </Menu>

      {selectedFileId && (
        <ShareFileDialog
          open={shareDialogOpen}
          onClose={() => setShareDialogOpen(false)}
          fileId={selectedFileId}
        />
      )}

    {/* ── CONFIRM DELETE DIALOG ── */}
    <Dialog
     open={confirmOpen}
      onClose={handleCancelDelete}
      aria-labelledby="confirm-delete-title"
    >
      <DialogTitle id="confirm-delete-title">
        This cannot be undone. Delete?
      </DialogTitle>
      <DialogContent>
        <Typography>
          Are you sure you want to permanently delete this file?
        </Typography>
      </DialogContent>
      <DialogActions>
        <Button onClick={handleCancelDelete}>
          No
        </Button>
        <Button color="error" onClick={handleConfirmDelete}>
          Yes
        </Button>
      </DialogActions>
    </Dialog>      
    </Box>
  );
};

export default FileList;
