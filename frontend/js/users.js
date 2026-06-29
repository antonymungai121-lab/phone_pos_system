/**
 * users.js — Admin user management page.
 * Features: user card grid, searchable table, add user modal,
 *           My Account modal with change-password.
 */

let allUsers = [];
let allShops = [];

const ROLE_HINTS = {
  cashier: '<strong>Cashier</strong> — Can process sales and view inventory.',
  manager: '<strong>Manager</strong> — Can also add products and stock inventory.',
  admin:   '<strong>Admin</strong> — Full access: manage users, shops, and all data.',
};

document.addEventListener('DOMContentLoaded', async () => {
  const { role, username, shopId } = getSession();

  // Only admins may access this page
  if (role !== 'admin') {
    showAlert('Access denied. Admins only.', 'error');
    setTimeout(() => window.location.replace('dashboard.html'), 1500);
    return;
  }

  // Pre-fill My Account modal
  document.getElementById('modalAvatar').textContent   = username[0].toUpperCase();
  document.getElementById('modalUsername').textContent = username;
  document.getElementById('modalRole').textContent     = `Role: ${role}`;

  await loadAll();
  setupSearch();
  setupModals();
  setupPasswordToggles();
});

// ── Data loading ──────────────────────────────────────────────────────────────
async function loadAll() {
  try {
    [allUsers, allShops] = await Promise.all([api.getUsers(), api.getShops()]);
    renderStats();
    renderCards();
    renderTable(allUsers);

    // Fill My Account shop name
    const { shopId } = getSession();
    const shop = allShops.find(s => s.id === shopId);
    document.getElementById('modalShop').textContent =
      `Shop: ${shop ? shop.name : `#${shopId}`}`;

    // Populate shop dropdown in Add User modal
    const sel = document.getElementById('newShop');
    sel.innerHTML = '<option value="">— select shop —</option>';
    allShops.forEach(s => {
      const opt = document.createElement('option');
      opt.value = s.id;
      opt.textContent = `${s.name}${s.location ? ' · ' + s.location : ''}`;
      sel.appendChild(opt);
    });
  } catch (err) {
    showAlert('Failed to load users: ' + err.message, 'error');
  }
}

// ── Stats bar ─────────────────────────────────────────────────────────────────
function renderStats() {
  document.getElementById('statTotal').textContent   = allUsers.length;
  document.getElementById('statAdmin').textContent   = allUsers.filter(u => u.role === 'admin').length;
  document.getElementById('statManager').textContent = allUsers.filter(u => u.role === 'manager').length;
  document.getElementById('statCashier').textContent = allUsers.filter(u => u.role === 'cashier').length;
}

// ── User cards ────────────────────────────────────────────────────────────────
function renderCards() {
  const grid = document.getElementById('usersGrid');
  if (!allUsers.length) {
    grid.innerHTML = '<p class="table-empty">No users found.</p>';
    return;
  }
  grid.innerHTML = allUsers.map(u => {
    const shop = allShops.find(s => s.id === u.shop_id);
    const shopName = shop ? shop.name : `Shop #${u.shop_id}`;
    return `
      <div class="user-card glass">
        <div class="user-card-avatar role-${u.role}">${u.username[0].toUpperCase()}</div>
        <div class="user-card-info">
          <p class="user-card-name">${u.username}</p>
          <p class="user-card-shop">${shopName}</p>
        </div>
        <span class="badge badge-role-${u.role}">${u.role}</span>
      </div>`;
  }).join('');
}

// ── Users table ───────────────────────────────────────────────────────────────
function renderTable(users) {
  const tbody = document.getElementById('usersTbody');
  const { username: me } = getSession();

  if (!users.length) {
    tbody.innerHTML = '<tr><td colspan="5" class="table-empty">No users found.</td></tr>';
    return;
  }
  tbody.innerHTML = users.map((u, i) => {
    const shop = allShops.find(s => s.id === u.shop_id);
    const shopName = shop ? shop.name : `Shop #${u.shop_id}`;
    const isMe = u.username === me;
    return `
      <tr ${isMe ? 'class="current-user-row"' : ''}>
        <td>${i + 1}</td>
        <td>
          <span class="user-table-name">${u.username}</span>
          ${isMe ? '<span class="you-tag">You</span>' : ''}
        </td>
        <td><span class="badge badge-role-${u.role}">${u.role}</span></td>
        <td>${shopName}</td>
        <td>
          ${isMe
            ? `<button class="btn-action" onclick="openMyAccount()">🔑 Password</button>`
            : `<span class="txt-muted" style="font-size:.8rem">—</span>`
          }
        </td>
      </tr>`;
  }).join('');
}

// ── Search ────────────────────────────────────────────────────────────────────
function setupSearch() {
  document.getElementById('userSearch').addEventListener('input', e => {
    const q = e.target.value.toLowerCase();
    renderTable(q ? allUsers.filter(u => u.username.toLowerCase().includes(q)) : allUsers);
  });
}

// ── Modals ────────────────────────────────────────────────────────────────────
function openMyAccount() {
  document.getElementById('myAccountModal').classList.remove('hidden');
}
window.openMyAccount = openMyAccount;

function setupModals() {
  // Open modals
  document.getElementById('openAddUserModal').addEventListener('click', () => {
    hideError('addUserError');
    document.getElementById('addUserForm').reset();
    document.getElementById('addUserModal').classList.remove('hidden');
  });

  document.getElementById('openMyAccountModal').addEventListener('click', openMyAccount);

  // Role hint update
  document.getElementById('newRole').addEventListener('change', e => {
    document.getElementById('roleHint').innerHTML = ROLE_HINTS[e.target.value] || '';
  });

  // ── Add User form ─────────────────────────────────────────────────────────
  document.getElementById('addUserForm').addEventListener('submit', async (e) => {
    e.preventDefault();
    hideError('addUserError');

    const username = document.getElementById('newUsername').value.trim();
    const password = document.getElementById('newPassword').value;
    const role     = document.getElementById('newRole').value;
    const shopId   = document.getElementById('newShop').value;

    if (!shopId) { showError('addUserError', 'Please select a shop.'); return; }
    if (password.length < 8) { showError('addUserError', 'Password must be at least 8 characters.'); return; }

    const btn = e.target.querySelector('[type=submit]');
    btn.disabled = true; btn.textContent = 'Creating…';

    try {
      await api.createUser({ username, password, role, shop_id: parseInt(shopId) });
      showAlert(`User "${username}" created as ${role}!`);
      document.getElementById('addUserModal').classList.add('hidden');
      document.getElementById('addUserForm').reset();
      await loadAll();
    } catch (err) {
      showError('addUserError', err.message);
    } finally {
      btn.disabled = false; btn.textContent = 'Create User';
    }
  });

  // ── Change Password form ──────────────────────────────────────────────────
  document.getElementById('changePasswordForm').addEventListener('submit', async (e) => {
    e.preventDefault();
    hideError('pwdChangeError');
    document.getElementById('pwdChangeSuccess').classList.add('hidden');

    const currentPwd = document.getElementById('currentPwd').value;
    const newPwd     = document.getElementById('newPwd').value;
    const confirmPwd = document.getElementById('confirmPwd').value;

    if (newPwd !== confirmPwd) {
      showError('pwdChangeError', 'New passwords do not match.'); return;
    }
    if (newPwd.length < 8) {
      showError('pwdChangeError', 'New password must be at least 8 characters.'); return;
    }

    const btn = e.target.querySelector('[type=submit]');
    btn.disabled = true; btn.textContent = 'Updating…';

    try {
      const res = await api.changePassword({
        current_password: currentPwd,
        new_password:     newPwd,
        confirm_password: confirmPwd,
      });
      const successEl = document.getElementById('pwdChangeSuccess');
      successEl.textContent = '✅ ' + res.message;
      successEl.classList.remove('hidden');
      document.getElementById('changePasswordForm').reset();
      showAlert('Password updated successfully!');
    } catch (err) {
      showError('pwdChangeError', err.message);
    } finally {
      btn.disabled = false; btn.textContent = 'Update Password';
    }
  });
}

// ── Password visibility toggles ───────────────────────────────────────────────
function setupPasswordToggles() {
  document.querySelectorAll('.pwd-toggle').forEach(btn => {
    btn.addEventListener('click', () => {
      const target = document.getElementById(btn.dataset.target);
      const isText = target.type === 'text';
      target.type = isText ? 'password' : 'text';
      btn.innerHTML = isText ? '<i class="fa-regular fa-eye"></i>' : '<i class="fa-regular fa-eye-slash"></i>';
    });
  });
}
