// ==UserScript==
// @name         Messenger
// @namespace    Claude
// @version      1.0
// @description
// @author       10Geri
// @match        https://www.facebook.com/*
// @run-at       document-start
// @grant        none
// ==/UserScript==

(function () {
  'use strict';
  // csak egyszer fusson (akkor is, ha a Tampermonkey többször injektálná)
  if (document.documentElement.dataset.fbmSlim === '1') return;
  document.documentElement.dataset.fbmSlim = '1';
  /* ------------------------- beállítások ------------------------- */
  const COLLAPSED_WIDTH = 100;  // px – az összecsukott (csak avatar) sáv szélessége
  const TOP_BAND = 44;          // px – a sáv tetején a kapcsológombnak fenntartott hely
  const BUBBLE_RATIO = 0.9;     // az üzenetbuborékok szélessége a középső oszlop arányában (~90%)
  const BUBBLE_PADDING = 8;     // a buborék vízszintes belső margója (px)
  const LS_KEY = 'fbm_sidebar_collapsed';
  const LS_UNREAD = 'fbm_unread_counts';
  const LS_BUBBLE_MAX = 'fbm_bubble_max';
  // Vészkapcsoló: ha a böngésző konzoljában kiadod, hogy
  //   localStorage.setItem('fbm_disabled','1')
  // (visszakapcsolás: localStorage.removeItem('fbm_disabled'), majd F5),
  // a script semmit sem csinál. Így ki lehet próbálni nélküle is az oldalt.
  function scriptDisabled() {
    try {
      return localStorage.getItem('fbm_disabled') === '1';
    } catch (e) {
      return false;
    }
  }
  /* ------------------------- ikonok ------------------------- */
  const ICON_COLLAPSE =
    '<svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" style="pointer-events:none">' +
    '<rect x="3" y="3" width="18" height="18" rx="2"></rect><line x1="9" y1="3" x2="9" y2="21"></line>' +
    '<path d="M6.5 10.5L5 12l1.5 1.5"></path></svg>';
  const ICON_EXPAND =
    '<svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" style="pointer-events:none">' +
    '<rect x="3" y="3" width="18" height="18" rx="2"></rect><line x1="9" y1="3" x2="9" y2="21"></line>' +
    '<path d="M5 10.5L6.5 12L5 13.5"></path></svg>';
  /* ------------------------- állapot ------------------------- */
  let collapsedState = false;
  try {
    collapsedState = localStorage.getItem(LS_KEY) === '1';
  } catch (e) {}
  function isCollapsed() {
    return collapsedState;
  }
  function setCollapsed(v) {
    collapsedState = !!v;
    persistState();
  }
  // A Facebook időnként kitörli a localStorage tartalmát – ilyenkor csak
  // visszaírjuk az állapotot, a futó munkamenet állapota sosem innen jön.
  function persistState() {
    try {
      const want = collapsedState ? '1' : '0';
      if (localStorage.getItem(LS_KEY) !== want) localStorage.setItem(LS_KEY, want);
    } catch (e) {}
  }
  /* ---------- 0) chat ablakok automatikus bezárása a facebook.com-on ---------- */
  // A script mostantól az egész facebook.com-on fut, de a Messenger-felület
  // átalakítása CSAK a /messages/ oldalakon történhet – a többi oldalon egyedül
  // a lenti automatikus chat-bezárás aktív. (Enélkül pl. a szűrősor-elrejtés a
  // hírfolyam saját fül-sorát is eltüntetné.)
  function onMessengerPage() {
    return /^\/messages(\/|$)/.test(location.pathname);
  }
  // A reels-videók önálló oldala (pl. /reel/863170086882409). A 9) szakasz
  // nagyító módja csak itt aktív.
  function onReelPage() {
    return /^\/reel(\/|$)/.test(location.pathname);
  }
  // A jobb alsó sarokban felbukkanó kis chat-ablakokat és az összecsukott
  // chat-ikonokat azonnal bezárjuk. Élesben ellenőrizve: mindhárom fajta záró
  // gomb pontosan ugyanazt az aria-label-t viseli ("Chat bezárása"), és a
  // chat-ikonok záró gombja rejtve (0×0 méretben) is OTT VAN a DOM-ban –
  // ezért egérrel rámutatás (hover) nélkül is kattintható.
  // A minta szándékosan szigorú: csak a "bezárás"/"close" gombra illeszkedik,
  // semmilyen törlő/elhagyó műveletre nem.
  const CLOSE_CHAT_LABEL_RE = /^\s*(chat|csevegés)\s+bezárása\s*$|^\s*close chat\s*$/i;
  // A profilokon lévő "Üzenet" gomb (élesben: div[role="button"], aria-label="Üzenet").
  const MESSAGE_BTN_RE = /^\s*(üzenet|message)\s*$/i;
  // Ha a felhasználó MAGA nyit chatet az "Üzenet" gombbal, azt nyitva hagyjuk.
  // Az engedély a következő oldalváltásig (vagy újratöltésig) él.
  let allowDockedChats = false;
  let lastAllowPath = '';
  function allowChatsForThisPage() {
    allowDockedChats = true;
    lastAllowPath = location.pathname;
  }
  // Valódi (felhasználói) kattintás figyelése. A kattintásba nem szólunk bele,
  // csak megjegyezzük a szándékot. HÁROM eset számít engedélynek:
  //   1) profilon az "Üzenet" gomb,
  //   2) a jobb felső üzenetek-listából kiválasztott beszélgetés,
  //   3) a jobb alsó sarokban lévő kis chat-ikon.
  // Minden más esetben a magától felbukkanó chat ablak bezáródik.
  function isPermittedChatOpener(target) {
    let node = target;
    for (let i = 0; i < 6 && node && node !== document.body; i++) {
      if (node.getAttribute) {
        // 1) "Üzenet" gomb (profiloldal)
        const label = node.getAttribute('aria-label') || '';
        const text = (node.textContent || '').replace(/\s+/g, ' ').trim();
        if (MESSAGE_BTN_RE.test(label)) return true;
        if (node.getAttribute('role') === 'button' && MESSAGE_BTN_RE.test(text)) return true;
        // 2) beszélgetésre mutató link (a jobb felső üzenetek-lista sorai ilyenek)
        const href = node.getAttribute('href') || '';
        if (/\/messages\/(e2ee\/)?t\//.test(href)) return true;
      }
      // 3) kattintás a jobb alsó chat-dokkban (kis chat-ikonok)
      if (node.getBoundingClientRect && isInChatDock(node)) return true;
      node = node.parentElement;
    }
    return false;
  }
  document.addEventListener(
    'click',
    (ev) => {
      if (!ev.isTrusted) return;
      if (onMessengerPage()) return;
      if (isPermittedChatOpener(ev.target)) allowChatsForThisPage();
    },
    true
  );
  // A chat-dokk a képernyő jobb SZÉLÉHEZ rögzítve jelenik meg. Csak az ide eső
  // gombokra kattintunk – így a script biztosan nem nyúlhat hozzá semmi máshoz
  // az oldalon.
  function isInChatDock(el) {
    const vw = window.innerWidth;
    const vh = window.innerHeight;
    const r = el.getBoundingClientRect();
    if (r.right < vw - 420 || r.bottom < vh * 0.15) return false;
    let node = el;
    for (let i = 0; i < 12 && node; i++) {
      if (getComputedStyle(node).position === 'fixed') {
        const pr = node.getBoundingClientRect();
        if (pr.right >= vw - 420) return true;
      }
      node = node.parentElement;
    }
    return false;
  }
  function closeDockedChats() {
    // A Messenger saját oldalán nincs chat-dokk, ott tehát ELVBŐL nem kattintunk
    // semmire – így a script ott semmilyen váratlan navigációt nem okozhat.
    if (onMessengerPage()) return;
    // Oldalváltáskor a felhasználói kattintással adott engedély lejár.
    if (allowDockedChats && location.pathname !== lastAllowPath) allowDockedChats = false;
    if (allowDockedChats) return;
    const btns = document.querySelectorAll('[role="button"][aria-label]');
    for (let i = 0; i < btns.length; i++) {
      const btn = btns[i];
      if (!CLOSE_CHAT_LABEL_RE.test(btn.getAttribute('aria-label') || '')) continue;
      if (!isInChatDock(btn)) continue;
      // CSAK a kinyitott chat ablakot zárjuk be. A kis, összecsukott chat-ikonok
      // záró gombja rejtett (0×0 méretű, csak rámutatásra jelenik meg) – ezeket
      // szándékosan békén hagyjuk, hogy rájuk tudj kattintani.
      const r = btn.getBoundingClientRect();
      if (r.width < 8 || r.height < 8) continue;
      try {
        btn.click();
      } catch (e) {}
    }
  }
  /* ---------- 0b) a navigációba SOHA nem szólunk bele ---------- */
  // Korábban itt egy "biztosíték" állt: ha egy beszélgetés-linkre kattintva a
  // Messenger nem hívta meg a preventDefault-ot, a script maga tiltotta le a
  // böngésző navigációját, és history.pushState + egy MŰ popstate eseménnyel
  // próbált lapváltás nélkül átváltani.
  //
  // Ez volt az "újratölti magát" és az "Ezt a chatet törölték" hiba forrása
  // (pl. ha új ismerősnek – Nagy Péternek – írtál először):
  //   – A kezelőnket a script document-start időpontban regisztrálta, vagyis a
  //     Facebook SAJÁT, szintén a dokumentumon ülő kattintáskezelője ELŐTT.
  //     Így mi futottunk először, letiltottuk a navigációt, és a Facebook
  //     ezután (defaultPrevented miatt) már nem végezte el a sajátját.
  //   – A Messenger a még nem létező (új ismerős), archivált, illetve kérés
  //     állapotú beszélgetéseket szándékosan más úton nyitja meg. A mű popstate
  //     a Messenger útválasztójának nyilvántartása NÉLKÜL írta át a címet:
  //     a Messenger nem találta a beszélgetést → "a chat törlésre került", és
  //     helyreállításként újratöltötte az oldalt. Az első üzenet elküldésekor
  //     (amikor az ideiglenes beszélgetésből valódi lesz) ugyanez ismétlődött.
  // A kattintást ezért mostantól KIZÁRÓLAG a Messenger kezeli, minden esetben
  // (fő lista, keresési találat, új ismerős, archivált chat, üzenetkérés).
  // A korábbi ok – hogy a kapcsológomb elkapta a chatre szánt kattintást – már
  // nem áll fenn: a gomb pointer-events:none, és saját sávja van (TOP_BAND).
  /* ------------------------- segédfüggvények ------------------------- */
  function debounce(fn, wait) {
    let t = null;
    return function (...a) {
      clearTimeout(t);
      t = setTimeout(() => fn.apply(this, a), wait);
    };
  }
  // Folyamatos DOM-változásnál (pl. beszélgetés betöltése) a debounce sosem
  // futna le; a throttle garantálja, hogy adott időnként mindenképp lefut.
  function throttle(fn, wait) {
    let last = 0;
    let timer = null;
    return function () {
      const now = Date.now();
      const rest = wait - (now - last);
      if (rest <= 0) {
        last = now;
        fn();
      } else if (timer === null) {
        timer = setTimeout(() => {
          timer = null;
          last = Date.now();
          fn();
        }, rest);
      }
    };
  }
  // Az oldalsáv szűrő-fülsora. Ezt MINDIG frissen keressük meg (nem tárolt
  // hivatkozásból), mert a Messenger újrarajzoláskor kicserélheti.
  //
  // A fülsor a mi stíluslapunk miatt el van rejtve, tehát saját mérete nincs –
  // ezért a helyét a legközelebbi MÉRHETŐ őséből olvassuk ki. Így is biztosan
  // meg tudjuk különböztetni a bal oldali, keskeny oszlop fülsorát a főablak
  // (pl. a médiapanel) saját fülsorától.
  function getAnchor() {
    const list = document.querySelectorAll('div[role="tablist"]');
    for (let i = 0; i < list.length; i++) {
      let n = list[i];
      let r = n.getBoundingClientRect();
      for (let d = 0; d < 6 && (!r.width || !r.height) && n.parentElement; d++) {
        n = n.parentElement;
        r = n.getBoundingClientRect();
      }
      if (r.width > 0 && r.width < 520 && r.left < window.innerWidth * 0.5) return list[i];
    }
    return list[0] || null;
  }
  // A bal oldali oszlop: az első olyan ős, amely egy flex sor eleme, teljes
  // magasságú, és a mellette lévő testvér (a chat ablak) szélesebb nála.
  function findSidebar() {
    let node = getAnchor();
    for (let i = 0; i < 20 && node; i++) {
      const p = node.parentElement;
      if (!p) return null;
      const ns = node.nextElementSibling;
      const r = node.getBoundingClientRect();
      if (
        p.children.length >= 2 &&
        getComputedStyle(p).display === 'flex' &&
        ns &&
        r.height > 300 &&
        ns.getBoundingClientRect().width > r.width
      ) {
        return node;
      }
      node = p;
    }
    return null;
  }
  let sidebarEl = null;
  let classObserver = null;
  function getSidebar() {
    const found = findSidebar();
    if (found && found !== sidebarEl) {
      sidebarEl = found;
      watchSidebarClass(found);
      document.querySelectorAll('.fbm-sidebar').forEach((el) => {
        if (el !== found) el.classList.remove('fbm-sidebar', 'fbm-collapsed');
      });
    }
    if (!found && sidebarEl && !sidebarEl.isConnected) sidebarEl = null;
    return found || (sidebarEl && sidebarEl.isConnected ? sidebarEl : null);
  }
  // Keresés folyik-e éppen az oldalsáv keresőmezőjében? Ilyenkor a lista
  // helyén a KERESÉSI TALÁLATOK állnak (pl. "Nagy Péter"), nem a beszélgetések.
  function sidebarSearching(sb) {
    const inputs = sb.querySelectorAll('input');
    for (let i = 0; i < inputs.length; i++) {
      const r = inputs[i].getBoundingClientRect();
      if (r.width > 60 && r.height > 10 && (inputs[i].value || '').trim()) return true;
    }
    return false;
  }
  // A FŐ beszélgetéslista rácsa (role="grid").
  //
  // Az archivált chatek, az üzenetkérések és a korlátozott fiókok UGYANEBBEN az
  // oszlopban nyílnak meg, de SAJÁT ráccsal: ilyenkor a fő lista kicsúszik a
  // sávból (élesben: left = -360px), és két rács van egyszerre a DOM-ban.
  // Ez a függvény csak akkor ad vissza rácsot, ha az ELSŐKÉNT kirajzolt (vagyis
  // a fő) lista tényleg látszik – minden al-nézetben null-t ad, és így a script
  // ezekben a nézetekben nem avatkozik be a jelvényekbe.
  // Keresés közben is null: a találati lista sorai nem beszélgetések (egy új
  // ismerősnek még nincs is beszélgetése), az olvasatlan-számlálás sorrend-
  // figyelését pedig összezavarnák.
  function mainThreadGrid() {
    const sb = sidebarEl && sidebarEl.isConnected ? sidebarEl : findSidebar();
    if (!sb) return null;
    if (sidebarSearching(sb)) return null;
    const grid = sb.querySelector('[role="grid"]');
    if (!grid) return null;
    const gr = grid.getBoundingClientRect();
    const sr = sb.getBoundingClientRect();
    if (gr.width < 40 || gr.height < 40) return null;
    // kicsúszott a sávból (egy al-nézet tolta ki): nem ez a látható lista
    if (gr.right <= sr.left + 8 || gr.left >= sr.right - 8) return null;
    return grid;
  }
  // Ha a Messenger újrarajzoláskor letörli az osztályainkat, azonnal tegyük vissza.
  function watchSidebarClass(el) {
    if (classObserver) classObserver.disconnect();
    classObserver = new MutationObserver(() => {
      if (!el.isConnected) return;
      const wanted = isCollapsed();
      if (!el.classList.contains('fbm-sidebar') || el.classList.contains('fbm-collapsed') !== wanted) {
        el.classList.add('fbm-sidebar');
        el.classList.toggle('fbm-collapsed', wanted);
      }
    });
    classObserver.observe(el, { attributes: true, attributeFilter: ['class', 'style'] });
  }
  function getMainArea(sb) {
    const main = sb ? sb.nextElementSibling : null;
    return main;
  }
  /* ---------- 1) szűrő gombsor elrejtése + saját gombsor ---------- */
  let toggleBtnEl = null;
  // A kapcsológomb is a SAJÁT rétegünkben él (a <body> végén), nem a Messenger
  // DOM-jában – ugyanazért, amiért a jelvények: így semmilyen idegen elem nem
  // kerül a Messenger által kezelt fába.
  function ensureToggleButton() {
    if (toggleBtnEl && toggleBtnEl.isConnected) return toggleBtnEl;
    const btn = document.createElement('div');
    btn.id = 'fbm-toggle-btn';
    btn.setAttribute('role', 'button');
    btn.setAttribute('tabindex', '0');
    btn.title = 'Chat lista összecsukása / kinyitása';
    // FONTOS: a gomb NEM fog el kattintást (pointer-events:none). A kattintást
    // az alatta lévő elem kapja meg – így ha a beszélgetéslista alácsúszik, a
    // chatre szánt kattintás MINDIG a chatre megy. A gomb működését külön,
    // koordináta alapján kezeljük (lásd handleActivate).
    // Ugyanezért a `cursor: pointer` sem ITT érvényesül (a böngésző az alatta
    // lévő elem kurzorát mutatja) – azt a 2b) szakasz állítja be, a gomb helye
    // alapján. A tulajdonságot mégis meghagyjuk, hogy a gomb önmagában is
    // helyesen legyen leírva.
    btn.style.cssText =
      'position:fixed;display:none;align-items:center;justify-content:center;' +
      'width:36px;height:36px;border-radius:50%;cursor:pointer;color:inherit;' +
      'user-select:none;pointer-events:none;';
    btn.innerHTML = isCollapsed() ? ICON_EXPAND : ICON_COLLAPSE;
    getBadgeLayer().appendChild(btn);
    toggleBtnEl = btn;
    return btn;
  }
  /* ---------- 1b) az oldalsáv részeinek megjelölése ---------- */
  // A sáv felépítése felülről lefelé:
  //   [ "Chatek" fejléc + gombok ][ keresőmező sora ][ szűrő fülsor blokkja ][ lista ]
  //
  // Mindhárom részt EGYETLEN biztos pontból, a szűrő fülsorból vezetjük le:
  // attól lépkedünk felfelé az első olyan ősig, amelynek a szülője már a sáv
  // több részét fogja össze – ez a fülsor saját blokkja –, a keresőmező sora
  // pedig ennek a közvetlen előzménye.
  function sidebarSearchInput(sb) {
    const inputs = sb.querySelectorAll('input');
    for (let i = 0; i < inputs.length; i++) {
      const r = inputs[i].getBoundingClientRect();
      if (r.width > 60 && r.height > 10) return inputs[i];
    }
    return null;
  }
  function markSidebarParts(sb) {
    if (!sb) return;
    const tl = sb.querySelector('[role="tablist"]');
    if (!tl) return;
    let block = tl;
    while (block && block.parentElement && block.parentElement.children.length < 3) {
      block = block.parentElement;
      if (block === sb) return;
    }
    if (!block || block === sb || !block.parentElement) return;
    const host = block.previousElementSibling;
    if (!host) return; // a fülsor blokkja fölött kell lennie a keresőmezőnek
    if (!block.classList.contains('fbm-tabs-block')) {
      sb.querySelectorAll('.fbm-tabs-block').forEach((el) => {
        if (el !== block) el.classList.remove('fbm-tabs-block');
      });
      block.classList.add('fbm-tabs-block');
    }
    if (!host.classList.contains('fbm-search-host')) {
      sb.querySelectorAll('.fbm-search-host').forEach((el) => {
        if (el !== host) el.classList.remove('fbm-search-host');
      });
      host.classList.add('fbm-search-host');
    }
    // Összecsukott állapotban a keresőmező sora ÉS minden fölötte lévő elem
    // (a "Chatek" felirat, a "..." és az "Új üzenet" gomb) eltűnik: a chatek
    // fölött csak a kapcsológomb marad.
    let sib = host;
    while (sib) {
      sib.classList.add('fbm-hide-collapsed');
      sib = sib.previousElementSibling;
    }
  }
  /* ---------- 1c) a kapcsológomb helye ---------- */
  // A Facebook saját, ikon méretű gombjai/mezői a sáv felső részén – ezekkel a
  // gombunknak tilos ütköznie.
  //
  // FONTOS: a BESZÉLGETÉSLISTA sorai NEM számítanak ütközésnek. A gomb
  // szándékosan a lista fölött lebeg, és nem fog el kattintást
  // (pointer-events:none), tehát a chatre szánt kattintás akkor is a chatre
  // megy, ha a sor éppen alatta van.
  function sidebarTopRects(sb) {
    const sr = sb.getBoundingClientRect();
    const out = [];
    sb.querySelectorAll('[role="button"],[role="link"],a[href],input,[role="textbox"]').forEach((e) => {
      if (e.closest('[role="grid"]') || e.closest('[role="row"]')) return;
      const r = e.getBoundingClientRect();
      if (r.width < 10 || r.height < 10) return;
      if (r.width > 520 || r.height > 160) return;
      if (r.bottom < sr.top || r.top > sr.top + 240) return;
      out.push(r);
    });
    return out;
  }
  function rectsBusy(rects, x, y) {
    for (let i = 0; i < rects.length; i++) {
      const r = rects[i];
      if (r.right <= x + 2 || r.left >= x + 34 || r.bottom <= y + 2 || r.top >= y + 34) continue;
      return true;
    }
    return false;
  }
  let togglePos = null; // [x, y, összecsukva?] – az utoljára jónak talált hely
  // Összecsukva az avatarok középvonala fölé, nyitva a keresőmező sorának jobb
  // szélére kerül. A Messenger elemeit csak MÉRJÜK.
  function placeToggleButton(sb) {
    const btn = toggleBtnEl;
    if (!sb || !btn) return;
    const sr = sb.getBoundingClientRect();
    if (!sr.width) return;
    const collapsed = isCollapsed();
    let x = null;
    let y = null;
    if (collapsed) {
      // Az avatarok középvonala (medián), hogy a görgetősáv ne tolja el.
      const centers = Array.from(sb.querySelectorAll('a[role="link"]'))
        .slice(0, 6)
        .map((a) => avatarBoxFor(a))
        .filter((r) => r && r.width > 20)
        .map((r) => r.left + r.width / 2)
        .sort((a, b) => a - b);
      const cx = centers.length ? centers[Math.floor(centers.length / 2)] : sr.left + sr.width / 2;
      x = Math.round(cx - 18);
      y = Math.round(sr.top + 4);
    } else {
      const host = sb.querySelector('.fbm-search-host');
      const hr = host ? host.getBoundingClientRect() : null;
      const inp = host ? sidebarSearchInput(host) : null;
      const ir = inp ? inp.getBoundingClientRect() : null;
      if (hr && hr.width > 60 && hr.height > 10) {
        // a sáv jobb széle, de sosem a keresőmezőre ráülve
        x = Math.round(Math.max(ir ? ir.right + 2 : 0, sr.right - 46));
        y = Math.round(hr.top + hr.height / 2 - 18);
        if (x + 36 > sr.right - 2) {
          // nem fér el a sor végén: a keresőmező ALÁ kerül
          x = Math.round(sr.right - 46);
          y = Math.round(hr.bottom + 4);
        }
      }
    }
    if (x === null) {
      // Nincs mihez igazítani (a Messenger épp újrarajzol). Ilyenkor a gomb az
      // UTOLSÓ JÓ helyén marad, és ha még nincs ilyen, inkább nem látszik.
      if (togglePos && togglePos[2] === collapsed) {
        btn.style.display = 'flex';
        btn.style.left = togglePos[0] + 'px';
        btn.style.top = togglePos[1] + 'px';
      } else {
        btn.style.display = 'none';
      }
      return;
    }
    // Utolsó biztosíték NYITOTT állapotban: ha a kiszámolt hely mégis ütközne a
    // Facebook valamelyik fejléc-gombjával, lejjebb lépünk.
    if (!collapsed) {
      const rects = sidebarTopRects(sb);
      for (let i = 0; i < 4 && y < sr.top + 200 && rectsBusy(rects, x, y); i++) y += 40;
    }
    x = Math.round(Math.max(sr.left + 2, Math.min(x, sr.right - 38)));
    togglePos = [x, y, collapsed];
    btn.style.display = 'flex';
    btn.style.left = x + 'px';
    btn.style.top = y + 'px';
  }
  // Takarja-e valami KONKRÉTAN a kapcsológombot? (pl. a felső keresőmező
  // "A legutóbbiak" listája). Ha igen, a gombot elrejtjük – vagyis pontosan úgy
  // viselkedik, mintha a panel MÖGÖTT lenne.
  function toggleObstructed(sb) {
    const btn = toggleBtnEl;
    if (!sb || !btn || !btn.isConnected) return false;
    const r = btn.getBoundingClientRect();
    if (!r.width || !r.height) return false;
    const pts = [
      [r.left + r.width / 2, r.top + r.height / 2],
      [r.left + 3, r.top + 3],
      [r.right - 3, r.top + 3],
      [r.left + 3, r.bottom - 3],
      [r.right - 3, r.bottom - 3],
    ];
    for (let i = 0; i < pts.length; i++) {
      const x = Math.round(pts[i][0]);
      const y = Math.round(pts[i][1]);
      if (x < 0 || y < 0 || x >= window.innerWidth || y >= window.innerHeight) continue;
      const el = document.elementFromPoint(x, y);
      if (!el) continue;
      if (!sb.contains(el)) return true;
    }
    return false;
  }
  /* ---------- 2) összecsukás / kinyitás ---------- */
  function toggleSidebar() {
    setCollapsed(!isCollapsed());
    hideTip();
    applySidebarState();
    updateBubbleWidthVar();
    setTimeout(() => {
      updateBubbleWidthVar();
      placeToggleButton(getSidebar());
      // a gomb helye (és így a "rajta van-e az egér" válasz) megváltozott
      refreshToggleHover();
      // a teljes képernyős médiapanel az oldalsáv széléhez igazodik
      mediaTick();
    }, 80);
  }
  function applySidebarState() {
    const sb = getSidebar();
    if (!sb) return;
    const collapsed = isCollapsed();
    sb.classList.add('fbm-sidebar');
    ensureToggleButton();
    markSidebarParts(sb);
    sb.classList.toggle('fbm-collapsed', collapsed);
    placeToggleButton(sb);
    // ha felugró panel (pl. a keresési lista) került a gomb elé, a gomb eltűnik
    if (toggleBtnEl && toggleBtnEl.style.display !== 'none' && toggleObstructed(sb)) {
      toggleBtnEl.style.display = 'none';
    }
    const btn = document.getElementById('fbm-toggle-btn');
    if (btn) {
      const wanted = collapsed ? ICON_EXPAND : ICON_COLLAPSE;
      if (btn.innerHTML !== wanted) btn.innerHTML = wanted;
    }
  }
  let lastToggle = 0;
  // A gombot NEM a kattintás célpontja alapján ismerjük fel (hiszen átengedi a
  // kattintást), hanem a helye alapján. És ha a kattintás valójában egy
  // beszélgetésre esett, akkor NEM csinálunk semmit: a chat megnyitása mindig
  // fontosabb. Ezt a találati tesztet használja a kurzor-beállítás is (2b).
  function toggleHitAt(x, y, under) {
    const btn = toggleBtnEl;
    if (!btn || !btn.isConnected) return false;
    if (btn.style.display === 'none') return false;
    const layer = document.getElementById('fbm-badge-layer');
    if (layer && layer.style.display === 'none') return false;
    const r = btn.getBoundingClientRect();
    if (!r.width) return false;
    if (x < r.left || x > r.right) return false;
    if (y < r.top || y > r.bottom) return false;
    const t = under || document.elementFromPoint(x, y);
    if (t && t.closest && (t.closest('a[role="link"]') || t.closest('a[href]'))) return false;
    return true;
  }
  function handleActivate(ev) {
    if (!toggleHitAt(ev.clientX, ev.clientY, ev.target)) return;
    const now = Date.now();
    if (now - lastToggle < 400) return;
    lastToggle = now;
    toggleSidebar();
  }
  document.addEventListener('click', handleActivate, true);
  document.addEventListener(
    'keydown',
    (ev) => {
      if (ev.key !== 'Enter' && ev.key !== ' ') return;
      const t = ev.target;
      if (!t || !t.closest || !t.closest('#fbm-toggle-btn')) return;
      ev.preventDefault();
      toggleSidebar();
    },
    true
  );
  /* ---------- 2b) kurzor: pointer a kapcsológomb fölött ---------- */
  let lastPointerX = null;
  let lastPointerY = null;
  let toggleHovered = false;
  function setToggleHover(on) {
    on = !!on;
    if (on === toggleHovered) return;
    toggleHovered = on;
    document.documentElement.classList.toggle('fbm-toggle-hover', on);
    if (toggleBtnEl) toggleBtnEl.classList.toggle('fbm-hover', on);
  }
  function refreshToggleHover() {
    if (lastPointerX === null) return;
    setToggleHover(toggleHitAt(lastPointerX, lastPointerY, null));
  }
  document.addEventListener(
    'mousemove',
    (ev) => {
      lastPointerX = ev.clientX;
      lastPointerY = ev.clientY;
      setToggleHover(toggleHitAt(ev.clientX, ev.clientY, ev.target));
      // nagyított reels: az egér mozgatására villanjanak fel a gombok (9. szakasz)
      if (reelZoom) showReelChrome();
    },
    { passive: true, capture: true }
  );
  document.addEventListener('mouseleave', () => {
    lastPointerX = null;
    lastPointerY = null;
    setToggleHover(false);
  });
  window.addEventListener('blur', () => setToggleHover(false));
  window.addEventListener('scroll', refreshToggleHover, true);
  /* ---------- 3) névbuborék az avatarok mellé (összecsukott állapotban) ---------- */
  let tipEl = null;
  function getTip() {
    if (tipEl && tipEl.isConnected) return tipEl;
    tipEl = document.createElement('div');
    tipEl.id = 'fbm-tip';
    tipEl.style.cssText =
      'position:fixed;z-index:2147482001;pointer-events:none;display:none;' +
      'background:rgba(0,0,0,0.85);color:#fff;font-size:12px;line-height:16px;' +
      'font-family:inherit;padding:5px 8px;border-radius:6px;white-space:nowrap;' +
      'box-shadow:0 2px 8px rgba(0,0,0,0.4);max-width:280px;overflow:hidden;text-overflow:ellipsis;';
    document.body.appendChild(tipEl);
    return tipEl;
  }
  function hideTip() {
    if (tipEl) tipEl.style.display = 'none';
  }
  function chatNameOf(link) {
    const span = link.querySelector('span');
    let name = span ? span.textContent.trim() : '';
    if (!name) name = (link.textContent || '').trim().split('\n')[0];
    return name.slice(0, 60);
  }
  function showTipFor(link) {
    const sb = getSidebar();
    if (!sb || !isCollapsed()) return hideTip();
    const name = chatNameOf(link);
    if (!name) return hideTip();
    const tip = getTip();
    tip.textContent = name;
    tip.style.display = 'block';
    const img = link.querySelector('img');
    const anchorRect = (img || link).getBoundingClientRect();
    const sbRect = sb.getBoundingClientRect();
    const th = tip.offsetHeight || 26;
    let top = Math.round(anchorRect.top + anchorRect.height / 2 - th / 2);
    top = Math.max(4, Math.min(top, window.innerHeight - th - 4));
    const left = Math.round(Math.max(anchorRect.right, sbRect.right) + 8);
    tip.style.top = top + 'px';
    tip.style.left = left + 'px';
  }
  document.addEventListener(
    'pointerover',
    (ev) => {
      if (!isCollapsed()) return;
      const sb = getSidebar();
      if (!sb) return;
      const t = ev.target;
      const link = t && t.closest ? t.closest('a[role="link"]') : null;
      if (!link || !sb.contains(link)) return hideTip();
      showTipFor(link);
    },
    true
  );
  document.addEventListener(
    'pointerout',
    (ev) => {
      const t = ev.relatedTarget;
      const sb = sidebarEl;
      if (!sb || !t || !sb.contains(t)) hideTip();
      else if (t.closest && !t.closest('a[role="link"]')) hideTip();
    },
    true
  );
  window.addEventListener('scroll', hideTip, true);
  window.addEventListener('blur', hideTip);
  // Beszélgetésre kattintva tűnjön el a számláló (csak figyelünk, a kattintásba
  // nem szólunk bele).
  document.addEventListener(
    'click',
    (ev) => {
      const t = ev.target;
      const link = t && t.closest ? t.closest('a[role="link"]') : null;
      if (!link) return;
      const sb = sidebarEl;
      if (!sb || !sb.contains(link)) return;
      clearUnreadFor(link);
      setTimeout(() => {
        const s = getSidebar();
        if (s) {
          clearUnreadFor(link);
        }
      }, 600);
    },
    true
  );
  /* ---------- 4) olvasatlan üzenetek száma az avatarokon ---------- */
  // Beszélgetésenként a még el nem olvasott, KONKRÉT üzenetek előnézeteit
  // tartjuk nyilván (nem egy felgyűlő számlálót); a jelvényen ennek a hossza
  // látszik. A jel maga a TARTALOM VÁLTOZÁSA, megerősítéssel.
  const UNREAD_VERSION = 8; // 8: új előnézet-olvasás → a régi, hibás állapot eldobása
  const MAX_ITEMS = 99;
  const MAX_HIST = 12;
  // { [chatId]: { items, last, bold, idx, reacts, hist } }
  //   items – a még el nem olvasott üzenetek előnézetei (ennyi a piros szám)
  //   last  – az utoljára látott előnézet (ehhez képest nézzük, változott-e)
  //   bold  – félkövér volt-e a sor a legutóbbi ellenőrzéskor
  //   hist  – a sorban korábban már látott előnézetek (ezek sosem "újak")
  let unread = { v: UNREAD_VERSION, threads: {} };
  function threadState(id) {
    let st = unread.threads[id];
    if (!st || typeof st !== 'object' || !Array.isArray(st.items)) {
      st = { items: Array.isArray(st) ? st.slice(0, MAX_ITEMS) : [], last: '', bold: false, idx: -1, reacts: [], hist: [] };
      unread.threads[id] = st;
    }
    if (typeof st.last !== 'string') st.last = '';
    if (!Array.isArray(st.reacts)) st.reacts = [];
    if (!Array.isArray(st.hist)) st.hist = [];
    // korábbi változatból megmaradt, reakció miatti számok törlése
    if (st.items.some(isReactionPreview)) st.items = st.items.filter((x) => !isReactionPreview(x));
    st.bold = !!st.bold;
    return st;
  }
  /* --- reakciók: SOHA nem számítanak új üzenetnek --- */
  // Ha valaki csak REAGÁL az üzenetemre, a Messenger ettől átírja a sor
  // előnézetét, és a sort a lista tetejére is felteszi. Két hiba jött ebből:
  //   1) maga a reakciós előnézet ("… reagált …") új üzenetnek számított,
  //   2) a Messenger a reakció szövegét és az alatta lévő (RÉGI) üzenetet
  //      oda-vissza váltogatja a soron – a régi üzenet így "megváltozott",
  //      lista tetején álló sornak látszott, és újként kapott számot.
  // Mostantól: a reakciós előnézet sosem kap jelvényt, és egy sorban egyszer
  // már látott előnézet (hist) sem számít soha újnak.
  const REACTION_RE =
    /reag(á|a)l|reakci(ó|o)|reacted|reaction|kedveli az üzenet|kedvelte az üzenet|liked your message|loved your message/i;
  const MAX_REACTS = 20;
  function isReactionPreview(preview) {
    return REACTION_RE.test(preview || '');
  }
  function reactionSeen(st, preview) {
    for (let i = 0; i < st.reacts.length; i++) {
      if (sameMessage(st.reacts[i], preview)) return true;
    }
    return false;
  }
  function rememberReaction(st, preview) {
    if (!preview || reactionSeen(st, preview)) return;
    st.reacts.push(preview);
    while (st.reacts.length > MAX_REACTS) st.reacts.shift();
  }
  function seenBefore(st, preview) {
    for (let i = 0; i < st.hist.length; i++) {
      if (sameMessage(st.hist[i], preview)) return true;
    }
    return false;
  }
  function rememberSeen(st, preview) {
    if (!preview || seenBefore(st, preview)) return;
    st.hist.push(preview);
    while (st.hist.length > MAX_HIST) st.hist.shift();
  }
  // Az alapállapot beállítása: amit egyszer "utolsónak" láttunk, azt meg is
  // jegyezzük, hogy később, visszaváltáskor ne tűnjön újnak.
  function setLast(st, preview) {
    st.last = preview;
    rememberSeen(st, preview);
  }
  // A főablakban ÉPPEN NYITOTT beszélgetés azonosítója – amit nézek, azt olvasom.
  function openThreadId() {
    const m = location.pathname.match(/\/t\/(\d+)/);
    return m ? m[1] : null;
  }
  function readStoredUnread() {
    try {
      const raw = localStorage.getItem(LS_UNREAD);
      if (!raw) return null;
      const p = JSON.parse(raw);
      if (p && typeof p === 'object' && p.v === UNREAD_VERSION && p.threads) return p;
    } catch (e) {}
    return null;
  }
  (function loadStoredUnread() {
    const p = readStoredUnread();
    if (p) unread.threads = p.threads;
  })();
  // Két előnézet ugyanazt az üzenetet jelenti, ha megegyeznek, vagy ha az egyik
  // a másik eleje.
  function sameMessage(a, b) {
    if (a === b) return true;
    if (!a || !b) return false;
    const short = a.length <= b.length ? a : b;
    const long = a.length <= b.length ? b : a;
    return short.length >= 12 && long.indexOf(short) === 0;
  }
  function addUnreadItem(list, item) {
    if (isReactionPreview(item)) return false;
    for (let i = 0; i < list.length; i++) {
      if (sameMessage(list[i], item)) {
        if (item.length > list[i].length) list[i] = item;
        return false;
      }
    }
    if (list.length >= MAX_ITEMS) return false;
    list.push(item);
    return true;
  }
  // Mentés előtt egyesítünk a lemezen lévő állapottal (két megnyitott fül).
  function saveUnreadNow() {
    try {
      const stored = readStoredUnread();
      if (stored && stored.threads) {
        Object.keys(stored.threads).forEach((id) => {
          const theirs = stored.threads[id];
          if (!theirs || !Array.isArray(theirs.items)) return;
          const mine = unread.threads[id];
          if (!mine) {
            unread.threads[id] = {
              items: theirs.items.filter((x) => !isReactionPreview(x)).slice(0, MAX_ITEMS),
              last: typeof theirs.last === 'string' ? theirs.last : '',
              bold: !!theirs.bold,
              reacts: Array.isArray(theirs.reacts) ? theirs.reacts.slice(-MAX_REACTS) : [],
              hist: Array.isArray(theirs.hist) ? theirs.hist.slice(-MAX_HIST) : [],
            };
            return;
          }
          const st = threadState(id);
          if (!st.last && typeof theirs.last === 'string') st.last = theirs.last;
          if (Array.isArray(theirs.reacts)) theirs.reacts.forEach((r) => rememberReaction(st, r));
          if (Array.isArray(theirs.hist)) theirs.hist.forEach((h) => rememberSeen(st, h));
          // ha mi már olvasottnak látjuk (üres lista), az erősebb: nem töltjük vissza
          if (st.items.length) theirs.items.forEach((it) => addUnreadItem(st.items, it));
        });
      }
      localStorage.setItem(LS_UNREAD, JSON.stringify(unread));
    } catch (e) {}
  }
  const saveUnread = debounce(saveUnreadNow, 400);
  window.addEventListener('storage', (ev) => {
    if (ev.key !== LS_UNREAD) return;
    const p = readStoredUnread();
    if (!p) return;
    unread.threads = p.threads;
    const grid = mainThreadGrid();
    if (grid) renderBadges(grid);
  });
  function chatIdOf(link) {
    const href = link.getAttribute('href') || '';
    const m = href.match(/\/t\/(\d+)/);
    return m ? m[1] : null;
  }
  // A sor szövege az emodzsikkal EGYÜTT (az <img> alt szövegeit is beleolvasva).
  function richTextOf(root) {
    if (!root) return '';
    let out = '';
    const walk = document.createTreeWalker(root, NodeFilter.SHOW_TEXT | NodeFilter.SHOW_ELEMENT, null);
    let n;
    while ((n = walk.nextNode())) {
      if (n.nodeType === 3) out += n.nodeValue;
      else if (n.tagName === 'IMG') {
        const alt = n.getAttribute('alt');
        if (alt) out += alt;
      }
    }
    return out.replace(/\s+/g, ' ').trim();
  }
  // A sort a SZERKEZETE alapján bontjuk szét:
  // [ név ][ üzenet-előnézet ][ "·" ][ időbélyeg ]( [ "·" ][ javaslat ] )
  function rowParts(link) {
    // Szövegegységek: az a span, amelynek SAJÁT szövege van (a teljes
    // tartalmával együtt, a beágyazott emodzsikkal), illetve a csak emodzsit
    // tartalmazó legbelső span. Élesben kimérve: a reakciós előnézetnél a
    // "Reagált az üzenetedre: ❤️" szöveg egy olyan spanben ül, amelyben az
    // emodzsi egy BEÁGYAZOTT spanben van – a korábbi, csak a legbelső
    // spaneket olvasó változat ezért csak a "❤️"-t látta, és a reakciót
    // nem ismerte fel.
    const leaves = [];
    const taken = [];
    link.querySelectorAll('span').forEach((s) => {
      for (let i = 0; i < taken.length; i++) if (taken[i].contains(s)) return;
      let own = false;
      for (let c = s.firstChild; c; c = c.nextSibling) {
        if (c.nodeType === 3 && c.nodeValue.trim()) {
          own = true;
          break;
        }
      }
      if (!own && s.querySelector('span')) return;
      const t = richTextOf(s);
      if (!t) return;
      taken.push(s);
      leaves.push(t);
    });
    if (!leaves.length) return { preview: '', stamp: '' };
    let dot = -1;
    for (let i = 1; i < leaves.length; i++) {
      if (leaves[i] === '·') {
        dot = i;
        break;
      }
    }
    const mid = dot < 0 ? leaves.slice(1) : leaves.slice(1, dot);
    let stamp = '';
    if (dot >= 0) {
      const rest = leaves.slice(dot + 1).filter((x) => x !== '·');
      stamp = rest.length ? rest[0] : '';
    }
    const preview = mid
      .join(' ')
      .replace(/^\s*(Olvasatlan üzenet|Unread message)\s*:?\s*/i, '')
      .trim()
      .slice(0, 160);
    return { preview, stamp };
  }
  function previewOf(link) {
    return rowParts(link).preview;
  }
  function isFreshStamp(stamp) {
    if (!stamp) return false;
    if (/^\s*(most|now)\s*$/i.test(stamp)) return true;
    if (/^\s*\d+\s*(mp|s|sec)\.?\s*$/i.test(stamp)) return true;
    const rel = stamp.match(/^\s*(\d+)\s*(p|perc|m|min)\.?\s*$/i);
    if (rel) return parseInt(rel[1], 10) <= 10;
    const clock = stamp.match(/^\s*(\d{1,2}):(\d{2})\s*$/);
    if (clock) {
      const now = new Date();
      const mins = now.getHours() * 60 + now.getMinutes() - (parseInt(clock[1], 10) * 60 + parseInt(clock[2], 10));
      return mins >= -2 && mins <= 10;
    }
    return false;
  }
  function isOldStamp(stamp) {
    return /^\s*\d+\s*(ó|óra|n|nap|h|hét|hete|hó|hónap|éve|év|w|d)\.?\s*$/i.test(stamp || '');
  }
  function isTypingIndicator(text) {
    return /gépel(\s*\.{2,3})?\s*$|typing\s*\.{2,3}\s*$/i.test(text);
  }
  // A SAJÁT kimenő tételeim (másik eszközről küldve is).
  function isOwnOutgoing(preview) {
    return (
      /^\s*(te|you)\s*:/i.test(preview) ||
      /^\s*(elküldtél|you sent)\b/i.test(preview) ||
      /küldtél\.?\s*$/i.test(preview) ||
      /nem fogadta a (hang|vide[oó])hívásodat/i.test(preview)
    );
  }
  function isUnreadRow(link) {
    const span = link.querySelector('span');
    if (span) {
      const fw = parseInt(getComputedStyle(span).fontWeight, 10);
      if (fw >= 600) return true;
    }
    return /olvasatlan|unread/i.test(link.textContent || '');
  }
  function updateUnreadCounts(scope) {
    let changed = false;
    const openId = openThreadId();
    const pending = [];
    const textCount = {};
    scope.querySelectorAll('a[role="link"]').forEach((link, idx) => {
      const id = chatIdOf(link);
      if (!id) return;
      const parts = rowParts(link);
      const preview = parts.preview;
      if (!preview) return;
      if (isTypingIndicator(preview)) return;
      const st = threadState(id);
      const bold = isUnreadRow(link);
      const prevIdx = typeof st.idx === 'number' ? st.idx : -1;
      const movedUp = prevIdx >= 0 && idx < prevIdx;
      const atTop = idx === 0;
      st.idx = idx;
      // Amit épp nézek, azt olvasom: a nyitott beszélgetés sosem mutat számot.
      if (openId && openId === id) {
        if (st.items.length) changed = true;
        st.items = [];
        setLast(st, preview);
        st.bold = false;
        if (isReactionPreview(preview)) rememberReaction(st, preview);
        return;
      }
      // Első észlelés (friss oldalbetöltés): csak a félkövér jelölés számít.
      if (!st.last) {
        setLast(st, preview);
        st.bold = bold;
        if (!bold || isOwnOutgoing(preview)) return;
        if (isReactionPreview(preview)) {
          rememberReaction(st, preview);
          return; // reakció: sosem új üzenet
        }
        if (addUnreadItem(st.items, preview)) changed = true;
        return;
      }
      if (!sameMessage(st.last, preview)) {
        pending.push({ st, preview, bold, stamp: parts.stamp, movedUp, atTop });
        textCount[preview] = (textCount[preview] || 0) + 1;
        return;
      }
      // A tartalom változatlan. Ha korábban félkövér volt, most pedig már nem,
      // akkor időközben elolvastam.
      if (st.bold && !bold && st.items.length) {
        st.items = [];
        changed = true;
      }
      st.bold = bold;
    });
    pending.forEach((ch) => {
      const st = ch.st;
      // Egyszerre több beszélgetésben felbukkanó, azonos szöveg = rendszerszöveg.
      if (textCount[ch.preview] >= 3) return;
      // Reakció: soha nem kap jelvényt, csak az alapállapotot frissítjük.
      if (isReactionPreview(ch.preview)) {
        rememberReaction(st, ch.preview);
        setLast(st, ch.preview);
        st.bold = ch.bold;
        return;
      }
      // Egy ebben a sorban korábban MÁR LÁTOTT előnézet nem új üzenet – pl. a
      // reakció után visszaváltó régi üzenetszöveg.
      if (seenBefore(st, ch.preview)) {
        st.last = ch.preview;
        st.bold = ch.bold;
        return;
      }
      if (isOwnOutgoing(ch.preview)) {
        setLast(st, ch.preview);
        st.bold = ch.bold;
        if (st.items.length) {
          st.items = [];
          changed = true;
        }
        return;
      }
      const confirmed =
        ch.bold || isFreshStamp(ch.stamp) || ch.movedUp || (ch.atTop && !isOldStamp(ch.stamp));
      if (!confirmed) return;
      setLast(st, ch.preview);
      st.bold = ch.bold;
      if (addUnreadItem(st.items, ch.preview)) changed = true;
    });
    if (changed) saveUnread();
  }
  /* --- 4b) csak reakciós sorok: olvasottként jelenjenek meg --- */
  // Ha a sor legutolsó tétele csak egy reakció ("Reagált az üzenetedre: ❤️"),
  // a Messenger akkor is olvasatlannak jelöli (félkövér szöveg + kék pötty).
  // Ezeket a sorokat úgy jelenítjük meg, mint egy elolvasott chatet: normál
  // betűvastagság, halvány előnézet, kék pötty nélkül. Csak osztályokat
  // teszünk a meglévő elemekre – a sor szerkezetéhez nem nyúlunk, és a
  // pötty helye is megmarad (visibility:hidden), így semmi sem ugrik arrébb.
  function unreadDotOf(link) {
    const els = link.querySelectorAll('span,div');
    for (let i = 0; i < els.length; i++) {
      const e = els[i];
      if (e.children.length) continue;
      const r = e.getBoundingClientRect();
      if (r.width < 6 || r.width > 18 || r.height < 6 || r.height > 18) continue;
      if (Math.abs(r.width - r.height) > 2) continue;
      const cs = getComputedStyle(e);
      const bg = cs.backgroundColor;
      if (!bg || bg === 'transparent' || /rgba\([^)]*,\s*0\)$/.test(bg)) continue;
      if (parseFloat(cs.borderRadius) < r.width / 3) continue;
      return e;
    }
    return null;
  }
  function clearReactionRead(link) {
    link.classList.remove('fbm-react-read');
    link.querySelectorAll('.fbm-react-name, .fbm-react-dot').forEach((el) =>
      el.classList.remove('fbm-react-name', 'fbm-react-dot')
    );
  }
  function markReactionRowsRead(scope) {
    scope.querySelectorAll('a[role="link"]').forEach((link) => {
      const preview = previewOf(link);
      const want = !!preview && isReactionPreview(preview) && isUnreadRow(link);
      if (!want) {
        if (link.classList.contains('fbm-react-read')) clearReactionRead(link);
        return;
      }
      if (!link.classList.contains('fbm-react-read')) link.classList.add('fbm-react-read');
      // a név (az első legbelső span) maradjon a megszokott, olvasott stílusú
      const leaves = Array.from(link.querySelectorAll('span')).filter(
        (s) => !s.querySelector('span') && (s.textContent || '').trim()
      );
      if (leaves[0] && !leaves[0].classList.contains('fbm-react-name')) {
        leaves[0].classList.add('fbm-react-name');
      }
      const dot = unreadDotOf(link);
      if (dot && !dot.classList.contains('fbm-react-dot')) dot.classList.add('fbm-react-dot');
      // a script saját nyilvántartásában sem olvasatlan
      const id = chatIdOf(link);
      if (id) {
        const st = threadState(id);
        if (st.items.length) {
          st.items = [];
          saveUnread();
        }
      }
    });
    // a listán kívülre került (pl. újrarajzolt) jelöléseket is visszavesszük
    document.querySelectorAll('a.fbm-react-read').forEach((link) => {
      if (!scope.contains(link)) clearReactionRead(link);
    });
  }
  function clearUnreadFor(link) {
    const id = chatIdOf(link);
    if (!id) return;
    const st = threadState(id);
    st.items = [];
    st.bold = false;
    const seen = previewOf(link);
    if (seen) {
      setLast(st, seen);
      if (isReactionPreview(seen)) rememberReaction(st, seen);
    }
    saveUnreadNow();
    const grid = mainThreadGrid();
    if (grid) renderBadges(grid);
  }
  // Az avatar(ok) teljes, kör alakú "ikon-dobozát" adja vissza (csoportos
  // chatnél a két egymást takaró kép közös doboza).
  function avatarBoxFor(link) {
    const imgs = Array.from(link.querySelectorAll('img')).filter(
      (im) => im.getBoundingClientRect().width > 10
    );
    if (!imgs.length) return null;
    if (imgs.length === 1) return imgs[0].getBoundingClientRect();
    const containsAllImgs = (container) => imgs.every((im) => container.contains(im));
    let node = imgs[0];
    let guard = 0;
    while (node && guard < 20 && !containsAllImgs(node)) {
      node = node.parentElement;
      guard++;
    }
    const box = node ? node.getBoundingClientRect() : imgs[0].getBoundingClientRect();
    const single = imgs[0].getBoundingClientRect();
    if (box.width > Math.max(80, single.width * 2)) return single;
    return box;
  }
  // A jelvények egy külön, a <body> végére akasztott saját rétegben élnek – a
  // Facebook DOM-jához hozzá sem nyúlunk.
  function getBadgeLayer() {
    let layer = document.getElementById('fbm-badge-layer');
    if (layer && layer.isConnected) return layer;
    layer = document.createElement('div');
    layer.id = 'fbm-badge-layer';
    layer.style.cssText =
      'position:fixed;left:0;top:0;width:0;height:0;margin:0;padding:0;border:0;' +
      'z-index:2147482000;pointer-events:none;';
    document.body.appendChild(layer);
    return layer;
  }
  // Takarja-e valami az oldalsávot (pl. a kép-/videónéző)?
  function overlayObstructed(sb) {
    if (!sb) return true;
    const r = sb.getBoundingClientRect();
    if (!r.width || !r.height) return true;
    const layer = document.getElementById('fbm-badge-layer');
    const x = Math.round(r.left + r.width / 2);
    const y = Math.round(r.top + Math.min(r.height / 2, 220));
    const el = document.elementFromPoint(x, y);
    if (!el) return true;
    if (layer && layer.contains(el)) return false;
    return !sb.contains(el);
  }
  function setOverlayVisible(visible) {
    if (!visible) {
      hideTip();
      setToggleHover(false);
    }
    const layer = document.getElementById('fbm-badge-layer');
    if (!layer) return;
    const want = visible ? '' : 'none';
    if (layer.style.display !== want) layer.style.display = want;
  }
  function hideMessengerUi() {
    if (toggleBtnEl && toggleBtnEl.style.display !== 'none') toggleBtnEl.style.display = 'none';
    if (profileBtnEl && profileBtnEl.style.display !== 'none') profileBtnEl.style.display = 'none';
    setToggleHover(false);
    hideTip();
    clearMediaUi();
    clearBadges();
  }
  const badgeEls = new Map();
  function clearBadges() {
    if (!badgeEls.size) return;
    badgeEls.forEach((el) => {
      if (el.parentElement) el.remove();
    });
    badgeEls.clear();
  }
  function renderBadges(scope) {
    const collapsed = isCollapsed();
    const layer = getBadgeLayer();
    const gr = scope.getBoundingClientRect();
    const sr = sidebarEl && sidebarEl.isConnected ? sidebarEl.getBoundingClientRect() : null;
    const clipTop = sr ? Math.max(gr.top, sr.top + (collapsed ? TOP_BAND : 0)) : gr.top;
    const clipBottom = sr ? Math.min(gr.bottom, sr.bottom) : gr.bottom;
    // 1) OLVASÁS
    const want = [];
    scope.querySelectorAll('[role="row"]').forEach((row) => {
      const link = row.querySelector('a[role="link"]');
      const id = link ? chatIdOf(link) : null;
      if (!id) return;
      const st = unread.threads[id];
      const n = collapsed && st && Array.isArray(st.items) ? st.items.length : 0;
      if (!n) return;
      const ir = avatarBoxFor(link);
      if (!ir || !ir.width) return;
      if (ir.top < clipTop - 1 || ir.bottom > clipBottom + 1) return;
      if (ir.bottom < 0 || ir.top > window.innerHeight) return;
      want.push({ id: id, n: n, ir: ir });
    });
    // 2) ÍRÁS
    const alive = new Set();
    want.forEach((w) => {
      let badge = badgeEls.get(w.id);
      if (!badge || !badge.isConnected) {
        badge = document.createElement('div');
        badge.className = 'fbm-badge';
        layer.appendChild(badge);
        badgeEls.set(w.id, badge);
      }
      alive.add(w.id);
      const label = w.n > 99 ? '99+' : String(w.n);
      if (badge.textContent !== label) badge.textContent = label;
      const bw = Math.max(18, label.length * 7 + 10);
      const bh = 18;
      const rad = w.ir.width / 2;
      const left = Math.round(w.ir.left + rad + rad * 0.72 - bw / 2) + 'px';
      const top = Math.round(w.ir.top + rad - rad * 0.72 - bh / 2) + 'px';
      if (badge.style.left !== left) badge.style.left = left;
      if (badge.style.top !== top) badge.style.top = top;
    });
    // 3) a már nem aktuális jelvények eltávolítása
    badgeEls.forEach((el, id) => {
      if (alive.has(id)) return;
      if (el.parentElement) el.remove();
      badgeEls.delete(id);
    });
  }
  /* --- a jelvények görgetés közben is a profilképen maradnak --- */
  let badgeFrame = 0;
  function syncBadgesSoon() {
    if (badgeFrame) return;
    badgeFrame = requestAnimationFrame(() => {
      badgeFrame = 0;
      try {
        if (scriptDisabled() || !onMessengerPage()) return;
        const grid = mainThreadGrid();
        if (grid) renderBadges(grid);
        else clearBadges();
      } catch (e) {}
    });
  }
  window.addEventListener('scroll', syncBadgesSoon, true);
  window.addEventListener('wheel', syncBadgesSoon, { passive: true, capture: true });
  window.addEventListener('touchmove', syncBadgesSoon, { passive: true, capture: true });
  /* ---------- 5) "profil" gomb a chat fejlécében ---------- */
  const ICON_PROFILE =
    '<svg width="20" height="20" viewBox="0 0 16 16" fill="currentColor" style="pointer-events:none">' +
    '<path d="M8 4a2.5 2.5 0 1 0 0 5 2.5 2.5 0 0 0 0-5z"></path>' +
    '<path d="M8 .5a7.5 7.5 0 1 0 0 15 7.5 7.5 0 0 0 0-15zM2 8a6 6 0 1 1 10.429 4.048A3.52 3.52 0 0 0 9.23 10H6.77a3.52 3.52 0 0 0-3.198 2.048A5.978 5.978 0 0 1 2 8z"></path></svg>';
  function headerTitleLink(main) {
    const mr = main.getBoundingClientRect();
    const cands = Array.from(main.querySelectorAll('a[href]'));
    for (let i = 0; i < cands.length; i++) {
      const x = cands[i];
      if (x.id === 'fbm-profile-btn') continue;
      const h = x.getAttribute('href') || '';
      if (!h || h.includes('/messages/')) continue;
      if (/^\/(friends|groups|marketplace|watch|events|gaming|notifications|bookmarks|settings|reel|stories|pages|photo|video)\/?$/i.test(h))
        continue;
      const r = x.getBoundingClientRect();
      if (r.width <= 0 || r.height <= 0) continue;
      if (r.top < mr.top - 4 || r.top > mr.top + 110) continue;
      if (/^\/[^/?#]+\/?$/.test(h) || h.includes('profile.php') || /facebook\.com\/[^/?#]+\/?$/.test(h)) {
        return x;
      }
    }
    return null;
  }
  function headerIconsIn(el) {
    return Array.from(el.querySelectorAll('[role="button"]')).filter((b) => {
      if (b.id === 'fbm-profile-btn') return false;
      const r = b.getBoundingClientRect();
      return r.width >= 28 && r.width <= 52 && r.height >= 28 && r.height <= 52;
    });
  }
  function chatHeaderEl(main, title) {
    let n = title;
    for (let i = 0; i < 10 && n && n !== main; i++) {
      n = n.parentElement;
      if (!n || n === main) break;
      const r = n.getBoundingClientRect();
      if (r.height > 140) break;
      if (headerIconsIn(n).length) return n;
    }
    return null;
  }
  function headerIconRow(header) {
    const cands = headerIconsIn(header);
    if (!cands.length) return null;
    let minTop = Infinity;
    cands.forEach((b) => {
      const t = b.getBoundingClientRect().top;
      if (t < minTop) minTop = t;
    });
    const row = cands.filter((b) => Math.abs(b.getBoundingClientRect().top - minTop) <= 8);
    if (!row.length) return null;
    row.sort((a, b) => a.getBoundingClientRect().left - b.getBoundingClientRect().left);
    return row;
  }
  let profileBtnEl = null;
  let headerCache = { id: null, href: null, el: null };
  function getProfileButton() {
    if (profileBtnEl && profileBtnEl.isConnected) return profileBtnEl;
    const a = document.createElement('a');
    a.id = 'fbm-profile-btn';
    a.setAttribute('role', 'button');
    a.setAttribute('target', '_blank');
    a.setAttribute('rel', 'noopener noreferrer');
    a.title = 'Facebook-profil megnyitása új lapon';
    a.style.cssText =
      'position:fixed;display:flex;align-items:center;justify-content:center;' +
      'width:36px;height:36px;border-radius:50%;cursor:pointer;color:inherit;' +
      'text-decoration:none;pointer-events:auto;';
    a.innerHTML = ICON_PROFILE;
    a.addEventListener('click', (ev) => ev.stopPropagation(), true);
    getBadgeLayer().appendChild(a);
    profileBtnEl = a;
    return a;
  }
  function hideProfileButton() {
    if (profileBtnEl && profileBtnEl.isConnected && profileBtnEl.style.display !== 'none') {
      profileBtnEl.style.display = 'none';
    }
  }
  function ensureProfileButton() {
    if (mediaFullActive) {
      hideProfileButton();
      return;
    }
    const main = getMainArea(getSidebar());
    if (!main) return;
    const id = openThreadId();
    const title = headerTitleLink(main);
    let header = title ? chatHeaderEl(main, title) : null;
    let href = title ? title.href : null;
    if ((!header || !href) && headerCache.id === id) {
      if (!header && headerCache.el && headerCache.el.isConnected) header = headerCache.el;
      if (!href) href = headerCache.href;
    }
    const row = header ? headerIconRow(header) : null;
    if (!row || !href) {
      hideProfileButton();
      return;
    }
    headerCache = { id: id, href: href, el: header };
    const btn = getProfileButton();
    if (btn.getAttribute('href') !== href) btn.setAttribute('href', href);
    const first = row[0].getBoundingClientRect();
    if (!first.width) return;
    btn.style.display = 'flex';
    btn.style.left = Math.round(first.left - 42) + 'px';
    btn.style.top = Math.round(first.top + first.height / 2 - 18) + 'px';
  }
  /* ---------- 6) szélesebb üzenetbuborékok ---------- */
  function updateBubbleWidthVar() {
    const main = getMainArea(getSidebar());
    if (!main) return;
    const w = main.getBoundingClientRect().width;
    if (w < 200) return;
    const target = Math.max(240, Math.round(w * BUBBLE_RATIO) - BUBBLE_PADDING);
    const cur = document.documentElement.style.getPropertyValue('--fbm-bubble-max');
    if (cur !== target + 'px') {
      document.documentElement.style.setProperty('--fbm-bubble-max', target + 'px');
    }
    try {
      if (localStorage.getItem(LS_BUBBLE_MAX) !== String(target)) {
        localStorage.setItem(LS_BUBBLE_MAX, String(target));
      }
    } catch (e) {}
  }
  function applyStoredWidth() {
    try {
      const w = parseInt(localStorage.getItem(LS_BUBBLE_MAX), 10);
      if (w > 200) document.documentElement.style.setProperty('--fbm-bubble-max', w + 'px');
    } catch (e) {}
  }
  /* ---------- 7) mikrofon és matrica gombok elrejtése a beviteli mező mellett ---------- */
  const HIDDEN_INPUT_BTN_RE = /hangfájl|hangüzenet|hangot\s*küld|matrica|voice\s*(message|clip)|sticker/i;
  function findComposerRegion() {
    const editable = document.querySelector('[contenteditable="true"][role="textbox"]');
    if (!editable) return null;
    return editable.closest('[role="region"]') || editable.closest('form') || document;
  }
  function findIconWrapper(el) {
    let wrap = el;
    let parent = wrap.parentElement;
    let steps = 0;
    while (parent && steps < 8) {
      if (parent.children.length >= 3) {
        const w = wrap.getBoundingClientRect().width;
        if (w > 0 && w < 60 && wrap.children.length <= 2) return wrap;
      }
      wrap = parent;
      parent = parent.parentElement;
      steps++;
    }
    return null;
  }
  function hideInputSideButtons() {
    const scope = findComposerRegion();
    if (!scope) return;
    scope.querySelectorAll('[aria-label]').forEach((el) => {
      const label = el.getAttribute('aria-label') || '';
      if (!HIDDEN_INPUT_BTN_RE.test(label)) return;
      const wrap = findIconWrapper(el);
      if (!wrap) return;
      const wr = wrap.getBoundingClientRect();
      if (wr.width <= 0 || wr.width > 60 || wr.height <= 0 || wr.height > 60) return;
      if (wrap.children.length > 2) return;
      if (!wrap.classList.contains('fbm-hide-input-btn')) {
        wrap.classList.add('fbm-hide-input-btn');
      }
    });
    tightenComposerIcons(scope);
  }
  /* ---------- 8) a "Fájl csatolása" és GIF gombok körüli hely csökkentése ---------- */
  const FILE_ATTACH_LABEL_RE = /fájlt csatolhatsz|attach a file|attach file/i;
  function tightenComposerIcons(scope) {
    const hiddenWrap = scope.querySelector('.fbm-hide-input-btn');
    const row = hiddenWrap && hiddenWrap.parentElement;
    if (
      row &&
      !row.classList.contains('fbm-hide-input-btn') &&
      row.children.length >= 2 &&
      row.children.length <= 6 &&
      !row.classList.contains('fbm-icon-row-tight')
    ) {
      row.classList.add('fbm-icon-row-tight');
    }
    const fileBtn = Array.from(scope.querySelectorAll('[aria-label]')).find((el) =>
      FILE_ATTACH_LABEL_RE.test(el.getAttribute('aria-label') || '')
    );
    const svg = fileBtn && fileBtn.querySelector('svg');
    if (svg && !svg.classList.contains('fbm-file-icon-boost')) {
      svg.classList.add('fbm-file-icon-boost');
    }
    const fileCell = fileBtn && findIconWrapper(fileBtn);
    if (fileCell && !fileCell.classList.contains('fbm-file-cell-tight')) {
      fileCell.classList.add('fbm-file-cell-tight');
    }
  }
  /* ---------- 9) reels: teljes képernyős nagyítás ---------- */
  // A teljes képernyő gomb MINDEN esetben a videó jobb alsó sarkában ül
  // (nagyítva és nagyítás nélkül is). Saját hang gombot csak akkor teszünk ki,
  // ha a Facebook saját hangerő gombja NINCS ott a videó bal felső sarkában.
  const REEL_CHROME_MS = 2000;
  const REEL_BTN = 44;    // a gombok mérete (px)
  const REEL_INSET = 14;  // távolság a videó szélétől (px)
  const ICON_REEL_ZOOM =
    '<svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" style="pointer-events:none">' +
    '<path d="M4 9V4h5"></path><path d="M20 9V4h-5"></path><path d="M4 15v5h5"></path><path d="M20 15v5h-5"></path></svg>';
  const ICON_REEL_EXIT =
    '<svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" style="pointer-events:none">' +
    '<path d="M9 4v5H4"></path><path d="M15 4v5h5"></path><path d="M9 20v-5H4"></path><path d="M15 20v-5h5"></path></svg>';
  const ICON_SOUND_ON =
    '<svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" style="pointer-events:none">' +
    '<path d="M4 9v6h4l5 4V5L8 9H4z"></path><path d="M16.5 8.8a4.5 4.5 0 0 1 0 6.4"></path>' +
    '<path d="M19.5 6a8.5 8.5 0 0 1 0 12"></path></svg>';
  const ICON_SOUND_OFF =
    '<svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" style="pointer-events:none">' +
    '<path d="M4 9v6h4l5 4V5L8 9H4z"></path><line x1="16.5" y1="9" x2="21.5" y2="15"></line>' +
    '<line x1="21.5" y1="9" x2="16.5" y2="15"></line></svg>';
  let reelZoom = false;
  let reelBtnEl = null;
  let reelMuteBtnEl = null;
  let reelMediaEl = null;
  let reelChromeTimer = null;
  const reelHidden = new Set();
  const reelShown = new Set();
  const reelPass = new Set();
  function visibleReelVideo() {
    const vids = document.querySelectorAll('video');
    for (let i = 0; i < vids.length; i++) {
      const r = vids[i].getBoundingClientRect();
      if (r.width > 100 && r.height > 100 && r.top > -50 && r.top < window.innerHeight - 50) return vids[i];
    }
    return null;
  }
  function reelMediaCard(v) {
    let n = v ? v.parentElement : null;
    for (let i = 0; i < 12 && n; i++) {
      const cs = getComputedStyle(n);
      if (cs.overflowX === 'hidden' && cs.overflowY === 'hidden') return n;
      n = n.parentElement;
    }
    return null;
  }
  // A nagyítás mértéke és eltolása (a transzformáció nélküli alapállapotból
  // mérve, a VIDEÓ dobozára illesztve, torzítás nélkül).
  function placeReelMedia(card, v) {
    if (!card || !v) return;
    const on = card.classList.contains('fbm-reel-media');
    if (on) card.classList.add('fbm-reel-measure');
    const cb = card.getBoundingClientRect();
    const vb = v.getBoundingClientRect();
    if (on) card.classList.remove('fbm-reel-measure');
    if (vb.width < 50 || vb.height < 50) return;
    const vp = window.visualViewport;
    const vw = vp ? vp.width : window.innerWidth;
    const vh = vp ? vp.height : window.innerHeight;
    const ox = vp ? vp.offsetLeft : 0;
    const oy = vp ? vp.offsetTop : 0;
    const s = Math.min(vw / vb.width, vh / vb.height);
    const tx = ox + (vw - vb.width * s) / 2 - cb.left - (vb.left - cb.left) * s;
    const ty = oy + (vh - vb.height * s) / 2 - cb.top - (vb.top - cb.top) * s;
    const rs = document.documentElement.style;
    rs.setProperty('--fbm-reel-s', String(s));
    rs.setProperty('--fbm-reel-x', tx + 'px');
    rs.setProperty('--fbm-reel-y', ty + 'px');
  }
  // A videótól a gyökérig minden szinten a TESTVÉREKET halványítjuk el.
  function markReelHidden(v) {
    const path = new Set();
    let n = v;
    while (n && n !== document.documentElement) {
      path.add(n);
      n = n.parentElement;
    }
    reelHidden.forEach((el) => {
      if (!el.isConnected || path.has(el)) {
        el.classList.remove('fbm-reel-hide');
        reelHidden.delete(el);
      }
    });
    n = v;
    let guard = 0;
    while (n && n.parentElement && n !== document.body && guard < 40) {
      const kids = n.parentElement.children;
      for (let i = 0; i < kids.length; i++) {
        const sib = kids[i];
        if (sib === n || path.has(sib)) continue;
        const tag = sib.tagName;
        if (tag === 'SCRIPT' || tag === 'STYLE' || tag === 'LINK') continue;
        if (reelHidden.has(sib)) continue;
        sib.classList.add('fbm-reel-hide');
        reelHidden.add(sib);
      }
      n = n.parentElement;
      guard++;
    }
  }
  function clearReelHidden() {
    reelHidden.forEach((el) => el.classList.remove('fbm-reel-hide'));
    reelHidden.clear();
    document.querySelectorAll('.fbm-reel-hide').forEach((el) => el.classList.remove('fbm-reel-hide'));
  }
  // A lejátszó saját, átlátszóra állított gombcsoportjai (némítás, keresés,
  // lapozók) – nagyított módban mi mutatjuk meg őket.
  function markReelShow(card) {
    if (!card) return;
    const ctrls = card.querySelectorAll('[role="button"],[role="slider"]');
    for (let i = 0; i < ctrls.length; i++) {
      let n = ctrls[i];
      let done = false;
      for (let d = 0; d < 8 && n && n !== card; d++) {
        if (n.classList.contains('fbm-reel-show')) {
          done = true;
          break;
        }
        n = n.parentElement;
      }
      if (done) continue;
      n = ctrls[i];
      for (let d = 0; d < 8 && n && n !== card; d++) {
        if (n.classList.contains('fbm-reel-hide')) break;
        if (parseFloat(getComputedStyle(n).opacity) < 0.02) {
          n.classList.add('fbm-reel-show');
          reelShown.add(n);
          break;
        }
        n = n.parentElement;
      }
    }
  }
  function clearReelShown() {
    reelShown.forEach((el) => el.classList.remove('fbm-reel-show'));
    reelShown.clear();
    document.querySelectorAll('.fbm-reel-show').forEach((el) => el.classList.remove('fbm-reel-show'));
  }
  function clearReelPass() {
    reelPass.forEach((el) => el.classList.remove('fbm-reel-pass'));
    reelPass.clear();
  }
  /* --- hang: alapértelmezetten szóljon --- */
  const REEL_UNMUTE_RE = /^\s*(némítás kikapcsolása|hang bekapcsolása|unmute)\s*$/i;
  const REEL_MUTE_RE = /^\s*(némítás|mute)\s*$/i;
  let reelUserMuted = false;
  const reelUnmuteTried = new WeakSet();
  function reelUnmuteButton(card) {
    const cands = document.querySelectorAll('[role="button"][aria-label]');
    for (let i = 0; i < cands.length; i++) {
      const b = cands[i];
      if (!REEL_UNMUTE_RE.test(b.getAttribute('aria-label') || '')) continue;
      if (card && !card.contains(b)) continue;
      const r = b.getBoundingClientRect();
      if (r.width < 24 || r.width > 60 || r.height < 24 || r.height > 60) continue;
      return b;
    }
    return null;
  }
  // A Facebook némítás gombja BÁRMELYIK állapotban. Nagyítva a gomb a
  // kártyával együtt nő, ezért a méretkorlát ilyenkor a nagyítással arányos.
  function reelMuteButton(card) {
    const s = reelZoom ? parseFloat(document.documentElement.style.getPropertyValue('--fbm-reel-s')) || 1 : 1;
    const cands = document.querySelectorAll('[role="button"][aria-label]');
    for (let i = 0; i < cands.length; i++) {
      const b = cands[i];
      const l = b.getAttribute('aria-label') || '';
      if (!REEL_UNMUTE_RE.test(l) && !REEL_MUTE_RE.test(l)) continue;
      if (card && !card.contains(b)) continue;
      const r = b.getBoundingClientRect();
      if (r.width < 24 || r.width > 60 * s || r.height < 24 || r.height > 60 * s) continue;
      return b;
    }
    return null;
  }
  // Ott van-e a Facebook saját hangerő gombja a videó BAL FELSŐ sarkában?
  function reelNativeMuteTopLeft(card, v) {
    const b = reelMuteButton(card);
    if (!b || !v) return null;
    const br = b.getBoundingClientRect();
    const vr = v.getBoundingClientRect();
    const cx = br.left + br.width / 2;
    const cy = br.top + br.height / 2;
    if (cx < vr.left || cx > vr.left + vr.width / 2) return null;
    if (cy < vr.top || cy > vr.top + vr.height / 2) return null;
    return b;
  }
  // Nagyítva a Facebook gombja fölé a viewer saját (elhalványított) fejléce
  // lóghat, ami elnyelné a kattintást. Ami KONKRÉTAN a gomb fölött van, azt
  // átlátszóvá tesszük a kattintásra (pointer-events:none) – mást nem.
  function reelUncoverButton(b, card) {
    const r = b.getBoundingClientRect();
    const x = Math.round(r.left + r.width / 2);
    const y = Math.round(r.top + r.height / 2);
    if (x < 0 || y < 0 || x >= window.innerWidth || y >= window.innerHeight) return;
    const els = document.elementsFromPoint(x, y);
    for (let i = 0; i < els.length; i++) {
      const el = els[i];
      if (el === b || b.contains(el) || card.contains(el)) break;
      if (el.closest && el.closest('#fbm-badge-layer')) continue;
      if (el === document.body || el === document.documentElement || el.contains(card)) continue;
      if (!reelPass.has(el)) {
        el.classList.add('fbm-reel-pass');
        reelPass.add(el);
      }
    }
  }
  function toggleReelMute() {
    const v = visibleReelVideo();
    const card = v && reelMediaCard(v);
    const b = reelMuteButton(card);
    if (!b) return;
    const wasMuted = reelIsMuted(card, v);
    reelUserMuted = !wasMuted;
    if (v) reelUnmuteTried.add(v);
    try {
      b.click();
    } catch (e) {}
    showReelChrome();
  }
  function reelIsMuted(card, v) {
    if (reelUnmuteButton(card)) return true;
    if (reelMuteButton(card)) return false;
    return !!(v && v.muted);
  }
  function reelAutoUnmute(v, card) {
    if (!v || reelUserMuted || reelUnmuteTried.has(v)) return;
    const b = reelUnmuteButton(card);
    if (!b) {
      if (!v.muted) reelUnmuteTried.add(v);
      return;
    }
    reelUnmuteTried.add(v);
    try {
      b.click();
    } catch (e) {}
  }
  document.addEventListener(
    'click',
    (ev) => {
      if (!ev.isTrusted || !onReelPage()) return;
      const t = ev.target;
      const b = t && t.closest ? t.closest('[role="button"][aria-label]') : null;
      if (!b) return;
      const l = b.getAttribute('aria-label') || '';
      if (REEL_UNMUTE_RE.test(l)) reelUserMuted = false;
      else if (REEL_MUTE_RE.test(l)) reelUserMuted = true;
    },
    true
  );
  /* --- a gombok helye: MINDIG a videó jobb alsó sarka --- */
  // A videó LÁTHATÓ doboza: a videó és a (vágó) kártya metszete, a képernyőhöz
  // szorítva. Nagyítva a transzformált (felnagyított) dobozt kapjuk vissza.
  function reelVisibleBox(card, v) {
    const vr = v.getBoundingClientRect();
    let l = vr.left;
    let t = vr.top;
    let r = vr.right;
    let b = vr.bottom;
    if (!reelZoom) {
      const cr = card.getBoundingClientRect();
      l = Math.max(l, cr.left);
      t = Math.max(t, cr.top);
      r = Math.min(r, cr.right);
      b = Math.min(b, cr.bottom);
    }
    l = Math.max(l, 0);
    t = Math.max(t, 0);
    r = Math.min(r, window.innerWidth);
    b = Math.min(b, window.innerHeight);
    if (r - l < REEL_BTN * 2 || b - t < REEL_BTN * 2) return null;
    return { left: l, top: t, right: r, bottom: b };
  }
  // Takarja-e felugró panel (pl. értesítések) a gombot? Ha igen, a gomb eltűnik
  // – vagyis a panel mögé kerül. Nagyítva nem vizsgáljuk: ott a Facebook többi
  // eleme szándékosan a videó fölött/mellett jelenik meg.
  function reelBtnCovered(x, y, card) {
    if (!card || reelZoom) return false;
    const pts = [[x + 22, y + 22], [x + 4, y + 4], [x + 40, y + 4], [x + 4, y + 40], [x + 40, y + 40]];
    for (let i = 0; i < pts.length; i++) {
      const px = Math.round(pts[i][0]);
      const py = Math.round(pts[i][1]);
      if (px < 0 || py < 0 || px >= window.innerWidth || py >= window.innerHeight) continue;
      const els = document.elementsFromPoint(px, py);
      for (let j = 0; j < els.length; j++) {
        const el = els[j];
        if (el.id === 'fbm-reel-btn' || el.id === 'fbm-badge-layer') continue;
        if (el.closest && el.closest('#fbm-badge-layer')) continue;
        if (el === document.body || el === document.documentElement) break;
        if (!card.contains(el) && !el.contains(card)) return true;
        break;
      }
    }
    return false;
  }
  function getReelButton() {
    if (reelBtnEl && reelBtnEl.isConnected) return reelBtnEl;
    const b = document.createElement('div');
    b.id = 'fbm-reel-btn';
    b.setAttribute('role', 'button');
    b.setAttribute('tabindex', '0');
    b.title = 'Teljes képernyő (kilépés: ESC)';
    b.style.cssText =
      'position:fixed;display:none;align-items:center;justify-content:center;' +
      'width:' + REEL_BTN + 'px;height:' + REEL_BTN + 'px;border-radius:50%;cursor:pointer;color:#fff;' +
      'background:rgba(0,0,0,0.45);pointer-events:auto;user-select:none;';
    b.innerHTML = ICON_REEL_ZOOM;
    b.addEventListener(
      'click',
      (ev) => {
        ev.preventDefault();
        ev.stopPropagation();
        toggleReelZoom();
      },
      true
    );
    b.addEventListener('keydown', (ev) => {
      if (ev.key !== 'Enter' && ev.key !== ' ') return;
      ev.preventDefault();
      toggleReelZoom();
    });
    getBadgeLayer().appendChild(b);
    reelBtnEl = b;
    return b;
  }
  function getReelMuteButton() {
    if (reelMuteBtnEl && reelMuteBtnEl.isConnected) return reelMuteBtnEl;
    const b = document.createElement('div');
    b.id = 'fbm-reel-mute';
    b.setAttribute('role', 'button');
    b.setAttribute('tabindex', '0');
    b.title = 'Hang be- és kikapcsolása';
    b.style.cssText =
      'position:fixed;display:none;align-items:center;justify-content:center;' +
      'width:' + REEL_BTN + 'px;height:' + REEL_BTN + 'px;border-radius:50%;cursor:pointer;color:#fff;' +
      'background:rgba(0,0,0,0.45);pointer-events:auto;user-select:none;';
    b.innerHTML = ICON_SOUND_ON;
    b.addEventListener(
      'click',
      (ev) => {
        ev.preventDefault();
        ev.stopPropagation();
        toggleReelMute();
      },
      true
    );
    b.addEventListener('keydown', (ev) => {
      if (ev.key !== 'Enter' && ev.key !== ' ') return;
      ev.preventDefault();
      toggleReelMute();
    });
    getBadgeLayer().appendChild(b);
    reelMuteBtnEl = b;
    return b;
  }
  function showReelChrome() {
    document.documentElement.classList.add('fbm-reel-chrome');
    clearTimeout(reelChromeTimer);
    reelChromeTimer = setTimeout(() => {
      document.documentElement.classList.remove('fbm-reel-chrome');
    }, REEL_CHROME_MS);
  }
  function enterReelZoom() {
    const v = visibleReelVideo();
    if (!v || !reelMediaCard(v)) return;
    reelZoom = true;
    document.documentElement.classList.add('fbm-reel-zoom');
    reelTick();
    showReelChrome();
    try {
      const pr = document.documentElement.requestFullscreen();
      if (pr && pr.catch) pr.catch(() => {});
    } catch (e) {}
  }
  function exitReelZoom() {
    if (!reelZoom) return;
    reelZoom = false;
    document.documentElement.classList.remove('fbm-reel-zoom', 'fbm-reel-chrome');
    document.querySelectorAll('.fbm-reel-media').forEach((el) => el.classList.remove('fbm-reel-media'));
    reelMediaEl = null;
    if (reelMuteBtnEl) reelMuteBtnEl.style.display = 'none';
    clearReelHidden();
    clearReelShown();
    clearReelPass();
    clearTimeout(reelChromeTimer);
    const rs = document.documentElement.style;
    rs.removeProperty('--fbm-reel-s');
    rs.removeProperty('--fbm-reel-x');
    rs.removeProperty('--fbm-reel-y');
    if (reelBtnEl) reelBtnEl.innerHTML = ICON_REEL_ZOOM;
    if (document.fullscreenElement) {
      try {
        const pr = document.exitFullscreen();
        if (pr && pr.catch) pr.catch(() => {});
      } catch (e) {}
    }
  }
  function toggleReelZoom() {
    if (reelZoom) exitReelZoom();
    else enterReelZoom();
  }
  function reelTick() {
    const v = visibleReelVideo();
    const card = v ? reelMediaCard(v) : null;
    const btn = getReelButton();
    const mbtn = getReelMuteButton();
    if (!card) {
      btn.style.display = 'none';
      mbtn.style.display = 'none';
      if (reelZoom) exitReelZoom();
      return;
    }
    if (reelZoom) {
      if (reelMediaEl && reelMediaEl !== card) {
        reelMediaEl.classList.remove('fbm-reel-media');
      }
      reelMediaEl = card;
      placeReelMedia(card, v); // előbb mérünk (nagyítás nélküli állapotban)...
      card.classList.add('fbm-reel-media'); // ...és csak utána nagyítunk
      markReelHidden(v);
      markReelShow(card);
      if (btn.innerHTML !== ICON_REEL_EXIT) btn.innerHTML = ICON_REEL_EXIT;
    } else if (btn.innerHTML !== ICON_REEL_ZOOM) {
      btn.innerHTML = ICON_REEL_ZOOM;
    }
    reelAutoUnmute(v, card);
    // Teljes képernyő gomb: a videó jobb alsó sarka.
    const box = reelVisibleBox(card, v);
    let bx = null;
    let by = null;
    if (box) {
      bx = Math.round(box.right - REEL_INSET - REEL_BTN);
      by = Math.round(box.bottom - REEL_INSET - REEL_BTN);
    }
    if (bx === null || reelBtnCovered(bx, by, card)) {
      btn.style.display = 'none';
    } else {
      btn.style.display = 'flex';
      btn.style.left = bx + 'px';
      btn.style.top = by + 'px';
    }
    // Saját hang gomb – csak nagyítva, és csak ha a Facebook saját hangerő
    // gombja NINCS ott a videó bal felső sarkában. Ha ott van, a sajátunk nem
    // kell, a Facebookét pedig kattinthatóvá tesszük.
    if (!reelZoom) {
      if (mbtn.style.display !== 'none') mbtn.style.display = 'none';
      return;
    }
    const native = reelNativeMuteTopLeft(card, v);
    if (native) {
      if (mbtn.style.display !== 'none') mbtn.style.display = 'none';
      reelUncoverButton(native, card);
      return;
    }
    const my = by !== null ? by - REEL_BTN - 12 : null;
    if (bx === null || my === null || my < 4 || reelBtnCovered(bx, my, card)) {
      mbtn.style.display = 'none';
    } else {
      mbtn.style.display = 'flex';
      mbtn.style.left = bx + 'px';
      mbtn.style.top = my + 'px';
    }
    const wantIcon = reelIsMuted(card, v) ? ICON_SOUND_OFF : ICON_SOUND_ON;
    if (mbtn.innerHTML !== wantIcon) mbtn.innerHTML = wantIcon;
  }
  document.addEventListener(
    'keydown',
    (ev) => {
      if (ev.key !== 'Escape' || !reelZoom) return;
      exitReelZoom();
    },
    true
  );
  // "f" billentyű: nagyítás be/ki.
  document.addEventListener(
    'keydown',
    (ev) => {
      if (ev.key !== 'f' && ev.key !== 'F') return;
      if (ev.ctrlKey || ev.metaKey || ev.altKey) return;
      if (!onReelPage()) return;
      const t = ev.target;
      if (t && (t.isContentEditable || /^(INPUT|TEXTAREA|SELECT)$/.test(t.tagName || ''))) return;
      ev.preventDefault();
      ev.stopPropagation();
      toggleReelZoom();
    },
    true
  );
  document.addEventListener('fullscreenchange', () => {
    if (!document.fullscreenElement) {
      if (reelZoom) exitReelZoom();
      return;
    }
    if (reelZoom) reelTick();
  });
  window.addEventListener('resize', () => {
    if (reelZoom) reelTick();
  });
  if (window.visualViewport) {
    window.visualViewport.addEventListener('resize', () => {
      if (reelZoom) reelTick();
    });
  }
  /* ---------- 10) "Médiatartalom, fájlok és hivatkozások" teljes szélességben ---------- */
  const LS_MEDIA_FULL = 'fbm_media_full';
  const LS_MEDIA_GEO = 'fbm_media_geo';
  const LS_MEDIA_TILE = 'fbm_media_tile';
  const MEDIA_BTN_GAP = 44;
  const MEDIA_LABEL_FULL = 'Megjelenítés jobb oldalon';
  const MEDIA_LABEL_SIDE = 'Megjelenítés teljes képernyőn';
  let mediaFullState = false;
  try {
    mediaFullState = localStorage.getItem(LS_MEDIA_FULL) === '1';
  } catch (e) {}
  let mediaFullActive = false;
  let mediaColEl = null;
  let mediaBtnEl = null;
  let mediaTagged = false;
  let mediaClassObserver = null;
  function isMediaFull() {
    return mediaFullState;
  }
  function setMediaFull(v) {
    mediaFullState = !!v;
    try {
      localStorage.setItem(LS_MEDIA_FULL, mediaFullState ? '1' : '0');
    } catch (e) {}
  }
  function setRootVar(name, value) {
    const rs = document.documentElement.style;
    if (rs.getPropertyValue(name) !== value) rs.setProperty(name, value);
  }
  function applyStoredMediaGeometry() {
    try {
      const raw = localStorage.getItem(LS_MEDIA_GEO);
      if (raw) {
        const g = JSON.parse(raw);
        if (g && g.w > 200) {
          setRootVar('--fbm-mf-l', g.l + 'px');
          setRootVar('--fbm-mf-t', g.t + 'px');
          setRootVar('--fbm-mf-w', g.w + 'px');
          setRootVar('--fbm-mf-h', g.h + 'px');
        }
      }
      const tile = parseInt(localStorage.getItem(LS_MEDIA_TILE), 10);
      if (tile > 60 && tile < 320) setRootVar('--fbm-tile', tile + 'px');
    } catch (e) {}
  }
  function mediaTablistUsable(t) {
    const r = t.getBoundingClientRect();
    if (r.width < 120 || r.height < 10) return false;
    if (t.querySelectorAll('[role="tab"]').length < 2) return false;
    if (!t.querySelector('[role="tab"][aria-selected="true"]')) return false;
    if (t.closest('[aria-hidden="true"]')) return false;
    if (typeof t.checkVisibility === 'function') {
      if (!t.checkVisibility({ checkOpacity: true, checkVisibilityCSS: true })) return false;
    }
    if (r.left < 0 || r.right > window.innerWidth + 1) return false;
    if (r.bottom < 0 || r.top > window.innerHeight) return false;
    const el = document.elementFromPoint(
      Math.round(r.left + r.width / 2),
      Math.round(r.top + r.height / 2)
    );
    if (!el || !t.contains(el)) return false;
    return true;
  }
  function findMediaTablist() {
    const sb = sidebarEl && sidebarEl.isConnected ? sidebarEl : findSidebar();
    const tls = document.querySelectorAll('[role="tablist"]');
    for (let i = 0; i < tls.length; i++) {
      const t = tls[i];
      if (sb && sb.contains(t)) continue;
      if (!mediaTablistUsable(t)) continue;
      return t;
    }
    return null;
  }
  function mediaColumnOf(tablist) {
    let node = tablist;
    for (let i = 0; i < 24 && node; i++) {
      if (node.classList && node.classList.contains('fbm-media-full')) return node;
      const p = node.parentElement;
      if (!p) return null;
      const ps = node.previousElementSibling;
      const r = node.getBoundingClientRect();
      if (
        p.children.length === 2 &&
        ps &&
        !ps.previousElementSibling &&
        getComputedStyle(p).display === 'flex' &&
        r.height > 300 &&
        ps.getBoundingClientRect().width >= r.width - 1
      ) {
        return node;
      }
      node = p;
    }
    return null;
  }
  function mediaHeadingOf(col) {
    const cr = col.getBoundingClientRect();
    const cands = col.querySelectorAll('h1,h2,h3,h4,[role="heading"]');
    for (let i = 0; i < cands.length; i++) {
      const r = cands[i].getBoundingClientRect();
      if (r.width > 40 && r.top < cr.top + 90) return cands[i];
    }
    return null;
  }
  function watchMediaClass(el) {
    if (mediaClassObserver) mediaClassObserver.disconnect();
    mediaClassObserver = new MutationObserver(() => {
      if (!el.isConnected || !mediaFullActive) return;
      if (!el.classList.contains('fbm-media-full')) el.classList.add('fbm-media-full');
    });
    mediaClassObserver.observe(el, { attributes: true, attributeFilter: ['class', 'style'] });
  }
  function atomicSelectorOf(el) {
    const parts = [];
    const cl = el.classList;
    for (let i = 0; i < cl.length && parts.length < 12; i++) {
      const c = cl[i];
      if (/^x[0-9a-z]+$/.test(c)) parts.push('.' + c);
    }
    return parts.length >= 3 ? parts.join('') : '';
  }
  function setMediaGridRule(sig) {
    let st = document.getElementById('fbm-media-dyn');
    const text = sig
      ? '.fbm-media-full ' +
        sig +
        ' > * { flex: 0 0 var(--fbm-tile, 130px) !important; max-width: var(--fbm-tile, 130px) !important; }'
      : '';
    if (!text) {
      if (st) st.textContent = '';
      return;
    }
    if (!st || !st.isConnected) {
      st = document.createElement('style');
      st.id = 'fbm-media-dyn';
      (document.head || document.documentElement).appendChild(st);
    }
    if (st.textContent !== text) st.textContent = text;
  }
  function tagMediaGrids(col, tablist, full) {
    const media = col.querySelectorAll('img,video');
    const conts = [];
    const items = [];
    const seen = new Set();
    for (let i = 0; i < media.length && conts.length < 30; i++) {
      const r = media[i].getBoundingClientRect();
      if (r.width < 50 || r.height < 50) continue;
      let item = media[i];
      let cont = null;
      for (let d = 0; d < 10 && item && item.parentElement; d++) {
        const p = item.parentElement;
        if (p === col) break;
        if (p.children.length >= 2 && getComputedStyle(p).flexWrap === 'wrap') {
          cont = p;
          break;
        }
        item = p;
      }
      if (!cont || seen.has(cont)) continue;
      seen.add(cont);
      if (!cont.classList.contains('fbm-media-grid')) {
        if (getComputedStyle(item).flexBasis.indexOf('%') < 0) continue;
      }
      conts.push(cont);
      items.push(item);
    }
    if (!conts.length) {
      setMediaGridRule('');
      document
        .querySelectorAll('.fbm-media-grid, .fbm-list-grid')
        .forEach((el) => el.classList.remove('fbm-media-grid', 'fbm-list-grid'));
      return;
    }
    let sig = atomicSelectorOf(conts[0]);
    if (sig) {
      const matched = Array.from(col.querySelectorAll(sig));
      const ok = matched.filter(
        (el) => el.children.length >= 1 && getComputedStyle(el).flexWrap === 'wrap'
      );
      if (!matched.length || ok.length !== matched.length) sig = '';
    }
    setMediaGridRule(sig);
    document.querySelectorAll('.fbm-media-grid, .fbm-list-grid').forEach((el) => {
      if (conts.indexOf(el) < 0) el.classList.remove('fbm-media-grid', 'fbm-list-grid');
    });
    conts.forEach((c) => {
      c.classList.remove('fbm-list-grid');
      c.classList.add('fbm-media-grid');
    });
    if (!full) {
      const w = Math.round(items[0].getBoundingClientRect().width);
      if (w > 60 && w < 320) {
        setRootVar('--fbm-tile', w + 'px');
        try {
          localStorage.setItem(LS_MEDIA_TILE, String(w));
        } catch (e) {}
      }
    }
  }
  function getMediaButton() {
    if (mediaBtnEl && mediaBtnEl.isConnected) return mediaBtnEl;
    const b = document.createElement('div');
    b.id = 'fbm-media-btn';
    b.setAttribute('role', 'button');
    b.setAttribute('tabindex', '0');
    b.addEventListener(
      'click',
      (ev) => {
        ev.preventDefault();
        ev.stopPropagation();
        toggleMediaFull();
      },
      true
    );
    b.addEventListener('keydown', (ev) => {
      if (ev.key !== 'Enter' && ev.key !== ' ') return;
      ev.preventDefault();
      toggleMediaFull();
    });
    getBadgeLayer().appendChild(b);
    mediaBtnEl = b;
    return b;
  }
  function placeMediaButton(col, tablist, full) {
    const btn = getMediaButton();
    if (lightboxEl) {
      btn.style.display = 'none';
      return;
    }
    const cr = col.getBoundingClientRect();
    const tr = tablist.getBoundingClientRect();
    if (!cr.width || !tr.width) {
      btn.style.display = 'none';
      return;
    }
    const label = full ? MEDIA_LABEL_FULL : MEDIA_LABEL_SIDE;
    if (btn.textContent !== label) btn.textContent = label;
    btn.title = full
      ? 'Vissza a keskeny, jobb oldali nézetre'
      : 'A panel kiszélesítése a chat lista széléig';
    const head = mediaHeadingOf(col);
    if (head) setRootVar('--fbm-mf-fg', getComputedStyle(head).color);
    btn.style.display = 'flex';
    if (full) {
      const hr = head ? head.getBoundingClientRect() : null;
      const cy = hr && hr.height ? hr.top + hr.height / 2 : cr.top + 28;
      btn.style.width = '';
      const bw = btn.offsetWidth || 190;
      btn.style.left = Math.round(cr.right - 24 - bw) + 'px';
      btn.style.top = Math.round(cy - 17) + 'px';
      return;
    }
    btn.style.left = Math.round(cr.left + 16) + 'px';
    btn.style.width = Math.round(Math.max(120, cr.width - 32)) + 'px';
    btn.style.top = Math.round(tr.top - MEDIA_BTN_GAP + 4) + 'px';
  }
  function toggleMediaFull() {
    setMediaFull(!isMediaFull());
    closeLightbox();
    mediaTick();
    setTimeout(mediaTick, 60);
    setTimeout(mediaTick, 300);
  }
  function clearMediaUi() {
    mediaFullActive = false;
    if (mediaBtnEl && mediaBtnEl.style.display !== 'none') mediaBtnEl.style.display = 'none';
    if (!mediaTagged && !mediaColEl) return;
    mediaTagged = false;
    setMediaGridRule('');
    if (mediaClassObserver) {
      mediaClassObserver.disconnect();
      mediaClassObserver = null;
    }
    mediaColEl = null;
    document
      .querySelectorAll('.fbm-media-full, .fbm-media-under, .fbm-media-frozen, .fbm-media-gap, .fbm-media-grid, .fbm-list-grid')
      .forEach((el) =>
        el.classList.remove(
          'fbm-media-full',
          'fbm-media-under',
          'fbm-media-frozen',
          'fbm-media-gap',
          'fbm-media-grid',
          'fbm-list-grid'
        )
      );
  }
  function mediaTick() {
    if (!onMessengerPage()) return;
    const tablist = findMediaTablist();
    if (!tablist) {
      clearMediaUi();
      return;
    }
    const col = mediaColumnOf(tablist);
    if (!col || !col.parentElement) {
      clearMediaUi();
      return;
    }
    {
      const cr0 = col.getBoundingClientRect();
      const tr0 = tablist.getBoundingClientRect();
      if (
        tr0.left < cr0.left - 2 ||
        tr0.right > cr0.right + 2 ||
        tr0.top < cr0.top - 2 ||
        tr0.bottom > cr0.bottom + 2
      ) {
        clearMediaUi();
        return;
      }
    }
    if (col !== mediaColEl) {
      mediaColEl = col;
      watchMediaClass(col);
    }
    const row = col.parentElement;
    const under = col.previousElementSibling;
    const want = isMediaFull() && !!under;
    const wasFull = col.classList.contains('fbm-media-full');
    if (want && !wasFull) {
      const uw = Math.round(under.getBoundingClientRect().width);
      if (uw > 150) setRootVar('--fbm-mf-uw', uw + 'px');
    }
    tagMediaGrids(col, tablist, want && wasFull);
    if (want) {
      const rr = row.getBoundingClientRect();
      if (rr.width > 200 && rr.height > 100) {
        const g = {
          l: Math.round(rr.left),
          t: Math.round(rr.top),
          w: Math.round(rr.width),
          h: Math.round(rr.height),
        };
        setRootVar('--fbm-mf-l', g.l + 'px');
        setRootVar('--fbm-mf-t', g.t + 'px');
        setRootVar('--fbm-mf-w', g.w + 'px');
        setRootVar('--fbm-mf-h', g.h + 'px');
        try {
          localStorage.setItem(LS_MEDIA_GEO, JSON.stringify(g));
        } catch (e) {}
      }
      Array.from(row.children).forEach((ch) => {
        if (ch === col) return;
        ch.classList.add('fbm-media-under');
      });
      under.classList.add('fbm-media-frozen');
      col.classList.add('fbm-media-full');
      tablist.classList.remove('fbm-media-gap');
      mediaFullActive = true;
      mediaTagged = true;
    } else {
      col.classList.remove('fbm-media-full');
      Array.from(row.children).forEach((ch) =>
        ch.classList.remove('fbm-media-under', 'fbm-media-frozen')
      );
      tablist.classList.add('fbm-media-gap');
      mediaFullActive = false;
      mediaTagged = true;
    }
    placeMediaButton(col, tablist, mediaFullActive);
  }
  /* --- 10b) saját médianézegető (lightbox) --- */
  let lightboxEl = null;
  function closeLightbox() {
    if (!lightboxEl) return;
    const v = lightboxEl.querySelector('video');
    if (v) {
      try {
        v.pause();
      } catch (e) {}
    }
    lightboxEl.remove();
    lightboxEl = null;
  }
  function lightboxFallback(poster, href) {
    const w = document.createElement('div');
    w.className = 'fbm-lb-fallback';
    if (poster) {
      const im = document.createElement('img');
      im.src = poster;
      w.appendChild(im);
    }
    const a = document.createElement('a');
    a.className = 'fbm-lb-open';
    a.href = href;
    a.target = '_blank';
    a.rel = 'noopener noreferrer';
    a.textContent = 'Megnyitás új lapon';
    a.addEventListener('click', (ev) => ev.stopPropagation(), true);
    w.appendChild(a);
    return w;
  }
  function openLightbox(link) {
    closeLightbox();
    const thumb = link.querySelector('img');
    const poster = thumb ? thumb.currentSrc || thumb.src || '' : '';
    const href = link.href;
    const isVideo = /(^|[^\d])\d{1,2}:\d{2}([^\d]|$)/.test(link.textContent || '');
    const box = document.createElement('div');
    box.id = 'fbm-lightbox';
    const close = document.createElement('div');
    close.className = 'fbm-lb-close';
    close.setAttribute('role', 'button');
    close.setAttribute('tabindex', '0');
    close.title = 'Bezárás (ESC)';
    close.textContent = '✕';
    close.addEventListener(
      'click',
      (ev) => {
        ev.preventDefault();
        ev.stopPropagation();
        closeLightbox();
      },
      true
    );
    box.appendChild(close);
    const stage = document.createElement('div');
    stage.className = 'fbm-lb-stage';
    box.appendChild(stage);
    box.addEventListener(
      'click',
      (ev) => {
        if (ev.target !== box && ev.target !== stage) return;
        ev.preventDefault();
        ev.stopPropagation();
        closeLightbox();
      },
      true
    );
    if (isVideo) {
      const v = document.createElement('video');
      v.controls = true;
      v.autoplay = true;
      v.playsInline = true;
      if (poster) v.poster = poster;
      v.src = href;
      v.addEventListener('error', () => {
        if (!stage.isConnected) return;
        stage.textContent = '';
        stage.appendChild(lightboxFallback(poster, href));
      });
      stage.appendChild(v);
    } else {
      const im = document.createElement('img');
      im.src = poster || href;
      stage.appendChild(im);
      if (href) {
        const probe = new Image();
        probe.onload = () => {
          if (im.isConnected) im.src = href;
        };
        probe.src = href;
      }
    }
    document.body.appendChild(box);
    lightboxEl = box;
    if (mediaBtnEl) mediaBtnEl.style.display = 'none';
  }
  document.addEventListener(
    'click',
    (ev) => {
      if (!mediaFullActive || !mediaColEl || !mediaColEl.isConnected) return;
      const t = ev.target;
      const a = t && t.closest ? t.closest('a[href]') : null;
      if (!a || !mediaColEl.contains(a)) return;
      if (!/\/messenger_media\//.test(a.getAttribute('href') || '')) return;
      const im = a.querySelector('img');
      if (!im || im.getBoundingClientRect().width < 40) return;
      ev.preventDefault();
      ev.stopPropagation();
      if (ev.stopImmediatePropagation) ev.stopImmediatePropagation();
      openLightbox(a);
    },
    true
  );
  document.addEventListener(
    'keydown',
    (ev) => {
      if (ev.key !== 'Escape' || !lightboxEl) return;
      ev.preventDefault();
      ev.stopPropagation();
      if (ev.stopImmediatePropagation) ev.stopImmediatePropagation();
      closeLightbox();
    },
    true
  );
  /* ---------- 11) stílusok ---------- */
  function injectStyle() {
    const existing = document.getElementById('fbm-style');
    if (existing && existing.isConnected) return;
    const st = document.createElement('style');
    st.id = 'fbm-style';
    st.textContent = `
      :root, [role="main"] { --chat-bubble-max-width: var(--fbm-bubble-max, 564px) !important; }
      .fbm-sidebar.fbm-collapsed {
        width: ${COLLAPSED_WIDTH}px !important;
        min-width: ${COLLAPSED_WIDTH}px !important;
        max-width: ${COLLAPSED_WIDTH}px !important;
        overflow: hidden !important;
        padding-top: ${TOP_BAND}px !important;
        box-sizing: border-box !important;
      }
      .fbm-sidebar.fbm-collapsed .fbm-hide-collapsed { display: none !important; }
      .fbm-sidebar .fbm-tabs-block { display: none !important; }
      .fbm-sidebar:not(.fbm-collapsed) .fbm-search-host {
        position: relative !important;
        padding-right: ${TOP_BAND}px !important;
      }
      .fbm-sidebar.fbm-collapsed h1 { display: none !important; }
      .fbm-sidebar.fbm-collapsed a[role="link"] > div > div > div:nth-child(2),
      .fbm-sidebar.fbm-collapsed a[role="link"] > div > div > div:nth-child(3) { display: none !important; }
      .fbm-sidebar.fbm-collapsed a[role="link"] > div > div { justify-content: center !important; }
      .fbm-sidebar.fbm-collapsed [role="row"] [role="gridcell"]:not(:has(a[role="link"])) {
        top: 0 !important;
        left: 0 !important;
        right: auto !important;
        bottom: auto !important;
      }
      .fbm-sidebar.fbm-collapsed [role="row"] [role="gridcell"]:not(:has(a[role="link"])) [role="button"] {
        transform: scale(0.5) !important;
        transform-origin: top left !important;
      }
      /* csak reakciós sorok: olvasott megjelenés (4b szakasz) */
      a.fbm-react-read span {
        font-weight: 400 !important;
        color: var(--secondary-text, #b0b3b8) !important;
      }
      a.fbm-react-read span.fbm-react-name {
        font-weight: 500 !important;
        color: var(--primary-text, #e4e6eb) !important;
      }
      a.fbm-react-read .fbm-react-dot { visibility: hidden !important; }
      #fbm-toggle-btn.fbm-hover,
      #fbm-profile-btn:hover { background-color: rgba(128,128,128,0.2); }
      html.fbm-toggle-hover, html.fbm-toggle-hover body, html.fbm-toggle-hover * { cursor: pointer !important; }
      .fbm-badge {
        position: fixed;
        display: flex;
        align-items: center;
        justify-content: center;
        min-width: 18px;
        height: 18px;
        padding: 0 5px;
        box-sizing: border-box;
        border-radius: 9px;
        background: #e5202e;
        color: #fff;
        font-size: 11px;
        font-weight: 700;
        line-height: 1;
        letter-spacing: 0;
        z-index: 6;
        pointer-events: none;
        box-shadow: 0 0 0 2px rgba(0,0,0,0.45);
      }
      .fbm-media-full {
        position: fixed !important;
        left: var(--fbm-mf-l, 0px) !important;
        top: var(--fbm-mf-t, 0px) !important;
        width: var(--fbm-mf-w, 100%) !important;
        height: var(--fbm-mf-h, 100%) !important;
        max-width: none !important;
        min-width: 0 !important;
        flex: none !important;
      }
      .fbm-media-under { visibility: hidden !important; }
      .fbm-media-frozen {
        flex: 0 0 var(--fbm-mf-uw, 50%) !important;
        width: var(--fbm-mf-uw, 50%) !important;
        max-width: 100% !important;
      }
      .fbm-media-gap { margin-top: ${MEDIA_BTN_GAP}px !important; }
      .fbm-media-full .fbm-media-grid > * {
        flex: 0 0 var(--fbm-tile, 130px) !important;
        max-width: var(--fbm-tile, 130px) !important;
      }
      #fbm-media-btn {
        position: fixed;
        display: none;
        align-items: center;
        justify-content: center;
        height: 34px;
        padding: 0 14px;
        box-sizing: border-box;
        border-radius: 8px;
        border: 1px solid rgba(128,128,128,0.35);
        background: rgba(128,128,128,0.16);
        color: var(--fbm-mf-fg, inherit);
        font-size: 13px;
        font-weight: 600;
        line-height: 1;
        white-space: nowrap;
        cursor: pointer;
        user-select: none;
        pointer-events: auto;
      }
      #fbm-media-btn:hover { background: rgba(128,128,128,0.3); }
      #fbm-lightbox {
        position: fixed;
        left: 0; top: 0; right: 0; bottom: 0;
        z-index: 2147482500;
        display: flex;
        align-items: center;
        justify-content: center;
        background: rgba(0,0,0,0.92);
      }
      #fbm-lightbox .fbm-lb-stage {
        display: flex;
        align-items: center;
        justify-content: center;
        max-width: 94vw;
        max-height: 94vh;
      }
      #fbm-lightbox img, #fbm-lightbox video {
        display: block;
        max-width: 94vw;
        max-height: 94vh;
        object-fit: contain;
        border-radius: 6px;
      }
      #fbm-lightbox .fbm-lb-close {
        position: fixed;
        top: 16px;
        right: 16px;
        width: 44px;
        height: 44px;
        border-radius: 50%;
        display: flex;
        align-items: center;
        justify-content: center;
        background: rgba(255,255,255,0.14);
        color: #fff;
        font-size: 20px;
        line-height: 1;
        cursor: pointer;
        user-select: none;
      }
      #fbm-lightbox .fbm-lb-close:hover { background: rgba(255,255,255,0.28); }
      #fbm-lightbox .fbm-lb-fallback {
        display: flex;
        flex-direction: column;
        align-items: center;
        gap: 14px;
      }
      #fbm-lightbox .fbm-lb-open {
        color: #fff;
        background: rgba(255,255,255,0.16);
        padding: 10px 18px;
        border-radius: 8px;
        text-decoration: none;
        font-size: 14px;
        font-weight: 600;
      }
      /* --- reels: teljes képernyős nagyítás (9. szakasz) --- */
      html.fbm-reel-zoom, html.fbm-reel-zoom body { background: #000 !important; }
      html.fbm-reel-zoom .fbm-reel-media {
        transform: translate(var(--fbm-reel-x, 0px), var(--fbm-reel-y, 0px)) scale(var(--fbm-reel-s, 1)) !important;
        transform-origin: 0 0 !important;
      }
      html.fbm-reel-zoom .fbm-reel-media.fbm-reel-measure { transform: none !important; }
      html.fbm-reel-zoom .fbm-reel-hide { transition: opacity .15s linear; }
      html.fbm-reel-zoom:not(.fbm-reel-chrome) .fbm-reel-hide {
        opacity: 0 !important;
        pointer-events: none !important;
      }
      /* ami a Facebook hangerő gombja fölé lóg, az ne nyelje el a kattintást */
      html.fbm-reel-zoom .fbm-reel-pass { pointer-events: none !important; }
      html.fbm-reel-zoom.fbm-reel-chrome .fbm-reel-show {
        opacity: 1 !important;
        transition: opacity .15s linear;
      }
      html.fbm-reel-zoom:not(.fbm-reel-chrome),
      html.fbm-reel-zoom:not(.fbm-reel-chrome) * { cursor: none !important; }
      #fbm-reel-btn:hover, #fbm-reel-mute:hover { background: rgba(0,0,0,0.75) !important; }
      .fbm-hide-input-btn { display: none !important; }
      .fbm-icon-row-tight { padding-left: 1px !important; padding-right: 1px !important; }
      .fbm-file-icon-boost { transform: scale(1.1667, 0.9333); transform-origin: center; }
      .fbm-file-cell-tight { margin-right: -8px !important; }
    `;
    (document.head || document.documentElement).appendChild(st);
  }
  /* ---------- indítás ---------- */
  function tick() {
    try {
      if (scriptDisabled()) {
        exitReelZoom();
        closeLightbox();
        clearMediaUi();
        setOverlayVisible(false);
        return;
      }
      closeDockedChats();
      if (!onMessengerPage()) {
        closeLightbox();
        hideMessengerUi();
        if (onReelPage()) {
          injectStyle();
          setOverlayVisible(true);
          reelTick();
        } else {
          exitReelZoom();
          if (reelBtnEl && reelBtnEl.style.display !== 'none') reelBtnEl.style.display = 'none';
          if (reelMuteBtnEl && reelMuteBtnEl.style.display !== 'none') reelMuteBtnEl.style.display = 'none';
          setOverlayVisible(false);
        }
        return;
      }
      exitReelZoom();
      if (reelBtnEl && reelBtnEl.style.display !== 'none') reelBtnEl.style.display = 'none';
      if (reelMuteBtnEl && reelMuteBtnEl.style.display !== 'none') reelMuteBtnEl.style.display = 'none';
      persistState();
      injectStyle();
      applySidebarState();
      const sb = getSidebar();
      setOverlayVisible(!overlayObstructed(sb));
      if (sb) {
        const grid = mainThreadGrid();
        if (grid) {
          updateUnreadCounts(grid);
          markReactionRowsRead(grid);
          renderBadges(grid);
        } else {
          clearBadges();
        }
      }
      updateBubbleWidthVar();
      mediaTick();
      ensureProfileButton();
      hideInputSideButtons();
      refreshToggleHover();
    } catch (e) {
      /* egy hiba se állítsa le a további futásokat */
    }
  }
  const runAll = throttle(tick, 250);
  const runMedia = throttle(() => {
    try {
      if (scriptDisabled() || !onMessengerPage()) return;
      injectStyle();
      mediaTick();
    } catch (e) {}
  }, 50);
  if (onMessengerPage()) {
    injectStyle();
    applyStoredWidth();
    applyStoredMediaGeometry();
  }
  function boot() {
    tick();
    new MutationObserver(() => {
      runMedia();
      runAll();
    }).observe(document.body, { childList: true, subtree: true });
    window.addEventListener('resize', () => {
      runAll();
      runMedia();
    });
    window.addEventListener('focus', runAll);
    document.addEventListener('visibilitychange', runAll);
    setInterval(tick, 1500);
  }
  if (document.body) boot();
  else document.addEventListener('DOMContentLoaded', boot, { once: true });
})();