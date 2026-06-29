/** products.js — renders product grid and handles Add Product modal */
document.addEventListener('DOMContentLoaded', async () => {
  const { role } = getSession();

  // Show add-product button for managers and admins
  if (role === 'manager' || role === 'admin') {
    document.querySelectorAll('.manager-only').forEach(el => el.classList.remove('hidden'));
  }

  await loadProducts();

  // Open modal
  const openBtn = document.getElementById('openAddProductModal');
  if (openBtn) {
    openBtn.addEventListener('click', () => {
      document.getElementById('addProductModal').classList.remove('hidden');
    });
  }

  // Add product form
  document.getElementById('addProductForm').addEventListener('submit', async (e) => {
    e.preventDefault();
    hideError('addProductError');

    const data = {
      brand: document.getElementById('prodBrand').value.trim(),
      model: document.getElementById('prodModel').value.trim(),
      price: parseFloat(document.getElementById('prodPrice').value),
    };

    try {
      await api.addProduct(data);
      showAlert('✅ Product added successfully!');
      document.getElementById('addProductModal').classList.add('hidden');
      document.getElementById('addProductForm').reset();
      await loadProducts();
    } catch (err) {
      showError('addProductError', err.message);
    }
  });
});

async function loadProducts() {
  const grid = document.getElementById('productsGrid');
  const { role } = getSession();

  try {
    const products = await api.getProducts();
    if (!products.length) {
      grid.innerHTML = '<p class="table-empty">No products yet. Add one to get started.</p>';
      return;
    }

    grid.innerHTML = products.map(p => `
      <div class="product-card glass">
        <div class="product-icon">${p.brand === 'Samsung' ? '📱' : p.brand === 'Apple' ? '🍎' : '📲'}</div>
        <div class="product-info">
          <h4 class="product-model">${p.model}</h4>
          <p class="product-brand">${p.brand}</p>
          <p class="product-price">${fmtKES(p.price)}</p>
        </div>
        <div class="product-id">ID: ${p.id}</div>
      </div>
    `).join('');
  } catch (err) {
    grid.innerHTML = `<p class="table-empty error">Failed to load products: ${err.message}</p>`;
  }
}
