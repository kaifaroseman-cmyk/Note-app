/**
 * ============================================================
 *  routes/auth.js  —  /api/auth  endpoint handlers
 * ============================================================
 *
 * POST /api/auth/signup  →  create account, return JWT
 * POST /api/auth/login   →  verify credentials, return JWT
 * POST /api/auth/logout  →  clear cookie (client also clears token)
 * GET  /api/auth/me      →  return current user profile (protected)
 */

const express  = require('express');
const jwt      = require('jsonwebtoken');
const User     = require('../models/User');
const { protect } = require('../middleware/auth');

const router = express.Router();

// ── Helper: sign a JWT and attach it to a cookie ────────────
const signAndSend = (user, statusCode, res) => {
  const token = jwt.sign(
    { id: user._id },
    process.env.JWT_SECRET,
    { expiresIn: process.env.JWT_EXPIRES_IN || '7d' }
  );

  // httpOnly cookie so JS cannot read it (XSS protection)
  res.cookie('token', token, {
    httpOnly: true,
    secure: process.env.NODE_ENV === 'production',  // HTTPS only in prod
    sameSite: 'strict',
    maxAge: 7 * 24 * 60 * 60 * 1000,               // 7 days in ms
  });

  // Also return the token in the JSON body so the SPA can store
  // it in memory (avoids the need to rely on cookies for every env)
  res.status(statusCode).json({
    success: true,
    token,
    user: {
      id:    user._id,
      name:  user.name,
      email: user.email,
    },
  });
};

// ── POST /api/auth/signup ────────────────────────────────────
router.post('/signup', async (req, res) => {
  try {
    const { name, email, password } = req.body;

    // Basic presence check (Mongoose validators do the rest)
    if (!name || !email || !password) {
      return res.status(400).json({
        success: false,
        message: 'Please provide name, email, and password.',
      });
    }

    // Check for duplicate email before trying to insert
    const existing = await User.findOne({ email: email.toLowerCase() });
    if (existing) {
      return res.status(409).json({
        success: false,
        message: 'An account with that email already exists.',
      });
    }

    // Create user — password is hashed in the pre-save hook
    const user = await User.create({ name, email, password });

    signAndSend(user, 201, res);
  } catch (err) {
    // Surface Mongoose validation errors cleanly
    if (err.name === 'ValidationError') {
      const messages = Object.values(err.errors).map(e => e.message);
      return res.status(400).json({ success: false, message: messages.join(', ') });
    }
    console.error('Signup error:', err);
    res.status(500).json({ success: false, message: 'Server error during signup.' });
  }
});

// ── POST /api/auth/login ─────────────────────────────────────
router.post('/login', async (req, res) => {
  try {
    const { email, password } = req.body;

    if (!email || !password) {
      return res.status(400).json({
        success: false,
        message: 'Please provide email and password.',
      });
    }

    // `select('+password')` overrides the `select:false` on the field
    const user = await User.findOne({ email: email.toLowerCase() }).select('+password');

    if (!user || !(await user.comparePassword(password))) {
      // Same message for both cases — don't leak which field was wrong
      return res.status(401).json({
        success: false,
        message: 'Invalid email or password.',
      });
    }

    signAndSend(user, 200, res);
  } catch (err) {
    console.error('Login error:', err);
    res.status(500).json({ success: false, message: 'Server error during login.' });
  }
});

// ── POST /api/auth/logout ────────────────────────────────────
router.post('/logout', (req, res) => {
  // Overwrite cookie with an empty value that expires immediately
  res.cookie('token', '', { maxAge: 0, httpOnly: true });
  res.json({ success: true, message: 'Logged out successfully.' });
});

// ── GET /api/auth/me ─────────────────────────────────────────
router.get('/me', protect, (req, res) => {
  // `protect` middleware already fetched the user → just return it
  res.json({
    success: true,
    user: {
      id:        req.user._id,
      name:      req.user.name,
      email:     req.user.email,
      createdAt: req.user.createdAt,
    },
  });
});

module.exports = router;
