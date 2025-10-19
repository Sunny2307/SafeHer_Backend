const admin = require('firebase-admin');

// Initialize Firebase Admin using service account JSON from env var
// Render: set FIREBASE_SERVICE_ACCOUNT_KEY to the full JSON of the service account
const serviceAccountJson = process.env.FIREBASE_SERVICE_ACCOUNT_KEY;
if (!serviceAccountJson) {
  throw new Error('Missing FIREBASE_SERVICE_ACCOUNT_KEY environment variable');
}

const serviceAccount = JSON.parse(serviceAccountJson);

admin.initializeApp({
  credential: admin.credential.cert(serviceAccount),
});

const db = admin.firestore();

module.exports = { admin, db };