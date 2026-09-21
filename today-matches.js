/* ============================================================
   DataAnaliz — GÜNÜN MATÇLARI (today-matches.js)
   bet365_odds_today.py skriptinin brauzer versiyası: günün
   matçlarını (seçilmiş liqalardan) Flashscore "feed"indən çəkir,
   hər biri üçün Bet365 açılış əmsallarını ayrıca sorğulayıb
   Filtr tabının üstündə, əsas cədvəllə eyni bazar sütunları ilə
   göstərir.

   Hər ikisi də eyni Cloudflare Worker-dən keçir (CORS görə):
   ?feed=today&day=0   → günün matç siyahısı (xam feed mətni)
   ?eventId=XXXX       → tək matçın Bet365 açılış əmsalları
   ============================================================ */

const TODAY_PROXY_URL = "https://billowing-glade-9c5a.ahmadovelmir2006.workers.dev";
const TODAY_BET365_ID = 16;
const TODAY_SLEEP_MS = 1500; // python skriptindəki ilə eyni — IP bloklanmasının qarşısını almaq üçün

/* ---------------------------------------------------------------
   Yalnız bu liqalar göstərilsin — bet365_odds_today.py-dakı
   WANTED_LEAGUES siyahısı ilə eynidir.
--------------------------------------------------------------- */
const TODAY_WANTED_LEAGUES = [
  [["germany", "bundesliga"], ["2"]],
  [["germany", "bundesliga", "2"], []],
  [["england", "premier"], []],
  [["france", "ligue 1"], []],
  [["france", "ligue 2"], []],
  [["england", "championship"], []],
  [["italy", "serie a"], []],
  [["italy", "serie b"], []],
  [["europe", "champions league"], []],
  [["europe", "europa league"], []],
  [["europe", "conference league"], []],
  [["switzerland", "super league"], []],
  [["sweden", "superettan"], []],
  [["sweden", "allsvenskan"], []],
  [["spain", "laliga"], ["laliga2", "laliga 2"]],
  [["spain", "laliga2"], []],
  [["spain", "laliga", "2"], []],
  [["turkey", "super lig"], []],
  [["norway", "eliteserien"], []],
  [["portugal", "liga portugal"], []],
  [["netherlands", "eredivisie"], []],
  [["netherlands", "eerste divisie"], []],
  [["brazil", "serie a"], []],
  [["brazil", "serie b"], []],
  [["austria", "bundesliga"], []],
  [["belgium", "jupiler"], []],
  [["argentina", "liga profesional"], []],
  [["denmark", "superliga"], []],
  [["usa", "mls"], []],
  [["scotland", "premiership"], []],
  [["scotland", "championship"], []],
  [["poland", "ekstraklasa"], []],
  [["romania", "superliga"], []],
];

function todayIsWantedLeague(leagueName) {
  if (!leagueName) return false;
  const name = leagueName.toLowerCase();
  for (const [required, excluded] of TODAY_WANTED_LEAGUES) {
    if (required.every(r => name.includes(r)) && !excluded.some(e => name.includes(e))) return true;
  }
  return false;
}

/* ---------------------------------------------------------------
   Flashscore "ninja" feed formatı: bloklar "~" ilə, hər blok
   daxilində sahələr "¬" ilə, açar/dəyər "÷" ilə ayrılır.
--------------------------------------------------------------- */
function parseFlashscoreFeed(text) {
  return text.split("~").filter(Boolean).map(block => {
    const obj = {};
    block.split("¬").forEach(pair => {
      const i = pair.indexOf("÷");
      if (i === -1) return;
      obj[pair.slice(0, i)] = pair.slice(i + 1);
    });
    return obj;
  });
}

async function todayFetchMatchList(day) {
  const resp = await fetch(TODAY_PROXY_URL + "?feed=today&day=" + day);
  if (!resp.ok) throw new Error("Feed sorğusu uğursuz oldu (" + resp.status + ")");
  const text = await resp.text();
  const blocks = parseFlashscoreFeed(text);

  const matches = [];
  let currentLeague = null;
  for (const b of blocks) {
    if (b.ZA !== undefined) { currentLeague = b.ZA; continue; }
    if (b.AA !== undefined) {
      matches.push({
        id: b.AA,
        home: b.FH || b.AE || b.CX || "",
        away: b.FK || b.AF || "",
        league: currentLeague,
      });
    }
  }
  return matches;
}

/* ---------------------------------------------------------------
   Bet365 əmsal sorğusu + parse (odds-lookup.js-dəki məntiqin
   eynisi — o fayl saytdan silindiyi üçün burada təkrarlanıb).
--------------------------------------------------------------- */
function todayFindEntry(entries, bettingType, scope) {
  return entries.find(e => e.bettingType === bettingType && e.bettingScope === scope) || null;
}
function todayHcapNum(h) {
  if (h == null) return null;
  const raw = (typeof h === "object") ? (h.value != null ? h.value : null) : h;
  if (raw == null) return null;
  const n = parseFloat(raw);
  return isNaN(n) ? null : n;
}
function todayNumEq(a, b) { return a != null && b != null && Math.abs(a - b) < 1e-6; }
function todaySimple(entries, bettingType, scope, reorder) {
  const e = todayFindEntry(entries, bettingType, scope);
  if (!e) return null;
  let vals = (e.odds || []).map(i => i.opening);
  if (reorder) { try { vals = reorder.map(i => vals[i]); } catch (err) {} }
  return vals;
}
function todayOverUnder(entries, scope, line) {
  const e = todayFindEntry(entries, "OVER_UNDER", scope);
  if (!e) return [null, null];
  const lineNum = parseFloat(line);
  let over = null, under = null;
  for (const item of (e.odds || [])) {
    if (todayNumEq(todayHcapNum(item.handicap), lineNum)) {
      if (item.selection === "OVER") over = item.opening;
      else if (item.selection === "UNDER") under = item.opening;
    }
  }
  return [over, under];
}
function todayAsianLine(entries, scope, line) {
  const e = todayFindEntry(entries, "ASIAN_HANDICAP", scope);
  if (!e) return [null, null];
  const items = e.odds || [];
  const lineF = parseFloat(line);
  const group = (val) => items.filter(i => todayNumEq(todayHcapNum(i.handicap), val)).map(i => i.opening);
  if (lineF === 0) {
    const g = group(0);
    return [g.length > 0 ? g[0] : null, g.length > 1 ? g[1] : null];
  }
  const homeG = group(lineF), awayG = group(-lineF);
  return [homeG.length > 0 ? homeG[0] : null, awayG.length > 1 ? awayG[1] : null];
}

async function todayFetchBet365Entries(matchId) {
  const resp = await fetch(TODAY_PROXY_URL + "?eventId=" + encodeURIComponent(matchId));
  if (!resp.ok) return [];
  let data;
  try { data = await resp.json(); } catch (err) { return []; }
  let oddsList;
  try { oddsList = data.data.findOddsByEventId.odds; } catch (err) { return []; }
  return (oddsList || []).filter(e => e.bookmakerId === TODAY_BET365_ID);
}

// entries -> BET365_GROUPS-dakı sahə açarları ilə eyni formatda düz obyekt
function todayBuildRow(entries) {
  const HDA = [0, 2, 1];
  const DC = [1, 0, 2];
  const row = {};

  const ms = todaySimple(entries, "HOME_DRAW_AWAY", "FULL_TIME", HDA) || [];
  row.MS1 = ms[0]; row.MSX = ms[1]; row.MS2 = ms[2];
  const msIY = todaySimple(entries, "HOME_DRAW_AWAY", "FIRST_HALF", HDA) || [];
  row.IY1 = msIY[0]; row.IYX = msIY[1]; row.IY2 = msIY[2];
  const msIIY = todaySimple(entries, "HOME_DRAW_AWAY", "SECOND_HALF", HDA) || [];
  row.IIY1 = msIIY[0]; row.IIYX = msIIY[1]; row.IIY2 = msIIY[2];

  for (const line of ["1_5", "2_5", "3_5"]) {
    const dotLine = line.replace("_", ".");
    const [over, under] = todayOverUnder(entries, "FULL_TIME", dotLine);
    row["UST" + line] = over; row["ALT" + line] = under;
  }

  for (const [line, sufH, sufA] of [["-0.5", "AHm05_1", "AHm05_2"], ["0", "AH0_1", "AH0_2"], ["0.5", "AHp05_1", "AHp05_2"]]) {
    const [home, away] = todayAsianLine(entries, "FULL_TIME", line);
    row[sufH] = home; row[sufA] = away;
  }

  const btts = todaySimple(entries, "BOTH_TEAMS_TO_SCORE", "FULL_TIME") || [];
  row.KGVAR = btts[0]; row.KGYOK = btts[1];
  const bttsIY = todaySimple(entries, "BOTH_TEAMS_TO_SCORE", "FIRST_HALF") || [];
  row.IKGVAR = bttsIY[0]; row.IKGYOK = bttsIY[1];

  const dc = todaySimple(entries, "DOUBLE_CHANCE", "FULL_TIME", DC) || [];
  row.DC1X = dc[0]; row.DC12 = dc[1]; row.DCX2 = dc[2];
  const dcIY = todaySimple(entries, "DOUBLE_CHANCE", "FIRST_HALF", DC) || [];
  row.IDC1X = dcIY[0]; row.IDC12 = dcIY[1]; row.IDCX2 = dcIY[2];

  const eh = todayFindEntry(entries, "EUROPEAN_HANDICAP", "FULL_TIME");
  if (eh) {
    const items = eh.odds || [];
    const minusG = items.filter(i => todayNumEq(todayHcapNum(i.handicap), -1)).map(i => i.opening);
    const plusG = items.filter(i => todayNumEq(todayHcapNum(i.handicap), 1)).map(i => i.opening);
    row.EH1 = minusG[0]; row.EHX = minusG.length > 1 ? minusG[minusG.length - 1] : undefined;
    row.EH2 = plusG.length > 1 ? plusG[1] : (plusG.length ? plusG[0] : undefined);
  }

  const htft = todayFindEntry(entries, "HALF_FULL_TIME", "FULL_TIME");
  if (htft) {
    const vals = (htft.odds || []).map(i => i.opening);
    const labels = ["1/1", "X/1", "2/1", "1/X", "X/X", "2/X", "1/2", "X/2", "2/2"];
    const byLabel = {};
    labels.forEach((lab, i) => { byLabel[lab] = vals[i]; });
    row.HTFT11 = byLabel["1/1"]; row.HTFT1X = byLabel["1/X"]; row.HTFT12 = byLabel["1/2"];
    row.HTFTX1 = byLabel["X/1"]; row.HTFTXX = byLabel["X/X"]; row.HTFTX2 = byLabel["X/2"];
    row.HTFT21 = byLabel["2/1"]; row.HTFT2X = byLabel["2/X"]; row.HTFT22 = byLabel["2/2"];
  }

  return row;
}

/* Qeyd: ayrıca "günün matçları" cədvəli artıq qurulmur — bu matçlar
   birbaşa əsas Filtr cədvəlinin başına (todayPinnedRowHtml, index.html-də)
   pinlənir ki, eyni sütun/interaktivlikdə tək cədvəldə görünsün. */

/* ---------------------------------------------------------------
   Yaddaş (Firestore) — çəkilən matçlar bütün istifadəçilərə
   görünsün və səhifə yenidən açılanda da qalsın deyə.
   oddsArchive/todayMatches sənədində saxlanılır — bu kolleksiya
   artıq Firestore Rules-da mövcuddur (hamı oxuya bilər, yalnız
   admin yaza bilər), əlavə heç bir rule dəyişikliyi lazım deyil.
--------------------------------------------------------------- */
let TODAY_MATCHES_CACHE = [];
let TODAY_LAST_FETCHED_AT = "";

// Firestore "undefined" dəyərli sahələri qəbul etmir — set() belə hallarda
// səssizcə (console-dan başqa heç yerdə görünmədən) xəta atır və heç nə
// yadda saxlanmır. todayBuildRow() bir çox sahəni (MS1, EHX, HTFT11 və s.)
// tapılmadıqda "undefined" saxladığı üçün bu, əsas səbəb idi — matçlar
// UI-da (JS cache-də) görünsə də, səhifə yeniləndikdə Firestore-da
// heç nə olmadığından hamısı itirdi. Bura həmin dəyərləri null-a çeviririk.
function todaySanitizeForFirestore(value) {
  if (value === undefined) return null;
  if (Array.isArray(value)) return value.map(todaySanitizeForFirestore);
  if (value !== null && typeof value === "object") {
    const out = {};
    for (const k in value) out[k] = todaySanitizeForFirestore(value[k]);
    return out;
  }
  return value;
}

async function todaySaveToFirestore() {
  if (typeof _fbDb === "undefined" || !_fbDb) return false;
  try {
    await _fbDb.collection("oddsArchive").doc("todayMatches").set({
      matches: todaySanitizeForFirestore(TODAY_MATCHES_CACHE),
      forLabel: TODAY_FETCHED_LABEL || null,
      fetchedAt: new Date().toISOString(),
      fetchedBy: (typeof CURRENT_USER !== "undefined" && CURRENT_USER && CURRENT_USER.email) || null,
    });
    return true;
  } catch (err) {
    console.error("todaySaveToFirestore xətası:", err);
    return false;
  }
}

// Əsas cədvəl (Filtr tabındakı #tableBody) hazır olana qədər gözləyib
// sonra onu yeniləyir — DB (bet365-data.bin) asinxron yükləndiyi üçün
// səhifə açılan kimi #tableBody hələ mövcud olmaya bilər.
function todayWaitAndRefreshMainTable(tries) {
  tries = tries || 0;
  const ready = document.getElementById("tableBody") && typeof DB !== "undefined" && DB && DB.meta && typeof runFilter === "function";
  if (ready) { runFilter(); return; }
  if (tries > 150) return; // ~30san gözlədikdən sonra vaz keç
  setTimeout(() => todayWaitAndRefreshMainTable(tries + 1), 200);
}

function todayRenderStatusLine() {
  const area = document.getElementById("todayMatchesArea");
  if (!area) return;
  if (!TODAY_MATCHES_CACHE.length) { area.innerHTML = ""; return; }
  const labelPart = TODAY_FETCHED_LABEL ? TODAY_FETCHED_LABEL + " · " : "";
  area.innerHTML = `<div style="font-family:var(--mono); font-size:11px; color:var(--teal); margin:0 26px 4px;">🔴 ${labelPart}matçları əsas cədvəlin başında göstərilir — ${TODAY_MATCHES_CACHE.length} nəticə${TODAY_LAST_FETCHED_AT ? " · " + TODAY_LAST_FETCHED_AT : ""}</div>`;
}

async function todayLoadFromFirestore() {
  if (typeof _fbDb === "undefined" || !_fbDb) return;
  try {
    const doc = await _fbDb.collection("oddsArchive").doc("todayMatches").get();
    if (!doc.exists) return;
    const data = doc.data() || {};
    TODAY_MATCHES_CACHE = Array.isArray(data.matches) ? data.matches : [];
    TODAY_LAST_FETCHED_AT = data.fetchedAt ? new Date(data.fetchedAt).toLocaleString("az-AZ") : "";
    TODAY_FETCHED_LABEL = data.forLabel || "";
    todayRenderStatusLine();
    todayWaitAndRefreshMainTable();
  } catch (err) {
    console.error("todayLoadFromFirestore xətası:", err);
  }
}

async function todayClearStored() {
  const isAdmin = typeof CURRENT_USER !== "undefined" && CURRENT_USER && typeof ADMIN_UID !== "undefined" && CURRENT_USER.uid === ADMIN_UID;
  if (!isAdmin) return;
  if (!confirm("Çəkilmiş günün matçları bütün istifadəçilər üçün silinəcək. Davam edilsin?")) return;

  TODAY_MATCHES_CACHE = [];
  TODAY_LAST_FETCHED_AT = "";
  const area = document.getElementById("todayMatchesArea");
  if (area) area.innerHTML = "";
  todayWaitAndRefreshMainTable();

  if (typeof _fbDb !== "undefined" && _fbDb) {
    try { await _fbDb.collection("oddsArchive").doc("todayMatches").delete(); }
    catch (err) { console.error("todayClearStored xətası:", err); }
  }
}

/* ---------------------------------------------------------------
   TOPLU ANALİZ — istifadəçinin saxladığı bazar filtrlərindən
   birini (filters.js) BİR-BİR yox, günün çəkilmiş matçlarının
   HAMISINA eyni anda tətbiq edir: hər matçın öz əmsalını götürüb
   əsas Bet365 bazasında eyni əmsala tam uyğun tarixi matçları
   axtarır və nəticələri (uyğun matç sayı + ən çox görülən skor)
   ən çox uyğunluqdan azala doğru sıralayır.
--------------------------------------------------------------- */
function openBulkAnalysisModal() {
  openFilterModal("bulk");
}

function runBulkFilterOnToday(id) {
  const filter = (USER_FILTERS || []).find(f => f.id === id);
  if (!filter) return;
  closeFilterModal();

  const area = document.getElementById("bulkResultsArea");
  if (!area) return;

  if (!TODAY_MATCHES_CACHE.length) {
    area.innerHTML = '<div class="empty-state"><div class="big">Günün çəkilmiş matçı yoxdur</div><div>Əvvəlcə "Günün matçlarını çək" düyməsini işlət</div></div>';
    return;
  }

  area.innerHTML = '<div class="empty-state"><div class="spinner" style="margin:0 auto 14px;"></div><div>Toplu analiz aparılır...</div></div>';

  setTimeout(() => {
    const EPS = 0.005;
    const n = DB.meta.ms.length;
    const rowsOut = [];

    for (const m of TODAY_MATCHES_CACHE) {
      const mrow = m.row || {};
      const activeKeys = filter.keys.filter(k => mrow[k] != null);
      if (!activeKeys.length) continue;

      const matchedIdx = [];
      outer:
      for (let i = 0; i < n; i++) {
        for (const key of activeKeys) {
          const arr = DB.oddsA[key];
          if (!arr) continue outer;
          const v = arr[i];
          if (v === 0 || v == null) continue outer;
          if (Math.abs(v - mrow[key]) > EPS) continue outer;
        }
        matchedIdx.push(i);
      }
      const info = topScoreInfo(matchedIdx);
      rowsOut.push({ m, activeKeys, count: matchedIdx.length, top: info.top, pct: info.pct });
    }

    // 0 və 1 uyğun tarixi matçı olanları göstərmə — bunlar praktiki olaraq
    // mənasız nəticələrdir (statistik seçim üçün ən azı 2 tarixi hadisə lazımdır).
    const filtered = rowsOut.filter(r => r.count >= 2);
    filtered.sort((a, b) => b.count - a.count);
    window.BULK_RESULTS_CACHE = filtered;

    if (!filtered.length) {
      area.innerHTML = `<div class="empty-state"><div class="big">"${fltEscapeHtml(filter.name)}" filtri üçün ən azı 2 uyğun tarixi matçı olan nəticə tapılmadı</div><div>${rowsOut.length} matç yoxlanıldı, hamısında 0 və ya 1 uyğunluq çıxdı</div></div>`;
      return;
    }

    const itemsHtml = filtered.map((r, idx) => {
      const chips = r.activeKeys.map(k => `<span class="parsed-chip">${LABELS[k]||k}: ${r.m.row[k]}</span>`).join(' ');
      const numColor = r.pct >= 70 ? 'var(--teal)' : (r.count > 0 ? 'var(--amber)' : 'var(--text-faint)');
      return `<div class="flt-row" onclick="inspectBulkMatch(${idx})" style="align-items:flex-start;">
        <div class="flt-row-main">
          <div class="flt-row-name">${fltEscapeHtml(r.m.league||'')} — ${fltEscapeHtml(r.m.home||'')} vs ${fltEscapeHtml(r.m.away||'')}</div>
          <div class="flt-row-chips">${chips}</div>
        </div>
        <div style="text-align:center; flex-shrink:0; font-family:var(--mono); min-width:80px;">
          <div style="font-size:18px; font-weight:700; color:${numColor};">${r.count}</div>
          <div style="font-size:10px; color:var(--text-faint); white-space:nowrap;">uyğun · ${r.top||'—'} (${r.pct.toFixed(0)}%)</div>
        </div>
      </div>`;
    }).join('');

    area.innerHTML = `<div class="auto-panel" style="margin:0 26px 20px; position:relative;">
      <button onclick="closeBulkResults()" title="Bağla" style="position:absolute; top:14px; right:14px; background:var(--navy-3); color:var(--text-dim); border:1px solid var(--line2); border-radius:8px; width:30px; height:30px; font-size:16px; cursor:pointer; line-height:1;">×</button>
      <h3>Toplu Analiz <span style="color:var(--text-faint); font-weight:400; font-size:12px;">· "${fltEscapeHtml(filter.name)}" · ${filtered.length} nəticə (${rowsOut.length} matç yoxlanıldı)</span></h3>
      <div style="font-family:var(--mono); font-size:11px; color:var(--text-faint); margin:6px 0 12px;">Bir sətrə bas ki, əsas cədvəldə tam nəticəni görəsən</div>
      <div class="flt-list">${itemsHtml}</div>
      <button class="btn btn-clear" style="margin-top:14px;" onclick="closeBulkResults()">↓ Cədvələ qayıt</button>
    </div>`;
    area.scrollIntoView({ behavior: "smooth", block: "start" });
  }, 20);
}

function closeBulkResults(){
  const area = document.getElementById("bulkResultsArea");
  if(area) area.innerHTML = "";
  const resultsArea = document.getElementById("resultsArea");
  if(resultsArea) resultsArea.scrollIntoView({ behavior: "smooth", block: "start" });
}

function inspectBulkMatch(idx) {
  const r = (window.BULK_RESULTS_CACHE || [])[idx];
  if (!r) return;
  clearOddsBoxesOnly();
  for (const key of r.activeKeys) {
    const el = document.getElementById("val-" + key);
    if (el) { el.value = r.m.row[key]; markFilled(key); }
  }
  runFilter();
  const resultsArea = document.getElementById("resultsArea");
  if (resultsArea) resultsArea.scrollIntoView({ behavior: "smooth", block: "start" });
}

/* ---------------------------------------------------------------
   Tarix seçimi — Flashscore feed-i "day" offset-i ilə işləyir
   (0=bugün, 1=sabah, 2/3=sonrakı günlər). Seçim qutusunu real
   tarixlərlə (bugünə görə) doldururuq ki, admin dəqiq hansı günü
   çəkdiyini görsün.
--------------------------------------------------------------- */
function todayPopulateDaySelect() {
  const sel = document.getElementById("todayDaySelect");
  if (!sel || sel.options.length) return; // artıq doldurulubsa təkrar etmə
  const labels = ["Bugün", "Sabah", "2 gün sonra", "3 gün sonra"];
  const now = new Date();
  for (let i = 0; i <= 3; i++) {
    const d = new Date(now);
    d.setDate(d.getDate() + i);
    const dateStr = d.toLocaleDateString("az-AZ", { day: "2-digit", month: "2-digit", year: "numeric" });
    const opt = document.createElement("option");
    opt.value = String(i);
    opt.textContent = `${labels[i]} (${dateStr})`;
    sel.appendChild(opt);
  }
}

let TODAY_CANCEL = false;
let TODAY_FETCHED_LABEL = "";

async function runTodayMatchesFetch() {
  const isAdmin = typeof CURRENT_USER !== "undefined" && CURRENT_USER && typeof ADMIN_UID !== "undefined" && CURRENT_USER.uid === ADMIN_UID;
  if (!isAdmin) return;

  const area = document.getElementById("todayMatchesArea");
  const btn = document.getElementById("todayMatchesBtn");
  if (!area) return;

  const daySelect = document.getElementById("todayDaySelect");
  const dayOffset = daySelect ? parseInt(daySelect.value, 10) || 0 : 0;
  TODAY_FETCHED_LABEL = daySelect && daySelect.selectedIndex >= 0
    ? daySelect.options[daySelect.selectedIndex].textContent
    : "Bugün";

  TODAY_CANCEL = false;
  btn.disabled = true;
  btn.textContent = "⏳ Çəkilir...";
  area.innerHTML = '<div class="empty-state"><div class="spinner" style="margin:0 auto 14px;"></div><div>Günün matçları siyahısı çəkilir...</div></div>';

  let allMatches;
  try {
    allMatches = await todayFetchMatchList(dayOffset);
  } catch (err) {
    area.innerHTML = `<div class="empty-state"><div class="big">Matç siyahısı çəkilmədi</div><div>${err.message}</div></div>`;
    btn.disabled = false; btn.textContent = "🔄 Günün matçlarını çək";
    return;
  }

  const matches = allMatches.filter(m => todayIsWantedLeague(m.league));

  if (!matches.length) {
    const sample = [...new Set(allMatches.map(m => m.league).filter(Boolean))].slice(0, 30);
    area.innerHTML = `<div class="empty-state">
      <div class="big">Seçilmiş liqalarda matç tapılmadı</div>
      <div style="margin-top:8px; font-family:var(--mono); font-size:11px; color:var(--text-dim); text-align:left;">
        Bugün mövcud liqalardan nümunə:<br>${sample.map(s => s.replace(/</g,'&lt;')).join('<br>')}
      </div></div>`;
    btn.disabled = false; btn.textContent = "🔄 Günün matçlarını çək";
    return;
  }

  area.innerHTML = `
    <div style="display:flex; align-items:center; justify-content:space-between; gap:10px; margin:0 26px 10px; flex-wrap:wrap;">
      <div id="todayProgress" style="font-family:var(--mono); font-size:12px; color:var(--text-dim);">${TODAY_FETCHED_LABEL} — 0 / ${matches.length} matç yoxlanıldı...</div>
      <button class="btn btn-clear" onclick="TODAY_CANCEL=true;">■ Dayandır</button>
    </div>`;

  const progressEl = document.getElementById("todayProgress");
  let shown = 0;
  const collected = [];

  for (let i = 0; i < matches.length; i++) {
    if (TODAY_CANCEL) break;
    const m = matches[i];
    let entries = [];
    try { entries = await todayFetchBet365Entries(m.id); } catch (err) { entries = []; }
    if (entries.length) {
      const row = todayBuildRow(entries);
      collected.push({ id: m.id, home: m.home, away: m.away, league: m.league, row });
      shown++;
      // Canlı olaraq əsas cədvəlin başına əlavə et — hər tapılan matçdan sonra
      TODAY_MATCHES_CACHE = collected;
      if (typeof runFilter === "function") runFilter();
    }
    if (progressEl) progressEl.textContent = `${TODAY_FETCHED_LABEL} — ${i + 1} / ${matches.length} matç yoxlanıldı (${shown} nəticə tapıldı)`;
    if (i < matches.length - 1) await new Promise(r => setTimeout(r, TODAY_SLEEP_MS));
  }

  TODAY_MATCHES_CACHE = collected;
  TODAY_LAST_FETCHED_AT = new Date().toLocaleString("az-AZ");
  const saved = await todaySaveToFirestore();
  todayRenderStatusLine();

  const saveNote = saved ? "(Yadda saxlanıldı — hamıda görünəcək)" : "⚠️ Yadda saxlanmadı, konsola bax";
  if (progressEl) {
    progressEl.textContent = TODAY_CANCEL
      ? `${TODAY_FETCHED_LABEL} — Dayandırıldı — ${shown} matçda Bet365 açılış əmsalı tapıldı. ${saveNote}`
      : `${TODAY_FETCHED_LABEL} — Tamamlandı — ${shown} matçda Bet365 açılış əmsalı tapıldı. ${saveNote}`;
  }
  btn.disabled = false;
  btn.textContent = "🔄 Günün matçlarını çək";
}

todayPopulateDaySelect();
todayLoadFromFirestore();
