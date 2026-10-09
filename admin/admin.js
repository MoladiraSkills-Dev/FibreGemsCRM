/**
 * FibreGems CRM — Admin Command Centre Logic
 * Handles dashboard KPIs, callback performance & accountability, missed call alerts,
 * 7-day escalations, 42-day auto-expiry audit engine, master grid, and Agility sync.
 */

// ── State ────────────────────────────────────────────────────
let currentAdminView = 'dashboard';
let gridOffset = 0;
const GRID_LIMIT = 50;
let gridTotal = 0;
let currentReportDate = getTodayStr();

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
  const bgClass = type === 'error' ? 'bg-red-500/90 text-white' : (type === 'warning' ? 'bg-amber-500/95 text-navy-900' : 'bg-emerald-500/90 text-white');
  toast.className = `px-4 py-3 rounded-xl shadow-xl text-xs font-semibold backdrop-blur flex items-center gap-2 ${bgClass} animate-slide-in`;
  toast.innerHTML = `<span>${escHtml(msg)}</span>`;
  container.appendChild(toast);
  setTimeout(() => {
    toast.style.opacity = '0';
    toast.style.transform = 'translateY(-10px)';
    setTimeout(() => toast.remove(), 300);
  }, 9500);
}

function formatTime(isoOrDate) {
  if (!isoOrDate) return '—';
  try {
    const d = new Date(isoOrDate);
    return d.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
  } catch (e) {
    return '—';
  }
}

// ── Initialization ───────────────────────────────────────────
document.addEventListener('DOMContentLoaded', () => {
  if (!requireAdmin()) return;

  document.getElementById('admin-name').textContent = session.name || 'Admin';
  document.getElementById('admin-role').textContent = session.role || 'Admin';
  const avatarEl = document.getElementById('admin-avatar');
  if (avatarEl && session.name) avatarEl.textContent = session.name.charAt(0).toUpperCase();

  const picker = document.getElementById('admin-report-date-picker');
  if (picker) picker.value = currentReportDate;

  loadDashboard();
  checkMissedCallbacksBadge();

  // Poll for dashboard updates every 30 seconds if on dashboard view
  setInterval(() => {
    if (currentAdminView === 'dashboard') {
      loadDashboard(true);
    }
  }, 30000);
});

// ── View Switching ───────────────────────────────────────────
function switchAdminView(view) {
  currentAdminView = view;

  document.querySelectorAll('[data-admin-nav]').forEach(el => {
    el.classList.remove('bg-fiber-500/20', 'text-fiber-300', 'border-fiber-500', 'border-l-4');
    el.classList.add('text-gray-400', 'hover:text-white', 'hover:bg-white/5', 'border-transparent', 'border-l-4');
  });
  const activeNav = document.querySelector(`[data-admin-nav="${view}"]`);
  if (activeNav) {
    activeNav.classList.add('bg-fiber-500/20', 'text-fiber-300', 'border-fiber-500');
    activeNav.classList.remove('text-gray-400', 'hover:text-white', 'hover:bg-white/5', 'border-transparent');
  }

  document.getElementById('view-dashboard').classList.toggle('hidden', view !== 'dashboard');
  document.getElementById('view-callbacks').classList.toggle('hidden', view !== 'callbacks');
  document.getElementById('view-grid').classList.toggle('hidden', view !== 'grid');
  document.getElementById('view-sync').classList.toggle('hidden', view !== 'sync');
  document.getElementById('view-agents').classList.toggle('hidden', view !== 'agents');

  if (view === 'dashboard') loadDashboard();
  else if (view === 'callbacks') {
    loadCallbackReport(currentReportDate);
    loadPromisedPayments();
  }
  else if (view === 'grid') loadMasterGrid();
  else if (view === 'agents') loadAgentList();
}

// ── Quick Badge Check ────────────────────────────────────────
async function checkMissedCallbacksBadge() {
  try {
    const report = await callBackend('getAdminCallbackReport', { targetDate: getTodayStr() });
    const badge = document.getElementById('nav-admin-missed-badge');
    if (badge) {
      if (report.totalMissed > 0) {
        badge.textContent = `${report.totalMissed} Missed`;
        badge.classList.remove('hidden');
      } else {
        badge.classList.add('hidden');
      }
    }
  } catch (e) {
    console.error("Could not check missed callbacks badge", e);
  }
}

// ── Dashboard ────────────────────────────────────────────────
async function loadDashboard(silent = false) {
  const agentTableBody = document.getElementById('agent-activity-body');
  const statsContainer = document.getElementById('status-stats');

  if (!silent) {
    agentTableBody.innerHTML = `
      <tr><td colspan="3" class="px-6 py-8 text-center">
        <div class="spinner mx-auto mb-2"></div>
        <p class="text-gray-500 text-sm">Loading dashboard...</p>
      </td></tr>`;
  }

  try {
    const data = await callBackend('getAdminDashboard', {}, { skipCache: silent });

    const frontlineAgents = (data.agents || []).filter(ag => String(ag.role || '').trim().toLowerCase() === 'agent');

    const activeCount = frontlineAgents.filter(ag => ag.isOnline).length;
    document.getElementById('stat-active-agents').textContent = activeCount;
    const totalCustomers = Object.values(data.statuses || {}).reduce((a, b) => a + b, 0);
    document.getElementById('stat-total-customers').textContent = totalCustomers;
    const todayTouches = frontlineAgents.reduce((a, ag) => a + ag.touches, 0);
    document.getElementById('stat-today-touches').textContent = todayTouches;

    if (frontlineAgents.length === 0) {
      agentTableBody.innerHTML = `
        <tr><td colspan="3" class="px-6 py-8 text-center text-gray-500 text-sm">
          No agent activity recorded yet today
        </td></tr>`;
    } else {
      agentTableBody.innerHTML = frontlineAgents.map(agent => `
        <tr class="border-b border-white/5 hover:bg-white/[0.03] transition-colors">
          <td class="px-4 py-3">
            <div class="flex items-center gap-3">
              <div class="w-8 h-8 rounded-full bg-gradient-to-br from-fiber-500 to-fiber-700 flex items-center justify-center text-xs font-bold text-white relative">
                ${(agent.name || 'U').charAt(0)}
                <span class="absolute -bottom-1 -right-1 w-3 h-3 rounded-full border-2 border-[#1A1A1A] ${agent.isOnline ? 'bg-green-500' : 'bg-red-500'}"></span>
              </div>
              <div>
                <p class="font-semibold text-white text-sm">${escHtml(agent.name)}</p>
                <p class="text-xs ${agent.isOnline ? 'text-green-400' : 'text-gray-500'}">${agent.isOnline ? 'Active' : 'Absent'} · ${escHtml(agent.role)}</p>
              </div>
            </div>
          </td>
          <td class="px-4 py-3">
            <span class="inline-flex items-center px-2.5 py-1 rounded-full text-xs font-bold bg-fiber-500/15 text-fiber-400">
              ${agent.touches} touches
            </span>
          </td>
          <td class="px-4 py-3 text-sm text-gray-400">${formatTime(agent.lastActive)}</td>
        </tr>
      `).join('');
    }

    // Status breakdown
    statsContainer.innerHTML = Object.entries(data.statuses).map(([status, count]) => {
      const pct = totalCustomers > 0 ? Math.round((count / totalCustomers) * 100) : 0;
      return `
        <div>
          <div class="flex items-center justify-between text-xs mb-1">
            <span class="text-gray-300 font-medium">${escHtml(status)}</span>
            <span class="text-gray-400 font-bold">${count} <span class="text-gray-600">(${pct}%)</span></span>
          </div>
          <div class="w-full bg-white/5 rounded-full h-1.5 overflow-hidden">
            <div class="bg-fiber-500 h-full rounded-full" style="width: ${pct}%"></div>
          </div>
        </div>
      `;
    }).join('');

  } catch (err) {
    if (!silent) {
      agentTableBody.innerHTML = `
        <tr><td colspan="3" class="px-6 py-8 text-center text-red-400 text-sm">
          Failed to load dashboard: ${escHtml(err.message)}
        </td></tr>`;
    }
  }
}

// ── Call Back Performance & Accountability Report ────────────
function setReportDateOffset(offsetDays) {
  currentReportDate = addDaysToToday(offsetDays);

  const btnToday = document.getElementById('btn-report-today');
  const btnYesterday = document.getElementById('btn-report-yesterday');
  const picker = document.getElementById('admin-report-date-picker');

  if (picker) picker.value = currentReportDate;

  if (offsetDays === 0) {
    btnToday.className = "px-3 py-1.5 rounded-lg text-xs font-bold bg-fiber-500 text-white transition-all";
    btnYesterday.className = "px-3 py-1.5 rounded-lg text-xs font-bold bg-white/5 text-gray-400 hover:text-white transition-all";
  } else if (offsetDays === -1) {
    btnYesterday.className = "px-3 py-1.5 rounded-lg text-xs font-bold bg-fiber-500 text-white transition-all";
    btnToday.className = "px-3 py-1.5 rounded-lg text-xs font-bold bg-white/5 text-gray-400 hover:text-white transition-all";
  }

  loadCallbackReport(currentReportDate);
  loadPromisedPayments();
}

async function loadCallbackReport(targetDate) {
  currentReportDate = targetDate || getTodayStr();
  const dateLabel = document.getElementById('rep-current-date-label');
  if (dateLabel) dateLabel.textContent = currentReportDate === getTodayStr() ? `Today (${currentReportDate})` : currentReportDate;

  const agentBody = document.getElementById('rep-agent-body');
  const missedBody = document.getElementById('rep-missed-body');
  const escalatedBody = document.getElementById('rep-escalated-body');
  const banner = document.getElementById('missed-alert-banner');

  agentBody.innerHTML = `<tr><td colspan="6" class="px-6 py-8 text-center"><div class="spinner mx-auto mb-2"></div><p class="text-xs text-gray-400">Loading performance data...</p></td></tr>`;

  try {
    const report = await callBackend('getAdminCallbackReport', { targetDate: currentReportDate });

    // Update KPI Cards
    document.getElementById('rep-stat-scheduled').textContent = report.totalScheduled;
    document.getElementById('rep-stat-completed').textContent = report.totalCompleted;
    document.getElementById('rep-stat-missed').textContent = report.totalMissed;
    document.getElementById('rep-stat-escalated').textContent = report.totalEscalated;

    // Missed Alert Banner
    if (report.totalMissed > 0) {
      banner.classList.remove('hidden');
      document.getElementById('missed-alert-text').textContent = `🚨 ${report.totalMissed} scheduled call back${report.totalMissed > 1 ? 's were' : ' was'} missed on or before ${currentReportDate}. Immediate follow-up required!`;
    } else {
      banner.classList.add('hidden');
    }

    // Section 1: Agent Execution Breakdown
    if (report.agents.length === 0) {
      agentBody.innerHTML = `<tr><td colspan="6" class="px-6 py-8 text-center text-gray-500 text-xs">No agent assignments found for this date.</td></tr>`;
    } else {
      agentBody.innerHTML = report.agents.map(ag => {
        let compBadge = `<span class="px-2.5 py-1 rounded-full text-[11px] font-bold bg-emerald-500/20 text-emerald-300 border border-emerald-500/30">✓ Excellent (100%)</span>`;
        if (ag.missed > 0) {
          compBadge = `<span class="px-2.5 py-1 rounded-full text-[11px] font-bold bg-red-500/20 text-red-300 border border-red-500/30 animate-pulse">⚠️ Missed Calls (${ag.missed})</span>`;
        } else if (ag.scheduled === 0) {
          compBadge = `<span class="px-2.5 py-1 rounded-full text-[11px] font-medium bg-white/5 text-gray-400">No Calls Due</span>`;
        }

        return `
          <tr class="border-b border-white/5 hover:bg-white/[0.02] text-xs">
            <td class="px-4 py-3">
              <p class="font-bold text-white text-sm">${escHtml(ag.name)}</p>
              <p class="text-[11px] text-gray-500">${escHtml(ag.agentId)}</p>
            </td>
            <td class="px-4 py-3 font-semibold text-white">${ag.scheduled}</td>
            <td class="px-4 py-3 font-bold text-emerald-400">${ag.completed}</td>
            <td class="px-4 py-3 font-bold ${ag.missed > 0 ? 'text-red-400' : 'text-gray-500'}">${ag.missed}</td>
            <td class="px-4 py-3">
              <div class="flex items-center gap-2">
                <span class="font-bold text-white">${ag.scheduled === 0 ? '-' : ag.completionRate + '%'}</span>
                <div class="w-16 bg-white/10 rounded-full h-1.5 overflow-hidden">
                  <div class="h-full rounded-full ${ag.scheduled === 0 ? 'bg-transparent' : (ag.completionRate === 100 ? 'bg-emerald-400' : (ag.completionRate >= 70 ? 'bg-amber-400' : 'bg-red-400'))}" style="width: ${ag.scheduled === 0 ? 0 : ag.completionRate}%"></div>
                </div>
              </div>
            </td>
            <td class="px-4 py-3">${compBadge}</td>
          </tr>
        `;
      }).join('');
    }

    // Section 2: Missed Call Backs Table
    if (report.missedCallbacks.length === 0) {
      missedBody.innerHTML = `
        <tr><td colspan="6" class="px-6 py-8 text-center text-emerald-400 text-xs">
          ✓ No missed call backs on record for this period. Great performance!
        </td></tr>`;
    } else {
      missedBody.innerHTML = report.missedCallbacks.map(m => {
        let formattedPhone = m.phone || '';
        if (formattedPhone && !formattedPhone.toString().startsWith('0')) {
          formattedPhone = '0' + formattedPhone;
        }
        return `
        <tr class="border-b border-white/5 hover:bg-red-950/10 text-xs">
          <td class="px-4 py-3">
            <p class="font-bold text-white">${escHtml(m.name)}</p>
            <p class="text-[11px] text-gray-500">${escHtml(m.customerId)}</p>
          </td>
          <td class="px-4 py-3 font-mono text-fiber-400 font-semibold">${escHtml(formattedPhone || '—')}</td>
          <td class="px-4 py-3 font-medium text-gray-300">${escHtml(m.agentName)}</td>
          <td class="px-4 py-3 font-mono text-gray-400">${escHtml(m.scheduledDate)}</td>
          <td class="px-4 py-3"><span class="px-2 py-0.5 rounded text-[10px] font-bold bg-red-500/20 text-red-300 border border-red-500/30">${m.daysOverdue} days overdue</span></td>
          <td class="px-4 py-3 text-gray-400">${escHtml(m.lastOutcome || 'None')}</td>
          <td class="px-4 py-3 text-right">
            <button onclick="openAdminFollowUpModal('${escHtml(m.customerId)}', '${escJs(m.name)}', '${escJs(formattedPhone)}')", class="px-2.5 py-1.5 bg-white/5 hover:bg-white/10 text-amber-300 border border-amber-500/30 rounded-lg text-[10px] font-bold transition-all whitespace-nowrap">⚡ Force Reschedule</button>
          </td>
        </tr>
        `;
      }).join('');
    }

    // Section 3: 7-Day Chain-of-Command Escalations
    if (report.escalatedLeads.length === 0) {
      escalatedBody.innerHTML = `
        <tr><td colspan="6" class="px-6 py-8 text-center text-gray-400 text-xs">
          ✓ No stale leads escalated to supervisor tier.
        </td></tr>`;
    } else {
      escalatedBody.innerHTML = report.escalatedLeads.map(e => {
        let formattedPhone = e.phone || '';
        if (formattedPhone && !formattedPhone.toString().startsWith('0')) {
          formattedPhone = '0' + formattedPhone;
        }
        return `
        <tr class="border-b border-white/5 hover:bg-amber-950/15 text-xs">
          <td class="px-4 py-3">
            <p class="font-bold text-white">${escHtml(e.name)}</p>
            <p class="text-[11px] text-gray-500">${escHtml(e.customerId)}</p>
          </td>
          <td class="px-4 py-3 font-mono text-gray-300">${escHtml(formattedPhone || '—')}</td>
          <td class="px-4 py-3 font-medium text-gray-300">${escHtml(e.agentName)}</td>
          <td class="px-4 py-3 font-bold text-amber-400">${e.daysSinceContact} days silent</td>
          <td class="px-4 py-3">
            <span class="px-2.5 py-1 rounded-full text-[10px] font-bold ${e.escalationLevel.includes('Level 3') ? 'bg-red-500/20 text-red-300 border border-red-500/30' : 'bg-amber-500/20 text-amber-300 border border-amber-500/30'}">
              ${escHtml(e.escalationLevel)}
            </span>
          </td>
          <td class="px-4 py-3 text-gray-400">${escHtml(e.reason)}</td>
        </tr>
        `;
      }).join('');
    }

  } catch (err) {
    agentBody.innerHTML = `<tr><td colspan="6" class="px-6 py-8 text-center text-red-400 text-xs">Failed to load callback report: ${escHtml(err.message)}</td></tr>`;
  }
}

// ── 42-Day Auto-Lost & 7-Day Escalation Lifecycle Engine ────
async function runLifecycleEngine() {
  const btn = document.getElementById('lifecycle-btn');
  btn.disabled = true;
  btn.innerHTML = `<div class="spinner-sm mx-auto"></div>`;

  try {
    const result = await callBackend('enforceLeadLifecycleRules');
    showToast(`Audit Complete: ${result.expiredCount} leads expired (>42d) to Lost, ${result.escalatedCount} stale leads escalated (7d+).`, 'warning');
    loadDashboard();
    if (currentAdminView === 'callbacks') {
      loadCallbackReport(currentReportDate);
      loadPromisedPayments();
    }
  } catch (err) {
    showToast(`Lifecycle audit failed: ${err.message}`, 'error');
  } finally {
    btn.disabled = false;
    btn.innerHTML = `⚙️ Run 42-Day & 7-Day Audit`;
  }
}

// ── Master Grid ──────────────────────────────────────────────
// ── Master Grid State & Deduplication Engine ──────────────────
let rawMasterGridData = [];
let filteredMasterGridData = [];
let masterGridRecordsMap = new Map();
let currentViewingCustomerId = null;

let gridSearchQuery = '';
let gridFilterStatus = '';
let gridFilterAgent = '';
let gridFilterPayment = '';
let gridFilterDuplicate = '';
let gridFilterDate = 'all';
let gridDateFrom = '';
let gridDateTo = '';
let activeQuickFilter = 'all';

let gridSortColumn = 'orderDate';
let gridSortDirection = 'desc';

let gridCurrentPage = 1;
let gridPageSize = 50;

let gridSelectedIds = new Set();
let detectedDuplicateClusters = {
  byPhone: new Map(),
  byEmail: new Map(),
  byOrder: new Map(),
  clientDupMap: new Map() // customerId -> { isDuplicate, type, count, isPrimary, matchKey, group }
};
let currentDuplicateGrouping = 'phone';
let duplicateManagerSelectedIds = new Set();

// Normalization Helpers
function normalizePhoneNumber(phone) {
  if (!phone) return '';
  let str = String(phone).replace(/\D/g, '');
  if (!str) return '';
  if (str.startsWith('27') && str.length === 11) {
    str = '0' + str.slice(2);
  }
  return str;
}

function normalizeEmailAddress(email) {
  if (!email) return '';
  return String(email).trim().toLowerCase();
}

function normalizeOrderNumber(order) {
  if (!order) return '';
  const clean = String(order).trim().toUpperCase();
  if (clean === '—' || clean === 'NONE' || clean === 'N/A') return '';
  return clean;
}

// Analyze records and group duplicates
function analyzeDuplicates(records) {
  const byPhone = new Map();
  const byEmail = new Map();
  const byOrder = new Map();
  const clientDupMap = new Map();

  records.forEach(r => {
    const p = normalizePhoneNumber(r.cellNumber);
    if (p && p.length >= 9) {
      if (!byPhone.has(p)) byPhone.set(p, []);
      byPhone.get(p).push(r);
    }
    const e = normalizeEmailAddress(r.email);
    if (e && e.includes('@') && !e.includes('example.com') && !e.includes('test.com')) {
      if (!byEmail.has(e)) byEmail.set(e, []);
      byEmail.get(e).push(r);
    }
    const o = normalizeOrderNumber(r.orderNumber);
    if (o && (o.startsWith('OVR-') || o.startsWith('OVK-') || o.length >= 6)) {
      if (!byOrder.has(o)) byOrder.set(o, []);
      byOrder.get(o).push(r);
    }
  });

  const filterDups = (map, type) => {
    const dupOnly = new Map();
    map.forEach((list, key) => {
      if (list.length > 1) {
        // Sort cluster so most active/paid/oldest is candidate primary (index 0)
        list.sort((a, b) => {
          if (a.payStatus === 'Paid' && b.payStatus !== 'Paid') return -1;
          if (b.payStatus === 'Paid' && a.payStatus !== 'Paid') return 1;
          if (a.status !== 'Duplicate' && b.status === 'Duplicate') return -1;
          if (b.status !== 'Duplicate' && a.status === 'Duplicate') return 1;
          const dateA = a.createdDate || a.orderDate || '9999';
          const dateB = b.createdDate || b.orderDate || '9999';
          return dateA.localeCompare(dateB);
        });

        dupOnly.set(key, list);

        list.forEach((rec, idx) => {
          const isPrimary = (idx === 0);
          if (!clientDupMap.has(String(rec.id))) {
            clientDupMap.set(String(rec.id), {
              isDuplicate: true,
              type: type,
              count: list.length,
              isPrimary: isPrimary,
              matchKey: key,
              group: list
            });
          }
        });
      }
    });
    return dupOnly;
  };

  detectedDuplicateClusters.byPhone = filterDups(byPhone, 'phone');
  detectedDuplicateClusters.byEmail = filterDups(byEmail, 'email');
  detectedDuplicateClusters.byOrder = filterDups(byOrder, 'order');
  detectedDuplicateClusters.clientDupMap = clientDupMap;

  // Update header badge and pill counts
  const totalDupRecords = clientDupMap.size;
  const dupBadge = document.getElementById('grid-dup-badge');
  if (dupBadge) {
    if (totalDupRecords > 0) {
      dupBadge.textContent = `⚠️ ${totalDupRecords} Duplicates Detected`;
      dupBadge.classList.remove('hidden');
    } else {
      dupBadge.classList.add('hidden');
    }
  }

  const dupModalBadge = document.getElementById('dup-modal-badge');
  if (dupModalBadge) {
    const totalGroups = detectedDuplicateClusters.byPhone.size + detectedDuplicateClusters.byEmail.size + detectedDuplicateClusters.byOrder.size;
    dupModalBadge.textContent = `${totalDupRecords} Records across ${totalGroups} Groups`;
  }
}

// ── Master Grid Loader ─────────────────────────────────────────
async function loadMasterGrid() {
  const tbody = document.getElementById('grid-body');
  if (!tbody) return;
  tbody.innerHTML = `<tr><td colspan="10" class="px-6 py-12 text-center"><div class="spinner mx-auto mb-2"></div><p class="text-gray-500 text-sm">Loading client database...</p></td></tr>`;

  try {
    // Fetch a large window so Team Lead can search, filter, and dedup instantly
    const result = await callBackend('getAdminMasterGrid', { offset: 0, limit: 1500 });
    rawMasterGridData = result.data || [];
    gridTotal = result.total || rawMasterGridData.length;

    masterGridRecordsMap.clear();
    rawMasterGridData.forEach(r => masterGridRecordsMap.set(String(r.id), r));

    // Populate agent dropdown for filtering
    populateGridAgentFilter();

    // Run duplicate analysis
    analyzeDuplicates(rawMasterGridData);

    // Apply active filters & render
    applyGridFilters();

  } catch (err) {
    tbody.innerHTML = `<tr><td colspan="10" class="px-6 py-8 text-center text-red-400 text-xs">Failed to load grid: ${escHtml(err.message)}</td></tr>`;
  }
}

function populateGridAgentFilter() {
  const select = document.getElementById('grid-filter-agent');
  if (!select) return;

  // Extract unique agents from loaded data
  const currentVal = select.value;
  const agentSet = new Set();
  rawMasterGridData.forEach(r => {
    if (r.agent && r.agent !== '—' && r.agent !== 'Unassigned') {
      agentSet.add(r.agent);
    }
  });

  const sortedAgents = Array.from(agentSet).sort();
  select.innerHTML = `<option value="">All Agents</option><option value="__unassigned__">Unassigned</option>`;
  sortedAgents.forEach(ag => {
    const opt = document.createElement('option');
    opt.value = ag;
    opt.textContent = ag;
    select.appendChild(opt);
  });

  if (currentVal) select.value = currentVal;
}

// ── Search & Filter Logic ─────────────────────────────────────
let gridSearchDebounce = null;
function handleGridSearch(val) {
  gridSearchQuery = (val || '').trim().toLowerCase();
  const clearBtn = document.getElementById('grid-search-clear');
  if (clearBtn) {
    clearBtn.classList.toggle('hidden', !gridSearchQuery);
  }
  clearTimeout(gridSearchDebounce);
  gridSearchDebounce = setTimeout(() => {
    applyGridFilters();
  }, 150);
}

function clearGridSearch() {
  const input = document.getElementById('grid-search-input');
  if (input) input.value = '';
  handleGridSearch('');
}

function toggleGridAdvancedFilters() {
  const filterGrid = document.getElementById('grid-advanced-filters');
  if (filterGrid) filterGrid.classList.toggle('hidden');
}

function handleDateRangeFilterChange(val) {
  gridFilterDate = val;
  const customContainer = document.getElementById('grid-custom-date-container');
  if (customContainer) {
    customContainer.classList.toggle('hidden', val !== 'custom');
  }
  applyGridFilters();
}

function setGridQuickFilter(type) {
  activeQuickFilter = type;

  // Reset pills active styling
  const pills = ['all', 'duplicates', 'expired_ep', 'promised', 'escalated', 'marked_duplicate'];
  pills.forEach(p => {
    const el = document.getElementById(`pill-${p}`);
    if (el) {
      if (p === type || (p === 'marked_duplicate' && type === 'marked_duplicate')) {
        el.className = 'px-2.5 py-1 rounded-lg text-xs font-bold bg-fiber-500/25 text-fiber-300 border border-fiber-500/40 transition-all shadow-sm';
      } else {
        el.className = 'px-2.5 py-1 rounded-lg text-xs font-semibold bg-white/5 text-gray-300 hover:bg-white/10 border border-white/5 transition-all';
      }
    }
  });

  // Sync with dropdowns if applicable
  const dupSelect = document.getElementById('grid-filter-duplicate');
  const paySelect = document.getElementById('grid-filter-payment');
  const statusSelect = document.getElementById('grid-filter-status');

  if (type === 'duplicates') {
    if (dupSelect) dupSelect.value = 'potential_duplicates';
  } else if (type === 'marked_duplicate') {
    if (dupSelect) dupSelect.value = 'marked_duplicate';
  } else if (type === 'expired_ep') {
    if (paySelect) paySelect.value = 'Expired_EasyPay';
  } else if (type === 'promised') {
    if (paySelect) paySelect.value = 'Promised_Payment';
  } else if (type === 'escalated') {
    if (statusSelect) statusSelect.value = 'Escalated - Stale Lead';
  } else if (type === 'all') {
    if (dupSelect) dupSelect.value = '';
    if (paySelect) paySelect.value = '';
    if (statusSelect) statusSelect.value = '';
  }

  applyGridFilters();
}

function resetGridFilters() {
  gridSearchQuery = '';
  const searchInput = document.getElementById('grid-search-input');
  if (searchInput) searchInput.value = '';
  const clearBtn = document.getElementById('grid-search-clear');
  if (clearBtn) clearBtn.classList.add('hidden');

  const statusSel = document.getElementById('grid-filter-status');
  if (statusSel) statusSel.value = '';
  const agentSel = document.getElementById('grid-filter-agent');
  if (agentSel) agentSel.value = '';
  const paySel = document.getElementById('grid-filter-payment');
  if (paySel) paySel.value = '';
  const dupSel = document.getElementById('grid-filter-duplicate');
  if (dupSel) dupSel.value = '';
  const dateSel = document.getElementById('grid-filter-date');
  if (dateSel) dateSel.value = 'all';

  const customContainer = document.getElementById('grid-custom-date-container');
  if (customContainer) customContainer.classList.add('hidden');

  const dateFrom = document.getElementById('grid-date-from');
  if (dateFrom) dateFrom.value = '';
  const dateTo = document.getElementById('grid-date-to');
  if (dateTo) dateTo.value = '';

  activeQuickFilter = 'all';
  applyGridFilters();
}

function applyGridFilters() {
  const statusVal = (document.getElementById('grid-filter-status')?.value || '').trim();
  const agentVal = (document.getElementById('grid-filter-agent')?.value || '').trim();
  const paymentVal = (document.getElementById('grid-filter-payment')?.value || '').trim();
  const dupVal = (document.getElementById('grid-filter-duplicate')?.value || '').trim();
  const dateVal = (document.getElementById('grid-filter-date')?.value || 'all').trim();
  const dateFromVal = (document.getElementById('grid-date-from')?.value || '').trim();
  const dateToVal = (document.getElementById('grid-date-to')?.value || '').trim();

  const today = getTodayStr();
  const yesterday = addDaysToToday(-1);
  const last7 = addDaysToToday(-7);
  const last30 = addDaysToToday(-30);

  // Compute stats for pills
  let countDups = 0;
  let countExpiredEp = 0;
  let countPromised = 0;
  let countEscalated = 0;
  let countMarkedDup = 0;

  rawMasterGridData.forEach(r => {
    if (detectedDuplicateClusters.clientDupMap.has(String(r.id))) countDups++;
    if (r.easyPayExpiry && r.easyPayExpiry < today) countExpiredEp++;
    if (r.promisedPaymentDate) countPromised++;
    if (r.status === 'Escalated - Stale Lead') countEscalated++;
    if (r.status === 'Duplicate' || r.recordStatus === 'Inactive') countMarkedDup++;
  });

  const setPillCount = (id, val) => {
    const el = document.getElementById(id);
    if (el) el.textContent = val;
  };
  setPillCount('pill-count-all', rawMasterGridData.length);
  setPillCount('pill-count-duplicates', countDups);
  setPillCount('pill-count-expired-ep', countExpiredEp);
  setPillCount('pill-count-promised', countPromised);
  setPillCount('pill-count-escalated', countEscalated);
  setPillCount('pill-count-marked-dup', countMarkedDup);

  // Filter dataset
  filteredMasterGridData = rawMasterGridData.filter(r => {
    // Search Query (across name, id, phone, altPhone, email, address, suburb, agent, orderNumber, easyPayNumber, referralCode)
    if (gridSearchQuery) {
      const q = gridSearchQuery;
      const match = (
        (r.name && r.name.toLowerCase().includes(q)) ||
        (r.id && r.id.toLowerCase().includes(q)) ||
        (r.cellNumber && r.cellNumber.replace(/\s+/g, '').includes(q.replace(/\s+/g, ''))) ||
        (r.alternateCell && r.alternateCell.replace(/\s+/g, '').includes(q.replace(/\s+/g, ''))) ||
        (r.email && r.email.toLowerCase().includes(q)) ||
        (r.address && r.address.toLowerCase().includes(q)) ||
        (r.suburb && r.suburb.toLowerCase().includes(q)) ||
        (r.agent && r.agent.toLowerCase().includes(q)) ||
        (r.orderNumber && r.orderNumber.toLowerCase().includes(q)) ||
        (r.easyPayNumber && r.easyPayNumber.toLowerCase().includes(q)) ||
        (r.referralCode && r.referralCode.toLowerCase().includes(q)) ||
        (r.referredByCode && r.referredByCode.toLowerCase().includes(q)) ||
        (r.status && r.status.toLowerCase().includes(q))
      );
      if (!match) return false;
    }

    // Status Filter
    if (statusVal) {
      if (statusVal === 'Duplicate') {
        if (r.status !== 'Duplicate' && r.recordStatus !== 'Inactive') return false;
      } else if (statusVal === 'Inactive') {
        if (r.recordStatus !== 'Inactive') return false;
      } else {
        if (r.status !== statusVal) return false;
      }
    }

    // Agent Filter
    if (agentVal) {
      if (agentVal === '__unassigned__') {
        if (r.agent && r.agent !== '—' && r.agent !== 'Unassigned') return false;
      } else {
        if (r.agent !== agentVal) return false;
      }
    }

    // Payment Filter
    if (paymentVal) {
      if (paymentVal === 'Paid') {
        if (r.payStatus !== 'Paid') return false;
      } else if (paymentVal === 'Pending') {
        if (r.payStatus !== 'Pending') return false;
      } else if (paymentVal === 'Failed') {
        if (r.payStatus !== 'Failed') return false;
      } else if (paymentVal === 'Expired_EasyPay') {
        if (!r.easyPayExpiry || r.easyPayExpiry >= today) return false;
      } else if (paymentVal === 'Promised_Payment') {
        if (!r.promisedPaymentDate) return false;
      }
    }

    // Duplicate Filter
    if (dupVal) {
      if (dupVal === 'potential_duplicates') {
        if (!detectedDuplicateClusters.clientDupMap.has(String(r.id))) return false;
      } else if (dupVal === 'marked_duplicate') {
        if (r.status !== 'Duplicate' && r.recordStatus !== 'Inactive') return false;
      } else if (dupVal === 'unique_only') {
        if (detectedDuplicateClusters.clientDupMap.has(String(r.id)) || r.status === 'Duplicate') return false;
      }
    }

    // Date Range Filter (checking createdDate or orderDate)
    const recDate = r.orderDate || r.createdDate;
    if (dateVal === 'today') {
      if (!recDate || recDate !== today) return false;
    } else if (dateVal === 'yesterday') {
      if (!recDate || recDate !== yesterday) return false;
    } else if (dateVal === 'last7') {
      if (!recDate || recDate < last7) return false;
    } else if (dateVal === 'last30') {
      if (!recDate || recDate < last30) return false;
    } else if (dateVal === 'custom') {
      if (dateFromVal && (!recDate || recDate < dateFromVal)) return false;
      if (dateToVal && (!recDate || recDate > dateToVal)) return false;
    }

    return true;
  });

  // Active filters count badge & reset button toggle
  let activeFilterCount = 0;
  if (gridSearchQuery) activeFilterCount++;
  if (statusVal) activeFilterCount++;
  if (agentVal) activeFilterCount++;
  if (paymentVal) activeFilterCount++;
  if (dupVal) activeFilterCount++;
  if (dateVal !== 'all') activeFilterCount++;

  const badgeEl = document.getElementById('grid-active-filter-count');
  if (badgeEl) {
    badgeEl.textContent = activeFilterCount;
    badgeEl.classList.toggle('hidden', activeFilterCount === 0);
  }

  const resetBtn = document.getElementById('btn-reset-filters');
  if (resetBtn) resetBtn.classList.toggle('hidden', activeFilterCount === 0);

  // Status summary label
  const summaryEl = document.getElementById('grid-status-summary');
  if (summaryEl) {
    summaryEl.textContent = `Showing ${filteredMasterGridData.length} of ${rawMasterGridData.length} clients`;
  }

  // Sort and Render
  sortFilteredData();
  gridCurrentPage = 1;
  renderMasterGridPage();
}

// ── Sorting ───────────────────────────────────────────────────
function sortGridBy(column) {
  if (gridSortColumn === column) {
    gridSortDirection = gridSortDirection === 'asc' ? 'desc' : 'asc';
  } else {
    gridSortColumn = column;
    gridSortDirection = 'asc';
  }

  // Update icons
  const columns = ['name', 'cellNumber', 'agent', 'orderDate', 'easyPayExpiry', 'status', 'payStatus'];
  columns.forEach(col => {
    const icon = document.getElementById(`sort-icon-${col}`);
    if (icon) {
      if (col === gridSortColumn) {
        icon.textContent = gridSortDirection === 'asc' ? '▲' : '▼';
        icon.className = 'text-[10px] text-fiber-400 font-bold';
      } else {
        icon.textContent = '↕';
        icon.className = 'text-[10px] text-gray-600';
      }
    }
  });

  sortFilteredData();
  renderMasterGridPage();
}

function sortFilteredData() {
  filteredMasterGridData.sort((a, b) => {
    let valA = a[gridSortColumn] || '';
    let valB = b[gridSortColumn] || '';

    if (typeof valA === 'string') valA = valA.toLowerCase();
    if (typeof valB === 'string') valB = valB.toLowerCase();

    if (valA < valB) return gridSortDirection === 'asc' ? -1 : 1;
    if (valA > valB) return gridSortDirection === 'asc' ? 1 : -1;
    return 0;
  });
}

// ── Pagination & Rendering ────────────────────────────────────
function changeGridPageSize(val) {
  gridPageSize = val === 'all' ? Infinity : parseInt(val, 10);
  gridCurrentPage = 1;
  renderMasterGridPage();
}

function renderMasterGridPage() {
  const tbody = document.getElementById('grid-body');
  if (!tbody) return;

  if (filteredMasterGridData.length === 0) {
    tbody.innerHTML = `
      <tr>
        <td colspan="10" class="px-6 py-12 text-center text-gray-400">
          <p class="text-base font-semibold text-gray-300">No matching client records found</p>
          <p class="text-xs text-gray-500 mt-1">Try adjusting your search terms or clearing active filters.</p>
          <button onclick="resetGridFilters()" class="mt-3 px-3 py-1.5 bg-fiber-500/20 text-fiber-300 border border-fiber-500/30 rounded-lg text-xs font-semibold hover:bg-fiber-500/30 transition-colors">
            Reset Filters
          </button>
        </td>
      </tr>`;
    renderGridPaginationControls(0, 0);
    return;
  }

  const today = getTodayStr();
  const startIdx = gridPageSize === Infinity ? 0 : (gridCurrentPage - 1) * gridPageSize;
  const endIdx = gridPageSize === Infinity ? filteredMasterGridData.length : Math.min(startIdx + gridPageSize, filteredMasterGridData.length);
  const pageItems = filteredMasterGridData.slice(startIdx, endIdx);

  tbody.innerHTML = pageItems.map(r => {
    const isEpExpired = (r.easyPayExpiry && r.easyPayExpiry < today);
    const dupInfo = detectedDuplicateClusters.clientDupMap.get(String(r.id));
    const isSelected = gridSelectedIds.has(String(r.id));

    let dupBadgeHtml = '';
    if (dupInfo) {
      if (dupInfo.isPrimary) {
        dupBadgeHtml = `<span class="inline-flex items-center px-1.5 py-0.2 rounded text-[10px] font-bold bg-emerald-500/15 text-emerald-300 border border-emerald-500/30" title="Primary record in duplicate cluster">★ Primary</span>`;
      } else {
        dupBadgeHtml = `<span class="inline-flex items-center px-1.5 py-0.2 rounded text-[10px] font-bold bg-amber-500/20 text-amber-300 border border-amber-500/30" title="Duplicate detected (${dupInfo.type}: ${dupInfo.count} entries)">⚠️ Dup (${dupInfo.type})</span>`;
      }
    }

    return `
      <tr class="border-b border-white/5 hover:bg-white/[0.04] transition-colors text-xs ${isSelected ? 'bg-fiber-500/10' : ''}">
        <td class="px-4 py-3" onclick="event.stopPropagation()">
          <input type="checkbox" onchange="toggleSelectGridRow('${escJs(r.id)}', this.checked)" ${isSelected ? 'checked' : ''} class="rounded bg-white/10 border-white/20 text-fiber-500 focus:ring-0 cursor-pointer">
        </td>
        <td class="px-4 py-3 cursor-pointer group" onclick="openCustomerDetail('${escJs(r.id)}')" title="Click to view full customer details from Team Lead perspective">
          <div class="flex items-center gap-1.5 flex-wrap">
            <p class="font-bold text-white group-hover:text-fiber-300 group-hover:underline transition-colors">
              ${escHtml(r.name || 'Unnamed Customer')}
            </p>
            ${dupBadgeHtml}
          </div>
          <p class="text-[11px] text-gray-500 font-mono group-hover:text-gray-400">${escHtml(r.id)}</p>
        </td>
        <td class="px-4 py-3 font-mono text-gray-300">${escHtml(r.cellNumber || '—')}</td>
        <td class="px-4 py-3 text-gray-300">${escHtml(r.agent || '—')}</td>
        <td class="px-4 py-3">
          ${r.referralCode ? `
            <span class="px-2 py-0.5 rounded font-mono font-bold bg-amber-500/10 text-amber-300 border border-amber-500/20">${escHtml(r.referralCode)}</span>
            ${r.referredByCode ? `<p class="text-[10px] text-gray-500 mt-0.5">Ref by: ${escHtml(r.referredByCode)}</p>` : ''}
          ` : `<span class="text-gray-600">—</span>`}
        </td>
        <td class="px-4 py-3">
          ${r.orderNumber ? `<p class="font-mono font-semibold text-fiber-400">${escHtml(r.orderNumber)}</p>` : `<span class="text-gray-600">—</span>`}
          <p class="text-[11px] text-gray-400 font-mono">${escHtml(r.orderDate || r.createdDate || '—')}</p>
        </td>
        <td class="px-4 py-3">
          ${r.easyPayNumber ? `
            <p class="font-mono text-gray-200 font-semibold">${escHtml(r.easyPayNumber)} <span class="text-[10px] text-gray-400">(${escHtml(r.easyPayCycle || 'Cycle 1 of 3')})</span></p>
            <p class="text-[10px] font-mono font-semibold ${isEpExpired ? 'text-red-400 font-bold' : 'text-emerald-400'}">
              ${isEpExpired ? '🔴 EXPIRED: ' : '🟢 Exp: '}${escHtml(r.easyPayExpiry || '—')}
            </p>
          ` : `<span class="text-gray-600">—</span>`}
        </td>
        <td class="px-4 py-3">${statusBadge(r.status)}</td>
        <td class="px-4 py-3">
          <span class="px-2 py-0.5 rounded text-[10px] font-semibold ${r.payStatus === 'Paid' ? 'bg-emerald-500/15 text-emerald-300 border border-emerald-500/30' : 'bg-white/5 text-gray-300'}">
            ${escHtml(r.payStatus || 'Pending')}
          </span>
        </td>
        <td class="px-4 py-3 text-right" onclick="event.stopPropagation()">
          <div class="flex items-center justify-end gap-1.5">
            <button onclick="openCustomerDetail('${escJs(r.id)}')" class="p-1.5 rounded-lg bg-white/5 hover:bg-white/15 text-gray-300 hover:text-white transition-colors" title="View customer profile">
              👁️
            </button>
            <button onclick="openDeleteCustomerModal('${escJs(r.id)}')" class="p-1.5 rounded-lg bg-red-500/10 hover:bg-red-500/20 text-red-300 hover:text-red-200 border border-red-500/20 transition-colors" title="Delete / Mark Duplicate">
              🗑️
            </button>
          </div>
        </td>
      </tr>
    `;
  }).join('');

  renderGridPaginationControls(filteredMasterGridData.length, startIdx);
}

function renderGridPaginationControls(total, startIdx) {
  const container = document.getElementById('grid-pagination');
  if (!container) return;

  if (total === 0 || gridPageSize === Infinity) {
    container.innerHTML = '';
    return;
  }

  const totalPages = Math.ceil(total / gridPageSize);
  let html = `
    <button onclick="goToGridPage(1)" ${gridCurrentPage === 1 ? 'disabled' : ''} class="px-2.5 py-1 rounded-lg text-xs bg-white/5 text-gray-300 hover:bg-white/10 disabled:opacity-30 disabled:pointer-events-none transition-colors">&laquo;</button>
    <button onclick="goToGridPage(${gridCurrentPage - 1})" ${gridCurrentPage === 1 ? 'disabled' : ''} class="px-2.5 py-1 rounded-lg text-xs bg-white/5 text-gray-300 hover:bg-white/10 disabled:opacity-30 disabled:pointer-events-none transition-colors">&lsaquo;</button>
  `;

  // Page Numbers
  const maxButtons = 5;
  let startPage = Math.max(1, gridCurrentPage - Math.floor(maxButtons / 2));
  let endPage = Math.min(totalPages, startPage + maxButtons - 1);
  if (endPage - startPage < maxButtons - 1) {
    startPage = Math.max(1, endPage - maxButtons + 1);
  }

  for (let p = startPage; p <= endPage; p++) {
    html += `
      <button onclick="goToGridPage(${p})" class="px-2.5 py-1 rounded-lg text-xs font-semibold ${p === gridCurrentPage ? 'bg-fiber-500 text-white' : 'bg-white/5 text-gray-300 hover:bg-white/10'} transition-colors">
        ${p}
      </button>
    `;
  }

  html += `
    <button onclick="goToGridPage(${gridCurrentPage + 1})" ${gridCurrentPage === totalPages ? 'disabled' : ''} class="px-2.5 py-1 rounded-lg text-xs bg-white/5 text-gray-300 hover:bg-white/10 disabled:opacity-30 disabled:pointer-events-none transition-colors">&rsaquo;</button>
    <button onclick="goToGridPage(${totalPages})" ${gridCurrentPage === totalPages ? 'disabled' : ''} class="px-2.5 py-1 rounded-lg text-xs bg-white/5 text-gray-300 hover:bg-white/10 disabled:opacity-30 disabled:pointer-events-none transition-colors">&raquo;</button>
    <span class="text-xs text-gray-500 ml-2">Page ${gridCurrentPage} of ${totalPages}</span>
  `;

  container.innerHTML = html;
}

function goToGridPage(page) {
  const totalPages = Math.ceil(filteredMasterGridData.length / gridPageSize);
  if (page < 1 || page > totalPages) return;
  gridCurrentPage = page;
  renderMasterGridPage();
}

// ── Batch Selection ───────────────────────────────────────────
function toggleSelectAllGrid(checked) {
  if (checked) {
    filteredMasterGridData.forEach(r => gridSelectedIds.add(String(r.id)));
  } else {
    gridSelectedIds.clear();
  }
  updateGridBatchBar();
  renderMasterGridPage();
}

function toggleSelectGridRow(id, checked) {
  if (checked) gridSelectedIds.add(String(id));
  else gridSelectedIds.delete(String(id));
  updateGridBatchBar();
}

function deselectAllGridRows() {
  gridSelectedIds.clear();
  const selectAllEl = document.getElementById('grid-select-all');
  if (selectAllEl) selectAllEl.checked = false;
  updateGridBatchBar();
  renderMasterGridPage();
}

function updateGridBatchBar() {
  const bar = document.getElementById('grid-batch-bar');
  const countEl = document.getElementById('grid-selected-count');
  if (!bar || !countEl) return;

  const count = gridSelectedIds.size;
  countEl.textContent = count;
  bar.classList.toggle('hidden', count === 0);

  const selectAllEl = document.getElementById('grid-select-all');
  if (selectAllEl) {
    selectAllEl.checked = (filteredMasterGridData.length > 0 && count === filteredMasterGridData.length);
  }
}

async function batchDeleteSelectedDuplicates(hardDelete = false) {
  const ids = Array.from(gridSelectedIds);
  if (ids.length === 0) {
    showToast('No clients selected for deletion.', 'warning');
    return;
  }

  const modeName = hardDelete ? 'PERMANENTLY DELETE' : 'mark as DUPLICATE';
  if (!confirm(`Are you sure you want to ${modeName} ${ids.length} selected client record(s)?`)) {
    return;
  }

  try {
    const res = await callBackend('deleteDuplicateCustomers', {
      customerIds: ids,
      hardDelete: hardDelete,
      reason: `Bulk ${hardDelete ? 'hard purge' : 'soft delete'} by Team Lead`
    });

    showToast(`Successfully processed ${ids.length} client record(s).`, 'success');
    deselectAllGridRows();
    await loadMasterGrid();
  } catch (err) {
    showToast(`Failed bulk delete: ${err.message}`, 'error');
  }
}

// ── CSV Export ────────────────────────────────────────────────
function exportMasterGridCsv() {
  if (filteredMasterGridData.length === 0) {
    showToast('No records to export.', 'warning');
    return;
  }

  const headers = ['Customer ID', 'Record Status', 'Name', 'Primary Phone', 'Alternate Phone', 'Email', 'Address', 'Suburb', 'Agent', 'Status', 'Order Number', 'Order Date', 'EasyPay Number', 'EasyPay Expiry', 'Payment Status', 'Promised Payment Date', 'Referral Code'];
  const rows = filteredMasterGridData.map(r => [
    r.id || '',
    r.recordStatus || '',
    `"${(r.name || '').replace(/"/g, '""')}"`,
    r.cellNumber || '',
    r.alternateCell || '',
    r.email || '',
    `"${(r.address || '').replace(/"/g, '""')}"`,
    `"${(r.suburb || '').replace(/"/g, '""')}"`,
    `"${(r.agent || '').replace(/"/g, '""')}"`,
    r.status || '',
    r.orderNumber || '',
    r.orderDate || '',
    r.easyPayNumber || '',
    r.easyPayExpiry || '',
    r.payStatus || '',
    r.promisedPaymentDate || '',
    r.referralCode || ''
  ]);

  const csvContent = 'data:text/csv;charset=utf-8,' + [headers.join(','), ...rows.map(e => e.join(','))].join('\n');
  const encodedUri = encodeURI(csvContent);
  const link = document.createElement('a');
  link.setAttribute('href', encodedUri);
  link.setAttribute('download', `fibregems_clients_${getTodayStr()}.csv`);
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);
  showToast('Exported CSV successfully.');
}

// ── Delete Customer Modal Logic ───────────────────────────────
function openDeleteCustomerModal(customerId) {
  const c = masterGridRecordsMap.get(String(customerId));
  if (!c) {
    showToast('Client record not found.', 'error');
    return;
  }

  document.getElementById('del-cust-id').value = customerId;
  document.getElementById('del-cust-name').textContent = c.name || 'Unnamed Client';
  document.getElementById('del-cust-id-preview').textContent = customerId;
  document.getElementById('del-cust-phone').textContent = c.cellNumber || 'No Phone';
  document.getElementById('del-cust-agent').textContent = c.agent || 'Unassigned';
  document.getElementById('del-cust-status').textContent = `${c.status || 'Active'} (${c.payStatus || 'Pending'})`;
  document.getElementById('del-cust-reason').value = '';

  const modal = document.getElementById('modal-delete-customer');
  if (modal) modal.classList.remove('hidden');
}

function closeDeleteCustomerModal() {
  const modal = document.getElementById('modal-delete-customer');
  if (modal) modal.classList.add('hidden');
}

async function submitDeleteCustomer() {
  const customerId = document.getElementById('del-cust-id').value;
  const hardDeleteRadio = document.querySelector('input[name="del-mode"]:checked');
  const isHardDelete = hardDeleteRadio ? hardDeleteRadio.value === 'hard' : false;
  const reason = document.getElementById('del-cust-reason').value.trim();

  if (!customerId) return;

  const btn = document.getElementById('del-confirm-btn');
  btn.disabled = true;
  btn.innerHTML = `<div class="spinner-sm mx-auto"></div>`;

  try {
    try {
      await callBackend('deleteCustomer', {
        customerId,
        hardDelete: isHardDelete,
        reason: reason || (isHardDelete ? 'Permanent purge by Team Lead' : 'Marked as Duplicate by Team Lead')
      });
    } catch (apiErr) {
      // Graceful fallback to markCustomerDuplicate if deleteCustomer is not deployed
      if (!isHardDelete) {
        await callBackend('markCustomerDuplicate', { customerId, reason });
      } else {
        throw apiErr;
      }
    }

    showToast(`Customer ${customerId} successfully ${isHardDelete ? 'purged' : 'marked as duplicate'}.`, 'success');
    closeDeleteCustomerModal();
    closeCustomerDetailModal();
    await loadMasterGrid();
    if (document.getElementById('modal-duplicate-manager') && !document.getElementById('modal-duplicate-manager').classList.contains('hidden')) {
      renderDuplicateManagerBody();
    }
  } catch (err) {
    showToast(`Failed to delete record: ${err.message}`, 'error');
  } finally {
    btn.disabled = false;
    btn.textContent = 'Confirm Deletion';
  }
}

// ── Duplicate Clients Manager Modal ───────────────────────────
function openDuplicateManagerModal() {
  duplicateManagerSelectedIds.clear();
  const modal = document.getElementById('modal-duplicate-manager');
  if (!modal) return;
  modal.classList.remove('hidden');
  renderDuplicateManagerBody();
}

function closeDuplicateManagerModal() {
  const modal = document.getElementById('modal-duplicate-manager');
  if (modal) modal.classList.add('hidden');
}

function switchDuplicateGrouping(criteria) {
  currentDuplicateGrouping = criteria;
  const buttons = ['phone', 'email', 'order'];
  buttons.forEach(b => {
    const btn = document.getElementById(`btn-group-${b}`);
    if (btn) {
      if (b === criteria) {
        btn.className = 'px-3 py-1.5 rounded-lg font-semibold bg-fiber-500 text-white transition-colors';
      } else {
        btn.className = 'px-3 py-1.5 rounded-lg font-semibold bg-white/5 text-gray-400 hover:text-white transition-colors';
      }
    }
  });
  renderDuplicateManagerBody();
}

function selectAllSecondaryDuplicates() {
  const groupMap = currentDuplicateGrouping === 'phone'
    ? detectedDuplicateClusters.byPhone
    : (currentDuplicateGrouping === 'email' ? detectedDuplicateClusters.byEmail : detectedDuplicateClusters.byOrder);

  groupMap.forEach((list) => {
    // Select all items except index 0 (primary)
    for (let i = 1; i < list.length; i++) {
      duplicateManagerSelectedIds.add(String(list[i].id));
    }
  });

  updateDuplicateModalSelectedCount();
  renderDuplicateManagerBody();
}

function toggleDupManagerSelect(id, checked) {
  if (checked) duplicateManagerSelectedIds.add(String(id));
  else duplicateManagerSelectedIds.delete(String(id));
  updateDuplicateModalSelectedCount();
}

function updateDuplicateModalSelectedCount() {
  const countEl = document.getElementById('dup-modal-selected-count');
  if (countEl) countEl.textContent = duplicateManagerSelectedIds.size;
}

function renderDuplicateManagerBody() {
  const container = document.getElementById('dup-modal-body');
  if (!container) return;

  const groupMap = currentDuplicateGrouping === 'phone'
    ? detectedDuplicateClusters.byPhone
    : (currentDuplicateGrouping === 'email' ? detectedDuplicateClusters.byEmail : detectedDuplicateClusters.byOrder);

  if (groupMap.size === 0) {
    container.innerHTML = `
      <div class="py-16 text-center text-gray-400">
        <div class="w-12 h-12 rounded-full bg-emerald-500/10 text-emerald-400 flex items-center justify-center mx-auto mb-3 text-xl font-bold">✓</div>
        <h4 class="text-base font-bold text-white">No Duplicates Found</h4>
        <p class="text-xs text-gray-500 mt-1">No duplicate records detected matching by ${currentDuplicateGrouping === 'phone' ? 'Phone Number' : (currentDuplicateGrouping === 'email' ? 'Email Address' : 'Order Number')}.</p>
      </div>
    `;
    updateDuplicateModalSelectedCount();
    return;
  }

  let html = '';
  groupMap.forEach((list, matchKey) => {
    html += `
      <div class="bg-white/[0.02] border border-white/10 rounded-2xl p-4 space-y-3">
        <div class="flex items-center justify-between pb-2 border-b border-white/5 flex-wrap gap-2">
          <div class="flex items-center gap-2">
            <span class="text-base">${currentDuplicateGrouping === 'phone' ? '📱' : (currentDuplicateGrouping === 'email' ? '✉️' : '📦')}</span>
            <strong class="text-xs text-amber-300 font-mono">${escHtml(matchKey)}</strong>
            <span class="px-2 py-0.5 rounded-full text-[10px] font-bold bg-amber-500/20 text-amber-400">${list.length} Records</span>
          </div>
          <button onclick="selectClusterDuplicates('${escJs(matchKey)}')" class="text-xs text-fiber-400 hover:text-fiber-300 underline font-medium">
            Select duplicates in this cluster
          </button>
        </div>

        <div class="grid grid-cols-1 md:grid-cols-${Math.min(list.length, 3)} gap-3">
    `;

    list.forEach((rec, idx) => {
      const isPrimary = (idx === 0);
      const isChecked = duplicateManagerSelectedIds.has(String(rec.id));

      html += `
        <div class="p-3.5 rounded-xl border ${isPrimary ? 'border-emerald-500/30 bg-emerald-500/[0.03]' : (isChecked ? 'border-red-500/40 bg-red-500/[0.04]' : 'border-white/5 bg-white/[0.02]')} text-xs space-y-2 relative">
          <div class="flex items-start justify-between gap-2">
            <div class="flex items-center gap-2">
              <input type="checkbox" onchange="toggleDupManagerSelect('${escJs(rec.id)}', this.checked)" ${isChecked ? 'checked' : ''} class="rounded bg-white/10 border-white/20 text-fiber-500 focus:ring-0 cursor-pointer">
              <div>
                <p class="font-bold text-white">${escHtml(rec.name || 'Unnamed Client')}</p>
                <p class="text-[10px] font-mono text-gray-400">${escHtml(rec.id)}</p>
              </div>
            </div>
            ${isPrimary ? '<span class="px-2 py-0.5 rounded text-[10px] font-bold bg-emerald-500/20 text-emerald-300 border border-emerald-500/30">★ Keep (Primary)</span>' : '<span class="px-2 py-0.5 rounded text-[10px] font-bold bg-amber-500/20 text-amber-300">Duplicate</span>'}
          </div>

          <div class="space-y-1 text-[11px] pt-1 text-gray-300 border-t border-white/5">
            <div class="flex justify-between"><span class="text-gray-500">Agent:</span> <span class="font-semibold text-fiber-300">${escHtml(rec.agent || '—')}</span></div>
            <div class="flex justify-between"><span class="text-gray-500">Status:</span> <span>${statusBadge(rec.status)}</span></div>
            <div class="flex justify-between"><span class="text-gray-500">Payment:</span> <span class="font-semibold text-white">${escHtml(rec.payStatus || 'Pending')}</span></div>
            <div class="flex justify-between"><span class="text-gray-500">Order #:</span> <span class="font-mono text-fiber-400">${escHtml(rec.orderNumber || '—')}</span></div>
            <div class="flex justify-between"><span class="text-gray-500">Created:</span> <span class="font-mono text-gray-400">${escHtml(rec.createdDate || '—')}</span></div>
          </div>

          <div class="pt-2 flex items-center justify-between border-t border-white/5">
            <button onclick="openCustomerDetail('${escJs(rec.id)}')" class="text-[11px] text-gray-400 hover:text-white underline">Inspect Details</button>
            <button onclick="openDeleteCustomerModal('${escJs(rec.id)}')" class="px-2 py-1 bg-red-500/10 hover:bg-red-500/20 text-red-300 rounded text-[10px] font-bold transition-colors">
              Delete
            </button>
          </div>
        </div>
      `;
    });

    html += `
        </div>
      </div>
    `;
  });

  container.innerHTML = html;
  updateDuplicateModalSelectedCount();
}

function selectClusterDuplicates(matchKey) {
  const groupMap = currentDuplicateGrouping === 'phone'
    ? detectedDuplicateClusters.byPhone
    : (currentDuplicateGrouping === 'email' ? detectedDuplicateClusters.byEmail : detectedDuplicateClusters.byOrder);

  const list = groupMap.get(matchKey);
  if (list) {
    for (let i = 1; i < list.length; i++) {
      duplicateManagerSelectedIds.add(String(list[i].id));
    }
    updateDuplicateModalSelectedCount();
    renderDuplicateManagerBody();
  }
}

async function submitBulkDuplicateAction(hardDelete = false) {
  const ids = Array.from(duplicateManagerSelectedIds);
  if (ids.length === 0) {
    showToast('Please select duplicate records to clean up.', 'warning');
    return;
  }

  const modeName = hardDelete ? 'PERMANENTLY PURGE' : 'mark as DUPLICATE';
  if (!confirm(`Are you sure you want to ${modeName} ${ids.length} selected duplicate record(s)?`)) {
    return;
  }

  const btn = document.getElementById(hardDelete ? 'dup-bulk-hard-btn' : 'dup-bulk-soft-btn');
  if (btn) btn.disabled = true;

  try {
    await callBackend('deleteDuplicateCustomers', {
      customerIds: ids,
      hardDelete: hardDelete,
      reason: `Duplicate Manager cleanup by Team Lead (${currentDuplicateGrouping})`
    });

    showToast(`Successfully processed ${ids.length} duplicate record(s).`, 'success');
    duplicateManagerSelectedIds.clear();
    await loadMasterGrid();
    renderDuplicateManagerBody();
  } catch (err) {
    showToast(`Duplicate cleanup failed: ${err.message}`, 'error');
  } finally {
    if (btn) btn.disabled = false;
  }
}

// ── Customer Detail Modal (Team Lead Perspective) ─────────────
function openCustomerDetail(customerId) {
  const c = masterGridRecordsMap.get(String(customerId));
  currentViewingCustomerId = customerId;
  const modal = document.getElementById('modal-customer-detail');
  if (!modal) return;

  // Set avatar initials
  const initials = (c && c.name) ? c.name.split(' ').map(n => n[0]).join('').slice(0, 2).toUpperCase() : 'CD';
  document.getElementById('cdm-avatar').textContent = initials;
  document.getElementById('cdm-name').textContent = (c && c.name) || 'Customer Details';
  document.getElementById('cdm-id').textContent = customerId;
  document.getElementById('cdm-cell').textContent = (c && c.cellNumber) || '—';
  document.getElementById('cdm-agent').textContent = (c && c.agent) || 'Unassigned';

  // Badges
  document.getElementById('cdm-status-badge').innerHTML = statusBadge(c ? c.status : '');
  document.getElementById('cdm-pay-status-badge').innerHTML = `<span class="px-2.5 py-0.5 rounded text-[10px] font-semibold bg-white/5 text-gray-300 border border-white/10">${escHtml((c && c.payStatus) || 'Pending')}</span>`;
  const recBadgeEl = document.getElementById('cdm-record-status-badge');
  if (recBadgeEl) {
    const rs = (c && c.recordStatus) || 'Active';
    recBadgeEl.innerHTML = `<span class="px-2.5 py-0.5 rounded text-[10px] font-semibold bg-blue-500/10 text-blue-300 border border-blue-500/20">${escHtml(rs)}</span>`;
  }

  // Quick Action Contact Buttons
  const phone = (c && c.cellNumber) ? c.cellNumber.replace(/\s+/g, '') : '';
  const callBtn = document.getElementById('cdm-call-btn');
  const waBtn = document.getElementById('cdm-wa-btn');
  const emailBtn = document.getElementById('cdm-email-btn');

  if (phone && phone !== '—') {
    callBtn.href = `tel:${phone}`;
    callBtn.classList.remove('opacity-50', 'pointer-events-none');
    const waPhone = phone.startsWith('0') ? '27' + phone.slice(1) : phone.replace('+', '');
    waBtn.href = `https://wa.me/${waPhone}`;
    waBtn.classList.remove('opacity-50', 'pointer-events-none');
  } else {
    callBtn.href = '#';
    callBtn.classList.add('opacity-50', 'pointer-events-none');
    waBtn.href = '#';
    waBtn.classList.add('opacity-50', 'pointer-events-none');
  }

  if (c && c.email) {
    emailBtn.href = `mailto:${c.email}`;
    emailBtn.classList.remove('opacity-50', 'pointer-events-none');
  } else {
    emailBtn.href = '#';
    emailBtn.classList.add('opacity-50', 'pointer-events-none');
  }

  // Populate Overview Tab Fields
  document.getElementById('cdm-d-name').textContent = (c && c.name) || '—';
  document.getElementById('cdm-d-cell').textContent = (c && c.cellNumber) || '—';
  document.getElementById('cdm-d-altcell').textContent = (c && c.alternateCell) || '—';
  document.getElementById('cdm-d-email').textContent = (c && c.email) || '—';
  document.getElementById('cdm-d-suburb').textContent = (c && c.suburb) || '—';
  const addrEl = document.getElementById('cdm-d-address');
  addrEl.textContent = (c && c.address) || '—';

  const recordStatusEl = document.getElementById('cdm-d-recordstatus');
  if (recordStatusEl) recordStatusEl.textContent = (c && c.recordStatus) || 'Active';

  document.getElementById('cdm-d-agent').textContent = (c && c.agent) || 'Unassigned';
  document.getElementById('cdm-d-status').textContent = (c && c.status) || '—';
  document.getElementById('cdm-d-nextaction').textContent = (c && c.nextAction) || '—';
  document.getElementById('cdm-d-nextdate').textContent = (c && c.nextActionDate) || '—';
  const nextTimeEl = document.getElementById('cdm-d-nexttime');
  if (nextTimeEl) nextTimeEl.textContent = (c && c.nextActionTime) ? `at ${c.nextActionTime}` : '';

  document.getElementById('cdm-d-lastcontact').textContent = (c && c.lastContactDate) || '—';
  const lastOutcomeEl = document.getElementById('cdm-d-lastoutcome');
  if (lastOutcomeEl) lastOutcomeEl.textContent = (c && (c.lastContactOutcome || c.lastOutcome)) || '—';

  document.getElementById('cdm-d-created').textContent = (c && (c.createdDate || c.orderDate)) || '—';

  // Populate Orders & EasyPay Tab Fields
  document.getElementById('cdm-d-ordernum').textContent = (c && c.orderNumber) || '—';
  document.getElementById('cdm-d-package').textContent = (c && c.package) || '—';
  document.getElementById('cdm-d-paytype').textContent = (c && c.paymentType) || '—';
  document.getElementById('cdm-d-orderdate').textContent = (c && c.orderDate) || '—';
  document.getElementById('cdm-d-activation').textContent = (c && c.activationDate) || '—';
  document.getElementById('cdm-d-refcode').textContent = (c && c.referralCode) || '—';
  const refByCodeEl = document.getElementById('cdm-d-refbycode');
  if (refByCodeEl) refByCodeEl.textContent = (c && c.referredByCode) || '—';

  document.getElementById('cdm-d-easypay').textContent = (c && c.easyPayNumber) || '—';
  document.getElementById('cdm-d-cycle').textContent = (c && c.easyPayCycle) || 'Cycle 1 of 3';
  
  const expiryEl = document.getElementById('cdm-d-expiry');
  if (c && c.easyPayExpiry) {
    const isEpExpired = c.easyPayExpiry < getTodayStr();
    expiryEl.textContent = `${isEpExpired ? '🔴 EXPIRED: ' : '🟢 Active: '}${c.easyPayExpiry}`;
    expiryEl.className = isEpExpired ? 'font-mono font-bold text-red-400' : 'font-mono font-semibold text-emerald-400';
  } else {
    expiryEl.textContent = '—';
    expiryEl.className = 'font-mono text-gray-400';
  }

  document.getElementById('cdm-d-paystatus').textContent = (c && c.payStatus) || 'Pending';
  document.getElementById('cdm-d-promised').textContent = (c && c.promisedPaymentDate) || '—';

  // Switch to Overview Tab by default
  switchCustomerDetailTab('overview');

  // Reset Payment History tab & History tab
  const pmtTabCount = document.getElementById('cdm-payments-tab-count');
  if (pmtTabCount) pmtTabCount.textContent = '...';
  const pmtsListEl = document.getElementById('cdm-payments-list');
  if (pmtsListEl) pmtsListEl.innerHTML = `<div class="py-6 text-center text-xs text-gray-400"><div class="spinner mx-auto mb-2"></div>Loading payments...</div>`;

  document.getElementById('cdm-history-count').textContent = 'Loading...';
  document.getElementById('cdm-history-tab-count').textContent = '...';
  document.getElementById('cdm-history-list').innerHTML = `
    <div class="py-8 text-center"><div class="spinner mx-auto mb-2"></div><p class="text-xs text-gray-400">Loading call history & agent discussion notes...</p></div>
  `;

  // Show Modal
  modal.classList.remove('hidden');

  // Fetch full details and activity history asynchronously
  fetchCustomerDetailHistory(customerId);
}

function closeCustomerDetailModal() {
  const modal = document.getElementById('modal-customer-detail');
  if (modal) modal.classList.add('hidden');
}

function switchCustomerDetailTab(tab) {
  ['overview', 'orders', 'payments', 'history'].forEach(t => {
    const btn = document.getElementById(`cdm-tab-${t}`);
    const panel = document.getElementById(`cdm-panel-${t}`);
    if (btn && panel) {
      if (t === tab) {
        btn.classList.add('border-fiber-500', 'text-fiber-400');
        btn.classList.remove('border-transparent', 'text-gray-400');
        panel.classList.remove('hidden');
      } else {
        btn.classList.remove('border-fiber-500', 'text-fiber-400');
        btn.classList.add('border-transparent', 'text-gray-400');
        panel.classList.add('hidden');
      }
    }
  });
}

async function fetchCustomerDetailHistory(customerId) {
  try {
    const res = await callBackend('getAdminCustomerDetail', { customerId });
    if (!res || !res.customer) return;

    const c = res.customer;
    masterGridRecordsMap.set(String(c.id), { ...masterGridRecordsMap.get(String(c.id)), ...c });

    // Sync latest server values into UI
    document.getElementById('cdm-name').textContent = c.fullName || document.getElementById('cdm-name').textContent;
    document.getElementById('cdm-agent').textContent = c.currentOwnerName || c.agentName || document.getElementById('cdm-agent').textContent;
    document.getElementById('cdm-d-name').textContent = c.fullName || '—';
    document.getElementById('cdm-d-cell').textContent = c.cellNumber || '—';
    document.getElementById('cdm-d-altcell').textContent = c.alternateCell || '—';
    document.getElementById('cdm-d-email').textContent = c.email || '—';
    document.getElementById('cdm-d-address').textContent = c.address || '—';
    document.getElementById('cdm-d-suburb').textContent = c.suburb || '—';
    document.getElementById('cdm-d-package').textContent = c.productPackage || '—';
    document.getElementById('cdm-d-paytype').textContent = c.paymentType || '—';
    document.getElementById('cdm-d-agent').textContent = c.currentOwnerName || c.agentName || '—';
    document.getElementById('cdm-d-status').textContent = c.status || '—';
    document.getElementById('cdm-d-nextaction').textContent = c.nextAction || '—';
    document.getElementById('cdm-d-nextdate').textContent = c.nextActionDate || '—';
    const nextTimeEl = document.getElementById('cdm-d-nexttime');
    if (nextTimeEl) nextTimeEl.textContent = c.nextActionTime ? `at ${c.nextActionTime}` : '';

    document.getElementById('cdm-d-lastcontact').textContent = c.lastContactDate || '—';
    const lastOutcomeEl = document.getElementById('cdm-d-lastoutcome');
    if (lastOutcomeEl) lastOutcomeEl.textContent = c.lastContactOutcome || c.lastOutcome || '—';

    document.getElementById('cdm-d-ordernum').textContent = c.orderNumber || '—';
    document.getElementById('cdm-d-easypay').textContent = c.easyPayNumber || '—';
    document.getElementById('cdm-d-cycle').textContent = c.easyPayCycle || '—';

    // Escalation Alert Banner
    const escBanner = document.getElementById('cdm-escalation-banner');
    if (escBanner) {
      if (c.escalated === 'True' || c.escalated === true) {
        escBanner.classList.remove('hidden');
        const reasonEl = document.getElementById('cdm-escalation-reason');
        if (reasonEl) reasonEl.textContent = c.escalationReason || 'No contact/feedback recorded for >= 7 days.';
      } else {
        escBanner.classList.add('hidden');
      }
    }

    // Render Payments List
    const pmts = res.payments || [];
    const pmtTabCount = document.getElementById('cdm-payments-tab-count');
    if (pmtTabCount) pmtTabCount.textContent = pmts.length;

    const pmtsListEl = document.getElementById('cdm-payments-list');
    if (pmtsListEl) {
      if (pmts.length === 0) {
        pmtsListEl.innerHTML = `
          <div class="py-8 text-center text-gray-500 text-xs bg-white/[0.01] rounded-xl border border-white/5">
            No specific payment transactions recorded yet for this customer.
          </div>
        `;
      } else {
        pmtsListEl.innerHTML = `
          <div class="overflow-x-auto">
            <table class="w-full text-xs">
              <thead>
                <tr class="border-b border-white/10 text-gray-400 uppercase font-semibold text-[10px]">
                  <th class="py-2.5 px-3 text-left">Payment ID</th>
                  <th class="py-2.5 px-3 text-left">Status</th>
                  <th class="py-2.5 px-3 text-left">Promised Date</th>
                  <th class="py-2.5 px-3 text-left">Paid Date</th>
                  <th class="py-2.5 px-3 text-right">Amount</th>
                </tr>
              </thead>
              <tbody class="divide-y divide-white/5">
                ${pmts.map(p => `
                  <tr>
                    <td class="py-2.5 px-3 font-mono text-fiber-400 font-semibold">${escHtml(p.paymentId || '—')}</td>
                    <td class="py-2.5 px-3"><span class="px-2 py-0.5 rounded text-[10px] font-semibold bg-white/5 text-gray-300 border border-white/10">${escHtml(p.status || 'Pending')}</span></td>
                    <td class="py-2.5 px-3 font-mono text-amber-300">${escHtml(p.promisedDate || '—')}</td>
                    <td class="py-2.5 px-3 font-mono text-emerald-400">${escHtml(p.paidDate || '—')}</td>
                    <td class="py-2.5 px-3 text-right font-mono font-bold text-white">${p.amount ? 'R' + escHtml(p.amount) : '—'}</td>
                  </tr>
                `).join('')}
              </tbody>
            </table>
          </div>
        `;
      }
    }

    // Render activity list
    const acts = res.activities || [];
    document.getElementById('cdm-history-count').textContent = `${acts.length} event${acts.length === 1 ? '' : 's'}`;
    document.getElementById('cdm-history-tab-count').textContent = acts.length;

    const listEl = document.getElementById('cdm-history-list');
    if (acts.length === 0) {
      listEl.innerHTML = `
        <div class="py-8 text-center text-gray-500 text-xs bg-white/[0.01] rounded-xl border border-white/5">
          No call logs or recorded activity yet for this customer.
        </div>
      `;
      return;
    }

    listEl.innerHTML = acts.map(act => {
      let badgeClass = "bg-blue-500/10 text-blue-400 border border-blue-500/20";
      const o = (act.outcome || '').toLowerCase();
      if (o.includes('won') || o.includes('activated') || o.includes('payment')) {
        badgeClass = "bg-emerald-500/10 text-emerald-400 border border-emerald-500/20";
      } else if (o.includes('not interested') || o.includes('lost') || o.includes('cancel')) {
        badgeClass = "bg-red-500/10 text-red-400 border border-red-500/20";
      } else if (o.includes('reschedule') || o.includes('callback') || o.includes('no answer')) {
        badgeClass = "bg-amber-500/10 text-amber-400 border border-amber-500/20";
      }

      return `
        <div class="p-3.5 bg-white/[0.025] hover:bg-white/[0.04] transition-colors border border-white/5 rounded-xl space-y-2 text-xs">
          <div class="flex items-center justify-between flex-wrap gap-2">
            <div class="flex items-center gap-2">
              <span class="px-2 py-0.5 rounded text-[11px] font-semibold ${badgeClass}">
                ${escHtml(act.outcome || act.actionType || 'Call')}
              </span>
              <span class="text-gray-300 font-medium">Logged by <strong class="text-fiber-300">${escHtml(act.agentName || 'Agent')}</strong></span>
            </div>
            <span class="text-[11px] text-gray-400 font-mono">${escHtml(act.dateTime || '—')}</span>
          </div>

          ${act.notes ? `
            <div class="bg-black/25 p-2.5 rounded-lg border border-white/5 text-gray-300 font-sans leading-relaxed">
              ${escHtml(act.notes)}
            </div>
          ` : `<p class="text-gray-500 italic text-[11px]">No discussion notes entered.</p>`}

          <div class="flex items-center gap-3 text-[11px] text-gray-400 pt-1 border-t border-white/5 flex-wrap">
            ${act.statusAfter ? `<span>Status: <strong class="text-white">${escHtml(act.statusAfter)}</strong></span>` : ''}
            ${act.nextAction ? `<span>•</span><span>Next: <strong class="text-amber-300">${escHtml(act.nextAction)}</strong></span>` : ''}
            ${act.nextActionDate ? `<span>(${escHtml(act.nextActionDate)})</span>` : ''}
          </div>
        </div>
      `;
    }).join('');

  } catch (err) {
    document.getElementById('cdm-history-list').innerHTML = `
      <div class="py-6 text-center text-red-400 text-xs">
        Failed to load activity logs: ${escHtml(err.message)}
      </div>
    `;
  }
}

function openReassignModalFromDetail() {
  if (!currentViewingCustomerId) return;
  const c = masterGridRecordsMap.get(String(currentViewingCustomerId)) || {};
  openAdminFollowUpModal(currentViewingCustomerId, c.fullName || c.name || 'Customer', c.cellNumber || '');
}

function statusBadge(status) {
  const s = (status || '').toLowerCase();
  if (s.includes('won') || s.includes('activated')) return `<span class="px-2.5 py-1 rounded-full text-[10px] font-bold bg-emerald-500/15 text-emerald-400 border border-emerald-500/20">${escHtml(status)}</span>`;
  if (s.includes('lost') || s.includes('cancel') || s.includes('expiry')) return `<span class="px-2.5 py-1 rounded-full text-[10px] font-bold bg-red-500/15 text-red-400 border border-red-500/20">${escHtml(status)}</span>`;
  if (s.includes('pending') || s.includes('call')) return `<span class="px-2.5 py-1 rounded-full text-[10px] font-bold bg-amber-500/15 text-amber-400 border border-amber-500/20">${escHtml(status)}</span>`;
  return `<span class="px-2.5 py-1 rounded-full text-[10px] font-bold bg-blue-500/15 text-blue-400 border border-blue-500/20">${escHtml(status || 'New')}</span>`;
}

// ── Agility Sync ─────────────────────────────────────────────
async function triggerAgilitySync() {
  const btn = document.getElementById('sync-btn');
  const resultBox = document.getElementById('sync-result');

  btn.disabled = true;
  btn.innerHTML = `<div class="spinner-sm mx-auto"></div>`;
  resultBox.classList.add('hidden');

  try {
    const result = await callBackend('runAgilitySync', { force: true });
    resultBox.classList.remove('hidden');
    resultBox.innerHTML = `
      <div class="flex items-center gap-3 text-emerald-400 font-semibold mb-2">
        <svg class="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="2">
          <path stroke-linecap="round" stroke-linejoin="round" d="M9 12.75L11.25 15 15 9.75M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
        </svg>
        Agility Sync Successful
      </div>
      <p class="text-sm text-gray-300">
        Injected <strong class="text-white font-bold">${result.newLeads}</strong> new leads with exact order dates and updated <strong class="text-white font-bold">${result.updatedLeads}</strong> existing records.
      </p>
      <div class="mt-2 text-xs text-gray-400 font-mono bg-black/20 p-2 rounded">
        Skipped: ${result.skipped}<br>
        Debug: ${JSON.stringify(result.debugSkipReasons || {})}
      </div>
    `;
    showToast("Agility sync completed!");
  } catch (err) {
    resultBox.classList.remove('hidden');
    resultBox.innerHTML = `
      <div class="text-red-400 font-semibold mb-1">Sync Error</div>
      <p class="text-sm text-gray-400">${escHtml(err.message)}</p>
    `;
  } finally {
    btn.disabled = false;
    btn.innerHTML = `Run Agility Sync`;
  }
}

// ── Agent Management ─────────────────────────────────────────
async function loadAgentList() {
  const tbody = document.getElementById('agents-body');
  const countEl = document.getElementById('agents-count');
  tbody.innerHTML = `<tr><td colspan="6" class="px-6 py-8 text-center"><div class="spinner mx-auto mb-2"></div><p class="text-xs text-gray-400">Loading agents...</p></td></tr>`;

  try {
    const result = await callBackend('getAgentList');
    const agents = result.agents || [];
    countEl.textContent = `${agents.length} agent account${agents.length !== 1 ? 's' : ''}`;

    if (agents.length === 0) {
      tbody.innerHTML = `<tr><td colspan="5" class="px-6 py-8 text-center text-gray-500 text-xs">No agents created yet.</td></tr>`;
      return;
    }

    tbody.innerHTML = agents.map(a => `
      <tr class="border-b border-white/5 hover:bg-white/[0.02] text-xs">
        <td class="px-4 py-3">
          <p class="font-bold text-white">${escHtml(a.name)}</p>
          <p class="text-[11px] text-gray-500 font-mono">${escHtml(a.agentId)}</p>
        </td>
        <td class="px-4 py-3 text-gray-300 font-mono">${escHtml(a.email)}</td>
        <td class="px-4 py-3"><span class="px-2 py-0.5 rounded text-[10px] font-bold ${a.status === 'Verified' ? 'bg-emerald-500/20 text-emerald-300' : 'bg-gray-500/20 text-gray-400'}">${escHtml(a.status)}</span></td>
        <td class="px-4 py-3 font-mono text-gray-400">${escHtml(a.tempPass || '—')}</td>
        <td class="px-4 py-3">
          <button onclick="openEditAgent('${escHtml(a.agentId)}', '${escJs(a.name)}', '${escJs(a.email)}', '${escJs(a.status)}')" class="px-2.5 py-1 bg-white/5 hover:bg-white/10 text-gray-300 rounded text-[11px] font-semibold transition-colors mr-1">Edit</button>
        </td>
      </tr>
    `).join('');
  } catch (err) {
    tbody.innerHTML = `<tr><td colspan="5" class="px-6 py-8 text-center text-red-400 text-xs">Failed to load agents: ${escHtml(err.message)}</td></tr>`;
  }
}

function openAgentModal(isEdit = false) {
  document.getElementById('modal-agent').classList.remove('hidden');
  document.getElementById('temp-pass-result').classList.add('hidden');
  switchAgentTab('details');

  if (!isEdit) {
    document.getElementById('agent-modal-title').textContent = 'Add Agent';
    document.getElementById('agent-modal-subtitle').textContent = 'Create a new portal account';
    document.getElementById('am-agent-id').value = '';
    document.getElementById('am-name').value = '';
    document.getElementById('am-email').value = '';
    document.getElementById('am-status-row').classList.add('hidden');
    document.getElementById('am-password-row').classList.remove('hidden');
    document.getElementById('am-password').value = '';
    document.getElementById('tab-password').classList.add('hidden');
  }
}

function openEditAgent(agentId, name, email, status) {
  openAgentModal(true);
  document.getElementById('agent-modal-title').textContent = 'Edit Agent';
  document.getElementById('agent-modal-subtitle').textContent = `Editing ${name}`;
  document.getElementById('am-agent-id').value = agentId;
  document.getElementById('am-name').value = name;
  document.getElementById('am-email').value = email;
  document.getElementById('am-status').value = status;
  document.getElementById('am-status-row').classList.remove('hidden');
  document.getElementById('am-password-row').classList.add('hidden');
  document.getElementById('tab-password').classList.remove('hidden');
}

function closeAgentModal() {
  document.getElementById('modal-agent').classList.add('hidden');
}

function switchAgentTab(tab) {
  const tabDetails = document.getElementById('tab-details');
  const tabPass = document.getElementById('tab-password');
  const panelDetails = document.getElementById('tab-panel-details');
  const panelPass = document.getElementById('tab-panel-password');

  if (tab === 'details') {
    tabDetails.className = 'flex-1 py-3 text-sm font-medium text-fiber-400 border-b-2 border-fiber-500 transition-colors';
    tabPass.className = 'flex-1 py-3 text-sm font-medium text-gray-500 border-b-2 border-transparent hover:text-gray-300 transition-colors';
    panelDetails.classList.remove('hidden');
    panelPass.classList.add('hidden');
  } else {
    tabPass.className = 'flex-1 py-3 text-sm font-medium text-fiber-400 border-b-2 border-fiber-500 transition-colors';
    tabDetails.className = 'flex-1 py-3 text-sm font-medium text-gray-500 border-b-2 border-transparent hover:text-gray-300 transition-colors';
    panelPass.classList.remove('hidden');
    panelDetails.classList.add('hidden');
  }
}

async function saveAgentModal() {
  const agentId = document.getElementById('am-agent-id').value;
  const isEdit = !!agentId;
  const saveBtn = document.getElementById('agent-modal-save-btn');

  saveBtn.disabled = true;
  saveBtn.innerHTML = `<div class="spinner-sm mx-auto"></div>`;

  try {
    if (!isEdit) {
      await callBackend('createAgent', {
        name: document.getElementById('am-name').value.trim(),
        email: document.getElementById('am-email').value.trim(),
        password: document.getElementById('am-password').value
      });
      showToast('Agent created successfully!');
    } else {
      await callBackend('updateAgent', {
        agentId: agentId,
        name: document.getElementById('am-name').value.trim(),
        email: document.getElementById('am-email').value.trim(),
        status: document.getElementById('am-status').value
      });
      showToast('Agent details updated!');
    }
    closeAgentModal();
    loadAgentList();
  } catch (err) {
    showToast(err.message, 'error');
  } finally {
    saveBtn.disabled = false;
    saveBtn.textContent = 'Save';
  }
}

// ── Admin Promised Payments & Follow-Ups ─────────────────────
async function loadPromisedPayments() {
  const tbody = document.getElementById('rep-promised-body');
  if (!tbody) return;
  tbody.innerHTML = `<tr><td colspan="7" class="px-6 py-8 text-center"><div class="spinner mx-auto mb-2"></div><p class="text-xs text-gray-400">Loading promised payments...</p></td></tr>`;

  try {
    const result = await callBackend('getAdminPromisedPayments');
    const payments = result.payments || [];

    if (payments.length === 0) {
      tbody.innerHTML = `<tr><td colspan="7" class="px-6 py-8 text-center text-gray-500 text-xs">No active promised payment follow-ups found.</td></tr>`;
      return;
    }

    tbody.innerHTML = payments.map(p => {
      let formattedPhone = p.phone || '';
      if (formattedPhone && !formattedPhone.toString().startsWith('0')) {
        formattedPhone = '0' + formattedPhone;
      }

      let timeStatus = `<span class="px-2 py-0.5 rounded text-[10px] font-bold bg-white/10 text-gray-300 border border-white/20">Upcoming (in ${Math.abs(p.daysUntilDue)} days)</span>`;
      if (p.daysUntilDue === 0) timeStatus = `<span class="px-2 py-0.5 rounded text-[10px] font-bold bg-amber-500/20 text-amber-300 border border-amber-500/30">Due Today</span>`;
      else if (p.daysUntilDue > 0) timeStatus = `<span class="px-2 py-0.5 rounded text-[10px] font-bold bg-red-500/20 text-red-300 border border-red-500/30">Overdue by ${p.daysUntilDue} days</span>`;

      const today = new Date().toISOString().slice(0, 10);
      const isEpExpired = p.easyPayExpiry && p.easyPayExpiry < today;

      return `
        <tr class="border-b border-white/5 hover:bg-purple-950/15 text-xs">
          <td class="px-4 py-3">
            <p class="font-bold text-white">${escHtml(p.name)}</p>
            <p class="text-[11px] text-gray-500">${escHtml(p.customerId)}</p>
          </td>
          <td class="px-4 py-3 font-mono text-gray-300">${escHtml(formattedPhone || '—')}</td>
          <td class="px-4 py-3 font-medium text-gray-300">${escHtml(p.agentName)}</td>
          <td class="px-4 py-3 font-mono font-bold text-purple-300">${escHtml(p.promisedPaymentDate)}</td>
          <td class="px-4 py-3">
            ${p.easyPayNumber ? `
              <p class="font-mono font-bold text-emerald-300">${escHtml(p.easyPayNumber)} <span class="text-[10px] text-gray-400">(${escHtml(p.easyPayCycle || 'Cycle 1')})</span></p>
              <p class="text-[10px] font-mono font-semibold ${isEpExpired ? 'text-red-400 font-bold' : 'text-emerald-400'}">
                ${isEpExpired ? '🔴 EXPIRED: ' : '🟢 Exp: '}${escHtml(p.easyPayExpiry || '—')}
              </p>
            ` : `<span class="text-gray-600">—</span>`}
          </td>
          <td class="px-4 py-3">${timeStatus}</td>
          <td class="px-4 py-3">${statusBadge(p.status)}</td>
          <td class="px-4 py-3 text-right">
            <button onclick="openAdminFollowUpModal('${escHtml(p.customerId)}', '${escJs(p.name)}', '${escJs(formattedPhone)}')" class="px-2.5 py-1.5 bg-white/5 hover:bg-white/10 text-purple-300 border border-purple-500/30 rounded-lg text-[10px] font-bold transition-all whitespace-nowrap">Log Payment / Update</button>
          </td>
        </tr>
      `;
    }).join('');
  } catch (err) {
    tbody.innerHTML = `<tr><td colspan="8" class="px-6 py-8 text-center text-red-400 text-xs">Failed to load promised payments: ${escHtml(err.message)}</td></tr>`;
  }
}

async function populateAgentDropdown(selectId) {
  const select = document.getElementById(selectId);
  if (!select || select.options.length > 1) return; // already populated

  try {
    const result = await callBackend('getAgentList');
    if (result.agents) {
      result.agents.forEach(a => {
        if (a.status === 'Verified') {
          const opt = document.createElement('option');
          opt.value = a.agentId;
          opt.textContent = `${a.name} (${a.role})`;
          select.appendChild(opt);
        }
      });
    }
  } catch (err) {
    console.error('Failed to populate agent dropdown', err);
  }
}

function openAdminFollowUpModal(customerId, name, phone) {
  document.getElementById('afu-customer-id').value = customerId;
  document.getElementById('afu-client-name').textContent = name;
  document.getElementById('afu-client-phone').textContent = phone || 'No Number';
  document.getElementById('afu-next-date').value = '';
  document.getElementById('afu-notes').value = '';

  populateAgentDropdown('afu-agent-id');
  document.getElementById('afu-agent-id').value = '';

  document.getElementById('modal-admin-followup').classList.remove('hidden');
}

function closeAdminFollowUpModal() {
  document.getElementById('modal-admin-followup').classList.add('hidden');
}

async function submitAdminFollowUp() {
  const customerId = document.getElementById('afu-customer-id').value;
  const nextDate = document.getElementById('afu-next-date').value;
  const notes = document.getElementById('afu-notes').value;
  const agentId = document.getElementById('afu-agent-id').value;
  const submitBtn = document.getElementById('afu-submit-btn');

  if (!nextDate) {
    showToast('Please select a new follow-up date.', 'error');
    return;
  }

  submitBtn.disabled = true;
  submitBtn.innerHTML = `<div class="spinner-sm mx-auto"></div>`;

  try {
    await callBackend('adminUpdateFollowUp', {
      customerId,
      newNextActionDate: nextDate,
      notes,
      reassignToAgentId: agentId || null
    });
    showToast('Follow-up successfully rescheduled.');
    closeAdminFollowUpModal();
    loadCallbackReport(currentReportDate);
    loadPromisedPayments();
    if (document.getElementById('view-grid') && !document.getElementById('view-grid').classList.contains('hidden')) {
      loadMasterGrid();
    }
    if (currentViewingCustomerId) {
      fetchCustomerDetailHistory(currentViewingCustomerId);
    }
  } catch (err) {
    showToast(err.message, 'error');
  } finally {
    submitBtn.disabled = false;
    submitBtn.textContent = 'Force Reschedule';
  }
}

// Universal Table Filter
function filterTable(tbodyId, query) {
  const tbody = document.getElementById(tbodyId);
  if (!tbody) return;
  const q = query.toLowerCase();
  Array.from(tbody.getElementsByTagName('tr')).forEach(tr => {
    tr.style.display = tr.textContent.toLowerCase().includes(q) ? '' : 'none';
  });
}
