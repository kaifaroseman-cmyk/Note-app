/**
 * ============================================================
 *  routes/notes.js  —  /api/notes  CRUD + search endpoints
 * ============================================================
 *
 * ALL routes require authentication (`protect` middleware).
 * Every query is scoped to `req.user._id` so users can only
 * see and modify their own notes.
 *
 * GET    /api/notes          → list (+ search/filter)
 * POST   /api/notes          → create
 * GET    /api/notes/:id      → read one
 * PUT    /api/notes/:id      → update
 * DELETE /api/notes/:id      → delete
 * PATCH  /api/notes/:id/pin  → toggle isPinned
 */

const express  = require('express');
const Note     = require('../models/Note');
const { protect } = require('../middleware/auth');

const router = express.Router();

// Every notes route requires a valid JWT
router.use(protect);

// ── GET /api/notes ───────────────────────────────────────────
// Supports: ?search=keyword  ?tag=tagname  ?color=amber  ?pinned=true
router.get('/', async (req, res) => {
  try {
    const { search, tag, color, pinned, page = 1, limit = 50 } = req.query;

    // Always scope to the authenticated user
    const filter = { owner: req.user._id };

    // Full-text search across title + content (MongoDB $text index)
    if (search && search.trim()) {
      filter.$text = { $search: search.trim() };
    }

    // Filter by tag (case-insensitive)
    if (tag) {
      filter.tags = { $in: [new RegExp(`^${tag}$`, 'i')] };
    }

    // Filter by colour label
    if (color) {
      filter.color = color;
    }

    // Filter pinned notes only
    if (pinned === 'true') {
      filter.isPinned = true;
    }

    // Pagination
    const skip = (Number(page) - 1) * Number(limit);

    // Pinned notes first, then by last-updated descending
    const [notes, total] = await Promise.all([
      Note.find(filter)
          .sort({ isPinned: -1, updatedAt: -1 })
          .skip(skip)
          .limit(Number(limit)),
      Note.countDocuments(filter),
    ]);

    res.json({
      success: true,
      total,
      page:  Number(page),
      pages: Math.ceil(total / Number(limit)),
      notes,
    });
  } catch (err) {
    console.error('List notes error:', err);
    res.status(500).json({ success: false, message: 'Could not fetch notes.' });
  }
});

// ── POST /api/notes ──────────────────────────────────────────
router.post('/', async (req, res) => {
  try {
    const { title, content, tags = [], color = 'default', isPinned = false } = req.body;

    if (!title || !content) {
      return res.status(400).json({
        success: false,
        message: 'Title and content are required.',
      });
    }

    const note = await Note.create({
      title,
      content,
      tags,
      color,
      isPinned,
      owner: req.user._id,
    });

    res.status(201).json({ success: true, note });
  } catch (err) {
    if (err.name === 'ValidationError') {
      const messages = Object.values(err.errors).map(e => e.message);
      return res.status(400).json({ success: false, message: messages.join(', ') });
    }
    console.error('Create note error:', err);
    res.status(500).json({ success: false, message: 'Could not create note.' });
  }
});

// ── GET /api/notes/:id ───────────────────────────────────────
router.get('/:id', async (req, res) => {
  try {
    // `owner` check prevents one user reading another's note
    const note = await Note.findOne({ _id: req.params.id, owner: req.user._id });

    if (!note) {
      return res.status(404).json({ success: false, message: 'Note not found.' });
    }

    res.json({ success: true, note });
  } catch (err) {
    console.error('Get note error:', err);
    res.status(500).json({ success: false, message: 'Could not fetch note.' });
  }
});

// ── PUT /api/notes/:id ───────────────────────────────────────
router.put('/:id', async (req, res) => {
  try {
    const { title, content, tags, color, isPinned } = req.body;

    // Build update object from provided fields only
    const updates = {};
    if (title     !== undefined) updates.title    = title;
    if (content   !== undefined) updates.content  = content;
    if (tags      !== undefined) updates.tags     = tags;
    if (color     !== undefined) updates.color    = color;
    if (isPinned  !== undefined) updates.isPinned = isPinned;

    const note = await Note.findOneAndUpdate(
      { _id: req.params.id, owner: req.user._id },
      updates,
      { new: true, runValidators: true }
    );

    if (!note) {
      return res.status(404).json({ success: false, message: 'Note not found.' });
    }

    res.json({ success: true, note });
  } catch (err) {
    if (err.name === 'ValidationError') {
      const messages = Object.values(err.errors).map(e => e.message);
      return res.status(400).json({ success: false, message: messages.join(', ') });
    }
    console.error('Update note error:', err);
    res.status(500).json({ success: false, message: 'Could not update note.' });
  }
});

// ── DELETE /api/notes/:id ────────────────────────────────────
router.delete('/:id', async (req, res) => {
  try {
    const note = await Note.findOneAndDelete({
      _id: req.params.id,
      owner: req.user._id,
    });

    if (!note) {
      return res.status(404).json({ success: false, message: 'Note not found.' });
    }

    res.json({ success: true, message: 'Note deleted.' });
  } catch (err) {
    console.error('Delete note error:', err);
    res.status(500).json({ success: false, message: 'Could not delete note.' });
  }
});

// ── PATCH /api/notes/:id/pin ─────────────────────────────────
// Toggle the pin status without a full update
router.patch('/:id/pin', async (req, res) => {
  try {
    const note = await Note.findOne({ _id: req.params.id, owner: req.user._id });

    if (!note) {
      return res.status(404).json({ success: false, message: 'Note not found.' });
    }

    note.isPinned = !note.isPinned;
    await note.save();

    res.json({ success: true, note });
  } catch (err) {
    console.error('Pin toggle error:', err);
    res.status(500).json({ success: false, message: 'Could not toggle pin.' });
  }
});

module.exports = router;
