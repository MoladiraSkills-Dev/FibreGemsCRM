/**
 * FibreGems CRM — API Client
 * Fetch wrapper for GitHub Pages -> Apps Script REST communication.
 * Includes a two-tier browser cache (sessionStorage + localStorage) for
 * near-instant re-fetches and dramatically reduced cold-start times.
 */

const API_URL = "https://script.google.com/macros/s/AKfycbyn0YWvIPLiVnY8Jt6nk-3nqbByDrjbH4P0v70W0DfUiGsivfR7QvJkuDdEnaIV0tvf/exec";

// ─────────────────────────────────────────────
// SESSION
// ─────────────────────────────────────────────
let session = null;

(function restoreSession() {
  try {
    const stored = sessionStorage.getItem('fg_session');
    if (stored) session = JSON.parse(stored);
  } catch (e) { session = null; }
})();

function persistSession(data) {
  session = data;
  try { sessionStorage.setItem('fg_session', JSON.stringify(data)); } catch (e) {}
}

function clearSession() {
  session = null;
  try { sessionStorage.removeItem('fg_session'); } catch (e) {}
  clearAllCache_();
}

// ─────────────────────────────────────────────
// BROWSER CACHE (2-tier: sessionStorage + localStorage)
// ─────────────────────────────────────────────

/** Actions whose responses can be safely cached. */
const CACHEABLE_ACTIONS = new Set([
  'getAgentWorklist', 'getAgentDailyQueue', 'getAgentActivityLog',
  'getAdminDashboard', 'getAdminMasterGrid', 'getAdminCustomerDetail', 'getAdminCallbackReport',
  'getAgentList', 'getAdminPromisedPayments'
]);

/** Actions that change data — bust cache on call. */
const MUTATING_ACTIONS = new Set([
  'handleAgentLeadUpdate', 'logCallOutcome', 'quickUpdateSalesData', 'issueNewEasyPay',
  'createAgent', 'updateAgent', 'setAgentTempPassword', 'deleteAgent',
  'adminUpdateFollowUp', 'logSupportTicket', 'updateSupportTicket',
  'runAgilitySync', 'uploadAgilityReport', 'enforceLeadLifecycleRules', 'markCustomerDuplicate',
  'deleteCustomer', 'deleteDuplicateCustomers'
]);

const CACHE_PREFIX = 'fg_cache_';
const SESSION_TTL  = 60 * 1000;        // 1 min  — sessionStorage (same-tab instant repeat)
const LOCAL_TTL    = 4 * 60 * 1000;    // 4 mins — localStorage   (cross-tab / page reload)

function makeCacheKey_(action, payload) {
  return CACHE_PREFIX + action + '_' + JSON.stringify(payload || {});
}

function readCache_(key) {
  // 1. Check sessionStorage first (fastest - no disk IO)
  try {
    const raw = sessionStorage.getItem(key);
    if (raw) {
      const parsed = JSON.parse(raw);
      if (Date.now() - parsed.ts < parsed.ttl) return parsed.data;
      sessionStorage.removeItem(key);
    }
  } catch (e) {}

  // 2. Fall back to localStorage (survives page reload)
  try {
    const raw = localStorage.getItem(key);
    if (raw) {
      const parsed = JSON.parse(raw);
      if (Date.now() - parsed.ts < parsed.ttl) {
        // Promote to sessionStorage for faster next access
        try { sessionStorage.setItem(key, raw); } catch (e) {}
        return parsed.data;
      }
      localStorage.removeItem(key);
    }
  } catch (e) {}

  return null;
}

function writeCache_(key, data) {
  const sessionEntry = JSON.stringify({ data, ts: Date.now(), ttl: SESSION_TTL });
  const localEntry   = JSON.stringify({ data, ts: Date.now(), ttl: LOCAL_TTL });
  try { sessionStorage.setItem(key, sessionEntry); } catch (e) {}
  try { localStorage.setItem(key, localEntry); } catch (e) {}
}

function clearAllCache_() {
  try {
    Object.keys(sessionStorage)
      .filter(k => k.startsWith(CACHE_PREFIX))
      .forEach(k => sessionStorage.removeItem(k));
    Object.keys(localStorage)
      .filter(k => k.startsWith(CACHE_PREFIX))
      .forEach(k => localStorage.removeItem(k));
  } catch (e) {}
}

// ─────────────────────────────────────────────
// MAIN FETCH WRAPPER
// ─────────────────────────────────────────────

/**
 * Universal fetch wrapper for the doPost router.
 * Uses Content-Type: text/plain to avoid CORS preflight on Apps Script.
 *
 * @param {string}  action
 * @param {object}  payload
 * @param {object}  opts
 * @param {boolean} opts.skipCache  - Force a live fetch even for cacheable actions
 */
async function callBackend(action, payload = {}, opts = {}) {
  const loader = document.getElementById('global-loader');

  // --- CACHE READ ---
  const isCacheable = CACHEABLE_ACTIONS.has(action) && !opts.skipCache;
  if (isCacheable) {
    const cacheKey = makeCacheKey_(action, payload);
    const cached = readCache_(cacheKey);
    if (cached !== null) {
      console.debug('[cache HIT]', action);
      return cached;
    }
  }

  // Show loader only for live (non-cached), non-background fetches
  if (loader && !opts.skipCache) loader.classList.remove('hidden');

  // --- CACHE BUST for mutations ---
  if (MUTATING_ACTIONS.has(action)) {
    clearAllCache_();
  }

  let response;
  try {
    response = await fetch(API_URL, {
      method: 'POST',
      redirect: 'follow',
      headers: { 'Content-Type': 'text/plain' },
      body: JSON.stringify({
        action,
        payload,
        token: session ? session.token : null
      })
    });
  } catch (networkError) {
    if (loader) loader.classList.add('hidden');
    console.error('Network/CORS Error:', networkError);
    throw new Error(
      'Cannot reach the server. Check that your Apps Script Web App is deployed with access set to "Anyone" (not "Anyone with Google account").'
    );
  }

  if (!response.ok) {
    if (loader) loader.classList.add('hidden');
    console.error('HTTP Error:', response.status, response.statusText);
    throw new Error(`Server returned ${response.status}. Re-deploy your Apps Script Web App.`);
  }

  let result;
  try {
    result = await response.json();
  } catch (parseError) {
    if (loader) loader.classList.add('hidden');
    console.error('JSON Parse Error -- server may have returned an HTML error page');
    throw new Error('Unexpected server response. Check the Apps Script execution log for errors.');
  }

  if (loader) loader.classList.add('hidden');

  if (result.status === 'error') {
    throw new Error(result.message || 'Unknown server error.');
  }

  // --- CACHE WRITE ---
  if (isCacheable) {
    const cacheKey = makeCacheKey_(action, payload);
    writeCache_(cacheKey, result.data);
    console.debug('[cache SET]', action);
  }

  return result.data;
}
