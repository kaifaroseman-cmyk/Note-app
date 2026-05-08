/**
 * ============================================================
 *  server.js  —  Express application entry point
 * ============================================================
 *
 * Responsibilities:
 *  1. Load environment variables from .env
 *  2. Connect to MongoDB
 *  3. Configure Express middleware (security, logging, parsing)
 *  4. Mount API routers
 *  5. Serve the static SPA for any non-API route
 *  6. Global error handler
 *  7. Start HTTP server
 *
 * Architecture at a glance:
 *
 *   Browser ──HTTP──▶ Express (server.js)
 *                          │
 *                ┌─────────┴──────────┐
 *         /api/auth/*         /api/notes/*
 *         routes/auth.js      routes/notes.js
 *                │                    │
 *           models/User.js       models/Note.js
 *                └─────────┬──────────┘
 *                     MongoDB (Mongoose)
 */

// ── Environment ──────────────────────────────────────────────
// Must be the very first require so all subsequent modules
// can read process.env values.
require('dotenv').config();

const express      = require('express');
const path         = require('path');
const helmet       = require('helmet');
const cors         = require('cors');
const morgan       = require('morgan');
const cookieParser = require('cookie-parser');
const rateLimit    = require('express-rate-limit');

const connectDB    = require('./config/db');
const authRoutes   = require('./routes/auth');
const noteRoutes   = require('./routes/notes');

// ── Connect to database ──────────────────────────────────────
connectDB();

// ── Initialise Express app ───────────────────────────────────
const app = express();

// ── Security headers (helmet sets ~14 HTTP headers) ─────────
app.use(
  helmet({
    // Allow inline scripts/styles in our single-file SPA
    contentSecurityPolicy: false,
  })
);

// ── CORS ─────────────────────────────────────────────────────
// In development the front-end may run on a different port.
// In production it's served from the same origin so CORS is
// effectively a no-op (same-origin requests don't need it).
app.use(
  cors({
    origin: process.env.NODE_ENV === 'production'
      ? false                    // same origin in prod
      : ['http://localhost:3000', 'http://localhost:5000'],
    credentials: true,           // allow cookies
  })
);

// ── Request logging (dev only) ───────────────────────────────
if (process.env.NODE_ENV !== 'production') {
  app.use(morgan('dev'));
}

// ── Body parsing ─────────────────────────────────────────────
app.use(express.json({ limit: '10kb' }));          // JSON bodies
app.use(express.urlencoded({ extended: true }));   // form bodies
app.use(cookieParser());                            // read signed cookies

// ── Rate limiting ────────────────────────────────────────────
// Auth endpoints: stricter limit to slow brute-force attacks
const authLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,   // 15 minutes
  max: 20,
  message: { success: false, message: 'Too many requests. Try again in 15 minutes.' },
  standardHeaders: true,
  legacyHeaders: false,
});

// General API limit
const apiLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 200,
  standardHeaders: true,
  legacyHeaders: false,
});

// ── API routes ───────────────────────────────────────────────
app.use('/api/auth',  authLimiter, authRoutes);
app.use('/api/notes', apiLimiter,  noteRoutes);

// ── Health check ─────────────────────────────────────────────
app.get('/api/health', (req, res) =>
  res.json({ success: true, status: 'OK', timestamp: new Date().toISOString() })
);

// ── Serve static SPA ─────────────────────────────────────────
// In production `public/` contains index.html + assets.
// Any route that isn't /api/* falls through to the SPA so the
// client-side router handles navigation.
app.use(express.static(path.join(__dirname, 'public')));

app.get('*', (req, res) => {
  // Don't serve index.html for missing API routes
  if (req.path.startsWith('/api')) {
    return res.status(404).json({ success: false, message: 'API endpoint not found.' });
  }
  res.sendFile(path.join(__dirname, 'public', 'index.html'));
});

// ── Global error handler ─────────────────────────────────────
// Express calls this whenever next(err) is invoked or an async
// route throws and isn't caught.
// eslint-disable-next-line no-unused-vars
app.use((err, req, res, next) => {
  console.error('Unhandled error:', err);
  res.status(err.statusCode || 500).json({
    success: false,
    message: err.message || 'Internal server error.',
  });
});

// ── Start server ─────────────────────────────────────────────
const PORT = process.env.PORT || 5000;

app.listen(PORT, () => {
  console.log(`🚀 Server running in ${process.env.NODE_ENV || 'development'} mode on port ${PORT}`);
});
