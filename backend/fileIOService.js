const axios = require('axios');
const FormData = require('form-data');
const fs = require('fs');

const uploadToFileIO = async (filePath, fileName) => {
  try {
    console.log('Uploading to File.io...');
    
    const form = new FormData();
    form.append('file', fs.createReadStream(filePath), fileName);
    
    const response = await axios.post('https://file.io', form, {
      headers: {
        ...form.getHeaders(),
        'Accept': 'application/json',
      },
      timeout: 60000, // 60 seconds timeout
    });
    
    console.log('File.io response:', response.data);
    
    if (response.data && response.data.success) {
      console.log('File.io upload successful:', response.data.link);
      return {
        success: true,
        url: response.data.link,
        provider: 'file.io',
        expires: response.data.expiry || '14 days',
      };
    } else {
      throw new Error('File.io upload failed: ' + (response.data?.error || 'Unknown error'));
    }
  } catch (error) {
    console.error('File.io upload error:', error.message);
    console.error('Response data:', error.response?.data);
    
    // If we get HTML instead of JSON, it means the API endpoint might be different
    if (error.response?.data && typeof error.response.data === 'string' && error.response.data.includes('<html>')) {
      throw new Error('File.io API endpoint returned HTML instead of JSON. Service might be down.');
    }
    
    throw new Error('File.io upload failed: ' + (error.response?.data?.error || error.message));
  }
};

module.exports = { uploadToFileIO };
