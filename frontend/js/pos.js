/**
 * pos.js — IMEI checkout, accessory sell, IMEI auto-fill (brand + price),
 * and receipt rendering. Field IDs match pos.html exactly.
 */
'use strict';

let _allInventory = [];
let _allProducts  = [];

document.addEventListener('DOMContentLoaded', async () => {
  const { username, shopId } = getSession();

  // Load products into accessory dropdown + cache for IMEI lookup
  try {
    [_allProducts, _allInventory] = await Promise.all([
      api.getProducts(),
      api.getInventory(),
    ]);

    // Populate accessory dropdown (accessories only)
    const accSelect = document.getElementById('accProduct');
    _allProducts
      .filter(p => p.category === 'accessory')
      .forEach(p => {
        const opt = document.createElement('option');
        opt.value       = p.id;
        opt.dataset.price = p.price;
        opt.textContent = `${p.brand} ${p.model} — ${fmtKES(p.price)}`;
        accSelect.appendChild(opt);
      });

    // Auto-fill acc price on selection change
    accSelect.addEventListener('change', () => {
      const opt = accSelect.selectedOptions[0];
      if (opt && opt.dataset.price) {
        document.getElementById('accSalePrice').value = opt.dataset.price;
      }
    });

  } catch (err) {
    showAlert('Could not load products: ' + err.message, 'error');
  }

  // ── IMEI input → auto-lookup on 15 chars ────────────────────────────────
  const imeiInput  = document.getElementById('imeiInput');
  const fillInfo   = document.getElementById('imeiFillInfo');
  const fillText   = document.getElementById('imeiFillText');
  const priceEl    = document.getElementById('imeiSalePrice');
  const priceSugg  = document.getElementById('priceSuggested');

  imeiInput.addEventListener('input', () => {
    const val = imeiInput.value.trim();
    if (val.length === 15) {
      const item = _allInventory.find(i => i.imei_number === val);
      if (item) {
        const prod = _allProducts.find(p => p.id === item.product_id);
        if (prod) {
          fillText.textContent = `${prod.brand} ${prod.model}`;
          fillInfo.classList.add('visible');
          if (!priceEl.value) {
            priceEl.value  = prod.price;
            priceSugg.textContent = `Suggested: ${fmtKES(prod.price)} (editable)`;
          }
        }
        if (item.status === 'Sold') {
          showError('imeiError', 'This item is already sold.');
        } else {
          hideError('imeiError');
        }
      } else {
        fillInfo.classList.remove('visible');
        priceSugg.textContent = '';
      }
    } else {
      fillInfo.classList.remove('visible');
      priceSugg.textContent = '';
      hideError('imeiError');
    }
  });

  // Clear autofill on reset
  imeiInput.addEventListener('focus', () => {
    if (!imeiInput.value) {
      fillInfo.classList.remove('visible');
      priceSugg.textContent = '';
    }
  });

  // ── IMEI form submit ─────────────────────────────────────────────────────
  document.getElementById('imeiForm').addEventListener('submit', async (e) => {
    e.preventDefault();
    hideError('imeiError');

    const imei          = imeiInput.value.trim();
    const salePrice     = priceEl.value;
    const paymentMethod = document.getElementById('imeiPayment').value;

    if (imei.length !== 15) { showError('imeiError', 'IMEI must be exactly 15 digits.'); return; }
    if (!salePrice || parseFloat(salePrice) <= 0) { showError('imeiError', 'Please enter a valid sale price.'); return; }

    const btn = document.getElementById('imeiCheckoutBtn');
    btn.disabled = true; btn.innerHTML = '<i class="fa-solid fa-spinner fa-spin"></i> Processing…';

    try {
      const sale = await api.checkout({
        imei_number:    imei,
        sale_price:     parseFloat(salePrice),
        payment_method: paymentMethod,
      });

      const item = _allInventory.find(i => i.imei_number === imei);
      const prod = item ? _allProducts.find(p => p.id === item.product_id) : null;
      const label = prod ? `${prod.brand} ${prod.model} (${imei})` : `IMEI: ${imei}`;

      renderReceipt({ item: label, sale, cashier: username });
      showAlert('✅ Sale processed!', 'success');
      e.target.reset();
      fillInfo.classList.remove('visible');
      priceSugg.textContent = '';

      // Update local cache — mark as sold
      if (item) item.status = 'Sold';

    } catch (err) {
      showError('imeiError', err.message);
    } finally {
      btn.disabled = false;
      btn.innerHTML = '<i class="fa-solid fa-cash-register"></i> Process Sale';
    }
  });

  // ── Accessory form submit ─────────────────────────────────────────────────
  document.getElementById('accessoryForm').addEventListener('submit', async (e) => {
    e.preventDefault();
    hideError('accError');

    const productId     = document.getElementById('accProduct').value;
    const salePrice     = document.getElementById('accSalePrice').value;
    const paymentMethod = document.getElementById('accPayment').value;

    if (!productId) { showError('accError', 'Please select a product.'); return; }
    if (!salePrice || parseFloat(salePrice) <= 0) { showError('accError', 'Please enter a valid sale price.'); return; }

    const btn = document.getElementById('accCheckoutBtn');
    btn.disabled = true; btn.innerHTML = '<i class="fa-solid fa-spinner fa-spin"></i> Processing…';

    try {
      const sale = await api.sellAccessory({
        product_id:     parseInt(productId),
        sale_price:     parseFloat(salePrice),
        payment_method: paymentMethod,
      });

      const selText = document.getElementById('accProduct').selectedOptions[0].text;
      renderReceipt({ item: selText, sale, cashier: username });
      showAlert('✅ Accessory sold!', 'success');
      e.target.reset();

    } catch (err) {
      showError('accError', err.message);
    } finally {
      btn.disabled = false;
      btn.innerHTML = '<i class="fa-solid fa-basket-shopping"></i> Sell Accessory';
    }
  });

  // Print
  document.getElementById('printReceiptBtn')?.addEventListener('click', () => window.print());
});

function renderReceipt({ item, sale, cashier }) {
  const now = sale.sold_at ? new Date(sale.sold_at) : new Date();

  // Header
  document.getElementById('receiptShopName').textContent = sale.shop_name || getSession().shopName || 'PhonePOS';
  const locEl = document.getElementById('receiptShopLocation');
  if (locEl) locEl.textContent = sale.shop_location || '';
  document.getElementById('receiptDateTime').textContent = now.toLocaleString('en-KE', {
    dateStyle: 'medium', timeStyle: 'short',
  });

  // Receipt number
  document.getElementById('rReceiptNo').textContent = sale.receipt_number || `RCP-${String(sale.id).padStart(6,'0')}`;

  // Item details
  const itemLabel = (sale.product_brand && sale.product_model)
    ? `${sale.product_brand} ${sale.product_model}`
    : item;
  document.getElementById('rItem').textContent = itemLabel;

  const catEl = document.getElementById('rCategory');
  if (catEl) catEl.textContent = (sale.product_category || 'N/A').charAt(0).toUpperCase() + (sale.product_category || '').slice(1);

  const imeiEl = document.getElementById('rImei');
  if (imeiEl) imeiEl.textContent = sale.imei_number || '—';

  // Transaction
  document.getElementById('rCashier').textContent = sale.cashier_name || cashier;
  document.getElementById('rPayment').textContent = sale.payment_method.toUpperCase();
  document.getElementById('rAmount').textContent  = fmtKES(sale.sale_price);

  document.getElementById('receiptEmpty').style.display = 'none';
  document.getElementById('receiptBody').style.display  = 'block';
}
