/**
 * FibreGems CRM — Admin Page Logic
 * Handles dashboard stats, agent activity, master grid, status chart, and Agility sync.
 */

// ── State ────────────────────────────────────────────────────
let currentAdminView = 'dashboard';
let gridOffset = 0;
const GRID_LIMIT = 50;
let gridTotal = 0;

// ── Initialization ───────────────────────────────────────────

document.addEventListener('DOMContentLoaded', () => {
  if (!requireAdmin()) return;
  
  document.getElementById('admin-name').textContent = session.name || 'Admin';
  document.getElementById('admin-role').textContent = session.role || 'Admin';
  const avatarEl = document.getElementById('admin-avatar');
  if (avatarEl && session.name) avatarEl.textContent = session.name.charAt(0).toUpperCase();
  
  loadDashboard();
});

// ── View Switching ───────────────────────────────────────────

function switchAdminView(view) {
  currentAdminView = view;
  
  document.querySelectorAll('[data-admin-nav]').forEach(el => {
    el.classList.remove('bg-fiber-500/20', 'text-fiber-300', 'border-fiber-500');
    el.classList.add('text-gray-400', 'hover:text-white', 'hover:bg-white/5');
  });
  const activeNav = document.querySelector(`[data-admin-nav="${view}"]`);
  if (activeNav) {
    activeNav.classList.add('bg-fiber-500/20', 'text-fiber-300', 'border-fiber-500');
    activeNav.classList.remove('text-gray-400', 'hover:text-white', 'hover:bg-white/5');
  }
  
  document.getElementById('view-dashboard').classList.toggle('hidden', view !== 'dashboard');
  document.getElementById('view-grid').classList.toggle('hidden', view !== 'grid');
  document.getElementById('view-sync').classList.toggle('hidden', view !== 'sync');
  document.getElementById('view-agents').classList.toggle('hidden', view !== 'agents');
  
  if (view === 'dashboard') loadDashboard();
  else if (view === 'grid') loadMasterGrid();
  else if (view === 'agents') loadAgentList();
}

// ── Dashboard ────────────────────────────────────────────────

async function loadDashboard() {
  const agentTableBody = document.getElementById('agent-activity-body');
  const statsContainer = document.getElementById('status-stats');
  
  agentTableBody.innerHTML = `
    <tr><td colspan="4" class="px-6 py-8 text-center">
      <div class="spinner mx-auto mb-2"></div>
      <p class="text-gray-500 text-sm">Loading dashboard...</p>
    </td></tr>`;
  
  try {
    const data = await callBackend('getAdminDashboard');
    
    // Update stat cards
    document.getElementById('stat-active-agents').textContent = data.activeCount || 0;
    
    const totalCustomers = Object.values(data.statuses).reduce((a, b) => a + b, 0);
    document.getElementById('stat-total-customers').textContent = totalCustomers;
    
    const todayTouches = data.agents.reduce((a, ag) => a + ag.touches, 0);
    document.getElementById('stat-today-touches').textContent = todayTouches;
    
    // Agent activity table
    if (data.agents.length === 0) {
      agentTableBody.innerHTML = `
        <tr><td colspan="4" class="px-6 py-8 text-center text-gray-500">
          <p class="font-medium">No agent activity today</p>
          <p class="text-sm mt-1 text-gray-600">Activity will appear as agents log in and work</p>
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
                <p class="font-medium text-white text-sm">${escHtml(agent.name)}</p>
                <p class="text-xs text-gray-500">${escHtml(agent.role)}</p>
              </div>
            </div>
          </td>
          <td class="px-4 py-3">
            <span class="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-semibold bg-fiber-500/15 text-fiber-400">
              ${agent.touches}
            </span>
          </td>
          <td class="px-4 py-3 text-sm text-gray-400">${formatTime(agent.lastActive)}</td>
          <td class="px-4 py-3">
            <span class="inline-flex w-2 h-2 rounded-full bg-emerald-400 animate-pulse"></span>
          </td>
        </tr>
      `).join('');
    }
    
    // Status breakdown
    renderStatusChart(data.statuses);
    renderStatusStats(data.statuses);
    
  } catch (err) {
    agentTableBody.innerHTML = `
      <tr><td colspan="4" class="px-6 py-8 text-center text-red-400">
        <p class="font-medium">Failed to load dashboard</p>
        <p class="text-sm text-red-500/70 mt-1">${escHtml(err.message)}</p>
        <button onclick="loadDashboard()" class="mt-2 text-sm text-fiber-400 hover:underline">Retry</button>
      </td></tr>`;
  }
}

function renderStatusStats(statuses) {
  const container = document.getElementById('status-stats');
  const total = Object.values(statuses).reduce((a, b) => a + b, 0);
  
  const colorMap = {
    'New Lead': { bg: 'bg-blue-500/15', text: 'text-blue-400', bar: 'bg-blue-500' },
    'Contacted': { bg: 'bg-cyan-500/15', text: 'text-cyan-400', bar: 'bg-cyan-500' },
    'Interested': { bg: 'bg-emerald-500/15', text: 'text-emerald-400', bar: 'bg-emerald-500' },
    'Payment Pending': { bg: 'bg-amber-500/15', text: 'text-amber-400', bar: 'bg-amber-500' },
    'Payment Received': { bg: 'bg-green-500/15', text: 'text-green-400', bar: 'bg-green-500' },
    'Activated': { bg: 'bg-purple-500/15', text: 'text-purple-400', bar: 'bg-purple-500' },
    'Cancelled': { bg: 'bg-red-500/15', text: 'text-red-400', bar: 'bg-red-500' },
    'Not Interested': { bg: 'bg-gray-500/15', text: 'text-gray-400', bar: 'bg-gray-500' },
  };
  
  const sorted = Object.entries(statuses).sort((a, b) => b[1] - a[1]);
  
  container.innerHTML = sorted.map(([status, count]) => {
    const pct = total > 0 ? Math.round((count / total) * 100) : 0;
    const colors = colorMap[status] || { bg: 'bg-gray-500/15', text: 'text-gray-400', bar: 'bg-gray-500' };
    return `
      <div class="flex items-center gap-3">
        <div class="flex-1">
          <div class="flex items-center justify-between mb-1">
            <span class="text-xs font-medium ${colors.text}">${escHtml(status)}</span>
            <span class="text-xs text-gray-500">${count} (${pct}%)</span>
          </div>
          <div class="w-full h-1.5 rounded-full bg-white/5 overflow-hidden">
            <div class="h-full rounded-full ${colors.bar} transition-all duration-700" style="width: ${pct}%"></div>
          </div>
        </div>
      </div>
    `;
  }).join('');
}

function renderStatusChart(statuses) {
  const canvas = document.getElementById('status-chart');
  if (!canvas) return;
  
  const ctx = canvas.getContext('2d');
  const dpr = window.devicePixelRatio || 1;
  const size = 200;
  canvas.width = size * dpr;
  canvas.height = size * dpr;
  canvas.style.width = size + 'px';
  canvas.style.height = size + 'px';
  ctx.scale(dpr, dpr);
  
  const total = Object.values(statuses).reduce((a, b) => a + b, 0);
  if (total === 0) {
    ctx.fillStyle = '#374151';
    ctx.font = '14px Inter, sans-serif';
    ctx.textAlign = 'center';
    ctx.fillText('No data', size / 2, size / 2);
    return;
  }
  
  const colors = ['#3b82f6', '#06b6d4', '#10b981', '#f59e0b', '#22c55e', '#a855f7', '#ef4444', '#6b7280'];
  const cx = size / 2;
  const cy = size / 2;
  const radius = 80;
  const innerRadius = 50;
  
  let startAngle = -Math.PI / 2;
  const entries = Object.entries(statuses);
  
  entries.forEach(([status, count], i) => {
    const slice = (count / total) * 2 * Math.PI;
    const endAngle = startAngle + slice;
    
    ctx.beginPath();
    ctx.arc(cx, cy, radius, startAngle, endAngle);
    ctx.arc(cx, cy, innerRadius, endAngle, startAngle, true);
    ctx.closePath();
    ctx.fillStyle = colors[i % colors.length];
    ctx.fill();
    
    startAngle = endAngle;
  });
  
  // Center text
  ctx.fillStyle = '#ffffff';
  ctx.font = 'bold 24px Inter, sans-serif';
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.fillText(total, cx, cy - 8);
  ctx.fillStyle = '#9ca3af';
  ctx.font = '11px Inter, sans-serif';
  ctx.fillText('TOTAL', cx, cy + 12);
}

// ── Master Grid ──────────────────────────────────────────────

async function loadMasterGrid() {
  const tbody = document.getElementById('grid-body');
  const countEl = document.getElementById('grid-count');
  
  tbody.innerHTML = `
    <tr><td colspan="5" class="px-6 py-12 text-center">
      <div class="spinner mx-auto mb-3"></div>
      <p class="text-gray-500 text-sm">Loading master grid...</p>
    </td></tr>`;
  
  try {
    const result = await callBackend('getAdminMasterGrid', { offset: gridOffset, limit: GRID_LIMIT });
    gridTotal = result.total;
    countEl.textContent = `${result.total} total record${result.total !== 1 ? 's' : ''}`;
    
    if (result.data.length === 0) {
      tbody.innerHTML = `
        <tr><td colspan="5" class="px-6 py-12 text-center text-gray-500">
          <p class="font-medium">No customer records found</p>
        </td></tr>`;
      return;
    }
    
    tbody.innerHTML = result.data.map(c => {
      const payColors = {
        'Paid': 'bg-green-500/15 text-green-400 border-green-500/30',
        'Pending': 'bg-amber-500/15 text-amber-400 border-amber-500/30',
      };
      const payCls = payColors[c.payStatus] || 'bg-gray-500/15 text-gray-400 border-gray-500/30';
      
      return `
        <tr class="border-b border-white/5 hover:bg-white/[0.03] transition-colors">
          <td class="px-4 py-3">
            <p class="font-medium text-white text-sm">${escHtml(c.name)}</p>
            <p class="text-xs text-gray-500 mt-0.5 font-mono">${escHtml(c.id)}</p>
          </td>
          <td class="px-4 py-3 text-sm text-gray-300">${escHtml(c.agent || '—')}</td>
          <td class="px-4 py-3">${adminStatusBadge(c.status)}</td>
          <td class="px-4 py-3">
            <span class="inline-flex px-2.5 py-1 rounded-full text-xs font-medium border ${payCls}">${escHtml(c.payStatus)}</span>
          </td>
        </tr>`;
    }).join('');
    
    updateGridPagination();
  } catch (err) {
    tbody.innerHTML = `
      <tr><td colspan="5" class="px-6 py-12 text-center text-red-400">
        <p class="font-medium">Failed to load grid</p>
        <p class="text-sm text-red-500/70 mt-1">${escHtml(err.message)}</p>
        <button onclick="loadMasterGrid()" class="mt-2 text-sm text-fiber-400 hover:underline">Retry</button>
      </td></tr>`;
  }
}

function updateGridPagination() {
  const paginationEl = document.getElementById('grid-pagination');
  const totalPages = Math.ceil(gridTotal / GRID_LIMIT);
  const currentPage = Math.floor(gridOffset / GRID_LIMIT) + 1;
  
  if (totalPages <= 1) { paginationEl.innerHTML = ''; return; }
  
  paginationEl.innerHTML = `
    <button onclick="goGridPage(${currentPage - 1})" ${currentPage === 1 ? 'disabled' : ''}
      class="px-3 py-1.5 rounded-lg text-sm ${currentPage === 1 ? 'text-gray-600 cursor-not-allowed' : 'text-gray-400 hover:bg-white/5'}">
      ← Prev
    </button>
    <span class="text-sm text-gray-500">Page ${currentPage} of ${totalPages}</span>
    <button onclick="goGridPage(${currentPage + 1})" ${currentPage === totalPages ? 'disabled' : ''}
      class="px-3 py-1.5 rounded-lg text-sm ${currentPage === totalPages ? 'text-gray-600 cursor-not-allowed' : 'text-gray-400 hover:bg-white/5'}">
      Next →
    </button>`;
}

function goGridPage(page) {
  gridOffset = (page - 1) * GRID_LIMIT;
  loadMasterGrid();
}

// ── Agility Sync ─────────────────────────────────────────────

async function triggerAgilitySync() {
  const btn = document.getElementById('sync-btn');
  const resultBox = document.getElementById('sync-result');
  
  btn.disabled = true;
  btn.innerHTML = `
    <div class="flex items-center gap-2">
      <div class="spinner-sm"></div>
      <span>Syncing...</span>
    </div>`;
  resultBox.classList.add('hidden');
  
  try {
    const result = await callBackend('runAgilitySync');
    
    resultBox.classList.remove('hidden');
    resultBox.innerHTML = `
      <div class="flex items-start gap-4">
        <div class="w-12 h-12 rounded-xl bg-emerald-500/15 flex items-center justify-center flex-shrink-0">
          <svg class="w-6 h-6 text-emerald-400" fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="2">
            <path stroke-linecap="round" stroke-linejoin="round" d="M9 12.75L11.25 15 15 9.75M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
          </svg>
        </div>
        <div>
          <h4 class="text-lg font-semibold text-emerald-300">Sync Complete</h4>
          <div class="mt-3 grid grid-cols-2 gap-4">
            <div class="bg-white/5 rounded-xl p-4 text-center">
              <p class="text-2xl font-bold text-white">${result.newLeads}</p>
              <p class="text-xs text-gray-400 mt-1">New Leads Created</p>
            </div>
            <div class="bg-white/5 rounded-xl p-4 text-center">
              <p class="text-2xl font-bold text-white">${result.updatedLeads}</p>
              <p class="text-xs text-gray-400 mt-1">Existing Matched</p>
            </div>
          </div>
        </div>
      </div>`;
    
    showToast(`Agility sync complete: ${result.newLeads} new, ${result.updatedLeads} matched.`, 'success');
  } catch (err) {
    resultBox.classList.remove('hidden');
    resultBox.innerHTML = `
      <div class="flex items-center gap-3 text-red-400">
        <svg class="w-6 h-6 flex-shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="2">
          <path stroke-linecap="round" stroke-linejoin="round" d="M12 9v3.75m9-.75a9 9 0 11-18 0 9 9 0 0118 0zm-9 3.75h.008v.008H12v-.008z" />
        </svg>
        <div>
          <p class="font-medium">Sync Failed</p>
          <p class="text-sm text-red-500/70 mt-0.5">${escHtml(err.message)}</p>
        </div>
      </div>`;
    showToast(err.message, 'error');
  } finally {
    btn.disabled = false;
    btn.innerHTML = `
      <svg class="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="2">
        <path stroke-linecap="round" stroke-linejoin="round" d="M16.023 9.348h4.992v-.001M2.985 19.644v-4.992m0 0h4.992m-4.993 0l3.181 3.183a8.25 8.25 0 0013.803-3.7M4.031 9.865a8.25 8.25 0 0113.803-3.7l3.181 3.182" />
      </svg>
      Run Agility Sync`;
  }
}

// ── Utilities ────────────────────────────────────────────────

function adminStatusBadge(status) {
  const colors = {
    'New Lead': 'bg-blue-500/15 text-blue-400 border-blue-500/30',
    'Contacted': 'bg-cyan-500/15 text-cyan-400 border-cyan-500/30',
    'Interested': 'bg-emerald-500/15 text-emerald-400 border-emerald-500/30',
    'Payment Pending': 'bg-amber-500/15 text-amber-400 border-amber-500/30',
    'Payment Received': 'bg-green-500/15 text-green-400 border-green-500/30',
    'Activated': 'bg-purple-500/15 text-purple-400 border-purple-500/30',
    'Cancelled': 'bg-red-500/15 text-red-400 border-red-500/30',
    'Not Interested': 'bg-gray-500/15 text-gray-400 border-gray-500/30'
  };
  const cls = colors[status] || 'bg-gray-500/15 text-gray-400 border-gray-500/30';
  return `<span class="inline-flex px-2.5 py-1 rounded-full text-xs font-medium border ${cls}">${escHtml(status || 'Unknown')}</span>`;
}

function formatTime(dateStr) {
  if (!dateStr) return '—';
  const d = new Date(dateStr);
  return d.toLocaleTimeString('en-ZA', { hour: '2-digit', minute: '2-digit' });
}

function escHtml(str) {
  const div = document.createElement('div');
  div.textContent = str || '';
  return div.innerHTML;
}

// ── Agent Management ─────────────────────────────────────────

let _agentModalMode = 'create'; // 'create' | 'edit' | 'password'
let _activeAgentTab = 'details';

async function loadAgentList() {
  const tbody    = document.getElementById('agents-body');
  const countEl  = document.getElementById('agents-count');
  tbody.innerHTML = `<tr><td colspan="6" class="px-6 py-12 text-center"><div class="spinner mx-auto mb-3"></div><p class="text-gray-500 text-sm">Loading agents...</p></td></tr>`;

  try {
    const data = await callBackend('getAgentList');
    const agents = data.agents || [];
    countEl.textContent = `${agents.length} agent${agents.length !== 1 ? 's' : ''}`;

    if (agents.length === 0) {
      tbody.innerHTML = `<tr><td colspan="6" class="px-6 py-12 text-center text-gray-500"><p class="font-medium">No agents found</p></td></tr>`;
      return;
    }

    tbody.innerHTML = agents.map(a => {
      const statusCls = {
        'Verified': 'bg-emerald-500/15 text-emerald-400 border-emerald-500/30',
        'Inactive': 'bg-red-500/15 text-red-400 border-red-500/30',
        'Pending':  'bg-amber-500/15 text-amber-400 border-amber-500/30'
      }[a.status] || 'bg-gray-500/15 text-gray-400 border-gray-500/30';

      const roleCls = a.role === 'Admin'
        ? 'bg-gem-500/15 text-gem-400 border-gem-500/30'
        : 'bg-fiber-500/15 text-fiber-400 border-fiber-500/30';

      const isInactive = a.status === 'Inactive';

      return `
        <tr class="border-b border-white/5 hover:bg-white/[0.03] transition-colors group">
          <td class="px-4 py-3.5">
            <div class="flex items-center gap-3">
              <div class="w-8 h-8 rounded-full bg-gradient-to-br from-fiber-500 to-fiber-700 flex items-center justify-center text-xs font-bold text-white flex-shrink-0">
                ${(a.name || 'U').charAt(0).toUpperCase()}
              </div>
              <div>
                <p class="font-medium text-white text-sm">${escHtml(a.name)}</p>
                <p class="text-xs text-gray-500 font-mono mt-0.5">${escHtml(a.agentId)}</p>
              </div>
            </div>
          </td>
          <td class="px-4 py-3.5 text-sm text-gray-300">${escHtml(a.email)}</td>
          <td class="px-4 py-3.5">
            <span class="inline-flex px-2.5 py-1 rounded-full text-xs font-medium border ${roleCls}">${escHtml(a.role)}</span>
          </td>
          <td class="px-4 py-3.5">
            <span class="inline-flex px-2.5 py-1 rounded-full text-xs font-medium border ${statusCls}">${escHtml(a.status)}</span>
          </td>
          <td class="px-4 py-3.5">
            ${a.tempPass
              ? `<span class="font-mono text-xs text-amber-300 bg-amber-500/10 border border-amber-500/20 px-2 py-1 rounded-lg">${escHtml(a.tempPass)}</span>`
              : `<span class="text-gray-600 text-sm">—</span>`}
          </td>
          <td class="px-4 py-3.5">
            <div class="flex items-center gap-2 opacity-0 group-hover:opacity-100 transition-all">
              <button onclick="openAgentModal(${JSON.stringify(a).replace(/"/g, '&quot;')})" title="Edit"
                class="p-1.5 rounded-lg bg-white/5 text-gray-400 hover:text-white hover:bg-white/10 transition-colors">
                <svg class="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="2">
                  <path stroke-linecap="round" stroke-linejoin="round" d="M16.862 4.487l1.687-1.688a1.875 1.875 0 112.652 2.652L10.582 16.07a4.5 4.5 0 01-1.897 1.13L6 18l.8-2.685a4.5 4.5 0 011.13-1.897l8.932-8.931zm0 0L19.5 7.125" />
                </svg>
              </button>
              <button onclick="openSetPassword(${JSON.stringify(a).replace(/"/g, '&quot;')})" title="Set Password"
                class="p-1.5 rounded-lg bg-white/5 text-gray-400 hover:text-amber-400 hover:bg-amber-500/10 transition-colors">
                <svg class="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="2">
                  <path stroke-linecap="round" stroke-linejoin="round" d="M15.75 5.25a3 3 0 013 3m3 0a6 6 0 01-7.029 5.912c-.563-.097-1.159.026-1.563.43L10.5 17.25H8.25v2.25H6v2.25H2.25v-2.818c0-.597.237-1.17.659-1.591l6.499-6.499c.404-.404.527-1 .43-1.563A6 6 0 1121.75 8.25z" />
                </svg>
              </button>
              <button onclick="promptDeactivate('${a.agentId}', ${JSON.stringify(a.name).replace(/"/g, '&quot;')}, ${isInactive})" title="${isInactive ? 'Reactivate' : 'Deactivate'}"
                class="p-1.5 rounded-lg bg-white/5 transition-colors ${isInactive ? 'text-emerald-400 hover:bg-emerald-500/10' : 'text-red-400/60 hover:text-red-400 hover:bg-red-500/10'}">
                ${isInactive
                  ? `<svg class="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="2"><path stroke-linecap="round" stroke-linejoin="round" d="M9 12.75L11.25 15 15 9.75M21 12a9 9 0 11-18 0 9 9 0 0118 0z" /></svg>`
                  : `<svg class="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="2"><path stroke-linecap="round" stroke-linejoin="round" d="M22 10.5h-6m-2.25-4.125a3.375 3.375 0 11-6.75 0 3.375 3.375 0 016.75 0zM4 19.235v-.11a6.375 6.375 0 0112.75 0v.109A12.318 12.318 0 0110.374 21c-2.331 0-4.512-.645-6.374-1.766z" /></svg>`
                }
              </button>
            </div>
          </td>
        </tr>`;
    }).join('');
  } catch (err) {
    tbody.innerHTML = `<tr><td colspan="6" class="px-6 py-12 text-center text-red-400"><p class="font-medium">Failed to load agents</p><p class="text-sm text-red-500/70 mt-1">${escHtml(err.message)}</p><button onclick="loadAgentList()" class="mt-2 text-sm text-fiber-400 hover:underline">Retry</button></td></tr>`;
  }
}

function openAgentModal(agentData = null) {
  _agentModalMode = agentData ? 'edit' : 'create';
  _activeAgentTab = 'details';

  document.getElementById('am-agent-id').value   = agentData?.agentId || '';
  document.getElementById('am-name').value        = agentData?.name    || '';
  document.getElementById('am-email').value       = agentData?.email   || '';
  document.getElementById('am-role').value        = agentData?.role    || 'Agent';
  document.getElementById('am-status').value      = agentData?.status  || 'Verified';
  document.getElementById('am-password').value    = '';
  document.getElementById('am-temp-password').value = '';
  document.getElementById('temp-pass-result').classList.add('hidden');

  const isCreate = !agentData;
  document.getElementById('agent-modal-title').textContent    = isCreate ? 'Add Agent'  : 'Edit Agent';
  document.getElementById('agent-modal-subtitle').textContent = isCreate ? 'Create a new portal account' : agentData.name;
  document.getElementById('am-password-row').classList.toggle('hidden', !isCreate);
  document.getElementById('am-status-row').classList.toggle('hidden', isCreate);

  // Show/hide password tab (only when editing)
  document.getElementById('tab-password').classList.toggle('hidden', isCreate);

  switchAgentTab('details');
  show('modal-agent');
}

function openSetPassword(agentData) {
  openAgentModal(agentData);
  switchAgentTab('password');
}

function switchAgentTab(tab) {
  _activeAgentTab = tab;
  ['details', 'password'].forEach(t => {
    document.getElementById(`tab-${t}`).classList.toggle('text-fiber-400', t === tab);
    document.getElementById(`tab-${t}`).classList.toggle('border-fiber-500', t === tab);
    document.getElementById(`tab-${t}`).classList.toggle('text-gray-500', t !== tab);
    document.getElementById(`tab-${t}`).classList.toggle('border-transparent', t !== tab);
    document.getElementById(`tab-panel-${t}`).classList.toggle('hidden', t !== tab);
  });
  const saveBtn = document.getElementById('agent-modal-save-btn');
  saveBtn.textContent = tab === 'password' ? 'Set Password' : 'Save';
}

function closeAgentModal() {
  hide('modal-agent');
}

async function saveAgentModal() {
  const btn = document.getElementById('agent-modal-save-btn');
  btn.disabled = true;
  const origText = btn.textContent;
  btn.textContent = 'Saving...';

  try {
    if (_activeAgentTab === 'password') {
      // Set temp password
      const agentId      = document.getElementById('am-agent-id').value;
      const tempPassword = document.getElementById('am-temp-password').value.trim();
      if (!tempPassword) { showToast('Please enter a temporary password.', 'warning'); return; }
      await callBackend('setAgentTempPassword', { agentId, tempPassword });
      document.getElementById('temp-pass-value').textContent = tempPassword;
      document.getElementById('temp-pass-result').classList.remove('hidden');
      showToast('Temporary password set successfully!', 'success');
      loadAgentList();

    } else if (_agentModalMode === 'create') {
      const name     = document.getElementById('am-name').value.trim();
      const email    = document.getElementById('am-email').value.trim();
      const password = document.getElementById('am-password').value.trim();
      const role     = document.getElementById('am-role').value;
      if (!name || !email || !password) { showToast('Name, email and password are required.', 'warning'); return; }
      const result = await callBackend('createAgent', { name, email, password, role });
      showToast(`Agent created! ID: ${result.agentId}`, 'success');
      closeAgentModal();
      loadAgentList();

    } else {
      // Edit mode
      const agentId = document.getElementById('am-agent-id').value;
      const name    = document.getElementById('am-name').value.trim();
      const email   = document.getElementById('am-email').value.trim();
      const role    = document.getElementById('am-role').value;
      const status  = document.getElementById('am-status').value;
      if (!name || !email) { showToast('Name and email are required.', 'warning'); return; }
      await callBackend('updateAgent', { agentId, name, email, role, status });
      showToast('Agent updated successfully!', 'success');
      closeAgentModal();
      loadAgentList();
    }
  } catch (err) {
    showToast(err.message, 'error');
  } finally {
    btn.disabled = false;
    btn.textContent = origText;
  }
}

function promptDeactivate(agentId, name, isInactive) {
  if (isInactive) {
    // Reactivate directly
    callBackend('updateAgent', { agentId, status: 'Verified' })
      .then(() => { showToast(`${name} reactivated.`, 'success'); loadAgentList(); })
      .catch(err => showToast(err.message, 'error'));
    return;
  }
  document.getElementById('deactivate-agent-id').value   = agentId;
  document.getElementById('deactivate-agent-name').textContent = name;
  show('modal-deactivate');
}

function closeDeactivate() { hide('modal-deactivate'); }

async function confirmDeactivate() {
  const agentId = document.getElementById('deactivate-agent-id').value;
  try {
    await callBackend('deleteAgent', { agentId });
    showToast('Agent deactivated.', 'success');
    closeDeactivate();
    loadAgentList();
  } catch (err) {
    showToast(err.message, 'error');
  }
}

/** Generates a random 10-char alphanumeric password and fills the target input. */
function generatePassword(inputId) {
  const chars = 'ABCDEFGHJKMNPQRSTUVWXYZabcdefghjkmnpqrstuvwxyz23456789@#!';
  let pwd = '';
  for (let i = 0; i < 10; i++) pwd += chars.charAt(Math.floor(Math.random() * chars.length));
  document.getElementById(inputId).value = pwd;
}
