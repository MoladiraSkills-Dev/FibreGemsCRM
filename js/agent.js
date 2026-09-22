/**
 * FibreGems CRM — Agent Page Logic
 * Handles worklist, lead capture, quick edit, and duplicate detection.
 */

// ── State ────────────────────────────────────────────────────
let currentView = 'worklist';
let worklistOffset = 0;
const WORKLIST_LIMIT = 20;
let worklistTotal = 0;

// ── Initialization ───────────────────────────────────────────

document.addEventListener('DOMContentLoaded', () => {
  if (!requireAuth()) return;
  
  // Set agent name in header
  document.getElementById('agent-name').textContent = session.name || 'Agent';
  document.getElementById('agent-role').textContent = session.role || 'Agent';
  
  // Load initial view
  loadWorklist();
});

// ── View Switching ───────────────────────────────────────────

function switchView(view) {
  currentView = view;
  
  // Update nav active states
  document.querySelectorAll('[data-nav]').forEach(el => {
    el.classList.remove('bg-fiber-500/20', 'text-fiber-300', 'border-fiber-500');
    el.classList.add('text-gray-400', 'hover:text-white', 'hover:bg-white/5');
  });
  const activeNav = document.querySelector(`[data-nav="${view}"]`);
  if (activeNav) {
    activeNav.classList.add('bg-fiber-500/20', 'text-fiber-300', 'border-fiber-500');
    activeNav.classList.remove('text-gray-400', 'hover:text-white', 'hover:bg-white/5');
  }
  
  // Toggle views
  document.getElementById('view-worklist').classList.toggle('hidden', view !== 'worklist');
  document.getElementById('view-newlead').classList.toggle('hidden', view !== 'newlead');
  
  if (view === 'worklist') loadWorklist();
}

// ── Worklist ─────────────────────────────────────────────────

async function loadWorklist() {
  const tbody = document.getElementById('worklist-body');
  const countEl = document.getElementById('worklist-count');
  
  tbody.innerHTML = `
    <tr><td colspan="6" class="px-6 py-12 text-center">
      <div class="spinner mx-auto mb-3"></div>
      <p class="text-gray-500 text-sm">Loading worklist...</p>
    </td></tr>`;
  
  try {
    const result = await callBackend('getAgentWorklist', { offset: worklistOffset, limit: WORKLIST_LIMIT });
    worklistTotal = result.total;
    countEl.textContent = `${result.total} customer${result.total !== 1 ? 's' : ''}`;
    
    if (result.data.length === 0) {
      tbody.innerHTML = `
        <tr><td colspan="6" class="px-6 py-16 text-center">
          <svg class="w-16 h-16 text-gray-700 mx-auto mb-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="1">
            <path stroke-linecap="round" stroke-linejoin="round" d="M20 13V6a2 2 0 00-2-2H6a2 2 0 00-2 2v7m16 0v5a2 2 0 01-2 2H6a2 2 0 01-2-2v-5m16 0h-2.586a1 1 0 00-.707.293l-2.414 2.414a1 1 0 01-.707.293h-3.172a1 1 0 01-.707-.293l-2.414-2.414A1 1 0 006.586 13H4" />
          </svg>
          <p class="text-gray-500 font-medium">No customers yet</p>
          <p class="text-gray-600 text-sm mt-1">Capture your first lead to get started</p>
          <button onclick="switchView('newlead')" class="mt-4 px-4 py-2 bg-fiber-500 text-white rounded-lg text-sm font-medium hover:bg-fiber-600 transition-colors">
            + New Lead
          </button>
        </td></tr>`;
      updatePagination();
      return;
    }
    
    tbody.innerHTML = result.data.map(c => `
      <tr class="border-b border-white/5 hover:bg-white/[0.03] transition-colors group">
        <td class="px-4 py-3.5">
          <p class="font-medium text-white text-sm">${escHtml(c.name)}</p>
          <p class="text-xs text-gray-500 mt-0.5">${escHtml(c.customerId)}</p>
        </td>
        <td class="px-4 py-3.5 text-sm text-gray-300">${escHtml(c.package || '—')}</td>
        <td class="px-4 py-3.5">${statusBadge(c.status)}</td>
        <td class="px-4 py-3.5 text-sm text-gray-300">${escHtml(c.nextAction || '—')}</td>
        <td class="px-4 py-3.5 text-sm text-gray-400">${escHtml(c.nextActionDate || '—')}</td>
        <td class="px-4 py-3.5">
          <button onclick="openQuickEdit('${escHtml(c.customerId)}', '${escJs(c.name)}', '${escJs(c.package || '')}', '${escJs(c.status || '')}', '${escJs(c.nextAction || '')}', '${escJs(c.nextActionDate || '')}')"
            class="opacity-0 group-hover:opacity-100 px-3 py-1.5 bg-fiber-500/10 text-fiber-400 rounded-lg text-xs font-medium hover:bg-fiber-500/20 transition-all">
            Edit
          </button>
        </td>
      </tr>
    `).join('');
    
    updatePagination();
  } catch (err) {
    tbody.innerHTML = `
      <tr><td colspan="6" class="px-6 py-12 text-center text-red-400">
        <p class="font-medium">Failed to load worklist</p>
        <p class="text-sm text-red-500/70 mt-1">${escHtml(err.message)}</p>
        <button onclick="loadWorklist()" class="mt-3 text-sm text-fiber-400 hover:underline">Retry</button>
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
      class="px-3 py-1.5 rounded-lg text-sm ${currentPage === 1 ? 'text-gray-600 cursor-not-allowed' : 'text-gray-400 hover:bg-white/5'}">
      ← Prev
    </button>
    <span class="text-sm text-gray-500">Page ${currentPage} of ${totalPages}</span>
    <button onclick="goPage(${currentPage + 1})" ${currentPage === totalPages ? 'disabled' : ''} 
      class="px-3 py-1.5 rounded-lg text-sm ${currentPage === totalPages ? 'text-gray-600 cursor-not-allowed' : 'text-gray-400 hover:bg-white/5'}">
      Next →
    </button>
  `;
}

function goPage(page) {
  worklistOffset = (page - 1) * WORKLIST_LIMIT;
  loadWorklist();
}

// ── Quick Edit Modal ─────────────────────────────────────────

function openQuickEdit(customerId, name, pkg, status, nextAction, nextActionDate) {
  document.getElementById('qe-customer-id').value = customerId;
  document.getElementById('qe-customer-name').textContent = name;
  document.getElementById('qe-package').value = pkg;
  document.getElementById('qe-status').value = status;
  document.getElementById('qe-next-action').value = nextAction;
  document.getElementById('qe-next-action-date').value = nextActionDate;
  show('modal-quick-edit');
}

function closeQuickEdit() {
  hide('modal-quick-edit');
}

async function submitQuickEdit() {
  const customerId = document.getElementById('qe-customer-id').value;
  const data = {
    package: document.getElementById('qe-package').value,
    status: document.getElementById('qe-status').value,
    nextAction: document.getElementById('qe-next-action').value,
    nextActionDate: document.getElementById('qe-next-action-date').value
  };
  
  const btn = document.getElementById('qe-submit-btn');
  btn.disabled = true;
  btn.textContent = 'Saving...';
  
  try {
    await callBackend('quickUpdateSalesData', { customerId, data });
    closeQuickEdit();
    showToast('Customer updated successfully!', 'success');
    loadWorklist();
  } catch (err) {
    showToast(err.message, 'error');
  } finally {
    btn.disabled = false;
    btn.textContent = 'Save Changes';
  }
}

// ── New Lead Form ────────────────────────────────────────────

async function submitLead(overrideId = null) {
  const form = document.getElementById('lead-form');
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
    orderDate: document.getElementById('nf-order-date').value,
    customerStatus: document.getElementById('nf-status').value,
    nextAction: document.getElementById('nf-next-action').value,
    nextActionDate: document.getElementById('nf-next-action-date').value,
    promisedPaymentDate: document.getElementById('nf-promised-pay-date').value,
    lastContactOutcome: document.getElementById('nf-outcome').value
  };
  
  if (!formData.firstName || !formData.surname || !formData.cellNumber) {
    showToast('First name, surname, and cell number are required.', 'warning');
    return;
  }
  
  const btn = document.getElementById('lead-submit-btn');
  btn.disabled = true;
  btn.innerHTML = '<div class="spinner-sm mx-auto"></div>';
  
  try {
    const result = await callBackend('handleAgentLeadUpdate', {
      existingIdOverride: overrideId,
      formData: formData
    });
    
    // Check for duplicate soft warning
    if (result.duplicateAlert) {
      btn.disabled = false;
      btn.textContent = 'Capture Lead';
      showDuplicateWarning(result.existingId, result.existingName);
      return;
    }
    
    showToast(`Lead ${overrideId ? 'updated' : 'captured'} successfully! ID: ${result.customerId}`, 'success');
    form.reset();
    switchView('worklist');
  } catch (err) {
    showToast(err.message, 'error');
  } finally {
    btn.disabled = false;
    btn.textContent = 'Capture Lead';
  }
}

// ── Duplicate Detection Modal ────────────────────────────────

function showDuplicateWarning(existingId, existingName) {
  document.getElementById('dup-name').textContent = existingName;
  document.getElementById('dup-id').textContent = existingId;
  document.getElementById('dup-override-btn').onclick = () => {
    hide('modal-duplicate');
    submitLead(existingId);
  };
  show('modal-duplicate');
}

function closeDuplicate() {
  hide('modal-duplicate');
}

// ── Utilities ────────────────────────────────────────────────

function statusBadge(status) {
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

function escHtml(str) {
  const div = document.createElement('div');
  div.textContent = str || '';
  return div.innerHTML;
}

function escJs(str) {
  return (str || '').replace(/'/g, "\\'").replace(/"/g, '\\"');
}
