/**
 * ============================================================
 *  models/Note.js  —  Mongoose schema for the Note document
 * ============================================================
 *
 * Each Note belongs to one User (owner).
 * The `tags` array and `isPinned` flag enable filtering.
 * A text index on title + content powers the search feature.
 */

const mongoose = require('mongoose');

// ── Schema definition ────────────────────────────────────────
const noteSchema = new mongoose.Schema(
  {
    title: {
      type: String,
      required: [true, 'Title is required'],
      trim: true,
      maxlength: [150, 'Title cannot exceed 150 characters'],
    },

    content: {
      type: String,
      required: [true, 'Content is required'],
      trim: true,
    },

    // Reference to the owning user — used to scope all queries
    owner: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User',
      required: true,
      index: true,             // speeds up "get my notes" queries
    },

    tags: {
      type: [String],
      default: [],
    },

    isPinned: {
      type: Boolean,
      default: false,
    },

    color: {
      type: String,
      default: 'default',      // UI colour label, not a hex value
      enum: ['default', 'amber', 'rose', 'sky', 'emerald', 'violet'],
    },
  },
  {
    // Mongoose automatically adds `createdAt` and `updatedAt`
    timestamps: true,
  }
);

// ── Full-text index for search ───────────────────────────────
// MongoDB's $text operator uses this to power search queries.
noteSchema.index({ title: 'text', content: 'text' });

// ── Compound index for listing notes efficiently ─────────────
// Most common query pattern: owner + sort by updatedAt descending
noteSchema.index({ owner: 1, updatedAt: -1 });

module.exports = mongoose.model('Note', noteSchema);
