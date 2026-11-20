/**
 * login.js — handles the Login tab and Create Account tab.
 *
 * Logic:
 * - On load, calls GET /auth/status to determine if registration is open.
 * - If registration_open = true  → Create Account tab shows first-time setup fields.
 * - If registration_open = false → Create Account tab shows "contact your admin" message.
 * - On successful login OR register, saves session to sessionStorage and redirects.
 */

document.addEventListener('DOMContentLoaded', async () => {

  // ── Already logged in? Go straight to dashboard ──────────────────────────
  if (sessionStorage.getItem('pos_token')) {
    window.location.replace('dashboard.html');
    return;
  }

  // ── Check system status (is registration open?) ───────────────────────────
  let registrationOpen = true; // Default to open for first-time admin setup
  let serverReachable = false;
  try {
    const status = await api.authStatus();
    serverReachable = true;
    registrationOpen = (status.registration_open !== false);

    // If first-time setup, pre-select the Create Account tab and hint the user
    if (registrationOpen) {
      switchTab('register');
    }
  } catch {
    // Server unreachable (cold start, CORS, etc.) — allow user to try registering
    registrationOpen = true;
    switchTab('register');
  }

  // ── Tab switching ─────────────────────────────────────────────────────────
  document.querySelectorAll('.auth-tab').forEach(btn => {
    btn.addEventListener('click', () => switchTab(btn.dataset.tab));
  });

  function switchTab(tab) {
    document.querySelectorAll('.auth-tab').forEach(b => b.classList.remove('active'));
    document.getElementById(tab === 'login' ? 'tabLogin' : 'tabRegister').classList.add('active');

    document.getElementById('loginForm').classList.toggle('hidden', tab !== 'login');
    document.getElementById('registerForm').classList.toggle('hidden', tab !== 'register');

    if (tab === 'register') showRegisterState();
  }

  // ── Populate register form based on registration status ──────────────────
  function showRegisterState() {
    const notice  = document.getElementById('setupNotice');
    const closed  = document.getElementById('registrationClosed');
    const fields  = document.getElementById('registerFields');
    const shopFld = document.getElementById('shopFields');

    if (registrationOpen) {
      notice.classList.remove('hidden');
      closed.classList.add('hidden');
      shopFld.classList.remove('hidden');
      fields.style.pointerEvents = '';
      fields.style.opacity = '';
      // Ensure form fields are visible
      document.getElementById('regUsername').closest('.form-group').classList.remove('hidden');
      document.getElementById('regPassword').closest('.form-group').classList.remove('hidden');
      document.getElementById('regConfirm').closest('.form-group').classList.remove('hidden');
      document.getElementById('registerBtn').classList.remove('hidden');

      // If server wasn't reachable, update notice text
      if (!serverReachable) {
        notice.querySelector('strong').textContent = 'First-Time Setup';
        notice.querySelector('p').textContent = 'Server is warming up… Create your admin account below. If it fails, wait 30 seconds and try again.';
      }
    } else {
      notice.classList.add('hidden');
      closed.classList.remove('hidden');
      document.getElementById('regUsername').closest('.form-group').classList.add('hidden');
      document.getElementById('regPassword').closest('.form-group').classList.add('hidden');
      document.getElementById('regConfirm').closest('.form-group').classList.add('hidden');
      shopFld.classList.add('hidden');
      document.getElementById('registerBtn').classList.add('hidden');
    }
  }

  // ── Password toggle buttons ───────────────────────────────────────────────
  document.querySelectorAll('.pwd-toggle').forEach(btn => {
    btn.addEventListener('click', () => {
      const target = document.getElementById(btn.dataset.target);
      const isText = target.type === 'text';
      target.type = isText ? 'password' : 'text';
      btn.innerHTML = isText ? '<i class="fa-regular fa-eye"></i>' : '<i class="fa-regular fa-eye-slash"></i>';
    });
  });

  // ── Shared: save session and redirect ────────────────────────────────────
  function saveSessionAndRedirect(data) {
    sessionStorage.setItem('pos_token',    data.access_token);
    sessionStorage.setItem('pos_username', data.username);
    sessionStorage.setItem('pos_shop_id',  data.shop_id);
    sessionStorage.setItem('pos_role',     data.role);
    if (data.user_id) sessionStorage.setItem('pos_user_id', data.user_id);
    window.location.replace('dashboard.html');
  }

  // ── LOGIN form handler ────────────────────────────────────────────────────
  const loginForm = document.getElementById('loginForm');
  const loginBtn  = document.getElementById('loginBtn');

  loginForm.addEventListener('submit', async (e) => {
    e.preventDefault();
    document.getElementById('loginError').classList.add('hidden');

    const username = document.getElementById('loginUsername').value.trim();
    const password = document.getElementById('loginPassword').value;

    setLoading(loginBtn, true);
    try {
      const data = await api.login(username, password);
      saveSessionAndRedirect(data);
    } catch (err) {
      showFormError('loginError', err.message || 'Login failed. Please try again.');
    } finally {
      setLoading(loginBtn, false);
    }
  });

  // ── REGISTER form handler ─────────────────────────────────────────────────
  const registerForm = document.getElementById('registerForm');
  const registerBtn  = document.getElementById('registerBtn');

  registerForm.addEventListener('submit', async (e) => {
    e.preventDefault();
    document.getElementById('registerError').classList.add('hidden');

    const username  = document.getElementById('regUsername').value.trim();
    const password  = document.getElementById('regPassword').value;
    const confirm   = document.getElementById('regConfirm').value;
    const shopName  = document.getElementById('regShopName').value.trim();
    const shopLoc   = document.getElementById('regShopLocation').value.trim();

    // Client-side validation
    if (username.length < 3) {
      showFormError('registerError', 'Username must be at least 3 characters.'); return;
    }
    if (password.length < 8) {
      showFormError('registerError', 'Password must be at least 8 characters.'); return;
    }
    if (password !== confirm) {
      showFormError('registerError', 'Passwords do not match.'); return;
    }

    setLoading(registerBtn, true);
    try {
      const data = await api.register({
        username,
        password,
        confirm_password: confirm,
        shop_name:     shopName || 'Main Branch',
        shop_location: shopLoc  || '',
      });

      // Show success flash before redirect
      showSuccessFlash(data.message || 'Account created! Redirecting…');
      setTimeout(() => saveSessionAndRedirect(data), 1200);

    } catch (err) {
      showFormError('registerError', err.message || 'Registration failed.');
    } finally {
      setLoading(registerBtn, false);
    }
  });

  // ── Helpers ───────────────────────────────────────────────────────────────
  function setLoading(btn, loading) {
    btn.disabled = loading;
    btn.querySelector('.btn-text').classList.toggle('hidden', loading);
    btn.querySelector('.btn-loader').classList.toggle('hidden', !loading);
  }

  function showFormError(id, message) {
    const el = document.getElementById(id);
    el.textContent = '⚠ ' + message;
    el.classList.remove('hidden');
  }

  function showSuccessFlash(message) {
    const el = document.createElement('div');
    el.className = 'auth-success-flash';
    el.textContent = '✅ ' + message;
    document.getElementById('authCard').appendChild(el);
    setTimeout(() => el.remove(), 3000);
  }
});
