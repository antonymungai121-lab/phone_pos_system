/**
 * products.js — Combined product dashboard with per-branch stock,
 * low-stock alerts, Add Category wizard, Add Stock wizard, and
 * Admin-only stock transfer.
 */
'use strict';

// ── State ──────────────────────────────────────────────────────────────────────
let _stockOverview = [];   // from /products/stock-overview
let _products      = [];   // flat product list
let _shops         = [];   // all branches
let _activeCat     = 'all';
let _searchQ       = '';
let _stockBranch   = null; // selected branch id for Add Stock wizard
let _stockType     = null; // 'phone' | 'accessory'
let _prodSort      = 'newest'; // newest | name-az | name-za | price-low | price-high

const PROD_SORT_MODES = [
  { key: 'newest',     label: 'Newest',            icon: 'fa-arrow-down-wide-short' },
  { key: 'name-az',    label: 'Name A → Z',        icon: 'fa-arrow-down-a-z' },
  { key: 'name-za',    label: 'Name Z → A',        icon: 'fa-arrow-up-z-a' },
  { key: 'price-low',  label: 'Price: Low → High', icon: 'fa-arrow-up-1-9' },
  { key: 'price-high', label: 'Price: High → Low', icon: 'fa-arrow-down-9-1' },
];

function sortProducts(items) {
  switch (_prodSort) {
    case 'newest':     return items.sort((a, b) => b.id - a.id);
    case 'name-az':    return items.sort((a, b) => (a.brand+' '+a.model).localeCompare(b.brand+' '+b.model));
    case 'name-za':    return items.sort((a, b) => (b.brand+' '+b.model).localeCompare(a.brand+' '+a.model));
    case 'price-low':  return items.sort((a, b) => Number(a.price) - Number(b.price));
    case 'price-high': return items.sort((a, b) => Number(b.price) - Number(a.price));
    default: return items;
  }
}

// ── Boot ──────────────────────────────────────────────────────────────────────
document.addEventListener('DOMContentLoaded', async () => {
  const { role } = getSession();

  // Show transfer button for admin only
  if (role === 'admin') {
    document.getElementById('openTransferModal').style.display = '';
    document.getElementById('openTransferModal').addEventListener('click', openTransferModal);
  }

  // Load data
  await loadAll();

  // Wire category tabs
  document.querySelectorAll('.cat-tab').forEach(btn => {
    btn.addEventListener('click', () => {
      document.querySelectorAll('.cat-tab').forEach(b => b.classList.remove('active'));
      btn.classList.add('active');
      _activeCat = btn.dataset.cat;
      renderGrid();
    });
  });

  // Search
  document.getElementById('productSearch').addEventListener('input', e => {
    _searchQ = e.target.value.toLowerCase();
    renderGrid();
  });

  // Open modals
  document.getElementById('openAddCategoryModal').addEventListener('click', openAddCategoryModal);
  document.getElementById('openStockModal').addEventListener('click', openStockModal);

  // Wire Add Category wizard
  wireAddCategoryModal();

  // Wire Add Stock wizard
  wireAddStockModal();

  // Wire Edit Product modal
  wireEditProductModal();
});

// ── Load all data ─────────────────────────────────────────────────────────────
async function loadAll() {
  try {
    [_stockOverview, _shops] = await Promise.all([
      api.getProductStock(),
      api.getShops(),
    ]);
    _products = _stockOverview;   // stock-overview is product-scoped
    renderGrid();
  } catch (err) {
    document.getElementById('productsGrid').innerHTML =
      `<p style="color:var(--txt-muted);text-align:center;grid-column:1/-1">
         <i class="fa-solid fa-triangle-exclamation"></i> Failed to load: ${err.message}
       </p>`;
  }
}

// ── Render product cards ───────────────────────────────────────────────────────
function renderGrid() {
  const grid = document.getElementById('productsGrid');
  let items  = _stockOverview;

  // Category filter
  if (_activeCat !== 'all') items = items.filter(p => p.category === _activeCat);

  // Search filter
  if (_searchQ) {
    items = items.filter(p =>
      p.brand.toLowerCase().includes(_searchQ) ||
      p.model.toLowerCase().includes(_searchQ) ||
      (p.accessory_type || '').toLowerCase().includes(_searchQ)
    );
  }

  items = sortProducts(items);

  if (!items.length) {
    grid.innerHTML = '<p style="color:var(--txt-muted);text-align:center;padding:40px;grid-column:1/-1">No products found.</p>';
    return;
  }

  grid.innerHTML = items.map(p => renderProductCard(p)).join('');
  renderProductSortBar();
}

function renderProductCard(p) {
  const isPhone  = p.category === 'phone';
  const icon     = isPhone ? '📱' : accIcon(p.accessory_type);
  const catLabel = isPhone
    ? '<span style="color:var(--clr-primary);font-size:.72rem">PHONE</span>'
    : `<span style="color:var(--clr-accent);font-size:.72rem">ACCESSORY · ${(p.accessory_type || 'other').replace('_',' ').toUpperCase()}</span>`;

  // Check for any low-stock branch
  const hasLow  = p.branches.some(b => b.low_stock);
  const hasNone = p.branches.every(b => b.available === 0 && b.total === 0);

  const branchRows = p.branches.map(b => {
    if (b.total === 0) return ''; // hide branches with no stock ever

    const availBadge = b.available > 0
      ? `<span class="bsr-badge bsr-avail">${b.available} available</span>`
      : `<span class="bsr-badge bsr-out">out of stock</span>`;
    const lowWarn = b.low_stock
      ? `<span class="bsr-badge bsr-low"><i class="fa-solid fa-triangle-exclamation"></i> low</span>`
      : '';
    const soldBadge = b.sold > 0
      ? `<span class="bsr-badge bsr-sold">${b.sold} sold</span>`
      : '';
    return `
      <div class="branch-stock-row">
        <span class="bsr-name"><i class="fa-solid fa-store" style="font-size:.7rem;margin-right:4px;opacity:.5"></i>${b.shop_name}</span>
        <div class="bsr-counts">${availBadge}${lowWarn}${soldBadge}</div>
      </div>`;
  }).filter(Boolean).join('');

  const noStockRow = hasNone ? '<div class="no-stock-row">No stock in any branch yet</div>' : '';
  const alertBanner = hasLow
    ? `<div class="low-stock-alert"><i class="fa-solid fa-triangle-exclamation"></i> Low stock warning on one or more branches</div>`
    : '';

  // Edit/Delete actions — available to admin and manager
  const { role } = getSession();
  const canEdit = (role === 'admin' || role === 'manager');
  const actionBar = canEdit ? `
    <div class="product-actions">
      <button class="btn-action" onclick="openEditProduct(${p.id})">
        <i class="fa-solid fa-pen-to-square"></i> Edit
      </button>
      <button class="btn-action btn-action-danger" onclick="confirmDeleteProduct(${p.id},'${(p.brand + ' ' + p.model).replace(/'/g,"\\'")}')">
        <i class="fa-solid fa-trash"></i> Delete
      </button>
    </div>` : '';

  return `
    <div class="product-card glass">
      <div class="product-card-header">
        <div class="product-icon ${p.category}">${icon}</div>
        <div>
          <div class="product-name">${p.brand} ${p.model}</div>
          <div class="product-meta">${catLabel}</div>
          <div class="product-price">${fmtKES(p.price)}</div>
        </div>
      </div>
      ${alertBanner}
      <div class="branch-stock-list">${branchRows || noStockRow}</div>
      ${actionBar}
    </div>`;
}

function accIcon(type) {
  const icons = {
    charger: '🔌', earphone: '🎧', earpod: '🎵',
    back_cover: '🛡️', screen_protector: '🖥️', other: '📦',
  };
  return icons[type] || '📦';
}

// ── ADD CATEGORY MODAL ─────────────────────────────────────────────────────────
function openAddCategoryModal() {
  resetCatModal();
  document.getElementById('addCategoryModal').classList.remove('hidden');
}

function resetCatModal() {
  ['catStep2Phone','catStep2Accessory'].forEach(id =>
    document.getElementById(id).classList.add('hidden'));
  document.getElementById('catStep1').classList.remove('hidden');
  document.getElementById('addPhoneForm').reset();
  document.getElementById('addAccessoryForm').reset();
  hideError('phoneFormError'); hideError('accFormError');
  document.querySelectorAll('.acc-type-btn').forEach(b => b.classList.remove('selected'));
  document.getElementById('accType').value = '';
}

function wireAddCategoryModal() {
  document.getElementById('choosePhonesBtn').addEventListener('click', () => {
    document.getElementById('catStep1').classList.add('hidden');
    document.getElementById('catStep2Phone').classList.remove('hidden');
  });
  document.getElementById('chooseAccessoryBtn').addEventListener('click', () => {
    document.getElementById('catStep1').classList.add('hidden');
    document.getElementById('catStep2Accessory').classList.remove('hidden');
  });
  document.getElementById('backFromPhone').addEventListener('click', resetCatModal);
  document.getElementById('backFromAccessory').addEventListener('click', resetCatModal);

  // Accessory type selector
  document.querySelectorAll('.acc-type-btn').forEach(btn => {
    btn.addEventListener('click', () => {
      document.querySelectorAll('.acc-type-btn').forEach(b => b.classList.remove('selected'));
      btn.classList.add('selected');
      document.getElementById('accType').value = btn.dataset.type;
    });
  });

  // Phone form submit
  document.getElementById('addPhoneForm').addEventListener('submit', async e => {
    e.preventDefault();
    hideError('phoneFormError');
    const btn = e.submitter;
    btn.disabled = true;
    try {
      await api.addProduct({
        brand: document.getElementById('phoneBrand').value.trim(),
        model: document.getElementById('phoneModel').value.trim(),
        price: parseFloat(document.getElementById('phonePrice').value),
        category: 'phone',
        accessory_type: null,
      });
      showAlert('✅ Phone model added!');
      document.getElementById('addCategoryModal').classList.add('hidden');
      await loadAll();
    } catch (err) {
      showError('phoneFormError', err.message);
    } finally { btn.disabled = false; }
  });

  // Accessory form submit
  document.getElementById('addAccessoryForm').addEventListener('submit', async e => {
    e.preventDefault();
    hideError('accFormError');
    const accType = document.getElementById('accType').value;
    if (!accType) { showError('accFormError', 'Please select an accessory type.'); return; }
    const btn = e.submitter;
    btn.disabled = true;
    try {
      await api.addProduct({
        brand: document.getElementById('accBrand').value.trim(),
        model: document.getElementById('accModel').value.trim(),
        price: parseFloat(document.getElementById('accPrice').value),
        category: 'accessory',
        accessory_type: accType,
      });
      showAlert('✅ Accessory category added!');
      document.getElementById('addCategoryModal').classList.add('hidden');
      await loadAll();
    } catch (err) {
      showError('accFormError', err.message);
    } finally { btn.disabled = false; }
  });
}

// ── ADD STOCK MODAL ────────────────────────────────────────────────────────────
function openStockModal() {
  resetStockModal();
  document.getElementById('addStockModal').classList.remove('hidden');
  // Render branch buttons
  renderBranchButtons();
}

function resetStockModal() {
  ['stockStep2','stockStep3Phone','stockStep3Accessory'].forEach(id =>
    document.getElementById(id).classList.add('hidden'));
  document.getElementById('stockStep1').classList.remove('hidden');
  _stockBranch = null; _stockType = null;
  document.getElementById('stockPhoneForm').reset();
  document.getElementById('stockAccessoryForm').reset();
  hideError('stockPhoneError'); hideError('stockAccError');
}

function renderBranchButtons() {
  const { role, shopId } = getSession();
  const container = document.getElementById('branchButtonsContainer');
  // Admin sees all; manager/cashier see only own branch
  const visible = role === 'admin' ? _shops : _shops.filter(s => s.id === shopId);
  container.innerHTML = visible.map(s => `
    <button class="type-btn" style="min-width:140px" onclick="selectBranch(${s.id},'${s.name.replace(/'/g,"\\'")}')">
      <i class="fa-solid fa-store"></i>
      <span style="font-size:.85rem">${s.name}</span>
      ${s.location ? `<span style="font-size:.72rem;color:var(--txt-muted)">${s.location}</span>` : ''}
    </button>
  `).join('');
}
window.selectBranch = function(id, name) {
  _stockBranch = id;
  document.getElementById('selectedBranchLabel').textContent = name;
  document.getElementById('stockStep1').classList.add('hidden');
  document.getElementById('stockStep2').classList.remove('hidden');
};

function wireAddStockModal() {
  document.getElementById('backFromStockType').addEventListener('click', resetStockModal);
  document.getElementById('backFromIMEI').addEventListener('click', () => goToStockStep2());
  document.getElementById('backFromAccStock').addEventListener('click', () => goToStockStep2());

  document.getElementById('stockChoosePhone').addEventListener('click', () => {
    _stockType = 'phone';
    goToStockStep3('phone');
  });
  document.getElementById('stockChooseAccessory').addEventListener('click', () => {
    _stockType = 'accessory';
    goToStockStep3('accessory');
  });

  // Phone IMEI form
  document.getElementById('stockPhoneForm').addEventListener('submit', async e => {
    e.preventDefault();
    hideError('stockPhoneError');
    const productId = document.getElementById('stockPhoneModel').value;
    const imei      = document.getElementById('stockImei').value.trim();
    if (!productId) { showError('stockPhoneError', 'Please select a model.'); return; }
    if (imei.length !== 15) { showError('stockPhoneError', 'IMEI must be exactly 15 digits.'); return; }
    const btn = e.submitter; btn.disabled = true;
    try {
      await api.scanImei({ imei_number: imei, product_id: parseInt(productId), shop_id: _stockBranch });
      showAlert('✅ Phone added to inventory!');
      document.getElementById('addStockModal').classList.add('hidden');
      await loadAll();
    } catch (err) {
      showError('stockPhoneError', err.message);
    } finally { btn.disabled = false; }
  });

  // Accessory bulk form
  document.getElementById('stockAccessoryForm').addEventListener('submit', async e => {
    e.preventDefault();
    hideError('stockAccError');
    const productId = document.getElementById('stockAccModel').value;
    const qty       = parseInt(document.getElementById('stockAccQty').value);
    if (!productId) { showError('stockAccError', 'Please select a model.'); return; }
    if (!qty || qty < 1) { showError('stockAccError', 'Quantity must be at least 1.'); return; }
    const btn = e.submitter; btn.disabled = true;
    try {
      const res = await api.stockAccessory({ product_id: parseInt(productId), quantity: qty, shop_id: _stockBranch });
      showAlert(`✅ ${res.detail}`);
      document.getElementById('addStockModal').classList.add('hidden');
      await loadAll();
    } catch (err) {
      showError('stockAccError', err.message);
    } finally { btn.disabled = false; }
  });

  // Brand → model cascade (phone)
  document.getElementById('stockPhoneBrand').addEventListener('change', () => {
    populateModels('phone', 'stockPhoneBrand', 'stockPhoneModel');
  });
  // Brand → model cascade (accessory)
  document.getElementById('stockAccBrand').addEventListener('change', () => {
    populateModels('accessory', 'stockAccBrand', 'stockAccModel');
  });
}

function goToStockStep2() {
  document.getElementById('stockStep3Phone').classList.add('hidden');
  document.getElementById('stockStep3Accessory').classList.add('hidden');
  document.getElementById('stockStep2').classList.remove('hidden');
}

function goToStockStep3(type) {
  document.getElementById('stockStep2').classList.add('hidden');
  if (type === 'phone') {
    populateBrands('phone', 'stockPhoneBrand');
    resetSelect('stockPhoneModel', '— select model —');
    document.getElementById('stockStep3Phone').classList.remove('hidden');
  } else {
    populateBrands('accessory', 'stockAccBrand');
    resetSelect('stockAccModel', '— select model —');
    document.getElementById('stockStep3Accessory').classList.remove('hidden');
  }
}

function populateBrands(category, selectId) {
  const sel = document.getElementById(selectId);
  const brands = [...new Set(
    _stockOverview.filter(p => p.category === category).map(p => p.brand)
  )].sort();
  sel.innerHTML = `<option value="">— select brand —</option>` +
    brands.map(b => `<option value="${b}">${b}</option>`).join('');
}

function populateModels(category, brandSelId, modelSelId) {
  const brand   = document.getElementById(brandSelId).value;
  const modelSel = document.getElementById(modelSelId);
  const models  = _stockOverview.filter(p => p.category === category && p.brand === brand);
  modelSel.innerHTML = `<option value="">— select model —</option>` +
    models.map(p => `<option value="${p.id}">${p.model}</option>`).join('');
}

function resetSelect(id, placeholder) {
  const sel = document.getElementById(id);
  sel.innerHTML = `<option value="">${placeholder}</option>`;
}

// ── TRANSFER MODAL (admin only) ───────────────────────────────────────────────
async function openTransferModal() {
  document.getElementById('transferModal').classList.remove('hidden');
  const fromSel = document.getElementById('transferFromShop');
  const toSel   = document.getElementById('transferToShop');

  fromSel.innerHTML = `<option value="">— select source branch —</option>` +
    _shops.map(s => `<option value="${s.id}">${s.name}</option>`).join('');
  toSel.innerHTML = `<option value="">— select destination branch —</option>` +
    _shops.map(s => `<option value="${s.id}">${s.name}</option>`).join('');

  fromSel.onchange = async () => {
    const shopId = fromSel.value;
    const itemSel = document.getElementById('transferItem');
    if (!shopId) { itemSel.innerHTML = '<option value="">— select source branch first —</option>'; return; }
    try {
      const items = await api.getInventory({ shop_id: shopId, status: 'Available' });
      itemSel.innerHTML = `<option value="">— select item —</option>` +
        items.map(i => {
          const prod = _stockOverview.find(p => p.id === i.product_id);
          const label = prod ? `${prod.brand} ${prod.model} — ${i.imei_number}` : i.imei_number;
          return `<option value="${i.id}">${label}</option>`;
        }).join('');
    } catch (err) {
      showAlert('Failed to load items: ' + err.message, 'error');
    }
  };

  document.getElementById('transferForm').onsubmit = async e => {
    e.preventDefault();
    hideError('transferError');
    const itemId   = document.getElementById('transferItem').value;
    const toShopId = document.getElementById('transferToShop').value;
    if (!itemId || !toShopId) { showError('transferError', 'Please select item and destination branch.'); return; }
    const btn = e.submitter; btn.disabled = true;
    try {
      const res = await api.transferStock({ item_id: parseInt(itemId), to_shop_id: parseInt(toShopId) });
      showAlert(`✅ ${res.detail}`);
      document.getElementById('transferModal').classList.add('hidden');
      await loadAll();
    } catch (err) {
      showError('transferError', err.message);
    } finally { btn.disabled = false; }
  };
}

// ── EDIT PRODUCT ──────────────────────────────────────────────────────────────
function openEditProduct(productId) {
  const p = _stockOverview.find(x => x.id === productId);
  if (!p) { showAlert('Product not found.', 'error'); return; }

  document.getElementById('editProductId').value = productId;
  document.getElementById('editBrand').value     = p.brand;
  document.getElementById('editModel').value     = p.model;
  document.getElementById('editPrice').value     = p.price;
  document.getElementById('editCategory').value  = p.category;
  document.getElementById('editAccType').value   = p.accessory_type || '';

  // Set category button highlight
  document.querySelectorAll('#editCatRow .type-btn').forEach(b => {
    b.classList.toggle('selected', b.dataset.cat === p.category);
  });

  // Show/hide accessory type picker
  const accGroup = document.getElementById('editAccTypeGroup');
  accGroup.classList.toggle('hidden', p.category !== 'accessory');

  // Highlight current acc type
  document.querySelectorAll('#editAccTypeGroup .acc-type-btn').forEach(b => {
    b.classList.toggle('selected', b.dataset.type === p.accessory_type);
  });

  // Clear messages
  document.getElementById('editProductError').classList.add('hidden');
  document.getElementById('editProductSuccess').classList.add('hidden');

  document.getElementById('editProductModal').classList.remove('hidden');
}
window.openEditProduct = openEditProduct;

async function confirmDeleteProduct(productId, label) {
  if (!confirm(`Delete "${label}"?\n\nThis is blocked if the product has available stock. Sold records are kept for audit.`)) return;
  try {
    await api.deleteProduct(productId);
    showAlert(`"${label}" deleted.`);
    await loadAll();
  } catch (err) {
    showAlert('Delete failed: ' + err.message, 'error');
  }
}
window.confirmDeleteProduct = confirmDeleteProduct;

function wireEditProductModal() {
  // Category toggle buttons
  document.querySelectorAll('#editCatRow .type-btn').forEach(btn => {
    btn.addEventListener('click', () => {
      document.querySelectorAll('#editCatRow .type-btn').forEach(b => b.classList.remove('selected'));
      btn.classList.add('selected');
      document.getElementById('editCategory').value = btn.dataset.cat;
      const isAcc = btn.dataset.cat === 'accessory';
      document.getElementById('editAccTypeGroup').classList.toggle('hidden', !isAcc);
      if (!isAcc) {
        document.getElementById('editAccType').value = '';
        document.querySelectorAll('#editAccTypeGroup .acc-type-btn').forEach(b => b.classList.remove('selected'));
      }
    });
  });

  // Accessory type buttons
  document.querySelectorAll('#editAccTypeGroup .acc-type-btn').forEach(btn => {
    btn.addEventListener('click', () => {
      document.querySelectorAll('#editAccTypeGroup .acc-type-btn').forEach(b => b.classList.remove('selected'));
      btn.classList.add('selected');
      document.getElementById('editAccType').value = btn.dataset.type;
    });
  });

  // Form submit
  document.getElementById('editProductForm').addEventListener('submit', async e => {
    e.preventDefault();
    hideError('editProductError');
    document.getElementById('editProductSuccess').classList.add('hidden');

    const id       = parseInt(document.getElementById('editProductId').value);
    const category = document.getElementById('editCategory').value;
    const accType  = document.getElementById('editAccType').value;

    if (!category) { showError('editProductError', 'Please select a category.'); return; }
    if (category === 'accessory' && !accType) {
      showError('editProductError', 'Please select an accessory type.'); return;
    }

    const payload = {
      brand:          document.getElementById('editBrand').value.trim(),
      model:          document.getElementById('editModel').value.trim(),
      price:          parseFloat(document.getElementById('editPrice').value),
      category,
      accessory_type: category === 'accessory' ? accType : null,
    };

    const btn = e.submitter; btn.disabled = true; btn.textContent = 'Saving…';

    try {
      await api.updateProduct(id, payload);
      const ok = document.getElementById('editProductSuccess');
      ok.textContent = '✅ Product updated successfully.';
      ok.classList.remove('hidden');
      showAlert('Product updated!');
      await loadAll();
      setTimeout(() => document.getElementById('editProductModal').classList.add('hidden'), 1200);
    } catch (err) {
      showError('editProductError', err.message);
    } finally {
      btn.disabled = false;
      btn.innerHTML = '<i class="fa-solid fa-floppy-disk"></i> Save Changes';
    }
  });
}

function renderProductSortBar() {
  const old = document.getElementById('prodSortBar');
  if (old) old.remove();
  const bar = document.createElement('div');
  bar.id = 'prodSortBar';
  bar.style.cssText = 'display:flex;align-items:center;gap:8px;justify-content:flex-end;padding:14px 0 4px;flex-wrap:wrap;';
  const label = document.createElement('span');
  label.style.cssText = 'font-size:.78rem;color:var(--txt-muted);';
  label.textContent = 'Sort:';
  bar.appendChild(label);
  PROD_SORT_MODES.forEach(mode => {
    const btn = document.createElement('button');
    btn.className = 'cat-tab' + (mode.key === _prodSort ? ' active' : '');
    btn.style.cssText = 'font-size:.75rem;padding:5px 12px;';
    btn.innerHTML = `<i class="fa-solid ${mode.icon}"></i> ${mode.label}`;
    btn.addEventListener('click', () => { _prodSort = mode.key; renderGrid(); });
    bar.appendChild(btn);
  });
  const grid = document.getElementById('productsGrid');
  if (grid) grid.after(bar);
}
