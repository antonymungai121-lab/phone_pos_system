/**
 * inventory.js — Branch-aware inventory view with status and category filters.
 *
 * URL params accepted from dashboard:
 *   ?shop_id=X        → pre-select branch
 *   ?status=Available → pre-select status filter
 *   ?status=Sold      → pre-select Sold filter
 */
'use strict';

let _allInventory = [];   // raw items from API (all for selected branch)
let _products     = [];   // flat products list for name lookups
let _shops        = [];
let _selectedShopId = null;
let _statusFilter   = '';
let _catFilter      = '';
let _searchQ        = '';
let _sortMode       = 'recent';  // recent | oldest | brand-az | brand-za | status

const SORT_MODES = [
  { key: 'recent',   label: 'Newest First',   icon: 'fa-arrow-down-wide-short' },
  { key: 'oldest',   label: 'Oldest First',   icon: 'fa-arrow-up-wide-short' },
  { key: 'brand-az', label: 'Brand A → Z',    icon: 'fa-arrow-down-a-z' },
  { key: 'brand-za', label: 'Brand Z → A',    icon: 'fa-arrow-up-z-a' },
  { key: 'status',   label: 'By Status',      icon: 'fa-filter' },
];

function sortItems(items) {
  const getProd = i => _products.find(p => p.id === i.product_id);
  switch (_sortMode) {
    case 'recent':
      return items.sort((a, b) => new Date(b.date_sold || b.date_added) - new Date(a.date_sold || a.date_added));
    case 'oldest':
      return items.sort((a, b) => new Date(a.date_sold || a.date_added) - new Date(b.date_sold || b.date_added));
    case 'brand-az':
      return items.sort((a, b) => {
        const pa = getProd(a), pb = getProd(b);
        return ((pa?.brand||'')+(pa?.model||'')).localeCompare((pb?.brand||'')+(pb?.model||''));
      });
    case 'brand-za':
      return items.sort((a, b) => {
        const pa = getProd(a), pb = getProd(b);
        return ((pb?.brand||'')+(pb?.model||'')).localeCompare((pa?.brand||'')+(pa?.model||''));
      });
    case 'status':
      return items.sort((a, b) => a.status.localeCompare(b.status));
    default: return items;
  }
}

document.addEventListener('DOMContentLoaded', async () => {
  const { role, shopId } = getSession();

  // Load metadata
  try {
    [_products, _shops] = await Promise.all([api.getProducts(), api.getShops()]);
  } catch { /* non-critical */ }

  // Admin: show branch selector
  if (role === 'admin') {
    renderBranchPills();
    document.getElementById('branchSelectorRow').style.display = 'flex';
  }

  // Read URL params
  const params = new URLSearchParams(window.location.search);
  const urlShop   = params.get('shop_id');
  const urlStatus = params.get('status');

  if (urlStatus) _statusFilter = urlStatus;
  if (urlShop)   _selectedShopId = parseInt(urlShop, 10);

  // Sync status tab UI
  if (_statusFilter) {
    document.querySelectorAll('.status-tab').forEach(t =>
      t.classList.toggle('active', t.dataset.status === _statusFilter));
  }
  // Sync branch pill UI
  if (_selectedShopId) {
    setTimeout(() => syncBranchPill(_selectedShopId), 50);
  }

  await loadInventory();
  wireFilters();
});

// ── Branch pills (admin) ──────────────────────────────────────────────────────
function renderBranchPills() {
  const container = document.getElementById('branchPills');
  const all = document.createElement('button');
  all.className = 'branch-pill' + (_selectedShopId ? '' : ' active');
  all.textContent = 'All Branches';
  all.dataset.shopId = '';
  all.addEventListener('click', () => selectBranch(null));
  container.appendChild(all);

  _shops.forEach(s => {
    const btn = document.createElement('button');
    btn.className = 'branch-pill' + (s.id === _selectedShopId ? ' active' : '');
    btn.textContent = s.name;
    btn.dataset.shopId = s.id;
    btn.addEventListener('click', () => selectBranch(s.id));
    container.appendChild(btn);
  });
}

function syncBranchPill(shopId) {
  document.querySelectorAll('.branch-pill').forEach(p => {
    p.classList.toggle('active', parseInt(p.dataset.shopId, 10) === shopId || (!shopId && !p.dataset.shopId));
  });
}

async function selectBranch(shopId) {
  _selectedShopId = shopId;
  syncBranchPill(shopId);
  // Update shop badge
  const badge = document.getElementById('shopBadge');
  if (badge) {
    const shop = _shops.find(s => s.id === shopId);
    badge.textContent = shop ? shop.name : (shopId ? `Branch #${shopId}` : 'All Branches');
  }
  await loadInventory();
}

// ── Load inventory ────────────────────────────────────────────────────────────
async function loadInventory() {
  const { role, shopId } = getSession();
  const tbody = document.getElementById('inventoryTbody');
  tbody.innerHTML = '<tr><td colspan="9" class="table-empty"><i class="fa-solid fa-spinner fa-spin"></i> Loading&hellip;</td></tr>';

  try {
    const params = {};
    if (_selectedShopId) params.shop_id = _selectedShopId;
    _allInventory = await api.getInventory(params);
    applyFilters();
  } catch (err) {
    tbody.innerHTML = `<tr><td colspan="9" class="table-empty">Error: ${err.message}</td></tr>`;
  }
}

// ── Filter and render ─────────────────────────────────────────────────────────
function applyFilters() {
  let items = [..._allInventory];

  // Status filter
  if (_statusFilter) items = items.filter(i => i.status === _statusFilter);

  // Category filter
  if (_catFilter) {
    items = items.filter(i => {
      const p = _products.find(p => p.id === i.product_id);
      return p && p.category === _catFilter;
    });
  }

  // Search
  if (_searchQ) {
    items = items.filter(i => {
      const p = _products.find(p => p.id === i.product_id);
      const name = p ? `${p.brand} ${p.model}`.toLowerCase() : '';
      return i.imei_number.toLowerCase().includes(_searchQ) || name.includes(_searchQ);
    });
  }

  items = sortItems(items);
  renderKPIs(items);
  renderTable(items);
  renderSortBar();
}

function renderKPIs(items) {
  const avail = items.filter(i => i.status === 'Available').length;
  const sold  = items.filter(i => i.status === 'Sold').length;
  document.getElementById('kmiTotal').textContent = items.length.toLocaleString();
  document.getElementById('kmiAvail').textContent = avail.toLocaleString();
  document.getElementById('kmiSold').textContent  = sold.toLocaleString();

  // Update table title
  const statusLabel = _statusFilter ? ` — ${_statusFilter}` : '';
  const catLabel    = _catFilter ? ` (${_catFilter === 'phone' ? 'Phones' : 'Accessories'})` : '';
  document.getElementById('invTableTitle').textContent = `Inventory${statusLabel}${catLabel}`;
  document.getElementById('invResultCount').textContent = `${items.length} item${items.length !== 1 ? 's' : ''}`;
}

function renderTable(items) {
  const tbody = document.getElementById('inventoryTbody');
  if (!items.length) {
    tbody.innerHTML = '<tr><td colspan="9" class="table-empty">No items match the current filter.</td></tr>';
    return;
  }

  tbody.innerHTML = items.map((item, idx) => {
    const prod  = _products.find(p => p.id === item.product_id);
    const brand = prod ? prod.brand : '—';
    const model = prod ? prod.model : `Product #${item.product_id}`;
    const cat   = prod ? prod.category : '—';
    const shop  = _shops.find(s => s.id === item.shop_id);

    return `
      <tr>
        <td>${idx + 1}</td>
        <td class="mono">${item.imei_number}</td>
        <td>${brand}</td>
        <td>${model}</td>
        <td>
          <span class="badge badge-${cat === 'phone' ? 'mpesa' : 'card'}" style="font-size:.7rem">
            ${cat === 'phone' ? '📱 Phone' : '🔌 Accessory'}
          </span>
        </td>
        <td>${shop ? shop.name : `#${item.shop_id}`}</td>
        <td><span class="badge badge-${item.status.toLowerCase()}">${item.status}</span></td>
        <td>${fmtDateTime(item.date_added)}</td>
        <td>${item.date_sold ? fmtDateTime(item.date_sold) : '—'}</td>
      </tr>`;
  }).join('');
}

// ── Wire filter controls ──────────────────────────────────────────────────────
function wireFilters() {
  // Status tabs
  document.querySelectorAll('.status-tab').forEach(tab => {
    tab.addEventListener('click', () => {
      document.querySelectorAll('.status-tab').forEach(t => t.classList.remove('active'));
      tab.classList.add('active');
      _statusFilter = tab.dataset.status;
      applyFilters();
    });
  });

  // Category pills
  document.querySelectorAll('.cat-pill').forEach(pill => {
    pill.addEventListener('click', () => {
      document.querySelectorAll('.cat-pill').forEach(p => p.classList.remove('active'));
      pill.classList.add('active');
      _catFilter = pill.dataset.cat;
      applyFilters();
    });
  });

  // Search
  document.getElementById('inventorySearch').addEventListener('input', e => {
    _searchQ = e.target.value.toLowerCase();
    applyFilters();
  });
}

function renderSortBar() {
  const old = document.getElementById('invSortBar');
  if (old) old.remove();
  const bar = document.createElement('div');
  bar.id = 'invSortBar';
  bar.style.cssText = 'display:flex;align-items:center;gap:8px;justify-content:flex-end;padding:12px 0 4px;flex-wrap:wrap;';
  const label = document.createElement('span');
  label.style.cssText = 'font-size:.78rem;color:var(--txt-muted);';
  label.textContent = 'Sort:';
  bar.appendChild(label);
  SORT_MODES.forEach(mode => {
    const btn = document.createElement('button');
    btn.className = 'status-tab' + (mode.key === _sortMode ? ' active' : '');
    btn.style.cssText = 'font-size:.75rem;padding:5px 12px;';
    btn.innerHTML = `<i class="fa-solid ${mode.icon}"></i> ${mode.label}`;
    btn.addEventListener('click', () => { _sortMode = mode.key; applyFilters(); });
    bar.appendChild(btn);
  });
  const tableCard = document.querySelector('.table-wrap')?.closest('.card');
  if (tableCard) tableCard.after(bar);
}
