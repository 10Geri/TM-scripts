// ==UserScript==
// @name         TikTok
// @namespace    https://www.tiktok.com/
// @version      1.0
// @description
// @author       10Geri
// @match        https://www.tiktok.com/*
// @run-at       document-start
// @grant        none
// @noframes
// ==/UserScript==

(function () {
    'use strict';

    const NAV_PRE   = 'ttc-nav-pre';      // bal oldalsáv: átmeneti szélesség-zár betöltéskor
    const RIGHT_OFF = 'ttc-right-off';    // jobb oldali panel: rejtve
    const ANIM      = 'ttc-anim';         // animáció csak az első festés UTÁN
    const COLLAPSED_NAV_WIDTH = 72;       // a TikTok összecsukott oldalsávjának szélessége
    const NAV_FALLBACK_MS = 5000;         // biztonsági időkorlát, ha a gomb sosem jelenik meg

    const root = document.documentElement;

    /* ------------------------------------------------------------------
     * 1) Stílusok – MÉG az első festés előtt, hogy ne ugráljon az oldal
     * ------------------------------------------------------------------ */
    root.classList.add(NAV_PRE, RIGHT_OFF);

    const style = document.createElement('style');
    style.textContent = `
        /* A bal oldalsáv már az első pixeltől összecsukott szélességű,
           a tartalma pedig rejtve, amíg a valódi gombnyomás meg nem történik. */
        html.${NAV_PRE} [class*="DivSideNavPlaceholderContainer"],
        html.${NAV_PRE} [class*="DivSideNavContainer"] {
            width: ${COLLAPSED_NAV_WIDTH}px !important;
            min-width: ${COLLAPSED_NAV_WIDTH}px !important;
            max-width: ${COLLAPSED_NAV_WIDTH}px !important;
            overflow: hidden !important;
            transition: none !important;
        }
        html.${NAV_PRE} [class*="DivSideNavContainer"] > * {
            opacity: 0 !important;
        }
        [class*="DivSideNavContainer"] > * {
            transition: opacity .15s ease;
        }

        /* Jobb oldali javaslat-/hozzászólás-panel */
        html.${RIGHT_OFF} [class*="DivVideoListTabBarWrapper"] {
            display: none !important;
        }

        /* A jobb felső sarok gombsora (nyelv, alkalmazás, Bejelentkezés)
           a panellel együtt csúszik ki a képernyő jobb szélén. */
        html.${RIGHT_OFF} [class*="DivFixedTopContainer"] {
            transform: translateX(140%) !important;
            opacity: 0 !important;
            pointer-events: none !important;
        }
        /* Az animáció csak az első festés után kapcsol be, hogy betöltéskor
           ne lássuk kicsúszni – akkor már eleve kint van. */
        html.${ANIM} [class*="DivFixedTopContainer"] {
            transition: transform .22s ease, opacity .22s ease;
        }

        /* Saját összecsukó gomb a jobb oldali panelhez */
        #ttc-right-toggle {
            position: fixed;
            top: 112px;
            right: 0;
            z-index: 1000;
            display: none;
            align-items: center;
            justify-content: center;
            width: 26px;
            height: 44px;
            padding: 0;
            border: 0;
            border-radius: 8px 0 0 8px;
            cursor: pointer;
            opacity: .5;
            color: var(--ui-text-2, rgba(22, 24, 35, .75));
            background: var(--ui-fill-3, rgba(22, 24, 35, .06));
            transition: opacity .15s ease, background .15s ease;
        }
        #ttc-right-toggle.ttc-visible { display: flex; }
        #ttc-right-toggle:hover { opacity: 1; }
        #ttc-right-toggle svg { width: 16px; height: 16px; display: block; }
    `;

    (document.head || root).appendChild(style);

    /* ------------------------------------------------------------------
     * 2) Segédfüggvény: várakozás egy elemre
     * ------------------------------------------------------------------ */
    function waitFor(selector, timeout, cb) {
        const found = document.querySelector(selector);
        if (found) { cb(found); return; }

        let done = false;
        const observer = new MutationObserver(() => {
            const el = document.querySelector(selector);
            if (el && !done) {
                done = true;
                observer.disconnect();
                clearTimeout(timer);
                cb(el);
            }
        });
        const timer = setTimeout(() => {
            if (done) return;
            done = true;
            observer.disconnect();
            cb(null);
        }, timeout);

        const start = () => observer.observe(root, { childList: true, subtree: true });
        if (document.body) start(); else document.addEventListener('DOMContentLoaded', start, { once: true });
    }

    /* ------------------------------------------------------------------
     * 3) Bal oldalsáv: a TikTok saját összecsukó gombjának megnyomása
     * ------------------------------------------------------------------ */
    function releaseNavLock() {
        root.classList.remove(NAV_PRE);
    }

    function collapseSideNav() {
        waitFor('div[class*="DivToggleTrigger"]', NAV_FALLBACK_MS, (trigger) => {
            if (!trigger) { releaseNavLock(); return; }

            const placeholder = document.querySelector('[class*="DivSideNavPlaceholderContainer"]');

            // Ha valamiért már összecsukott állapotban van, nem kattintunk rá újra.
            const isExpanded = !placeholder ||
                placeholder.getBoundingClientRect().width > COLLAPSED_NAV_WIDTH + 10 ||
                root.classList.contains(NAV_PRE);

            if (isExpanded) trigger.click();

            // Egy képkockával később engedjük el a zárat, hogy a React
            // már a végleges (összecsukott) állapotot rajzolja ki.
            requestAnimationFrame(() => requestAnimationFrame(releaseNavLock));
        });
    }

    /* ------------------------------------------------------------------
     * 4) Jobb oldali panel: saját összecsukó gomb (betöltéskor "megnyomva")
     * ------------------------------------------------------------------ */
    const ICON_LEFT  = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.4" stroke-linecap="round" stroke-linejoin="round"><polyline points="15 5 8 12 15 19"></polyline></svg>';
    const ICON_RIGHT = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.4" stroke-linecap="round" stroke-linejoin="round"><polyline points="9 5 16 12 9 19"></polyline></svg>';

    let toggleButton = null;

    function syncToggleButton() {
        if (!toggleButton) return;
        const hidden = root.classList.contains(RIGHT_OFF);
        toggleButton.innerHTML = hidden ? ICON_LEFT : ICON_RIGHT;
        toggleButton.title = hidden ? 'Javaslatok megjelenítése' : 'Javaslatok összecsukása';
        toggleButton.setAttribute('aria-label', toggleButton.title);
        toggleButton.setAttribute('aria-expanded', hidden ? 'false' : 'true');
    }

    function createToggleButton() {
        if (toggleButton || !document.body) return;

        toggleButton = document.createElement('button');
        toggleButton.id = 'ttc-right-toggle';
        toggleButton.type = 'button';
        toggleButton.addEventListener('click', (e) => {
            e.preventDefault();
            e.stopPropagation();
            root.classList.toggle(RIGHT_OFF);
            syncToggleButton();
        });

        document.body.appendChild(toggleButton);
        syncToggleButton();
    }

    // A gomb csak ott látszik, ahol van jobb oldali panel (videó-oldalak).
    function refreshToggleVisibility() {
        if (!toggleButton) return;
        const hasPanel = !!document.querySelector('[class*="DivVideoListTabBarWrapper"], [class*="DivVideoDetailContainer"]');
        toggleButton.classList.toggle('ttc-visible', hasPanel);
    }

    /* ------------------------------------------------------------------
     * 5) Indítás
     * ------------------------------------------------------------------ */
    function init() {
        createToggleButton();
        refreshToggleVisibility();

        // Innentől kaphat animációt a jobb felső gombsor.
        requestAnimationFrame(() => requestAnimationFrame(() => root.classList.add(ANIM)));

        // SPA-navigáció: figyeljük, hogy megjelenik-e / eltűnik-e a panel.
        let scheduled = false;
        new MutationObserver(() => {
            if (scheduled) return;
            scheduled = true;
            requestAnimationFrame(() => {
                scheduled = false;
                refreshToggleVisibility();
            });
        }).observe(root, { childList: true, subtree: true });
    }

    collapseSideNav();

    if (document.body) init();
    else document.addEventListener('DOMContentLoaded', init, { once: true });
})();