const { uploadToCloudinary } = require('./cloudinaryService');

const uploadVideo = async (filePath, fileName) => {
  try {
    console.log('Uploading video to Cloudinary...');
    const cloudinaryResult = await uploadToCloudinary(filePath, fileName);
    return cloudinaryResult;
  } catch (error) {
    console.error('Cloudinary upload failed:', error.message);
    throw new Error(`Upload failed: ${error.message}`);
  }
};

module.exports = { uploadVideo };
