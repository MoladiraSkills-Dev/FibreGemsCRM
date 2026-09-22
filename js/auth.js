/**
 * FibreGems CRM — Auth & Session Management
 * Zero-footprint volatile sessions via sessionStorage.
 * Survives page navigation, clears when the tab/window is closed.
 */

// ── Session Guards ───────────────────────────────────────────

/**
 * Redirect to login if not authenticated.
 * Call this on page load for protected pages.
 */
function requireAuth() {
  if (!session || !session.token) {
    window.location.href = 'index.html';
    return false;
  }
  return true;
}

/**
 * Redirect to login if not authenticated OR not an Admin.
 */
function requireAdmin() {
  if (!requireAuth()) return false;
  if (session.role !== 'Admin') {
    alert('Access denied. Admin privileges required.');
    window.location.href = 'index.html';
    return false;
  }
  return true;
}

// ── Login ────────────────────────────────────────────────────

async function login() {
  show('loader');
  try {
    const email = document.getElementById('l-email').value.trim();
    const password = document.getElementById('l-pass').value;

    if (!email || !password) {
      hide('loader');
      showToast('Please enter both email and password.', 'error');
      return;
    }

    // Calls 'handleLogin' via the doPost router in Code.gs
    const loginData = await callBackend('handleLogin', { email, password });
    persistSession(loginData);  // Save to sessionStorage so it survives navigation

    hide('loader');
    routeView();
  } catch (err) {
    hide('loader');
    showToast(err.message, 'error');
  }
}

/**
 * Route user to the correct dashboard based on their role.
 */
function routeView() {
  if (!session) return;
  if (session.role === 'Admin') {
    window.location.href = 'admin.html';
  } else {
    window.location.href = 'agent.html';
  }
}

/**
 * Destroy session and redirect to login.
 */
function logout() {
  clearSession();  // Wipe sessionStorage + memory
  window.location.href = 'index.html';
}

// ── UI Helpers ───────────────────────────────────────────────

function show(id) {
  const el = document.getElementById(id);
  if (el) el.classList.remove('hidden');
}

function hide(id) {
  const el = document.getElementById(id);
  if (el) el.classList.add('hidden');
}

/**
 * Show a toast notification.
 */
function showToast(message, type = 'info') {
  const container = document.getElementById('toast-container');
  if (!container) return;

  const toast = document.createElement('div');
  const colors = {
    success: 'bg-emerald-500',
    error: 'bg-red-500',
    info: 'bg-cyan-500',
    warning: 'bg-amber-500'
  };

  toast.className = `${colors[type] || colors.info} text-white px-6 py-3 rounded-lg shadow-lg flex items-center gap-3 animate-slide-in`;
  
  const icons = {
    success: '✓',
    error: '✕',
    info: 'ℹ',
    warning: '⚠'
  };

  toast.innerHTML = `
    <span class="text-lg font-bold">${icons[type] || icons.info}</span>
    <span class="text-sm font-medium">${message}</span>
  `;

  container.appendChild(toast);

  setTimeout(() => {
    toast.classList.add('animate-slide-out');
    setTimeout(() => toast.remove(), 300);
  }, 4000);
}
