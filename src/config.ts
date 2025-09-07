//src/config.ts
// API Configuration
// If VITE_API_URL is set, use it; otherwise, assume the same host as the web page
export const API_URL = import.meta.env.VITE_API_URL
  ? import.meta.env.VITE_API_URL
  : `${window.location.protocol}//${window.location.host}`;

// For sockets, same deal—use VITE_SOCKET_URL if provided, else derive from the page URL
export const SOCKET_URL = import.meta.env.VITE_SOCKET_URL
  ? import.meta.env.VITE_SOCKET_URL
  : API_URL;


// Security Configuration
export const TOKEN_EXPIRATION = '7d'; // JWT token expiration

// File Configuration
export const MAX_FILE_SIZE = 50 * 1024 * 1024; // 10MB
export const ALLOWED_FILE_TYPES = [
  'text/plain',
  'application/pdf',
  'application/msword',
  'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
  'image/jpeg',
  'image/png',
  'image/gif',
  'video/mp4',        // MP4
  'audio/mpeg',       // MP3
];

// Editor Configuration
export const AUTOSAVE_INTERVAL = 3000; // 3 seconds
