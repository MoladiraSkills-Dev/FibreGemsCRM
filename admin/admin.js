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

    document.getElementById('stat-active-agents').textContent = data.activeCount || 0;
    const totalCustomers = Object.values(data.statuses).reduce((a, b) => a + b, 0);
    document.getElementById('stat-total-customers').textContent = totalCustomers;
    const todayTouches = data.agents.reduce((a, ag) => a + ag.touches, 0);
    document.getElementById('stat-today-touches').textContent = todayTouches;

    if (data.agents.length === 0) {
      agentTableBody.innerHTML = `
        <tr><td colspan="3" class="px-6 py-8 text-center text-gray-500 text-sm">
          No agent activity recorded yet today
        </td></tr>`;
    } else {
      agentTableBody.innerHTML = data.agents.map(agent => `
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
let masterGridRecordsMap = new Map();
let currentViewingCustomerId = null;

async function loadMasterGrid() {
  const tbody = document.getElementById('grid-body');
  const countEl = document.getElementById('grid-count');
  tbody.innerHTML = `<tr><td colspan="8" class="px-6 py-12 text-center"><div class="spinner mx-auto mb-2"></div><p class="text-gray-500 text-sm">Loading master records...</p></td></tr>`;

  try {
    const result = await callBackend('getAdminMasterGrid', { offset: gridOffset, limit: GRID_LIMIT });
    gridTotal = result.total;
    countEl.textContent = `${result.total} records`;

    if (result.data.length === 0) {
      tbody.innerHTML = `<tr><td colspan="8" class="px-6 py-12 text-center text-gray-500">No records found</td></tr>`;
      return;
    }

    masterGridRecordsMap.clear();
    result.data.forEach(r => masterGridRecordsMap.set(String(r.id), r));

    tbody.innerHTML = result.data.map(r => {
      let isEpExpired = false;
      if (r.easyPayExpiry && r.easyPayExpiry < getTodayStr()) {
        isEpExpired = true;
      }

      return `
      <tr class="border-b border-white/5 hover:bg-white/[0.06] transition-colors text-xs cursor-pointer group" onclick="openCustomerDetail('${escHtml(r.id)}')" title="Click to view full customer details & models">
        <td class="px-4 py-3 cursor-pointer group" onclick="openCustomerDetail('${escHtml(r.id)}')" title="Click to view full customer details from Team Lead perspective">
          <p class="font-semibold text-fiber-400 group-hover:text-fiber-300 group-hover:underline flex items-center gap-1.5 transition-colors">
            ${escHtml(r.name || 'Unnamed Customer')}
            <svg class="w-3.5 h-3.5 opacity-60 group-hover:opacity-100 transition-opacity text-fiber-400" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M10 6H6a2 2 0 00-2 2v10a2 2 0 002 2h10a2 2 0 002-2v-4M14 4h6m0 0v6m0-6L10 14" />
            </svg>
          </p>
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
        <td class="px-4 py-3"><span class="px-2 py-0.5 rounded text-[10px] font-semibold bg-white/5 text-gray-300">${escHtml(r.payStatus)}</span></td>
      </tr>
      `;
    }).join('');
  } catch (err) {
    tbody.innerHTML = `<tr><td colspan="8" class="px-6 py-8 text-center text-red-400 text-xs">Failed to load grid: ${escHtml(err.message)}</td></tr>`;
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
    const result = await callBackend('runAgilitySync');
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
