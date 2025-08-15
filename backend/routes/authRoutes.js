const express = require('express');
const jwt = require('jsonwebtoken');
const { db } = require('../firebase'); // Import db from firebase.js

const router = express.Router();

// Middleware to verify JWT
const authenticate = (req, res, next) => {
  console.log('Authorization Header:', req.headers.authorization);
  const token = req.headers.authorization?.split('Bearer ')[1];
  if (!token) {
    return res.status(401).json({ error: 'No token provided' });
  }
  try {
    const decoded = jwt.verify(token, process.env.JWT_SECRET);
    req.user = decoded;
    next();
  } catch (error) {
    return res.status(401).json({ error: 'Invalid token' });
  }
};

// Get user profile
router.get('/getUser', authenticate, async (req, res) => {
  try {
    const userRef = db.collection('users').doc(req.user.phoneNumber);
    const userDoc = await userRef.get();

    if (!userDoc.exists) {
      return res.status(404).json({ error: 'User not found' });
    }

    const user = userDoc.data();
    delete user.password; // Don't send password in response
    return res.status(200).json(user);
  } catch (error) {
    return res.status(500).json({ error: 'Server error' });
  }
});

module.exports = { router, authenticate };