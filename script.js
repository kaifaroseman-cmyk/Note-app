/**
 * ============================================================
 *  script.js  —  Noted front-end SPA controller
 * ============================================================
 *
 * This file is the entire front-end application logic.
 * It speaks to the Express API via fetch() and updates the DOM.
 *
 * Sections:
 *  1.  State          — in-memory app state
 *  2.  API helpers    — thin wrapper around fetch + auth header
 *  3.  Auth           — signup, login, logout, session restore
 *  4.  Notes CRUD     — load, create, edit, delete, pin
 *  5.  Search/filter  — debounced search, sidebar filters
 *  6.  Render         — build note cards from data
 *  7.  Modal UI       — open/close/populate note + delete modals
 *  8.  Sidebar UI     — open/close on mobile, active state
 *  9.  Toast          — transient notification helper
 * 10.  Utility        — date formatting, debounce
 * 11.  Bootstrap      — DOMContentLoaded init
 * ============================================================
 */

/* ═══════════════════════════════════════════════════════════
   1. STATE
═══════════════════════════════════════════════════════════ */

// Persisted in memory only — token also in httpOnly cookie
const state = {
  token:       null,   // JWT string
  user:        null,   // { id, name, email }
  notes:       [],     // current list of notes
  editingId:   null,   // note _id being edited (null = new)
  deletingId:  null,   // note _id queued for deletion
  selectedColor: 'default',  // colour chosen in modal
  currentTags:   [],          // tags in modal
  filter:      'all',         // 'all' | 'pinned'
  colorFilter: '',            // '' | 'amber' | 'rose' | …
  searchQuery: '',            // current search string
  searchTimer: null,          // debounce timer ref
};

// Base URL — empty string = same origin (works in dev + prod)
const BASE = '';

/* ═══════════════════════════════════════════════════════════
   2. API HELPERS
═══════════════════════════════════════════════════════════ */

/**
 * Wrapper around fetch that:
 *  - Prepends /api
 *  - Attaches the Authorization header when a token exists
 *  - Parses JSON and throws on non-2xx
 */
async function api(path, options = {}) {
  const headers = { 'Content-Type': 'application/json', ...options.headers };

  if (state.token) {
    headers['Authorization'] = `Bearer ${state.token}`;
  }

  const res = await fetch(`${BASE}/api${path}`, { ...options, headers });
  const data = await res.json().catch(() => ({}));

  if (!res.ok) {
    throw new Error(data.message || `HTTP ${res.status}`);
  }

  return data;
}

/* ═══════════════════════════════════════════════════════════
   3. AUTH
═══════════════════════════════════════════════════════════ */

// ── Tab switching ────────────────────────────────────────────
function switchTab(tab) {
  const loginForm  = document.getElementById('loginForm');
  const signupForm = document.getElementById('signupForm');
  const tabLogin   = document.getElementById('tabLogin');
  const tabSignup  = document.getElementById('tabSignup');

  if (tab === 'login') {
    loginForm.classList.remove('hidden');
    signupForm.classList.add('hidden');
    tabLogin.classList.add('active');
    tabLogin.setAttribute('aria-selected', 'true');
    tabSignup.classList.remove('active');
    tabSignup.setAttribute('aria-selected', 'false');
  } else {
    signupForm.classList.remove('hidden');
    loginForm.classList.add('hidden');
    tabSignup.classList.add('active');
    tabSignup.setAttribute('aria-selected', 'true');
    tabLogin.classList.remove('active');
    tabLogin.setAttribute('aria-selected', 'false');
  }
}

// ── Password visibility toggle ───────────────────────────────
function togglePassword(inputId, btn) {
  const input = document.getElementById(inputId);
  const icon  = btn.querySelector('i');
  if (input.type === 'password') {
    input.type = 'text';
    icon.className = 'ph ph-eye-slash';
  } else {
    input.type = 'password';
    icon.className = 'ph ph-eye';
  }
}

// ── Set token + user in state, persist token to sessionStorage ──
function setAuth(token, user) {
  state.token = token;
  state.user  = user;
  // sessionStorage so the token is cleared when the tab closes
  // (the httpOnly cookie handles server-side auth for the full 7d)
  sessionStorage.setItem('noted_token', token);
  sessionStorage.setItem('noted_user', JSON.stringify(user));
}

// ── Restore session from sessionStorage on page load ─────────
function restoreSession() {
  const token = sessionStorage.getItem('noted_token');
  const user  = sessionStorage.getItem('noted_user');
  if (token && user) {
    state.token = token;
    state.user  = JSON.parse(user);
    return true;
  }
  return false;
}

// ── Show the main app, populate user UI ─────────────────────
function showApp() {
  document.getElementById('authOverlay').classList.add('hidden');
  document.getElementById('app').classList.remove('hidden');
  document.getElementById('userName').textContent  = state.user.name;
  document.getElementById('userEmail').textContent = state.user.email;
  document.getElementById('userAvatar').textContent = state.user.name.charAt(0).toUpperCase();
}

// ── Signup ───────────────────────────────────────────────────
document.getElementById('signupForm').addEventListener('submit', async (e) => {
  e.preventDefault();
  const btn = document.getElementById('signupBtn');
  btn.disabled = true;
  btn.querySelector('span').textContent = 'Creating…';

  try {
    const data = await api('/auth/signup', {
      method: 'POST',
      body: JSON.stringify({
        name:     document.getElementById('signupName').value.trim(),
        email:    document.getElementById('signupEmail').value.trim(),
        password: document.getElementById('signupPassword').value,
      }),
    });
    setAuth(data.token, data.user);
    showApp();
    loadNotes();
    showToast('Welcome to Noted! 🎉', 'success');
  } catch (err) {
    showToast(err.message, 'error');
  } finally {
    btn.disabled = false;
    btn.querySelector('span').textContent = 'Create account';
  }
});

// ── Login ────────────────────────────────────────────────────
document.getElementById('loginForm').addEventListener('submit', async (e) => {
  e.preventDefault();
  const btn = document.getElementById('loginBtn');
  btn.disabled = true;
  btn.querySelector('span').textContent = 'Signing in…';

  try {
    const data = await api('/auth/login', {
      method: 'POST',
      body: JSON.stringify({
        email:    document.getElementById('loginEmail').value.trim(),
        password: document.getElementById('loginPassword').value,
      }),
    });
    setAuth(data.token, data.user);
    showApp();
    loadNotes();
    showToast(`Welcome back, ${data.user.name}!`, 'info');
  } catch (err) {
    showToast(err.message, 'error');
  } finally {
    btn.disabled = false;
    btn.querySelector('span').textContent = 'Sign in';
  }
});

// ── Logout ───────────────────────────────────────────────────
async function logout() {
  try {
    await api('/auth/logout', { method: 'POST' });
  } catch (_) { /* silent */ }

  state.token = null;
  state.user  = null;
  state.notes = [];
  sessionStorage.removeItem('noted_token');
  sessionStorage.removeItem('noted_user');

  document.getElementById('app').classList.add('hidden');
  document.getElementById('authOverlay').classList.remove('hidden');
  document.getElementById('notesGrid').innerHTML = '';
  showToast('Signed out.', 'info');
}

/* ═══════════════════════════════════════════════════════════
   4. NOTES CRUD
═══════════════════════════════════════════════════════════ */

// ── Load / refresh notes from the API ───────────────────────
async function loadNotes() {
  showSkeleton(true);

  try {
    // Build query string from current filters
    const params = new URLSearchParams();
    if (state.searchQuery) params.set('search',  state.searchQuery);
    if (state.colorFilter) params.set('color',   state.colorFilter);
    if (state.filter === 'pinned') params.set('pinned', 'true');

    const data = await api(`/notes?${params.toString()}`);
    state.notes = data.notes;
    renderNotes();
    updateCounts();
  } catch (err) {
    showToast('Failed to load notes: ' + err.message, 'error');
  } finally {
    showSkeleton(false);
  }
}

// ── Create or update a note ──────────────────────────────────
async function saveNote() {
  const title   = document.getElementById('noteTitle').value.trim();
  const content = document.getElementById('noteContent').value.trim();

  if (!title) { showToast('Please add a title.', 'error'); return; }
  if (!content) { showToast('Please add some content.', 'error'); return; }

  const btn = document.getElementById('saveNoteBtn');
  btn.disabled = true;
  btn.querySelector('span').textContent = 'Saving…';

  const payload = {
    title,
    content,
    tags:     state.currentTags,
    color:    state.selectedColor,
    isPinned: document.getElementById('notePinned').checked,
  };

  try {
    if (state.editingId) {
      // UPDATE existing note
      await api(`/notes/${state.editingId}`, {
        method: 'PUT',
        body: JSON.stringify(payload),
      });
      showToast('Note updated.', 'success');
    } else {
      // CREATE new note
      await api('/notes', {
        method: 'POST',
        body: JSON.stringify(payload),
      });
      showToast('Note saved!', 'success');
    }

    closeNoteModal();
    loadNotes();
  } catch (err) {
    showToast(err.message, 'error');
  } finally {
    btn.disabled = false;
    btn.querySelector('span').textContent = 'Save';
  }
}

// ── Delete a note ────────────────────────────────────────────
function openDeleteModal(id, title) {
  state.deletingId = id;
  document.getElementById('deleteNoteTitle').textContent = `"${title}"`;
  document.getElementById('deleteModal').classList.remove('hidden');
}

function closeDeleteModal() {
  state.deletingId = null;
  document.getElementById('deleteModal').classList.add('hidden');
}

async function confirmDelete() {
  if (!state.deletingId) return;

  const btn = document.getElementById('confirmDeleteBtn');
  btn.disabled = true;

  try {
    await api(`/notes/${state.deletingId}`, { method: 'DELETE' });
    closeDeleteModal();
    showToast('Note deleted.', 'success');
    loadNotes();
  } catch (err) {
    showToast(err.message, 'error');
    btn.disabled = false;
  }
}

// ── Toggle pin ───────────────────────────────────────────────
async function togglePin(id, event) {
  event.stopPropagation(); // Don't open modal when clicking pin btn
  try {
    await api(`/notes/${id}/pin`, { method: 'PATCH' });
    loadNotes();
  } catch (err) {
    showToast(err.message, 'error');
  }
}

/* ═══════════════════════════════════════════════════════════
   5. SEARCH & FILTER
═══════════════════════════════════════════════════════════ */

// Search input — debounced 400ms
document.getElementById('searchInput').addEventListener('input', (e) => {
  const val = e.target.value;
  state.searchQuery = val;

  // Show/hide clear button
  document.getElementById('searchClear').classList.toggle('hidden', !val);

  clearTimeout(state.searchTimer);
  state.searchTimer = setTimeout(loadNotes, 400);
});

function clearSearch() {
  document.getElementById('searchInput').value = '';
  document.getElementById('searchClear').classList.add('hidden');
  state.searchQuery = '';
  loadNotes();
}

// Sidebar filter: 'all' | 'pinned'
function setFilter(filter) {
  state.filter = filter;

  // Update nav active state
  document.querySelectorAll('.nav-item[data-filter]').forEach(btn => {
    btn.classList.toggle('active', btn.dataset.filter === filter);
  });

  loadNotes();
}

// Sidebar colour filter
function setColorFilter(color) {
  state.colorFilter = color;

  // Update colour chip active state
  document.querySelectorAll('.color-chip').forEach(chip => {
    chip.classList.toggle('active', chip.dataset.color === color);
  });

  loadNotes();
}

/* ═══════════════════════════════════════════════════════════
   6. RENDER
═══════════════════════════════════════════════════════════ */

function renderNotes() {
  const grid       = document.getElementById('notesGrid');
  const empty      = document.getElementById('emptyState');
  const noResults  = document.getElementById('noResults');

  grid.innerHTML = '';

  if (state.notes.length === 0) {
    grid.classList.add('hidden');
    if (state.searchQuery || state.colorFilter) {
      empty.classList.add('hidden');
      noResults.classList.remove('hidden');
    } else {
      noResults.classList.add('hidden');
      empty.classList.remove('hidden');
    }
    return;
  }

  // Have notes — hide empty states, show grid
  empty.classList.add('hidden');
  noResults.classList.add('hidden');
  grid.classList.remove('hidden');

  state.notes.forEach((note, idx) => {
    const card = buildNoteCard(note, idx);
    grid.appendChild(card);
  });
}

function buildNoteCard(note, idx) {
  const card = document.createElement('article');
  card.className = `note-card color-${note.color || 'default'}`;
  card.style.animationDelay = `${idx * 40}ms`;

  // Clicking the card body opens editor
  card.addEventListener('click', () => openNoteModal(note));

  // Formatted date
  const dateStr = formatDate(note.updatedAt);

  // Tags HTML
  const tagsHtml = note.tags && note.tags.length
    ? `<div class="note-card-tags">${note.tags.map(t => `<span class="tag-badge">#${t}</span>`).join('')}</div>`
    : '';

  card.innerHTML = `
    <div class="note-card-header">
      <h3 class="note-card-title">${escapeHtml(note.title)}</h3>
      ${note.isPinned ? '<span class="pin-indicator" title="Pinned"><i class="ph ph-push-pin-fill"></i></span>' : ''}
    </div>
    <p class="note-card-content">${escapeHtml(note.content)}</p>
    ${tagsHtml}
    <div class="note-card-footer">
      <span class="note-card-date">${dateStr}</span>
      <div class="note-card-actions">
        <button class="card-btn pin-btn" title="${note.isPinned ? 'Unpin' : 'Pin'}" onclick="togglePin('${note._id}', event)">
          <i class="ph ph-push-pin${note.isPinned ? '-fill' : ''}"></i>
        </button>
        <button class="card-btn del-btn" title="Delete" onclick="event.stopPropagation(); openDeleteModal('${note._id}', '${escapeHtml(note.title).replace(/'/g, "\'")}')">
          <i class="ph ph-trash"></i>
        </button>
      </div>
    </div>
  `;

  return card;
}

// ── Update sidebar counts ────────────────────────────────────
async function updateCounts() {
  try {
    // Fetch total + pinned counts separately (lightweight)
    const [allData, pinnedData] = await Promise.all([
      api('/notes?limit=1'),
      api('/notes?pinned=true&limit=1'),
    ]);
    document.getElementById('countAll').textContent    = allData.total;
    document.getElementById('countPinned').textContent = pinnedData.total;
  } catch (_) { /* non-critical */ }
}

/* ═══════════════════════════════════════════════════════════
   7. MODAL UI
═══════════════════════════════════════════════════════════ */

// Open note modal (no arg = new, with note = edit)
function openNoteModal(note = null) {
  const modal     = document.getElementById('noteModal');
  const titleEl   = document.getElementById('noteTitle');
  const contentEl = document.getElementById('noteContent');
  const pinnedEl  = document.getElementById('notePinned');
  const titleHead = document.getElementById('modalTitle');

  if (note) {
    // Edit mode — pre-populate fields
    state.editingId = note._id;
    titleHead.textContent    = 'Edit note';
    titleEl.value            = note.title;
    contentEl.value          = note.content;
    pinnedEl.checked         = note.isPinned;
    state.selectedColor      = note.color || 'default';
    state.currentTags        = [...(note.tags || [])];
  } else {
    // Create mode — reset fields
    state.editingId          = null;
    titleHead.textContent    = 'New note';
    titleEl.value            = '';
    contentEl.value          = '';
    pinnedEl.checked         = false;
    state.selectedColor      = 'default';
    state.currentTags        = [];
  }

  renderColorPicker(state.selectedColor);
  renderTagsInModal();
  updateCharCount();

  modal.classList.remove('hidden');
  // Focus title after animation
  setTimeout(() => titleEl.focus(), 50);
}

function closeNoteModal() {
  document.getElementById('noteModal').classList.add('hidden');
  state.editingId     = null;
  state.currentTags   = [];
  state.selectedColor = 'default';
}

// Close modal when clicking the dark overlay
function handleModalOverlayClick(e) {
  if (e.target === e.currentTarget) closeNoteModal();
}

function handleDeleteOverlayClick(e) {
  if (e.target === e.currentTarget) closeDeleteModal();
}

// ── Colour picker ────────────────────────────────────────────
function selectColor(btn, color) {
  state.selectedColor = color;
  renderColorPicker(color);
}

function renderColorPicker(activeColor) {
  document.querySelectorAll('.color-opt').forEach(opt => {
    opt.classList.toggle('active', opt.dataset.color === activeColor);
  });
}

// ── Tags ─────────────────────────────────────────────────────
document.getElementById('tagInput').addEventListener('keydown', (e) => {
  if (e.key === 'Enter' || e.key === ',') {
    e.preventDefault();
    const val = e.target.value.trim().replace(/,/g, '');
    if (val && !state.currentTags.includes(val) && state.currentTags.length < 8) {
      state.currentTags.push(val);
      renderTagsInModal();
    }
    e.target.value = '';
  }
  // Backspace on empty input removes last tag
  if (e.key === 'Backspace' && !e.target.value && state.currentTags.length) {
    state.currentTags.pop();
    renderTagsInModal();
  }
});

function removeTag(tag) {
  state.currentTags = state.currentTags.filter(t => t !== tag);
  renderTagsInModal();
}

function renderTagsInModal() {
  const list = document.getElementById('tagsList');
  list.innerHTML = state.currentTags
    .map(tag => `
      <span class="tag-pill">
        #${escapeHtml(tag)}
        <button type="button" onclick="removeTag('${escapeHtml(tag)}')" aria-label="Remove tag ${tag}">
          <i class="ph ph-x"></i>
        </button>
      </span>
    `)
    .join('');
}

// ── Character count ──────────────────────────────────────────
document.getElementById('noteContent').addEventListener('input', updateCharCount);

function updateCharCount() {
  const len = document.getElementById('noteContent').value.length;
  document.getElementById('charCount').textContent = `${len.toLocaleString()} character${len !== 1 ? 's' : ''}`;
}

/* ═══════════════════════════════════════════════════════════
   8. SIDEBAR UI
═══════════════════════════════════════════════════════════ */

function openSidebar() {
  document.getElementById('sidebar').classList.add('open');
  document.getElementById('sidebarOverlay').classList.remove('hidden');
  document.body.style.overflow = 'hidden';
}

function closeSidebar() {
  document.getElementById('sidebar').classList.remove('open');
  document.getElementById('sidebarOverlay').classList.add('hidden');
  document.body.style.overflow = '';
}

/* ═══════════════════════════════════════════════════════════
   9. TOAST NOTIFICATIONS
═══════════════════════════════════════════════════════════ */

let toastTimer = null;

function showToast(message, type = 'info') {
  const toast = document.getElementById('toast');
  toast.textContent = message;
  toast.className   = `toast ${type} show`;

  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => {
    toast.classList.remove('show');
  }, 3500);
}

/* ═══════════════════════════════════════════════════════════
   10. UTILITIES
═══════════════════════════════════════════════════════════ */

// ── Skeleton loader ──────────────────────────────────────────
function showSkeleton(show) {
  document.getElementById('skeleton').classList.toggle('hidden', !show);
  document.getElementById('notesGrid').classList.toggle('hidden', show);
  if (show) {
    document.getElementById('emptyState').classList.add('hidden');
    document.getElementById('noResults').classList.add('hidden');
  }
}

// ── Date formatter ───────────────────────────────────────────
function formatDate(iso) {
  const date = new Date(iso);
  const now  = new Date();
  const diff = now - date; // ms

  if (diff < 60_000)           return 'Just now';
  if (diff < 3_600_000)        return `${Math.floor(diff / 60_000)}m ago`;
  if (diff < 86_400_000)       return `${Math.floor(diff / 3_600_000)}h ago`;
  if (diff < 7 * 86_400_000)   return `${Math.floor(diff / 86_400_000)}d ago`;

  return date.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: date.getFullYear() !== now.getFullYear() ? 'numeric' : undefined });
}

// ── HTML escaping (prevent XSS in rendered notes) ───────────
function escapeHtml(str) {
  return String(str)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#039;');
}

// ── Keyboard shortcuts ───────────────────────────────────────
document.addEventListener('keydown', (e) => {
  // Cmd/Ctrl+K — focus search
  if ((e.metaKey || e.ctrlKey) && e.key === 'k') {
    e.preventDefault();
    document.getElementById('searchInput').focus();
  }

  // Cmd/Ctrl+N — new note
  if ((e.metaKey || e.ctrlKey) && e.key === 'n') {
    e.preventDefault();
    openNoteModal();
  }

  // Escape — close modals
  if (e.key === 'Escape') {
    closeNoteModal();
    closeDeleteModal();
    closeSidebar();
  }
});

/* ═══════════════════════════════════════════════════════════
   11. BOOTSTRAP
═══════════════════════════════════════════════════════════ */

document.addEventListener('DOMContentLoaded', async () => {
  // Try to restore session from sessionStorage
  if (restoreSession()) {
    showApp();
    loadNotes();
  }
  // Otherwise the auth overlay is already visible — no action needed
});
