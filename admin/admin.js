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
  }, 4500);
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
async function loadDashboard() {
  const agentTableBody = document.getElementById('agent-activity-body');
  const statsContainer = document.getElementById('status-stats');
  
  agentTableBody.innerHTML = `
    <tr><td colspan="3" class="px-6 py-8 text-center">
      <div class="spinner mx-auto mb-2"></div>
      <p class="text-gray-500 text-sm">Loading dashboard...</p>
    </td></tr>`;
  
  try {
    const data = await callBackend('getAdminDashboard');
    
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
              <div class="w-8 h-8 rounded-full bg-gradient-to-br from-fiber-500 to-fiber-700 flex items-center justify-center text-xs font-bold text-white">
                ${(agent.name || 'U').charAt(0)}
              </div>
              <div>
                <p class="font-semibold text-white text-sm">${escHtml(agent.name)}</p>
                <p class="text-xs text-gray-500">${escHtml(agent.role)}</p>
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
    agentTableBody.innerHTML = `
      <tr><td colspan="3" class="px-6 py-8 text-center text-red-400 text-sm">
        Failed to load dashboard: ${escHtml(err.message)}
      </td></tr>`;
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
    
    tbody.innerHTML = result.data.map(r => {
      let isEpExpired = false;
      if (r.easyPayExpiry && r.easyPayExpiry < getTodayStr()) {
        isEpExpired = true;
      }

      return `
      <tr class="border-b border-white/5 hover:bg-white/[0.03] transition-colors text-xs">
        <td class="px-4 py-3">
          <p class="font-semibold text-white">${escHtml(r.name)}</p>
          <p class="text-[11px] text-gray-500 font-mono">${escHtml(r.id)}</p>
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
      tbody.innerHTML = `<tr><td colspan="6" class="px-6 py-8 text-center text-gray-500 text-xs">No agents created yet.</td></tr>`;
      return;
    }

    tbody.innerHTML = agents.map(a => `
      <tr class="border-b border-white/5 hover:bg-white/[0.02] text-xs">
        <td class="px-4 py-3">
          <p class="font-bold text-white">${escHtml(a.name)}</p>
          <p class="text-[11px] text-gray-500 font-mono">${escHtml(a.agentId)}</p>
        </td>
        <td class="px-4 py-3 text-gray-300 font-mono">${escHtml(a.email)}</td>
        <td class="px-4 py-3"><span class="px-2 py-0.5 rounded text-[10px] font-bold ${a.role === 'Admin' ? 'bg-purple-500/20 text-purple-300' : 'bg-blue-500/20 text-blue-300'}">${escHtml(a.role)}</span></td>
        <td class="px-4 py-3"><span class="px-2 py-0.5 rounded text-[10px] font-bold ${a.status === 'Verified' ? 'bg-emerald-500/20 text-emerald-300' : 'bg-gray-500/20 text-gray-400'}">${escHtml(a.status)}</span></td>
        <td class="px-4 py-3 font-mono text-gray-400">${escHtml(a.tempPass || '—')}</td>
        <td class="px-4 py-3">
          <button onclick="openEditAgent('${escHtml(a.agentId)}', '${escJs(a.name)}', '${escJs(a.email)}', '${escJs(a.role)}', '${escJs(a.status)}')" class="px-2.5 py-1 bg-white/5 hover:bg-white/10 text-gray-300 rounded text-[11px] font-semibold transition-colors mr-1">Edit</button>
        </td>
      </tr>
    `).join('');
  } catch (err) {
    tbody.innerHTML = `<tr><td colspan="6" class="px-6 py-8 text-center text-red-400 text-xs">Failed to load agents: ${escHtml(err.message)}</td></tr>`;
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
    document.getElementById('am-role').value = 'Agent';
    document.getElementById('am-status-row').classList.add('hidden');
    document.getElementById('am-password-row').classList.remove('hidden');
    document.getElementById('am-password').value = '';
    document.getElementById('tab-password').classList.add('hidden');
  }
}

function openEditAgent(agentId, name, email, role, status) {
  openAgentModal(true);
  document.getElementById('agent-modal-title').textContent = 'Edit Agent';
  document.getElementById('agent-modal-subtitle').textContent = `Editing ${name}`;
  document.getElementById('am-agent-id').value = agentId;
  document.getElementById('am-name').value = name;
  document.getElementById('am-email').value = email;
  document.getElementById('am-role').value = role;
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
        role: document.getElementById('am-role').value,
        password: document.getElementById('am-password').value
      });
      showToast('Agent created successfully!');
    } else {
      await callBackend('updateAgent', {
        agentId: agentId,
        name: document.getElementById('am-name').value.trim(),
        email: document.getElementById('am-email').value.trim(),
        role: document.getElementById('am-role').value,
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
