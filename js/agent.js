/**
 * FibreGems CRM — Agent Portal Logic
 * Focuses on daily execution, dedicated Call Backs queue, 1-click outcome logging,
 * automatic order date stamping, and strict 8-day follow-up limits.
 */

// ── State ────────────────────────────────────────────────────
let currentView = 'callbacks';
let dailyQueueData = null;
let currentCallbackFilter = 'all'; // default matches the 'All' button which starts highlighted in HTML

let worklistOffset = 0;
const WORKLIST_LIMIT = 20;
let worklistTotal = 0;

let activityOffset = 0;
const ACTIVITY_LIMIT = 20;
let activityTotal = 0;

let selectedOutcomePreset = 'Callback Rescheduled';
let currentModalIsPayment = false; // tracks if current modal is for a payment follow-up

// ── Helpers ──────────────────────────────────────────────────
function getTodayStr() {
  const d = new Date();
  const year = d.getFullYear();
  const month = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
}

function addDaysToToday(days) {
  const d = new Date();
  d.setDate(d.getDate() + days);
  const year = d.getFullYear();
  const month = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
}

function escHtml(str) {
  if (!str) return '';
  return String(str).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
}

function escJs(str) {
  if (!str) return '';
  return String(str).replace(/'/g, "\\'").replace(/"/g, '\\"');
}

function showToast(msg, type = 'success') {
  const container = document.getElementById('toast-container');
  if (!container) return;
  const toast = document.createElement('div');
  const bgClass = type === 'error' ? 'bg-red-500/90 text-white' : 'bg-emerald-500/90 text-white';
  toast.className = `px-4 py-3 rounded-xl shadow-xl text-xs font-semibold backdrop-blur flex items-center gap-2 ${bgClass} animate-slide-in`;
  toast.innerHTML = `<span>${escHtml(msg)}</span>`;
  container.appendChild(toast);
  setTimeout(() => {
    toast.style.opacity = '0';
    toast.style.transform = 'translateY(-10px)';
    setTimeout(() => toast.remove(), 300);
  }, 4000);
}

function setupDatepickerLimits() {
  const today = getTodayStr();
  const max8d = addDaysToToday(8);

  const dateInputs = ['nf-next-action-date', 'co-next-date', 'qe-next-action-date'];
  dateInputs.forEach(id => {
    const el = document.getElementById(id);
    if (el) {
      el.min = today;
      el.max = max8d;
    }
  });

  // Automatic Order Date stamping
  const orderDateEl = document.getElementById('nf-order-date');
  if (orderDateEl) {
    orderDateEl.value = today;
  }
}

// ── Initialization ───────────────────────────────────────────
document.addEventListener('DOMContentLoaded', () => {
  if (!requireAuth()) return;

  document.getElementById('agent-name').textContent = session.name || 'Agent';
  document.getElementById('agent-role').textContent = session.role || 'Agent';

  setupDatepickerLimits();

  // Always load dashboard data on init — even if default view isn't callbacks
  // This populates stat-scheduled, stat-completed etc. and avoids the 0 bug
  refreshDailyData();

  // Auto-refresh every 60 seconds to surface same-day timed callbacks
  // (the 5-min-before logic runs server-side in getAgentDailyQueue)
  setInterval(() => {
    // Only silently refresh if agent is on the callbacks view
    // and no modal is open (avoids interrupting active work)
    const modalOpen = !document.getElementById('modal-call-outcome').classList.contains('hidden')
                   || !document.getElementById('modal-quick-edit').classList.contains('hidden');
    if (currentView === 'callbacks' && !modalOpen) {
      refreshDailyData();
    }
  }, 60000); // every 60 seconds
});

// ── View Switching ───────────────────────────────────────────
function switchView(view) {
  currentView = view;

  // Update nav active states
  document.querySelectorAll('[data-nav]').forEach(el => {
    el.classList.remove('bg-fiber-500/20', 'text-fiber-300', 'border-fiber-500', 'border-l-4');
    el.classList.add('text-gray-400', 'hover:text-white', 'hover:bg-white/5', 'border-transparent', 'border-l-4');
  });

  const activeNav = document.querySelector(`[data-nav="${view}"]`);
  if (activeNav) {
    activeNav.classList.add('bg-fiber-500/20', 'text-fiber-300', 'border-fiber-500');
    activeNav.classList.remove('text-gray-400', 'hover:text-white', 'hover:bg-white/5', 'border-transparent');
  }

  // Toggle views
  document.getElementById('view-callbacks').classList.toggle('hidden', view !== 'callbacks');
  document.getElementById('view-worklist').classList.toggle('hidden', view !== 'worklist');
  document.getElementById('view-newlead').classList.toggle('hidden', view !== 'newlead');
  document.getElementById('view-activity').classList.toggle('hidden', view !== 'activity');

  if (view === 'callbacks') refreshDailyData();
  else if (view === 'worklist') loadWorklist();
  else if (view === 'activity') loadActivityLog();
}

// ── Daily Queue & Call Backs ─────────────────────────────────
async function refreshDailyData() {
  const container = document.getElementById('callback-cards-container');
  container.innerHTML = `
    <div class="py-16 text-center">
      <div class="spinner mx-auto mb-3"></div>
      <p class="text-gray-400 text-sm">Syncing today's call backs...</p>
    </div>`;

  try {
    const result = await callBackend('getAgentDailyQueue');
    dailyQueueData = result;

    // Update Header KPIs
    document.getElementById('stat-scheduled').textContent = result.stats.totalScheduled;
    document.getElementById('stat-completed').textContent = result.stats.completedToday;
    document.getElementById('stat-remaining').textContent = result.stats.remainingToday;
    document.getElementById('stat-touches').textContent = result.stats.todayTouches;

    const rate = result.stats.totalScheduled > 0
      ? Math.round((result.stats.completedToday / result.stats.totalScheduled) * 100)
      : 100;

    document.getElementById('stat-progress-pct').textContent = `${rate}%`;
    document.getElementById('stat-progress-bar').style.width = `${rate}%`;
    // Show totalScheduled in nav badge so agents always see how many callbacks are due today
    document.getElementById('nav-callback-badge').textContent = result.stats.totalScheduled;

    renderCallbackCards();
  } catch (err) {
    container.innerHTML = `
      <div class="p-8 text-center text-red-400 bg-red-500/10 border border-red-500/20 rounded-2xl">
        <p class="font-semibold">Failed to load today's call backs</p>
        <p class="text-xs text-red-400/80 mt-1">${escHtml(err.message)}</p>
        <button onclick="refreshDailyData()" class="mt-3 px-4 py-1.5 bg-red-500 text-white rounded-lg text-xs font-bold hover:bg-red-600 transition-colors">Retry</button>
      </div>`;
  }
}

function setCallbackFilter(filter) {
  currentCallbackFilter = filter;
  document.querySelectorAll('[data-cb-filter]').forEach(btn => {
    btn.classList.remove('bg-fiber-500', 'text-white');
    btn.classList.add('bg-white/5', 'text-gray-400');
  });

  const activeBtn = document.querySelector(`[data-cb-filter="${filter}"]`);
  if (activeBtn) {
    activeBtn.classList.add('bg-fiber-500', 'text-white');
    activeBtn.classList.remove('bg-white/5', 'text-gray-400');
  }
  renderCallbackCards();
}

// (Old duplicate renderCallbackCards removed — see updated version below)

function copyPhone(phone) {
  if (!phone) return;
  navigator.clipboard.writeText(phone).then(() => {
    showToast(`Copied phone ${phone} to clipboard`);
  });
}

function copyReferralCode(code) {
  if (!code) return;
  navigator.clipboard.writeText(code).then(() => {
    showToast(`Copied referral code ${code} to clipboard! Share with customer.`);
  });
}

async function triggerReissueEasyPay(customerId) {
  // Prompt agent for the new EasyPay number (required)
  const newEasyPayNumber = prompt("Enter the new EasyPay Number provided by the payment gateway (required):");
  if (!newEasyPayNumber || !newEasyPayNumber.trim()) {
    showToast("Re-issue cancelled. An EasyPay number is required.", "error");
    return;
  }

  // Optionally update the Order Number
  const newOrderNumber = prompt("Enter a new Order Number (optional — leave blank to keep existing):");

  try {
    const result = await callBackend('issueNewEasyPay', {
      customerId,
      easyPayNumber: newEasyPayNumber.trim(),
      orderNumber: (newOrderNumber || '').trim()
    });
    showToast(`✅ Re-issued EasyPay: ${result.easyPayNumber} (${result.cycle}). Expires: ${result.expiryDate}.`);
    refreshDailyData();
  } catch (err) {
    showToast(err.message, "error");
  }
}

function renderCallbackCards() {
  const container = document.getElementById('callback-cards-container');
  if (!dailyQueueData) return;

  const allCallbacks = dailyQueueData.callbacks || [];
  const pendingCallbacks = allCallbacks.filter(c => !c.isCompletedToday);
  const doneCallbacks = allCallbacks.filter(c => c.isCompletedToday);

  document.getElementById('cb-count-all').textContent = allCallbacks.length;
  document.getElementById('cb-count-pending').textContent = pendingCallbacks.length;
  document.getElementById('cb-count-done').textContent = doneCallbacks.length;

  let listToDisplay = allCallbacks;
  if (currentCallbackFilter === 'pending') listToDisplay = pendingCallbacks;
  else if (currentCallbackFilter === 'completed') listToDisplay = doneCallbacks;

  if (listToDisplay.length === 0) {
    container.innerHTML = `
      <div class="p-12 text-center border border-white/5 bg-white/[0.01] rounded-2xl">
        <div class="w-14 h-14 rounded-full bg-fiber-500/10 text-fiber-400 flex items-center justify-center mx-auto mb-3 text-2xl">
          ✓
        </div>
        <h3 class="text-base font-bold text-white">No Call Backs in this filter</h3>
        <p class="text-xs text-gray-400 mt-1">Great job! All scheduled calls for today have been touched or are clear.</p>
      </div>`;
    return;
  }

  container.innerHTML = listToDisplay.map(c => {
    let formattedPhone = c.cellNumber || '';
    if (formattedPhone && !formattedPhone.toString().startsWith('0')) {
      formattedPhone = '0' + formattedPhone;
    }
    const isOverdue = c.isOverdue && !c.isCompletedToday;
    const isPayment = c.isPromisedPayment;
    const isActivation = c.isActivationFollowUp;

    // Card border colors: blue for activation check, purple for payment, amber for overdue, emerald for done
    const cardBorder = c.isCompletedToday
      ? 'border-emerald-500/20 bg-emerald-950/10'
      : isActivation
        ? 'border-blue-500/40 bg-blue-950/15'
        : isPayment
          ? (isOverdue ? 'border-purple-500/60 bg-purple-950/20' : 'border-purple-500/30 bg-purple-950/10')
          : (isOverdue ? 'border-amber-500/40 bg-amber-950/15' : 'border-white/10 bg-white/[0.02]');

    const avatarColor = c.isCompletedToday
      ? 'bg-emerald-500/20 text-emerald-300'
      : isActivation
        ? 'bg-blue-500/20 text-blue-300'
        : isPayment
          ? 'bg-purple-500/20 text-purple-300'
          : (isOverdue ? 'bg-amber-500/20 text-amber-300' : 'bg-fiber-500/20 text-fiber-300');

    return `
      <div class="p-4 rounded-2xl border ${cardBorder} hover:border-fiber-500/50 transition-all shadow-sm">
        <div class="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
          
          <!-- Client Name & Info -->
          <div class="flex items-start gap-3.5 flex-1 min-w-0">
            <div class="w-11 h-11 rounded-xl ${avatarColor} flex items-center justify-center font-bold text-base flex-shrink-0">
              ${escHtml((c.name || 'C').charAt(0))}
            </div>
            
            <div class="flex-1 min-w-0">
              <div class="flex items-center gap-2 flex-wrap">
                <h4 class="text-base font-bold text-white tracking-tight">${escHtml(c.name)}</h4>
                ${isActivation ? `<span class="px-2 py-0.5 rounded text-[10px] font-bold bg-blue-500/20 text-blue-300 border border-blue-500/30 animate-pulse">🚀 1-Week Activation Check</span>` : ''}
                ${isPayment ? `<span class="px-2 py-0.5 rounded text-[10px] font-bold bg-purple-500/20 text-purple-300 border border-purple-500/30">💳 Payment Follow-Up</span>` : ''}
                ${isOverdue && !isPayment && !isActivation ? `<span class="px-2 py-0.5 rounded text-[10px] font-bold bg-amber-500/20 text-amber-300 border border-amber-500/30">⚠️ Overdue (${c.daysOverdue}d)</span>` : ''}
                ${isOverdue && isPayment ? `<span class="px-2 py-0.5 rounded text-[10px] font-bold bg-red-500/20 text-red-300 border border-red-500/30">🔴 Payment Overdue (${c.daysOverdue}d)</span>` : ''}
                ${c.isCompletedToday ? `<span class="px-2 py-0.5 rounded text-[10px] font-bold bg-emerald-500/20 text-emerald-300 border border-emerald-500/30">✓ Done Today</span>` : ''}
              </div>

              <!-- Phone Number & Referral Code with 1-click Copy -->
              <div class="flex items-center gap-4 mt-1.5 flex-wrap">
                <div class="flex items-center gap-1.5">
                  <button onclick="copyPhone('${escJs(formattedPhone)}')" class="inline-flex items-center gap-1 text-sm font-semibold font-mono text-fiber-400 hover:text-fiber-300 transition-colors cursor-pointer text-left">
                    <svg class="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="2">
                      <path stroke-linecap="round" stroke-linejoin="round" d="M2.25 6.75c0 8.284 6.716 15 15 15h2.25a2.25 2.25 0 002.25-2.25v-1.372c0-.516-.351-.966-.852-1.091l-4.423-1.106c-.44-.11-.902.055-1.173.417l-.97 1.293c-.282.376-.769.542-1.21.38a12.035 12.035 0 01-7.143-7.143c-.162-.441.004-.928.38-1.21l1.293-.97c.363-.271.527-.734.417-1.173L6.963 3.102a1.125 1.125 0 00-1.091-.852H4.5A2.25 2.25 0 002.25 4.5v2.25z" />
                    </svg>
                    ${escHtml(formattedPhone || 'No number')}
                  </button>
                  <button onclick="copyPhone('${escJs(formattedPhone)}')" title="Copy Phone Number" class="p-1 text-gray-500 hover:text-gray-300 transition-colors">
                    <svg class="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="2">
                      <path stroke-linecap="round" stroke-linejoin="round" d="M15.666 3.888A2.25 2.25 0 0013.5 2.25h-3c-1.03 0-1.9.693-2.166 1.638m7.332 0c.055.194.084.4.084.612v0a.75.75 0 01-.75.75H9a.75.75 0 01-.75-.75v0c0-.212.03-.418.084-.612m7.332 0c.646.049 1.288.11 1.927.184 1.1.128 1.907 1.077 1.907 2.185V19.5a2.25 2.25 0 01-2.25 2.25H6.75A2.25 2.25 0 014.5 19.5V6.257c0-1.108.806-2.057 1.907-2.185a48.208 48.208 0 011.927-.184" />
                    </svg>
                  </button>
                </div>

                <!-- Referral Code Chip -->
                ${c.referralCode ? `
                  <div class="flex items-center gap-1.5 px-2 py-0.5 rounded-md bg-amber-500/10 border border-amber-500/20 text-amber-300 text-xs font-mono">
                    <span>🎁 Ref: <strong>${escHtml(c.referralCode)}</strong></span>
                    <button onclick="copyReferralCode('${escJs(c.referralCode)}')" title="Copy Referral Code" class="hover:text-white">
                      <svg class="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="2">
                        <path stroke-linecap="round" stroke-linejoin="round" d="M15.666 3.888A2.25 2.25 0 0013.5 2.25h-3c-1.03 0-1.9.693-2.166 1.638m7.332 0c.055.194.084.4.084.612v0a.75.75 0 01-.75.75H9a.75.75 0 01-.75-.75v0c0-.212.03-.418.084-.612m7.332 0c.646.049 1.288.11 1.927.184 1.1.128 1.907 1.077 1.907 2.185V19.5a2.25 2.25 0 01-2.25 2.25H6.75A2.25 2.25 0 014.5 19.5V6.257c0-1.108.806-2.057 1.907-2.185a48.208 48.208 0 011.927-.184" />
                      </svg>
                    </button>
                  </div>
                ` : ''}
              </div>

              <!-- Context pills (Order, EasyPay, Package, Action) -->
              <div class="flex items-center gap-2 mt-2 text-[11px] text-gray-400 flex-wrap">
                ${c.orderNumber ? `<span class="text-gray-300 font-mono">📦 <strong>${escHtml(c.orderNumber)}</strong></span><span>•</span>` : ''}
                <span>${escHtml(c.package || 'Standard')}</span>
                <span>•</span>
                <span>Status: <strong class="text-white">${escHtml(c.status)}</strong></span>
                
                ${c.easyPayNumber ? `
                  <span>•</span>
                  <span class="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-md text-[11px] font-mono font-semibold ${c.isEasyPayExpired ? 'bg-red-500/20 text-red-300 border border-red-500/40' : 'bg-emerald-500/10 text-emerald-300 border border-emerald-500/20'}">
                    <span>💳 EP: <strong>${escHtml(c.easyPayNumber)}</strong></span>
                    <span class="text-gray-400">(${escHtml(c.easyPayCycle || 'Cycle 1 of 3')})</span>
                    <span>•</span>
                    <span class="${c.isEasyPayExpired ? 'text-red-400 font-bold' : 'text-emerald-400'}">
                      ⌛ Exp: <strong>${escHtml(c.easyPayExpiryDate || '—')}</strong>${c.isEasyPayExpired ? ' (EXPIRED)' : (c.easyPayDaysRemaining !== null ? ` (${c.easyPayDaysRemaining}d left)` : '')}
                    </span>
                  </span>
                ` : ''}

                ${isPayment ? `<span>•</span><span class="text-purple-300 font-semibold">💳 Due: ${escHtml(c.promisedPaymentDate)}</span>` : ''}
                ${c.lastOutcome && !isPayment ? `<span>•</span><span>Last: ${escHtml(c.lastOutcome)}</span>` : ''}
              </div>

              ${isActivation ? `
                <div class="mt-2 p-2 rounded-lg bg-blue-500/10 border border-blue-500/20 text-[11px] text-blue-300 flex items-center justify-between">
                  <span>💡 <strong>1-Week Post-Activation Call:</strong> Check connection speed and share their referral code <strong>${escHtml(c.referralCode)}</strong> for rewards!</span>
                </div>
              ` : ''}
            </div>
          </div>

          <!-- 1-Click Action Triggers -->
          <div class="flex items-center gap-2 sm:self-center flex-wrap">
            ${c.easyPayNumber && (c.isEasyPayExpired || c.status === 'Payment Pending') ? `
              <button onclick="triggerReissueEasyPay('${escJs(c.customerId)}')" title="Re-issue EasyPay Number (Max 3 cycles)"
                class="px-3 py-2 rounded-xl text-xs font-bold bg-amber-500/20 hover:bg-amber-500/30 text-amber-300 border border-amber-500/40 transition-colors flex items-center gap-1">
                🔄 Re-issue EP
              </button>
            ` : ''}

            <button onclick="copyPhone('${escJs(formattedPhone)}')" class="px-3.5 py-2 rounded-xl text-xs font-bold bg-white/5 hover:bg-white/10 text-white border border-white/10 transition-colors flex items-center gap-1.5 cursor-pointer">
              📞 Call Now
            </button>
            <button onclick="openCallOutcomeModal('${escHtml(c.customerId)}', '${escJs(c.name)}', '${escJs(formattedPhone)}', '${escJs(c.package || '')}', ${isPayment ? 'true' : 'false'}, ${isActivation ? 'true' : 'false'}, '${escJs(c.paymentType || '')}', '${escJs(c.orderNumber || '')}', '${escJs(c.easyPayNumber || '')}', '${escJs(c.referralCode || '')}', '${escJs(c.easyPayExpiryDate || '')}', '${escJs(c.easyPayCycle || '')}')"
              class="px-4 py-2 rounded-xl text-xs font-bold ${isActivation ? 'bg-gradient-to-r from-blue-600 to-blue-700 hover:from-blue-700 hover:to-blue-800 shadow-md shadow-blue-500/20' : isPayment ? 'bg-gradient-to-r from-purple-600 to-purple-700 hover:from-purple-700 hover:to-purple-800 shadow-md shadow-purple-500/20' : 'bg-gradient-to-r from-fiber-500 to-fiber-600 hover:from-fiber-600 hover:to-fiber-700 shadow-md shadow-fiber-500/20'} text-white transition-all flex items-center gap-1.5">
              ${isActivation ? '🚀 Log Activation Check' : isPayment ? '💳 Log Payment' : '⚡ Log Outcome'}
            </button>
          </div>

        </div>
      </div>
    `;
  }).join('');
}

// ── 1-Click Call Outcome Drawer / Modal ──────────────────────
function openCallOutcomeModal(customerId, name, phone, pkg, isPaymentFollowUp = false, isActivation = false, existingPaymentType = '', existingOrderNumber = '', existingEasyPayNumber = '', referralCode = '', existingEasyPayExpiry = '', existingEasyPayCycle = '') {
  // Phone may already have leading 0 from card rendering — avoid double-prefix
  const formattedPhone = (phone && !phone.startsWith('0') && phone !== 'No number') ? '0' + phone : (phone || 'No Number');
  currentModalIsPayment = !!isPaymentFollowUp;

  document.getElementById('co-customer-id').value = customerId;
  document.getElementById('co-client-name').textContent = name;
  document.getElementById('co-client-phone').textContent = formattedPhone;
  document.getElementById('co-notes').value = '';

  // Toggle preset sets based on whether this is a payment follow-up
  const regularPresets = document.getElementById('co-regular-presets');
  const paymentPresets = document.getElementById('co-payment-presets');
  if (currentModalIsPayment) {
    regularPresets.classList.add('hidden');
    paymentPresets.classList.remove('hidden');
    document.querySelector('#modal-call-outcome .text-fiber-400').textContent = '💳 Log Payment Outcome';
  } else {
    regularPresets.classList.remove('hidden');
    paymentPresets.classList.add('hidden');
    document.querySelector('#modal-call-outcome .text-fiber-400').textContent = isActivation ? '🚀 Log 1-Week Activation Check' : 'Log Call Outcome';
  }

  // Pre-fill Package if provided
  if (pkg) {
    const pkgEl = document.getElementById('co-package');
    if (pkgEl) pkgEl.value = pkg;
  }

  // Pre-fill Payment Type with existing value (default to it, allow change)
  const payTypeEl = document.getElementById('co-payment-type');
  if (payTypeEl && existingPaymentType) {
    payTypeEl.value = existingPaymentType;
  }

  // Pre-fill Order Number with existing value
  const orderInputEl = document.getElementById('co-order-number');
  if (orderInputEl) {
    orderInputEl.value = existingOrderNumber || '';
  }

  // Show existing Order & EasyPay & Expiry info in the modal context bar
  const contextBar = document.getElementById('co-existing-order-bar');
  if (contextBar) {
    if (existingOrderNumber || existingEasyPayNumber) {
      contextBar.classList.remove('hidden');
      const orderEl = document.getElementById('co-existing-order-num');
      const epEl = document.getElementById('co-existing-ep-num');
      const cycleEl = document.getElementById('co-existing-ep-cycle');
      const expiryEl = document.getElementById('co-existing-ep-expiry');

      if (orderEl) orderEl.textContent = existingOrderNumber || '—';
      if (epEl) epEl.textContent = existingEasyPayNumber || '—';
      if (cycleEl) cycleEl.textContent = existingEasyPayCycle || 'Cycle 1 of 3';
      if (expiryEl) {
        expiryEl.textContent = existingEasyPayExpiry || '—';
        const today = getTodayStr();
        if (existingEasyPayExpiry && existingEasyPayExpiry < today) {
          expiryEl.textContent = `${existingEasyPayExpiry} (EXPIRED)`;
          expiryEl.className = 'font-mono font-bold text-red-400';
        } else {
          expiryEl.className = 'font-mono font-bold text-amber-300';
        }
      }
    } else {
      contextBar.classList.add('hidden');
    }
  }

  // Store referral code for activation check modal
  const refCodeEl = document.getElementById('co-referral-code-display');
  if (refCodeEl) refCodeEl.textContent = referralCode || '';
  const refSection = document.getElementById('co-activation-referral-section');
  if (refSection) refSection.classList.toggle('hidden', !isActivation);

  // Default preset based on modal type
  if (currentModalIsPayment) {
    selectOutcomePreset('Payment Received');
  } else if (isActivation) {
    selectOutcomePreset('Activation Follow-Up Completed');
  } else {
    selectOutcomePreset('Callback Rescheduled');
    setOutcomeDateOffset(1);
  }

  document.getElementById('modal-call-outcome').classList.remove('hidden');
}

function closeCallOutcomeModal() {
  document.getElementById('modal-call-outcome').classList.add('hidden');
}

function selectOutcomePreset(preset) {
  selectedOutcomePreset = preset;

  document.querySelectorAll('.outcome-preset-btn').forEach(b => {
    b.classList.remove('ring-2', 'ring-fiber-400', 'ring-purple-400', 'ring-emerald-400', 'ring-blue-400', 'ring-teal-400');
  });
  const activeBtn = document.querySelector(`[data-outcome-btn="${preset}"]`);
  if (activeBtn) {
    const ringColor = preset === 'New Payment Date' ? 'ring-purple-400'
      : preset === 'Payment Received' ? 'ring-emerald-400'
      : preset === 'Activated' ? 'ring-blue-400'
      : preset === 'Activation Follow-Up Completed' ? 'ring-teal-400'
      : 'ring-fiber-400';
    activeBtn.classList.add('ring-2', ringColor);
  }

  const rescheduleSection = document.getElementById('co-reschedule-section');
  const saleSection = document.getElementById('co-sale-section');
  const promisedPaySection = document.getElementById('co-promised-pay-section');

  // Reset all sections
  rescheduleSection.classList.add('hidden');
  saleSection.classList.add('hidden');
  promisedPaySection.classList.add('hidden');

  if (preset === 'Callback Rescheduled' || preset === 'No Answer / Voicemail' || preset === 'No Payment - Reschedule') {
    rescheduleSection.classList.remove('hidden');
    setOutcomeDateOffset(1);
  }

  if (preset === 'Sale Won') {
    saleSection.classList.remove('hidden');
    // Pre-fill promised payment date to +14 days (EasyPay expiry)
    const promDateEl = document.getElementById('co-sale-promised-pay-date');
    if (promDateEl && !promDateEl.value) promDateEl.value = addDaysToToday(14);
  }

  if (preset === 'New Payment Date') {
    promisedPaySection.classList.remove('hidden');
    // Pre-fill to EasyPay expiry if known, else +7 days
    const el = document.getElementById('co-new-promised-pay-date');
    if (el && !el.value) el.value = addDaysToToday(7);
  }
}

function setOutcomeDateOffset(days) {
  if (days > 8) days = 8; // Enforce max 8 days
  const targetDate = addDaysToToday(days);
  const dateInput = document.getElementById('co-next-date');
  if (dateInput) dateInput.value = targetDate;
}

async function submitCallOutcome() {
  const customerId = document.getElementById('co-customer-id').value;
  const submitBtn = document.getElementById('co-submit-btn');
  const notes = document.getElementById('co-notes').value;
  const nextDate = document.getElementById('co-next-date').value;
  const nextTime = document.getElementById('co-next-time') ? document.getElementById('co-next-time').value : '';
  const pkgChoice = document.getElementById('co-package').value;
  const payType = document.getElementById('co-payment-type').value;
  const newPromisedPayDate = document.getElementById('co-new-promised-pay-date').value;
  const salePromisedPayDate = document.getElementById('co-sale-promised-pay-date').value;
  // NEW: EasyPay number from the Sale Won section
  const easyPayNumberVal = (document.getElementById('co-easypay-number') || {}).value || '';

  if (!customerId) return;

  const needsNextDate = (selectedOutcomePreset === 'Callback Rescheduled' || selectedOutcomePreset === 'No Answer / Voicemail' || selectedOutcomePreset === 'No Payment - Reschedule');

  // Validate 8-day limit for regular callback reschedules
  if (needsNextDate && nextDate) {
    const today = getTodayStr();
    const max8d = addDaysToToday(8);
    if (nextDate > max8d) {
      showToast("Call Back date cannot exceed 8 days from today (8-day rule limit).", "error");
      return;
    }
    if (nextDate < today) {
      showToast("Call Back date cannot be in the past.", "error");
      return;
    }
  }

  // Validate new promised payment date is provided when needed
  if (selectedOutcomePreset === 'New Payment Date' && !newPromisedPayDate) {
    showToast("Please select a new Promised Payment Date.", "error");
    return;
  }

  submitBtn.disabled = true;
  submitBtn.innerHTML = `<div class="spinner-sm mx-auto"></div>`;

  // For 1-week activation check: capture referral lead details
  const referralFirstName = (document.getElementById('co-ref-first-name') || {}).value || '';
  const referralSurname = (document.getElementById('co-ref-surname') || {}).value || '';
  const referralCell = (document.getElementById('co-ref-cell') || {}).value || '';
  const referralAddress = (document.getElementById('co-ref-address') || {}).value || '';

  try {
    const orderNumberVal = (document.getElementById('co-order-number') || {}).value || '';

    const payload = {
      customerId: customerId,
      outcome: selectedOutcomePreset,
      notes: notes,
      nextAction: needsNextDate ? 'Call Back' : (selectedOutcomePreset === 'Payment Received' ? '' : ''),
      nextActionDate: needsNextDate ? nextDate : '',
      nextActionTime: needsNextDate ? nextTime : '',
      packageChoice: selectedOutcomePreset === 'Sale Won' ? pkgChoice : '',
      paymentType: payType || '',
      easyPayNumber: easyPayNumberVal.trim(),
      orderNumber: orderNumberVal.trim().toUpperCase(),
      newPromisedPaymentDate: selectedOutcomePreset === 'New Payment Date' ? newPromisedPayDate : (selectedOutcomePreset === 'Sale Won' ? salePromisedPayDate : ''),
      // Referral lead data from activation follow-up
      referralLead: (selectedOutcomePreset === 'Activation Follow-Up Completed' && referralFirstName && referralCell) ? {
        firstName: referralFirstName,
        surname: referralSurname,
        cellNumber: referralCell,
        address: referralAddress
      } : null
    };

    const result = await callBackend('logCallOutcome', payload);
    showToast(`Call logged: ${selectedOutcomePreset}! Queue updated.`);
    if (result && result.referralCode) {
      showToast(`🎁 Referral Code: ${result.referralCode} — share with customer!`);
    }
    if (result && result.referralLeadCreated) {
      showToast(`✅ Referral lead for ${referralFirstName} captured successfully!`);
    }
    closeCallOutcomeModal();
    // Clear modal fields
    ['co-ref-first-name','co-ref-surname','co-ref-cell','co-ref-address','co-order-number'].forEach(id => {
      const el = document.getElementById(id);
      if (el) el.value = '';
    });
    refreshDailyData();
  } catch (err) {
    showToast(err.message, "error");
  } finally {
    submitBtn.disabled = false;
    submitBtn.textContent = "Save & Update Queue";
  }
}

// ── Lead Capture ─────────────────────────────────────────────
function handleLeadStatusChange(status) {
  const today = getTodayStr();
  const orderDateEl = document.getElementById('nf-order-date');
  if (status === 'Won') {
    orderDateEl.value = today;
  }
}

async function submitLead(overrideId = null) {
  const submitBtn = document.getElementById('lead-submit-btn');
  const today = getTodayStr();
  const max8d = addDaysToToday(8);

  const status = document.getElementById('nf-status').value;
  const nextActionDate = document.getElementById('nf-next-action-date').value;
  if (nextActionDate && status !== 'Activated') {
    if (nextActionDate > max8d) {
      showToast("Next action date cannot exceed 8 days from today (8-day limit).", "error");
      return;
    }
    if (nextActionDate < today) {
      showToast("Next action date cannot be in the past.", "error");
      return;
    }
  }

  const formData = {
    firstName: document.getElementById('nf-first-name').value.trim(),
    surname: document.getElementById('nf-surname').value.trim(),
    cellNumber: document.getElementById('nf-cell').value.trim(),
    alternateCell: document.getElementById('nf-alt-cell').value.trim(),
    email: document.getElementById('nf-email').value.trim(),
    address: document.getElementById('nf-address').value.trim(),
    suburb: document.getElementById('nf-suburb').value.trim(),
    package: document.getElementById('nf-package').value,
    paymentType: document.getElementById('nf-payment-type').value,
    orderDate: today, // Automatic exact date stamping
    orderNumber: (document.getElementById('nf-order-number') ? document.getElementById('nf-order-number').value.trim() : ''),
    easyPayNumber: (document.getElementById('nf-easypay-number') ? document.getElementById('nf-easypay-number').value.trim() : ''),
    promisedPaymentDate: document.getElementById('nf-promised-pay-date').value,
    referredByCode: (document.getElementById('nf-referred-by') ? document.getElementById('nf-referred-by').value.trim() : ''),
    customerStatus: status,
    lastContactOutcome: document.getElementById('nf-outcome').value.trim(),
    nextAction: document.getElementById('nf-next-action').value,
    nextActionDate: nextActionDate,
    nextActionTime: document.getElementById('nf-next-action-time') ? document.getElementById('nf-next-action-time').value : ''
  };

  submitBtn.disabled = true;
  submitBtn.innerHTML = `<div class="spinner-sm mx-auto"></div>`;

  try {
    const result = await callBackend('handleAgentLeadUpdate', {
      existingIdOverride: overrideId,
      formData: formData
    });

    if (result.duplicateAlert) {
      document.getElementById('dup-name').textContent = result.existingName;
      document.getElementById('dup-id').textContent = result.existingId;
      document.getElementById('dup-override-btn').onclick = () => {
        closeDuplicate();
        submitLead(result.existingId);
      };
      document.getElementById('modal-duplicate').classList.remove('hidden');
      return;
    }

    showToast("Lead successfully captured!");
    document.getElementById('lead-form').reset();
    setupDatepickerLimits();
    switchView('callbacks');
  } catch (err) {
    showToast(err.message, "error");
  } finally {
    submitBtn.disabled = false;
    submitBtn.textContent = "Capture Lead";
  }
}

function closeDuplicate() {
  document.getElementById('modal-duplicate').classList.add('hidden');
}

// ── All Assigned Leads (Worklist) ────────────────────────────
async function loadWorklist() {
  const tbody = document.getElementById('worklist-body');
  const countEl = document.getElementById('worklist-count');

  tbody.innerHTML = `
    <tr><td colspan="7" class="px-6 py-12 text-center">
      <div class="spinner mx-auto mb-3"></div>
      <p class="text-gray-500 text-sm">Loading all assigned leads...</p>
    </td></tr>`;

  try {
    const result = await callBackend('getAgentWorklist', { offset: worklistOffset, limit: WORKLIST_LIMIT });
    worklistTotal = result.total;
    countEl.textContent = `${result.total} customer${result.total !== 1 ? 's' : ''}`;

    if (result.data.length === 0) {
      tbody.innerHTML = `
        <tr><td colspan="7" class="px-6 py-16 text-center text-gray-400">
          <p class="font-medium">No leads in your general pipeline</p>
        </td></tr>`;
      updatePagination();
      return;
    }

    tbody.innerHTML = result.data.map(c => `
      <tr class="border-b border-white/5 hover:bg-white/[0.03] transition-colors group">
        <td class="px-4 py-3.5">
          <p class="font-semibold text-white text-sm">${escHtml(c.name)}</p>
          <p class="text-xs text-gray-500 mt-0.5">${escHtml(c.customerId)}</p>
        </td>
        <td class="px-4 py-3.5 text-sm font-mono text-gray-300">${escHtml("0" + c.cellNumber || '—')}</td>
        <td class="px-4 py-3.5 text-sm text-gray-300">${escHtml(c.package || '—')}</td>
        <td class="px-4 py-3.5">${statusBadge(c.status)}</td>
        <td class="px-4 py-3.5">
          <p class="text-sm font-semibold text-fiber-400">${escHtml(c.nextActionDate || '—')}</p>
          <p class="text-xs text-gray-500">${escHtml(c.nextAction || '')}</p>
        </td>
        <td class="px-4 py-3.5 text-sm text-gray-400 truncate max-w-[160px]">${escHtml(c.lastOutcome || '—')}</td>
        <td class="px-4 py-3.5 text-right">
          <button onclick="openCallOutcomeModal('${escHtml(c.customerId)}', '${escJs(c.name)}', '${escJs(c.cellNumber)}', '${escJs(c.package || '')}')"
            class="px-3 py-1.5 bg-fiber-500/20 text-fiber-300 rounded-lg text-xs font-bold hover:bg-fiber-500 hover:text-white transition-all">
            Log Touch
          </button>
        </td>
      </tr>
    `).join('');

    updatePagination();
  } catch (err) {
    tbody.innerHTML = `
      <tr><td colspan="7" class="px-6 py-12 text-center text-red-400">
        <p class="font-medium">Failed to load worklist</p>
        <p class="text-xs text-red-500/80 mt-1">${escHtml(err.message)}</p>
      </td></tr>`;
  }
}

function updatePagination() {
  const paginationEl = document.getElementById('pagination');
  const totalPages = Math.ceil(worklistTotal / WORKLIST_LIMIT);
  const currentPage = Math.floor(worklistOffset / WORKLIST_LIMIT) + 1;

  if (totalPages <= 1) {
    paginationEl.innerHTML = '';
    return;
  }

  paginationEl.innerHTML = `
    <button onclick="goPage(${currentPage - 1})" ${currentPage === 1 ? 'disabled' : ''} 
      class="px-3 py-1.5 rounded-lg text-xs font-semibold ${currentPage === 1 ? 'text-gray-600 cursor-not-allowed' : 'text-gray-300 hover:bg-white/10'}">
      ← Prev
    </button>
    <span class="text-xs text-gray-500 font-medium">Page ${currentPage} of ${totalPages}</span>
    <button onclick="goPage(${currentPage + 1})" ${currentPage === totalPages ? 'disabled' : ''} 
      class="px-3 py-1.5 rounded-lg text-xs font-semibold ${currentPage === totalPages ? 'text-gray-600 cursor-not-allowed' : 'text-gray-300 hover:bg-white/10'}">
      Next →
    </button>
  `;
}

function goPage(page) {
  worklistOffset = (page - 1) * WORKLIST_LIMIT;
  loadWorklist();
}

function statusBadge(status) {
  const s = (status || '').toLowerCase();
  if (s.includes('won') || s.includes('activated')) return `<span class="px-2.5 py-1 rounded-full text-xs font-semibold bg-emerald-500/15 text-emerald-400 border border-emerald-500/20">${escHtml(status)}</span>`;
  if (s.includes('lost') || s.includes('cancel')) return `<span class="px-2.5 py-1 rounded-full text-xs font-semibold bg-red-500/15 text-red-400 border border-red-500/20">${escHtml(status)}</span>`;
  if (s.includes('pending') || s.includes('call')) return `<span class="px-2.5 py-1 rounded-full text-xs font-semibold bg-amber-500/15 text-amber-400 border border-amber-500/20">${escHtml(status)}</span>`;
  return `<span class="px-2.5 py-1 rounded-full text-xs font-semibold bg-blue-500/15 text-blue-400 border border-blue-500/20">${escHtml(status || 'New')}</span>`;
}

// ── Agent Activity Log ───────────────────────────────────────
async function loadActivityLog() {
  const tbody = document.getElementById('activity-body');
  tbody.innerHTML = `<tr><td colspan="6" class="px-6 py-8 text-center"><div class="spinner mx-auto mb-2"></div><p class="text-xs text-gray-500">Loading activity...</p></td></tr>`;

  try {
    const result = await callBackend('getAgentActivityLog', { offset: activityOffset, limit: ACTIVITY_LIMIT });
    activityTotal = result.total;

    if (result.data.length === 0) {
      tbody.innerHTML = `<tr><td colspan="6" class="px-6 py-8 text-center text-gray-500 text-xs">No activity logged yet today.</td></tr>`;
      return;
    }

    tbody.innerHTML = result.data.map(a => `
      <tr class="border-b border-white/5 hover:bg-white/[0.02] text-xs">
        <td class="px-4 py-3 font-mono text-gray-400">${escHtml(a.dateTime)}</td>
        <td class="px-4 py-3 font-semibold text-white">${escHtml(a.customerName)}</td>
        <td class="px-4 py-3 font-semibold text-fiber-400">${escHtml(a.outcome)}</td>
        <td class="px-4 py-3">${statusBadge(a.statusAfter)}</td>
        <td class="px-4 py-3 text-gray-300">${escHtml(a.nextAction)} ${a.nextActionDate ? `(${escHtml(a.nextActionDate)})` : ''}</td>
        <td class="px-4 py-3 text-gray-400 max-w-[200px] truncate">${escHtml(a.notes || '—')}</td>
      </tr>
    `).join('');
  } catch (err) {
    tbody.innerHTML = `<tr><td colspan="6" class="px-6 py-8 text-center text-red-400 text-xs">${escHtml(err.message)}</td></tr>`;
  }
}

// ── Quick Edit Modal ─────────────────────────────────────────
function openQuickEdit(customerId, name, pkg, status, nextAction, nextActionDate) {
  document.getElementById('qe-customer-id').value = customerId;
  document.getElementById('qe-customer-name').textContent = name;
  document.getElementById('qe-package').value = pkg;
  document.getElementById('qe-status').value = status || 'New Lead';
  document.getElementById('qe-next-action').value = nextAction;
  document.getElementById('qe-next-action-date').value = nextActionDate;
  document.getElementById('modal-quick-edit').classList.remove('hidden');
}

function closeQuickEdit() {
  document.getElementById('modal-quick-edit').classList.add('hidden');
}

async function submitQuickEdit() {
  const customerId = document.getElementById('qe-customer-id').value;
  const nextDate = document.getElementById('qe-next-action-date').value;
  const max8d = addDaysToToday(8);
  const today = getTodayStr();

  if (nextDate) {
    if (nextDate > max8d) {
      showToast("Next action date cannot exceed 8 days from today (8-day limit).", "error");
      return;
    }
    if (nextDate < today) {
      showToast("Next action date cannot be in the past.", "error");
      return;
    }
  }

  const nextTime = document.getElementById('qe-next-action-time') ? document.getElementById('qe-next-action-time').value : '';

  const payload = {
    package: document.getElementById('qe-package').value,
    status: document.getElementById('qe-status').value,
    nextAction: document.getElementById('qe-next-action').value,
    nextActionDate: nextDate,
    nextActionTime: nextTime
  };

  try {
    await callBackend('quickUpdateSalesData', { customerId, data: payload });
    showToast("Lead updated successfully!");
    closeQuickEdit();
    loadWorklist();
    refreshDailyData();
  } catch (err) {
    showToast(err.message, "error");
  }
}
