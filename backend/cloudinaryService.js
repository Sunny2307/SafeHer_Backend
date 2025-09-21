const cloudinary = require('cloudinary').v2;
const fs = require('fs');

// Configure Cloudinary (you'll need to set these environment variables)
cloudinary.config({
  cloud_name: process.env.CLOUDINARY_CLOUD_NAME || 'your_cloud_name',
  api_key: process.env.CLOUDINARY_API_KEY || 'your_api_key',
  api_secret: process.env.CLOUDINARY_API_SECRET || 'your_api_secret',
});

const uploadToCloudinary = async (filePath, fileName) => {
  try {
    console.log('Uploading to Cloudinary...');
    
    const result = await cloudinary.uploader.upload(filePath, {
      resource_type: 'video',
      folder: 'safeher-videos',
      public_id: `video_${Date.now()}`,
      overwrite: true,
      invalidate: true,
      // Optimize for faster upload and processing
      eager: [
        { width: 720, height: 480, crop: 'scale', quality: 'auto' },
        { width: 480, height: 320, crop: 'scale', quality: 'auto' }
      ],
      eager_async: true, // Process transformations asynchronously for faster upload
      quality: 'auto:low', // Optimize quality for faster processing
      fetch_format: 'auto', // Let Cloudinary choose the best format
      flags: 'progressive', // Enable progressive upload
    });
    
    console.log('Cloudinary upload successful:', result.secure_url);
    return {
      success: true,
      url: result.secure_url,
      provider: 'cloudinary',
      publicId: result.public_id,
    };
  } catch (error) {
    console.error('Cloudinary upload error:', error);
    throw error;
  }
};

module.exports = { uploadToCloudinary };
