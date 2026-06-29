/** pos.js — handles IMEI checkout and accessory quick-sell */
document.addEventListener('DOMContentLoaded', async () => {
  const { username, shopId } = getSession();

  // Set receipt shop
  document.getElementById('receiptShop').textContent = getSession().shopName || `Shop #${shopId}`;

  // Load products into accessory dropdown
  try {
    const products = await api.getProducts();
    const accSelect = document.getElementById('accProduct');
    products.forEach(p => {
      const opt = document.createElement('option');
      opt.value = p.id;
      opt.textContent = `${p.brand} ${p.model} — ${fmtKES(p.price)}`;
      accSelect.appendChild(opt);
    });
  } catch (err) {
    showAlert('Could not load products: ' + err.message, 'error');
  }

  // ── IMEI form ────────────────────────────────────────────────────────────
  const imeiForm  = document.getElementById('imeiForm');
  const imeiInput = document.getElementById('imeiInput');

  // Auto-submit when 15 chars are scanned
  imeiInput.addEventListener('input', () => {
    if (imeiInput.value.length === 15) {
      imeiInput.dispatchEvent(new Event('imeilookup'));
    }
  });

  imeiForm.addEventListener('submit', async (e) => {
    e.preventDefault();
    hideError('imeiError');

    const imei        = document.getElementById('imeiInput').value.trim();
    const salePrice   = document.getElementById('imeiSalePrice').value;
    const paymentMethod = document.getElementById('imeiPayment').value;

    if (imei.length !== 15) {
      showError('imeiError', 'IMEI must be exactly 15 digits.');
      return;
    }
    if (!salePrice || parseFloat(salePrice) <= 0) {
      showError('imeiError', 'Please enter a valid sale price.');
      return;
    }

    const btn = document.getElementById('imeiCheckoutBtn');
    btn.disabled = true;
    btn.textContent = 'Processing…';

    try {
      const sale = await api.checkout({
        imei_number:    imei,
        sale_price:     parseFloat(salePrice),
        payment_method: paymentMethod,
      });

      renderReceipt({ item: `IMEI: ${imei}`, sale, cashier: username });
      showAlert('✅ Sale processed successfully!', 'success');
      imeiForm.reset();

    } catch (err) {
      showError('imeiError', err.message);
    } finally {
      btn.disabled = false;
      btn.textContent = 'Process Sale';
    }
  });

  // ── Accessory form ────────────────────────────────────────────────────────
  const accForm = document.getElementById('accessoryForm');

  accForm.addEventListener('submit', async (e) => {
    e.preventDefault();
    hideError('accError');

    const productId   = document.getElementById('accProduct').value;
    const salePrice   = document.getElementById('accSalePrice').value;
    const paymentMethod = document.getElementById('accPayment').value;

    if (!productId) { showError('accError', 'Please select a product.'); return; }
    if (!salePrice || parseFloat(salePrice) <= 0) { showError('accError', 'Please enter a valid sale price.'); return; }

    const btn = document.getElementById('accCheckoutBtn');
    btn.disabled = true;
    btn.textContent = 'Processing…';

    try {
      const sale = await api.sellAccessory({
        product_id:     parseInt(productId),
        sale_price:     parseFloat(salePrice),
        payment_method: paymentMethod,
      });

      const selectedText = document.getElementById('accProduct').selectedOptions[0].text;
      renderReceipt({ item: selectedText, sale, cashier: username });
      showAlert('✅ Accessory sold successfully!', 'success');
      accForm.reset();

    } catch (err) {
      showError('accError', err.message);
    } finally {
      btn.disabled = false;
      btn.textContent = 'Sell Accessory';
    }
  });
});

function renderReceipt({ item, sale, cashier }) {
  document.getElementById('receiptDate').textContent = fmtDateTime(sale.sold_at);
  document.getElementById('rItem').textContent    = item;
  document.getElementById('rAmount').textContent  = fmtKES(sale.sale_price);
  document.getElementById('rPayment').textContent = sale.payment_method.toUpperCase();
  document.getElementById('rCashier').textContent = cashier;

  document.getElementById('receiptPlaceholder').classList.add('hidden');
  document.getElementById('receiptBody').classList.remove('hidden');
  document.getElementById('printReceiptBtn').classList.remove('hidden');
}
