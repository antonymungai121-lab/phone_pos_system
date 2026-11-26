/**
 * dashboard.js — Role-aware dashboard KPIs, branch sections, and history modal.
 *
 * ADMIN   : Sees all branches; each branch has its own 4-KPI row.
 * MANAGER : Sees assigned branch 4-KPI row (all cashiers' data).
 * CASHIER : Sees assigned branch 4-KPI row (own revenue only).
 *
 * Clicking a KPI card redirects with query params so the target page
 * (inventory.html / reports.html) auto-applies the right filter.
 *
 * "History" button opens a modal with Daily / Weekly / Monthly tabs.
 */

'use strict';

// ── State ──────────────────────────────────────────────────────────────────────
let _dashStats   = [];   // raw stats from /dashboard/stats
let _allSales    = [];   // raw sales for history modal (fetched lazily)
let _allShops    = [];   // raw shops list (for history branch filter)
let _currentPeriod = 'day'; // period for the history modal currently shown
let _histPeriod  = 'day';

// ── Boot ──────────────────────────────────────────────────────────────────────
document.addEventListener('DOMContentLoaded', async () => {
  await loadDashboard();
  wirePeriodButtons();
  wireHistoryModal();
});

// ── Load dashboard ────────────────────────────────────────────────────────────
async function loadDashboard() {
  try {
    _dashStats = await api.getDashboardStats();
    renderBranches(_dashStats);
  } catch (err) {
    document.getElementById('dashboardContent').innerHTML =
      `<p class="no-data" style="text-align:center;padding:40px;">
         <i class="fa-solid fa-triangle-exclamation"></i>
         Failed to load dashboard: ${err.message}
       </p>`;
    console.error('Dashboard load error:', err);
  }
}

// ── Render all branch sections ────────────────────────────────────────────────
function renderBranches(stats) {
  const container = document.getElementById('dashboardContent');
  const { role } = getSession();

  if (!stats || !stats.length) {
    container.innerHTML = '<p class="no-data" style="text-align:center;padding:40px;">No branch data available.</p>';
    return;
  }

  container.innerHTML = stats.map((branch, idx) => `
    ${idx > 0 ? '<hr class="branch-divider">' : ''}
    <section class="branch-section" data-shop-id="${branch.shop_id}">
      <div class="branch-header">
        <i class="fa-solid fa-store" style="color:var(--clr-accent)"></i>
        <div>
          <div class="branch-title">${branch.shop_name}</div>
          ${branch.shop_location ? `<div class="branch-location"><i class="fa-solid fa-location-dot"></i> ${branch.shop_location}</div>` : ''}
        </div>
      </div>

      <!-- 4 KPI cards -->
      <div class="kpi-grid-branch">

        <!-- Total Inventory -->
        <div class="kpi-card glass kpi-inventory"
             title="Click to view full inventory for this branch"
             onclick="gotoInventory(${branch.shop_id})">
          <span class="kpi-icon"><i class="fa-solid fa-boxes-stacked"></i></span>
          <span class="kpi-value">${branch.total_inventory.toLocaleString()}</span>
          <span class="kpi-label">Total Inventory</span>
          <span class="kpi-hint">Click to view &rarr;</span>
        </div>

        <!-- Available Inventory -->
        <div class="kpi-card glass kpi-available"
             title="Click to view available stock for this branch"
             onclick="gotoAvailable(${branch.shop_id})">
          <span class="kpi-icon"><i class="fa-solid fa-circle-check"></i></span>
          <span class="kpi-value">${branch.available_inventory.toLocaleString()}</span>
          <span class="kpi-label">Available</span>
          <span class="kpi-hint">Click to filter &rarr;</span>
        </div>

        <!-- Sold Items -->
        <div class="kpi-card glass kpi-sold"
             title="Click to view sold items for this branch"
             onclick="gotoSold(${branch.shop_id})">
          <span class="kpi-icon"><i class="fa-solid fa-cart-flatbed"></i></span>
          <span class="kpi-value">${branch.sold_inventory.toLocaleString()}</span>
          <span class="kpi-label">Sold Items</span>
          <span class="kpi-hint">Click to view &rarr;</span>
        </div>

        <!-- Revenue -->
        <div class="kpi-card glass kpi-revenue"
             title="Click to view revenue report for this branch"
             onclick="gotoRevenue(${branch.shop_id})">
          <span class="kpi-icon"><i class="fa-solid fa-money-bill-trend-up"></i></span>
          <span class="kpi-value revenue-val">${fmtKES(branch.today_revenue)}</span>
          <span class="kpi-label">Today's Revenue</span>
          <span class="kpi-hint">Click for report &rarr;</span>
        </div>
      </div>

      <!-- Sold Today mini table -->
      ${renderSoldTodayTable(branch)}
    </section>
  `).join('');
}

// ── Sold-today mini table ─────────────────────────────────────────────────────
function renderSoldTodayTable(branch) {
  const { role } = getSession();
  if (!branch.sold_today || !branch.sold_today.length) {
    return `<p class="no-data" style="margin-top:8px;">
              <i class="fa-regular fa-circle-xmark"></i> No sales today for this branch.
            </p>`;
  }

  const rows = branch.sold_today.map(s => {
    const detailSuffix = s.product_details ? ` (${s.product_details})` : '';
    const itemLabel = (s.product_brand && s.product_model)
      ? `${s.product_brand} ${s.product_model}${detailSuffix}`
      : `Item #${s.imei_item_id}`;
    const rcpNo = s.receipt_number || `RCP-${String(s.id).padStart(6, '0')}`;
    const safeSale = encodeURIComponent(JSON.stringify(s));

    return `
      <tr>
        <td class="mono font-semibold" style="color:var(--clr-accent)">${rcpNo}</td>
        <td><strong>${itemLabel}</strong></td>
        <td class="mono font-xs">${s.imei_number || '—'}</td>
        <td><span class="badge badge-info">${s.cashier_name || `#${s.cashier_id}`}</span></td>
        <td class="amount-cell">${fmtKES(s.sale_price)}</td>
        <td><span class="badge badge-${s.payment_method}">${s.payment_method}</span></td>
        <td>${fmtDateTime(s.sold_at)}</td>
        <td>
          <button class="btn btn-ghost btn-sm" onclick="openDashReceipt('${safeSale}')" title="View & Print Receipt">
            <i class="fa-solid fa-receipt"></i> Receipt
          </button>
        </td>
      </tr>`;
  }).join('');

  return `
    <div class="card glass" style="margin-top:14px">
      <div class="card-header">
        <h2 class="card-title" style="font-size:.9rem">
          <i class="fa-solid fa-receipt"></i> Sold Today — ${branch.shop_name}
        </h2>
        <button class="btn btn-ghost btn-sm" onclick="gotoSold(${branch.shop_id})">
          View All &rarr;
        </button>
      </div>
      <div class="table-wrap sold-mini-wrap">
        <table class="data-table">
          <thead>
            <tr>
              <th>Receipt #</th>
              <th>Product / Item</th>
              <th>IMEI / Serial</th>
              <th>Cashier</th>
              <th>Amount</th>
              <th>Payment</th>
              <th>Time</th>
              <th>Receipt</th>
            </tr>
          </thead>
          <tbody>${rows}</tbody>
        </table>
      </div>
    </div>`;
}

// ── KPI click handlers — navigate with query params ───────────────────────────
function gotoInventory(shopId) {
  window.location.href = `inventory.html?shop_id=${shopId}`;
}
function gotoAvailable(shopId) {
  window.location.href = `inventory.html?shop_id=${shopId}&status=Available`;
}
function gotoSold(shopId) {
  window.location.href = `inventory.html?shop_id=${shopId}&status=Sold`;
}
function gotoRevenue(shopId) {
  window.location.href = `reports.html?shop_id=${shopId}&period=day`;
}

// Expose for inline onclick
window.gotoInventory = gotoInventory;
window.gotoAvailable = gotoAvailable;
window.gotoSold      = gotoSold;
window.gotoRevenue   = gotoRevenue;

// ── Period buttons (Today / This Week / This Month) ───────────────────────────
function wirePeriodButtons() {
  document.querySelectorAll('.period-btn').forEach(btn => {
    btn.addEventListener('click', () => {
      document.querySelectorAll('.period-btn').forEach(b => b.classList.remove('active'));
      btn.classList.add('active');
      _currentPeriod = btn.dataset.period;
      // Re-fetch with period context (revenue in KPI is always "today" from backend;
      // period controls the history modal default and future period-aware KPIs)
      openHistoryWithPeriod(_currentPeriod);
    });
  });
}

// ── History Modal ─────────────────────────────────────────────────────────────
function wireHistoryModal() {
  const { role } = getSession();

  document.getElementById('openHistoryBtn').addEventListener('click', () => {
    openHistoryModal('day');
  });

  // Modal close
  document.getElementById('historyModal').addEventListener('click', e => {
    if (e.target === document.getElementById('historyModal'))
      document.getElementById('historyModal').classList.add('hidden');
  });
  document.querySelector('[data-close="historyModal"]').addEventListener('click', () => {
    document.getElementById('historyModal').classList.add('hidden');
  });

  // Period tabs inside modal
  document.querySelectorAll('.hist-tab').forEach(tab => {
    tab.addEventListener('click', () => {
      document.querySelectorAll('.hist-tab').forEach(t => t.classList.remove('active'));
      tab.classList.add('active');
      _histPeriod = tab.dataset.histPeriod;
      loadHistoryData();
    });
  });

  // Admin branch filter
  if (role === 'admin') {
    document.getElementById('histBranchFilterWrap').style.display = 'block';
    // Populate branch dropdown
    api.getShops().then(shops => {
      _allShops = shops;
      const sel = document.getElementById('histBranchSelect');
      shops.forEach(s => {
        const opt = document.createElement('option');
        opt.value = s.id;
        opt.textContent = s.name;
        sel.appendChild(opt);
      });
    }).catch(() => {});

    document.getElementById('histBranchSelect').addEventListener('change', loadHistoryData);
  }
}

function openHistoryModal(period = 'day') {
  _histPeriod = period;
  document.querySelectorAll('.hist-tab').forEach(t => {
    t.classList.toggle('active', t.dataset.histPeriod === period);
  });
  document.getElementById('historyModal').classList.remove('hidden');
  loadHistoryData();
}

function openHistoryWithPeriod(period) {
  openHistoryModal(period);
}

async function loadHistoryData() {
  const { role } = getSession();
  const tbody = document.getElementById('historyTbody');
  tbody.innerHTML = '<tr><td colspan="7" class="table-empty"><i class="fa-solid fa-spinner fa-spin"></i> Loading&hellip;</td></tr>';

  try {
    const params = { period: _histPeriod };

    if (role === 'admin') {
      const selShop = document.getElementById('histBranchSelect')?.value;
      if (selShop) params.shop_id = selShop;
    }
    // Cashier: backend restricts to own sales automatically

    const sales = await api.getSalesHistory(params);
    renderHistoryTable(sales);
  } catch (err) {
    tbody.innerHTML = `<tr><td colspan="7" class="table-empty">Error: ${err.message}</td></tr>`;
  }
}

function renderHistoryTable(sales) {
  const tbody = document.getElementById('historyTbody');

  // Summary KPIs
  const totalRev = sales.reduce((s, x) => s + parseFloat(x.sale_price || 0), 0);
  document.getElementById('histTotalSales').textContent   = sales.length.toLocaleString();
  document.getElementById('histTotalRevenue').textContent = fmtKES(totalRev);

  if (!sales.length) {
    tbody.innerHTML = '<tr><td colspan="9" class="table-empty">No sales records for this period.</td></tr>';
    return;
  }

  // Build a cashier_id → name map from cached stats
  const cashierMap = {};
  _dashStats.forEach(branch => {
    (branch.sold_today || []).forEach(s => {
      cashierMap[s.cashier_id] = s.cashier_name;
    });
  });

  // Build shop_id → name map
  const shopMap = {};
  (_allShops.length ? _allShops : _dashStats).forEach(x => {
    if (x.shop_id !== undefined) shopMap[x.shop_id] = x.shop_name;
    if (x.id !== undefined)      shopMap[x.id]      = x.name;
  });

  tbody.innerHTML = sales.map(s => {
    const itemLabel = (s.product_brand && s.product_model)
      ? `${s.product_brand} ${s.product_model}`
      : `Item #${s.imei_item_id}`;
    const rcpNo = s.receipt_number || `RCP-${String(s.id).padStart(6, '0')}`;
    const cashierName = s.cashier_name || cashierMap[s.cashier_id] || `#${s.cashier_id}`;
    const branchName  = s.shop_name || shopMap[s.shop_id] || `#${s.shop_id}`;
    const safeSale = encodeURIComponent(JSON.stringify({ ...s, cashier_name: cashierName, shop_name: branchName }));

    return `
      <tr>
        <td class="mono font-semibold" style="color:var(--clr-accent)">${rcpNo}</td>
        <td><strong>${itemLabel}</strong></td>
        <td class="mono font-xs">${s.imei_number || '—'}</td>
        <td><span class="badge badge-info">${cashierName}</span></td>
        <td>${branchName}</td>
        <td class="amount-cell">${fmtKES(s.sale_price)}</td>
        <td><span class="badge badge-${s.payment_method}">${s.payment_method}</span></td>
        <td>${fmtDateTime(s.sold_at)}</td>
        <td>
          <button class="btn btn-ghost btn-sm" onclick="openDashReceipt('${safeSale}')" title="View & Print Receipt">
            <i class="fa-solid fa-receipt"></i> Receipt
          </button>
        </td>
      </tr>`;
  }).join('');
}

// ── Open Dashboard Receipt Modal ──────────────────────────────────────────────
function openDashReceipt(encodedSaleJson) {
  try {
    const s = JSON.parse(decodeURIComponent(encodedSaleJson));
    const now = s.sold_at ? new Date(s.sold_at) : new Date();

    const shopName = s.shop_name || getSession().shopName || 'PhonePOS';
    document.getElementById('dmShopName').textContent = shopName;
    document.getElementById('dmShopLocation').textContent = s.shop_location || '';
    document.getElementById('dmDateTime').textContent = now.toLocaleString('en-KE', {
      dateStyle: 'medium', timeStyle: 'short',
    });

    document.getElementById('dmReceiptNo').textContent = s.receipt_number || `RCP-${String(s.id).padStart(6, '0')}`;
    const detailSuffix = s.product_details ? ` (${s.product_details})` : '';
    document.getElementById('dmItem').textContent = (s.product_brand && s.product_model)
      ? `${s.product_brand} ${s.product_model}${detailSuffix}`
      : `Item #${s.imei_item_id}`;

    const cat = s.product_category || 'General';
    document.getElementById('dmCategory').textContent = cat.charAt(0).toUpperCase() + cat.slice(1);
    document.getElementById('dmImei').textContent = s.imei_number || '—';
    document.getElementById('dmCashier').textContent = s.cashier_name || 'Staff';
    document.getElementById('dmPayment').textContent = (s.payment_method || 'CASH').toUpperCase();
    document.getElementById('dmAmount').textContent = fmtKES(s.sale_price || 0);

    document.getElementById('dashReceiptModal').classList.remove('hidden');
  } catch (err) {
    console.error('Error opening receipt:', err);
  }
}
window.openDashReceipt = openDashReceipt;

// Wire Print button inside Dash Receipt modal
document.addEventListener('DOMContentLoaded', () => {
  document.getElementById('dmPrintBtn')?.addEventListener('click', () => window.print());
});

// ── Extend getSession to include userId ───────────────────────────────────────
const _origGetSession = window.getSession;
window.getSession = function () {
  const s = _origGetSession();
  s.userId = parseInt(sessionStorage.getItem('pos_user_id'), 10) || null;
  return s;
};
