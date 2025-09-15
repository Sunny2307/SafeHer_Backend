const fs = require('fs');
const path = require('path');
const { uploadToCloudinary } = require('./cloudinaryService');
const { uploadToFileIO } = require('./fileIOService');

const uploadVideo = async (filePath, fileName) => {
  try {
    // First try File.io (works immediately, no setup required)
    console.log('Attempting to upload to File.io...');
    const fileIOResult = await uploadToFileIO(filePath, fileName);
    return fileIOResult;
  } catch (error) {
    console.error('File.io upload failed:', error.message);
    
    // Try Cloudinary as second option
    try {
      console.log('Attempting to upload to Cloudinary...');
      const cloudinaryResult = await uploadToCloudinary(filePath, fileName);
      return cloudinaryResult;
    } catch (cloudinaryError) {
      console.error('Cloudinary upload failed:', cloudinaryError.message);
      
      // Fallback to local storage
      try {
        console.log('Falling back to local storage...');
        const publicDir = path.join(__dirname, 'public', 'videos');
        if (!fs.existsSync(publicDir)) {
          fs.mkdirSync(publicDir, { recursive: true });
        }
        
        const publicFilePath = path.join(publicDir, fileName);
        fs.copyFileSync(filePath, publicFilePath);
        
        const publicUrl = `http://192.168.1.201:3000/videos/${fileName}`;
        console.log('File uploaded to local storage (fallback):', publicUrl);
        return { success: true, url: publicUrl, provider: 'local-storage' };
      } catch (fallbackError) {
        console.error('All upload methods failed:', fallbackError);
        throw new Error(`Upload failed: ${error.message}`);
      }
    }
  }
};

module.exports = { uploadVideo };
