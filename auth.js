/* ============================================================
   PEAKSTATS — GİRİŞ / QEYDİYYAT / VIP (auth.js)
   Bu fayl: email+şifrə ilə qeydiyyat/giriş, "Avtomatik Analiz"
   və "Analizlər" tablarının VIP-only edilməsi, və admin üçün
   istifadəçiyə əl ilə VIP təyin etmə paneli təmin edir.

   ⚠️ TƏLƏB OLUNAN BİR DƏFƏLİK QURAŞDIRMA (Firebase Console-da):
   Authentication → Sign-in method → "Email/Password" → Enable

   Bu fayl firebaseConfig-i YENİDƏN yazmır — analyses.js-də artıq
   initializeApp() çağırılıb, bu fayl elə həmin app-dan istifadə edir.
   ============================================================ */

let _fbAuth = null;
try { _fbAuth = firebase.auth(); } catch (e) { console.error("Firebase Auth başlamadı:", e); }

let CURRENT_USER = null;
let CURRENT_VIP_UNTIL = null;   // Date | null
let CURRENT_HAD_VIP_EVER = false;

/* ---------------- Stil ---------------- */
(function () {
  const style = document.createElement("style");
  style.textContent = `
    #tab-manual, #tab-analyses{ position:relative; }

    .au-widget{ display:flex; align-items:center; gap:8px; }
    .au-btn{
      font-family:var(--mono); font-size:11.5px; font-weight:600;
      background:var(--navy-3); color:var(--gold-2); border:1px solid var(--line2);
      border-radius:8px; padding:7px 12px; cursor:pointer;
    }
    .au-user{ display:flex; align-items:center; gap:8px; }
    .au-user-info{ display:flex; flex-direction:column; line-height:1.25; }
    .au-user-email{ font-family:var(--mono); font-size:11px; color:var(--text); font-weight:600; max-width:150px; overflow:hidden; text-overflow:ellipsis; white-space:nowrap; }
    .au-user-vip{ font-family:var(--mono); font-size:9.5px; }
    .au-user-vip.active{ color:var(--teal); }
    .au-user-vip.inactive{ color:var(--red); }
    .au-logout{
      background:transparent; border:1px solid var(--line2); color:var(--text-dim);
      border-radius:8px; width:28px; height:28px; cursor:pointer; font-size:12px;
    }
    .au-dropdown{
      display:none; position:absolute; top:calc(100% + 8px); right:0; z-index:200;
      background:var(--card); border:1px solid var(--line2); border-radius:10px;
      box-shadow:var(--shadow-lg); overflow:hidden; min-width:180px;
    }
    .au-dropdown.open{ display:block; }
    .au-dropdown button{
      display:block; width:100%; text-align:left; background:none; border:none;
      padding:11px 14px; font-family:var(--sans); font-size:13px; color:var(--text);
      cursor:pointer;
    }
    .au-dropdown button:hover{ background:var(--row-hover); }
    .au-dropdown button + button{ border-top:1px solid var(--line); }

    /* Auth modalı (Giriş/Qeydiyyat) */
    .au-overlay{
      position:fixed; inset:0; z-index:2147483000;
      display:flex; align-items:center; justify-content:center;
      background:rgba(4,6,5,.72); backdrop-filter:blur(2px);
      padding:20px;
    }
    .au-box{
      width:100%; max-width:360px;
      background:linear-gradient(180deg, var(--navy-2), var(--navy));
      border:1px solid var(--line2); border-radius:16px;
      padding:28px 24px 24px; text-align:center;
      box-shadow:0 20px 50px -12px rgba(0,0,0,.65);
    }
    .au-title{ font-family:var(--display); font-weight:700; font-size:19px; color:var(--text); margin-bottom:6px; }
    .au-sub{ color:var(--text-dim); font-size:12px; margin-bottom:20px; }
    .au-box input{
      width:100%; box-sizing:border-box; margin-bottom:10px;
      background:var(--input-bg); border:1px solid var(--line2);
      color:var(--text); font-size:16px; font-family:var(--sans);
      padding:11px 13px; border-radius:9px; outline:none;
    }
    .au-box input:focus{ border-color:var(--amber); }
    .au-error{ display:none; color:var(--red); font-size:11.5px; margin:-2px 0 10px; text-align:left; }
    .au-error.show{ display:block; }
    .au-submit{
      width:100%; font-family:var(--mono); font-size:12px; text-transform:uppercase; letter-spacing:1.2px;
      font-weight:800; padding:12px 14px; border:none; border-radius:9px; cursor:pointer;
      color:var(--btn-text); background:var(--gold);
      margin-bottom:12px;
    }
    .au-switch{ font-size:12px; color:var(--text-dim); }
    .au-switch a{ color:var(--gold-2); cursor:pointer; text-decoration:underline; }
    .au-close{
      position:absolute; top:14px; right:16px; background:none; border:none;
      color:var(--text-dim); font-size:20px; cursor:pointer;
    }

    /* VIP gate overlay */
    .vip-gate-overlay{
      position:absolute; inset:0; z-index:40;
      background:var(--bg); display:flex; align-items:flex-start; justify-content:center;
      padding:40px 20px;
    }
    .vip-gate-box{
      width:100%; max-width:420px; text-align:center;
      background:var(--card); border:1px solid var(--line2); border-radius:16px;
      padding:30px 26px 26px;
    }
    .vip-gate-lock{ font-size:28px; margin-bottom:8px; }
    .vip-gate-title{ font-family:var(--display); font-weight:700; font-size:19px; color:var(--text); margin-bottom:6px; }
    .vip-gate-sub{ color:var(--text-dim); font-size:12.5px; margin-bottom:20px; line-height:1.6; }
    .vip-gate-plans{ display:flex; gap:10px; margin-bottom:20px; }
    .vip-gate-plan{ flex:1; border:1px solid var(--line2); border-radius:12px; padding:12px 8px; background:var(--navy-3); }
    .vip-gate-plan-name{ font-family:var(--mono); font-size:10.5px; text-transform:uppercase; color:var(--text-dim); margin-bottom:6px; }
    .vip-gate-plan-price{ font-family:var(--display); font-weight:700; font-size:17px; color:var(--text); }
    .vip-gate-contact{
      display:flex; align-items:center; justify-content:center; gap:8px;
      border:1px solid var(--line2); border-radius:11px; background:var(--navy-3);
      padding:10px 14px; margin-bottom:16px; text-decoration:none;
    }
    .vip-gate-contact span{ font-family:var(--display); font-weight:700; font-size:13px; color:var(--text); }
    .vip-gate-cta{
      width:100%; font-family:var(--mono); font-size:12px; text-transform:uppercase; letter-spacing:1.2px;
      font-weight:800; padding:12px 14px; border:none; border-radius:9px; cursor:pointer;
      color:var(--btn-text); background:var(--gold);
      margin-bottom:10px;
    }
    .vip-gate-admin-link{ font-size:11px; color:var(--text-faint); cursor:pointer; text-decoration:underline; }

    .vip-admin-panel{
      margin-top:16px; padding-top:16px; border-top:1px solid var(--line);
      text-align:left;
    }
    .vip-admin-panel input{
      width:100%; box-sizing:border-box; margin-bottom:8px;
      background:var(--input-bg); border:1px solid var(--line2); color:var(--text);
      font-size:16px; padding:9px 11px; border-radius:8px; outline:none; font-family:var(--sans);
    }
    .vip-admin-panel .row{ display:flex; gap:8px; }
    .vip-admin-panel button{
      flex:1; font-family:var(--mono); font-size:10.5px; font-weight:700;
      padding:9px 8px; border-radius:8px; cursor:pointer; border:1px solid var(--line2);
      background:var(--navy-3); color:var(--gold-2);
    }
    .vip-admin-panel .revoke{ color:var(--red); }
  `;
  document.head.appendChild(style);
})();

/* ---------------- VIP vəziyyəti ---------------- */
function emailKey(email){ return (email || '').trim().toLowerCase(); }

function fetchVipStatus(email) {
  if (!_fbDb || !email) { CURRENT_VIP_UNTIL = null; CURRENT_HAD_VIP_EVER = false; return Promise.resolve(); }
  return _fbDb.collection("vipUsers").doc(emailKey(email)).get().then(doc => {
    if (doc.exists && doc.data().vipUntil) {
      CURRENT_VIP_UNTIL = new Date(doc.data().vipUntil);
      CURRENT_HAD_VIP_EVER = true;
    } else {
      CURRENT_VIP_UNTIL = null;
      CURRENT_HAD_VIP_EVER = false;
    }
  }).catch(err => { console.error(err); CURRENT_VIP_UNTIL = null; });
}

function isVipActive() {
  return !!(CURRENT_VIP_UNTIL && CURRENT_VIP_UNTIL.getTime() > Date.now());
}

/* ---------------- Header widget ---------------- */
function renderAuthWidget() {
  const el = document.getElementById("authWidget");
  if (!el) return;
  if (!CURRENT_USER) {
    el.innerHTML = `<button class="au-btn" onclick="openAuthModal('login')">Giriş / Qeydiyyat</button>`;
    return;
  }
  const vipOn = isVipActive();
  const vipLabel = vipOn
    ? `VIP · ${CURRENT_VIP_UNTIL.toLocaleDateString('az-AZ')}-ə qədər`
    : (CURRENT_HAD_VIP_EVER ? 'VIP bitib' : 'VIP yoxdur');
  el.innerHTML = `
    <div class="au-user" style="position:relative;">
      <div class="au-user-info" style="cursor:pointer;" onclick="toggleAuthDropdown(event)" title="Hesab menyusu">
        <span class="au-user-email">${(CURRENT_USER.email || '').replace(/</g,'&lt;')}</span>
        <span class="au-user-vip ${vipOn ? 'active' : 'inactive'}">${vipLabel}</span>
      </div>
      <div class="au-dropdown" id="authDropdown">
        <button onclick="closeAuthDropdown(); openChangePasswordModal();">🔑 Şifrəni Dəyişdir</button>
        <button onclick="closeAuthDropdown(); doLogout();">⏻ Çıxış</button>
      </div>
    </div>`;
}

function toggleAuthDropdown(e) {
  e.stopPropagation();
  const dd = document.getElementById("authDropdown");
  if (!dd) return;
  const isOpen = dd.classList.contains("open");
  closeAuthDropdown();
  if (!isOpen) {
    dd.classList.add("open");
    setTimeout(() => document.addEventListener("click", closeAuthDropdownOnOutsideClick), 0);
  }
}

function closeAuthDropdown() {
  const dd = document.getElementById("authDropdown");
  if (dd) dd.classList.remove("open");
  document.removeEventListener("click", closeAuthDropdownOnOutsideClick);
}

function closeAuthDropdownOnOutsideClick(e) {
  const dd = document.getElementById("authDropdown");
  if (dd && !dd.contains(e.target)) closeAuthDropdown();
}

/* ---------------- Auth modal ---------------- */
function openAuthModal(mode) {
  const overlay = document.createElement("div");
  overlay.className = "au-overlay";
  overlay.id = "authOverlay";

  function box(mode) {
    const isLogin = mode === 'login';
    return `
      <div class="au-box" style="position:relative;">
        <button class="au-close" onclick="document.getElementById('authOverlay').remove()">×</button>
        <div class="au-title">${isLogin ? 'Giriş' : 'Qeydiyyat'}</div>
        <div class="au-sub">${isLogin ? 'Hesabına daxil ol' : 'Yeni hesab yarat'}</div>
        <form id="authForm">
          <input type="email" id="authEmail" placeholder="Gmail" autocomplete="email" required />
          <input type="password" id="authPass" placeholder="Şifrə (min. 6 simvol)" autocomplete="${isLogin?'current-password':'new-password'}" required />
          ${isLogin ? '' : '<input type="password" id="authPassConfirm" placeholder="Şifrə təkrarı" autocomplete="new-password" required />'}
          <div class="au-error" id="authError"></div>
          <button type="submit" class="au-submit">${isLogin ? 'Daxil Ol' : 'Qeydiyyatdan Keç'}</button>
        </form>
        <div class="au-switch">
          ${isLogin ? 'Hesabın yoxdur?' : 'Artıq hesabın var?'}
          <a onclick="swapAuthMode('${isLogin ? 'register' : 'login'}')">${isLogin ? 'Qeydiyyatdan keç' : 'Giriş et'}</a>
        </div>
      </div>`;
  }

  overlay.innerHTML = box(mode || 'login');
  document.body.appendChild(overlay);
  overlay.addEventListener("click", (e) => { if (e.target === overlay) overlay.remove(); });
  wireAuthForm(mode || 'login');
}

function swapAuthMode(mode) {
  const overlay = document.getElementById("authOverlay");
  if (!overlay) return;
  overlay.remove();
  openAuthModal(mode);
}

function wireAuthForm(mode) {
  const form = document.getElementById("authForm");
  const emailEl = document.getElementById("authEmail");
  const passEl = document.getElementById("authPass");
  const passConfirmEl = document.getElementById("authPassConfirm");
  const errEl = document.getElementById("authError");
  if (!form) return;
  form.addEventListener("submit", (e) => {
    e.preventDefault();
    errEl.classList.remove("show");
    const email = emailEl.value.trim();
    const pass = passEl.value;

    if (mode !== 'login' && passConfirmEl && pass !== passConfirmEl.value) {
      errEl.textContent = 'Şifrələr uyğun gəlmir.';
      errEl.classList.add("show");
      return;
    }

    const action = mode === 'login'
      ? _fbAuth.signInWithEmailAndPassword(email, pass)
      : _fbAuth.createUserWithEmailAndPassword(email, pass);
    action.then(() => {
      if (mode !== 'login' && _fbDb) {
        _fbDb.collection('registeredUsers').doc(emailKey(email)).set({
          email: emailKey(email),
          createdAt: new Date().toISOString()
        }, { merge: true }).catch(err => console.error('registeredUsers yazıla bilmədi:', err));
      }
      const overlay = document.getElementById("authOverlay");
      if (overlay) overlay.remove();
    }).catch(err => {
      errEl.textContent = translateAuthError(err);
      errEl.classList.add("show");
    });
  });
}

function translateAuthError(err) {
  const map = {
    'auth/email-already-in-use': 'Bu email artıq qeydiyyatdan keçib. Giriş et.',
    'auth/invalid-email': 'Email düzgün formatda deyil.',
    'auth/weak-password': 'Şifrə ən azı 6 simvol olmalıdır.',
    'auth/user-not-found': 'Bu email ilə hesab tapılmadı.',
    'auth/wrong-password': 'Şifrə yanlışdır.',
    'auth/invalid-credential': 'Email və ya şifrə yanlışdır.',
  };
  return map[err.code] || ('Xəta: ' + err.message);
}

function doLogout() {
  _fbAuth.signOut();
}

/* ---------------- Şifrəni yeniləmə ---------------- */
function openChangePasswordModal() {
  if (!CURRENT_USER) return;
  const overlay = document.createElement("div");
  overlay.className = "au-overlay";
  overlay.id = "changePassOverlay";
  overlay.innerHTML = `
    <div class="au-box" style="position:relative;">
      <button class="au-close" onclick="document.getElementById('changePassOverlay').remove()">×</button>
      <div class="au-title">Şifrəni Yenilə</div>
      <div class="au-sub">${(CURRENT_USER.email || '').replace(/</g,'&lt;')}</div>
      <form id="changePassForm">
        <input type="password" id="cpOld" placeholder="Köhnə şifrə" autocomplete="current-password" required />
        <input type="password" id="cpNew" placeholder="Yeni şifrə (min. 6 simvol)" autocomplete="new-password" required />
        <input type="password" id="cpNewConfirm" placeholder="Yeni şifrə təkrarı" autocomplete="new-password" required />
        <div class="au-error" id="cpError"></div>
        <button type="submit" class="au-submit">Şifrəni Yenilə</button>
      </form>
    </div>`;
  document.body.appendChild(overlay);
  overlay.addEventListener("click", (e) => { if (e.target === overlay) overlay.remove(); });

  document.getElementById("changePassForm").addEventListener("submit", (e) => {
    e.preventDefault();
    const errEl = document.getElementById("cpError");
    errEl.classList.remove("show");
    const oldPass = document.getElementById("cpOld").value;
    const newPass = document.getElementById("cpNew").value;
    const newPassConfirm = document.getElementById("cpNewConfirm").value;

    if (newPass !== newPassConfirm) {
      errEl.textContent = 'Yeni şifrələr uyğun gəlmir.';
      errEl.classList.add("show");
      return;
    }
    if (newPass.length < 6) {
      errEl.textContent = 'Yeni şifrə ən azı 6 simvol olmalıdır.';
      errEl.classList.add("show");
      return;
    }

    const cred = firebase.auth.EmailAuthProvider.credential(CURRENT_USER.email, oldPass);
    CURRENT_USER.reauthenticateWithCredential(cred)
      .then(() => CURRENT_USER.updatePassword(newPass))
      .then(() => {
        alert("Şifrə uğurla yeniləndi ✓");
        overlay.remove();
      })
      .catch(err => {
        errEl.textContent = translateAuthError(err);
        errEl.classList.add("show");
      });
  });
}

/* ---------------- VIP gate ---------------- */
function buildGateHtml(tab) {
  const title = CURRENT_USER
    ? (CURRENT_HAD_VIP_EVER ? 'VIP Müddətiniz Bitib' : 'Bu Bölmə VIP Üzvlər Üçündür')
    : 'Bu Bölmə VIP Üzvlər Üçündür';
  const sub = CURRENT_USER
    ? 'Davam etmək üçün VIP paketlərdən birini əldə et.'
    : 'Görmək üçün əvvəlcə qeydiyyatdan keç, sonra VIP əldə et.';
  const ctaText = CURRENT_USER ? 'VIP Al (Əlaqə)' : 'Giriş / Qeydiyyat';
  const ctaAction = CURRENT_USER ? `window.open('https://t.me/E_BOSS777','_blank')` : `openAuthModal('register')`;

  return `
    <div class="vip-gate-overlay" id="vipGate-${tab}">
      <div class="vip-gate-box">
        <div class="vip-gate-lock">🔒</div>
        <div class="vip-gate-title">${title}</div>
        <div class="vip-gate-sub">${sub}</div>
        <div class="vip-gate-plans">
          <div class="vip-gate-plan">
            <div class="vip-gate-plan-name">15 Gün VIP</div>
            <div class="vip-gate-plan-price">10 AZN</div>
          </div>
          <div class="vip-gate-plan">
            <div class="vip-gate-plan-name">1 Aylıq VIP</div>
            <div class="vip-gate-plan-price">20 AZN</div>
          </div>
        </div>
        <div style="font-family:var(--mono); font-size:10.5px; text-transform:uppercase; letter-spacing:1.2px; color:var(--text-dim); margin-bottom:8px;">VIP üçün Əlaqə</div>
        <a class="vip-gate-contact" href="https://t.me/E_BOSS777" target="_blank" rel="noopener">
          <svg width="18" height="18" viewBox="0 0 240 240" fill="none"><circle cx="120" cy="120" r="120" fill="var(--text)"/><path d="M54 118.5L168 73c5.3-2 9.9 1.3 8.2 9.2l-19.9 93.8c-1.5 6.8-5.5 8.4-11.1 5.2l-30.7-22.6-14.8 14.3c-1.6 1.6-3 3-6.2 3l2.2-31.4 57.2-51.7c2.5-2.2-.5-3.4-3.8-1.2l-70.7 44.6-30.5-9.5c-6.6-2.1-6.7-6.6 1.4-9.6z" fill="var(--bg)"/></svg>
          <span>@E_BOSS777</span>
        </a>
        <button class="vip-gate-cta" onclick="${ctaAction}">${ctaText}</button>
      </div>
    </div>`;
}

function applyGates() {
  ['manual', 'analyses'].forEach(tab => {
    const panel = document.getElementById('tab-' + tab);
    if (!panel) return;
    const existing = document.getElementById('vipGate-' + tab);
    const entitled = isVipActive();
    if (entitled) {
      if (existing) existing.remove();
    } else if (!existing) {
      panel.insertAdjacentHTML('afterbegin', buildGateHtml(tab));
    }
  });
}

async function switchTabGated(tab) {
  switchTab(tab);
  applyGates();
}

/* ---------------- Admin Panel (ayrıca tab) ---------------- */
let ADMIN_UNLOCKED = false;

let _adminPresenceTimer = null;

async function switchTabAdmin() {
  if (!ADMIN_UNLOCKED) {
    if (!(await checkAdmin())) return;
    ADMIN_UNLOCKED = true;
  }
  switchTab('admin');
  renderAdminPanel();
  if (_adminPresenceTimer) clearInterval(_adminPresenceTimer);
  _adminPresenceTimer = setInterval(refreshActiveUserCount, 10000);
}

async function refreshActiveUserCount() {
  const panel = document.getElementById('tab-admin');
  const el = document.getElementById('activeUserCount');
  if (!el || !panel || !panel.classList.contains('active')) {
    if (_adminPresenceTimer) clearInterval(_adminPresenceTimer);
    return;
  }
  const n = await getActiveUserCount();
  el.textContent = n;
}

async function renderAdminPanel() {
  const host = document.getElementById('adminPanelArea');
  if (!host) return;

  host.innerHTML = `
    <div class="vip-admin-panel" style="border-top:none; margin-top:0; padding-top:0; max-width:460px;">
      <div style="font-family:var(--mono); font-size:11px; color:var(--text-dim); margin-bottom:8px; text-transform:uppercase; letter-spacing:1px;">Saytda Aktiv İstifadəçilər</div>
      <div style="font-family:var(--display); font-weight:700; font-size:28px; color:var(--teal);">
        <span id="activeUserCount">…</span> <span style="font-size:13px; color:var(--text-dim); font-weight:600;">nəfər</span>
      </div>
      <div style="font-family:var(--sans); font-size:11px; color:var(--text-faint); margin-top:4px;">Son 60 saniyə ərzində aktiv olanlar. Hər 10 saniyədə yenilənir.</div>
    </div>

    <div class="vip-admin-panel" style="border-top:none; max-width:460px;">
      <div style="font-family:var(--mono); font-size:11px; color:var(--text-dim); margin-bottom:10px; text-transform:uppercase; letter-spacing:1px;">Fərdi VIP Təyin Et</div>
      <input type="email" id="adminGrantEmail" placeholder="İstifadəçinin email-i" />
      <div class="row">
        <button onclick="grantVip(15)">15 Gün Ver</button>
        <button onclick="grantVip(30)">1 Ay Ver</button>
        <button class="revoke" onclick="grantVip(0)">VIP-i Sil</button>
      </div>
    </div>

    <div class="vip-admin-panel" style="max-width:460px;">
      <div style="font-family:var(--mono); font-size:11px; color:var(--text-dim); margin-bottom:6px; text-transform:uppercase; letter-spacing:1px;">Hər Kəsə VIP Ver</div>
      <div style="font-family:var(--sans); font-size:11.5px; color:var(--text-dim); margin-bottom:10px; line-height:1.5;">
        Yalnız hazırda aktiv VIP-i OLMAYAN istifadəçilərə tətbiq olunur — artıq VIP-i olanlara toxunulmur.
      </div>
      <div class="row">
        <button onclick="bulkGrantVip(15)">Hamıya (yeni) 15 Gün Ver</button>
        <button onclick="bulkGrantVip(30)">Hamıya (yeni) 1 Ay Ver</button>
      </div>
      <div id="bulkGrantStatus" style="font-family:var(--mono); font-size:11px; color:var(--text-dim); margin-top:10px;"></div>
    </div>

    <div class="vip-admin-panel" style="max-width:460px;">
      <div style="font-family:var(--mono); font-size:11px; color:var(--text-dim); margin-bottom:10px; text-transform:uppercase; letter-spacing:1px;">VIP İstifadəçilər</div>
      <button onclick="showVipUsersList()">📋 VIP İstifadəçiləri Göstər</button>
      <div id="vipUsersListArea" style="margin-top:12px;"></div>
    </div>`;

  refreshActiveUserCount();
}

/* Adminə: hazırda aktiv VIP-i olan bütün istifadəçiləri (email + bitməsinə
   qalan gün sayı) göstərir. vipUsers kolleksiyasındakı bütün sənədləri oxuyub
   yalnız vipUntil > indi olanları süzür, ən tez bitəni yuxarıda göstərir. */
async function showVipUsersList() {
  const area = document.getElementById('vipUsersListArea');
  if (!area) return;
  if (!_fbDb) { area.innerHTML = '<div style="font-family:var(--sans); font-size:12px; color:var(--red);">Firebase qoşulmayıb.</div>'; return; }

  area.innerHTML = '<div style="font-family:var(--mono); font-size:11.5px; color:var(--text-dim);">Yüklənir...</div>';
  try {
    const snap = await _fbDb.collection('vipUsers').get();
    const now = Date.now();
    const active = [];
    snap.forEach(doc => {
      const d = doc.data();
      if (!d.vipUntil) return;
      const untilMs = new Date(d.vipUntil).getTime();
      if (isNaN(untilMs) || untilMs <= now) return;
      const daysLeft = Math.ceil((untilMs - now) / (24 * 60 * 60 * 1000));
      active.push({ email: d.email || doc.id, daysLeft, untilMs });
    });
    active.sort((a, b) => a.untilMs - b.untilMs);

    if (!active.length) {
      area.innerHTML = '<div style="font-family:var(--sans); font-size:12px; color:var(--text-dim); padding:6px 0;">Hazırda aktiv VIP-i olan istifadəçi yoxdur.</div>';
      return;
    }

    const rows = active.map(u => `
      <tr>
        <td style="text-align:left;">${escapeHtml(u.email)}</td>
        <td>${u.daysLeft} gün</td>
      </tr>`).join('');

    area.innerHTML = `
      <div style="font-family:var(--sans); font-size:11px; color:var(--text-faint); margin-bottom:8px;">${active.length} aktiv VIP istifadəçi</div>
      <div style="overflow-x:auto; max-width:100%;">
      <table class="an-table" style="min-width:320px;">
        <thead><tr><th>Email</th><th>Qalan müddət</th></tr></thead>
        <tbody>${rows}</tbody>
      </table>
      </div>`;
  } catch (err) {
    console.error(err);
    area.innerHTML = '<div style="font-family:var(--sans); font-size:12px; color:var(--red);">Xəta: ' + escapeHtml(err.message) + '</div>';
  }
}

async function bulkGrantVip(days) {
  if (!_fbDb) { alert('Firebase qoşulmayıb.'); return; }
  const statusEl = document.getElementById('bulkGrantStatus');
  if (statusEl) statusEl.textContent = 'İcra olunur...';

  try {
    const snap = await _fbDb.collection('registeredUsers').get();
    if (snap.empty) {
      if (statusEl) statusEl.textContent = 'Qeydiyyatlı istifadəçi tapılmadı.';
      return;
    }
    let granted = 0, skipped = 0;
    const now = Date.now();
    const newUntil = new Date(now + days * 24 * 60 * 60 * 1000).toISOString();

    for (const doc of snap.docs) {
      const email = doc.id;
      const vipDoc = await _fbDb.collection('vipUsers').doc(email).get();
      const currentUntil = (vipDoc.exists && vipDoc.data().vipUntil) ? new Date(vipDoc.data().vipUntil).getTime() : 0;
      if (currentUntil > now) {
        skipped++;
        continue;
      }
      await _fbDb.collection('vipUsers').doc(email).set({ vipUntil: newUntil, email }, { merge: true });
      granted++;
    }

    const msg = `${granted} istifadəçiyə ${days} günlük VIP verildi. ${skipped} istifadəçi artıq aktiv VIP-ə malik olduğu üçün toxunulmadı.`;
    if (statusEl) statusEl.textContent = msg;
    alert(msg);

    if (CURRENT_USER) {
      fetchVipStatus(CURRENT_USER.email).then(() => { renderAuthWidget(); applyGates(); });
    }
  } catch (err) {
    console.error(err);
    if (statusEl) statusEl.textContent = '';
    alert('Xəta: ' + err.message);
  }
}

function grantVip(days) {
  const input = document.getElementById('adminGrantEmail');
  const email = input ? emailKey(input.value) : '';
  if (!email) { alert('Email daxil et.'); return; }
  if (!_fbDb) { alert('Firebase qoşulmayıb.'); return; }

  const payload = days > 0
    ? { vipUntil: new Date(Date.now() + days * 24 * 60 * 60 * 1000).toISOString(), email }
    : { vipUntil: null, email };

  _fbDb.collection('vipUsers').doc(email).set(payload, { merge: true }).then(() => {
    alert(days > 0 ? `${email} üçün ${days} günlük VIP verildi ✓` : `${email} üçün VIP silindi ✓`);
    if (CURRENT_USER && emailKey(CURRENT_USER.email) === email) {
      fetchVipStatus(CURRENT_USER.email).then(() => { renderAuthWidget(); applyGates(); });
    }
  }).catch(err => {
    console.error(err);
    alert('Xəta: ' + err.message);
  });
}

/* ---------------- Canlı iştirak (Presence) ---------------- */
function startPresenceHeartbeat() {
  if (!_fbDb) return;
  let sid = sessionStorage.getItem('peakstats_sid');
  if (!sid) {
    sid = 'sid_' + Date.now() + '_' + Math.random().toString(36).slice(2, 10);
    sessionStorage.setItem('peakstats_sid', sid);
  }
  function ping() {
    _fbDb.collection('presence').doc(sid).set({
      lastSeen: new Date().toISOString()
    }).catch(() => {});
  }
  ping();
  setInterval(ping, 25000); // hər 25 saniyədən bir "buradayam" siqnalı
}

async function getActiveUserCount() {
  if (!_fbDb) return 0;
  const thresholdIso = new Date(Date.now() - 60000).toISOString(); // son 60 saniyə
  try {
    const snap = await _fbDb.collection('presence').where('lastSeen', '>', thresholdIso).get();
    return snap.size;
  } catch (err) {
    console.error(err);
    return 0;
  }
}

/* ---------------- Başlanğıc ---------------- */
if (_fbAuth) {
  startPresenceHeartbeat();
  _fbAuth.onAuthStateChanged(user => {
    CURRENT_USER = user;
    const adminBtn = document.getElementById("tab-admin-btn");
    const isAdmin = user && typeof ADMIN_UID !== "undefined" && user.uid === ADMIN_UID;
    if (adminBtn) adminBtn.style.display = isAdmin ? "" : "none";
    const todayBtn = document.getElementById("todayMatchesBtn");
    if (todayBtn) todayBtn.style.display = isAdmin ? "" : "none";
    const todayDaySelect = document.getElementById("todayDaySelect");
    if (todayDaySelect) todayDaySelect.style.display = isAdmin ? "" : "none";
    const todayClearBtn = document.getElementById("todayClearBtn");
    if (todayClearBtn) todayClearBtn.style.display = isAdmin ? "" : "none";
    const manualSaveBtn = document.getElementById("manualSaveBtn");
    if (manualSaveBtn) manualSaveBtn.style.display = isAdmin ? "" : "none";
    if (isAdmin && typeof switchTabAdmin === "function") switchTabAdmin();
    if (user) {
      fetchVipStatus(user.email).then(() => { renderAuthWidget(); applyGates(); });
    } else {
      CURRENT_VIP_UNTIL = null;
      renderAuthWidget();
      applyGates();
    }
  });
} else {
  renderAuthWidget();
}
