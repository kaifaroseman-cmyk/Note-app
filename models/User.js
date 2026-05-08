/**
 * ============================================================
 *  models/User.js  —  Mongoose schema for the User document
 * ============================================================
 *
 * Stores credentials and profile data.
 * Passwords are NEVER stored in plain text — bcrypt hashes
 * them before the document is saved (see pre-save hook below).
 */

const mongoose = require('mongoose');
const bcrypt   = require('bcryptjs');
const validator = require('validator');

// ── Schema definition ────────────────────────────────────────
const userSchema = new mongoose.Schema(
  {
    name: {
      type: String,
      required: [true, 'Name is required'],
      trim: true,
      minlength: [2,  'Name must be at least 2 characters'],
      maxlength: [50, 'Name cannot exceed 50 characters'],
    },

    email: {
      type: String,
      required: [true, 'Email is required'],
      unique: true,            // enforced by MongoDB index
      lowercase: true,
      trim: true,
      validate: {
        validator: validator.isEmail,
        message: 'Please provide a valid email address',
      },
    },

    password: {
      type: String,
      required: [true, 'Password is required'],
      minlength: [6, 'Password must be at least 6 characters'],
      select: false,           // never returned in queries by default
    },

    createdAt: {
      type: Date,
      default: Date.now,
    },
  },
  {
    // Adds `createdAt` and `updatedAt` automatically
    timestamps: true,
  }
);

// ── Pre-save hook: hash password before writing to DB ────────
userSchema.pre('save', async function (next) {
  // Only hash when the password field was actually modified
  if (!this.isModified('password')) return next();

  // Cost factor 12 → ~250ms on modern hardware (good balance)
  this.password = await bcrypt.hash(this.password, 12);
  next();
});

// ── Instance method: compare a candidate password ────────────
userSchema.methods.comparePassword = async function (candidate) {
  // `this.password` is normally excluded by `select:false`,
  // so the caller must explicitly add `.select('+password')`.
  return bcrypt.compare(candidate, this.password);
};

module.exports = mongoose.model('User', userSchema);
