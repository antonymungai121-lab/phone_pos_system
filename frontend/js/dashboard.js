/** dashboard.js — loads KPI cards and recent sales table */
document.addEventListener('DOMContentLoaded', async () => {
  try {
    const [inventory, sales] = await Promise.all([
      api.getInventory(),
      api.getSalesHistory(),
    ]);

    // ── KPIs ─────────────────────────────────────────────────────────────
    const total     = inventory.length;
    const available = inventory.filter(i => i.status === 'Available').length;
    const sold      = inventory.filter(i => i.status === 'Sold').length;

    const todayStr = new Date().toDateString();
    const todayRevenue = sales
      .filter(s => new Date(s.sold_at).toDateString() === todayStr)
      .reduce((sum, s) => sum + parseFloat(s.sale_price || 0), 0);

    document.getElementById('kpiTotal').textContent     = total.toLocaleString();
    document.getElementById('kpiAvailable').textContent = available.toLocaleString();
    document.getElementById('kpiSold').textContent      = sold.toLocaleString();
    document.getElementById('kpiRevenue').textContent   = fmtKES(todayRevenue);

    // ── Recent Sales Table (last 10) ──────────────────────────────────────
    const tbody   = document.getElementById('recentSalesTbody');
    const recent  = sales.slice(0, 10);

    if (recent.length === 0) {
      tbody.innerHTML = '<tr><td colspan="6" class="table-empty">No sales yet today.</td></tr>';
      return;
    }

    tbody.innerHTML = recent.map(s => `
      <tr>
        <td>#${s.id}</td>
        <td>${s.imei_item_id}</td>
        <td>${s.cashier_id}</td>
        <td class="amount-cell">${fmtKES(s.sale_price)}</td>
        <td><span class="badge badge-${s.payment_method}">${s.payment_method}</span></td>
        <td>${fmtDateTime(s.sold_at)}</td>
      </tr>
    `).join('');

  } catch (err) {
    console.error('Dashboard load error:', err);
    showAlert('Failed to load dashboard data: ' + err.message, 'error');
  }
});
