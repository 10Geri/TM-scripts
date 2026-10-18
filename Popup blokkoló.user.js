// ==UserScript==
// @name         Popup blokkoló
// @namespace    Claude
// @version      1.0
// @description
// @author       10Geri
// @match        *://*.voe.sx/*
// @match        *://voe.sx/*
// @match        *://*.vidara.to/*
// @match        *://vidara.to/*
// @match        *://*.mxdrop.top/*
// @match        *://mxdrop.top/*
// @match        *://*.mixdrop.top/*
// @match        *://mixdrop.top/*
// @match        *://*.mixdrop.co/*
// @match        *://mixdrop.co/*
// @match        *://*.vinovo.to/*
// @match        *://vinovo.to/*
// @match        *://*.luluvido.com/*
// @match        *://luluvido.com/*
// @match        *://*.playmogo.com/*
// @match        *://playmogo.com/*
// @match        *://*.hxfile.co/*
// @match        *://hxfile.co/*
// @match        *://*.bysesayeveum.com/*
// @match        *://bysesayeveum.com/*
// @match        *://*.bysetayico.com/*
// @match        *://bysetayico.com/*
// @match        *://*.katfile.biz/*
// @match        *://katfile.biz/*
// @match        *://*.uploady.io/*
// @match        *://uploady.io/*
// @match        *://*.vidmoly.me/*
// @match        *://vidmoly.me/*
// @match        *://*.vidmoly.org/*
// @match        *://vidmoly.org/*
// @match        *://*.vidmoly.to/*
// @match        *://vidmoly.to/*
// @match        *://*.firestream.to/*
// @match        *://firestream.to/*
// @match        *://*.frdl.io/*
// @match        *://frdl.io/*
// @match        *://*.morencius.com/*
// @match        *://morencius.com/*
// @match        *://*.savefiles.com/*
// @match        *://savefiles.com/*
// @match        *://vidstore.me/*
// @match        *://*.vidstore.me/*
// @match        *://videa.hu/*
// @match        *://*.videa.hu/*
// @match        *://filelions.to/*
// @match        *://*.filelions.to/*
// @match        *://streamwish.to/*
// @match        *://*.streamwish.to/*
// @match        *://lulustream.com/*
// @match        *://*.lulustream.com/*
// @match        *://dood.stream/*
// @match        *://*.dood.stream/*
// @match        *://hdmozi.hu/*
// @match        *://*.hdmozi.hu/*
// @match        *://photos.app.goo.gl/*
// @match        *://teresapoliticallearn.com/*
// @match        *://*.teresapoliticallearn.com/*
// @run-at       document-start
// @all-frames   true
// @grant        none
// ==/UserScript==

(function () {
    'use strict';

    /* ------------------------------------------------------------------
     *  Új domain felvétele: írj hozzá két @match sort a fejléchez
     *  (pl. *://pelda.com/* és *://*.pelda.com/*), és vedd fel a
     *  PLAYER_HOSTS listába is.
     * ------------------------------------------------------------------ */
    const PLAYER_HOSTS = [
        'voe.sx',
        'vidara.to',
        'mxdrop.top',
        'mixdrop.top',
        'mixdrop.co',
        'vinovo.to',
        'luluvido.com',
        'playmogo.com',
        'hxfile.co',
        'bysesayeveum.com',
        'bysetayico.com',
        'katfile.biz',
        'uploady.io',
        'vidmoly.me',
        'vidmoly.org',
        'vidmoly.to',
        'firestream.to',
        'frdl.io',
        'morencius.com',
        'savefiles.com',
        'vidstore.me',
        'videa.hu',
        'filelions.to',
        'streamwish.to',
        'lulustream.com',
        'dood.stream',
        'hdmozi.hu',
        'photos.app.goo.gl',
        'teresapoliticallearn.com'
    ];

    // true  = a target="_blank" linkek is blokkolva lesznek
    // false = csak a window.open hívások
    const BLOCK_BLANK_LINKS = true;

    const DEBUG = false;

    const hostMatches = (host) => {
        if (!host) return false;
        host = String(host).toLowerCase().replace(/^www\./, '');
        return PLAYER_HOSTS.some(d => host === d || host.endsWith('.' + d));
    };

    const hostOf = (url) => {
        try { return new URL(url).hostname; } catch (e) { return ''; }
    };

    const log = (...a) => { if (DEBUG) console.log('[Popup blokkoló]', ...a); };

    /* ------------------------------------------------------------------
     * 1) ÖNBEZÁRÁS – ha ezt az ablakot egy másik player oldal nyitotta,
     *    azonnal bezárjuk. Nincs késleltetés, document-start pillanat.
     * ------------------------------------------------------------------ */
    if (window.top === window.self && window.opener) {
        const refHost = hostOf(document.referrer);
        if (hostMatches(refHost)) {
            log('popup bezárása:', location.href, '| nyitó:', refHost);
            try { window.stop(); } catch (e) {}
            try { window.close(); } catch (e) {}
            try {
                if (!window.closed) {
                    window.location.replace('about:blank');
                    window.close();
                }
            } catch (e) {}
            return;
        }
    }

    /* ------------------------------------------------------------------
     * 2) MEGELŐZÉS – itt meg sem nyílik az új ablak
     * ------------------------------------------------------------------ */

    // --- 2/a: hamis ablak-objektum, hogy az oldal scriptje ne hibázzon ---
    const makeFakeWindow = () => {
        const noop = function () { return null; };
        const fakeDoc = {
            write: noop, writeln: noop, open: noop, close: noop,
            createElement: () => ({ style: {}, setAttribute: noop, appendChild: noop }),
            body: null, documentElement: null,
            location: { href: 'about:blank', replace: noop, assign: noop }
        };
        const target = {
            closed: true,
            opener: null,
            name: '',
            document: fakeDoc,
            location: { href: 'about:blank', replace: noop, assign: noop, reload: noop, toString: () => 'about:blank' },
            close: noop, focus: noop, blur: noop, print: noop, stop: noop,
            postMessage: noop, addEventListener: noop, removeEventListener: noop,
            alert: noop, confirm: () => false, prompt: () => null,
            moveTo: noop, resizeTo: noop, scrollTo: noop,
            open: () => makeFakeWindow()
        };
        return new Proxy(target, {
            get(t, p) {
                if (p in t) return t[p];
                if (p === Symbol.toPrimitive || p === 'toString') return () => '[object Window]';
                if (p === 'self' || p === 'window' || p === 'top' || p === 'parent' || p === 'frames') return undefined;
                return noop;
            },
            set() { return true; },
            has() { return true; }
        });
    };

    // --- 2/b: window.open kiiktatása ---
    const blockedOpen = function (url) {
        log('window.open blokkolva:', url);
        return makeFakeWindow();
    };
    try {
        Object.defineProperty(window, 'open', {
            value: blockedOpen,
            writable: false,
            configurable: false
        });
    } catch (e) {
        try { window.open = blockedOpen; } catch (e2) {}
    }

    // --- 2/c: programozott a.click() target="_blank"-kel ---
    try {
        const nativeClick = HTMLElement.prototype.click;
        HTMLElement.prototype.click = function () {
            if (this instanceof HTMLAnchorElement && /^_blank$/i.test(this.target || '')) {
                log('programozott _blank kattintás blokkolva:', this.href);
                return;
            }
            return nativeClick.apply(this, arguments);
        };
    } catch (e) {}

    // --- 2/d: form submit új ablakba ---
    try {
        const nativeSubmit = HTMLFormElement.prototype.submit;
        HTMLFormElement.prototype.submit = function () {
            if (/^_blank$/i.test(this.target || '')) {
                log('form submit _blank blokkolva');
                return;
            }
            return nativeSubmit.apply(this, arguments);
        };
    } catch (e) {}

    document.addEventListener('submit', function (e) {
        const f = e.target;
        if (f && /^_blank$/i.test(f.target || '')) {
            e.preventDefault();
            e.stopImmediatePropagation();
            log('submit esemény blokkolva');
        }
    }, true);

    // --- 2/e: valódi kattintások, amik új fület nyitnának ---
    if (BLOCK_BLANK_LINKS) {
        const clickGuard = function (e) {
            // Ctrl / Cmd / Shift / középső gomb: szándékos új fül -> engedjük
            if (e.ctrlKey || e.metaKey || e.shiftKey || e.button === 1) return;

            const a = e.target && e.target.closest ? e.target.closest('a[target], area[target]') : null;
            if (!a) return;
            if (!/^_blank$/i.test(a.target || '')) return;

            const href = a.getAttribute('href') || '';
            if (!href || href.startsWith('#') || /^javascript:/i.test(href)) return;

            e.preventDefault();
            e.stopImmediatePropagation();
            log('_blank link blokkolva:', href);
        };
        ['pointerdown', 'mousedown', 'click', 'auxclick'].forEach(t =>
            document.addEventListener(t, clickGuard, true)
        );
    }

    // --- 2/f: <base target="_blank"> semlegesítése ---
    const fixBase = () => {
        document.querySelectorAll('base[target]').forEach(b => {
            if (/^_blank$/i.test(b.target)) b.removeAttribute('target');
        });
    };
    try {
        new MutationObserver(fixBase).observe(document.documentElement || document, {
            childList: true, subtree: true
        });
    } catch (e) {}
    document.addEventListener('DOMContentLoaded', fixBase, true);

    // --- 2/g: beforeunload-alapú "maradj itt" trükk kiiktatása ---
    try {
        Object.defineProperty(window, 'onbeforeunload', {
            get: () => null,
            set: () => {},
            configurable: false
        });
    } catch (e) {}
})();