/** inventory.js — displays inventory table with search/filter, handles scan & bulk modals */
let allInventory = [];
let allProducts  = [];

document.addEventListener('DOMContentLoaded', async () => {
  await loadData();
  setupSearch();
  setupModals();
});

async function loadData() {
  try {
    [allInventory, allProducts] = await Promise.all([api.getInventory(), api.getProducts()]);
    renderTable(allInventory);
    populateProductDropdowns();
  } catch (err) {
    showAlert('Failed to load inventory: ' + err.message, 'error');
  }
}

function renderTable(items) {
  const tbody = document.getElementById('inventoryTbody');
  if (!items.length) {
    tbody.innerHTML = '<tr><td colspan="6" class="table-empty">No inventory found.</td></tr>';
    return;
  }
  tbody.innerHTML = items.map((item, idx) => {
    const prod = allProducts.find(p => p.id === item.product_id);
    return `
      <tr>
        <td>${idx + 1}</td>
        <td class="mono">${item.imei_number}</td>
        <td>${prod ? `${prod.brand} ${prod.model}` : `Product #${item.product_id}`}</td>
        <td><span class="badge badge-${item.status.toLowerCase()}">${item.status}</span></td>
        <td>${fmtDateTime(item.date_added)}</td>
        <td>${item.date_sold ? fmtDateTime(item.date_sold) : '—'}</td>
      </tr>`;
  }).join('');
}

function setupSearch() {
  const searchInput  = document.getElementById('inventorySearch');
  const statusFilter = document.getElementById('statusFilter');

  function applyFilters() {
    const q      = searchInput.value.toLowerCase();
    const status = statusFilter.value;
    const filtered = allInventory.filter(item => {
      const prod    = allProducts.find(p => p.id === item.product_id);
      const prodStr = prod ? `${prod.brand} ${prod.model}`.toLowerCase() : '';
      const matchQ  = !q || item.imei_number.toLowerCase().includes(q) || prodStr.includes(q);
      const matchS  = !status || item.status === status;
      return matchQ && matchS;
    });
    renderTable(filtered);
  }

  searchInput.addEventListener('input',  applyFilters);
  statusFilter.addEventListener('change', applyFilters);
}

function populateProductDropdowns() {
  ['scanProduct', 'accStockProduct'].forEach(id => {
    const sel = document.getElementById(id);
    if (!sel) return;
    allProducts.forEach(p => {
      const opt = document.createElement('option');
      opt.value = p.id;
      opt.textContent = `${p.brand} ${p.model}`;
      sel.appendChild(opt);
    });
  });
}

function setupModals() {
  // Open modals
  document.getElementById('openScanModal').addEventListener('click', () => {
    document.getElementById('scanModal').classList.remove('hidden');
  });
  document.getElementById('openAccModal').addEventListener('click', () => {
    document.getElementById('accModal').classList.remove('hidden');
  });

  // Scan form
  document.getElementById('scanForm').addEventListener('submit', async (e) => {
    e.preventDefault();
    hideError('scanError');
    const imei      = document.getElementById('scanImei').value.trim();
    const productId = document.getElementById('scanProduct').value;

    if (imei.length !== 15) { showError('scanError', 'IMEI must be exactly 15 digits.'); return; }
    if (!productId)          { showError('scanError', 'Please select a product.'); return; }

    try {
      await api.scanImei({ imei_number: imei, product_id: parseInt(productId) });
      showAlert('✅ Item added to inventory!');
      document.getElementById('scanModal').classList.add('hidden');
      document.getElementById('scanForm').reset();
      await loadData();
    } catch (err) {
      showError('scanError', err.message);
    }
  });

  // Bulk accessory form
  document.getElementById('accStockForm').addEventListener('submit', async (e) => {
    e.preventDefault();
    hideError('accStockError');
    const productId = document.getElementById('accStockProduct').value;
    const qty       = document.getElementById('accQty').value;

    if (!productId) { showError('accStockError', 'Please select a product.'); return; }
    if (!qty || qty < 1) { showError('accStockError', 'Quantity must be at least 1.'); return; }

    try {
      const result = await api.stockAccessory({ product_id: parseInt(productId), quantity: parseInt(qty) });
      showAlert(`✅ ${result.detail}`);
      document.getElementById('accModal').classList.add('hidden');
      document.getElementById('accStockForm').reset();
      await loadData();
    } catch (err) {
      showError('accStockError', err.message);
    }
  });
}
