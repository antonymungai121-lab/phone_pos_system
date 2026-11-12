/**
 * reports.js — Full reports page controller for PhonePOS.
 *
 * Tabs & role visibility:
 *   Daily Summary     — all roles
 *   Staff Performance — all roles (cashier sees only own data)
 *   Top Products      — admin + manager
 *   Peak Hours        — admin + manager
 *   Inventory Alerts  — admin + manager
 *   Reconciliation    — admin only
 *
 * Period state is kept per-tab so switching tabs preserves selections.
 */

// ── State ─────────────────────────────────────────────────────────────────────
const state = {
  role:      '',
  shopId:    null,
  shops:     [],

  daily:    { period: 'day',   date: '',   shopId: '' },
  staff:    { period: 'day',   from: '',   to: '', shopId: '' },
  products: { period: 'month', shopId: '' },
  hours:    { period: 'month', shopId: '' },
  alerts:   { shopId: '' },
  recon:    { period: 'day',   date: '',   shopId: '' },
};

// ── Boot ──────────────────────────────────────────────────────────────────────
document.addEventListener('DOMContentLoaded', async () => {
  const session = getSession();
  state.role   = session.role;
  state.shopId = session.shopId;

  applyRoleVisibility();
  setupTabs();
  await loadShops();
  setupControls();

  // Load the first visible tab
  loadTab('daily');
});

// ── Role visibility ───────────────────────────────────────────────────────────
function applyRoleVisibility() {
  const { role } = state;

  // Hide tabs the current role cannot see
  document.querySelectorAll('.report-tab').forEach(btn => {
    const isAdminOnly    = btn.classList.contains('admin-only') && !btn.classList.contains('manager-only');
    const isManagerPlus  = btn.classList.contains('manager-only');   // also has admin-only class

    if (isAdminOnly && role !== 'admin') btn.style.display = 'none';
    if (isManagerPlus && role === 'cashier') btn.style.display = 'none';
  });

  // Show branch selectors for admin only
  if (role === 'admin') {
    document.querySelectorAll('.admin-only').forEach(el => el.style.display = '');
  }
}

// ── Tab switching ─────────────────────────────────────────────────────────────
function setupTabs() {
  document.querySelectorAll('.report-tab').forEach(btn => {
    btn.addEventListener('click', () => {
      document.querySelectorAll('.report-tab').forEach(b => b.classList.remove('active'));
      document.querySelectorAll('.tab-panel').forEach(p => p.classList.remove('active'));
      btn.classList.add('active');
      const id = 'tab-' + btn.dataset.tab;
      document.getElementById(id).classList.add('active');
      loadTab(btn.dataset.tab);
    });
  });
}

function loadTab(tab) {
  switch (tab) {
    case 'daily':    loadDaily();    break;
    case 'staff':    loadStaff();    break;
    case 'products': loadTopProducts(); break;
    case 'hours':    loadPeakHours();   break;
    case 'alerts':   loadAlerts();   break;
    case 'recon':    loadRecon();    break;
  }
}

// ── Load shops for selectors ──────────────────────────────────────────────────
async function loadShops() {
  try {
    state.shops = await api.getShops();
    ['daily', 'staff', 'prod', 'hours', 'alerts', 'recon'].forEach(prefix => {
      const sel = document.getElementById(`${prefix}ShopSel`);
      if (!sel) return;
      state.shops.forEach(s => {
        const o = document.createElement('option');
        o.value = s.id; o.textContent = s.name;
        sel.appendChild(o);
      });
    });
  } catch { /* non-fatal */ }
}

// ── Generic period-button wiring ──────────────────────────────────────────────
function wirePeriodBtns(container, stateObj, onLoad) {
  container.querySelectorAll('.period-btn').forEach(btn => {
    btn.addEventListener('click', () => {
      container.querySelectorAll('.period-btn').forEach(b => b.classList.remove('active'));
      btn.classList.add('active');
      stateObj.period = btn.dataset.period;
      onLoad();
    });
  });
}

// ── Control wiring ────────────────────────────────────────────────────────────
function setupControls() {
  // Daily
  wirePeriodBtns(document.getElementById('tab-daily'), state.daily, loadDaily);
  document.getElementById('dailyDatePick').addEventListener('change', e => {
    state.daily.date = e.target.value;
    loadDaily();
  });
  const dailyShop = document.getElementById('dailyShopSel');
  if (dailyShop) dailyShop.addEventListener('change', e => { state.daily.shopId = e.target.value; loadDaily(); });
  document.getElementById('exportDailyBtn').addEventListener('click', exportDailyCSV);

  // Staff
  wirePeriodBtns(document.getElementById('tab-staff'), state.staff, loadStaff);
  document.getElementById('staffDateFrom').addEventListener('change', e => { state.staff.from = e.target.value; loadStaff(); });
  document.getElementById('staffDateTo').addEventListener('change',   e => { state.staff.to   = e.target.value; loadStaff(); });
  const staffShop = document.getElementById('staffShopSel');
  if (staffShop) staffShop.addEventListener('change', e => { state.staff.shopId = e.target.value; loadStaff(); });
  document.getElementById('exportStaffBtn').addEventListener('click', exportStaffCSV);

  // Top products
  wirePeriodBtns(document.getElementById('tab-products'), state.products, loadTopProducts);
  const prodShop = document.getElementById('prodShopSel');
  if (prodShop) prodShop.addEventListener('change', e => { state.products.shopId = e.target.value; loadTopProducts(); });

  // Peak hours
  wirePeriodBtns(document.getElementById('tab-hours'), state.hours, loadPeakHours);
  const hoursShop = document.getElementById('hoursShopSel');
  if (hoursShop) hoursShop.addEventListener('change', e => { state.hours.shopId = e.target.value; loadPeakHours(); });

  // Alerts
  const alertsShop = document.getElementById('alertsShopSel');
  if (alertsShop) alertsShop.addEventListener('change', e => { state.alerts.shopId = e.target.value; loadAlerts(); });
  document.getElementById('refreshAlertsBtn').addEventListener('click', loadAlerts);

  // Recon
  wirePeriodBtns(document.getElementById('tab-recon'), state.recon, loadRecon);
  document.getElementById('reconDatePick').addEventListener('change', e => { state.recon.date = e.target.value; loadRecon(); });
  const reconShop = document.getElementById('reconShopSel');
  if (reconShop) reconShop.addEventListener('change', e => { state.recon.shopId = e.target.value; loadRecon(); });
  document.getElementById('exportReconBtn').addEventListener('click', exportReconCSV);
}

// ══ TAB 1: Daily Summary ══════════════════════════════════════════════════════
async function loadDaily() {
  const params = { period: state.daily.period };
  if (state.daily.date)   params.date    = state.daily.date;
  if (state.daily.shopId) params.shop_id = state.daily.shopId;

  const cardsEl  = document.getElementById('dailySummaryCards');
  const blocksEl = document.getElementById('dailyBranchBlocks');
  cardsEl.innerHTML  = '<p class="table-empty">Loading…</p>';
  blocksEl.innerHTML = '';

  try {
    const data = await api.getReportDaily(params);

    // Top summary cards
    const avg = data.total_count ? (data.total_gross / data.total_count) : 0;
    cardsEl.innerHTML = `
      <div class="summary-card"><div class="sc-label">Gross Revenue</div>
        <div class="sc-value">${fmtKES(data.total_gross)}</div>
        <div class="sc-sub">${periodLabel(state.daily.period, state.daily.date)}</div></div>
      <div class="summary-card"><div class="sc-label">Total Sales</div>
        <div class="sc-value">${data.total_count}</div>
        <div class="sc-sub">transactions</div></div>
      <div class="summary-card"><div class="sc-label">Avg Sale Value</div>
        <div class="sc-value">${fmtKES(avg)}</div>
        <div class="sc-sub">per transaction</div></div>`;

    // Per-branch blocks
    if (!data.branches.length) {
      blocksEl.innerHTML = '<p class="empty-state">No sales data for this period.</p>';
      return;
    }
    blocksEl.innerHTML = data.branches.map(b => `
      <div class="branch-block">
        <h4><i class="fa-solid fa-store"></i> ${b.shop_name}</h4>
        <div class="summary-row" style="margin-bottom:10px">
          <div class="summary-card">
            <div class="sc-label">Gross Revenue</div>
            <div class="sc-value">${fmtKES(b.gross)}</div></div>
          <div class="summary-card">
            <div class="sc-label">Sales Count</div>
            <div class="sc-value">${b.count}</div></div>
        </div>
        <div class="pay-pills">
          <span class="pay-pill cash">Cash: ${fmtKES(b.cash)}</span>
          <span class="pay-pill mpesa">M-Pesa: ${fmtKES(b.mpesa)}</span>
          <span class="pay-pill card">Card: ${fmtKES(b.card)}</span>
        </div>
      </div>`).join('');
  } catch (err) {
    cardsEl.innerHTML = `<p class="table-empty">Error: ${err.message}</p>`;
  }
}

// ══ TAB 2: Staff Performance ══════════════════════════════════════════════════
async function loadStaff() {
  const params = { period: state.staff.period };
  if (state.staff.from)   params.date_from = state.staff.from;
  if (state.staff.to)     params.date_to   = state.staff.to;
  if (state.staff.shopId) params.shop_id   = state.staff.shopId;

  const el = document.getElementById('staffRows');
  el.innerHTML = '<p class="table-empty">Loading…</p>';

  try {
    const data = await api.getReportStaff(params);
    if (!data.staff.length) {
      el.innerHTML = '<p class="empty-state">No staff data for this period.</p>';
      return;
    }
    el.innerHTML = data.staff.map((s, i) => `
      <div class="staff-card">
        <div>
          <div class="sc-name">${i + 1}. ${s.username}</div>
          <div class="sc-shop">${s.shop_name}</div>
          <div class="pay-pills" style="margin-top:6px">
            <span class="pay-pill cash">Cash: ${fmtKES(s.cash)}</span>
            <span class="pay-pill mpesa">M-Pesa: ${fmtKES(s.mpesa)}</span>
            <span class="pay-pill card">Card: ${fmtKES(s.card)}</span>
          </div>
        </div>
        <div class="staff-stats">
          <div class="staff-stat">
            <div class="val">${fmtKES(s.gross)}</div>
            <div class="lbl">Gross Revenue</div>
          </div>
          <div class="staff-stat">
            <div class="val">${s.count}</div>
            <div class="lbl">Sales</div>
          </div>
          <div class="staff-stat">
            <div class="val">${fmtKES(s.average_sale)}</div>
            <div class="lbl">Avg Sale</div>
          </div>
        </div>
      </div>`).join('');
  } catch (err) {
    el.innerHTML = `<p class="table-empty">Error: ${err.message}</p>`;
  }
}

// ══ TAB 3: Top Products ═══════════════════════════════════════════════════════
async function loadTopProducts() {
  const params = { period: state.products.period };
  if (state.products.shopId) params.shop_id = state.products.shopId;

  const tbody = document.getElementById('topProdTbody');
  tbody.innerHTML = '<tr><td colspan="5" class="table-empty">Loading…</td></tr>';

  try {
    const data = await api.getReportTopProducts(params);
    if (!data.products.length) {
      tbody.innerHTML = '<tr><td colspan="5" class="empty-state">No product sales this period.</td></tr>';
      return;
    }
    tbody.innerHTML = data.products.map((p, i) => `
      <tr>
        <td><span class="rank-badge">${i + 1}</span></td>
        <td><strong>${p.brand}</strong> ${p.model}</td>
        <td><span class="badge badge-info">${p.category}</span></td>
        <td>${p.units_sold}</td>
        <td>${fmtKES(p.revenue)}</td>
      </tr>`).join('');
  } catch (err) {
    tbody.innerHTML = `<tr><td colspan="5" class="table-empty">Error: ${err.message}</td></tr>`;
  }
}

// ══ TAB 4: Peak Hours ════════════════════════════════════════════════════════
async function loadPeakHours() {
  const params = { period: state.hours.period };
  if (state.hours.shopId) params.shop_id = state.hours.shopId;

  const chart = document.getElementById('hoursChart');
  const tbody = document.getElementById('hoursTbody');
  chart.innerHTML = '<span class="table-empty" style="font-size:.8rem">Loading…</span>';
  tbody.innerHTML = '<tr><td colspan="3" class="table-empty">Loading…</td></tr>';

  try {
    const data = await api.getReportPeakHours(params);
    const hours = data.hours;
    const maxCount = Math.max(...hours.map(h => h.count), 1);

    // Bar chart
    chart.innerHTML = hours.map(h => {
      const pct = Math.round((h.count / maxCount) * 100);
      const label = h.hour === 0 ? '12a' : h.hour < 12 ? `${h.hour}a` : h.hour === 12 ? '12p' : `${h.hour - 12}p`;
      return `
        <div class="hour-col" title="${label}: ${h.count} sales / ${fmtKES(h.revenue)}">
          <div class="hour-bar" style="height:${pct}%"></div>
          <div class="hour-lbl">${label}</div>
        </div>`;
    }).join('');

    // Table — show only hours with activity
    const active = hours.filter(h => h.count > 0);
    if (!active.length) {
      tbody.innerHTML = '<tr><td colspan="3" class="empty-state">No sales data.</td></tr>';
      return;
    }
    tbody.innerHTML = active
      .sort((a, b) => b.count - a.count)
      .map(h => {
        const t = h.hour;
        const label = t === 0 ? '12:00 AM' : t < 12 ? `${t}:00 AM` : t === 12 ? '12:00 PM' : `${t - 12}:00 PM`;
        return `<tr><td>${label}</td><td>${h.count}</td><td>${fmtKES(h.revenue)}</td></tr>`;
      }).join('');
  } catch (err) {
    chart.innerHTML = '';
    tbody.innerHTML = `<tr><td colspan="3" class="table-empty">Error: ${err.message}</td></tr>`;
  }
}

// ══ TAB 5: Inventory Alerts ════════════════════════════════════════════════════
async function loadAlerts() {
  const params = {};
  if (state.alerts.shopId) params.shop_id = state.alerts.shopId;

  const lowEl  = document.getElementById('lowStockList');
  const slowEl = document.getElementById('slowMovingList');
  lowEl.innerHTML  = '<p class="table-empty">Loading…</p>';
  slowEl.innerHTML = '<p class="table-empty">Loading…</p>';

  try {
    const data = await api.getReportAlerts(params);

    lowEl.innerHTML = data.low_stock.length
      ? data.low_stock.map(a => `
          <div class="alert-item low">
            <div class="alert-info">
              <div class="ai-name">${a.brand} ${a.model}</div>
              <div class="ai-sub">${a.shop_name} &bull; ${a.category}</div>
            </div>
            <span class="badge" style="background:#f59e0b22;border:1px solid #f59e0b;color:#f59e0b">
              ${a.available} left
            </span>
          </div>`).join('')
      : '<p class="empty-state">✅ No low-stock items.</p>';

    slowEl.innerHTML = data.slow_moving.length
      ? data.slow_moving.map(a => `
          <div class="alert-item slow">
            <div class="alert-info">
              <div class="ai-name">${a.brand} ${a.model}</div>
              <div class="ai-sub">${a.shop_name} &bull; ${a.available} units &bull; no sale in ${a.days_without_sale}d</div>
            </div>
            <span class="badge" style="background:#64748b22;border:1px solid #64748b;color:#64748b">
              Slow
            </span>
          </div>`).join('')
      : '<p class="empty-state">✅ No slow-moving items.</p>';
  } catch (err) {
    lowEl.innerHTML  = `<p class="table-empty">Error: ${err.message}</p>`;
    slowEl.innerHTML = '';
  }
}

// ══ TAB 6: Reconciliation ═════════════════════════════════════════════════════
let _reconSales = [];   // cached for export

async function loadRecon() {
  const params = { period: state.recon.period };
  if (state.recon.date)   params.date    = state.recon.date;
  if (state.recon.shopId) params.shop_id = state.recon.shopId;

  // Also load full sale list for the table
  const salesParams = { period: state.recon.period };
  if (state.recon.shopId) salesParams.shop_id = state.recon.shopId;
  if (state.recon.date) {
    salesParams.date_from = state.recon.date;
    salesParams.date_to   = state.recon.date;
  }

  try {
    const [recon, salesData] = await Promise.all([
      api.getReportReconcile(params),
      api.getSalesHistory(salesParams),
    ]);
    _reconSales = salesData;

    document.getElementById('reconTotal').textContent    = fmtKES(recon.gross);
    document.getElementById('reconTotalCnt').textContent = `${recon.total_sales} sales`;
    document.getElementById('reconCash').textContent     = fmtKES(recon.breakdown.cash.amount);
    document.getElementById('reconCashCnt').textContent  = `${recon.breakdown.cash.count} transactions`;
    document.getElementById('reconMpesa').textContent    = fmtKES(recon.breakdown.mpesa.amount);
    document.getElementById('reconMpesaCnt').textContent = `${recon.breakdown.mpesa.count} transactions`;
    document.getElementById('reconCard').textContent     = fmtKES(recon.breakdown.card.amount);
    document.getElementById('reconCardCnt').textContent  = `${recon.breakdown.card.count} transactions`;

    // Detail table
    const tbody = document.getElementById('reconTbody');
    if (!salesData.length) {
      tbody.innerHTML = '<tr><td colspan="6" class="empty-state">No transactions.</td></tr>';
      return;
    }

    const userMap  = {};
    const shopMap  = {};
    // Only admins can call /users/ — managers/cashiers get usernames from sales data
    if (state.role === 'admin') {
      try {
        const users = await api.getUsers();
        users.forEach(u => { userMap[u.id] = u.username; });
      } catch { /* non-critical */ }
    }
    state.shops.forEach(s => { shopMap[s.id] = s.name; });

    tbody.innerHTML = salesData.map((s, i) => `
      <tr>
        <td>${i + 1}</td>
        <td>${fmtDateTime(s.sold_at)}</td>
        <td>${userMap[s.cashier_id] || `#${s.cashier_id}`}</td>
        <td>${fmtKES(s.sale_price)}</td>
        <td><span class="pay-pill ${(s.payment_method||'').toLowerCase()}">${s.payment_method || 'cash'}</span></td>
        <td>${shopMap[s.shop_id] || `#${s.shop_id}`}</td>
      </tr>`).join('');
  } catch (err) {
    document.getElementById('reconTbody').innerHTML =
      `<tr><td colspan="6" class="table-empty">Error: ${err.message}</td></tr>`;
  }
}

// ── CSV exports ───────────────────────────────────────────────────────────────
function downloadCSV(filename, rows) {
  const csv = rows.map(r => r.map(c => `"${String(c).replace(/"/g, '""')}"`).join(',')).join('\n');
  const a = document.createElement('a');
  a.href = 'data:text/csv;charset=utf-8,' + encodeURIComponent(csv);
  a.download = filename;
  a.click();
}

async function exportDailyCSV() {
  try {
    const params = { period: state.daily.period };
    if (state.daily.date)   params.date    = state.daily.date;
    if (state.daily.shopId) params.shop_id = state.daily.shopId;
    const data = await api.getReportDaily(params);
    const rows = [['Branch', 'Gross', 'Sales', 'Cash', 'MPesa', 'Card']];
    data.branches.forEach(b => rows.push([b.shop_name, b.gross, b.count, b.cash, b.mpesa, b.card]));
    downloadCSV(`daily-summary-${state.daily.period}.csv`, rows);
  } catch (err) { showAlert('Export failed: ' + err.message, 'error'); }
}

async function exportStaffCSV() {
  try {
    const params = { period: state.staff.period };
    if (state.staff.from)   params.date_from = state.staff.from;
    if (state.staff.to)     params.date_to   = state.staff.to;
    if (state.staff.shopId) params.shop_id   = state.staff.shopId;
    const data = await api.getReportStaff(params);
    const rows = [['Staff', 'Branch', 'Gross', 'Sales', 'Avg Sale', 'Cash', 'MPesa', 'Card']];
    data.staff.forEach(s => rows.push([s.username, s.shop_name, s.gross, s.count, s.average_sale, s.cash, s.mpesa, s.card]));
    downloadCSV(`staff-performance-${state.staff.period}.csv`, rows);
  } catch (err) { showAlert('Export failed: ' + err.message, 'error'); }
}

async function exportReconCSV() {
  if (!_reconSales.length) { showAlert('No data to export.', 'error'); return; }
  const rows = [['#', 'Date', 'Cashier ID', 'Amount', 'Payment', 'Shop ID']];
  _reconSales.forEach((s, i) => rows.push([i + 1, s.sold_at, s.cashier_id, s.sale_price, s.payment_method, s.shop_id]));
  downloadCSV(`reconciliation-${state.recon.period}.csv`, rows);
}

// ── Helpers ───────────────────────────────────────────────────────────────────
function periodLabel(period, date) {
  if (date) return `Date: ${date}`;
  return { day: 'Today', week: 'This Week', month: 'This Month', all: 'All Time' }[period] || period;
}
