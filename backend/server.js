const express = require('express');
const cors = require('cors');
const authRoutes = require('./routes/authRoutes');
const loginRoutes = require('./routes/loginRoutes');
const userRoutes = require('./routes/userRoutes');
require('dotenv').config();
const multer = require('multer');
const { uploadToGoogleDrive } = require('./googleDrive');
const fs = require('fs');

const app = express();
const upload = multer({ dest: 'uploads/' });

// Middleware
app.use(cors());
app.use(express.json());

// Video Upload Route
app.post('/upload-video', upload.single('video'), async (req, res) => {
  try {
    const filePath = req.file.path;
    const fileName = `recording_${Date.now()}.mp4`;

    const videoUrl = await uploadToGoogleDrive(filePath, fileName);
    fs.unlinkSync(filePath); // Clean up temporary file

    res.json({ success: true, videoUrl });
  } catch (error) {
    console.error('Upload error:', error);
    res.status(500).json({ success: false, error: error.message });
  }
});

// Routes
app.use('/auth', authRoutes.router); // Correct as is
app.use('/api', loginRoutes); // Use directly
app.use('/user', userRoutes.router); // Use .router since it exports { router }

// Start server
const PORT = process.env.PORT || 3000;
app.get('/', (req, res) => res.send('SafeHer Backend Running'));
app.listen(PORT, () => {
  console.log(`Server running on http://localhost:${PORT}`);
});
