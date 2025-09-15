const express = require('express');
const cors = require('cors');
const authRoutes = require('./routes/authRoutes');
const loginRoutes = require('./routes/loginRoutes');
const userRoutes = require('./routes/userRoutes');
require('dotenv').config();
const multer = require('multer');
const { uploadVideo } = require('./uploadService');
const fs = require('fs');
const http = require('http');
const socketIo = require('socket.io');
const jwt = require('jsonwebtoken');
const { db } = require('./firebase');

const app = express();
const server = http.createServer(app);
const io = socketIo(server, {
  cors: {
    origin: "*",
    methods: ["GET", "POST"]
  }
});
const upload = multer({ dest: 'uploads/' });

// Middleware
app.use(cors());
app.use(express.json());

// Serve static files from public directory
app.use('/videos', express.static('public/videos'));

// Video Upload Route
app.post('/upload-video', upload.single('video'), async (req, res) => {
  try {
    const filePath = req.file.path;
    const fileName = `recording_${Date.now()}.mp4`;

    const result = await uploadVideo(filePath, fileName);
    fs.unlinkSync(filePath); // Clean up temporary file

    res.json({ 
      success: true, 
      videoUrl: result.url,
      provider: result.provider 
    });
  } catch (error) {
    console.error('Upload error:', error);
    res.status(500).json({ success: false, error: error.message });
  }
});

// Routes
app.use('/auth', authRoutes.router); // Correct as is
app.use('/api', loginRoutes); // Use directly
app.use('/user', userRoutes.router); // Use .router since it exports { router }

// Store active location sharing sessions
const activeLocationSessions = new Map();

// WebSocket authentication middleware
io.use(async (socket, next) => {
  try {
    const token = socket.handshake.auth.token;
    if (!token) {
      return next(new Error('Authentication error: No token provided'));
    }
    
    const decoded = jwt.verify(token, process.env.JWT_SECRET);
    socket.userId = decoded.phoneNumber;
    next();
  } catch (err) {
    next(new Error('Authentication error: Invalid token'));
  }
});

// WebSocket connection handling
io.on('connection', (socket) => {
  console.log(`User ${socket.userId} connected`);
  
  // Join user to their personal room
  socket.join(socket.userId);
  
  // Handle starting live location sharing
  socket.on('start-live-location', async (data) => {
    try {
      const { friendPhoneNumber, duration = 3600000 } = data; // Default 1 hour
      const sessionId = `${socket.userId}_${Date.now()}`;
      
      // Store session info
      activeLocationSessions.set(sessionId, {
        sharerId: socket.userId,
        friendPhoneNumber,
        startTime: Date.now(),
        duration,
        isActive: true
      });
      
      // Join friend to the session room
      socket.join(`session_${sessionId}`);
      
      // Notify friend if they're online
      socket.to(friendPhoneNumber).emit('live-location-started', {
        sessionId,
        sharerId: socket.userId,
        duration
      });
      
      socket.emit('live-location-session-created', { sessionId });
      
      // Auto-expire session after duration
      setTimeout(() => {
        if (activeLocationSessions.has(sessionId)) {
          activeLocationSessions.delete(sessionId);
          io.to(`session_${sessionId}`).emit('live-location-ended', { sessionId });
        }
      }, duration);
      
    } catch (error) {
      console.error('Error starting live location:', error);
      socket.emit('error', { message: 'Failed to start live location sharing' });
    }
  });
  
  // Handle location updates
  socket.on('location-update', (data) => {
    try {
      const { sessionId, latitude, longitude, timestamp } = data;
      const session = activeLocationSessions.get(sessionId);
      
      if (session && session.isActive) {
        // Broadcast location update to all participants in the session
        io.to(`session_${sessionId}`).emit('location-updated', {
          sessionId,
          latitude,
          longitude,
          timestamp,
          sharerId: socket.userId
        });
      }
    } catch (error) {
      console.error('Error updating location:', error);
    }
  });
  
  // Handle stopping live location
  socket.on('stop-live-location', (data) => {
    try {
      const { sessionId } = data;
      const session = activeLocationSessions.get(sessionId);
      
      if (session && session.sharerId === socket.userId) {
        activeLocationSessions.delete(sessionId);
        io.to(`session_${sessionId}`).emit('live-location-ended', { sessionId });
      }
    } catch (error) {
      console.error('Error stopping live location:', error);
    }
  });
  
  // Handle joining a live location session
  socket.on('join-live-location', (data) => {
    try {
      const { sessionId } = data;
      const session = activeLocationSessions.get(sessionId);
      
      if (session && session.isActive) {
        socket.join(`session_${sessionId}`);
        socket.emit('joined-live-location', { sessionId });
      } else {
        socket.emit('error', { message: 'Live location session not found or expired' });
      }
    } catch (error) {
      console.error('Error joining live location:', error);
    }
  });
  
  socket.on('disconnect', () => {
    console.log(`User ${socket.userId} disconnected`);
    
    // Clean up any active sessions for this user
    for (const [sessionId, session] of activeLocationSessions.entries()) {
      if (session.sharerId === socket.userId) {
        activeLocationSessions.delete(sessionId);
        io.to(`session_${sessionId}`).emit('live-location-ended', { sessionId });
      }
    }
  });
});

// Start server
const PORT = process.env.PORT || 3000;
server.listen(PORT, () => {
  console.log(`Server running on http://localhost:${PORT}`);
});
