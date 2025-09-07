//swarupdrive/server/index.js
import express from 'express';
import http from 'http';
import { Server } from 'socket.io';
import cors from 'cors';
import pg from 'pg';
import crypto from 'crypto';
import jwt from 'jsonwebtoken';
import bcrypt from 'bcryptjs';
import { v4 as uuidv4 } from 'uuid';
import multer from 'multer';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { parseBuffer } from 'music-metadata';
import { parseFile } from 'music-metadata';
import ffmpeg from 'fluent-ffmpeg';
import dotenv from 'dotenv';
import { createClient } from '@supabase/supabase-js';
import os from 'os'; // If needed for more detailed device info
import { getClientIp } from 'request-ip'; // Install this package to get IP from request



// Get the directory name
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

dotenv.config({ path: path.join(__dirname, '.env') });


// ─── Supabase Storage Setup ─────────────────────────────────────────────────
const supabase = createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_SERVICE_KEY
);
const BUCKET = process.env.SUPABASE_BUCKET;


const FFMPEG_BIN  = process.env.FFMPEG_PATH  || 'ffmpeg';
const FFPROBE_BIN = process.env.FFPROBE_PATH || 'ffprobe';

// resolve relative paths
const ffmpegPath  = path.resolve(__dirname, FFMPEG_BIN);
const ffprobePath = path.resolve(__dirname, FFPROBE_BIN);

ffmpeg.setFfmpegPath(ffmpegPath);
ffmpeg.setFfprobePath(ffprobePath);


console.log('Using ffmpeg:', ffmpegPath);
console.log('Using ffprobe:', ffprobePath);



const PRIVATE_KEY = fs.readFileSync(
  path.resolve(__dirname, process.env.PRIVATE_KEY_PATH),
  'utf8'
);
const PUBLIC_KEY = fs.readFileSync(
  path.resolve(__dirname, process.env.PUBLIC_KEY_PATH),
  'utf8'
);
console.log('→ Loaded DATABASE_URL =', process.env.DATABASE_URL);


// Create storage directories if they don't exist
const STORAGE_DIR = path.join(__dirname, 'storage');
if (!fs.existsSync(STORAGE_DIR)) {
  fs.mkdirSync(STORAGE_DIR, { recursive: true });
}

// Database configuration
const pool = new pg.Pool({
  connectionString: process.env.DATABASE_URL || 'postgresql://postgres:postgres@localhost:5432/securedrive',
});

// JWT configuration
const JWT_SECRET = process.env.JWT_SECRET || 'your-secret-key'; // In production, use a strong secret key

const JWT_EXPIRES_IN = '7d';

// AES encryption configuration
// AES-256-GCM configuration
// ENCRYPTION_KEY must be a 64-char hex string in your .env
const ENCRYPTION_KEY = Buffer.from(process.env.ENCRYPTION_KEY, 'hex');
if (ENCRYPTION_KEY.length !== 32) {
  throw new Error(`Invalid ENCRYPTION_KEY length: ${ENCRYPTION_KEY.length} bytes (expected 32)`);
}
// GCM recommends a 12-byte IV
const IV_LENGTH = 12;


// Multer storage configuration
const storage = multer.diskStorage({
  destination: (req, file, cb) => {
    cb(null, STORAGE_DIR);
  },
  filename: (req, file, cb) => {
    const fileId = uuidv4();
    const ext = path.extname(file.originalname);
    cb(null, `${fileId}${ext}`);
  },
});

const upload = multer({
  storage,
  limits: { fileSize: 50 * 1024 * 1024 }, // 10MB max file size
});

// Initialize Express app
const app = express();
const server = http.createServer(app);

// Allow both localhost and your Vercel front-ends
const ALLOWED_ORIGINS = [
  /^http:\/\/localhost:\d+$/,
  'https://swarupdrive.vercel.app',
  'https://swarupplay-play3.vercel.app',
];

function checkOrigin(origin, callback) {
  if (!origin) return callback(null, true);
  if (
    ALLOWED_ORIGINS.some(o =>
      typeof o === 'string' ? o === origin : o.test(origin)
    )
  ) {
    return callback(null, true);
  }
  return callback(new Error(`Origin ${origin} not allowed by CORS`));
}

app.use(
  cors({
    origin: checkOrigin,
    methods: ['GET','POST','PUT','DELETE','OPTIONS'],
    credentials: true,
    allowedHeaders: ['Content-Type','Authorization']
  })
);

// 2) Explicitly handle preflight (OPTIONS) requests
app.options('*', cors({
  origin: checkOrigin,
  methods: ['GET','POST','PUT','DELETE','OPTIONS'],
  credentials: true,
  allowedHeaders: ['Content-Type','Authorization']
}));

// Initialize Socket.io
const io = new Server(server, {
  cors: {
    origin: checkOrigin,
    methods: ['GET','POST'],
    credentials: true,
  },
});


app.use(express.json());

const JWT_EXPIRES_IN_MS = 1000 * 60 * 60 * 2; // 2 hours

// Authentication middleware (RS‑256 only)
const authenticateToken = (req, res, next) => {
  const authHeader = req.headers['authorization'];
  const token = authHeader && authHeader.split(' ')[1];

  if (!token) {
    return res.status(401).json({ message: 'Authentication required' });
  }

  jwt.verify(token, PUBLIC_KEY, { algorithms: ['RS256'] }, (err, user) => {
    if (err) {
      return res.status(403).json({ message: 'Invalid or expired token' });
    }
    req.user = user;
    next();
  });
};



// Encryption/Decryption functions

// AES-256-GCM using Base64 encoding

const encrypt = (text) => {
  const iv       = crypto.randomBytes(12); // 12-byte IV
  const cipher   = crypto.createCipheriv('aes-256-gcm', ENCRYPTION_KEY, iv);
  let encrypted  = cipher.update(text, 'utf8', 'base64');
      encrypted += cipher.final('base64');
  const authTag  = cipher.getAuthTag();

  return {
    iv:      iv.toString('base64'),        // store Base64 IV
    content: encrypted,                    // Base64 ciphertext
    authTag: authTag.toString('base64'),   // Base64 auth tag
  };
};

 const decrypt = ({ iv, content, authTag }) => {
   // Auto-detect hex vs. base64 for IV and authTag
   const isHex = (str) => /^[0-9a-fA-F]+$/.test(str);

   const ivBuf  = isHex(iv)
     ? Buffer.from(iv, 'hex')
     : Buffer.from(iv, 'base64');
   const tagBuf = isHex(authTag)
     ? Buffer.from(authTag, 'hex')
     : Buffer.from(authTag, 'base64');

   const decipher = crypto.createDecipheriv('aes-256-gcm', ENCRYPTION_KEY, ivBuf);
   decipher.setAuthTag(tagBuf);

   // Decrypt—if content was stored as base64, decode from base64; otherwise assume utf8 plaintext
   const encrypted = content;
   const isBase64  = !isHex(content);
   let decrypted = isBase64
     ? decipher.update(encrypted, 'base64', 'utf8')
     : decipher.update(encrypted, 'utf8', 'utf8');
   decrypted += decipher.final('utf8');

   return decrypted;
 };



// Initialize database tables
const initDatabase = async () => {
  try {
    // Create users table
    await pool.query(`
      CREATE TABLE IF NOT EXISTS users (
        id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
        name TEXT NOT NULL,
        email TEXT UNIQUE NOT NULL,
        password TEXT NOT NULL,
        created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
      );
    `);
    
    // Create files table
    await pool.query(`
      CREATE TABLE IF NOT EXISTS files (
        id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
        name TEXT NOT NULL,
        type TEXT NOT NULL,
        size INTEGER NOT NULL,
        storage_path TEXT NOT NULL,
        iv TEXT,
        auth_tag TEXT,
        encrypted BOOLEAN DEFAULT TRUE,
        owner_id UUID REFERENCES users(id),
        created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
        updated_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
      );
    `);
    
    // Create shares table
    await pool.query(`
      CREATE TABLE IF NOT EXISTS shares (
        id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
        file_id UUID REFERENCES files(id) ON DELETE CASCADE,
        token TEXT UNIQUE NOT NULL,
        created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
        expires_at TIMESTAMP WITH TIME ZONE
      );
    `);
    
    // Create user_files table for tracking which users have access to which files
    await pool.query(`
      CREATE TABLE IF NOT EXISTS user_files (
        user_id UUID REFERENCES users(id) ON DELETE CASCADE,
        file_id UUID REFERENCES files(id) ON DELETE CASCADE,
        permission TEXT NOT NULL DEFAULT 'read', -- 'read', 'write'
        created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
        PRIMARY KEY (user_id, file_id)
      );
    `);


    //create music-metadata tables
    await pool.query(`
      CREATE TABLE IF NOT EXISTS music_metadata (
        file_id UUID PRIMARY KEY REFERENCES files(id) ON DELETE CASCADE,
        title TEXT,
        artist TEXT,
        album TEXT,
        cover TEXT,   -- base64 or URL of thumbnail image
        lyrics TEXT   -- optional lyrics (plain text or JSON string)
      );
    `);

    // OTP table
    await pool.query(`
      CREATE TABLE IF NOT EXISTS otps (
        id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
        user_id UUID REFERENCES users(id) ON DELETE CASCADE,
        code TEXT NOT NULL,
        expires_at TIMESTAMP WITH TIME ZONE NOT NULL,
        created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
      );
    `);

    // CRITICAL: Create play_links table for short-lived play links
    await pool.query(`
      CREATE TABLE IF NOT EXISTS play_links (
        id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
        file_id UUID NOT NULL REFERENCES files(id) ON DELETE CASCADE,
        token TEXT UNIQUE NOT NULL,
        expires_at TIMESTAMP WITH TIME ZONE NOT NULL,
        created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
      );
    `);

    // Create podcast_sessions table - FIXED: Use gen_random_uuid() instead of uuid_generate_v4()
    await pool.query(`
      CREATE TABLE IF NOT EXISTS podcast_sessions (
        id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
        name TEXT NOT NULL,
        host_id UUID NOT NULL,
        meeting_key TEXT NOT NULL UNIQUE,
        created_at TIMESTAMPTZ DEFAULT NOW()
      );
    `);

    // Face data table
    await pool.query(`
      CREATE TABLE IF NOT EXISTS face_data (
        id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
        user_id UUID REFERENCES users(id) ON DELETE CASCADE,
        descriptor JSONB NOT NULL,
        created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
      );
    `);

    
    // podcast recordings table - FIXED: Use gen_random_uuid() instead of uuid_generate_v4()
    await pool.query(`
      CREATE TABLE IF NOT EXISTS recordings (
        id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
        session_id UUID NOT NULL REFERENCES podcast_sessions(id) ON DELETE CASCADE,
        user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
        video_number INTEGER NOT NULL,
        start_time TIMESTAMPTZ NOT NULL,
        end_time TIMESTAMPTZ,
        video_url TEXT
      );
    `);

    // Video metadata table
    await pool.query(`
      CREATE TABLE IF NOT EXISTS video_metadata (
        file_id     UUID        PRIMARY KEY REFERENCES files(id) ON DELETE CASCADE,
        title       TEXT        NOT NULL,
        description TEXT,
        duration    INTEGER,     -- duration in seconds
        thumbnail   TEXT,        -- URL or base64-encoded image
        resolution  TEXT,        -- e.g. '1920x1080'
        codec       TEXT,        -- e.g. 'h264', 'vp9'
        created_at  TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
      );
    `);

    // Sessions table for JWT session tracking
    await pool.query(`
      CREATE TABLE IF NOT EXISTS sessions (
        id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
        user_id UUID REFERENCES users(id) ON DELETE CASCADE,
        ip_address TEXT NOT NULL,
        device_id TEXT NOT NULL,
        jwt_id TEXT NOT NULL,
        created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
        expires_at TIMESTAMP WITH TIME ZONE NOT NULL,
        revoked BOOLEAN DEFAULT FALSE
      );
    `);

    
    console.log('Database tables initialized successfully');
  } catch (err) {
    console.error('Error initializing database tables:', err);
  }
};

// Initialize the database
initDatabase();

// API Routes

// Auth Routes
app.post('/api/auth/register', async (req, res) => {
  const { name, email, password } = req.body;
  
  try {
    // Check if user already exists
    const existingUser = await pool.query('SELECT * FROM users WHERE email = $1', [email]);
    
    if (existingUser.rows.length > 0) {
      return res.status(400).json({ message: 'User with this email already exists' });
    }
    
    // Hash password
    const salt = await bcrypt.genSalt(10);
    const hashedPassword = await bcrypt.hash(password, salt);
    
    // Create new user
    const result = await pool.query(
      'INSERT INTO users (name, email, password) VALUES ($1, $2, $3) RETURNING id, name, email',
      [name, email, hashedPassword]
    );
    
    const user = result.rows[0];
    
    // Generate JWT token
    const token = jwt.sign(
      { id: user.id, name: user.name, email: user.email },
      PRIVATE_KEY,
      { algorithm: 'RS256', expiresIn: JWT_EXPIRES_IN }
    );
    
    res.status(201).json({
      message: 'User registered successfully',
      token,
      user: {
        id: user.id,
        name: user.name,
        email: user.email,
      },
    });
  } catch (err) {
    console.error('Registration error:', err);
    res.status(500).json({ message: 'Server error during registration' });
  }
});


app.post('/api/auth/login', async (req, res) => {
  const { email, password, deviceId } = req.body; // Ensure frontend sends deviceId

  try {
    const result = await pool.query('SELECT * FROM users WHERE email = $1', [email]);

    if (result.rows.length === 0) {
      return res.status(400).json({ message: 'Invalid credentials' });
    }

    const user = result.rows[0];
    const isPasswordValid = await bcrypt.compare(password, user.password);

    if (!isPasswordValid) {
      return res.status(400).json({ message: 'Invalid credentials' });
    }

    // Generate JWT ID and token
    const jwtId = uuidv4();
    const token = jwt.sign(
      { id: user.id, name: user.name, email: user.email, jti: jwtId },
      PRIVATE_KEY,
      { algorithm: 'RS256', expiresIn: JWT_EXPIRES_IN }
    );

    // Calculate expiry timestamp
    const now = new Date();
    const expiresAt = new Date(now.getTime() + JWT_EXPIRES_IN_MS); // define JWT_EXPIRES_IN_MS = 1000 * 60 * 60 * 24 etc.

    // Get IP Address
    const ipAddress = getClientIp(req) || req.ip || 'unknown';

    // Insert into sessions table
    await pool.query(
      `INSERT INTO sessions (user_id, ip_address, device_id, jwt_id, expires_at)
       VALUES ($1, $2, $3, $4, $5)`,
      [user.id, ipAddress, deviceId, jwtId, expiresAt]
    );

    res.json({
      message: 'Login successful',
      token,
      user: {
        id: user.id,
        name: user.name,
        email: user.email,
      },
    });
  } catch (err) {
    console.error('Login error:', err);
    res.status(500).json({ message: 'Server error during login' });
  }
});


/**
 * POST /api/auth/logout
 * - Requires: Authorization: Bearer <token>
 * - Action: Mark the matching session row as revoked = true
 */
app.post('/api/auth/logout', authenticateToken, async (req, res) => {
  try {
    console.log('→ [/api/auth/logout] handler invoked');

    // 1) Ensure authenticateToken populated req.user:
    console.log('→ [/api/auth/logout] req.user payload:', req.user);
    const jwtId = req.user?.jti;
    if (!jwtId) {
      console.warn('→ [/api/auth/logout] no jti found on req.user');
      return res.status(400).json({ message: 'Invalid token: missing jti' });
    }

    // 2) Before flipping anything, check whether that jwt_id even exists in sessions:
    const { rows: existingRows } = await pool.query(
      `SELECT id, jwt_id, revoked, created_at 
         FROM sessions 
        WHERE jwt_id = $1`,
      [jwtId]
    );
    console.log('→ [/api/auth/logout] lookup sessions by jwt_id:', existingRows);
    if (existingRows.length === 0) {
      console.warn(`→ [/api/auth/logout] no session row found for jwt_id = ${jwtId}`);
      return res.status(404).json({ message: 'Session not found (already revoked or invalid)' });
    }

    // 3) Flip revoked = true on that exact row:
    const updateResult = await pool.query(
      `UPDATE sessions
         SET revoked = true
       WHERE jwt_id = $1`,
      [jwtId]
    );
    console.log(`→ [/api/auth/logout] sessions rows updated:`, updateResult.rowCount);

    // 4) Success
    return res.json({ message: 'Logout successful' });
  } catch (err) {
    console.error('Logout error:', err);
    return res.status(500).json({ message: 'Server error during logout' });
  }
});


app.get('/api/auth/me', authenticateToken, (req, res) => {
  res.json({
    user: {
      id: req.user.id,
      name: req.user.name,
      email: req.user.email,
    },
  });
});

// File Routes
app.get('/api/files', authenticateToken, async (req, res) => {
  try {
    const result = await pool.query(
      `SELECT f.id, f.name, f.type, f.size, f.created_at, f.updated_at, f.owner_id,
       CASE WHEN s.id IS NOT NULL THEN true ELSE false END as is_shared
       FROM files f
       LEFT JOIN shares s ON f.id = s.file_id
       WHERE f.owner_id = $1
       OR f.id IN (
         SELECT file_id FROM user_files WHERE user_id = $1
       )
       ORDER BY f.updated_at DESC`,
      [req.user.id]
    );
    
    res.json({ files: result.rows });
  } catch (err) {
    console.error('Error fetching files:', err);
    res.status(500).json({ message: 'Failed to fetch files' });
  }
});

app.post(
  '/api/files/upload',
  authenticateToken,
  upload.single('file'),
  async (req, res) => {
    if (!req.file) {
      return res.status(400).json({ message: 'No file uploaded' });
    }

    // Destructure the uploaded file info:
    const { originalname, mimetype, size, path: filePath } = req.file;

    // We'll collect audio metadata (if any) here before deleting the file:
    let audioCommon = null;   // Will hold ID3 tags (title, artist, album)
    let audioCover  = null;   // Base64 cover, if present

    // If it's a text file (e.g. plain .txt), encrypt its contents IN PLACE first:
    let iv      = null;
    let authTag = null;

    try {
      if (mimetype === 'text/plain') {
        // 1) Read plaintext from disk:
        const plaintext = fs.readFileSync(filePath, 'utf8');

        // 2) Encrypt to AES-256-GCM (Base64 output):
        const encrypted = encrypt(plaintext);
        iv      = encrypted.iv;
        authTag = encrypted.authTag;

        // 3) Overwrite the disk file with Base64 ciphertext:
        fs.writeFileSync(filePath, encrypted.content, 'utf8');
      }

      // If it's an audio file, extract ID3 metadata BEFORE deleting the file:
      if (mimetype.startsWith('audio/')) {
        // 1) Read the (possibly encrypted) buffer from disk:
        const bufferOnDisk = fs.readFileSync(filePath);

        let parseBufferSource = bufferOnDisk;

        // 2) If we encrypted it above, decrypt to get plaintext for parseBuffer:
        if (iv && authTag) {
          // decrypt() expects { iv, content, authTag }, where content is Base64 ciphertext
          // Our `bufferOnDisk` holds Base64 ciphertext as UTF-8 string:
          const base64Cipher = bufferOnDisk.toString('utf8');
          const decryptedText = decrypt({
            iv:      iv,
            content: base64Cipher,
            authTag: authTag,
          });
          parseBufferSource = Buffer.from(decryptedText, 'utf8');
        }

        // 3) Parse ID3 tags:
        const metadata = await parseBuffer(parseBufferSource, mimetype);
        const common   = metadata.common;
        audioCommon = {
          title:  common.title  || null,
          artist: common.artist || null,
          album:  common.album  || null,
        };

        // 4) If cover art exists, build a data URI:
        if (common.picture && common.picture.length) {
          const pic       = common.picture[0];
          const base64Img = Buffer.from(pic.data).toString('base64');
          audioCover = `data:${pic.format};base64,${base64Img}`;
        }
      }

      // If it's a video file, we'll handle ffmpeg metadata *after* uploading and DB insert,
      // because ffprobe might take a moment (and can run async). We'll capture metadata in a callback.
      const isVideo = mimetype.startsWith('video/');

      // 5) Read the (possibly encrypted) file buffer for Supabase upload:
      const fileBuffer = fs.readFileSync(filePath);

      // 6) Upload to Supabase Storage:
      const key = `${uuidv4()}${path.extname(originalname)}`;
      const { error: uploadError } = await supabase
        .storage
        .from(BUCKET)
        .upload(key, fileBuffer, { contentType: mimetype });
      if (uploadError) {
        throw uploadError;
      }

      // 7) Insert record into `files` table (with iv/authTag if text):
      const insertFileResult = await pool.query(
        `INSERT INTO files
           (name, type, size, storage_path, iv, auth_tag, owner_id)
         VALUES ($1,$2,$3,$4,$5,$6,$7)
         RETURNING id, name, type, size, created_at, updated_at, owner_id`,
        [originalname, mimetype, size, key, iv, authTag, req.user.id]
      );
      const newFile = insertFileResult.rows[0];
      const newFileId = newFile.id;

      // 8) Grant write permission to owner in user_files:
      await pool.query(
        `INSERT INTO user_files (user_id, file_id, permission)
         VALUES ($1, $2, 'write')`,
        [req.user.id, newFileId]
      );

      // 9) If this was an audio file, insert into music_metadata using what we parsed earlier:
      if (audioCommon) {
        await pool.query(
          `INSERT INTO music_metadata (file_id, title, artist, album, cover, lyrics)
           VALUES ($1, $2, $3, $4, $5, $6)`,
          [
            newFileId,
            audioCommon.title,
            audioCommon.artist,
            audioCommon.album,
            audioCover,
            null, // lyrics (none)
          ]
        );
      }

      // 10) If it's a video file, run ffprobe now that we have newFileId and disk path:
      if (isVideo) {
        ffmpeg.ffprobe(filePath, async (err, metadata) => {
          if (err) {
            console.error('Error probing video metadata:', err);
          } else {
            try {
              const format       = metadata.format;
              const streams      = metadata.streams || [];
              const videoStream  = streams.find(s => s.codec_type === 'video');
              const durationSecs = Math.floor(format.duration || 0);
              const resolution   = videoStream
                ? `${videoStream.width}x${videoStream.height}`
                : null;

              // Optionally: generate a thumbnail (this example writes to local STORAGE_DIR)
              let thumbnailUrl = null;
              const thumbFileName = `${newFileId}_thumb.jpg`;
              await new Promise((resolve, reject) => {
                ffmpeg(filePath)
                  .screenshots({
                    timestamps: ['00:00:01.000'], // at 1 second
                    filename: thumbFileName,
                    folder: STORAGE_DIR,
                    size: '320x240',
                  })
                  .on('end', () => resolve())
                  .on('error', (e) => reject(e));
              });
              thumbnailUrl = `/storage/${thumbFileName}`;

              // Insert into video_metadata table:
              await pool.query(
                `INSERT INTO video_metadata
                   (file_id, title, duration, resolution, thumbnail, codec)
                 VALUES ($1, $2, $3, $4, $5, $6)`,
                [
                  newFileId,
                  originalname || newFile.name,
                  durationSecs,
                  resolution,
                  thumbnailUrl,
                  videoStream?.codec_name || null,
                ]
              );
            } catch (dbErr) {
              console.error('Error inserting video_metadata:', dbErr);
            }
          }
        });
      }

      // 11) NOW that we've finished uploading and inserting all metadata, remove the temp file:
      fs.unlinkSync(filePath);

      // 12) Finally, respond with success:
      return res.status(201).json({
        message: 'File uploaded successfully',
        file: {
          ...newFile,
          is_shared: false,
        },
      });
    } catch (err) {
      // If anything went wrong at any point, log & clean up:
      console.error('Error uploading file:', err);

      // If the temp file still exists on disk, try to delete it:
      if (req.file && fs.existsSync(req.file.path)) {
        try {
          fs.unlinkSync(req.file.path);
        } catch (unlinkErr) {
          console.error('Error cleaning up temp file:', unlinkErr);
        }
      }

      return res.status(500).json({ message: 'Failed to upload file' });
    }
  }
);




// GET existing share token
app.get('/api/files/:id/share', authenticateToken, async (req, res) => {
  const fileId = req.params.id;
  try {
    const result = await pool.query(
      'SELECT token FROM shares WHERE file_id = $1',
      [fileId]
    );
    if (result.rowCount === 0) {
      return res.status(404).json({ message: 'No share token for this file' });
    }
    return res.json({ token: result.rows[0].token });
  } catch (err) {
    console.error('Error fetching share token:', err);
    res.status(500).json({ message: 'Could not fetch share token' });
  }
});






app.get('/api/files/:id/content', authenticateToken, async (req, res) => {
  try {
    // 1) Access check as before…
    const { rows } = await pool.query(
      `SELECT f.* FROM files f
       JOIN user_files uf ON f.id = uf.file_id
       WHERE f.id = $1 AND uf.user_id = $2`,
      [req.params.id, req.user.id]
    );
    if (rows.length === 0) return res.status(403).json({ message: 'Access denied' });
    const file = rows[0];

    // 2) Download into a buffer
    // AFTER: add cacheControl and revalidate flags
  // Append a dummy query param based on a timestamp to force revalidation
    // Force‐bypass CDN cache by adding a "noCache" query param with current timestamp
    const cacheKey = Date.now().toString();
    const pathWithNoCache = `${file.storage_path}?noCache=${cacheKey}`;
    const { data: stream, error: downloadError, status } =
      await supabase.storage
        .from(BUCKET)
        .download(pathWithNoCache, { cacheControl: 0, revalidate: 0 });
     if (downloadError) {
        console.error(`Supabase download error (${status}):`, downloadError);
        return res.status(404).json({ message: 'File not found in storage' });
      }

   // 3) Read the Base64 ciphertext string
   const arrayBuffer = await stream.arrayBuffer();
   const buffer = Buffer.from(arrayBuffer);
   const base64Ciphertext = buffer.toString('utf8');  // Base64‐encoded ciphertext

    // █ Debug logs █
    console.log('→ [Content] file.id =', file.id);
    console.log('→ [Content] iv         =', file.iv);
    console.log('→ [Content] auth_tag   =', file.auth_tag);
    console.log('→ [Content] "encrypted" flag =', file.encrypted);
    console.log('→ [Content] ciphertext length (chars) =', base64Ciphertext.length);
    console.log('→ [Content] ciphertext sample (first 30 chars) =', base64Ciphertext.slice(0, 30));
    
   // 4) Decrypt if needed, else return plaintext directly
    let plaintext;
    if (file.encrypted && file.iv && file.auth_tag) {
      try {
        // ─── Add this log to check key length ───
        console.log('→ [DEBUG] ENCRYPTION_KEY length (bytes) =', ENCRYPTION_KEY.length);
        // ─────────────────────────────────────────
        
        plaintext = decrypt({
          iv:      file.iv,           // should be Base64 nonce
          content: base64Ciphertext,  // should be Base64 ciphertext
          authTag: file.auth_tag      // should be Base64 auth tag
        });
      } catch (decryptErr) {
        console.error('‼️ [Content] decrypt() threw:', decryptErr);
        return res
          .status(500)
          .json({ message: 'Decryption failed in /content', detail: decryptErr.message });
      }
    } else {
      // If not marked encrypted, just send the plaintext (or Base64 string)
      plaintext = base64Ciphertext;
    }

    return res.json({ content: plaintext });

  } catch (err) {
    console.error('‼️ [Content] Unexpected error:', err);
    return res.status(500).json({ message: 'Failed to get file content', detail: err.message });
  }
});

app.put('/api/files/:id/content', authenticateToken, async (req, res) => {
  const { id } = req.params;
  const { content } = req.body;
  
  if (!content) {
    return res.status(400).json({ message: 'Content is required' });
  }
  
  try {
    // Check if user has write access to file
    const accessCheck = await pool.query(
      `SELECT f.* FROM files f
       JOIN user_files uf ON f.id = uf.file_id
       WHERE f.id = $1 AND uf.user_id = $2 AND uf.permission = 'write'`,
      [id, req.user.id]
    );
    
    if (accessCheck.rows.length === 0) {
      return res.status(403).json({ message: 'You do not have write access to this file' });
    }
    
    const file = accessCheck.rows[0];
  // Encrypt content (Base64 iv/content/authTag)
  const encrypted = encrypt(content);
  // ─── Debug: log new IV/authTag/ciphertext sample ───
  console.log('→ [PUT] new iv            =', encrypted.iv);
  console.log('→ [PUT] new auth_tag      =', encrypted.authTag);
  console.log('→ [PUT] new ciphertext sample =', encrypted.content.slice(0, 30));
  // ───────────────────────────────────────────────────

      
  // 1) Push the new ciphertext to Supabase Storage
  const { error: uploadError } = await supabase
    .storage
    .from(BUCKET)
    .update(file.storage_path, Buffer.from(encrypted.content, 'utf8'));
    // ─── Debug: confirm Supabase write succeeded or log its error ───
  if (uploadError) {
    console.error('Error updating storage:', uploadError);
    return res.status(500).json({ message: 'Failed to upload updated content', detail: uploadError.message });
  }
  console.log('→ [PUT] Supabase update succeeded');
  // 2) Update iv/auth_tag in database
  await pool.query(
    `UPDATE files SET iv = $1, auth_tag = $2, updated_at = CURRENT_TIMESTAMP
     WHERE id = $3`,
    [encrypted.iv, encrypted.authTag, id]
  );

  return res.json({ message: 'File content updated successfully' });  
    
  } catch (err) {
    console.error('Error updating file content:', err);
    res.status(500).json({ message: 'Failed to update file content' });
  }
});

app.get('/api/files/:id/download', authenticateToken, async (req, res) => {
  const { id } = req.params;

  try {
    // 1) Fetch file record, bypassing access control for the service account
    let file;
    if (req.user.id === process.env.SERVICE_ACCOUNT_ID) {
      const { rows } = await pool.query(
        'SELECT * FROM files WHERE id = $1',
        [id]
      );
      if (rows.length === 0) {
        return res.status(404).json({ message: 'File not found' });
      }
      file = rows[0];
    } else {
      const { rows } = await pool.query(
        `SELECT f.* 
         FROM files f
         JOIN user_files uf ON f.id = uf.file_id
         WHERE f.id = $1 AND uf.user_id = $2`,
        [id, req.user.id]
      );
      if (rows.length === 0) {
        return res.status(403).json({ message: 'You do not have access to this file' });
      }
      file = rows[0];
    }
     
    
      // 2) Download entire file from Supabase into a buffer
  const { data: stream, error: downloadError, status } =
    await supabase.storage
      .from(BUCKET)
      .download(
        file.storage_path,
        { cacheControl: 0, revalidate: 0 }
      );

      if (downloadError) {
        console.error(`Download error (status ${status}):`, downloadError);
        return res
          .status(404)
          .json({ message: 'File not found in storage', detail: downloadError.message });
      }

      // Convert stream to Buffer
      const arrayBuffer = await stream.arrayBuffer();
      const buffer = Buffer.from(arrayBuffer);

      // 3) Decrypt or send as-is
      res.setHeader('Content-Disposition', `attachment; filename="${file.name}"`);
      res.setHeader('Content-Type', file.type);

      if (file.encrypted && file.iv && file.auth_tag && file.type === 'text/plain') {
        const base64Ciphertext = buffer.toString('utf8');
        const decrypted = decrypt({ iv: file.iv, content: base64Ciphertext, authTag: file.auth_tag });
        return res.send(decrypted);
      }

      // binary or plaintext, unencrypted
      return res.send(buffer);
        
  } catch (err) {
    console.error('Error in /api/files/:id/download:', err);
    res.status(500).json({ message: 'Failed to download file' });
  }
});

app.delete('/api/files/:id/delete', authenticateToken, async (req, res) => {
  console.log('🔴 DELETE handler hit for id =', req.params.id);
  const { id } = req.params;
  
  try {
    // First, check ownership
    const ownerCheck = await pool.query(
      'SELECT * FROM files WHERE id = $1 AND owner_id = $2',
      [id, req.user.id]
    );
    console.log('ownerCheck rows:', ownerCheck.rows);
    if (ownerCheck.rows.length > 0) {
      // User is the owner: fully 
      const file = ownerCheck.rows[0];
      const filePath = path.join(STORAGE_DIR, file.storage_path);
      if (fs.existsSync(filePath)) fs.unlinkSync(filePath);
      await pool.query('DELETE FROM files WHERE id = $1', [id]);
      return res.json({ message: 'File deleted permanently by owner' });
    }
  
    // Not the owner: see if they have a user_files entry
    const accessCheck = await pool.query(
      'SELECT * FROM user_files WHERE file_id = $1 AND user_id = $2',
      [id, req.user.id]
    );
    if (accessCheck.rows.length > 0) {
      // Revoke their access only
      await pool.query(
        'DELETE FROM user_files WHERE file_id = $1 AND user_id = $2',
        [id, req.user.id]
      );
      return res.json({ message: 'Access revoked; file remains intact' });
    }
  
    // Neither owner nor shared with them
    return res.status(403).json({ message: 'You cannot delete this file or revoke access' });
  } catch (err) {
    console.error('Error deleting file:', err);
    res.status(500).json({ message: 'Failed to delete file' });
  }
});

app.post('/api/files/:id/share', authenticateToken, async (req, res) => {
  const fileId = req.params.id;

  try {
    // 1. Check ownership
    const owns = await pool.query(
      'SELECT 1 FROM files WHERE id = $1 AND owner_id = $2',
      [fileId, req.user.id]
    );
    if (owns.rowCount === 0) {
      return res.status(403).json({ message: 'You can only share files you own' });
    }

    // 2. If a share already exists, return it
    const existing = await pool.query(
      'SELECT token FROM shares WHERE file_id = $1',
      [fileId]
    );
    if (existing.rowCount > 0) {
      return res.json({ token: existing.rows[0].token });
    }

    // 3. Otherwise generate and insert a new one
    const raw = crypto.randomBytes(16).toString('hex');
    const token = `swarupdrive_share?${raw}`;
    // Create a share record (now storing the prefixed token)
    await pool.query(
      'INSERT INTO shares (file_id, token) VALUES ($1, $2)',
      [fileId, token]
    );
    res.json({ token });
  } catch (err) {
    console.error('Error sharing file:', err);
    res.status(500).json({ message: 'Failed to share file' });
  }
});

app.post('/api/files/join-team', authenticateToken, async (req, res) => {
  const { token } = req.body;
  
  if (!token) {
    return res.status(400).json({ message: 'Token is required' });
  }
  
  try {
    // Find the share by token
    const shareResult = await pool.query(
      'SELECT * FROM shares WHERE token = $1',
      [token]
    );
    
    if (shareResult.rows.length === 0) {
      return res.status(404).json({ message: 'Invalid or expired token' });
    }
    
    const share = shareResult.rows[0];
    
    // Check if user already has access to this file
    const existingAccess = await pool.query(
      'SELECT * FROM user_files WHERE user_id = $1 AND file_id = $2',
      [req.user.id, share.file_id]
    );
    
    if (existingAccess.rows.length > 0) {
      return res.status(400).json({ message: 'You already have access to this file' });
    }
    
    // Grant 'write' permission to the user
    await pool.query(
      'INSERT INTO user_files (user_id, file_id, permission) VALUES ($1, $2, $3)',
      [req.user.id, share.file_id, 'write']
    );
    
    res.json({ message: 'Successfully joined the team' });
  } catch (err) {
    console.error('Error joining team:', err);
    res.status(500).json({ message: 'Failed to join team' });
  }
});




app.post('/api/music/metadata', authenticateToken, async (req, res) => {
  const { file_id, title, artist, album, cover, lyrics } = req.body;

  try {
    // Check if file belongs to the user
    const fileCheck = await pool.query('SELECT * FROM files WHERE id = $1 AND owner_id = $2', [file_id, req.user.id]);
    if (fileCheck.rows.length === 0) {
      return res.status(403).json({ message: 'File not found or access denied' });
    }

    // Insert or update music_metadata
    const existing = await pool.query('SELECT * FROM music_metadata WHERE file_id = $1', [file_id]);

    if (existing.rows.length > 0) {
      // Update existing metadata
      await pool.query(`
        UPDATE music_metadata SET title=$2, artist=$3, album=$4, cover=$5, lyrics=$6 WHERE file_id=$1
      `, [file_id, title, artist, album, cover, lyrics]);
    } else {
      // Insert new metadata
      await pool.query(`
        INSERT INTO music_metadata (file_id, title, artist, album, cover, lyrics) VALUES ($1, $2, $3, $4, $5, $6)
      `, [file_id, title, artist, album, cover, lyrics]);
    }

    res.status(200).json({ message: 'Music metadata saved successfully' });
  } catch (err) {
    console.error('Error saving music metadata:', err);
    res.status(500).json({ message: 'Failed to save music metadata' });
  }
});


/*
 Verify a workspace-issued JWT against our `sessions` table.
 Expects: Authorization: Bearer <token>
 */

 app.get('/api/sessions/verify', async (req, res) => {
   const authHeader = req.headers.authorization;
   if (!authHeader?.startsWith('Bearer ')) return res.status(401).json({ valid: false });
   const token = authHeader.slice(7);
   try {
     const payload = jwt.verify(token, PUBLIC_KEY, { algorithms: ['RS256'] });
     const { rows } = await pool.query(
       `SELECT 1 FROM sessions
        WHERE jwt_id     = $1
          AND ip_address = $2
          AND device_id  = $3
          AND now() < expires_at
          AND NOT revoked`,
       [
         payload.jti,
         req.ip,
         req.headers['user-agent']
       ]
     );
     return res.json({ valid: rows.length > 0 });
   } catch {
     return res.status(403).json({ valid: false });
   }
 });


 // swarupdrive/server/index.js

  // ... your existing imports & middleware ...

  // at the bottom, after all the other routes:
  app.post('/api/session/validate', authenticateToken, async (req, res) => {
    const { ip, deviceId } = req.body;
    try {
      const result = await pool.query(
        `SELECT 1 FROM sessions
         WHERE user_id = $1
           AND ip_address = $2
           AND device_id = $3
           AND expires_at > now()
           AND NOT revoked`,
        [req.user.sub, ip, deviceId]
      );
      res.json({ valid: result.rowCount === 1 });
    } catch (err) {
      console.error('Session validation error:', err);
      res.status(500).json({ error: 'Session validation error' });
    }
  });




// ─── FIXED: POST /api/play-link with comprehensive error handling ───
app.post('/api/play-link', async (req, res) => {
  console.log('🎵 [/api/play-link] Request received');
  console.log('🎵 [/api/play-link] Request body:', req.body);
  
  try {
    const { fileId } = req.body;
    
    // Validate input
    if (!fileId) {
      console.error('❌ [/api/play-link] Missing fileId in request body');
      return res.status(400).json({ message: 'fileId is required' });
    }

    console.log('🎵 [/api/play-link] Processing fileId:', fileId);

    // 1) Check if file exists
    const fileCheck = await pool.query('SELECT id, name FROM files WHERE id = $1', [fileId]);
    if (fileCheck.rows.length === 0) {
      console.error('❌ [/api/play-link] File not found:', fileId);
      return res.status(404).json({ message: 'File not found' });
    }
    
    console.log('✅ [/api/play-link] File found:', fileCheck.rows[0].name);

    // 2) Generate a new random token (hex, 64 bytes → 128‐char string)
    const token = crypto.randomBytes(64).toString('hex');
    console.log('🎵 [/api/play-link] Generated token:', token.substring(0, 16) + '...');

    // 3) Compute expires_at = now + 60 seconds
    const expiresAt = new Date(Date.now() + 60 * 1000); // 60s in the future
    console.log('🎵 [/api/play-link] Token expires at:', expiresAt.toISOString());

    // 4) Insert into play_links table
    console.log('🎵 [/api/play-link] Inserting into play_links table...');
    await pool.query(
      `INSERT INTO play_links (file_id, token, expires_at)
       VALUES ($1, $2, $3)`,
      [fileId, token, expiresAt]
    );
    console.log('✅ [/api/play-link] Successfully inserted play link');

    // 5) Build the short‐lived URL that SwarupMusic will consume
    const playUrl = `https://swarupmusic.vercel.app/?playToken=${token}`;
    console.log('🎵 [/api/play-link] Generated play URL:', playUrl);

    return res.status(200).json({ playUrl });
  } catch (err) {
    console.error('❌ [/api/play-link] Detailed error:', {
      message: err.message,
      stack: err.stack,
      code: err.code,
      detail: err.detail
    });
    return res.status(500).json({ 
      message: 'Server error generating play link',
      error: err.message 
    });
  }
});




// Socket.io handling
const activeRooms = new Map(); // Map of fileId to set of active user IDs

io.use((socket, next) => {
  // Authenticate socket connection
  const token = socket.handshake.auth.token;
  
  if (!token) {
    return next(new Error('Authentication error'));
  }
  
  jwt.verify(token, PUBLIC_KEY, { algorithms: ['RS256'] }, (err, decoded) => {
    if (err) {
      return next(new Error('Authentication error'));
    }
    socket.user = decoded;
    next();
  });
});

io.on('connection', (socket) => {
  console.log(`User connected: ${socket.user.id}`);
  
  socket.on('join-edit-room', async ({ fileId }) => {
    // Check DB for write or read access
    const { rows } = await pool.query(
      `SELECT 1 FROM user_files WHERE file_id=$1 AND user_id=$2`,
      [fileId, socket.user.id]
    );
    if (rows.length === 0) {
      // Deny join—no access
      return socket.emit('error', { message: 'Access denied to this file' });
    }
    socket.join(`file:${fileId}`);
    
    // If room doesn't exist yet, initialize it
    if (!activeRooms.has(fileId)) {
      activeRooms.set(fileId, new Map());
    }
    
    // Add user to active room
    const room = activeRooms.get(fileId);
    room.set(socket.user.id, {
      id: socket.user.id,
      name: socket.user.name,
      color: socket.handshake.query.color || '#1976d2', // Default color if none provided
    });
    
    // Broadcast updated active users list
    io.to(`file:${fileId}`).emit('active-users', {
      users: Array.from(room.values()),
    });
    
    console.log(`User ${socket.user.id} joined edit room for file ${fileId}`);
  });
  
  socket.on('leave-edit-room', ({ fileId }) => {
    handleLeaveRoom(socket, fileId);
  });
  
  socket.on('content-change', ({ fileId, content, userId }) => {
    // Broadcast content changes to all other users in the room
    socket.to(`file:${fileId}`).emit('content-changed', { content, userId });
  });
  
  socket.on('disconnect', () => {
    // Remove user from all active rooms
    for (const [fileId, room] of activeRooms.entries()) {
      if (room.has(socket.user.id)) {
        handleLeaveRoom(socket, fileId);
      }
    }
    
    console.log(`User disconnected: ${socket.user.id}`);
  });
});

function handleLeaveRoom(socket, fileId) {
  socket.leave(`file:${fileId}`);
  
  if (activeRooms.has(fileId)) {
    const room = activeRooms.get(fileId);
    room.delete(socket.user.id);
    
    // If room is empty, delete it
    if (room.size === 0) {
      activeRooms.delete(fileId);
    } else {
      // Broadcast updated active users list
      io.to(`file:${fileId}`).emit('active-users', {
        users: Array.from(room.values()),
      });
    }
  }
  
  console.log(`User ${socket.user.id} left edit room for file ${fileId}`);
}

// Start the server
const PORT = process.env.PORT || 3001;

server.listen(PORT, () => {
  console.log(`Server running on port ${PORT}`);
});
