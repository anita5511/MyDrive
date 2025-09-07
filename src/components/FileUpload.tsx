//src/components/FileUpload.tsx
import React, { useState, useRef } from 'react';
import { 
  Box, 
  Button, 
  Typography, 
  Paper, 
  CircularProgress,
  Alert,
  Snackbar,
  LinearProgress,
} from '@mui/material';
import { CloudUpload as UploadIcon } from '@mui/icons-material';
import { useFiles } from '../contexts/FileContext';
import { MAX_FILE_SIZE, ALLOWED_FILE_TYPES } from '../config';

   interface FileUploadProps {
     onUploadStart?: () => void;
     onUploadEnd?: () => void;
   }
  
  const FileUpload: React.FC<FileUploadProps> = ({ onUploadStart, onUploadEnd }) => {
    // grab everything you need from context in one go
  const { uploadFile, uploading, uploadProgress, cancelUpload } = useFiles();
  const [dragging, setDragging] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const abortControllerRef = useRef<AbortController | null>(null);
    
  const handleDragOver = (e: React.DragEvent) => {
    e.preventDefault();
    setDragging(true);
  };

  const handleDragLeave = () => {
    setDragging(false);
  };

  const handleDrop = async (e: React.DragEvent) => {
    e.preventDefault();
    setDragging(false);
    
    if (e.dataTransfer.files && e.dataTransfer.files.length > 0) {
      await handleFileUpload(e.dataTransfer.files[0]);
    }
  };

  const handleFileChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.files && e.target.files.length > 0) {
      await handleFileUpload(e.target.files[0]);
    }
  };

  const handleFileUpload = async (file: File) => {
    // Validate file
    if (!ALLOWED_FILE_TYPES.includes(file.type)) {
      setError("File type not supported");
      return;
    }

    if (file.size > MAX_FILE_SIZE) {
      setError(`File too large. Maximum size is ${MAX_FILE_SIZE / (1024 * 1024)}MB`);
      return;
    }

    const controller = new AbortController();
    abortControllerRef.current = controller;
    try {
      await uploadFile(file); // uploadFile already uses context controller + progress
      setSuccess(true);
    } catch (err) {
      console.error(err);
    } finally {
      if (fileInputRef.current) fileInputRef.current.value = '';
    }
  
  };

  const handleButtonClick = () => {
    fileInputRef.current?.click();
  };

  return (
    <>
      <Paper
        onDragOver={handleDragOver}
        onDragLeave={handleDragLeave}
        onDrop={handleDrop}
        sx={{
          position: 'relative',
          p: 3,
          mb: 3,
          border: 'none',
          borderColor: dragging ? 'primary.main' : 'divider',
          backgroundColor: dragging ? 'rgba(25, 118, 210, 0.04)' : 'background.paper',
          transition: 'all 0.2s ease-in-out',
        }}
      >


      {/* ── UPLOAD STATUS MESSAGE ── */}
      {uploading && (
        <Typography
          variant="body2"
          align="center"
          sx={{
            mt: 0,                  // no gap above (directly under LinearProgress)
            mb: 0,                  // no gap below before the next row
            fontSize: '0.75rem',    // shrink text more
            lineHeight: 1.2,        // tighter line-height
           '& .dots': {
              animation: 'dots 1s steps(5,end) infinite',
            },
          }}
        >

          {/* wave-gradient text */}
          <span className="wave-text">
            File is being uploaded to SwarupDrive. Hold on please
          </span>
          <span className="dots">...</span>
        </Typography>
      )}
        
      {/* ── GOOGLE‑CLASSROOM‑STYLE PROGRESS LINE ── */}
      {uploading && (
        <LinearProgress
          color="warning"
          sx={{
            position: 'absolute',
            top: 0,
            left: 0,
            right: 0,
            height: 4,
          }}
        />
      )}

      {/* ── INLINE UPLOAD STATUS ── */}
      {uploading && (
        <Box
          sx={{
            display: 'flex',
            justifyContent: 'center',
            alignItems: 'center',
            gap: 1.5,
            mb: 1,
          }}
        >
          <CircularProgress size={24} />
          <Typography variant="body2">{uploadProgress}% processed</Typography>
          <Button
            size="small"
            color="error"
            onClick={cancelUpload}
            sx={{ textTransform: 'none', minWidth: 'auto', p: 0 }}
          >
            Cancel
          </Button>
        </Box>
      )}

        <Box
          sx={{
            display: 'flex',
            flexDirection: 'column',
            alignItems: 'center',
            py: 2,
          }}
        >
          <input
            type="file"
            accept={ALLOWED_FILE_TYPES.join(',')}
            style={{ display: 'none' }}
            onChange={handleFileChange}
            ref={fileInputRef}
          />
          
          {!uploading && (
            <UploadIcon sx={{ fontSize: 40, color: 'primary.main', mb: 2 }} />
          )}
          {uploading && null}
          
          <Typography variant="h6" component="h2" gutterBottom align="center">
            {dragging
              ? "Drop file here"
              : "Drag & drop file here or click to browse"}
          </Typography>
          
          <Typography variant="body2" color="text.secondary" align="center" sx={{ mb: 2 }}>
            Supported file types: PDF, TXT, DOC, DOCX, JPG, PNG, GIF, MP4, MP3 (Max: 50MB)
          </Typography>
          
          <Button
            variant="contained"
            onClick={handleButtonClick}
            startIcon={<UploadIcon />}
            disabled={uploading}
          >
            Upload File
          </Button>
        </Box>
      </Paper>

      <Snackbar 
        open={!!error}
        autoHideDuration={6000}
        onClose={() => setError(null)}
      >
        <Alert onClose={() => setError(null)} severity="error" sx={{ width: '100%' }}>
          {error}
        </Alert>
      </Snackbar>

      <Snackbar
        open={success}
        autoHideDuration={3000}
        onClose={() => setSuccess(false)}
      >
        <Alert onClose={() => setSuccess(false)} severity="success" sx={{ width: '100%' }}>
          File uploaded successfully!
        </Alert>
      </Snackbar>
    </>
  );
};

export default FileUpload;
