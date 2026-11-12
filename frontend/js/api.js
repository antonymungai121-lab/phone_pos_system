/**
 * api.js — Centralised API client for PhonePOS.
 * All requests automatically inject the JWT Authorization header.
 */

const API_BASE = 'http://127.0.0.1:8000';

async function apiRequest(method, path, body = null) {
  const token = sessionStorage.getItem('pos_token');
  const headers = { 'Content-Type': 'application/json' };
  if (token) headers['Authorization'] = `Bearer ${token}`;

  const opts = { method, headers };
  if (body) opts.body = JSON.stringify(body);

  const res = await fetch(`${API_BASE}${path}`, opts);
  if (res.status === 204) return null;

  const data = await res.json().catch(() => ({ detail: 'Unknown server error' }));
  if (!res.ok) throw new Error(data.detail || `HTTP ${res.status}`);
  return data;
}

/** Login — form-encoded as required by OAuth2PasswordRequestForm */
async function apiLogin(username, password) {
  const body = new URLSearchParams({ username, password });
  const res = await fetch(`${API_BASE}/auth/login`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body,
  });
  const data = await res.json().catch(() => ({ detail: 'Server error' }));
  if (!res.ok) throw new Error(data.detail || `HTTP ${res.status}`);
  return data;
}

const api = {
  // Auth
  login:          apiLogin,
  register:       (d)    => apiRequest('POST',  '/auth/register',        d),
  authStatus:     ()     => apiRequest('GET',   '/auth/status'),
  changePassword: (d)    => apiRequest('POST',  '/auth/change-password', d),

  // Shops
  getShops:    ()        => apiRequest('GET',    '/shops/'),
  createShop:  (d)       => apiRequest('POST',   '/shops/',      d),
  updateShop:  (id, d)   => apiRequest('PUT',    `/shops/${id}`, d),
  deleteShop:  (id)      => apiRequest('DELETE', `/shops/${id}`),

  // Products
  getProducts:        ()      => apiRequest('GET',  '/products/'),
  getProductStock:    ()      => apiRequest('GET',  '/products/stock-overview'),
  addProduct:         (d)     => apiRequest('POST', '/products/add', d),
  updateProduct:      (id, d) => apiRequest('PUT',  `/products/${id}`, d),

  // Inventory — optional ?shop_id=&status=&product_id= query params
  getInventory: (params = {}) => {
    const qs = new URLSearchParams(
      Object.fromEntries(Object.entries(params).filter(([, v]) => v != null && v !== ''))
    ).toString();
    return apiRequest('GET', `/inventory/${qs ? '?' + qs : ''}`);
  },
  scanImei:        (d)        => apiRequest('POST', '/inventory/scan', d),
  stockAccessory:  (d)        => apiRequest('POST', '/inventory/stock-accessory', d),
  transferStock:   (d)        => apiRequest('POST', '/inventory/transfer', d),

  // Sales — optional ?shop_id=&cashier_id=&period=&date_from=&date_to=
  getSalesHistory: (params = {}) => {
    const qs = new URLSearchParams(
      Object.fromEntries(Object.entries(params).filter(([, v]) => v != null && v !== ''))
    ).toString();
    return apiRequest('GET', `/sales/history${qs ? '?' + qs : ''}`);
  },
  checkout:       (d) => apiRequest('POST', '/sales/checkout',      d),
  sellAccessory:  (d) => apiRequest('POST', '/sales/sell-accessory', d),

  // Dashboard
  getDashboardStats: () => apiRequest('GET', '/dashboard/stats'),

  // Users
  getUsers:         ()      => apiRequest('GET',    '/users/'),
  createUser:       (d)     => apiRequest('POST',   '/users/',           d),
  deleteUser:       (id)    => apiRequest('DELETE', `/users/${id}`),
  reassignUserShop: (id, d) => apiRequest('PATCH',  `/users/${id}/shop`, d),
  adminResetPassword: (id, d) => apiRequest('PATCH', `/users/${id}/password`, d),

  // Products
  deleteProduct:    (id)    => apiRequest('DELETE', `/products/${id}`),

  // Reports
  getReportDaily:        (p = {}) => { const qs = new URLSearchParams(Object.fromEntries(Object.entries(p).filter(([,v]) => v != null && v !== ''))).toString(); return apiRequest('GET', `/reports/daily-summary${qs ? '?' + qs : ''}`); },
  getReportStaff:        (p = {}) => { const qs = new URLSearchParams(Object.fromEntries(Object.entries(p).filter(([,v]) => v != null && v !== ''))).toString(); return apiRequest('GET', `/reports/staff-performance${qs ? '?' + qs : ''}`); },
  getReportTopProducts:  (p = {}) => { const qs = new URLSearchParams(Object.fromEntries(Object.entries(p).filter(([,v]) => v != null && v !== ''))).toString(); return apiRequest('GET', `/reports/top-products${qs ? '?' + qs : ''}`); },
  getReportPeakHours:    (p = {}) => { const qs = new URLSearchParams(Object.fromEntries(Object.entries(p).filter(([,v]) => v != null && v !== ''))).toString(); return apiRequest('GET', `/reports/peak-hours${qs ? '?' + qs : ''}`); },
  getReportAlerts:       (p = {}) => { const qs = new URLSearchParams(Object.fromEntries(Object.entries(p).filter(([,v]) => v != null && v !== ''))).toString(); return apiRequest('GET', `/reports/inventory-alerts${qs ? '?' + qs : ''}`); },
  getReportReconcile:    (p = {}) => { const qs = new URLSearchParams(Object.fromEntries(Object.entries(p).filter(([,v]) => v != null && v !== ''))).toString(); return apiRequest('GET', `/reports/reconciliation${qs ? '?' + qs : ''}`); },
};

window.api = api;
