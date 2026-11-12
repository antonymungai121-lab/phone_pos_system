/**
 * app.js — Shared utilities loaded on every authenticated app page.
 * Handles: auth guard, session data, sidebar population, logout, clock,
 *          global Change-Password modal (accessible to ALL roles).
 */

// ── Auth guard ──────────────────────────────────────────────────────────────
(function authGuard() {
  if (!sessionStorage.getItem('pos_token')) {
    window.location.replace('index.html');
  }
})();

// ── Session helpers ──────────────────────────────────────────────────────────
function getSession() {
  return {
    token:    sessionStorage.getItem('pos_token'),
    username: sessionStorage.getItem('pos_username'),
    shopId:   parseInt(sessionStorage.getItem('pos_shop_id'), 10),
    role:     sessionStorage.getItem('pos_role'),
    shopName: sessionStorage.getItem('pos_shop_name') || `Shop #${sessionStorage.getItem('pos_shop_id')}`,
  };
}

// ── Populate sidebar ─────────────────────────────────────────────────────────
(async function populateSidebar() {
  const { username, role, shopId } = getSession();

  const avatarEl   = document.getElementById('userAvatar');
  const usernameEl = document.getElementById('sidebarUsername');
  const roleEl     = document.getElementById('sidebarRole');
  const shopBadge  = document.getElementById('shopBadge');

  if (avatarEl)   avatarEl.textContent   = (username || '?')[0].toUpperCase();
  if (usernameEl) usernameEl.textContent = username || '—';
  if (roleEl)     roleEl.textContent     = role || '—';

  // ── Cashier: hide Products, Users, Branches nav items ──────────────────
  if (role === 'cashier') {
    document.querySelectorAll('[data-page="products"], [data-page="users"], [data-page="shops"]')
      .forEach(el => el.style.display = 'none');

    // If cashier lands on a restricted page, bounce them to dashboard
    const restrictedPages = ['products.html', 'users.html', 'shops.html'];
    if (restrictedPages.some(p => window.location.pathname.endsWith(p))) {
      window.location.replace('dashboard.html');
      return;
    }
  }

  // ── Manager: hide Users and Branches nav items ──────────────────────────
  if (role === 'manager') {
    document.querySelectorAll('[data-page="users"], [data-page="shops"]')
      .forEach(el => el.style.display = 'none');

    // If manager lands on a restricted page, bounce them to dashboard
    const managerRestricted = ['users.html', 'shops.html'];
    if (managerRestricted.some(p => window.location.pathname.endsWith(p))) {
      window.location.replace('dashboard.html');
      return;
    }
  }

  try {
    const shops  = await api.getShops();
    const shop   = shops.find(s => s.id === shopId);
    const name   = shop ? shop.name : `Shop #${shopId}`;
    sessionStorage.setItem('pos_shop_name', name);
    if (shopBadge) shopBadge.textContent = name;
  } catch {
    if (shopBadge) shopBadge.textContent = `Shop #${shopId}`;
  }
})();

// ── DOMContentLoaded — wire up all interactive elements ──────────────────────
document.addEventListener('DOMContentLoaded', () => {

  // Logout
  const logoutBtn = document.getElementById('logoutBtn');
  if (logoutBtn) {
    logoutBtn.addEventListener('click', () => {
      sessionStorage.clear();
      window.location.replace('index.html');
    });
  }

  // Live clock
  const timeEl = document.getElementById('topbarTime');
  function updateClock() {
    if (timeEl) timeEl.textContent = new Date().toLocaleTimeString('en-KE', {
      hour: '2-digit', minute: '2-digit', second: '2-digit',
    });
  }
  updateClock();
  setInterval(updateClock, 1000);

  // Generic [data-close] modal buttons
  document.querySelectorAll('[data-close]').forEach(btn => {
    btn.addEventListener('click', () => {
      const m = document.getElementById(btn.getAttribute('data-close'));
      if (m) m.classList.add('hidden');
    });
  });

  // Close modal on overlay background click
  document.querySelectorAll('.modal-overlay').forEach(overlay => {
    overlay.addEventListener('click', e => {
      if (e.target === overlay) overlay.classList.add('hidden');
    });
  });

  // Global password toggles (any .pwd-toggle on the page)
  document.querySelectorAll('.pwd-toggle').forEach(btn => {
    btn.addEventListener('click', () => {
      const t = document.getElementById(btn.dataset.target);
      if (!t) return;
      t.type = t.type === 'text' ? 'password' : 'text';
      btn.innerHTML = t.type === 'text' ? '<i class="fa-regular fa-eye-slash"></i>' : '<i class="fa-regular fa-eye"></i>';
    });
  });

  // ── Global "My Account" modal — available on every page ────────────────
  initMyAccountModal();
});

// ── My Account / Change Password — injected into every page ─────────────────
function initMyAccountModal() {
  const { username, role, shopId } = getSession();

  // Create modal HTML if not already in page (shops.html has its own)
  if (!document.getElementById('changePwdModal')) {
    const modal = document.createElement('div');
    modal.innerHTML = `
      <div id="changePwdModal" class="modal-overlay hidden" role="dialog">
        <div class="modal-box glass">
          <div class="modal-header">
            <h3>My Account</h3>
            <button class="modal-close" data-close="changePwdModal">✕</button>
          </div>
          <div class="account-info-card glass" style="margin-bottom:20px">
            <div class="account-avatar" id="pwdModalAvatar">A</div>
            <div class="account-details">
              <p class="account-username" id="pwdModalUsername">—</p>
              <p class="account-meta"    id="pwdModalRole">—</p>
              <p class="account-meta"    id="pwdModalShop">—</p>
            </div>
          </div>
          <div class="section-divider"><span>Change Password</span></div>
          <form id="globalChangePwdForm" class="pos-form" style="margin-top:16px">
            <div class="form-group">
              <label for="gCurrentPwd">Current Password</label>
              <div class="input-wrap">
                <span class="input-icon">🔒</span>
                <input type="password" id="gCurrentPwd" placeholder="Current password" required />
                <button type="button" class="pwd-toggle" data-target="gCurrentPwd">👁</button>
              </div>
            </div>
            <div class="form-group">
              <label for="gNewPwd">New Password</label>
              <div class="input-wrap">
                <span class="input-icon">🔑</span>
                <input type="password" id="gNewPwd" placeholder="Minimum 8 characters" minlength="8" required />
                <button type="button" class="pwd-toggle" data-target="gNewPwd">👁</button>
              </div>
            </div>
            <div class="form-group">
              <label for="gConfirmPwd">Confirm Password</label>
              <div class="input-wrap">
                <span class="input-icon">✅</span>
                <input type="password" id="gConfirmPwd" placeholder="Re-enter new password" minlength="8" required />
              </div>
            </div>
            <div id="gPwdError"   class="alert alert-error   hidden"></div>
            <div id="gPwdSuccess" class="alert alert-success hidden"></div>
            <div class="modal-actions">
              <button type="button" class="btn btn-ghost" data-close="changePwdModal">Close</button>
              <button type="submit" class="btn btn-primary">Update Password</button>
            </div>
          </form>
        </div>
      </div>`;
    document.body.appendChild(modal.firstElementChild);

    // Re-attach data-close for the new modal
    document.querySelectorAll('[data-close="changePwdModal"]').forEach(btn => {
      btn.addEventListener('click', () => {
        document.getElementById('changePwdModal').classList.add('hidden');
      });
    });

    // Re-attach pwd toggles inside the new modal
    document.querySelectorAll('#changePwdModal .pwd-toggle').forEach(btn => {
      btn.addEventListener('click', () => {
        const t = document.getElementById(btn.dataset.target);
        if (!t) return;
        t.type = t.type === 'text' ? 'password' : 'text';
        btn.innerHTML = t.type === 'text' ? '<i class="fa-regular fa-eye-slash"></i>' : '<i class="fa-regular fa-eye"></i>';
      });
    });

    // Close on overlay click
    document.getElementById('changePwdModal').addEventListener('click', e => {
      if (e.target === document.getElementById('changePwdModal'))
        document.getElementById('changePwdModal').classList.add('hidden');
    });
  }

  // Fill in user info
  const avatarEl   = document.getElementById('pwdModalAvatar');
  const usernameEl = document.getElementById('pwdModalUsername');
  const roleEl     = document.getElementById('pwdModalRole');
  const shopEl     = document.getElementById('pwdModalShop');

  if (avatarEl)   avatarEl.textContent   = (username || '?')[0].toUpperCase();
  if (usernameEl) usernameEl.textContent = username || '—';
  if (roleEl)     roleEl.textContent     = `Role: ${role}`;

  // Get shop name async
  api.getShops().then(shops => {
    const shop = shops.find(s => s.id === shopId);
    if (shopEl) shopEl.textContent = `Branch: ${shop ? shop.name : `#${shopId}`}`;
  }).catch(() => {});

  // Trigger — sidebar user chip
  const trigger = document.getElementById('myAccountTrigger');
  if (trigger) {
    trigger.addEventListener('click', openMyAccountModal);
    trigger.style.cursor = 'pointer';
    trigger.title = 'My Account';
  }

  // Change password form submit
  const form = document.getElementById('globalChangePwdForm');
  if (form && !form.dataset.wired) {
    form.dataset.wired = '1';
    form.addEventListener('submit', async (e) => {
      e.preventDefault();
      hideError('gPwdError');
      document.getElementById('gPwdSuccess').classList.add('hidden');

      const current = document.getElementById('gCurrentPwd').value;
      const next    = document.getElementById('gNewPwd').value;
      const confirm = document.getElementById('gConfirmPwd').value;

      if (next !== confirm) { showError('gPwdError', 'Passwords do not match.'); return; }
      if (next.length < 8)  { showError('gPwdError', 'Minimum 8 characters.'); return; }

      const btn = form.querySelector('[type=submit]');
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
        form.reset();
        showAlert('Password updated!');
      } catch (err) {
        showError('gPwdError', err.message);
      } finally {
        btn.disabled = false; btn.textContent = 'Update Password';
      }
    });
  }
}

function openMyAccountModal() {
  const m = document.getElementById('changePwdModal');
  if (m) {
    document.getElementById('gPwdError').classList.add('hidden');
    document.getElementById('gPwdSuccess').classList.add('hidden');
    document.getElementById('globalChangePwdForm').reset();
    m.classList.remove('hidden');
  }
}
window.openMyAccountModal = openMyAccountModal;

// ── UI helpers ────────────────────────────────────────────────────────────────
function showError(id, msg) {
  const el = document.getElementById(id);
  if (el) { el.textContent = `⚠ ${msg}`; el.classList.remove('hidden'); }
}
function hideError(id) {
  const el = document.getElementById(id);
  if (el) el.classList.add('hidden');
}
function showAlert(message, type = 'success') {
  const div = document.createElement('div');
  div.className = `toast toast-${type}`;
  div.textContent = message;
  document.body.appendChild(div);
  setTimeout(() => div.classList.add('show'), 10);
  setTimeout(() => { div.classList.remove('show'); setTimeout(() => div.remove(), 400); }, 3500);
}
function fmtKES(amount) {
  return `KES ${Number(amount).toLocaleString('en-KE', { minimumFractionDigits: 2 })}`;
}
function fmtDateTime(iso) {
  if (!iso) return '—';
  return new Date(iso).toLocaleString('en-KE', { dateStyle: 'medium', timeStyle: 'short' });
}

window.getSession  = getSession;
window.showError   = showError;
window.hideError   = hideError;
window.showAlert   = showAlert;
window.fmtKES      = fmtKES;
window.fmtDateTime = fmtDateTime;
