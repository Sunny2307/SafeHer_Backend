const express = require('express');
const jwt = require('jsonwebtoken');
const axios = require('axios');
const twilio = require('twilio');
const crypto = require('crypto');
const { db } = require('../firebase');
require('dotenv').config();

const router = express.Router();

// Twilio Verify configuration
const {
  TWILIO_ACCOUNT_SID,
  TWILIO_AUTH_TOKEN,
  TWILIO_VERIFY_SERVICE_SID,
} = process.env;

const twilioClient = (TWILIO_ACCOUNT_SID && TWILIO_AUTH_TOKEN)
  ? twilio(TWILIO_ACCOUNT_SID, TWILIO_AUTH_TOKEN)
  : null;

// In-memory mapping from a generated sessionId to the E.164 phone number
// This keeps the existing frontend API unchanged (it still sends sessionId + otp)
const otpSessionMap = new Map();

// Check if user exists
router.post('/checkUser', async (req, res) => {
  const { phoneNumber } = req.body;

  if (!phoneNumber) {
    return res.status(400).json({ error: 'Phone number is required' });
  }

  try {
    const userRef = db.collection('users').doc(phoneNumber);
    const userDoc = await userRef.get();

    return res.status(200).json({ exists: userDoc.exists });
  } catch (error) {
    console.error('Check user error:', error);
    return res.status(500).json({ error: 'Server error' });
  }
});

// Send OTP using Twilio Verify (SMS)
router.post('/send-otp', async (req, res) => {
  const { phoneNumber } = req.body;

  if (!phoneNumber || phoneNumber.length !== 10) {
    return res.status(400).json({ error: 'Invalid phone number' });
  }

  const fullPhoneNumber = `+91${phoneNumber}`;

  try {
    if (!twilioClient || !TWILIO_VERIFY_SERVICE_SID) {
      return res.status(500).json({ error: 'OTP service not configured' });
    }

    // Initiate Twilio Verify SMS
    await twilioClient.verify.v2.services(TWILIO_VERIFY_SERVICE_SID)
      .verifications
      .create({ to: fullPhoneNumber, channel: 'sms' });

    // Generate a sessionId to keep API compatible with the frontend
    const sessionId = (crypto.randomUUID && crypto.randomUUID())
      || `${Date.now()}_${Math.random().toString(36).slice(2, 10)}`;
    otpSessionMap.set(sessionId, fullPhoneNumber);

    res.status(200).json({ sessionId });
  } catch (error) {
    console.error('Error sending OTP via Twilio:', error.message || error);
    res.status(500).json({ error: 'Failed to send OTP' });
  }
});

// Verify OTP using Twilio Verify
router.post('/verify-otp', async (req, res) => {
  const { sessionId, otp, phoneNumber } = req.body;

  if ((!sessionId && !phoneNumber) || !otp) {
    return res.status(400).json({ error: 'Session ID or phone number and OTP are required' });
  }

  try {
    if (!twilioClient || !TWILIO_VERIFY_SERVICE_SID) {
      return res.status(500).json({ error: 'OTP service not configured' });
    }

    let toPhone = null;
    if (sessionId) {
      toPhone = otpSessionMap.get(sessionId) || null;
    }
    if (!toPhone && phoneNumber) {
      const trimmed = String(phoneNumber).replace(/\D/g, '').slice(-10);
      if (trimmed.length === 10) {
        toPhone = `+91${trimmed}`;
      }
    }
    if (!toPhone) {
      return res.status(400).json({ error: 'Invalid or expired session or phone number' });
    }

    const check = await twilioClient.verify.v2.services(TWILIO_VERIFY_SERVICE_SID)
      .verificationChecks
      .create({ to: toPhone, code: otp });

    if (check.status === 'approved') {
      // OTP was correct; we can remove the session mapping
      if (sessionId) otpSessionMap.delete(sessionId);
      return res.status(200).json({ message: 'OTP verified successfully' });
    }

    return res.status(400).json({ error: 'Invalid OTP', status: check.status });
  } catch (error) {
    console.error('Error verifying OTP via Twilio:', error?.message || error);
    res.status(400).json({ error: error?.message || 'OTP verification failed' });
  }
});

// Register route
router.post('/register', async (req, res) => {
  const { phoneNumber, password } = req.body;

  if (!phoneNumber) {
    return res.status(400).json({ error: 'Phone number is required' });
  }

  try {
    const userRef = db.collection('users').doc(phoneNumber);
    const userDoc = await userRef.get();

    if (userDoc.exists) {
      return res.status(400).json({ error: 'User already exists' });
    }

    await userRef.set({
      phoneNumber,
      password: password || null, // Password is optional since we're using PIN
      createdAt: new Date().toISOString(),
    });

    const token = jwt.sign(
      { userId: phoneNumber, phoneNumber },
      process.env.JWT_SECRET,
      { expiresIn: '7d' }
    );

    return res.status(201).json({ message: 'User registered successfully', token });
  } catch (error) {
    console.error('Register error:', error);
    return res.status(500).json({ error: 'Server error' });
  }
});

// Login route
router.post('/login', async (req, res) => {
  const { phoneNumber, password } = req.body;

  try {
    const userRef = db.collection('users').doc(phoneNumber);
    const userDoc = await userRef.get();

    if (!userDoc.exists) {
      return res.status(401).json({ error: 'Invalid phone number or password' });
    }

    const user = userDoc.data();

    // Check password or PIN as fallback
    const isValidPassword = user.password && user.password === password;
    const isValidPin = user.pin && user.pin === password;

    if (!isValidPassword && !isValidPin) {
      return res.status(401).json({ error: 'Invalid phone number or password' });
    }

    const token = jwt.sign(
      { userId: userDoc.id, phoneNumber: user.phoneNumber },
      process.env.JWT_SECRET,
      { expiresIn: '1h' }
    );

    return res.status(200).json({ token });
  } catch (error) {
    console.error('Login error:', error);
    return res.status(500).json({ error: 'Server error' });
  }
});

module.exports = router;