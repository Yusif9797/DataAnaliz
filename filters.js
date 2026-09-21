/* ============================================================
   PEAKSTATS — FİLTRLƏR (filters.js)
   Hər istifadəçi öz bazar kombinasiyalarını ("Filtr") yadda saxlayır
   və Avtomatik Analiz bölməsində yapışdırdığı əmsallara həmin
   filtrlə axtarış edə bilir.

   Filtrlər Firestore-da "savedFilters/{uid}" sənədində saxlanılır —
   sənəd ID-si istifadəçinin Firebase Auth uid-i, sənəd daxilində də
   "userId" sahəsi eyni uid-i saxlayır. Bu, aşağıdakı Security Rules
   ilə işləmək üçün nəzərdə tutulub (Firebase Console → Firestore
   Database → Rules-a əlavə edilməlidir, əks halda hər kəs hər kəsin
   filtrini oxuya/yaza bilər):

     match /savedFilters/{doc} {
       allow read, update, delete: if request.auth != null
         && request.auth.uid == resource.data.userId;
       allow create: if request.auth != null
         && request.auth.uid == request.resource.data.userId;
     }
   ============================================================ */

let USER_FILTERS = null; // null = hələ yüklənməyib
let _filtersLoadingPromise = null;
let FILTER_MODAL_MODE = 'auto'; // 'auto' = Avtomatik Analiz mətninə tətbiq, 'bulk' = günün matçlarına tətbiq

(function () {
  const style = document.createElement("style");
  style.textContent = `
    .flt-box{ max-width:460px; text-align:left; max-height:82vh; overflow-y:auto; }
    .flt-list{ display:flex; flex-direction:column; gap:8px; margin-top:4px; }
    .flt-empty{ color:var(--text-dim); font-size:12.5px; padding:14px 0; text-align:center; }
    .flt-row{
      display:flex; align-items:center; gap:10px; cursor:pointer;
      background:var(--navy-3); border:1px solid var(--line2); border-radius:10px;
      padding:11px 12px;
    }
    .flt-row:hover{ border-color:var(--amber); }
    .flt-row-main{ flex:1; min-width:0; }
    .flt-row-name{ font-family:var(--display); font-weight:700; font-size:13.5px; color:var(--text); margin-bottom:5px; }
    .flt-row-chips{ line-height:1.9; }
    .flt-del{
      flex-shrink:0; background:none; border:1px solid var(--line2); color:var(--text-dim);
      border-radius:8px; width:30px; height:30px; cursor:pointer; font-size:13px;
    }
    .flt-del:hover{ border-color:var(--red); color:var(--red); }
    .flt-groups{ max-height:48vh; overflow-y:auto; margin-top:2px; padding-right:2px; }
    .flt-group{ margin-bottom:14px; }
    .flt-group-title{
      font-family:var(--mono); font-size:10.5px; text-transform:uppercase; letter-spacing:.6px;
      color:var(--text-faint); margin-bottom:7px;
    }
    .flt-group-fields{ display:flex; flex-wrap:wrap; gap:7px; }
    .flt-chk{
      display:flex; align-items:center; gap:6px; background:var(--navy-3);
      border:1px solid var(--line2); border-radius:8px; padding:6px 10px; cursor:pointer;
      font-size:12.5px; color:var(--text);
    }
    .flt-chk:has(input:checked){ border-color:var(--amber); color:var(--gold-2); }
    .flt-chk input{ accent-color:var(--amber); }
  `;
  document.head.appendChild(style);
})();

function _filtersDocRef() {
  if (!_fbDb || !CURRENT_USER || !CURRENT_USER.uid) return null;
  return _fbDb.collection('savedFilters').doc(CURRENT_USER.uid);
}

function loadUserFilters(force) {
  if (USER_FILTERS && !force) return Promise.resolve(USER_FILTERS);
  const ref = _filtersDocRef();
  if (!ref) { USER_FILTERS = []; return Promise.resolve(USER_FILTERS); }
  if (_filtersLoadingPromise && !force) return _filtersLoadingPromise;
  _filtersLoadingPromise = ref.get().then(doc => {
    USER_FILTERS = (doc.exists && Array.isArray(doc.data().filters)) ? doc.data().filters : [];
    return USER_FILTERS;
  }).catch(err => {
    console.error('Filtrlər yüklənmədi:', err);
    USER_FILTERS = [];
    return USER_FILTERS;
  });
  return _filtersLoadingPromise;
}

async function persistUserFilters() {
  const ref = _filtersDocRef();
  if (!ref) { alert('Filtr saxlamaq üçün hesabına daxil olmalısan.'); return false; }
  try {
    await ref.set({ userId: CURRENT_USER.uid, filters: USER_FILTERS }, { merge: false });
    return true;
  } catch (err) {
    console.error(err);
    alert('Filtr saxlanılmadı: ' + err.message);
    return false;
  }
}

function fltEscapeHtml(s) {
  return String(s).replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
}

/* ---------------- Modal ---------------- */

function openFilterModal(mode) {
  FILTER_MODAL_MODE = mode || 'auto';
  if (!CURRENT_USER) {
    if (confirm('Filtrlərdən istifadə etmək üçün hesabına daxil olmalısan. İndi giriş edim?')) openAuthModal('login');
    return;
  }
  const overlay = document.createElement('div');
  overlay.className = 'au-overlay';
  overlay.id = 'filterOverlay';
  overlay.innerHTML = '<div class="au-box flt-box"><div style="text-align:center; padding:20px 0; color:var(--text-dim); font-size:12.5px;">Yüklənir...</div></div>';
  document.body.appendChild(overlay);
  overlay.addEventListener('click', (e) => { if (e.target === overlay) overlay.remove(); });
  loadUserFilters().then(() => renderFilterList());
}

function closeFilterModal() {
  const overlay = document.getElementById('filterOverlay');
  if (overlay) overlay.remove();
}

function renderFilterList() {
  const box = document.querySelector('#filterOverlay .au-box');
  if (!box) return;
  const clickFn = FILTER_MODAL_MODE === 'bulk' ? 'runBulkFilterOnToday' : 'applySavedFilter';
  const items = (USER_FILTERS || []).map(f => `
    <div class="flt-row" onclick="${clickFn}('${f.id}')">
      <div class="flt-row-main">
        <div class="flt-row-name">${fltEscapeHtml(f.name)}</div>
        <div class="flt-row-chips">${f.keys.map(k => `<span class="parsed-chip">${LABELS[k]||k}</span>`).join(' ')}</div>
      </div>
      <button class="flt-del" title="Sil" onclick="event.stopPropagation(); deleteSavedFilter('${f.id}')">🗑</button>
    </div>`).join('');

  const subText = FILTER_MODAL_MODE === 'bulk'
    ? 'Saxladığın bazar filtrləri — birinə bas ki, günün çəkilmiş matçlarının hamısına tətbiq olunsun'
    : 'Saxladığın bazar filtrləri — birinə bas ki, yapışdırdığın əmsallara tətbiq olunsun';

  box.innerHTML = `
    <button class="au-close" onclick="closeFilterModal()">×</button>
    <div class="au-title">Filtrlərim</div>
    <div class="au-sub">${subText}</div>
    <div class="flt-list">${items || '<div class="flt-empty">Hələ heç bir filtr saxlamamısan</div>'}</div>
    <button class="au-submit" style="margin-top:16px;" onclick="openFilterEditor()">+ Yeni Filtr</button>
  `;
}

function openFilterEditor() {
  const box = document.querySelector('#filterOverlay .au-box');
  if (!box) return;
  const groupsHtml = GROUPS.map(g => `
    <div class="flt-group">
      <div class="flt-group-title">${g.title}</div>
      <div class="flt-group-fields">
        ${g.fields.map(([key,label]) => `
          <label class="flt-chk">
            <input type="checkbox" value="${key}">
            <span>${label}</span>
          </label>`).join('')}
      </div>
    </div>`).join('');

  box.innerHTML = `
    <button class="au-close" onclick="closeFilterModal()">×</button>
    <div class="au-title">Yeni Filtr</div>
    <div class="au-sub">Ad ver və filtrə daxil olacaq bazarları seç (Bet365 bazarları)</div>
    <input type="text" id="fltNameInput" placeholder="Filtr adı (məs. Əsas Bazarlar)"
      style="width:100%; box-sizing:border-box; margin-bottom:14px; background:var(--input-bg); border:1px solid var(--line2); color:var(--text); font-size:16px; font-family:var(--sans); padding:11px 13px; border-radius:9px; outline:none;">
    <div class="flt-groups">${groupsHtml}</div>
    <div style="display:flex; gap:10px; margin-top:16px;">
      <button class="btn" style="flex:1; justify-content:center; background:var(--navy-3); color:var(--gold-2); border:1px solid var(--line2);" onclick="renderFilterList()">Geri</button>
      <button class="au-submit" style="flex:1; margin-bottom:0;" onclick="saveNewFilter()">Saxla</button>
    </div>
  `;
}

async function saveNewFilter() {
  const nameEl = document.getElementById('fltNameInput');
  const name = (nameEl.value || '').trim();
  if (!name) { alert('Filtrə ad ver.'); return; }
  const checked = Array.from(document.querySelectorAll('#filterOverlay .flt-groups input[type=checkbox]:checked')).map(el => el.value);
  if (checked.length === 0) { alert('Ən azı bir bazar seç.'); return; }

  USER_FILTERS = USER_FILTERS || [];
  USER_FILTERS.push({ id: 'f' + Date.now(), name, keys: checked });
  const ok = await persistUserFilters();
  if (!ok) { USER_FILTERS.pop(); return; }
  renderFilterList();
}

async function deleteSavedFilter(id) {
  if (!confirm('Bu filtri silmək istəyirsən?')) return;
  const prev = USER_FILTERS;
  USER_FILTERS = (USER_FILTERS || []).filter(f => f.id !== id);
  const ok = await persistUserFilters();
  if (!ok) { USER_FILTERS = prev; return; }
  renderFilterList();
}

/* ---------------- Filtri tətbiq et ---------------- */

function applySavedFilter(id) {
  const filter = (USER_FILTERS || []).find(f => f.id === id);
  if (!filter) return;
  closeFilterModal();

  const text = document.getElementById('autoText').value;
  const parsed = parseOddsText(text);
  const activeKeys = filter.keys.filter(k => parsed[k] != null);

  const previewEl = document.getElementById('autoParsedPreview');
  const resultsArea = document.getElementById('autoResultsArea');

  if (activeKeys.length === 0) {
    previewEl.style.display = 'block';
    previewEl.innerHTML = `<b>"${fltEscapeHtml(filter.name)}" filtrinin bazarları yapışdırılan mətndə tapılmadı.</b>`;
    resultsArea.innerHTML = `<div class="empty-state"><div class="big">Filtri tətbiq etmək mümkün olmadı</div><div>Bu filtrin bazarları: ${filter.keys.map(k=>LABELS[k]||k).join(', ')}</div></div>`;
    return;
  }

  previewEl.style.display = 'block';
  const tolInput = document.getElementById('filterTolerance');
  const tolPct = tolInput ? (parseFloat(tolInput.value) || 0) : 0;
  previewEl.innerHTML = `<b>"${fltEscapeHtml(filter.name)}" filtri (${activeKeys.length} bazar, tolerans ±${tolPct}%):</b> ` +
    activeKeys.map(k => `<span class="parsed-chip">${LABELS[k]||k}: ${parsed[k]}</span>`).join(' ');

  const leagueSel = document.getElementById('autoLeagueFilter');
  const selectedLeague = leagueSel ? leagueSel.value : '';
  const scopeLabel = selectedLeague ? selectedLeague : 'bütün liqalar';

  resultsArea.innerHTML = `<div class="empty-state"><div class="spinner" style="margin:0 auto 14px;"></div><div>${scopeLabel} üzrə "${fltEscapeHtml(filter.name)}" filtri ilə (±${tolPct}% tolerans) axtarılır...</div></div>`;

  setTimeout(() => {
    let restrictSet = null;
    if (selectedLeague) {
      restrictSet = new Set();
      for (let i=0; i<DB.meta.league.length; i++) {
        if (String(DB.meta.league[i]||'').trim() === selectedLeague) restrictSet.add(i);
      }
    }

    const EPS_FLOOR = 1e-9; // ±0% seçiləndə belə float yuvarlaqlaşma xətasına qarşı sığorta
    const n = DB.meta.ms.length;
    const matchedIdx = [];
    outer:
    for (let i=0; i<n; i++) {
      if (restrictSet && !restrictSet.has(i)) continue;
      for (const key of activeKeys) {
        const arr = DB.oddsA[key];
        if (!arr) continue outer; // bu bukmekerin datasında bu bazar yoxdur
        const v = arr[i];
        if (v === 0 || v == null) continue outer;
        const target = parsed[key];
        const eps = Math.max(EPS_FLOOR, Math.abs(target) * (tolPct / 100));
        if (Math.abs(v - target) > eps) continue outer;
      }
      matchedIdx.push(i);
    }

    const info = topScoreInfo(matchedIdx);
    const combo = { ids: activeKeys, idxSet: matchedIdx, count: matchedIdx.length, top: info.top, topCount: info.topCount, pct: info.pct };
    LAST_AUTO_COMBOS = [combo];
    renderTightComboResult(matchedIdx.length ? combo : null, scopeLabel);
  }, 30);
}
