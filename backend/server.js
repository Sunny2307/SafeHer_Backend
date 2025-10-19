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
const pushNotificationService = require('./pushNotificationService');

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

// Static file serving removed - using Cloudinary only

// Health check endpoint
app.get('/health', (req, res) => {
  res.json({ 
    status: 'OK', 
    timestamp: new Date().toISOString(),
    uptime: process.uptime()
  });
});

// Video Upload Route
app.post('/upload-video', upload.single('video'), async (req, res) => {
  try {
    if (!req.file) {
      return res.status(400).json({ 
        success: false, 
        error: 'No video file provided' 
      });
    }

    const filePath = req.file.path;
    const fileName = `recording_${Date.now()}.mp4`;
    
    console.log(`Starting upload for file: ${fileName}, size: ${req.file.size} bytes`);

    const result = await uploadVideo(filePath, fileName);
    
    // Clean up temporary file
    try {
      fs.unlinkSync(filePath);
      console.log('Temporary file cleaned up');
    } catch (cleanupError) {
      console.warn('Failed to clean up temporary file:', cleanupError.message);
    }

    console.log('Upload successful:', result.url);
    res.json({ 
      success: true, 
      videoUrl: result.url,
      provider: result.provider,
      fileSize: req.file.size
    });
  } catch (error) {
    console.error('Upload error:', error);
    
    // Clean up temporary file on error
    if (req.file && req.file.path) {
      try {
        fs.unlinkSync(req.file.path);
      } catch (cleanupError) {
        console.warn('Failed to clean up temporary file after error:', cleanupError.message);
      }
    }
    
    res.status(500).json({ 
      success: false, 
      error: error.message,
      details: process.env.NODE_ENV === 'development' ? error.stack : undefined
    });
  }
});

// Routes
app.use('/auth', authRoutes.router); // Correct as is
app.use('/api', loginRoutes); // Use directly
app.use('/user', userRoutes.router); // Use .router since it exports { router }

// Store active location sharing sessions
const activeLocationSessions = new Map();

// Store device tokens for push notifications
const deviceTokens = new Map();

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

  // Handle device token registration for push notifications
  socket.on('register-device-token', (data) => {
    try {
      const { deviceToken } = data;
      deviceTokens.set(socket.userId, deviceToken);
      console.log(`Device token registered for user ${socket.userId}`);
    } catch (error) {
      console.error('Error registering device token:', error);
    }
  });
  
  // Handle starting live location sharing
  socket.on('start-live-location', async (data) => {
    try {
      const { friendPhoneNumbers, duration = 3600000 } = data; // Support multiple friends
      const sessionId = `${socket.userId}_${Date.now()}`;
      
      // Ensure friendPhoneNumbers is an array
      const recipients = Array.isArray(friendPhoneNumbers) ? friendPhoneNumbers : [friendPhoneNumbers];
      
      // Store session info
      activeLocationSessions.set(sessionId, {
        sharerId: socket.userId,
        friendPhoneNumbers: recipients,
        startTime: Date.now(),
        duration,
        isActive: true
      });
      
      // Join the session room
      socket.join(`session_${sessionId}`);
      
      // Notify all friends via socket and push notifications
      const friendTokens = [];
      recipients.forEach(friendPhoneNumber => {
        // Send socket notification
        socket.to(friendPhoneNumber).emit('live-location-started', {
          sessionId,
          sharerId: socket.userId,
          duration
        });

        // Get device token for push notification
        const friendToken = deviceTokens.get(friendPhoneNumber);
        if (friendToken) {
          friendTokens.push(friendToken);
        }
      });

      // Send push notifications to all friends
      if (friendTokens.length > 0) {
        try {
          await pushNotificationService.sendLiveLocationRequestToMultiple(
            friendTokens,
            socket.userId, // Using userId as sharer name for now
            sessionId
          );
          console.log(`Push notifications sent to ${friendTokens.length} friends`);
        } catch (error) {
          console.error('Error sending push notifications:', error);
        }
      }
      
      socket.emit('live-location-session-created', { 
        sessionId,
        recipients: recipients.length
      });
      
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
const HOST = '0.0.0.0'; // Listen on all interfaces
server.listen(PORT, HOST, () => {
  console.log(`Server running on http://${HOST}:${PORT}`);
  console.log(`Server accessible at http://10.23.23.87:${PORT}`);
});
