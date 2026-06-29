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

  // Shops (admin: create/update/delete; all: read)
  getShops:    ()        => apiRequest('GET',    '/shops/'),
  createShop:  (d)       => apiRequest('POST',   '/shops/',      d),
  updateShop:  (id, d)   => apiRequest('PUT',    `/shops/${id}`, d),
  deleteShop:  (id)      => apiRequest('DELETE', `/shops/${id}`),

  // Products
  getProducts:   ()      => apiRequest('GET',    '/products/'),
  addProduct:    (d)     => apiRequest('POST',   '/products/add', d),
  updateProduct: (id, d) => apiRequest('PUT',    `/products/${id}`, d),

  // Inventory
  getInventory:   ()     => apiRequest('GET',    '/inventory/'),
  scanImei:       (d)    => apiRequest('POST',   '/inventory/scan', d),
  stockAccessory: (d)    => apiRequest('POST',   '/inventory/stock-accessory', d),

  // Sales
  checkout:        (d)   => apiRequest('POST',   '/sales/checkout',      d),
  sellAccessory:   (d)   => apiRequest('POST',   '/sales/sell-accessory', d),
  getSalesHistory: ()    => apiRequest('GET',    '/sales/history'),

  // Users (admin: full CRUD; self: change-password)
  getUsers:         ()       => apiRequest('GET',    '/users/'),
  createUser:       (d)      => apiRequest('POST',   '/users/',              d),
  deleteUser:       (id)     => apiRequest('DELETE', `/users/${id}`),
  reassignUserShop: (id, d)  => apiRequest('PATCH',  `/users/${id}/shop`,    d),
};

window.api = api;
