/**
 * FibreGems — Support Portal JS
 * Handles all support dashboard views: customers, tickets, agility reports, SOPs.
 * Requires: js/api.js (callBackend), js/auth.js (session, requireSupport, logout)
 */

// ─────────────────────────────────────────────
// STATE
// ─────────────────────────────────────────────
let allCustomers = [];
let filteredCustomers = [];
let customerPage = 0;
const CUSTOMER_PAGE_SIZE = 50;

let allTickets = [];
let filteredTickets = [];
let ticketPage = 0;
const TICKET_PAGE_SIZE = 50;

let activeProviderFilter = 'all';
let activeStatusFilter = 'all';

// Map of rendered-index → full ticket object for the detail modal
let _ticketDetailMap = {};
let _activeDetailTicket = null; // Stores currently viewed ticket

// ─────────────────────────────────────────────
// INIT
// ─────────────────────────────────────────────
document.addEventListener('DOMContentLoaded', () => {
  // Clear any stale local browser cache for support
  if (typeof clearAllCache_ === 'function') clearAllCache_();

  // Auth guard — Support or Admin only
  if (!requireAuth()) return;

  // Populate agent name + avatar
  if (session && session.name) {
    const nameEl = document.getElementById('support-agent-name');
    const avatarEl = document.getElementById('support-avatar');
    if (nameEl) nameEl.textContent = session.name;
    if (avatarEl) avatarEl.textContent = session.name.charAt(0).toUpperCase();
  }

  // Set today's date badge
  const todayEl = document.getElementById('today-date');
  if (todayEl) {
    todayEl.textContent = new Date().toLocaleDateString('en-ZA', {
      weekday: 'short', year: 'numeric', month: 'short', day: 'numeric'
    });
  }

  // Load initial data
  loadDashboard();
});

// ─────────────────────────────────────────────
// VIEW ROUTING
// ─────────────────────────────────────────────
const views = ['dashboard', 'customers', 'tickets', 'agility', 'sops'];
const pageTitles = {
  dashboard:  ['Dashboard', 'Support overview for today'],
  customers:  ['Customer Status', 'Active & inactive customer monitoring'],
  tickets:    ['Support Tickets', 'AUGSEP ticket log — SADV & Infinifi'],
  agility:    ['Agility Reports', 'Daily agility report upload & sync history'],
  sops:       ['SOPs & Guides', 'Standard operating procedures and knowledge base'],
};

function showView(viewId) {
  views.forEach(v => {
    const el = document.getElementById(`view-${v}`);
    const nav = document.getElementById(`nav-${v}`);
    if (el) el.classList.toggle('hidden', v !== viewId);
    if (nav) nav.classList.toggle('active', v === viewId);
  });

  const [title, subtitle] = pageTitles[viewId] || ['Support Portal', ''];
  document.getElementById('page-title').textContent = title;
  document.getElementById('page-subtitle').textContent = subtitle;

  // Lazy-load on first visit
  if (viewId === 'customers' && allCustomers.length === 0) loadCustomers();
  if (viewId === 'tickets' && allTickets.length === 0) loadTickets();
  if (viewId === 'agility') loadSyncHistory();
}

// ─────────────────────────────────────────────
// PROVIDER FILTER (header dropdown)
// ─────────────────────────────────────────────
function applyProviderFilter() {
  activeProviderFilter = document.getElementById('provider-filter').value;
  applyFilters_customers();
  applyFilters_tickets();
}

// ─────────────────────────────────────────────
// DASHBOARD
// ─────────────────────────────────────────────
async function loadDashboard() {
  try {
    const data = await callBackend('getSupportDashboard');
    if (!data) return;

    setEl('stat-active', data.activeCount ?? '—');
    setEl('stat-inactive', data.inactiveCount ?? '—');
    setEl('stat-tickets', data.openTickets ?? '—');
    setEl('stat-sync', data.lastSync ?? 'Not synced');

    renderProviderOverview('sadv-overview', data.sadvStats);
    renderProviderOverview('infinifi-overview', data.infinifiStats);
    renderRecentTickets(data.recentTickets || []);
  } catch (err) {
    // Graceful degradation — show placeholder data while backend is being wired
    setEl('stat-active', '—');
    setEl('stat-inactive', '—');
    setEl('stat-tickets', '—');
    setEl('stat-sync', 'Pending setup');
    renderProviderOverview('sadv-overview', null);
    renderProviderOverview('infinifi-overview', null);
    renderRecentTickets([]);
    showToast('Dashboard: ' + err.message, 'warning');
  }
}

function renderProviderOverview(containerId, stats) {
  const el = document.getElementById(containerId);
  if (!el) return;
  if (!stats) {
    el.innerHTML = `<p class="text-xs text-gray-600 italic">No data yet — upload an Agility report to populate.</p>`;
    return;
  }
  el.innerHTML = `
    <div class="flex justify-between text-xs">
      <span class="text-gray-500">Active</span>
      <span class="text-emerald-400 font-semibold">${stats.active ?? 0}</span>
    </div>
    <div class="flex justify-between text-xs">
      <span class="text-gray-500">Inactive / Expired</span>
      <span class="text-red-400 font-semibold">${stats.inactive ?? 0}</span>
    </div>
    <div class="flex justify-between text-xs">
      <span class="text-gray-500">Pending / Scheduled</span>
      <span class="text-amber-400 font-semibold">${stats.pending ?? 0}</span>
    </div>
    <div class="flex justify-between text-xs">
      <span class="text-gray-500">Open Tickets</span>
      <span class="text-fiber-400 font-semibold">${stats.openTickets ?? 0}</span>
    </div>
  `;
}

function renderRecentTickets(tickets) {
  const el = document.getElementById('recent-tickets-list');
  if (!el) return;
  if (!tickets.length) {
    el.innerHTML = `<p class="text-xs text-gray-600 italic text-center py-4">No recent ticket activity.</p>`;
    return;
  }
  el.innerHTML = tickets.map(t => `
    <div class="flex items-center justify-between py-2.5 border-b border-white/5 last:border-0">
      <div class="flex items-center gap-3">
        <span class="text-xs font-mono text-gray-500">${escHtml(t.ticketNumber || '—')}</span>
        <span class="text-xs text-white font-medium">${escHtml(t.customer || '—')}</span>
        <span class="${getProviderBadgeClass(t.provider)} text-[10px] px-2 py-0.5 rounded-full font-semibold">${escHtml(t.provider || '—')}</span>
      </div>
      <span class="${getStatusBadgeClass(t.status)} text-[10px] px-2 py-0.5 rounded-full font-semibold">${escHtml(t.status || 'Open')}</span>
    </div>
  `).join('');
}

// ─────────────────────────────────────────────
// CUSTOMERS
// ─────────────────────────────────────────────
async function loadCustomers() {
  renderCustomerSkeleton();
  try {
    const data = await callBackend('getSupportCustomers');
    allCustomers = data?.customers || [];
    applyFilters_customers();
  } catch (err) {
    allCustomers = [];
    document.getElementById('customer-table-body').innerHTML = `
      <tr><td colspan="8" class="text-center text-gray-600 py-8 text-sm">
        Failed to load customers: ${escHtml(err.message)}
      </td></tr>`;
    showToast('Customers: ' + err.message, 'error');
  }
}

function applyFilters_customers() {
  const search = (document.getElementById('customer-search')?.value || '').toLowerCase();
  const dateFilter = document.getElementById('customer-date-filter')?.value; // YYYY-MM-DD

  filteredCustomers = allCustomers.filter(c => {
    const matchProvider = activeProviderFilter === 'all' || c.provider === activeProviderFilter;
    const matchStatus = activeStatusFilter === 'all' ||
      (activeStatusFilter === 'active' && isActive_(c.status)) ||
      (activeStatusFilter === 'inactive' && isInactive_(c.status));
    const matchSearch = !search ||
      (c.customer || '').toLowerCase().includes(search) ||
      (c.orderNumber || '').toLowerCase().includes(search) ||
      (c.phone || '').toLowerCase().includes(search) ||
      (c.product || '').toLowerCase().includes(search) ||
      (c.region || '').toLowerCase().includes(search) ||
      (c.status || '').toLowerCase().includes(search) ||
      (c.provider || '').toLowerCase().includes(search);
      
    // Match date if selected (checks created_da/completedDate matching YYYY-MM-DD)
    let matchDate = true;
    if (dateFilter) {
      const rawDate = c.createdDate || c.completedDate;
      if (!rawDate) {
        matchDate = false;
      } else {
        const s = String(rawDate).trim();
        const ddmm = s.match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})/);
        if (ddmm) {
          const isoStr = `${ddmm[3]}-${ddmm[2].padStart(2,'0')}-${ddmm[1].padStart(2,'0')}`;
          matchDate = isoStr === dateFilter;
        } else {
          try { matchDate = new Date(s).toISOString().split('T')[0] === dateFilter; } 
          catch(e) { matchDate = false; }
        }
      }
    }

    return matchProvider && matchStatus && matchSearch && matchDate;
  });

  customerPage = 0;
  renderCustomerTable();
}

function filterCustomerTable() { applyFilters_customers(); }

function filterByStatus(status) {
  activeStatusFilter = status;
  ['all', 'active', 'inactive'].forEach(s => {
    document.getElementById(`status-tab-${s}`)?.classList.toggle('active', s === status);
  });
  applyFilters_customers();
}

function renderCustomerTable() {
  const tbody = document.getElementById('customer-table-body');
  const thead = document.getElementById('customer-table-head');
  
  // Dynamically update headers
  if (thead) {
    if (activeProviderFilter === 'SADV') {
      thead.innerHTML = `
        <tr>
          <th class="text-left">Status</th>
          <th class="text-left">Customer</th>
          <th class="text-left">Provider</th>
          <th class="text-left">Order #</th>
          <th class="text-left">Product</th>
          <th class="text-left">Actions</th>
        </tr>
      `;
    } else if (activeProviderFilter === 'Infinifi') {
      thead.innerHTML = `
        <tr>
          <th class="text-left">Status</th>
          <th class="text-left">Customer</th>
          <th class="text-left">Provider</th>
          <th class="text-left">Lead #</th>
          <th class="text-left">Contract Term</th>
          <th class="text-left">MRC</th>
          <th class="text-left">Region</th>
          <th class="text-left">Actions</th>
        </tr>
      `;
    } else {
      thead.innerHTML = `
        <tr>
          <th class="text-left">Status</th>
          <th class="text-left">Customer</th>
          <th class="text-left">Provider</th>
          <th class="text-left">Order / Lead #</th>
          <th class="text-left">Product / Term</th>
          <th class="text-left">MRC</th>
          <th class="text-left">Region</th>
          <th class="text-left">Actions</th>
        </tr>
      `;
    }
  }

  const start = customerPage * CUSTOMER_PAGE_SIZE;
  const slice = filteredCustomers.slice(start, start + CUSTOMER_PAGE_SIZE);
  const total = filteredCustomers.length;

  document.getElementById('customer-count-label').textContent =
    `Showing ${start + 1}–${Math.min(start + slice.length, total)} of ${total} customers`;

  document.getElementById('btn-prev-customers').disabled = customerPage === 0;
  document.getElementById('btn-next-customers').disabled = start + CUSTOMER_PAGE_SIZE >= total;

  if (!slice.length) {
    let colSpan = activeProviderFilter === 'SADV' ? 6 : 8;
    tbody.innerHTML = `<tr><td colspan="${colSpan}" class="text-center text-gray-600 py-8 text-sm">No customers match your filters.</td></tr>`;
    return;
  }

  tbody.innerHTML = slice.map(c => {
    const isAct = isActive_(c.status);
    const isPend = isPending_(c.status);
    const rowClass = isAct ? 'row-active' : isPend ? 'row-pending' : 'row-inactive';
    const statusBadge = isAct
      ? `<span class="badge-active text-xs px-2 py-0.5 rounded-full font-semibold">Active</span>`
      : isPend
      ? `<span class="badge-pending text-xs px-2 py-0.5 rounded-full font-semibold">Pending</span>`
      : `<span class="badge-inactive text-xs px-2 py-0.5 rounded-full font-semibold">Inactive</span>`;

    let cellsHtml = `
      <td>${statusBadge}</td>
      <td class="font-medium text-white">${escHtml(c.customer || '—')}</td>
      <td><span class="${getProviderBadgeClass(c.provider)} text-[11px] px-2 py-0.5 rounded-full font-semibold">${escHtml(c.provider || '—')}</span></td>
    `;
    
    if (activeProviderFilter === 'SADV') {
      cellsHtml += `
        <td class="font-mono text-xs text-gray-400">${escHtml(c.orderNumber || '—')}</td>
        <td class="text-gray-400 text-xs">${escHtml(c.product || '—')}</td>
      `;
    } else if (activeProviderFilter === 'Infinifi') {
      cellsHtml += `
        <td class="font-mono text-xs text-gray-400">${escHtml(c.orderNumber || '—')}</td>
        <td class="text-gray-400 text-xs">${escHtml(c.product || '—')}</td>
        <td class="text-gray-300">R${escHtml(c.mrc ?? '—')}</td>
        <td class="text-gray-400 text-xs">${escHtml(c.region || '—')}</td>
      `;
    } else {
      // All providers
      cellsHtml += `
        <td class="font-mono text-xs text-gray-400">${escHtml(c.orderNumber || '—')}</td>
        <td class="text-gray-400 text-xs">${escHtml(c.product || '—')}</td>
        <td class="text-gray-300">${c.mrc ? 'R' + escHtml(c.mrc) : '—'}</td>
        <td class="text-gray-400 text-xs">${escHtml(c.region || '—')}</td>
      `;
    }

    cellsHtml += `
      <td>
        <button onclick="viewCustomerTickets('${escHtml(c.customer || '')}', '${escHtml(c.provider || '')}')"
          class="text-xs text-fiber-400 hover:text-fiber-300 font-semibold">Tickets →</button>
      </td>
    `;

    const _fidx = filteredCustomers.indexOf(c);
    return `<tr class="${rowClass} cursor-pointer hover:bg-white/5 transition-colors" onclick="openCustomerDetail(${_fidx >= 0 ? _fidx : 0})">${cellsHtml}</tr>`;
  }).join('');
}

function renderCustomerSkeleton() {
  const tbody = document.getElementById('customer-table-body');
  tbody.innerHTML = Array(6).fill(0).map(() => `
    <tr>
      ${Array(8).fill(0).map(() => `<td><div class="skeleton h-4 rounded w-full"></div></td>`).join('')}
    </tr>
  `).join('');
}

function nextCustomerPage() { customerPage++; renderCustomerTable(); }
function prevCustomerPage() { if (customerPage > 0) { customerPage--; renderCustomerTable(); } }

function viewCustomerTickets(customerName, provider) {
  closeCustomerDetail();
  showView('tickets');
  document.getElementById('ticket-search').value = customerName;
  if (provider && provider !== 'all') {
    document.getElementById('provider-filter').value = provider;
    activeProviderFilter = provider;
  }
  if (allTickets.length === 0) {
    loadTickets();
  } else {
    filterTicketTable();
  }
}

// ─────────────────────────────────────────────
// CUSTOMER DETAIL PANEL
// ─────────────────────────────────────────────

// Store a reference map for the current rendered slice
let _customerDetailMap = {};

function openCustomerDetail(c) {
  // Accept either a customer object directly or an index into filteredCustomers
  const customer = (typeof c === 'object' && c !== null) ? c : (filteredCustomers[c] || allCustomers[c]);
  if (!customer) { showToast('Customer data not found.', 'error'); return; }

  const modal = document.getElementById('modal-customer-detail');
  if (!modal) return;

  // ── Avatar
  const initials = (customer.customer || '?').split(' ').map(w => w[0]).join('').slice(0, 2).toUpperCase();
  document.getElementById('cd-avatar').textContent = initials;

  // ── Header name + badges
  document.getElementById('cd-name').textContent = customer.customer || '—';
  const isAct = isActive_(customer.status);
  const isPend = isPending_(customer.status);
  const statusLabel = isAct ? 'Active' : isPend ? 'Pending' : 'Inactive';
  const statusClass = isAct ? 'badge-active' : isPend ? 'badge-pending' : 'badge-inactive';
  document.getElementById('cd-badges').innerHTML = `
    <span class="${statusClass} text-[10px] px-2.5 py-1 rounded-full font-bold">${escHtml(statusLabel)}</span>
    <span class="${getProviderBadgeClass(customer.provider)} text-[10px] px-2.5 py-1 rounded-full font-bold">${escHtml(customer.provider || '—')}</span>
  `;

  // ── Account identifiers
  setEl('cd-order',      customer.orderNumber   || '—');
  setEl('cd-provider-txt', customer.provider    || '—');
  setEl('cd-lead',       customer.leadNumber    || customer.lead || customer.orderNumber || '—');
  setEl('cd-premise',    customer.premiseId     || customer.vumaPremiseId || customer.premise || '—');

  // ── Contact details
  setEl('cd-fullname',   customer.customer      || '—');
  setEl('cd-phone',      customer.phone         || customer.phoneNumber || customer.mobile || '—');
  setEl('cd-email',      customer.email         || customer.emailAddress || '—');
  // Build address from available fields
  const addrParts = [customer.address, customer.suburb, customer.city, customer.province]
    .filter(Boolean);
  const addrFull = addrParts.length ? addrParts.join(', ') : (customer.region || '—');
  setEl('cd-address',    addrFull);

  // ── Service details
  setEl('cd-product',    customer.product       || customer.package || '—');
  setEl('cd-term',       customer.contractTerm  || customer.term || '—');
  const mrcVal = customer.mrc != null ? 'R' + escHtml(String(customer.mrc)) : '—';
  document.getElementById('cd-mrc').textContent = mrcVal === '—' ? '—' : 'R' + (customer.mrc);
  setEl('cd-channel',    customer.channelPartner || customer.channel || '—');
  setEl('cd-region',     customer.region        || '—');

  // ── Dates
  setEl('cd-created',    formatDate_(customer.createdDate)   || '—');
  setEl('cd-completed',  customer.completedDate ? formatDate_(customer.completedDate) : '—');

  // ── Footer button
  const viewBtn = document.getElementById('cd-view-tickets-btn');
  if (viewBtn) {
    viewBtn.onclick = () => viewCustomerTickets(customer.customer || '', customer.provider || '');
  }

  // ── Linked tickets (filter from already-loaded tickets or show prompt)
  renderCustomerLinkedTickets(customer);

  // Show modal
  modal.classList.remove('hidden');
  document.body.style.overflow = 'hidden';
}

function renderCustomerLinkedTickets(customer) {
  const el = document.getElementById('cd-tickets-list');
  if (!el) return;

  const name = (customer.customer || '').toLowerCase();
  const order = (customer.orderNumber || '').toLowerCase();

  if (!allTickets.length) {
    el.innerHTML = `
      <div class="text-center py-4">
        <p class="text-xs text-gray-500 mb-2">Tickets haven't been loaded yet.</p>
        <button onclick="loadCustomerTicketsInPanel('${escHtml(customer.customer || '')}', '${escHtml(customer.provider || '')}')" 
          class="text-xs text-fiber-400 hover:text-fiber-300 font-semibold">Load Tickets</button>
      </div>`;
    return;
  }

  const linked = allTickets.filter(t => {
    const tName = (t.customer || '').toLowerCase();
    const tOrder = (t.orderNumber || '').toLowerCase();
    return (name && tName.includes(name)) || (order && tOrder && tOrder === order);
  });

  if (!linked.length) {
    el.innerHTML = `<p class="text-xs text-gray-600 italic py-2">No tickets found for this customer.</p>`;
    return;
  }

  el.innerHTML = linked.slice(0, 5).map(t => `
    <div class="cd-field flex items-center justify-between gap-3">
      <div class="min-w-0">
        <div class="flex items-center gap-2 mb-0.5">
          <span class="text-[10px] font-mono text-fiber-400">${escHtml(t.ticketNumber || '—')}</span>
          <span class="${getStatusBadgeClass(t.status)} text-[9px] px-1.5 py-0.5 rounded-full font-semibold">${escHtml(t.status || 'Open')}</span>
        </div>
        <p class="text-xs text-gray-400 truncate">${escHtml(t.description || '—')}</p>
        <p class="text-[10px] text-gray-600 mt-0.5">${formatDate_(t.createdDate)}</p>
      </div>
    </div>
  `).join('') + (linked.length > 5 ? `<p class="text-[11px] text-gray-600 text-center pt-1">+${linked.length - 5} more — click "View All Tickets" below</p>` : '');
}

async function loadCustomerTicketsInPanel(customerName, provider) {
  const el = document.getElementById('cd-tickets-list');
  if (el) el.innerHTML = '<div class="skeleton h-10 rounded-lg"></div><div class="skeleton h-10 rounded-lg"></div>';
  try {
    const data = await callBackend('getSupportTickets', { offset: 0, limit: 500 });
    allTickets = data?.tickets || [];
    const fakeCustomer = { customer: customerName, provider, orderNumber: '' };
    renderCustomerLinkedTickets(fakeCustomer);
  } catch (err) {
    if (el) el.innerHTML = `<p class="text-xs text-red-400 italic">Could not load tickets: ${escHtml(err.message)}</p>`;
  }
}

function closeCustomerDetail() {
  document.getElementById('modal-customer-detail')?.classList.add('hidden');
  document.body.style.overflow = '';
}

// ─────────────────────────────────────────────
// TICKETS
// ─────────────────────────────────────────────
async function loadTickets() {
  renderTicketSkeleton();
  try {
    const data = await callBackend('getSupportTickets', { offset: 0, limit: 500 });
    allTickets = data?.tickets || [];
    applyFilters_tickets();
  } catch (err) {
    allTickets = [];
    document.getElementById('ticket-table-body').innerHTML = `
      <tr><td colspan="8" class="text-center text-gray-600 py-8 text-sm">
        Failed to load tickets: ${escHtml(err.message)}
      </td></tr>`;
    showToast('Tickets: ' + err.message, 'error');
  }
}

function refreshSupportTickets() {
  allTickets = [];
  loadTickets();
  showToast('Refreshing support tickets...', 'info');
}

function applyFilters_tickets() {
  const search = (document.getElementById('ticket-search')?.value || '').toLowerCase();
  const dateFilter = document.getElementById('ticket-date-filter')?.value; // YYYY-MM-DD

  filteredTickets = allTickets.filter(t => {
    const matchProvider = activeProviderFilter === 'all' || t.provider === activeProviderFilter;
    const matchSearch = !search ||
      (t.customer || '').toLowerCase().includes(search) ||
      (t.ticketNumber || '').toLowerCase().includes(search) ||
      (t.ticket2 || '').toLowerCase().includes(search) ||
      (t.orderNumber || '').toLowerCase().includes(search) ||
      (t.description || '').toLowerCase().includes(search) ||
      (t.channelPartner || '').toLowerCase().includes(search) ||
      (t.product || '').toLowerCase().includes(search) ||
      (t.status || '').toLowerCase().includes(search) ||
      (t.paymentRec || '').toLowerCase().includes(search) ||
      (t.updates && t.updates.join(' ').toLowerCase().includes(search));
      
    let matchDate = true;
    if (dateFilter) {
      if (!t.createdDate) {
        matchDate = false;
      } else {
        const s = String(t.createdDate).trim();
        const ddmm = s.match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})/);
        if (ddmm) {
          const isoStr = `${ddmm[3]}-${ddmm[2].padStart(2,'0')}-${ddmm[1].padStart(2,'0')}`;
          matchDate = isoStr === dateFilter;
        } else {
          try { matchDate = new Date(s).toISOString().split('T')[0] === dateFilter; } 
          catch(e) { matchDate = false; }
        }
      }
    }

    return matchProvider && matchSearch && matchDate;
  });

  ticketPage = 0;
  renderTicketTable();
}

function filterTicketTable() { applyFilters_tickets(); }

function renderTicketTable() {
  const tbody = document.getElementById('ticket-table-body');
  const thead = document.getElementById('ticket-table-head');
  
  if (thead) {
    if (activeProviderFilter === 'SADV') {
      thead.innerHTML = `<tr><th class="text-left">Ticket #</th><th class="text-left">Created</th><th class="text-left">Customer</th><th class="text-left">Provider</th><th class="text-left">Status</th><th class="text-left">Description</th><th class="text-left">Channel</th><th class="text-left">Actions</th></tr>`;
    } else if (activeProviderFilter === 'Infinifi') {
      thead.innerHTML = `<tr><th class="text-left">Lead #</th><th class="text-left">Created</th><th class="text-left">Customer</th><th class="text-left">Provider</th><th class="text-left">Status</th><th class="text-left">Description</th><th class="text-left">Channel</th><th class="text-left">Actions</th></tr>`;
    } else {
      thead.innerHTML = `<tr><th class="text-left">Ticket / Lead #</th><th class="text-left">Created</th><th class="text-left">Customer</th><th class="text-left">Provider</th><th class="text-left">Status</th><th class="text-left">Description</th><th class="text-left">Channel</th><th class="text-left">Actions</th></tr>`;
    }
  }

  const start = ticketPage * TICKET_PAGE_SIZE;
  const slice = filteredTickets.slice(start, start + TICKET_PAGE_SIZE);
  const total = filteredTickets.length;

  document.getElementById('ticket-count-label').textContent =
    `Showing ${start + 1}–${Math.min(start + slice.length, total)} of ${total} tickets`;

  if (!slice.length) {
    tbody.innerHTML = `<tr><td colspan="8" class="text-center text-gray-600 py-8 text-sm">No tickets match your search.</td></tr>`;
    return;
  }

  tbody.innerHTML = slice.map((t, idx) => {
    const globalIdx = start + idx;
    _ticketDetailMap[globalIdx] = t;
    return `
    <tr class="cursor-pointer hover:bg-white/5 transition-colors" onclick="openTicketDetail(${globalIdx})">
      <td class="font-mono text-xs text-fiber-400">${escHtml(t.ticketNumber || '—')}</td>
      <td class="text-xs text-gray-500">${formatDate_(t.createdDate)}</td>
      <td class="font-medium text-white">${escHtml(t.customer || '—')}</td>
      <td><span class="${getProviderBadgeClass(t.provider)} text-[11px] px-2 py-0.5 rounded-full font-semibold">${escHtml(t.provider || '—')}</span></td>
      <td><span class="${getStatusBadgeClass(t.status)} text-[11px] px-2 py-0.5 rounded-full font-semibold">${escHtml(t.status || 'Unknown')}</span></td>
      <td class="text-xs text-gray-400 max-w-xs truncate">${escHtml(t.description || '—')}</td>
      <td class="text-xs text-gray-500">${escHtml(t.channelPartner || '—')}</td>
      <td onclick="event.stopPropagation()">
        <button onclick="openTicketDetail(${globalIdx})"
          class="px-2.5 py-1 text-xs bg-fiber-600/20 hover:bg-fiber-600/30 text-fiber-300 hover:text-white font-semibold rounded-lg border border-fiber-500/20 transition-all inline-flex items-center gap-1">
          <svg class="w-3 h-3" fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="2">
            <path stroke-linecap="round" stroke-linejoin="round" d="M16.862 4.487l1.687-1.688a1.875 1.875 0 112.652 2.652L10.582 16.07a4.5 4.5 0 01-1.897 1.13L6 18l.8-2.685a4.5 4.5 0 011.13-1.897l8.932-8.931zm0 0L19.5 7.125M18 14v4.75A2.25 2.25 0 0115.75 21H5.25A2.25 2.25 0 013 18.75V8.25A2.25 2.25 0 015.25 6H10" />
          </svg>
          Update Ticket
        </button>
      </td>
    </tr>
  `;
  }).join('');
}

function renderTicketSkeleton() {
  const tbody = document.getElementById('ticket-table-body');
  tbody.innerHTML = Array(6).fill(0).map(() => `
    <tr>${Array(8).fill(0).map(() => `<td><div class="skeleton h-4 rounded w-full"></div></td>`).join('')}</tr>
  `).join('');
}

function nextTicketPage() { ticketPage++; renderTicketTable(); }
function prevTicketPage() { if (ticketPage > 0) { ticketPage--; renderTicketTable(); } }

// ─────────────────────────────────────────────
// NEW TICKET MODAL
// ─────────────────────────────────────────────
function openNewTicketModal() {
  document.getElementById('modal-new-ticket').classList.remove('hidden');
}

function closeNewTicketModal() {
  document.getElementById('modal-new-ticket').classList.add('hidden');
  // Reset form
  ['nt-provider', 'nt-status', 'nt-customer', 'nt-order', 'nt-channel', 'nt-product', 'nt-description']
    .forEach(id => {
      const el = document.getElementById(id);
      if (el) el.value = el.tagName === 'SELECT' ? el.options[0].value : '';
    });
}

async function submitNewTicket() {
  const provider = document.getElementById('nt-provider').value;
  const customer = document.getElementById('nt-customer').value.trim();
  const description = document.getElementById('nt-description').value.trim();

  if (!provider || !customer || !description) {
    showToast('Provider, customer name, and description are required.', 'error');
    return;
  }

  const payload = {
    provider,
    status: document.getElementById('nt-status').value,
    customer,
    orderNumber: document.getElementById('nt-order').value.trim(),
    channelPartner: document.getElementById('nt-channel').value.trim(),
    product: document.getElementById('nt-product').value.trim(),
    description,
    agentName: session?.name || 'Unknown',
    createdDate: new Date().toISOString(),
  };

  try {
    await callBackend('logSupportTicket', payload);
    closeNewTicketModal();
    showToast('Ticket logged successfully!', 'success');
    // Refresh tickets list
    allTickets = [];
    if (!document.getElementById('view-tickets').classList.contains('hidden')) {
      loadTickets();
    }
  } catch (err) {
    showToast('Failed to log ticket: ' + err.message, 'error');
  }
}

// Open full ticket detail modal
function openTicketDetail(idx) {
  const t = _ticketDetailMap[idx];
  if (!t) { showToast('Ticket not found.', 'error'); return; }

  _activeDetailTicket = t;
  const modal = document.getElementById('modal-ticket-detail');
  if (!modal) { showToast('Detail modal missing from HTML.', 'error'); return; }

  const statusBadge = `<span class="${getStatusBadgeClass(t.status)} text-xs px-2.5 py-1 rounded-full font-semibold">${escHtml(t.status || 'Unknown')}</span>`;
  const providerBadge = `<span class="${getProviderBadgeClass(t.provider)} text-xs px-2.5 py-1 rounded-full font-semibold">${escHtml(t.provider || '—')}</span>`;

  const updatesHtml = t.updates && t.updates.length
    ? t.updates.map((u, i) => `
        <div class="flex gap-3 py-2.5 border-b border-white/5 last:border-0">
          <span class="text-[10px] text-fiber-400 font-bold shrink-0 mt-0.5">UPD ${i + 1}</span>
          <p class="text-xs text-gray-300 leading-relaxed">${escHtml(u)}</p>
        </div>`).join('')
    : '<p class="text-xs text-gray-600 italic">No update notes on this ticket.</p>';

  document.getElementById('td-ticket-number').textContent = t.ticketNumber || '—';
  document.getElementById('td-ticket2').textContent = t.ticket2 || '—';
  document.getElementById('td-order-number').textContent = t.orderNumber || '—';
  document.getElementById('td-customer').textContent = t.customer || '—';
  document.getElementById('td-channel').textContent = t.channelPartner || '—';
  document.getElementById('td-product').textContent = t.product || '—';
  document.getElementById('td-created').textContent = formatDate_(t.createdDate);
  document.getElementById('td-completed').textContent = t.completedDate ? formatDate_(t.completedDate) : 'Not completed';
  document.getElementById('td-payment').textContent = t.paymentRec || '—';
  document.getElementById('td-description').textContent = t.description || '—';
  document.getElementById('td-status-badge').innerHTML = statusBadge;
  document.getElementById('td-provider-badge').innerHTML = providerBadge;
  document.getElementById('td-updates').innerHTML = updatesHtml;

  // Reset update form
  document.getElementById('update-status').value = '';
  document.getElementById('update-note').value = '';
  document.getElementById('btn-submit-update').disabled = false;
  document.getElementById('btn-submit-update').textContent = 'Submit Update';

  modal.classList.remove('hidden');
}

async function submitTicketUpdate(e) {
  e.preventDefault();
  if (!_activeDetailTicket) return;

  const statusVal = document.getElementById('update-status').value;
  const noteVal = document.getElementById('update-note').value.trim();

  if (!statusVal && !noteVal) {
    showToast('Please provide a new status or a note to update.', 'error');
    return;
  }

  const btn = document.getElementById('btn-submit-update');
  btn.disabled = true;
  btn.textContent = 'Updating...';

  try {
    const payload = {
      ticketId: _activeDetailTicket.createdDate, // Created date reference
      ticketNumber: _activeDetailTicket.ticketNumber || '',
      orderNumber: _activeDetailTicket.orderNumber || '',
      customer: _activeDetailTicket.customer || '',
      provider: _activeDetailTicket.provider || 'SADV',
      newStatus: statusVal,
      newNote: noteVal,
      agentName: (typeof session !== 'undefined' && session?.name) ? session.name : 'Support Agent'
    };

    const res = await callBackend('updateSupportTicket', payload);
    
    if (res.error) throw new Error(res.error);
    
    showToast('Ticket updated successfully!', 'success');
    closeTicketDetail();
    loadTickets(); // Refresh table
  } catch (err) {
    console.error(err);
    showToast(err.message, 'error');
    btn.disabled = false;
    btn.textContent = 'Submit Update';
  }
}

function closeTicketDetail() {
  _activeDetailTicket = null;
  document.getElementById('modal-ticket-detail')?.classList.add('hidden');
}

// ─────────────────────────────────────────────
// AGILITY REPORTS
// ─────────────────────────────────────────────
async function loadSyncHistory() {
  const el = document.getElementById('sync-history');
  try {
    const data = await callBackend('getAgilitySyncHistory');
    const history = data?.history || [];
    if (!history.length) {
      el.innerHTML = `<p class="text-xs text-gray-600 italic">No sync history found. Upload your first report above.</p>`;
      return;
    }
    el.innerHTML = history.map(h => `
      <div class="flex items-center justify-between py-2.5 border-b border-white/5 last:border-0">
        <div>
          <p class="text-xs font-semibold text-white">${escHtml(h.provider)} — ${formatDateTime_(h.syncedAt)}</p>
          <p class="text-[11px] text-gray-500">${escHtml(h.rowsProcessed)} rows processed</p>
        </div>
        <span class="badge-active text-[10px] px-2 py-0.5 rounded-full font-semibold">✓ Done</span>
      </div>
    `).join('');
  } catch (err) {
    el.innerHTML = `<p class="text-xs text-gray-600 italic">Sync history unavailable: ${escHtml(err.message)}</p>`;
  }
}

async function convertFileToCsvBase64_(file, provider) {
  const ext = file.name.split('.').pop().toLowerCase();

  if (ext === 'csv') {
    return await readFileAsBase64_(file);
  }

  if (ext === 'xlsx' || ext === 'xls') {
    if (typeof XLSX === 'undefined') {
      throw new Error('Excel parser library is initializing. Please refresh the page and try again.');
    }
    const arrayBuffer = await file.arrayBuffer();
    const workbook = XLSX.read(arrayBuffer, { type: 'array' });

    if (!workbook.SheetNames || workbook.SheetNames.length === 0) {
      throw new Error('The uploaded Excel file contains no worksheets.');
    }

    // Smart sheet matching based on provider or fallback to first sheet
    let targetSheetName = workbook.SheetNames[0];
    const provUpper = (provider || '').toUpperCase();

    for (const sheetName of workbook.SheetNames) {
      const clean = sheetName.trim().toUpperCase();
      if (provUpper === 'SADV' && (clean === 'AUGSEP' || clean.includes('SADV') || clean.includes('AUGSEP'))) {
        targetSheetName = sheetName;
        break;
      }
      if (provUpper === 'INFINIFI' && (clean.includes('INFINIFI') || clean.includes('CUSTOMER'))) {
        targetSheetName = sheetName;
        break;
      }
    }

    const worksheet = workbook.Sheets[targetSheetName];
    if (!worksheet) {
      throw new Error(`Sheet "${targetSheetName}" could not be parsed.`);
    }

    const csvString = XLSX.utils.sheet_to_csv(worksheet);
    if (!csvString || !csvString.trim()) {
      throw new Error(`Sheet "${targetSheetName}" in workbook is empty.`);
    }

    const encoder = new TextEncoder();
    const bytes = encoder.encode(csvString);
    let binary = '';
    for (let i = 0; i < bytes.byteLength; i++) {
      binary += String.fromCharCode(bytes[i]);
    }
    return btoa(binary);
  }

  throw new Error('Unsupported file format. Please upload an Excel (.xlsx, .xls) or CSV (.csv) file.');
}

async function uploadAgilityReport() {
  const provider = document.getElementById('agility-provider').value;
  const fileInput = document.getElementById('agility-file');
  const file = fileInput.files[0];
  const btn = document.getElementById('agility-upload-btn');
  const resultEl = document.getElementById('agility-upload-result');

  if (!file) {
    showToast('Please select a file to upload.', 'error');
    return;
  }

  const validExts = ['xlsx', 'xls', 'csv'];
  const ext = file.name.split('.').pop().toLowerCase();
  if (!validExts.includes(ext)) {
    showToast('Please upload an Excel (.xlsx, .xls) or CSV (.csv) file.', 'error');
    return;
  }

  if (btn) { btn.disabled = true; btn.innerHTML = '<div class="spinner-sm inline-block mr-2"></div> Uploading &amp; Parsing...'; }
  if (resultEl) resultEl.classList.add('hidden');
  showToast(`Parsing ${file.name}...`, 'info');

  try {
    const base64 = await convertFileToCsvBase64_(file, provider);
    const result = await callBackend('uploadAgilityReport', {
      provider,
      fileName: file.name,
      fileContent: base64,
    });

    // Show rich result card
    if (resultEl) {
      resultEl.classList.remove('hidden');
      resultEl.innerHTML = `
        <div class="flex items-center gap-2 text-emerald-400 font-bold text-sm mb-3">
          <svg class="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="2">
            <path stroke-linecap="round" stroke-linejoin="round" d="M9 12.75L11.25 15 15 9.75M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
          </svg>
          ${escHtml(provider)} Agility Report Synced
        </div>
        <div class="grid grid-cols-3 gap-3 mb-3">
          <div class="text-center p-3 rounded-xl bg-white/5">
            <p class="text-xl font-bold text-white">${result.rowsProcessed}</p>
            <p class="text-[10px] text-gray-500 mt-0.5">Rows Processed</p>
          </div>
          <div class="text-center p-3 rounded-xl bg-emerald-500/10">
            <p class="text-xl font-bold text-emerald-400">${result.rowsNew}</p>
            <p class="text-[10px] text-gray-500 mt-0.5">New Records</p>
          </div>
          <div class="text-center p-3 rounded-xl bg-blue-500/10">
            <p class="text-xl font-bold text-blue-400">${result.rowsUpdated}</p>
            <p class="text-[10px] text-gray-500 mt-0.5">Updated</p>
          </div>
        </div>
        <p class="text-[11px] text-gray-500">Sync ID: <span class="font-mono text-gray-400">${escHtml(result.syncId)}</span> &bull; ${escHtml(file.name)}</p>
        <p class="text-[11px] text-gray-500 mt-1">⏱ Synced at: <span class="text-gray-300 font-semibold">${formatDateTime_(result.syncedAt)}</span></p>
      `;
    }

    // ── Push new records into the CRM immediately after upload
    if (btn) { btn.innerHTML = '<div class="spinner-sm inline-block mr-2"></div> Pushing to CRM...'; }
    showToast('Injecting records into CRM database...', 'info');

    let syncResult = null;
    try {
      syncResult = await callBackend('runAgilitySync', { force: true });
    } catch (syncErr) {
      console.warn('CRM sync failed after upload:', syncErr.message);
    }

    if (syncResult && resultEl) {
      resultEl.innerHTML += `
        <div class="mt-4 pt-3 border-t border-white/5">
          <p class="text-[11px] font-bold uppercase tracking-widest mb-2" style="color:#F1A328">CRM Import Stats</p>
          <div class="flex gap-5">
            <div><span class="text-white font-bold text-lg">${syncResult.newLeads}</span> <span class="text-[10px] text-gray-500">New Leads</span></div>
            <div><span class="text-white font-bold text-lg">${syncResult.updatedLeads}</span> <span class="text-[10px] text-gray-500">Updated</span></div>
            <div><span class="text-white font-bold text-lg">${syncResult.skipped}</span> <span class="text-[10px] text-gray-500">Skipped</span></div>
          </div>
          ${syncResult.debugSkipReasons ? `<div class="mt-2 text-[9px] text-gray-500 font-mono bg-black/20 p-1.5 rounded">Skip reasons: ${JSON.stringify(syncResult.debugSkipReasons)}</div>` : ''}
        </div>
      `;
    }

    const newMsg = syncResult ? syncResult.newLeads + ' new leads' : 'check results';
    showToast(`${provider} uploaded & CRM updated — ${newMsg}`, 'success');
    fileInput.value = '';
    loadSyncHistory();
    loadDashboard();

    // Auto-refresh tickets and customers with freshly-imported data
    allTickets = [];
    allCustomers = [];
    loadTickets();
    if (typeof loadCustomers === 'function') loadCustomers();
  } catch (err) {
    if (resultEl) {
      resultEl.classList.remove('hidden');
      resultEl.innerHTML = `<div class="text-red-400 font-semibold text-sm mb-1">Upload Failed</div><p class="text-xs text-gray-400">${escHtml(err.message)}</p>`;
    }
    showToast('Upload failed: ' + err.message, 'error');
  } finally {
    if (btn) { btn.disabled = false; btn.innerHTML = 'Upload &amp; Parse'; }
  }
}

function readFileAsBase64_(file) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(reader.result.split(',')[1]);
    reader.onerror = reject;
    reader.readAsDataURL(file);
  });
}

// ─────────────────────────────────────────────
// SOPs
// ─────────────────────────────────────────────
const SOP_CONTENT = {
  'ss': {
    title: 'Self-Scheduling (SS) SOP',
    body: `
      <h4 class="text-sm font-bold text-white mb-3">What is Self-Scheduling?</h4>
      <p class="text-xs text-gray-400 mb-4">Self-Scheduling (SS) refers to the ISP's ability to schedule their own installation/technician visits without requiring FibreGems to manually book the appointment on their behalf.</p>
      <h4 class="text-sm font-bold text-white mb-2">Key Rules</h4>
      <ul class="text-xs text-gray-400 space-y-2 list-disc pl-4 mb-4">
        <li>SS applies when the ISP has confirmed access to the self-scheduling portal.</li>
        <li>The standard ETA for SS bookings is <strong class="text-white">24 hours</strong> from confirmation.</li>
        <li>If the ISP cannot self-schedule, the ticket must be escalated to regional support for manual booking.</li>
        <li>Always capture the scheduling reference number in Update 1 of the AUGSEP ticket.</li>
      </ul>
      <h4 class="text-sm font-bold text-white mb-2">Regional Routing</h4>
      <p class="text-xs text-gray-400">Verify the customer's region against the premise ID before assigning the SS slot. Incorrect region assignment will result in a failed scheduling attempt.</p>
    `
  },
  'refund': {
    title: 'Refund of Incorrect Payments',
    body: `
      <h4 class="text-sm font-bold text-white mb-3">When to Issue a Refund</h4>
      <p class="text-xs text-gray-400 mb-4">A refund is issued when a customer has made a payment to the wrong account, paid an incorrect amount, or made a duplicate payment.</p>
      <h4 class="text-sm font-bold text-white mb-2">Step-by-Step Process</h4>
      <ol class="text-xs text-gray-400 space-y-2 list-decimal pl-4 mb-4">
        <li>Verify the payment on the CRM (PAYMENTS sheet) and confirm the incorrect amount or account.</li>
        <li>Log a refund request ticket in the AUGSEP sheet with status <strong class="text-white">Open</strong>.</li>
        <li>Escalate to the Finance team via email with the ticket number and proof of payment.</li>
        <li>Update the ticket status to <strong class="text-white">In Progress</strong> once Finance acknowledges.</li>
        <li>Close the ticket and update to <strong class="text-white">Resolved</strong> once the refund is confirmed processed.</li>
      </ol>
      <p class="text-xs text-amber-400 font-semibold">⚠ Do NOT process refunds without Finance team sign-off.</p>
    `
  },
  'moving-funds': {
    title: 'Moving Funds Between Order Numbers',
    body: `
      <h4 class="text-sm font-bold text-white mb-3">When Is This Required?</h4>
      <p class="text-xs text-gray-400 mb-4">When a customer has two or more different order numbers (e.g., a SADV_OVR and a SADV_OVK number) and a payment was made against the wrong order reference.</p>
      <h4 class="text-sm font-bold text-white mb-2">Step-by-Step</h4>
      <ol class="text-xs text-gray-400 space-y-2 list-decimal pl-4 mb-4">
        <li>Confirm both order numbers in the CRM ORDERS sheet for the customer.</li>
        <li>Verify which order the payment was received against (check PAYMENTS sheet).</li>
        <li>Log a "Moving Funds" ticket in AUGSEP with both order references in the description.</li>
        <li>Submit a fund movement request to the Finance team with the ticket number.</li>
        <li>Once Finance confirms the transfer, mark the ticket as <strong class="text-white">Resolved</strong> and note both order numbers in Update 1.</li>
      </ol>
    `
  },
  'premise': {
    title: 'Premise Creation SOP',
    body: `
      <h4 class="text-sm font-bold text-white mb-3">What Is Premise Creation?</h4>
      <p class="text-xs text-gray-400 mb-4">Premise creation is required when a customer's physical address does not exist in the ISP or provider database, making it impossible to process an order without first registering the premise.</p>
      <h4 class="text-sm font-bold text-white mb-2">Step-by-Step</h4>
      <ol class="text-xs text-gray-400 space-y-2 list-decimal pl-4 mb-4">
        <li>Confirm the customer's exact physical address (street, suburb, province).</li>
        <li>Check whether a Vuma Reach Premise ID exists for this address.</li>
        <li>If no Premise ID exists, log a premise creation ticket in AUGSEP with status <strong class="text-white">Open</strong>.</li>
        <li>Submit the address to the provider (SADV or Infinifi) for manual premise creation.</li>
        <li>Once the Premise ID is created and returned, update the customer record and close the ticket.</li>
      </ol>
      <p class="text-xs text-blue-400 font-semibold">ℹ Premise creation can take 3–5 business days.</p>
    `
  },
  'ticketing': {
    title: 'Ticketing SOP',
    body: `
      <h4 class="text-sm font-bold text-white mb-3">Logging a Support Ticket</h4>
      <p class="text-xs text-gray-400 mb-4">All customer interactions that require follow-up or escalation must be logged as a ticket in the AUGSEP sheet of the Support Tickets spreadsheet.</p>
      <h4 class="text-sm font-bold text-white mb-2">Required Fields</h4>
      <ul class="text-xs text-gray-400 space-y-1.5 list-disc pl-4 mb-4">
        <li><strong class="text-white">created_da</strong> — Date the ticket was opened (auto-filled)</li>
        <li><strong class="text-white">status</strong> — Open / In Progress / Escalated / Resolved</li>
        <li><strong class="text-white">customer</strong> — Full customer name</li>
        <li><strong class="text-white">description</strong> — Clear, concise description of the issue</li>
        <li><strong class="text-white">Ticket number</strong> — Reference number from external ticketing system</li>
        <li><strong class="text-white">Order Number</strong> — Linked CRM order reference</li>
      </ul>
      <h4 class="text-sm font-bold text-white mb-2">Update Rules</h4>
      <p class="text-xs text-gray-400">Use Update 1 through Update 9 fields chronologically. Never overwrite an existing update — always use the next available field.</p>
    `
  },
  'infinifi-link': {
    title: 'Infinifi Registration Links & Procedures',
    body: `
      <h4 class="text-sm font-bold text-white mb-3">Infinifi Order Submission</h4>
      <p class="text-xs text-gray-400 mb-4">For Infinifi customers, all new order submissions must go through the Infinifi ISP portal. Ensure the Lead Number is captured in the ticket.</p>
      <h4 class="text-sm font-bold text-white mb-2">Key Identifiers for Infinifi</h4>
      <ul class="text-xs text-gray-400 space-y-1.5 list-disc pl-4 mb-4">
        <li><strong class="text-white">Lead Number</strong> — Primary reference for Infinifi orders</li>
        <li><strong class="text-white">Vuma Reach Premise ID</strong> — Required for all premise registrations</li>
        <li><strong class="text-white">Contract Term</strong> — 12 or 24 month term must be noted on the ticket</li>
        <li><strong class="text-white">Total MRC Excl</strong> — Monthly recurring cost (excluding VAT)</li>
      </ul>
      <p class="text-xs text-gray-400">Note: Infinifi and SADV operate on <strong class="text-white">separate Agility report formats</strong>. Ensure you are referencing the correct report when checking order status.</p>
    `
  }
};

function openSopModal(sopKey) {
  const sop = SOP_CONTENT[sopKey];
  if (!sop) return;
  document.getElementById('sop-title').textContent = sop.title;
  document.getElementById('sop-content').innerHTML = sop.body;
  document.getElementById('modal-sop').classList.remove('hidden');
}

function closeSopModal() {
  document.getElementById('modal-sop').classList.add('hidden');
}

// ─────────────────────────────────────────────
// UTILITIES
// ─────────────────────────────────────────────
function isActive_(status) {
  if (!status) return false;
  const s = status.toString().toLowerCase().trim();
  return s === 'active' || s.includes('complete') || s.includes('activated') || s === 'resolved';
}

function isPending_(status) {
  if (!status) return true;
  const s = status.toString().toLowerCase().trim();
  return s === 'pending' || s === 'scheduled' || s.includes('progress') || s === 'open' || s === 'new' || s.includes('book') || s.includes('order') || s.includes('escalat');
}

function isInactive_(status) {
  if (!status) return false;
  const s = status.toString().toLowerCase().trim();
  return s === 'inactive' || s.includes('cancel') || s.includes('expired') || s.includes('declined') || s === 'closed';
}

function getProviderBadgeClass(provider) {
  if (!provider) return 'badge-pending';
  return provider === 'Infinifi' ? 'badge-infinifi' : 'badge-sadv';
}

function getStatusBadgeClass(status) {
  if (!status) return 'badge-pending';
  const s = status.toString().toLowerCase().trim();
  if (isActive_(s)) return 'badge-active';
  if (isInactive_(s)) return 'badge-inactive';
  return 'badge-pending';
}

function formatDate_(val) {
  if (!val) return '—';
  try {
    let d;
    const str = String(val).trim();

    // Detect DD/MM/YYYY or DD/MM/YYYY HH:MM:SS (South African / Google Sheets format)
    const ddmmyyyy = str.match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})/);
    if (ddmmyyyy) {
      // ddmmyyyy[1]=day, [2]=month, [3]=year — construct ISO to avoid ambiguity
      d = new Date(`${ddmmyyyy[3]}-${ddmmyyyy[2].padStart(2,'0')}-${ddmmyyyy[1].padStart(2,'0')}T00:00:00`);
    } else {
      d = new Date(str);
    }

    if (isNaN(d.getTime())) return str.slice(0, 10);
    return d.toLocaleDateString('en-ZA', { day: '2-digit', month: 'short', year: 'numeric' });
  } catch { return String(val).slice(0, 10); }
}

/**
 * formatDateTime_ — Formats a value as date + time, e.g. "06 Oct 2026 • 12:45:30".
 * Accepts: yyyy-MM-dd HH:mm:ss, ISO 8601, DD/MM/YYYY HH:mm:ss, or a Date object.
 */
function formatDateTime_(val) {
  if (!val) return '—';
  try {
    let d;
    const str = String(val).trim();

    // yyyy-MM-dd HH:mm:ss (Apps Script / backend format)
    const ymd = str.match(/^(\d{4})-(\d{2})-(\d{2})[ T](\d{2}):(\d{2}):(\d{2})/);
    if (ymd) {
      d = new Date(`${ymd[1]}-${ymd[2]}-${ymd[3]}T${ymd[4]}:${ymd[5]}:${ymd[6]}`);
    } else {
      // Detect DD/MM/YYYY HH:mm:ss (Google Sheets South African format)
      const ddmm = str.match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})(?:[ T](\d{2}):(\d{2})(?::(\d{2}))?)?/);
      if (ddmm) {
        const timePart = ddmm[4] ? `T${ddmm[4]}:${ddmm[5]}:${ddmm[6] || '00'}` : 'T00:00:00';
        d = new Date(`${ddmm[3]}-${ddmm[2].padStart(2,'0')}-${ddmm[1].padStart(2,'0')}${timePart}`);
      } else {
        d = new Date(str);
      }
    }

    if (isNaN(d.getTime())) return str;
    const datePart = d.toLocaleDateString('en-ZA', { day: '2-digit', month: 'short', year: 'numeric' });
    const timePart = d.toLocaleTimeString('en-ZA', { hour: '2-digit', minute: '2-digit', second: '2-digit', hour12: false });
    return `${datePart} • ${timePart}`;
  } catch { return String(val); }
}


function setEl(id, value) {
  const el = document.getElementById(id);
  if (el) el.textContent = value;
}

function escHtml(str) {
  if (str == null) return '';
  return String(str)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}
