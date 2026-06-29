/**
 * shops.js — Branch management page (admin only).
 * Features: add/edit/delete branches, view and reassign staff per branch.
 */

let allShops = [];
let allUsers = [];
let selectedShopId = null;

document.addEventListener('DOMContentLoaded', async () => {
  const { role } = getSession();
  if (role !== 'admin') {
    showAlert('Admin access required.', 'error');
    setTimeout(() => window.location.replace('dashboard.html'), 1500);
    return;
  }

  await loadAll();
  setupShopModal();
  setupChangePwdModal();
});

// ── Data ─────────────────────────────────────────────────────────────────────
async function loadAll() {
  try {
    [allShops, allUsers] = await Promise.all([api.getShops(), api.getUsers()]);
    renderShopGrid();
    if (selectedShopId) renderBranchStaff(selectedShopId);
  } catch (err) {
    showAlert('Failed to load data: ' + err.message, 'error');
  }
}

// ── Branch grid ───────────────────────────────────────────────────────────────
function renderShopGrid() {
  const grid = document.getElementById('shopsGrid');
  if (!allShops.length) {
    grid.innerHTML = '<p class="table-empty">No branches yet. Add one above.</p>';
    return;
  }

  grid.innerHTML = allShops.map(shop => {
    const staff     = allUsers.filter(u => u.shop_id === shop.id);
    const isActive  = shop.id === selectedShopId;
    return `
      <div class="shop-card glass ${isActive ? 'shop-card-active' : ''}"
           onclick="selectShop(${shop.id})" id="shopCard_${shop.id}">
        <div class="shop-card-top">
          <div class="shop-card-icon">🏪</div>
          <div class="shop-card-menu">
            <button class="btn-icon" onclick="event.stopPropagation(); openEditShop(${shop.id})" title="Edit">✏️</button>
            <button class="btn-icon btn-icon-danger" onclick="event.stopPropagation(); deleteShop(${shop.id}, '${shop.name}')" title="Delete">🗑️</button>
          </div>
        </div>
        <h4 class="shop-card-name">${shop.name}</h4>
        <p class="shop-card-location">${shop.location || 'No location set'}</p>
        <div class="shop-card-stats">
          <span class="shop-stat"><strong>${staff.length}</strong> staff</span>
          <span class="shop-stat"><strong>${staff.filter(u=>u.role==='cashier').length}</strong> cashiers</span>
        </div>
      </div>`;
  }).join('');
}

// ── Select branch → show staff ─────────────────────────────────────────────
window.selectShop = function(shopId) {
  selectedShopId = shopId;
  renderShopGrid();
  renderBranchStaff(shopId);
};

function renderBranchStaff(shopId) {
  const shop   = allShops.find(s => s.id === shopId);
  const staff  = allUsers.filter(u => u.shop_id === shopId);
  const { username: me } = getSession();

  document.getElementById('staffCardTitle').textContent =
    `Staff at ${shop ? shop.name : 'Branch'} (${staff.length})`;

  const tbody = document.getElementById('branchStaffTbody');

  if (!staff.length) {
    tbody.innerHTML = '<tr><td colspan="4" class="table-empty">No staff assigned to this branch.</td></tr>';
    return;
  }

  tbody.innerHTML = staff.map((u, i) => {
    const isMe = u.username === me;
    const otherShops = allShops.filter(s => s.id !== shopId);
    const moveOptions = otherShops.map(s =>
      `<option value="${s.id}">${s.name}</option>`
    ).join('');

    return `
      <tr ${isMe ? 'class="current-user-row"' : ''}>
        <td>${i + 1}</td>
        <td>
          ${u.username}
          ${isMe ? '<span class="you-tag">You</span>' : ''}
        </td>
        <td><span class="badge badge-role-${u.role}">${u.role}</span></td>
        <td class="action-cell">
          ${otherShops.length > 0 && !isMe ? `
            <select class="reassign-select" id="reassign_${u.id}">
              <option value="">Move to…</option>
              ${moveOptions}
            </select>
            <button class="btn-action" onclick="reassignUser(${u.id})">Move</button>
          ` : '—'}
          ${!isMe ? `
            <button class="btn-action btn-action-danger" onclick="removeUser(${u.id}, '${u.username}')">Remove</button>
          ` : ''}
        </td>
      </tr>`;
  }).join('');
}

// ── Reassign user to another branch ──────────────────────────────────────────
window.reassignUser = async function(userId) {
  const sel = document.getElementById(`reassign_${userId}`);
  const shopId = parseInt(sel.value);
  if (!shopId) { showAlert('Select a branch first.', 'error'); return; }

  try {
    await api.reassignUserShop(userId, { shop_id: shopId });
    showAlert('User moved to new branch.');
    await loadAll();
  } catch (err) {
    showAlert('Failed to reassign: ' + err.message, 'error');
  }
};

// ── Delete user ───────────────────────────────────────────────────────────────
window.removeUser = async function(userId, username) {
  if (!confirm(`Remove "${username}" permanently? This cannot be undone.`)) return;
  try {
    await api.deleteUser(userId);
    showAlert(`"${username}" removed.`);
    await loadAll();
  } catch (err) {
    showAlert(err.message, 'error');
  }
};

// ── Delete branch ────────────────────────────────────────────────────────────
window.deleteShop = async function(shopId, shopName) {
  if (!confirm(`Delete branch "${shopName}"? The branch must have no inventory.`)) return;
  try {
    await api.deleteShop(shopId);
    showAlert(`Branch "${shopName}" deleted.`);
    if (selectedShopId === shopId) {
      selectedShopId = null;
      document.getElementById('staffCardTitle').textContent = 'Select a branch to view its staff';
      document.getElementById('branchStaffTbody').innerHTML =
        '<tr><td colspan="4" class="table-empty">Click a branch card above.</td></tr>';
    }
    await loadAll();
  } catch (err) {
    showAlert(err.message, 'error');
  }
};

// ── Edit branch ───────────────────────────────────────────────────────────────
window.openEditShop = function(shopId) {
  const shop = allShops.find(s => s.id === shopId);
  if (!shop) return;
  document.getElementById('shopModalTitle').textContent = 'Edit Branch';
  document.getElementById('shopSubmitBtn').textContent  = 'Save Changes';
  document.getElementById('editShopId').value    = shop.id;
  document.getElementById('shopName').value      = shop.name;
  document.getElementById('shopLocation').value  = shop.location || '';
  document.getElementById('addShopModal').classList.remove('hidden');
};

// ── Shop modal ────────────────────────────────────────────────────────────────
function setupShopModal() {
  document.getElementById('openAddShopModal').addEventListener('click', () => {
    document.getElementById('shopModalTitle').textContent = 'Add New Branch';
    document.getElementById('shopSubmitBtn').textContent  = 'Create Branch';
    document.getElementById('editShopId').value = '';
    document.getElementById('addShopForm').reset();
    hideError('addShopError');
    document.getElementById('addShopModal').classList.remove('hidden');
  });

  document.getElementById('addShopForm').addEventListener('submit', async (e) => {
    e.preventDefault();
    hideError('addShopError');

    const id       = document.getElementById('editShopId').value;
    const name     = document.getElementById('shopName').value.trim();
    const location = document.getElementById('shopLocation').value.trim();
    const btn      = document.getElementById('shopSubmitBtn');

    btn.disabled = true;
    btn.textContent = 'Saving…';

    try {
      if (id) {
        await api.updateShop(parseInt(id), { name, location });
        showAlert(`Branch "${name}" updated.`);
      } else {
        await api.createShop({ name, location });
        showAlert(`Branch "${name}" created.`);
      }
      document.getElementById('addShopModal').classList.add('hidden');
      await loadAll();
    } catch (err) {
      showError('addShopError', err.message);
    } finally {
      btn.disabled = false;
      btn.textContent = id ? 'Save Changes' : 'Create Branch';
    }
  });
}

// ── Global change-password modal ──────────────────────────────────────────────
function setupChangePwdModal() {
  const { username, role, shopId } = getSession();

  document.getElementById('pwdModalAvatar').textContent   = (username || '?')[0].toUpperCase();
  document.getElementById('pwdModalUsername').textContent = username || '—';
  document.getElementById('pwdModalRole').textContent     = `Role: ${role}`;

  // Populate shop name
  api.getShops().then(shops => {
    const shop = shops.find(s => s.id === parseInt(shopId));
    document.getElementById('pwdModalShop').textContent = `Branch: ${shop ? shop.name : `#${shopId}`}`;
  }).catch(() => {});

  // Open via sidebar chip
  document.getElementById('myAccountTrigger').addEventListener('click', () => {
    document.getElementById('gPwdError').classList.add('hidden');
    document.getElementById('gPwdSuccess').classList.add('hidden');
    document.getElementById('globalChangePwdForm').reset();
    document.getElementById('changePwdModal').classList.remove('hidden');
  });

  // Password toggles
  document.querySelectorAll('#changePwdModal .pwd-toggle').forEach(btn => {
    btn.addEventListener('click', () => {
      const t = document.getElementById(btn.dataset.target);
      t.type = t.type === 'text' ? 'password' : 'text';
      btn.innerHTML = t.type === 'text' ? '<i class="fa-regular fa-eye-slash"></i>' : '<i class="fa-regular fa-eye"></i>';
    });
  });

  // Submit
  document.getElementById('globalChangePwdForm').addEventListener('submit', async (e) => {
    e.preventDefault();
    hideError('gPwdError');
    document.getElementById('gPwdSuccess').classList.add('hidden');

    const current = document.getElementById('gCurrentPwd').value;
    const next    = document.getElementById('gNewPwd').value;
    const confirm = document.getElementById('gConfirmPwd').value;

    if (next !== confirm) { showError('gPwdError', 'New passwords do not match.'); return; }
    if (next.length < 8)  { showError('gPwdError', 'Password must be at least 8 characters.'); return; }

    const btn = e.target.querySelector('[type=submit]');
    btn.disabled = true; btn.textContent = 'Updating…';

    try {
      const res = await api.changePassword({
        current_password: current,
        new_password:     next,
        confirm_password: confirm,
      });
      const ok = document.getElementById('gPwdSuccess');
      ok.textContent = '✅ ' + res.message;
      ok.classList.remove('hidden');
      document.getElementById('globalChangePwdForm').reset();
      showAlert('Password updated successfully!');
    } catch (err) {
      showError('gPwdError', err.message);
    } finally {
      btn.disabled = false; btn.textContent = 'Update Password';
    }
  });
}
