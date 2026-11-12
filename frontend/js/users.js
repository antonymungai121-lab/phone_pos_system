/**
 * users.js — Admin user management page.
 * Features:
 *  - User card grid + searchable table
 *  - Create new user (admin only)
 *  - Admin can reset any other user's password
 *  - Admin can delete any other user
 *  - My Account modal — change own password
 *  - Password visibility toggles (re-wired each time a modal opens)
 */

let allUsers = [];
let allShops = [];

// Target user ID for reset-password modal
let _resetTargetId = null;

const ROLE_HINTS = {
  cashier: '<strong>Cashier</strong> — Can process sales and view inventory.',
  manager: '<strong>Manager</strong> — Can also add products and stock inventory.',
  admin:   '<strong>Admin</strong> — Full access: manage users, shops, and all data.',
};

document.addEventListener('DOMContentLoaded', async () => {
  const { role, username, shopId } = getSession();

  // Only admins may access this page (belt-and-suspenders; app.js also redirects)
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

    const actions = isMe
      // For the logged-in admin: only own-password button (via My Account)
      ? `<button class="btn-action" onclick="openMyAccount()">🔑 My Password</button>`
      // For other users: Reset Pwd + Delete
      : `<button class="btn-action" onclick="openResetPwd(${u.id},'${u.username}')">🔑 Reset Pwd</button>
         <button class="btn-action btn-action-danger" onclick="confirmDeleteUser(${u.id},'${u.username}')">🗑 Delete</button>`;

    return `
      <tr ${isMe ? 'class="current-user-row"' : ''}>
        <td>${i + 1}</td>
        <td>
          <span class="user-table-name">${u.username}</span>
          ${isMe ? '<span class="you-tag">You</span>' : ''}
        </td>
        <td><span class="badge badge-role-${u.role}">${u.role}</span></td>
        <td>${shopName}</td>
        <td style="display:flex;gap:6px;flex-wrap:wrap">${actions}</td>
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

// ── Helper: attach pwd-toggle handlers inside a container ─────────────────────
function wirePwdToggles(container) {
  container.querySelectorAll('.pwd-toggle').forEach(btn => {
    // Clone to remove any old listeners
    const fresh = btn.cloneNode(true);
    btn.parentNode.replaceChild(fresh, btn);
    fresh.addEventListener('click', () => {
      const t = document.getElementById(fresh.dataset.target);
      if (!t) return;
      const show = t.type === 'password';
      t.type = show ? 'text' : 'password';
      fresh.innerHTML = show
        ? '<i class="fa-regular fa-eye-slash"></i>'
        : '<i class="fa-regular fa-eye"></i>';
    });
  });
}

// ── Modals ────────────────────────────────────────────────────────────────────
function openMyAccount() {
  const m = document.getElementById('myAccountModal');
  m.classList.remove('hidden');
  document.getElementById('pwdChangeError').classList.add('hidden');
  document.getElementById('pwdChangeSuccess').classList.add('hidden');
  document.getElementById('changePasswordForm').reset();
  wirePwdToggles(m);
}
window.openMyAccount = openMyAccount;

function openResetPwd(userId, username) {
  _resetTargetId = userId;
  document.getElementById('resetPwdTarget').textContent =
    `Resetting password for: ${username}`;
  document.getElementById('resetPwdError').classList.add('hidden');
  document.getElementById('resetPwdSuccess').classList.add('hidden');
  document.getElementById('resetPwdForm').reset();
  const m = document.getElementById('resetPwdModal');
  m.classList.remove('hidden');
  wirePwdToggles(m);
}
window.openResetPwd = openResetPwd;

async function confirmDeleteUser(userId, username) {
  if (!confirm(`Delete user "${username}"? This cannot be undone.`)) return;
  try {
    await api.deleteUser(userId);
    showAlert(`User "${username}" deleted.`, 'success');
    await loadAll();
  } catch (err) {
    showAlert('Delete failed: ' + err.message, 'error');
  }
}
window.confirmDeleteUser = confirmDeleteUser;

function setupModals() {
  // ── Open Add User modal ───────────────────────────────────────────────────
  document.getElementById('openAddUserModal').addEventListener('click', () => {
    hideError('addUserError');
    document.getElementById('addUserForm').reset();
    const m = document.getElementById('addUserModal');
    m.classList.remove('hidden');
    wirePwdToggles(m);
  });

  document.getElementById('openMyAccountModal').addEventListener('click', openMyAccount);

  // Role hint
  document.getElementById('newRole').addEventListener('change', e => {
    document.getElementById('roleHint').innerHTML = ROLE_HINTS[e.target.value] || '';
  });

  // ── Add User form submit ──────────────────────────────────────────────────
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

  // ── Reset Password form submit (admin resets other user's password) ────────
  document.getElementById('resetPwdForm').addEventListener('submit', async (e) => {
    e.preventDefault();
    hideError('resetPwdError');
    document.getElementById('resetPwdSuccess').classList.add('hidden');

    const newPwd     = document.getElementById('resetNewPwd').value;
    const confirmPwd = document.getElementById('resetConfirmPwd').value;

    if (newPwd !== confirmPwd) {
      showError('resetPwdError', 'Passwords do not match.'); return;
    }
    if (newPwd.length < 8) {
      showError('resetPwdError', 'Minimum 8 characters required.'); return;
    }

    const btn = e.target.querySelector('[type=submit]');
    btn.disabled = true; btn.textContent = 'Resetting…';

    try {
      const res = await api.adminResetPassword(_resetTargetId, { new_password: newPwd });
      const ok = document.getElementById('resetPwdSuccess');
      ok.textContent = '✅ ' + res.message;
      ok.classList.remove('hidden');
      document.getElementById('resetPwdForm').reset();
      showAlert(res.message);
      setTimeout(() => document.getElementById('resetPwdModal').classList.add('hidden'), 2000);
    } catch (err) {
      showError('resetPwdError', err.message);
    } finally {
      btn.disabled = false; btn.textContent = '🔑 Reset Password';
    }
  });

  // ── Change Own Password form submit ───────────────────────────────────────
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
