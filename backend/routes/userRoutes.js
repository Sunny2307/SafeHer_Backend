const express = require('express');
const { authenticate } = require('./authRoutes');
const { db } = require('../firebase');
const admin = require('firebase-admin');

const router = express.Router();

router.post('/saveName', authenticate, async (req, res) => {
  const { name } = req.body;

  if (!name) {
    return res.status(400).json({ error: 'Name is required' });
  }

  if (!req.user.phoneNumber) {
    return res.status(400).json({ error: 'User phone number not found in token' });
  }

  try {
    await db.collection('users').doc(req.user.phoneNumber).set(
      {
        name,
        updatedAt: admin.firestore.FieldValue.serverTimestamp(),
      },
      { merge: true }
    );
    return res.status(200).json({ message: 'Name saved successfully' });
  } catch (error) {
    console.error('Error in /user/saveName:', error);
    return res.status(500).json({ error: 'Server error' });
  }
});

router.post('/savePin', authenticate, async (req, res) => {
  const { pin, confirmPin } = req.body;

  if (!pin || !confirmPin) {
    return res.status(400).json({ error: 'PIN and confirmation PIN are required' });
  }

  if (pin !== confirmPin) {
    return res.status(400).json({ error: 'PINs do not match' });
  }

  if (!/^\d{4}$/.test(pin)) {
    return res.status(400).json({ error: 'PIN must be a 4-digit number' });
  }

  try {
    await db.collection('users').doc(req.user.phoneNumber).set(
      {
        pin,
        updatedAt: admin.firestore.FieldValue.serverTimestamp(),
      },
      { merge: true }
    );
    return res.status(200).json({ message: 'PIN saved successfully' });
  } catch (error) {
    console.error('Error in /user/savePin:', error);
    return res.status(500).json({ error: 'Server error' });
  }
});

router.post('/verifyPin', authenticate, async (req, res) => {
  const { pin } = req.body;

  if (!pin) {
    return res.status(400).json({ error: 'PIN is required' });
  }

  if (!/^\d{4}$/.test(pin)) {
    return res.status(400).json({ error: 'PIN must be a 4-digit number' });
  }

  try {
    const userRef = db.collection('users').doc(req.user.phoneNumber);
    const userDoc = await userRef.get();

    if (!userDoc.exists) {
      return res.status(404).json({ error: 'User not found' });
    }

    const user = userDoc.data();
    if (user.pin !== pin) {
      return res.status(401).json({ error: 'Incorrect PIN' });
    }

    return res.status(200).json({ message: 'PIN verified successfully' });
  } catch (error) {
    console.error('Error in /user/verifyPin:', error);
    return res.status(500).json({ error: 'Server error' });
  }
});

// Add a friend
router.post('/addFriend', authenticate, async (req, res) => {
  const { phoneNumber, isSOS, name } = req.body;

  if (!phoneNumber || phoneNumber.length !== 10 || isNaN(phoneNumber)) {
    return res.status(400).json({ error: 'Invalid phone number. Must be a 10-digit number' });
  }
  if (!name || typeof name !== 'string' || name.trim().length === 0) {
    return res.status(400).json({ error: 'Name is required and cannot be empty' });
  }

  try {
    const userDoc = await db.collection('users').doc(req.user.phoneNumber).get();
    if (!userDoc.exists) return res.status(404).json({ error: 'User not found' });

    const userData = userDoc.data();
    const friends = userData.friends || [];

    if (friends.some(friend => friend.phoneNumber === phoneNumber)) {
      return res.status(400).json({ error: 'Friend already added' });
    }

    friends.push({ phoneNumber, isSOS: !!isSOS, name: name.trim() });
    await db.collection('users').doc(req.user.phoneNumber).set({ friends }, { merge: true });

    res.json({ message: 'Friend added successfully' });
  } catch (error) {
    console.error('Error adding friend:', error);
    res.status(500).json({ error: 'Server error' });
  }
});

// Get friends
router.get('/getFriends', authenticate, async (req, res) => {
  try {
    const userDoc = await db.collection('users').doc(req.user.phoneNumber).get();
    if (!userDoc.exists) return res.status(404).json({ error: 'User not found' });

    const userData = userDoc.data();
    const friends = userData.friends || [];

    res.json({ friends });
  } catch (error) {
    console.error('Error fetching friends:', error);
    res.status(500).json({ error: 'Server error' });
  }
});

module.exports = { router };