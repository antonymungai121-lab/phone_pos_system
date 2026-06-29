/** reports.js — full sales history with summary KPIs, date filter, and CSV export */
let allSales = [];

document.addEventListener('DOMContentLoaded', async () => {
  await loadSales();

  document.getElementById('dateFilter').addEventListener('change', filterByDate);
  document.getElementById('exportCsvBtn').addEventListener('click', exportCsv);
});

async function loadSales() {
  try {
    allSales = await api.getSalesHistory();
    renderSummary(allSales);
    renderTable(allSales);
  } catch (err) {
    showAlert('Failed to load sales: ' + err.message, 'error');
  }
}

function renderSummary(sales) {
  const total      = sales.length;
  const revenue    = sales.reduce((s, x) => s + parseFloat(x.sale_price || 0), 0);
  const cashSales  = sales.filter(s => s.payment_method === 'cash').length;
  const mpesaSales = sales.filter(s => s.payment_method === 'mpesa').length;

  document.getElementById('reportTotalRevenue').textContent = fmtKES(revenue);
  document.getElementById('reportTotalSales').textContent   = total.toLocaleString();
  document.getElementById('reportCashSales').textContent    = cashSales.toLocaleString();
  document.getElementById('reportMpesaSales').textContent   = mpesaSales.toLocaleString();
}

function renderTable(sales) {
  const tbody = document.getElementById('reportsTbody');
  if (!sales.length) {
    tbody.innerHTML = '<tr><td colspan="6" class="table-empty">No sales records found.</td></tr>';
    return;
  }
  tbody.innerHTML = sales.map(s => `
    <tr>
      <td>#${s.id}</td>
      <td>${s.imei_item_id}</td>
      <td>${s.cashier_id}</td>
      <td class="amount-cell">${fmtKES(s.sale_price)}</td>
      <td><span class="badge badge-${s.payment_method}">${s.payment_method}</span></td>
      <td>${fmtDateTime(s.sold_at)}</td>
    </tr>
  `).join('');
}

function filterByDate() {
  const date = document.getElementById('dateFilter').value; // YYYY-MM-DD
  if (!date) {
    renderSummary(allSales);
    renderTable(allSales);
    return;
  }
  const filtered = allSales.filter(s => s.sold_at && s.sold_at.startsWith(date));
  renderSummary(filtered);
  renderTable(filtered);
}

function exportCsv() {
  if (!allSales.length) { showAlert('No data to export.', 'error'); return; }

  const headers = ['Sale #', 'Item ID', 'Cashier ID', 'Amount (KES)', 'Payment', 'Date'];
  const rows    = allSales.map(s => [
    s.id, s.imei_item_id, s.cashier_id,
    parseFloat(s.sale_price).toFixed(2),
    s.payment_method,
    fmtDateTime(s.sold_at),
  ]);

  const csvContent = [headers, ...rows]
    .map(row => row.map(v => `"${String(v).replace(/"/g, '""')}"`).join(','))
    .join('\n');

  const blob = new Blob([csvContent], { type: 'text/csv' });
  const url  = URL.createObjectURL(blob);
  const a    = document.createElement('a');
  a.href     = url;
  a.download = `phonepos_sales_${new Date().toISOString().slice(0, 10)}.csv`;
  a.click();
  URL.revokeObjectURL(url);
}
