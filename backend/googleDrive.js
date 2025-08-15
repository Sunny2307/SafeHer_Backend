const { google } = require('googleapis');
const fs = require('fs');
const path = require('path');

const auth = new google.auth.GoogleAuth({
  keyFile: path.join(__dirname, 'serviceAccountKey.json'),
  scopes: ['https://www.googleapis.com/auth/drive'],
});

const drive = google.drive({ version: 'v3', auth });

const uploadToGoogleDrive = async (filePath, fileName) => {
  try {
    const fileMetadata = {
      name: fileName,
      parents: ['1u73FelZqWer0bu49YqKe9doXARGgtW-4'], // Replace with your Google Drive folder ID
    };
    const media = {
      mimeType: 'video/mp4',
      body: fs.createReadStream(filePath),
    };

    const response = await drive.files.create({
      resource: fileMetadata,
      media,
      fields: 'id',
      supportsAllDrives: true, // Support Shared Drives
    });

    const fileId = response.data.id;
    await drive.permissions.create({
      fileId,
      requestBody: {
        role: 'reader',
        type: 'anyone',
      },
      supportsAllDrives: true, // Support Shared Drives for permissions
    });
    const webViewLink = `https://drive.google.com/uc?export=download&id=${fileId}`;
    return webViewLink;
  } catch (error) {
    console.error('Google Drive upload error:', error);
    throw error;
  }
};

module.exports = { uploadToGoogleDrive };