// ==UserScript==
// @name         Google
// @namespace    Claude
// @version      1.0
// @description
// @author       10Geri
// @match        https://www.google.com/search*
// @match        https://www.google.hu/search*
// @match        https://www.google.com/
// @match        https://www.google.com/webhp*
// @match        https://www.google.hu/
// @match        https://www.google.hu/webhp*
// @include      /^https:\/\/www\.google\.[a-z]{2,3}(\.[a-z]{2,3})?\/search([?#].*)?$/
// @include      /^https:\/\/www\.google\.[a-z]{2,3}(\.[a-z]{2,3})?\/(webhp)?([?#].*)?$/
// @grant        none
// @run-at       document-start
// ==/UserScript==

(function () {
    'use strict';

    if (!/^www\.google\.[a-z]{2,3}(\.[a-z]{2,3})?$/.test(location.hostname)) return;

    /* ------------------------------------------------------------------ *
     * Beallitasok
     * ------------------------------------------------------------------ */
    const SIDE_RATIO = 0.03;   // oldalso margo a viewport szazalekaban
    const SIDE_MIN = 16;       // px
    const SIDE_MAX = 140;      // px
    const GUTTER_MAX = 200;    // ennel szelesebb oldalso sav semmikepp

    function sideMargin() {
        const w = document.documentElement.clientWidth || window.innerWidth;
        return Math.round(Math.min(SIDE_MAX, Math.max(SIDE_MIN, w * SIDE_RATIO)));
    }

    function addStyle(id, css) {
        let st = document.getElementById(id);
        if (!st) {
            st = document.createElement('style');
            st.id = id;
            (document.head || document.documentElement).appendChild(st);
        }
        if (st.textContent !== css) st.textContent = css;
        return st;
    }

    function dropStyle(id) {
        const st = document.getElementById(id);
        if (st && st.parentNode) st.parentNode.removeChild(st);
    }

    /* ------------------------------------------------------------------ *
     * Frissen nyitott lap: a kurzor maradjon a bongeszo cimsavjaban,
     * ne ugorjon automatikusan a Google kereso mezojebe.
     * Csak uj lapon fut (history.length === 1) es csak az elso par
     * masodpercben, amig a felhasznalo nem nyul az oldalhoz.
     * ------------------------------------------------------------------ */
    const KEEP_FOCUS_IN_ADDRESS_BAR = true;   // allitsd false-ra a kikapcsolashoz
    const FOCUS_GUARD_MS = 4000;
    const USER_EVENTS = ['mousedown', 'pointerdown', 'touchstart', 'keydown', 'wheel'];

    function keepFocusInAddressBar() {
        if (!KEEP_FOCUS_IN_ADDRESS_BAR) return;
        try {
            if (window.top !== window.self) return;
            if (history.length > 1) return;
        } catch (e) {
            return;
        }

        const until = Date.now() + FOCUS_GUARD_MS;
        let userActed = false;
        const markUser = function () { userActed = true; };
        USER_EVENTS.forEach(function (ev) {
            window.addEventListener(ev, markUser, true);
        });

        function isSearchField(el) {
            if (!el || (el.tagName !== 'TEXTAREA' && el.tagName !== 'INPUT')) return false;
            if (el.getAttribute('name') === 'q') return true;
            if (el.classList && el.classList.contains('gLFyf')) return true;
            return el.getAttribute('role') === 'combobox';
        }

        const blocked = function (el) {
            return !userActed && Date.now() < until && isSearchField(el);
        };

        const nativeFocus = HTMLElement.prototype.focus;
        HTMLElement.prototype.focus = function () {
            if (blocked(this)) return;
            return nativeFocus.apply(this, arguments);
        };

        /* a select() is fokuszt ad a Chrome-ban */
        const selectOwners = [HTMLInputElement, HTMLTextAreaElement];
        const nativeSelects = selectOwners.map(function (C) { return C.prototype.select; });
        selectOwners.forEach(function (C, i) {
            C.prototype.select = function () {
                if (blocked(this)) return;
                return nativeSelects[i].apply(this, arguments);
            };
        });

        const strip = function () {
            const list = document.querySelectorAll('[autofocus]');
            for (let i = 0; i < list.length; i++) list[i].removeAttribute('autofocus');
        };
        strip();
        const root = document.documentElement || document;
        const mo = new MutationObserver(strip);
        mo.observe(root, { childList: true, subtree: true, attributes: true, attributeFilter: ['autofocus'] });

        const stop = function () {
            mo.disconnect();
            if (HTMLElement.prototype.focus !== nativeFocus) HTMLElement.prototype.focus = nativeFocus;
            selectOwners.forEach(function (C, i) {
                if (C.prototype.select !== nativeSelects[i]) C.prototype.select = nativeSelects[i];
            });
            USER_EVENTS.forEach(function (ev) { window.removeEventListener(ev, markUser, true); });
        };
        setTimeout(stop, FOCUS_GUARD_MS);
        window.addEventListener('pagehide', stop);
    }

    /* ------------------------------------------------------------------ *
     * Kezdolap: a kereso-/chatdoboz 2x szelesebb
     * ------------------------------------------------------------------ */
    if (location.pathname === '/' || location.pathname === '/webhp') {
        const homeCss = `
            .A8SBwf {
                --gm-home-w: min(1376px, calc(100vw - 32px));
                width: var(--gm-home-w) !important;
                max-width: var(--gm-home-w) !important;
                margin-left: calc((100% - var(--gm-home-w)) / 2) !important;
                margin-right: 0 !important;
            }
        `;
        const injectHome = function () { addStyle('gm-google-home-wide', homeCss); };
        injectHome();
        document.addEventListener('DOMContentLoaded', injectHome);
        keepFocusInAddressBar();
        return;
    }

    if (location.pathname !== '/search') return;

    /* ------------------------------------------------------------------ *
     * Oldaltipus
     * ------------------------------------------------------------------ */
    function getPageType() {
        let udm = null, tbm = null;
        try {
            const p = new URLSearchParams(location.search);
            udm = p.get('udm');
            tbm = p.get('tbm');
        } catch (e) {
            return 'all';
        }
        if (udm === '50') return 'ai-mode';
        if (tbm === 'isch' || udm === '2') return 'images';
        if (tbm === 'nws' || udm === '12') return 'news';
        if (tbm === 'vid' || udm === '7') return 'videos';
        if (udm === '39') return 'short-videos';
        if (udm === 'web') return 'web';
        if (udm === '36') return 'books';
        return 'all';
    }

    const PAGE_TYPE = getPageType();

    /* ------------------------------------------------------------------ *
     * Alap CSS (document-start)
     *  - NEM nyulunk a --center-width valtozohoz: a Google sok calc()-ban
     *    hasznalja, "none"-ra allitva az egesz elrendezes szetesik.
     * ------------------------------------------------------------------ */
    const baseCss = `
        #tsf,
        form.tsf,
        form[role="search"],
        form[action="/search"] {
            max-width: none !important;
            flex-grow: 1 !important;
        }
        #center_col,
        #res,
        #search,
        #rso,
        .NmCNL,
        .SePcAf,
        [data-lhcontainer="1"],
        [jsname="ZLxsqf"] {
            max-width: none !important;
        }
        #center_col > *,
        #rso > * {
            max-width: none !important;
        }
    `;
    if (PAGE_TYPE !== 'images') addStyle('gm-google-base', baseCss);

    /* ------------------------------------------------------------------ *
     * Elrendezes-gyorsitotar
     *  A lenyeg: az oldal NE ugraljon betoltes utan. Ezert amit egyszer
     *  kimertunk (melyik osztaly a racs, hany sav, mekkora oldalso sav kell
     *  a Google logonak), azt eltesszuk, es a kovetkezo betolteskor mar
     *  document-start-kor, sima CSS-kent ervenyesitjuk - meg az elso
     *  kirajzolas elott. Igy nincs atrendezodes, se "osszeugras".
     * ------------------------------------------------------------------ */
    const CACHE_KEY = 'gm-google-layout';

    let cache = null;
    try { cache = JSON.parse(localStorage.getItem(CACHE_KEY) || 'null'); } catch (e) { cache = null; }
    if (!cache || typeof cache.cls !== 'string' || !cache.cls ||
        !(cache.n >= 10 && cache.n <= 40) || !(cache.gut >= 0 && cache.gut <= GUTTER_MAX)) {
        cache = null;
    }

    /* A legkisebb oldalso sav, ami meg nem vagja le a bal szelen ulo
       tartalmat (gyakorlatban: a Google logot). Merjuk, nem talalgatjuk. */
    let minGutter = cache ? cache.gut : 0;

    function gutterBase() {
        return Math.min(GUTTER_MAX, Math.max(sideMargin(), minGutter));
    }

    function saveCache(cls, n) {
        if (!cls || !(n >= 10)) return;
        const next = { cls: cls, n: n, gut: Math.round(minGutter) };
        if (cache && cache.cls === next.cls && cache.n === next.n && cache.gut === next.gut) return;
        cache = next;
        try { localStorage.setItem(CACHE_KEY, JSON.stringify(next)); } catch (e) { /* nincs tarhely */ }
    }

    function dropCache() {
        cache = null;
        dropStyle('gm-google-preset');
        try { localStorage.removeItem(CACHE_KEY); } catch (e) { /* mindegy */ }
    }

    /* Elozetes CSS a mentett adatokbol: a :not(...) kizarja az egymasba
       agyazott racsokat (azokat a JS kulon kezeli, ott nem kell oldalso sav). */
    if (cache && PAGE_TYPE !== 'images' && PAGE_TYPE !== 'ai-mode') {
        const c = '.' + cache.cls;
        const g = Math.min(GUTTER_MAX, Math.max(sideMargin(), cache.gut));
        addStyle('gm-google-preset',
            c + ':not(' + c + ' ' + c + '){grid-template-columns:' +
            g + 'px repeat(' + (cache.n - 2) + ', minmax(0, 1fr)) ' + g + 'px !important;}' +
            '#rcnt:not(:has(> #rhs)) > #center_col{grid-column: 2 / -2 !important;}');
    }

    /* ------------------------------------------------------------------ *
     * A Google kozos 22 oszlopos racsa
     *  (#searchform, a fulsav, #rcnt, a tudaspanel belso racsai es #fbar
     *   mind ugyanazt a sablont hasznaljak: "Xpx 36px*20 Ypx")
     *  Csak a ket szelso (maradek) savot csereljuk fix margora, a 20 belso
     *  savot pedig 1fr-re -> minden blokk aranyosan szelesedik, semmi nem
     *  csuszik egymasra, mert a Google sajat oszlop-kiosztasa ervenyben marad.
     *  Minden racs UGYANAZT az oldalso savot kapja, igy a fejlec, a fulsav,
     *  a talalatok es a lablec egy vonalban all.
     * ------------------------------------------------------------------ */
    const MARK = 'data-gm-grid';
    const NEST = 'data-gm-nested';

    function tracksOf(value) {
        return String(value || '').trim().split(/\s+/).filter(Boolean);
    }

    /** 0 = nem ilyen racs, egyebkent a savok szama */
    function serpGridTrackCount(el) {
        const cs = getComputedStyle(el);
        if (cs.display !== 'grid') return 0;
        const t = tracksOf(cs.gridTemplateColumns);
        if (t.length < 10 || t.length > 40) return 0;
        const inner = t.slice(1, -1);
        const unit = parseFloat(inner[0]);
        if (!(unit > 0)) return 0;
        for (let i = 1; i < inner.length; i++) {
            const v = parseFloat(inner[i]);
            if (!(v > 0) || Math.abs(v - unit) > 0.75) return 0;
        }
        const g0 = parseFloat(t[0]);
        const g1 = parseFloat(t[t.length - 1]);
        if (!(g0 >= 0) || !(g1 >= 0)) return 0;
        /* A ket szelso sav NEM feltetlenul egyforma! Szeles ablakban a Google
           a jobb oldalon helyet tart fenn a tudaspanelnek, ilyenkor a sablon
           pl. "260px 36px*20 441px". Korabban itt szimmetriat vartunk, ezert
           szeles ablakban EGYETLEN racsot sem ismertunk fel, es az egesz
           tartalom a Google alap 652 px-es savjaban maradt (ez latszott a
           fordito kartyanal). Keskenyebb ablakban (pl. ha a Claude oldalpanel
           nyitva volt) a ket sav egyforma lett, ezert ott mukodott.
           Eleg annyit megkovetelni, hogy legalabb az egyik szelso sav a
           maradek helyet kapja, vagyis szelesebb legyen a belso savoknal. */
        if (Math.max(g0, g1) <= unit + 1) return 0;
        return t.length;
    }

    function nearestMarkedGrid(el) {
        let n = el.parentElement, guard = 0;
        while (n && guard < 40) {
            if (n.hasAttribute(MARK)) return n;
            n = n.parentElement;
            guard++;
        }
        return null;
    }

    /* Levagja-e barmelyik szulo (a racson belul) az elemet? A vizszintesen
       gorgetheto karuszelek elemei igy nem szamitanak kilogasnak. */
    function clippedInside(el, grid) {
        let n = el, guard = 0;
        while (n && n !== grid && n !== document.body && guard < 40) {
            const cs = getComputedStyle(n);
            if (/auto|scroll|hidden|clip/.test(cs.overflowX)) return true;
            n = n.parentElement;
            guard++;
        }
        return false;
    }

    /* Latszik-e rajta barmi? Ures, szoveg nelkuli doboz tipikusan dekoracio
       (hatter, elvalaszto sav) - azok miatt nem szabad margot novelni. */
    const GRAPHIC_TAGS = /^(IMG|CANVAS|VIDEO|INPUT|TEXTAREA|SELECT|svg|path|circle|ellipse|line|polygon|polyline|rect|use|image|text)$/;

    function carriesContent(el) {
        if (GRAPHIC_TAGS.test(el.tagName)) return true;
        return (el.textContent || '').trim().length > 0;
    }

    /* ------------------------------------------------------------------ *
     * Kilogas-ellenorzes
     *  Csak azt nezzuk, ami tenyleg latszik es tenyleg a bal szelen log ki:
     *   - levelelem (nincs gyerekeleme) -> a belso paddinges burkolok nem
     *     hizlaljak feleslegesen a margot,
     *   - van rajta tartalom (szoveg vagy grafika),
     *   - nem szelesebb a viewportnal (a teljes szelessegu hatterek nem
     *     szamitanak).
     *  Ez a ket szures a lenyeg: korabban egy ures, 1900 px szeles
     *  hatterdoboz es a logo kulso burkoloja is noveltette a savot, ezert
     *  lett a ket szelen duplaakkora ures hely.
     * ------------------------------------------------------------------ */
    function neededGutter() {
        if (!document.querySelector('[' + MARK + ']')) return 0;
        const vw = document.documentElement.clientWidth || window.innerWidth;
        const base = gutterBase();
        let worst = 0;
        const all = document.getElementsByTagName('*');
        for (let i = 0; i < all.length; i++) {
            const el = all[i];
            if (el.children.length) continue;
            const r = el.getBoundingClientRect();
            if (r.width <= 0 || r.height <= 0) continue;
            /* Csak a bal oldali kilogas szamit: jobbra szinte mindig
               gorgetheto karuszelek lognak ki, azok miatt nem novelunk. */
            if (r.left >= -0.5) continue;
            const over = -r.left;
            if (over > GUTTER_MAX) continue;
            if (r.width >= vw - 1) continue;
            if (!carriesContent(el)) continue;
            const g = nearestMarkedGrid(el);
            if (!g || g.getAttribute(NEST) === '1') continue;
            if (clippedInside(el, g)) continue;
            if (over > worst) worst = over;
        }
        if (!worst) return 0;
        return Math.min(GUTTER_MAX, Math.ceil(base + worst + 8));
    }

    /* A teljes szelessegu (grid-column: 1 / -1) blokkok maradjanak a
       tartalom savjaban, kulonben a bal szelre csusznanak (pl. AI-attekintes) */
    function constrainFullBleedChildren(g, gutter) {
        const inner = Math.round(g.getBoundingClientRect().width - 2 * gutter);
        if (!(inner > 0)) return;
        const kids = g.children;
        for (let i = 0; i < kids.length; i++) {
            const c = kids[i];
            if (getComputedStyle(c).gridColumn.replace(/ /g, '') !== '1/-1') continue;
            c.style.setProperty('width', inner + 'px', 'important');
            c.style.setProperty('max-width', inner + 'px', 'important');
            c.style.setProperty('margin-left', 'auto', 'important');
            c.style.setProperty('margin-right', 'auto', 'important');
        }
    }

    function applyGridTemplate(el, count) {
        const nested = el.getAttribute(NEST) === '1';
        const own = el.getBoundingClientRect().width;
        const cap = own > 0 ? Math.max(180, Math.round(own * 0.2)) : Infinity;
        const gutter = nested ? 0 : Math.min(cap, gutterBase());
        const tpl = gutter + 'px repeat(' + (count - 2) + ', minmax(0, 1fr)) ' + gutter + 'px';
        if (el.style.getPropertyValue('grid-template-columns') !== tpl) {
            el.style.setProperty('grid-template-columns', tpl, 'important');
        }
        if (!nested) constrainFullBleedChildren(el, gutter);
    }

    function hasMarkedAncestor(el) {
        let n = el.parentElement;
        while (n) {
            if (n.hasAttribute(MARK)) return true;
            n = n.parentElement;
        }
        return false;
    }

    let gridClass = null;
    let gridSelector = null;

    function deriveGridClass(list) {
        const counts = Object.create(null);
        list.forEach(function (el) {
            const cn = typeof el.className === 'string' ? el.className : '';
            cn.split(/\s+/).filter(Boolean).forEach(function (c) {
                if (/^[A-Za-z][\w-]*$/.test(c)) counts[c] = (counts[c] || 0) + 1;
            });
        });
        let best = null, bestN = 0;
        for (const c in counts) if (counts[c] > bestN) { bestN = counts[c]; best = c; }
        if (best && bestN >= Math.max(2, Math.ceil(list.length * 0.7))) return best;
        return null;
    }

    function fullSweepGrids() {
        const found = [];
        const all = document.getElementsByTagName('*');
        for (let i = 0; i < all.length; i++) {
            const el = all[i];
            if (el.hasAttribute(MARK)) { found.push(el); continue; }
            if (serpGridTrackCount(el)) found.push(el);
        }
        return found;
    }

    let lastSweep = 0;
    let freshGrids = 0;
    let trackCount = 0;

    function widenSerpGrids() {
        let list = [];
        if (gridSelector) {
            try { list = Array.prototype.slice.call(document.querySelectorAll(gridSelector)); } catch (e) { list = []; }
        }
        const now = Date.now();
        if (!gridSelector || (!list.length && now - lastSweep > 400)) {
            lastSweep = now;
            list = fullSweepGrids();
            if (!gridClass) {
                gridClass = deriveGridClass(list);
                if (gridClass) gridSelector = '.' + gridClass + ', [' + MARK + ']';
            }
        }

        let touched = 0;
        freshGrids = 0;
        list.forEach(function (el) {
            let count = parseInt(el.getAttribute(MARK), 10);
            if (!count) {
                count = serpGridTrackCount(el);
                if (!count) return;
                el.setAttribute(MARK, String(count));
                el.setAttribute(NEST, hasMarkedAncestor(el) ? '1' : '0');
                freshGrids++;
            }
            if (!el.hasAttribute(NEST)) el.setAttribute(NEST, hasMarkedAncestor(el) ? '1' : '0');
            if (count > trackCount) trackCount = count;
            applyGridTemplate(el, count);
            touched++;
        });
        return touched;
    }

    /* Ha a mentett osztalynev mar nem talal (a Google atnevezte), dobjuk el
       az elozetes CSS-t, nehogy rossz helyre tegyen savokat. */
    function validatePreset() {
        if (!cache) return;
        if (gridClass && gridClass === cache.cls) return;
        if (document.querySelector('.' + cache.cls + '[' + MARK + ']')) return;
        if (!document.querySelector('[' + MARK + ']')) return; // meg nincs mit ellenorizni
        dropCache();
    }

    /* ------------------------------------------------------------------ *
     * Tartalek: regebbi elrendezes CSS valtozokkal
     * ------------------------------------------------------------------ */
    function widenViaVariables() {
        const w = document.documentElement.clientWidth || window.innerWidth;
        const m = sideMargin();
        const rhsEl = document.getElementById('rhs');
        const rhsVisible = rhsEl && rhsEl.getBoundingClientRect().width > 40;
        const rhs = rhsVisible ? Math.round(Math.min(460, Math.max(320, w * 0.28))) : 0;
        const gap = rhs ? 24 : 0;
        const center = Math.max(320, w - 2 * m - rhs - gap);
        addStyle('gm-google-vars',
            'html, body, body.srp {' +
            '--center-width:' + center + 'px !important;' +
            (rhs ? '--rhs-width:' + rhs + 'px !important;' : '') +
            '--center-abs-margin:' + m + 'px !important;' +
            '--rhs-margin:' + m + 'px !important;' +
            '}');
    }

    /* ------------------------------------------------------------------ *
     * Ha nincs tudaspanel, a kozepso oszlop kapja a teljes szelesseget
     * ------------------------------------------------------------------ */
    function adjustCenterSpan() {
        const cc = document.getElementById('center_col');
        if (!cc) return;
        const host = cc.parentElement;
        if (!host || !host.hasAttribute(MARK)) return;
        const rhs = document.getElementById('rhs');
        let hasRhs = false;
        if (rhs) {
            const r = rhs.getBoundingClientRect();
            hasRhs = r.width > 40 && r.height > 40;
        }
        if (hasRhs) {
            if (cc.style.getPropertyValue('grid-column')) cc.style.removeProperty('grid-column');
        } else {
            cc.style.setProperty('grid-column', '2 / -2', 'important');
        }
    }

    /* ------------------------------------------------------------------ *
     * Talalatok, amiket a Google sajat max-width-je tart keskenyen
     * (pl. videos talalat sorok), kapjak meg a teljes oszlopszelesseget
     * ------------------------------------------------------------------ */
    const relaxSeen = new WeakSet();

    function insideHorizontalScroller(el, root) {
        let n = el, guard = 0;
        while (n && n !== root && guard < 8) {
            if (/auto|scroll/.test(getComputedStyle(n).overflowX)) return true;
            n = n.parentElement;
            guard++;
        }
        return false;
    }

    function relaxNarrowMaxWidths() {
        const root = document.getElementById('center_col');
        if (!root) return;
        const avail = root.getBoundingClientRect().width;
        if (!(avail > 600)) return;
        const nodes = root.getElementsByTagName('div');
        for (let i = 0; i < nodes.length; i++) {
            const el = nodes[i];
            if (relaxSeen.has(el)) continue;
            /* Csak akkor konyveljuk el "mar megneztuk"-nek, ha tenyleg ki van
               rajzolva. A kesve betoltodo blokkok (pl. a fordito kartya) igy
               nem esnek ki vegleg a vizsgalatbol az elso korben. */
            const r0 = el.getBoundingClientRect();
            if (r0.width <= 0 || r0.height <= 0) continue;
            relaxSeen.add(el);
            const cs = getComputedStyle(el);
            const mw = parseFloat(cs.maxWidth);
            if (!(mw > 380) || mw >= avail - 2) continue;
            if (!/^(block|flex|grid|flow-root)$/.test(cs.display)) continue;
            if (insideHorizontalScroller(el, root)) continue;
            el.style.setProperty('max-width', 'none', 'important');
        }
    }

    /* ------------------------------------------------------------------ *
     * Kepek ful: nagyitott elonezeti panel
     * ------------------------------------------------------------------ */
    function findImagePreviewPanel() {
        const dialogs = Array.prototype.slice.call(document.querySelectorAll('[role="dialog"], g-dialog'));
        const visible = dialogs.filter(function (d) {
            const r = d.getBoundingClientRect();
            return r.width > 200 && r.height > 200 && d.querySelector('img') != null;
        });
        if (!visible.length) return null;
        visible.sort(function (a, b) {
            const ra = a.getBoundingClientRect(), rb = b.getBoundingClientRect();
            return (rb.width * rb.height) - (ra.width * ra.height);
        });
        return visible[0];
    }

    function widenImageLightbox() {
        const panel = findImagePreviewPanel();
        if (!panel) return;
        const cs = getComputedStyle(panel);
        const rect = panel.getBoundingClientRect();

        if (cs.position === 'fixed') {
            let gapAttr = panel.getAttribute('data-gm-preview-right-gap');
            let rightGap = gapAttr !== null ? parseFloat(gapAttr) : null;
            if (rightGap === null) {
                rightGap = window.innerWidth - (rect.left + rect.width);
                panel.setAttribute('data-gm-preview-right-gap', String(rightGap));
            }
            const newWidth = Math.max(600, window.innerWidth * 0.62);
            panel.style.setProperty('width', newWidth + 'px', 'important');
            panel.style.setProperty('max-width', newWidth + 'px', 'important');
            panel.style.setProperty('left', (window.innerWidth - newWidth - rightGap) + 'px', 'important');
        } else {
            let baseAttr = panel.getAttribute('data-gm-preview-base-w');
            let baseWidth = baseAttr !== null ? parseFloat(baseAttr) : null;
            if (baseWidth === null) {
                baseWidth = rect.width;
                panel.setAttribute('data-gm-preview-base-w', String(baseWidth));
            }
            if (!baseWidth || baseWidth <= 0) return;
            const newWidth = Math.min(Math.max(600, window.innerWidth * 0.42), window.innerWidth * 0.6);
            if (newWidth > baseWidth) {
                panel.style.setProperty('width', newWidth + 'px', 'important');
                panel.style.setProperty('max-width', newWidth + 'px', 'important');
                panel.style.setProperty('margin-left', (baseWidth - newWidth) + 'px', 'important');
            }
        }

        const imgs = Array.prototype.slice.call(panel.querySelectorAll('img.sFlh5c')).filter(function (im) {
            const r = im.getBoundingClientRect();
            return im.offsetParent !== null && r.width > 0 && r.height > 0;
        });
        if (!imgs.length) return;
        imgs.sort(function (a, b) {
            const ra = a.getBoundingClientRect(), rb = b.getBoundingClientRect();
            return (rb.width * rb.height) - (ra.width * ra.height);
        });
        const img = imgs[0];
        img.style.setProperty('width', '100%', 'important');
        img.style.setProperty('height', 'auto', 'important');
        img.style.setProperty('max-width', '100%', 'important');
        img.style.setProperty('max-height', 'none', 'important');
    }

    /* ------------------------------------------------------------------ *
     * Fordito kartya: 2x magasabb
     * ------------------------------------------------------------------ */
    const TRANSLATE_HEIGHT_MULTIPLIER = 2;

    function findTranslateCards() {
        const textareas = Array.prototype.slice.call(document.querySelectorAll('textarea'));
        for (let i = 0; i < textareas.length; i++) {
            let node = textareas[i], guard = 0;
            while (node && node.parentElement && guard < 8) {
                const parent = node.parentElement;
                const pr = parent.getBoundingClientRect();
                const nr = node.getBoundingClientRect();
                if (pr.width > 0 && nr.width > 0 && nr.width < pr.width * 0.7) {
                    const wideKids = Array.prototype.slice.call(parent.children).filter(function (k) {
                        return k.getBoundingClientRect().width > 200;
                    });
                    if (wideKids.length >= 2 && wideKids.length <= 4 && parent.children.length <= 4) {
                        return { row: parent, cards: wideKids };
                    }
                    break;
                }
                node = parent;
                guard++;
            }
        }
        return null;
    }

    function widenTranslateWidget() {
        const found = findTranslateCards();
        if (!found) return;
        found.cards.forEach(function (card) {
            const attr = card.getAttribute('data-gm-translate-card-base-h');
            const base = attr !== null ? parseFloat(attr) : card.getBoundingClientRect().height;
            if (attr === null) card.setAttribute('data-gm-translate-card-base-h', String(base));
            if (!base || base <= 0) return;
            const target = base * TRANSLATE_HEIGHT_MULTIPLIER;
            card.style.setProperty('height', target + 'px', 'important');
            card.style.setProperty('min-height', target + 'px', 'important');
            card.style.setProperty('max-height', 'none', 'important');
        });
    }

    /* ------------------------------------------------------------------ *
     * Rovid videok: tobb csempe egy sorban
     * ------------------------------------------------------------------ */
    function findVideoTileGrid() {
        const tileLinks = Array.prototype.slice.call(document.querySelectorAll('a')).filter(function (a) {
            return a.querySelector('img') && /\d:\d\d/.test(a.textContent);
        });
        if (!tileLinks.length) return null;
        let node = tileLinks[0], guard = 0;
        while (node && guard < 10) {
            if (getComputedStyle(node).display === 'grid') return node;
            node = node.parentElement;
            guard++;
        }
        return null;
    }

    function widenShortVideoGrid() {
        const grid = findVideoTileGrid();
        if (!grid) return;
        if (grid.hasAttribute(MARK)) return;
        const w = grid.getBoundingClientRect().width;
        if (!(w > 0)) return;
        const cols = Math.max(2, Math.min(10, Math.floor(w / 210)));
        grid.style.setProperty('grid-template-columns', 'repeat(' + cols + ', minmax(0, 1fr))', 'important');
    }

    /* ------------------------------------------------------------------ *
     * AI-mod: sajat, keskeny elrendezes -> kozepre igazitott szeles savok
     * ------------------------------------------------------------------ */
    const AI_SIDE_RATIO = 0.08;

    function aiMetrics() {
        const w = document.documentElement.clientWidth || window.innerWidth;
        const m = Math.max(24, Math.round(w * AI_SIDE_RATIO));
        return { leftAbs: m, widthPx: w - 2 * m };
    }

    function centerAtWidth(el, targetWidth) {
        const probe = el.getBoundingClientRect();
        if (probe.width === 0 && probe.height === 0) return;
        el.style.setProperty('flex-shrink', '0', 'important');
        el.style.setProperty('flex-grow', '0', 'important');
        el.style.setProperty('width', targetWidth + 'px', 'important');
        el.style.setProperty('max-width', targetWidth + 'px', 'important');
        el.style.setProperty('margin-left', 'auto', 'important');
        el.style.setProperty('margin-right', 'auto', 'important');
    }

    function clearWidthAlongPath(fromEl, toEl) {
        let node = toEl, guard = 0;
        while (node && node !== fromEl && guard < 20) {
            if (node === document.body || node === document.documentElement) break;
            node.style.setProperty('max-width', 'none', 'important');
            node.style.setProperty('width', 'auto', 'important');
            node = node.parentElement;
            guard++;
        }
    }

    function findRowAndBranches(a1, b1) {
        function chain(el) { const c = []; let n = el; while (n) { c.push(n); n = n.parentElement; } return c.reverse(); }
        const a = chain(a1), b = chain(b1);
        let i = 0;
        while (i < a.length && i < b.length && a[i] === b[i]) i++;
        if (i === 0) return null;
        const row = a[i - 1];
        if (!row || row === document.body || row === document.documentElement) return null;
        if (!a[i] || !b[i]) return null;
        return { row: row, leftBranch: a[i], rightBranch: b[i] };
    }

    function findRestrictiveGridAncestor(fromNode) {
        let node = fromNode, guard = 0;
        while (node && guard < 15) {
            const gc = getComputedStyle(node).gridColumn;
            if (gc && gc !== 'auto' && gc !== '1 / -1') return node;
            node = node.parentElement;
            guard++;
        }
        return null;
    }

    function widenOneAiRow(mainCol, rhsCol, metrics) {
        const parts = findRowAndBranches(mainCol, rhsCol);
        if (!parts) return null;
        const restrictive = findRestrictiveGridAncestor(parts.row);
        if (restrictive) restrictive.style.setProperty('grid-column', '1 / -1', 'important');
        centerAtWidth(parts.row, metrics.widthPx);
        parts.row.setAttribute('data-gm-ai-aligned', '1');
        parts.row.style.setProperty('display', 'flex', 'important');
        parts.row.style.setProperty('flex-direction', 'row', 'important');
        parts.row.style.setProperty('align-items', 'flex-start', 'important');
        parts.row.style.setProperty('flex-wrap', 'nowrap', 'important');
        parts.leftBranch.style.setProperty('flex', '1 1 auto', 'important');
        parts.leftBranch.style.setProperty('width', 'auto', 'important');
        parts.leftBranch.style.setProperty('min-width', '0', 'important');
        parts.leftBranch.style.setProperty('max-width', 'none', 'important');
        clearWidthAlongPath(parts.leftBranch, mainCol);
        parts.rightBranch.style.setProperty('flex', '0 0 auto', 'important');
        parts.rightBranch.style.setProperty('width', 'auto', 'important');
        parts.rightBranch.style.setProperty('max-width', Math.max(metrics.widthPx - 240, 160) + 'px', 'important');
        return parts.leftBranch;
    }

    function widenAiRowWithoutCards(mainCol, metrics) {
        const w = document.documentElement.clientWidth || window.innerWidth;
        let row = mainCol, guard = 0;
        while (row && guard < 8) {
            if (row.getBoundingClientRect().width >= w * 0.8) break;
            const parent = row.parentElement;
            if (!parent || parent.getBoundingClientRect().width >= w * 0.8) break;
            row = parent;
            guard++;
        }
        if (!row) return null;
        const restrictive = findRestrictiveGridAncestor(row);
        if (restrictive) restrictive.style.setProperty('grid-column', '1 / -1', 'important');
        centerAtWidth(row, metrics.widthPx);
        row.setAttribute('data-gm-ai-aligned', '1');
        clearWidthAlongPath(row, mainCol);
        return row;
    }

    function alignUserMessageRows(metrics, contentWidth) {
        if (!contentWidth) return;
        const inset = Math.max(0, Math.round(metrics.widthPx - contentWidth));
        const divs = document.getElementsByTagName('div');
        for (let i = 0; i < divs.length; i++) {
            const el = divs[i];
            const r = el.getBoundingClientRect();
            if (r.height <= 0 || r.width < metrics.widthPx * 0.8) continue;
            if (getComputedStyle(el).justifyContent !== 'flex-end') continue;
            if (el.closest('[data-container-id]') !== null) continue;
            el.style.setProperty('box-sizing', 'border-box', 'important');
            el.style.setProperty('padding-right', inset + 'px', 'important');
            el.setAttribute('data-gm-ai-user', '1');
        }
    }

    function relaxWidestGridColumn(el) {
        const cs = getComputedStyle(el);
        if (cs.display !== 'grid') return;
        const cols = tracksOf(cs.gridTemplateColumns);
        if (cols.length < 2) return;
        let maxIdx = -1, maxPx = -1;
        cols.forEach(function (c, i) { const px = parseFloat(c); if (!isNaN(px) && px > maxPx) { maxPx = px; maxIdx = i; } });
        if (maxIdx === -1) return;
        const next = cols.slice();
        next[maxIdx] = 'minmax(0, 1fr)';
        el.style.setProperty('grid-template-columns', next.join(' '), 'important');
    }

    function openGridPlacementUpToFullWidth(el) {
        const w = document.documentElement.clientWidth || window.innerWidth;
        let node = el, guard = 0;
        while (node && guard < 6) {
            const gc = getComputedStyle(node).gridColumn;
            if (gc && gc !== 'auto' && gc !== '1 / -1') node.style.setProperty('grid-column', '1 / -1', 'important');
            if (node.getBoundingClientRect().width >= w * 0.85) break;
            node = node.parentElement;
            guard++;
        }
    }

    function findAskAreaOuter(textarea) {
        const w = document.documentElement.clientWidth || window.innerWidth;
        let node = textarea, outer = null, guard = 0;
        while (node && guard < 14) {
            const r = node.getBoundingClientRect();
            if (r.width >= w * 0.98) break;
            if (r.width > 0) outer = node;
            node = node.parentElement;
            guard++;
        }
        return outer;
    }

    function alignAbsoluteOverlaySiblings(box, targetLeft, targetWidth) {
        const parent = box.parentElement;
        if (!parent) return;
        const pr = parent.getBoundingClientRect();
        Array.prototype.slice.call(parent.children).forEach(function (sib) {
            if (sib === box) return;
            const cs = getComputedStyle(sib);
            if (cs.position !== 'absolute' && cs.position !== 'fixed') return;
            const r = sib.getBoundingClientRect();
            if (Math.abs(r.width - pr.width) > 4) return;
            const safeLeft = Math.max(0, targetLeft);
            sib.style.setProperty('left', (safeLeft - pr.left) + 'px', 'important');
            sib.style.setProperty('right', 'auto', 'important');
            sib.style.setProperty('width', targetWidth + 'px', 'important');
            sib.style.setProperty('max-width', targetWidth + 'px', 'important');
        });
    }

    function alignSmallEdgeAnchoredIcons(box, targetLeft, targetWidth) {
        const parent = box.parentElement;
        if (!parent) return;
        const pr = parent.getBoundingClientRect();
        Array.prototype.slice.call(parent.children).forEach(function (sib) {
            if (sib === box) return;
            const cs = getComputedStyle(sib);
            if (cs.position !== 'absolute' && cs.position !== 'fixed') return;
            const r = sib.getBoundingClientRect();
            if (r.width > pr.width * 0.3) return;
            let insetRight = sib.hasAttribute('data-gm-inset-right') ? parseFloat(sib.getAttribute('data-gm-inset-right')) : null;
            let insetLeft = sib.hasAttribute('data-gm-inset-left') ? parseFloat(sib.getAttribute('data-gm-inset-left')) : null;
            if (insetRight === null && insetLeft === null) {
                const dR = pr.right - r.right, dL = r.left - pr.left;
                if (dR <= dL) { insetRight = dR; sib.setAttribute('data-gm-inset-right', String(dR)); }
                else { insetLeft = dL; sib.setAttribute('data-gm-inset-left', String(dL)); }
            }
            let newLeft = insetRight !== null ? (targetLeft + targetWidth - insetRight - r.width) : (targetLeft + insetLeft);
            const minLeft = Math.max(0, targetLeft);
            const maxLeft = targetLeft + targetWidth - r.width;
            if (newLeft < minLeft) newLeft = minLeft;
            if (maxLeft >= minLeft && newLeft > maxLeft) newLeft = maxLeft;
            sib.style.setProperty('left', (newLeft - pr.left) + 'px', 'important');
            sib.style.setProperty('right', 'auto', 'important');
        });
    }

    function alignAiAskBox(metrics) {
        const textarea = document.querySelector('[data-container-id] textarea, textarea[aria-label], textarea[placeholder]');
        if (!textarea) return;
        const outer = findAskAreaOuter(textarea);
        if (!outer || outer === textarea) return;
        const inner = [];
        let node = textarea, guard = 0;
        while (node && node !== outer && guard < 14) { inner.push(node); node = node.parentElement; guard++; }
        inner.forEach(function (el) {
            el.style.setProperty('margin-left', '0px', 'important');
            el.style.setProperty('margin-right', '0px', 'important');
            el.style.setProperty('width', '100%', 'important');
            el.style.setProperty('max-width', 'none', 'important');
            el.style.setProperty('min-width', '0', 'important');
            el.style.setProperty('flex', '1 1 auto', 'important');
            el.style.setProperty('box-sizing', 'border-box', 'important');
            relaxWidestGridColumn(el);
        });
        openGridPlacementUpToFullWidth(outer);
        relaxWidestGridColumn(outer);
        centerAtWidth(outer, metrics.widthPx);
        outer.setAttribute('data-gm-ai-aligned', '1');
        const r = outer.getBoundingClientRect();
        alignAbsoluteOverlaySiblings(outer, r.left, r.width);
        alignSmallEdgeAnchoredIcons(outer, r.left, r.width);
    }

    function verifyAiAlignment(metrics) {
        const els = document.querySelectorAll('[data-gm-ai-aligned="1"]');
        for (let i = 0; i < els.length; i++) {
            const el = els[i];
            const r = el.getBoundingClientRect();
            if (r.width === 0 && r.height === 0) continue;
            if (Math.abs(r.width - metrics.widthPx) > 2) centerAtWidth(el, metrics.widthPx);
        }
    }

    function runAiMode() {
        const mainCols = document.querySelectorAll('[data-container-id="main-col"]');
        const rhsCols = document.querySelectorAll('[data-container-id="rhs-col"]');
        const metrics = aiMetrics();
        const n = Math.min(mainCols.length, rhsCols.length);
        let contentWidth = 0;
        for (let i = 0; i < n; i++) {
            const lb = widenOneAiRow(mainCols[i], rhsCols[i], metrics);
            if (lb) contentWidth = Math.max(contentWidth, lb.getBoundingClientRect().width);
        }
        for (let i = n; i < mainCols.length; i++) widenAiRowWithoutCards(mainCols[i], metrics);
        alignUserMessageRows(metrics, contentWidth);
        alignAiAskBox(metrics);
        verifyAiAlignment(metrics);
    }

    /* ------------------------------------------------------------------ *
     * Fo futas
     *  FONTOS: a meres es a javitas UGYANABBAN a korben, szinkronban megy
     *  vegig. A bongeszo csak a kor vegen rajzol, igy mindig a kesz
     *  elrendezes jelenik meg - nincs utolagos "osszeugras".
     * ------------------------------------------------------------------ */
    let needRecheck = true;

    /* A bal szelen a Google logo ul, reszben az oldalso savban. Ezt kulon,
       olcson merjuk ki (#logo = maga a logo link, nem a paddinges burkoloja),
       mert a logo kesobb is megjelenhet, mint ahogy a racsokat megtalaljuk -
       egyetlen meres tehat keves.
       A sajat eltolasunkat mindig visszaszamoljuk, igy a meres az EREDETI
       helyzetet adja, es nem csuszik el korrol korre. */
    const LOGO_SHIFT = 'data-gm-logo-shift';

    function logoBox() {
        const el = document.getElementById('logo');
        if (!el) return null;
        const r = el.getBoundingClientRect();
        if (r.width <= 0 || r.height <= 0) return null;
        const shift = parseFloat(el.getAttribute(LOGO_SHIFT)) || 0;
        return { el: el, left: r.left - shift, width: r.width, shift: shift };
    }

    function logoNeed() {
        const b = logoBox();
        if (!b || b.left >= 8) return 0;
        return Math.min(GUTTER_MAX, Math.ceil(gutterBase() + 8 - b.left));
    }

    /* A logo a bal oldalso sav KOZEPEN alljon, ne a kepernyo szelehez tapadva:
       egyforma legyen elotte es utana a hely. */
    function centerLogo() {
        const b = logoBox();
        if (!b) return;
        const grid = document.getElementById('searchform');
        if (!grid || !grid.hasAttribute(MARK)) return;
        const track = parseFloat(tracksOf(getComputedStyle(grid).gridTemplateColumns)[0]);
        if (!(track > 0) || track <= b.width) return;
        const target = Math.round((track - b.width) / 2);
        const shift = Math.round(target - b.left);
        if (Math.abs(shift - b.shift) < 1) return;
        b.el.setAttribute(LOGO_SHIFT, String(shift));
        b.el.style.setProperty('transform', 'translateX(' + shift + 'px)', 'important');
    }

    /* A gyorsitotarat csak akkor irjuk, amikor az oldal mar leulepedett -
       kulonben egy korai, meg hianyos meres ragadna be a kovetkezo
       betoltesekre is. */
    let cacheTimer = null;
    function scheduleCacheSave() {
        clearTimeout(cacheTimer);
        cacheTimer = setTimeout(function () { saveCache(gridClass, trackCount); }, 1500);
    }

    function settleGutter() {
        for (let i = 0; i < 3; i++) {
            const want = neededGutter();
            if (!(want > minGutter)) break;
            minGutter = want;
            widenSerpGrids();
        }
    }

    function runPass() {
        try {
            if (PAGE_TYPE === 'ai-mode') { runAiMode(); return; }
            if (PAGE_TYPE === 'images') { widenImageLightbox(); return; }

            const touched = widenSerpGrids();
            if (!touched) widenViaVariables();

            if (touched) {
                /* Minden korben: fer-e a logo. Ha nem, meg UGYANEBBEN a
                   szinkron korben kiszelesitjuk a savot, igy a bongeszo
                   mar a vegleges allapotot rajzolja ki. */
                let fresh = freshGrids;
                const want = logoNeed();
                if (want > minGutter) {
                    minGutter = want;
                    widenSerpGrids();
                    fresh = fresh || freshGrids;
                    scheduleCacheSave();
                }
                if (fresh || needRecheck) {
                    needRecheck = false;
                    settleGutter();
                    validatePreset();
                    scheduleCacheSave();
                }
                centerLogo();
            }

            adjustCenterSpan();
            relaxNarrowMaxWidths();

            if (PAGE_TYPE === 'short-videos') widenShortVideoGrid();
            if (PAGE_TYPE === 'all' || PAGE_TYPE === 'web') widenTranslateWidget();
            widenImageLightbox();
        } catch (e) {
            console.error('[gm-fullwidth]', PAGE_TYPE, e);
        }
    }

    let pending = false, timer = null, lastRun = 0;
    const FAST_UNTIL = Date.now() + 4000;
    const THROTTLE_MS = 150;

    function schedule() {
        if (pending) return;
        pending = true;
        const minGap = Date.now() < FAST_UNTIL ? 0 : THROTTLE_MS;
        const wait = Math.max(0, minGap - (Date.now() - lastRun));
        clearTimeout(timer);
        timer = setTimeout(function () {
            pending = false;
            lastRun = Date.now();
            runPass();
        }, wait);
    }

    new MutationObserver(schedule).observe(document.documentElement, { childList: true, subtree: true });
    /* Atmeretezeskor nullarol merunk ujra (igy a sav vissza is tud szukulni),
       de meg ugyanabban a korben - az ablak ugyis atrendezodik, kulon
       ugralas nem latszik. */
    window.addEventListener('resize', function () { minGutter = 0; needRecheck = true; schedule(); });
    document.addEventListener('DOMContentLoaded', schedule);
    window.addEventListener('load', schedule);
    window.addEventListener('pagehide', function () { saveCache(gridClass, trackCount); });
    schedule();
})();