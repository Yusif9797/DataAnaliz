/* ============================================================
   DataAnaliz — ANALİZLƏR (analyses.js)
   Bu fayl "Analizlər" bölməsini işə salır: Filtr və Avtomatik
   Analiz nəticələrini "Kaydet" ilə saxlayır, bütün ziyarətçilər
   Analizlər tabında görür.

   ⚠️ BURАNI DOLDUR: Firebase Console → Project settings →
   Your apps → (Web app) → SDK config bloku. Aşağıdakı boş
   dəyərləri öz layihənin dəyərləri ilə əvəz et:
   ============================================================ */
const firebaseConfig = {
  apiKey: "AIzaSyD2kVfTN88pefU-AevNz9KnmlA9vAbW458",
  authDomain: "data-analiz-9977c.firebaseapp.com",
  projectId: "data-analiz-9977c",
  storageBucket: "data-analiz-9977c.firebasestorage.app",
  messagingSenderId: "949170725974",
  appId: "1:949170725974:web:29a5e2b4490bb9989087f7"
};

let _fbApp = null, _fbDb = null;
try {
  _fbApp = firebase.initializeApp(firebaseConfig);
  _fbDb = firebase.firestore();
} catch (e) {
  console.error("Firebase başlamadı — firebaseConfig-i doldurmusan?", e);
}

/* ---------------- Təhlükəsiz HTML escape ---------------- */
/* İstifadəçi mətnini HTML atributları (məs. title="...") daxilində də təhlükəsiz
   basdırmaq üçün — yalnız "<" əvəzinə bütün təhlükəli simvolları əvəz edir. */
function escapeHtml(str) {
  return String(str || "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

/* ---------------- Admin girişi ---------------- */
/* Kaydet/Sil əməliyyatlarını və Admin Panel girişini qorumaq üçün.
   Parol YERİNƏ sənin Firebase Auth hesabının UID-inə bağlıdır —
   parol kimi açıq koddan oxuna bilməz, yalnız SƏNİN email+şifrənlə
   daxil olduğun sessiya bunu qarşılayır. Firestore Rules-da da eyni
   UID istifadə olunur, ona görə bu sətri dəyişəndə rules-u da yenilə. */
const ADMIN_UID = "b0o3dClpLmhNnVLQ8hH4i65tRLh2";

async function checkAdmin() {
  if (CURRENT_USER && CURRENT_USER.uid === ADMIN_UID) return true;
  if (!CURRENT_USER) {
    alert("Bu əməliyyat üçün admin hesabına daxil olmalısan.");
    if (typeof openAuthModal === "function") openAuthModal("login");
  } else {
    alert("Bu hesabın admin icazəsi yoxdur.");
  }
  return false;
}

/* ---------------- Stil ---------------- */
(function () {
  const style = document.createElement("style");
  style.textContent = `
    .an-item{
      background:var(--card); border:1px solid var(--line);
      border-radius:var(--radius-sm); margin-bottom:12px; overflow:hidden;
    }
    .an-head{
      display:flex; align-items:center; gap:12px; padding:14px 16px; cursor:pointer;
    }
    .an-name{ font-weight:700; color:var(--text); font-size:14.5px; flex:1; min-width:0; overflow:hidden; text-overflow:ellipsis; white-space:nowrap; }
    .an-combo{
      font-family:var(--mono); font-size:11.5px; color:var(--text-dim);
      max-width:340px; overflow:hidden; text-overflow:ellipsis; white-space:nowrap;
    }
    .an-count{
      font-family:var(--mono); font-size:11px; color:var(--amber);
      background:var(--amber-bg); border:1px solid var(--amber-dim);
      padding:2px 8px; border-radius:8px; white-space:nowrap;
    }
    .an-pred{
      font-family:var(--mono); font-size:11.5px; color:var(--text-dim);
      flex:1; max-width:340px; overflow:hidden; text-overflow:ellipsis;
      white-space:nowrap; cursor:pointer; padding:3px 8px; border-radius:6px;
      transition:background-color .25s ease, color .25s ease;
    }
    .an-pred:hover{ background:var(--row-hover); color:var(--text); }
    .an-pred-empty{ color:var(--text-faint); font-style:italic; }
    .an-eye{
      background:var(--navy-3); border:1px solid var(--line2); color:var(--gold-2);
      border-radius:8px; width:32px; height:32px; cursor:pointer; font-size:15px;
      flex-shrink:0; transition: background-color .25s ease, border-color .25s ease, color .25s ease, transform .15s ease;
    }
    .an-eye:hover{ border-color:var(--amber); transform:translateY(-1px); }
    .an-table-wrap{ display:none; border-top:1px solid var(--line); max-height:420px; overflow:auto; }
    .an-table-wrap.open{ display:block; }
    .an-table{ width:100%; border-collapse:collapse; font-size:12.5px; }
    .an-table th{
      position:sticky; top:0; background:var(--navy-2); color:var(--text-faint);
      font-family:var(--mono); font-size:10.5px; text-transform:uppercase; letter-spacing:.8px;
      padding:8px 10px; text-align:left; border-bottom:1px solid var(--line);
    }
    .an-table td{ padding:7px 10px; border-bottom:1px solid var(--row-border); color:var(--text-dim); }
    .an-table tr:hover td{ background:var(--row-hover); }
    .an-del{
      background:transparent; border:1px solid var(--line2); color:var(--red);
      border-radius:8px; width:32px; height:32px; cursor:pointer; font-size:13px; flex-shrink:0;
    }
    .an-check{
      width:18px; height:18px; flex-shrink:0; cursor:pointer; accent-color:var(--gold);
    }

    /* Admin şifrə modalı */
    .adm-overlay{
      position:fixed; inset:0; z-index:2147483000;
      display:flex; align-items:center; justify-content:center;
      background:rgba(4,6,5,.72); backdrop-filter:blur(2px);
      padding:20px; animation:admFade .2s ease;
    }
    @keyframes admFade{ from{opacity:0} to{opacity:1} }
    .adm-box{
      width:100%; max-width:340px;
      background:linear-gradient(180deg, var(--navy-2), var(--navy));
      border:1px solid var(--line2); border-radius:16px;
      padding:26px 24px 22px; text-align:center;
      box-shadow:0 20px 50px -12px rgba(0,0,0,.65), 0 0 0 1px color-mix(in srgb, var(--gold) 18%, transparent);
      animation:admPop .25s cubic-bezier(.2,.9,.3,1.2);
    }
    @keyframes admPop{ from{transform:scale(.94); opacity:0} to{transform:scale(1); opacity:1} }
    .adm-crown{ font-size:22px; color:var(--gold); margin-bottom:6px; }
    .adm-title{ font-family:var(--display); font-weight:700; font-size:17px; color:var(--text); margin-bottom:4px; }
    .adm-sub{ color:var(--text-dim); font-size:12px; margin-bottom:18px; line-height:1.5; }
    #admInput{
      width:100%; box-sizing:border-box;
      background:var(--input-bg); border:1px solid var(--line2);
      color:var(--text); font-size:16px; font-family:var(--mono);
      letter-spacing:2px; text-align:center;
      padding:12px 14px; border-radius:10px; outline:none;
      transition:border-color .25s ease, box-shadow .25s ease;
    }
    #admInput:focus{ border-color:var(--amber); box-shadow:0 0 0 3px color-mix(in srgb, var(--gold) 18%, transparent); }
    .adm-error{ display:none; margin-top:10px; color:var(--red); font-size:11.5px; font-family:var(--mono); }
    .adm-error.show{ display:block; animation:admShake .3s ease; }
    @keyframes admShake{
      0%,100%{transform:translateX(0)} 20%{transform:translateX(-6px)} 40%{transform:translateX(6px)}
      60%{transform:translateX(-4px)} 80%{transform:translateX(4px)}
    }
    .adm-btns{ display:flex; gap:10px; margin-top:14px; }
    .adm-btn-cancel, .adm-btn-ok{
      flex:1; font-family:var(--mono); font-size:11px; text-transform:uppercase; letter-spacing:1.2px;
      font-weight:700; padding:11px 14px; border-radius:9px; cursor:pointer; border:none;
    }
    .adm-btn-cancel{ background:var(--navy-3); color:var(--text-dim); border:1px solid var(--line2); }
    .adm-btn-ok{
      color:var(--btn-text); background:var(--gold);
    }
  `;
  document.head.appendChild(style);
})();

/* ---------------- Yadda saxlama ---------------- */
/* ---------------- Ağıllı Təxmin Mühərriki ----------------
   Saxlanılan matçların (idxSet) tam vaxt (MS) nəticələrinə əsasən,
   aşağıdakı 15 bazarın hər birinin neçə faiz ehtimalla gəldiyini
   hesablayır və ən yüksək faizli olanı seçir. Bu, real vaxtlı
   model deyil — mövcud filtrlənmiş datanın statistik təhlilidir.
------------------------------------------------------------- */
function computeSmartPrediction(idxSet) {
  if (!idxSet || !idxSet.length || typeof DB === 'undefined' || !DB || !DB.meta) return null;

  const tally = {};
  const add = (key) => { tally[key] = (tally[key] || 0) + 1; };
  let n = 0;

  for (const i of idxSet) {
    const msRaw = DB.meta.ms[i];
    if (!msRaw) continue;
    const parts = String(msRaw).split('-').map(Number);
    if (parts.length !== 2 || isNaN(parts[0]) || isNaN(parts[1])) continue;
    const [h, a] = parts;
    n++;

    const homeWin = h > a, awayWin = a > h, draw = h === a;
    const homeOver15 = h > 1.5;
    const awayOver15 = a > 1.5;
    const total = h + a;
    const over25 = total > 2.5;
    const over35 = total > 3.5;
    const btts = h > 0 && a > 0;

    if (homeWin) add('Ev sahibi Qələbə');
    if (awayWin) add('Qonaq Komanda Qələbə');
    if (draw) add('Bərabərlik');
    if (homeOver15) add('Ev sahibi 1.5 Üst');
    if (awayOver15) add('Qonaq 1.5 Üst');
    if (over25) add('Ümumi 2.5 Üst'); else add('Ümumi 2.5 Alt');
    if (over35) add('Ümumi 3.5 Üst'); else add('Ümumi 3.5 Alt');
    if (btts) add('Hər iki komanda qol vurar: Bəli'); else add('Hər iki komanda qol vurar: Xeyr');
    if (homeWin && homeOver15) add('Ev sahibi 1.5 Üst + Qələbə');
    if (awayWin && awayOver15) add('Qonaq 1.5 Üst + Qələbə');
    if (btts && over25) add('Hər iki komanda qol vurar: Bəli + 2.5 Üst');
    if (!btts && !over25) add('Hər iki komanda qol vurar: Xeyr + 2.5 Alt');
  }
  if (!n) return null;

  let best = null;
  for (const market in tally) {
    const count = tally[market];
    const pct = (count / n) * 100;
    if (!best || pct > best.pct) best = { market, pct, count };
  }
  if (!best) return null;

  return {
    text: `🤖 ${best.market} (%${best.pct.toFixed(0)} ehtimal, ${n} matçdan ${best.count}-də)`,
    pct: best.pct,
    sample: n
  };
}

// idxSet — o anki DB massivinə görə indekslərdir. Bu indekslər DB faylı
// yenidən yaradılanda (.bin re-build, sıra dəyişəndə) etibarsız olur.
// Ona görə saxlayarkən matçın SƏTIRINI eynən (əsas Filtr cədvəlindəki bütün
// bazarlarla — Over/Under, K/G, Handikap, 1X2, HT/FT və s.) "şəklini çəkib"
// bazaya yazırıq — beləliklə açılışda DB-nin cari vəziyyətindən asılı olmur
// və Analizlər bölməsi əsas cədvəllə eyni görünür.
const _SNAPSHOT_HTML_CHAR_LIMIT = 700000; // Firestore sənəd limitinə (1MiB) görə təhlükəsizlik payı

function buildMatchSnapshot(idxSet) {
  if (typeof DB === 'undefined' || !DB || !DB.meta) return { matches: null, tableHtml: null };

  // Yüngül (həmişə saxlanan) sadə sahələr — "tapılmadı" halında ehtiyat üçün.
  const matches = [];
  for (const i of idxSet) {
    if (!DB.meta.ms[i] && !DB.meta.home[i]) continue;
    matches.push({
      league: DB.meta.league[i] || "",
      home: DB.meta.home[i] || "",
      away: DB.meta.away[i] || "",
      iy: DB.meta.iy[i] || "",
      ms: DB.meta.ms[i] || ""
    });
  }

  // Tam zəngin cədvəl — əsas Filtr cədvəlindəki eyni rowHtml() ilə qurulur.
  let tableHtml = null;
  const hasFullTable = typeof rowHtml === 'function' && window._catRow && window._subRow;
  if (hasFullTable) {
    let bodyRows = "";
    for (const i of idxSet) {
      if (!DB.meta.ms[i] && !DB.meta.home[i]) continue;
      bodyRows += rowHtml(i);
    }
    const candidate = `<div class="table-scroll"><table class="grid">
      <thead>
        <tr class="cat-row">${window._catRow}</tr>
        <tr class="sub-row">${window._subRow}</tr>
      </thead>
      <tbody>${bodyRows}</tbody>
    </table></div>`;
    // Çox böyük kombinasiyalarda (yüzlərlə matç) sənəd limitini aşmamaq üçün
    // ölçüyə baxılır; aşarsa yüngül "matches" formatına keçilir.
    if (candidate.length <= _SNAPSHOT_HTML_CHAR_LIMIT) {
      tableHtml = candidate;
    }
  }

  return { matches, tableHtml };
}

function _doSaveAnalysis(name, prediction, comboLabel, idxSet) {
  if (!_fbDb) { alert("Firebase qoşulmayıb. analyses.js içindəki firebaseConfig-i doldur."); return; }
  if (!idxSet || !idxSet.length) { alert("Saxlamaq üçün əvvəlcə nəticə əldə et (filtrlə / analiz et)."); return; }
  const snap = buildMatchSnapshot(idxSet);
  _fbDb.collection("analyses").add({
    name: name,
    prediction: prediction || "",
    comboLabel: comboLabel,
    count: idxSet.length,
    idxSet: idxSet,
    matches: snap.matches,
    tableHtml: snap.tableHtml,
    createdAt: firebase.firestore.FieldValue.serverTimestamp()
  }).then(() => {
    alert("Yadda saxlanıldı ✓");
    if (document.getElementById("tab-analyses").classList.contains("active")) loadAnalysesList();
  }).catch(err => {
    console.error(err);
    alert("Xəta baş verdi: " + err.message);
  });
}

async function saveAnalysisManual() {
  if (!(await checkAdmin())) return;
  const idxSet = window.LAST_MANUAL_IDX || [];
  const comboLabel = window.LAST_MANUAL_LABEL || "Filtr";
  const name = prompt("Bu analizə ad ver (məs. matçın adı):");
  if (!name) return;
  const smart = computeSmartPrediction(idxSet);
  const prediction = smart ? smart.text : "";
  if (smart && !confirm(`Ağıllı təxmin:\n\n${smart.text}\n\nBu təxminlə saxlansın? (Ləğv etsən boş saxlanılar, sonra özün yaza bilərsən)`)) {
    _doSaveAnalysis(name, "", comboLabel, idxSet);
    return;
  }
  _doSaveAnalysis(name, prediction, comboLabel, idxSet);
}

async function saveAnalysisAuto(i) {
  if (!(await checkAdmin())) return;
  const combo = (window.LAST_AUTO_COMBOS || [])[i || 0];
  if (!combo) { alert("Əvvəlcə 'Analiz Et' düyməsinə bas."); return; }
  const comboLabel = window.LAST_AUTO_LABEL || "Avtomatik kombinasiya";
  const name = prompt("Bu analizə ad ver (məs. matçın adı):");
  if (!name) return;
  const smart = computeSmartPrediction(combo.idxSet);
  const prediction = smart ? smart.text : "";
  if (smart && !confirm(`Ağıllı təxmin:\n\n${smart.text}\n\nBu təxminlə saxlansın? (Ləğv etsən boş saxlanılar, sonra özün yaza bilərsən)`)) {
    _doSaveAnalysis(name, "", comboLabel, combo.idxSet);
    return;
  }
  _doSaveAnalysis(name, prediction, comboLabel, combo.idxSet);
}

async function saveTeamStatsAnalysis() {
  if (!(await checkAdmin())) return;
  if (!window.LAST_TEAMSTATS_HTML) { alert("Əvvəlcə 'Analiz Et' düyməsinə bas."); return; }
  const defaultName = `${window.LAST_TEAMSTATS_HOME || ''} vs ${window.LAST_TEAMSTATS_AWAY || ''}`.trim();
  const name = prompt("Bu analizə ad ver:", defaultName);
  if (!name) return;
  if (!_fbDb) { alert("Firebase qoşulmayıb."); return; }

  _fbDb.collection("analyses").add({
    type: "teamstats",
    sport: window.LAST_TEAMSTATS_SPORT || "football",
    name: name,
    homeTeam: window.LAST_TEAMSTATS_HOME || "",
    awayTeam: window.LAST_TEAMSTATS_AWAY || "",
    resultHtml: window.LAST_TEAMSTATS_HTML,
    createdAt: firebase.firestore.FieldValue.serverTimestamp()
  }).then(() => {
    alert("Yadda saxlanıldı ✓");
    if (document.getElementById("tab-analyses").classList.contains("active")) loadAnalysesList();
  }).catch(err => {
    console.error(err);
    alert("Xəta baş verdi: " + err.message);
  });
}

/* ---------------- Siyahını göstərmə ---------------- */
function loadAnalysesList() {
  const area = document.getElementById("analysesListArea");
  if (!area) return;
  if (!_fbDb) {
    area.innerHTML = '<div class="empty-state"><div class="big">Firebase qoşulmayıb</div><div>analyses.js içindəki firebaseConfig doldurulmalıdır</div></div>';
    return;
  }
  area.innerHTML = '<div class="empty-state"><div class="big">Yüklənir...</div></div>';
  window._selectedAnalyses = new Set();
  updateBulkDeleteUI();

  _fbDb.collection("analyses").orderBy("createdAt", "desc").get().then(snap => {
    if (snap.empty) {
      area.innerHTML = '<div class="empty-state"><div class="big">Hələ heç bir analiz saxlanmayıb</div><div>Filtr və ya Avtomatik Analiz nəticəsində "💾 Kaydet" düyməsinə bas</div></div>';
      return;
    }
    let html = "";
    snap.forEach(doc => {
      const d = doc.data();
      const safeName = escapeHtml(d.name || "Adsız");
      const isTeamStats = d.type === "teamstats";
      const badge = isTeamStats
        ? `${d.sport === 'basketball' ? '🏀' : '⚽'} Komanda`
        : `${d.count || 0} matç`;
      const predRow = isTeamStats ? '' : (() => {
        const safePred = escapeHtml(d.prediction || "");
        return `<div class="an-pred" id="an-pred-${doc.id}" onclick="event.stopPropagation(); editPrediction('${doc.id}')" title="${safePred ? safePred + ' — ' : ''}Redaktə etmək üçün bas">
              ${safePred ? safePred : '<span class="an-pred-empty">Təxmin yazılmayıb — bas</span>'}
            </div>`;
      })();
      html += `
        <div class="an-item" id="an-item-${doc.id}">
          <div class="an-head" onclick="toggleAnalysisRow('${doc.id}')">
            <input type="checkbox" class="an-check" onclick="event.stopPropagation(); toggleAnalysisSelect('${doc.id}', this.checked)" />
            <div class="an-name">${safeName}</div>
            ${predRow}
            <div class="an-count">${badge}</div>
            <button class="an-eye" title="Göstər/gizlət">👁</button>
            <button class="an-del" title="Sil" onclick="event.stopPropagation(); deleteAnalysis('${doc.id}')">🗑</button>
          </div>
          <div class="an-table-wrap" id="an-table-${doc.id}"></div>
        </div>`;
    });
    area.innerHTML = html;
    window._ANALYSES_CACHE = {};
    snap.forEach(doc => { window._ANALYSES_CACHE[doc.id] = doc.data(); });
  }).catch(err => {
    console.error(err);
    area.innerHTML = '<div class="empty-state"><div class="big">Yüklənərkən xəta baş verdi</div><div>' + err.message + '</div></div>';
  });
}

function toggleAnalysisRow(docId) {
  const wrap = document.getElementById("an-table-" + docId);
  if (!wrap) return;
  const isOpen = wrap.classList.contains("open");
  if (isOpen) { wrap.classList.remove("open"); wrap.innerHTML = ""; return; }

  const data = (window._ANALYSES_CACHE || {})[docId];

  if (data && data.type === "teamstats") {
    wrap.innerHTML = `<div style="padding:16px 18px;">${data.resultHtml || "<div style='color:var(--text-dim);'>Hesabat tapılmadı</div>"}</div>`;
    wrap.classList.add("open");
    return;
  }

  // Öncəlik 1: saxlanılan tam zəngin cədvəl (əsas Filtr cədvəli ilə eyni görünüş,
  // bütün bazarlarla) — DB-nin cari vəziyyətindən tam asılı deyil.
  if (data && data.tableHtml) {
    wrap.innerHTML = data.tableHtml;
    wrap.classList.add("open");
    return;
  }

  // Öncəlik 2: saxlanılan sadə "matches" snapshot-u (DB-nin sırasından asılı deyil,
  // amma yalnız 5 əsas sütun — tableHtml yaradıla bilməyəndə ehtiyat variantı).
  if (data && Array.isArray(data.matches) && data.matches.length) {
    let rows = "";
    for (const m of data.matches) {
      rows += `<tr>
        <td>${(m.league || "").replace(/</g, "&lt;")}</td>
        <td>${(m.home || "").replace(/</g, "&lt;")}</td>
        <td>${(m.away || "").replace(/</g, "&lt;")}</td>
        <td>${(m.iy || "").replace(/</g, "&lt;")}</td>
        <td>${(m.ms || "").replace(/</g, "&lt;")}</td>
      </tr>`;
    }
    wrap.innerHTML = `<table class="an-table">
      <thead><tr><th>Liqa</th><th>Ev sahibi</th><th>Qonaq</th><th>İY</th><th>MS</th></tr></thead>
      <tbody>${rows || '<tr><td colspan="5" style="text-align:center;padding:20px;">Matç tapılmadı</td></tr>'}</tbody>
    </table>`;
    wrap.classList.add("open");
    return;
  }

  if (!data || !data.idxSet) { wrap.innerHTML = "<div style='padding:14px;color:var(--text-dim);'>Məlumat tapılmadı</div>"; wrap.classList.add("open"); return; }

  const idxSet = data.idxSet.slice(0, 150);
  const hasDB = (typeof DB !== 'undefined') && DB && DB.meta;

  if (!hasDB) {
    wrap.innerHTML = "<div style='padding:14px;color:var(--text-dim);'>Verilənlər bazası hələ yüklənir, bir neçə saniyə sonra yenidən cəhd et</div>";
    wrap.classList.add("open");
    return;
  }

  let rows = "";
  for (const i of idxSet) {
    if (!DB.meta.ms[i]) continue;
    rows += `<tr>
      <td>${DB.meta.league[i] || ""}</td>
      <td>${DB.meta.home[i] || ""}</td>
      <td>${DB.meta.away[i] || ""}</td>
      <td>${DB.meta.iy[i] || ""}</td>
      <td>${DB.meta.ms[i] || ""}</td>
    </tr>`;
  }
  wrap.innerHTML = `<table class="an-table">
    <thead><tr><th>Liqa</th><th>Ev sahibi</th><th>Qonaq</th><th>İY</th><th>MS</th></tr></thead>
    <tbody>${rows || '<tr><td colspan="5" style="text-align:center;padding:20px;">Matç tapılmadı (köhnə format — DB sırası dəyişmiş ola bilər)</td></tr>'}</tbody>
  </table>`;
  wrap.classList.add("open");
}

async function deleteAnalysis(docId) {
  if (!(await checkAdmin())) return;
  if (!confirm("Bu analizi silmək istədiyinə əminsən?")) return;
  _fbDb.collection("analyses").doc(docId).delete().then(() => loadAnalysesList());
}

/* ---------------- Toplu seçim və silmə ---------------- */
function toggleAnalysisSelect(docId, checked) {
  if (!window._selectedAnalyses) window._selectedAnalyses = new Set();
  if (checked) window._selectedAnalyses.add(docId);
  else window._selectedAnalyses.delete(docId);
  updateBulkDeleteUI();
}

function updateBulkDeleteUI() {
  const btn = document.getElementById("bulkDeleteBtn");
  const countEl = document.getElementById("bulkDeleteCount");
  const n = (window._selectedAnalyses || new Set()).size;
  if (countEl) countEl.textContent = n;
  if (btn) btn.style.display = n > 0 ? "inline-flex" : "none";
}

async function bulkDeleteAnalyses() {
  const ids = Array.from(window._selectedAnalyses || []);
  if (ids.length === 0) return;
  if (!(await checkAdmin())) return;
  if (!confirm(`${ids.length} analizi silmək istədiyinə əminsən?`)) return;

  const batch = _fbDb.batch();
  ids.forEach(id => batch.delete(_fbDb.collection("analyses").doc(id)));
  batch.commit().then(() => {
    window._selectedAnalyses = new Set();
    loadAnalysesList();
  }).catch(err => {
    console.error(err);
    alert("Xəta baş verdi: " + err.message);
  });
}

async function editPrediction(docId) {
  if (!(await checkAdmin())) return;
  const data = (window._ANALYSES_CACHE || {})[docId];
  const current = data ? (data.prediction || "") : "";
  const updated = prompt("Təxmini redaktə et (✅ / ❌ işarəsini özün əlavə edə bilərsən):", current);
  if (updated === null) return;
  _fbDb.collection("analyses").doc(docId).update({ prediction: updated }).then(() => {
    if (window._ANALYSES_CACHE && window._ANALYSES_CACHE[docId]) {
      window._ANALYSES_CACHE[docId].prediction = updated;
    }
    const el = document.getElementById("an-pred-" + docId);
    if (el) {
      const safe = updated.replace(/</g, "&lt;");
      el.innerHTML = safe ? safe : '<span class="an-pred-empty">Təxmin yazılmayıb — bas</span>';
    }
  }).catch(err => {
    console.error(err);
    alert("Xəta baş verdi: " + err.message);
  });
     }
