// ==UserScript==
// @name         Popup blocker
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
// @match        *://ok.ru/videoembed/*
// @match        *://*.ok.ru/videoembed/*
// @match        *://rpmstream.live/*
// @match        *://*.rpmstream.live/*
// @match        *://abyssplayer.com/*
// @match        *://*.abyssplayer.com/*
// @match        *://byseraguci.com/*
// @match        *://*.byseraguci.com/*
// @match        *://gobsao8u.com/*
// @match        *://*.gobsao8u.com/*
// @match        *://sorozatom.online/*
// @match        *://*.sorozatom.online/*
// @match        *://*/e/*
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
        'teresapoliticallearn.com',
        'gobsao8u.com',
        'sorozatom.online',
        'abyssplayer.com',
        'byseraguci.com'
    ];

    // true  = a target="_blank" linkek is blokkolva lesznek
    // false = csak a window.open hívások
    const BLOCK_BLANK_LINKS = true;

    const DEBUG = false;

    // Ezzel a jelöléssel tölti be a hdmozi rész a rejtett ok.ru keretet
    const OKRU_EXTRACT_HASH = 'hdmozi-extract';

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
     * 0) OK.RU – a rejtett keretben kiolvassuk a videó közvetlen
     *    linkjeit, és visszaküldjük a hdmozi oldalnak. Máshol az ok.ru
     *    beágyazást nem bántjuk.
     * ------------------------------------------------------------------ */
    if (/(^|\.)ok\.ru$/i.test(location.hostname)) {
        if (window.top !== window.self && location.hash.indexOf(OKRU_EXTRACT_HASH) !== -1) {
            okruExtract();
        }
        return;
    }

    function okruExtract() {
        let parentOrigin = '';
        try { parentOrigin = new URL(document.referrer).origin; } catch (e) {}
        if (!/^https?:\/\/([a-z0-9-]+\.)*hdmozi\.hu$/i.test(parentOrigin)) return;

        let done = false;
        const send = (data) => {
            if (done) return;
            done = true;
            try { window.parent.postMessage(Object.assign({ hdmoziPlain: 1 }, data), parentOrigin); } catch (e) {}
        };

        const tryRead = () => {
            const el = document.querySelector('[data-options]');
            if (!el) return false;
            try {
                const o = JSON.parse(el.getAttribute('data-options'));
                let m = o && o.flashvars && o.flashvars.metadata;
                if (typeof m === 'string') m = JSON.parse(m);
                if (!m) throw new Error('nincs metadata');
                send({
                    videos: (m.videos || [])
                        .filter(v => v && v.url)
                        .map(v => ({ name: String(v.name || ''), url: String(v.url) })),
                    hls: String(m.hlsManifestUrl || m.ondemandHls || ''),
                    poster: String((m.movie && m.movie.poster) || '')
                });
            } catch (e) {
                send({ error: 'Az ok.ru adatai nem olvashatók.' });
            }
            // a lejátszót már nem kell betölteni
            try { window.stop(); } catch (e) {}
            return true;
        };

        if (tryRead()) return;
        const mo = new MutationObserver(() => { if (tryRead()) mo.disconnect(); });
        mo.observe(document, { childList: true, subtree: true });
        document.addEventListener('DOMContentLoaded', () => {
            mo.disconnect();
            if (!tryRead()) send({ error: 'A videó nem érhető el ezen a forráson.' });
        });
    }

    /* ------------------------------------------------------------------
     * 0/b) RPMSHARE (rpmstream.live) – a rejtett keretben lekérjük a
     *      fájl valódi címét, és visszaküldjük a hdmozi oldalnak.
     * ------------------------------------------------------------------ */
    if (/(^|\.)rpmstream\.live$/i.test(location.hostname) &&
        window.top !== window.self && location.hash.indexOf(OKRU_EXTRACT_HASH) !== -1) {
        rpmExtract();
        return;
    }

    function rpmExtract() {
        let parentOrigin = '';
        try { parentOrigin = new URL(document.referrer).origin; } catch (e) {}
        if (!/^https?:\/\/([a-z0-9-]+\.)*hdmozi\.hu$/i.test(parentOrigin)) return;
        // a saját lejátszójuk ne induljon el (és ne irányítson tovább)
        try { window.stop(); } catch (e) {}
        const send = (data) => {
            try { window.parent.postMessage(Object.assign({ hdmoziPlain: 1 }, data), parentOrigin); } catch (e) {}
        };
        const id = location.hash.replace(/^#/, '').split('&')[0].trim();
        const NOT_FOUND = 'Ez a forrás jelenleg nem elérhető – a tárhely szerint a videó nem található.';
        if (!id) { send({ error: NOT_FOUND }); return; }
        fetch('/api/public/resolve?file1=' + encodeURIComponent(id), { credentials: 'include' })
            .then(r => r.ok ? r.json() : null)
            .then(j => send(j && j.url ? { url: String(j.url) } : { error: NOT_FOUND }))
            .catch(() => send({ error: NOT_FOUND }));
    }

    /* ------------------------------------------------------------------
     * Hol fusson? A listás domaineken, ÉS minden olyan beágyazott
     * lejátszóban (pl. vidara.to -> gobsao8u.com/e/...), amit egy listás
     * oldal tölt be – ezek domainje gyakran változik. A „*://*\/e/*”
     * @match miatt más oldalakon a script itt azonnal kilép.
     * ------------------------------------------------------------------ */
    const inPlayerFrame = (() => {
        if (window.top === window.self) return false;
        try {
            const ao = location.ancestorOrigins;
            if (ao && ao.length) return Array.from(ao).some(o => hostMatches(hostOf(o)));
        } catch (e) {}
        return hostMatches(hostOf(document.referrer));
    })();
    if (!hostMatches(location.hostname) && !inPlayerFrame) return;

    /* ------------------------------------------------------------------
     * „SANDBOXED IFRAME” HAMIS RIASZTÁS – egyes lejátszók (pl. morencius)
     * a blokkoló miatt sandboxnak hiszik a keretet, és átirányítanak a
     * /sandboxed.html oldalra. Ezt az átirányítást nem engedjük.
     * ------------------------------------------------------------------ */
    if (window.top !== window.self) {
        try {
            const nativeTimeout = window.setTimeout;
            const fnSrc = Function.prototype.toString;
            window.setTimeout = function (fn) {
                try {
                    if (typeof fn === 'function' && fnSrc.call(fn).indexOf('sandboxed.html') !== -1) {
                        log('sandbox-átirányítás tiltva');
                        return 0;
                    }
                } catch (e) {}
                return nativeTimeout.apply(this, arguments);
            };
        } catch (e) {}
    }

    /* ------------------------------------------------------------------
     * VIDEA – a hdmozi rejtett keretben tölti be a videa lejátszót; innen
     * kiolvassuk a videó közvetlen (mp4/webm) linkjeit, és visszaküldjük,
     * hogy a hdmozi oldalon sima <video>-ban játszódjon le.
     * Ha a „?v=…” azonosítóval a videó nem ágyazható be, a videa saját
     * „?f=…” azonosítójával kérjük le (azzal megy).
     * ------------------------------------------------------------------ */
    const IS_VIDEA_FRAME = /(^|\.)videa\.hu$/i.test(location.hostname) &&
        window.top !== window.self && location.pathname === '/player';
    if (IS_VIDEA_FRAME) {
        if (location.hash.indexOf(OKRU_EXTRACT_HASH) !== -1) videaExtract();
        else videaFix();
    }

    // a videa lejátszó adatai (XML) – a videa saját titkosítását visszafejtve
    async function videaInfo(params) {
        const SEC = 'xHb0ZvME5q8CBcoQi6AngerDu3FGO9fkUlwPmLVY_RTzj2hJIS4NasXWKy1td7p';
        const qs = new URLSearchParams(params).toString();
        const html = await (await fetch('/player?' + qs, { credentials: 'include' })).text();
        const m = html.match(/_xt\s*=\s*"([^"]+)"/);
        if (!m) throw new Error('nincs nonce');
        const l = m[1].slice(0, 32), s = m[1].slice(32);
        let key = '';
        for (let i = 0; i < 32; i++) {
            let idx = i - (SEC.indexOf(l[i]) - 31);
            if (idx < 0) idx += s.length;
            key += s[idx];
        }
        const seed = Math.random().toString(36).slice(2, 10);
        const r = await fetch('/player/xml?' + new URLSearchParams(Object.assign({ platform: 'desktop' }, params, {
            _s: seed, _t: key.slice(0, 16), start: '0'
        })), { credentials: 'include' });
        let xml = await r.text();
        if (!xml.startsWith('<?xml')) {
            // RC4 visszafejtés
            const k = key.slice(16) + seed + (r.headers.get('x-videa-xs') || '');
            const data = atob(xml);
            const S = Array.from({ length: 256 }, (_, i) => i);
            let j = 0;
            for (let i = 0; i < 256; i++) {
                j = (j + S[i] + k.charCodeAt(i % k.length)) % 256;
                [S[i], S[j]] = [S[j], S[i]];
            }
            const out = new Uint8Array(data.length);
            let a = 0; j = 0;
            for (let n = 0; n < data.length; n++) {
                a = (a + 1) % 256;
                j = (j + S[a]) % 256;
                [S[a], S[j]] = [S[j], S[a]];
                out[n] = data.charCodeAt(n) ^ S[(S[a] + S[j]) % 256];
            }
            xml = new TextDecoder().decode(out);
        }
        return new DOMParser().parseFromString(xml, 'text/xml');
    }

    // „?v=…” nem beágyazható -> a videa „?f=…” azonosítója (vagy '')
    async function videaFId(d) {
        const err = d.querySelector('error');
        if (!err || d.querySelector('video_sources')) return '';
        const page = (err.textContent || '').trim();
        if (!/^https?:\/\/([a-z0-9-]+\.)*videa\.hu\//i.test(page)) return '';
        const ph = await (await fetch(page, { credentials: 'include' })).text();
        const fm = ph.match(/player\?f=([0-9.]+)/);
        return fm ? fm[1] : '';
    }

    // látható keret: ha kell, átváltunk a „?f=…” lejátszóra
    async function videaFix() {
        try {
            const sp = new URLSearchParams(location.search);
            if (!sp.get('v') || sp.get('f')) return;
            const f = await videaFId(await videaInfo({ v: sp.get('v'), lang: 'hu' }));
            if (f) location.replace('/player?f=' + f + '&lang=hu');
        } catch (e) { log('videa hiba', e); }
    }

    // rejtett keret: közvetlen linkek visszaküldése a hdmozi oldalnak
    async function videaExtract() {
        let parentOrigin = '';
        try {
            const ao = location.ancestorOrigins;
            parentOrigin = ao && ao.length ? ao[0] : new URL(document.referrer).origin;
        } catch (e) {}
        if (!/^https?:\/\/([a-z0-9-]+\.)*hdmozi\.hu$/i.test(parentOrigin)) return;
        // a videa saját lejátszója itt nem kell
        try { window.stop(); } catch (e) {}
        const send = (data) => {
            try { window.parent.postMessage(Object.assign({ hdmoziPlain: 1 }, data), parentOrigin); } catch (e) {}
        };
        try {
            const sp = new URLSearchParams(location.search);
            const base = sp.get('f') ? { f: sp.get('f') } : { v: sp.get('v') };
            let d = await videaInfo(Object.assign({}, base, { lang: 'hu' }));
            if (!d.querySelector('video_sources')) {
                const f = await videaFId(d);
                if (f) d = await videaInfo({ f, lang: 'hu' });
            }
            const probe = document.createElement('video');
            const hv = d.querySelector('hash_values');
            const videos = Array.from(d.querySelectorAll('video_sources > video_source')).map(x => {
                const name = x.getAttribute('name') || '';
                const text = (x.textContent || '').trim();
                if (!name || !text) return null;
                const mime = x.getAttribute('mimetype') || 'video/mp4';
                const codecs = x.getAttribute('codecs');
                if (!probe.canPlayType(mime + (codecs ? '; codecs="' + codecs + '"' : ''))) return null;
                const u = new URL(text, 'https://videa.hu/');
                const h = hv && hv.querySelector('hash_value_' + name);
                const exp = x.getAttribute('exp');
                if (h && exp) {
                    u.searchParams.set('md5', h.textContent.trim());
                    u.searchParams.set('expires', exp);
                }
                return { name, url: u.href, h: parseInt(x.getAttribute('height'), 10) || parseInt(name, 10) || 0 };
            }).filter(Boolean).sort((a, b) => b.h - a.h).map(({ name, url }) => ({ name, url, type: 'mp4' }));
            const ps = d.querySelector('poster_src');
            const poster = ps && ps.textContent.trim() ? new URL(ps.textContent.trim(), 'https://videa.hu/').href : '';
            send(videos.length ? { videos, poster } : { error: 'videa: nincs lejátszható forrás' });
        } catch (e) {
            send({ error: 'videa: ' + e.message });
        }
    }

    /* ------------------------------------------------------------------
     * JWPLAYER-ES LEJÁTSZÓK (morencius, streamwish, filelions…) – a hdmozi
     * rejtett keretben tölti be őket; kiolvassuk a videó közvetlen linkjét,
     * hogy a hdmozi oldalon sima <video>-ban játszódjon le.
     * ------------------------------------------------------------------ */
    if (window.top !== window.self && location.hash.indexOf(OKRU_EXTRACT_HASH) !== -1 && !IS_VIDEA_FRAME) {
        jwExtract();
    }

    function jwExtract() {
        let parentOrigin = '';
        try {
            const ao = location.ancestorOrigins;
            parentOrigin = ao && ao.length ? ao[0] : new URL(document.referrer).origin;
        } catch (e) {}
        if (!/^https?:\/\/([a-z0-9-]+\.)*hdmozi\.hu$/i.test(parentOrigin)) return;

        let done = false;
        const send = (data) => {
            if (done) return;
            done = true;
            try { window.parent.postMessage(Object.assign({ hdmoziPlain: 1 }, data), parentOrigin); } catch (e) {}
        };
        const started = Date.now();
        const tick = () => {
            if (done) return;
            try {
                const jw = window.jwplayer && window.jwplayer();
                const item = jw && jw.getPlaylistItem && jw.getPlaylistItem();
                const srcs = item && (item.sources || (item.file ? [{ file: item.file }] : []));
                if (srcs && srcs.length) {
                    const videos = srcs.filter(s => s && s.file).map(s => ({
                        name: String(s.label || ''),
                        url: new URL(String(s.file), location.href).href,
                        type: String(s.type || '')
                    }));
                    if (videos.length) {
                        try { jw.stop(); jw.setMute(true); } catch (e) {}
                        send({ videos, poster: item.image ? new URL(String(item.image), location.href).href : '' });
                        return;
                    }
                }
            } catch (e) {}
            const el = Date.now() - started;
            // nincs jwplayer az oldalon -> gyorsan feladjuk, ne várjon feleslegesen
            if (el > 12000 || (el > 3000 && document.readyState === 'complete' && !window.jwplayer)) {
                send({ error: 'nincs jwplayer' });
                return;
            }
            setTimeout(tick, 250);
        };
        tick();
    }

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
     * HDMOZI FILM- ÉS SOROZATRÉSZ-OLDAL – az oldal marad, csak a videó
     * helyére (pontosan az eredeti lejátszó helyére és méretére) kerül
     * egy sima <video>. Az oldal saját forráslistája (alul) is ezt a
     * lejátszót vezérli. A külső reklámscriptek nem töltődnek be.
     * Eredeti lejátszó: a sáv „Eredeti lejátszó” linkje (#eredeti).
     * ------------------------------------------------------------------ */
    if (/(^|\.)hdmozi\.hu$/i.test(location.hostname) &&
        window.top === window.self &&
        /^\/(movies|episodes)\/[^/]+/i.test(location.pathname) &&
        location.hash !== '#eredeti') {
        hdmoziPlain();
    }

    function hdmoziPlain() {
        const pageUrl = location.href.split('#')[0];

        // --- külső reklámscriptek tiltása (popupok, adblock-nyaggatás) ---
        const SCRIPT_OK = ['hdmozi.hu', 'google-analytics.com', 'googletagmanager.com',
            'cloudflareinsights.com', 'gstatic.com', 'googleapis.com', 'cdnjs.cloudflare.com', 'jsdelivr.net'];
        const scriptOk = (src) => {
            let h = '';
            try { h = new URL(src, location.href).hostname.toLowerCase(); } catch (e) { return true; }
            return SCRIPT_OK.some(d => h === d || h.endsWith('.' + d));
        };
        try {
            const d = Object.getOwnPropertyDescriptor(HTMLScriptElement.prototype, 'src');
            Object.defineProperty(HTMLScriptElement.prototype, 'src', {
                configurable: true,
                get() { return d.get.call(this); },
                set(v) {
                    if (!scriptOk(String(v))) { log('script tiltva:', v); this.type = 'javascript/blocked'; }
                    d.set.call(this, v);
                }
            });
        } catch (e) {}

        const QUALITY = [
            ['auto', 'Auto'], ['ultra', '2160p'], ['quad', '1440p'], ['full', '1080p'], ['hd', '720p'],
            ['sd', '480p'], ['low', '360p'], ['lowest', '240p'], ['mobile', '144p']
        ];
        const qRank = (n) => { const i = QUALITY.findIndex(q => q[0] === n); return i < 0 ? 99 : i; };
        const qLabel = (n) => { const q = QUALITY.find(x => x[0] === n); return q ? q[1] : (n || 'videó'); };

        // --- stílus azonnal: az eredeti lejátszó el sem jelenik, nincs ugrálás ---
        const css = document.createElement('style');
        css.textContent =
            '#fakeplayer,#playcontainer{display:none!important}' +
            // az eredeti #fakeplayer mérete: 20px keret + 55%-os arányú belső doboz
            '#hp-wrap{padding:20px;box-sizing:border-box;width:100%}' +
            '#hp-bar{height:36px;box-sizing:border-box;margin:0 0 10px;padding:0 10px;display:flex;align-items:center;gap:12px;' +
            'background:#111;border-radius:4px;white-space:nowrap;overflow:hidden;font:13px/1 system-ui,sans-serif;color:#ccc}' +
            '#hp-src,#hp-q{display:flex;gap:4px;flex:0 0 auto}' +
            '#hp-bar button{font:inherit;font-size:12px;color:#ccc;background:#222;border:1px solid #333;border-radius:4px;padding:3px 8px;margin:0;cursor:pointer;line-height:1.2}' +
            '#hp-bar button.on{color:#fff;background:#444;border-color:#666}' +
            '#hp-orig{margin-left:auto;color:#888!important;font-size:12px;flex:0 0 auto}' +
            '#hp-box{position:relative;width:100%;height:0;padding-bottom:55%;background:#000}' +
            '#hp-box video,#hp-box iframe{position:absolute;top:0;left:0;width:100%;height:100%;border:0;background:#000;display:block}' +
            '#hp-msg{position:absolute;inset:0;display:flex;align-items:center;justify-content:center;padding:20px;' +
            'text-align:center;color:#ccc;font:14px/1.3 system-ui,sans-serif;pointer-events:none}';
        (document.head || document.documentElement || document).appendChild(css);

        const wrap = document.createElement('div');
        wrap.id = 'hp-wrap';
        wrap.innerHTML =
            '<div id="hp-bar"><span id="hp-src"></span><span id="hp-q"></span>' +
            '<a id="hp-orig" href="#eredeti">Eredeti lejátszó</a></div>' +
            '<div id="hp-box"><video id="hp-video" controls preload="metadata" playsinline></video>' +
            '<div id="hp-msg">Betöltés…</div></div>';
        const q = (sel) => wrap.querySelector(sel);
        const srcBox = q('#hp-src'), qBox = q('#hp-q'), box = q('#hp-box'), video = q('#hp-video'), msgEl = q('#hp-msg');

        // beszúrás az eredeti lejátszó helyére, amint az megjelenik
        const place = () => {
            if (wrap.isConnected) return true;
            const fp = document.getElementById('fakeplayer');
            if (!fp || !fp.parentNode) return false;
            fp.parentNode.insertBefore(wrap, fp);
            return true;
        };
        // az oldal saját lejátszója ne töltődjön be a háttérben
        const emptyResponse = () => {
            const r = document.getElementById('dooplay_player_response');
            if (r && r.firstChild) r.textContent = '';
        };
        const domObs = new MutationObserver((ms) => {
            place();
            emptyResponse();
            for (const m of ms) for (const n of m.addedNodes) {
                if (n.tagName === 'SCRIPT' && n.src && !scriptOk(n.src)) {
                    n.type = 'javascript/blocked';
                    n.remove();
                }
            }
        });
        domObs.observe(document, { childList: true, subtree: true });

        let frameEl = null;
        let token = 0;
        const msg = (t) => { msgEl.textContent = t || ''; msgEl.style.display = t ? '' : 'none'; };

        q('#hp-orig').addEventListener('click', (e) => {
            e.preventDefault();
            history.replaceState(null, '', pageUrl + '#eredeti');
            location.reload();
        });

        video.addEventListener('loadeddata', () => msg(''));
        video.addEventListener('error', () => {
            if (video.getAttribute('src')) msg('A videó nem tölthető be – próbálj másik minőséget vagy forrást.');
        });

        let pagePoster = '';
        const stopVideo = () => {
            video.pause();
            video.removeAttribute('src');
            try { video.load(); } catch (e) {}
        };
        const clearFrame = () => { if (frameEl) { frameEl.remove(); frameEl = null; } };

        const makeBtn = (bx, text, onClick) => {
            const b = document.createElement('button');
            b.type = 'button';
            b.textContent = text;
            b.addEventListener('click', () => {
                bx.querySelectorAll('button').forEach(x => x.classList.remove('on'));
                b.classList.add('on');
                onClick();
            });
            bx.appendChild(b);
            return b;
        };

        // --- videó lejátszása közvetlen linkekből ---
        function showVideo(list, poster) {
            clearFrame();
            video.style.display = '';
            qBox.textContent = '';
            if (poster) video.poster = poster;
            const setSrc = (url) => {
                const t = video.currentTime, wasPlaying = !video.paused, had = !!video.getAttribute('src');
                video.src = url;
                if (had && t > 0) {
                    video.addEventListener('loadedmetadata', () => {
                        video.currentTime = t;
                        if (wasPlaying) video.play().catch(() => {});
                    }, { once: true });
                }
            };
            if (list.length > 1) {
                list.forEach((v, i) => {
                    const b = makeBtn(qBox, qLabel(v.name), () => setSrc(v.url));
                    if (i === 0) b.classList.add('on');
                });
            }
            msg('');
            setSrc(list[0].url);
        }

        // --- nem feldolgozható forrás: sima keret, új ablak nyitása nélkül ---
        function showFrame(url) {
            stopVideo();
            clearFrame();
            qBox.textContent = '';
            video.style.display = 'none';
            msg('');
            frameEl = document.createElement('iframe');
            // NINCS sandbox: a lejátszók (abyss, morencius…) észlelik és nem indulnak.
            // A popupokat a keretben futó saját példányunk blokkolja.
            frameEl.setAttribute('allowfullscreen', '');
            frameEl.setAttribute('allow', 'autoplay; fullscreen; encrypted-media; picture-in-picture');
            frameEl.setAttribute('referrerpolicy', 'origin');
            frameEl.src = url;
            box.insertBefore(frameEl, msgEl);
        }

        // --- ok.ru / rpmshare: rejtett keretben kiolvassuk a közvetlen linkeket ---
        const okruCache = {};
        function okruResolve(url, frameSrc, waitMs) {
            if (okruCache[url]) return okruCache[url];
            okruCache[url] = new Promise((resolve) => {
                const f = document.createElement('iframe');
                f.style.cssText = 'position:absolute;left:-9999px;top:0;width:1px;height:1px;border:0;visibility:hidden';
                f.src = frameSrc || (url.split('#')[0] + '#' + OKRU_EXTRACT_HASH);
                let timer = 0;
                const finish = (res) => {
                    clearTimeout(timer);
                    window.removeEventListener('message', onMsg);
                    f.remove();
                    if (res.error) delete okruCache[url];
                    resolve(res);
                };
                const onMsg = (e) => {
                    if (e.source !== f.contentWindow || !e.data || !e.data.hdmoziPlain) return;
                    finish(e.data);
                };
                window.addEventListener('message', onMsg);
                timer = setTimeout(() => finish({ error: 'A videó tárhelye nem válaszolt.' }), waitMs || 20000);
                document.body.appendChild(f);
            });
            return okruCache[url];
        }

        const kindOf = (url) => {
            if (/\.(mp4|webm|m4v|ogv)(\?|#|$)/i.test(url)) return 'direct';
            if (/\.m3u8(\?|#|$)/i.test(url) && video.canPlayType('application/vnd.apple.mpegurl')) return 'direct';
            if (/^https?:\/\/([a-z0-9-]+\.)*ok\.ru\/videoembed\//i.test(url)) return 'okru';
            if (/^https?:\/\/([a-z0-9-]+\.)*rpmstream\.live\//i.test(url)) return 'rpm';
            return 'frame';
        };

        // keretes lejátszó -> közvetlen linkek (vagy null)
        const extractFailed = {};
        async function extractFrame(src) {
            if (extractFailed[src.url]) return null;
            // ezek nem jwplayeresek, a saját keretük kell
            if (/^https?:\/\/([a-z0-9-]+\.)*(abyssplayer\.com)\//i.test(src.url)) return null;
            const r = await okruResolve(src.url, src.url.split('#')[0] + '#' + OKRU_EXTRACT_HASH, 15000);
            const hlsOk = !!video.canPlayType('application/vnd.apple.mpegurl');
            const list = (r.videos || []).filter(v =>
                /^https?:\/\//i.test(v.url) &&
                ((/hls|m3u8/i.test(v.type) || /\.m3u8(\?|#|$)/i.test(v.url)) ? hlsOk : true));
            if (!list.length) { extractFailed[src.url] = 1; return null; }
            return { list, poster: r.poster };
        }

        // true = sikerült videót mutatni
        async function play(src) {
            const my = ++token;
            if (src.kind === 'direct') { showVideo([{ name: '', url: src.url }], pagePoster); return true; }

            stopVideo();
            clearFrame();
            video.style.display = '';
            qBox.textContent = '';
            msg('Betöltés…');

            // egyéb lejátszó: rejtett keretben megpróbáljuk kiolvasni a közvetlen
            // linket (jwplayer); ha nem megy, marad a lejátszó saját kerete
            if (src.kind === 'frame') {
                const r = await extractFrame(src);
                if (my !== token) return true;
                if (r) { showVideo(r.list, r.poster || pagePoster); return true; }
                showFrame(src.url);
                return true;
            }

            if (src.kind === 'rpm') {
                const id = (src.url.split('#')[1] || '').split('&')[0];
                const r = await okruResolve(src.url, src.url.split('#')[0] + '#' + id + '&' + OKRU_EXTRACT_HASH);
                if (my !== token) return true;
                if (!r.url) { msg(r.error || 'Ezen a forráson nincs lejátszható videó.'); return false; }
                const k = kindOf(r.url);
                if (k === 'direct') { showVideo([{ name: '', url: r.url }], pagePoster); return true; }
                if (k === 'okru') return play({ url: r.url, kind: 'okru' });
                showFrame(r.url);
                return true;
            }

            const res = await okruResolve(src.url);
            if (my !== token) return true;
            const list = (res.videos || []).slice().sort((a, b) => qRank(a.name) - qRank(b.name));
            // HLS: gyorsan indul és magától vált minőséget -> ez az alapértelmezett
            if (res.hls && video.canPlayType('application/vnd.apple.mpegurl')) {
                list.unshift({ name: 'auto', url: res.hls });
            }
            if (!list.length) { msg(res.error || 'Ezen a forráson nincs lejátszható videó.'); return false; }
            showVideo(list, res.poster || pagePoster);
            return true;
        }

        // --- beágyazási link lekérése (Dooplay téma) ---
        const embedCache = {};
        const getEmbed = (o) => {
            const key = o.post + '/' + o.type + '/' + o.nume;
            if (embedCache[key]) return embedCache[key];
            embedCache[key] = (async () => {
                const raw = Array.from(document.scripts).map(s => s.textContent).join('\n');
                const pm = raw.match(/"play_method"\s*:\s*"([^"]+)"/);
                const am = raw.match(/"player_api"\s*:\s*"([^"]+)"/);
                const um = raw.match(/"url"\s*:\s*"([^"]*admin-ajax\.php)"/);
                const api = am ? am[1].replace(/\\\//g, '/') : '';
                let data;
                if (pm && pm[1] === 'wp_json' && api) {
                    const r = await fetch(api + key, { credentials: 'include' });
                    data = await r.json();
                } else {
                    const r = await fetch(um ? um[1].replace(/\\\//g, '/') : '/wp-admin/admin-ajax.php', {
                        method: 'POST',
                        credentials: 'include',
                        body: new URLSearchParams({ action: 'doo_player_ajax', post: o.post, nume: o.nume, type: o.type })
                    });
                    data = await r.json();
                }
                let url = String((data && data.embed_url) || '').trim();
                if (/<iframe/i.test(url)) {
                    const m = url.match(/src\s*=\s*["']([^"']+)/i);
                    url = m ? m[1] : '';
                }
                if (url.startsWith('//')) url = 'https:' + url;
                return /^https?:\/\//i.test(url) ? url : '';
            })().catch(() => '');
            return embedCache[key];
        };

        const optOf = (li) => ({
            post: li.getAttribute('data-post'),
            nume: li.getAttribute('data-nume'),
            type: li.getAttribute('data-type') || 'movie'
        });
        const markLi = (li) => {
            document.querySelectorAll('#playeroptionsul li').forEach(x => x.classList.remove('on'));
            if (li) li.classList.add('on');
        };

        let srcButtons = {};
        const markBtn = (nume) => {
            srcBox.querySelectorAll('button').forEach(b => b.classList.remove('on'));
            if (srcButtons[nume]) srcButtons[nume].classList.add('on');
        };

        // --- az oldal saját forráslistája is a mi lejátszónkat vezérli ---
        window.addEventListener('click', (e) => {
            const li = e.target && e.target.closest ? e.target.closest('#playeroptionsul li[data-nume]') : null;
            if (!li) return;
            e.preventDefault();
            e.stopImmediatePropagation();
            const o = optOf(li);
            markLi(li);
            markBtn(o.nume);
            const my = ++token;
            msg('Betöltés…');
            getEmbed(o).then(url => {
                if (my !== token) return;
                if (!url) { msg('Ezen a forráson nincs lejátszható videó.'); return; }
                play({ url, kind: kindOf(url) });
            });
            try { wrap.scrollIntoView({ behavior: 'smooth', block: 'start' }); } catch (err) {}
        }, true);

        // --- indulás, amikor az oldal felépült ---
        const start = async () => {
            place();
            emptyResponse();
            const og = document.querySelector('meta[property="og:image"]');
            const cover = document.querySelector('#fakeplayer img.cover');
            pagePoster = (cover && cover.src) || (og && og.content) || '';
            if (pagePoster && !video.getAttribute('poster')) video.poster = pagePoster;

            const lis = Array.from(document.querySelectorAll('#playeroptionsul li[data-post][data-nume]'))
                .filter(li => li.getAttribute('data-nume') !== 'trailer');
            if (!lis.length) { msg('Nem található lejátszási forrás.'); return; }

            const urls = await Promise.all(lis.map(li => getEmbed(optOf(li))));
            const sources = [];
            lis.forEach((li, i) => {
                if (!urls[i]) return;
                sources.push({ li, nume: optOf(li).nume, url: urls[i], kind: kindOf(urls[i]) });
            });
            if (!sources.length) { msg('Nem található lejátszási forrás.'); return; }

            srcButtons = {};
            sources.forEach((s, i) => {
                const label = (i + 1) + ' · ' + hostOf(s.url).replace(/^www\./, '').split('.').slice(-2).join('.');
                srcButtons[s.nume] = makeBtn(srcBox, label, () => { markLi(s.li); play(s); });
            });

            // automatikus választás: előbb a közvetlenül lejátszhatók (mp4, ok.ru, rpmshare)…
            for (const s of sources.filter(x => x.kind !== 'frame')) {
                markBtn(s.nume);
                markLi(s.li);
                if (await play(s)) return;
            }
            // …aztán a keretes lejátszók: egyszerre próbáljuk mindet, az első
            // sikeres közvetlen link nyer; ha egyik sem, az első saját kerete
            const frames = sources.filter(x => x.kind === 'frame');
            if (!frames.length) return;
            const my = ++token;
            stopVideo();
            clearFrame();
            video.style.display = '';
            msg('Betöltés…');
            const won = await new Promise((resolve) => {
                let left = frames.length;
                frames.forEach(s => extractFrame(s).then(r => {
                    if (r) resolve({ s, r });
                    else if (--left === 0) resolve(null);
                }));
            });
            if (my !== token) return;
            const pick = won ? won.s : frames[0];
            markBtn(pick.nume);
            markLi(pick.li);
            if (won) showVideo(won.r.list, won.r.poster || pagePoster);
            else showFrame(pick.url);
        };
        if (document.readyState === 'loading') {
            document.addEventListener('DOMContentLoaded', start, { once: true });
        } else {
            start();
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

    // _blank-szerű cél? (_blank, vagy egy nem létező, új ablakot nyitó név)
    const isBlankTarget = (t) => {
        t = String(t || '').trim();
        if (!t) return false;
        if (/^_blank$/i.test(t)) return true;
        if (/^_(self|parent|top)$/i.test(t)) return false;
        // elnevezett cél: csak akkor engedjük, ha ilyen nevű keret létezik
        try { return !document.querySelector('iframe[name="' + t.replace(/"/g, '') + '"],frame[name="' + t.replace(/"/g, '') + '"]'); } catch (e) { return true; }
    };
    const isLinkEl = (el) => !!el && typeof el.tagName === 'string' && /^(A|AREA)$/i.test(el.tagName);

    // --- 2/b: window.open kiiktatása (a saját és a gyerek-keretek ablakában is) ---
    const blockedOpen = function (url) {
        log('window.open blokkolva:', url);
        return makeFakeWindow();
    };
    const lockOpen = (w) => {
        try {
            Object.defineProperty(w, 'open', { value: blockedOpen, writable: false, configurable: false });
        } catch (e) {
            try { w.open = blockedOpen; } catch (e2) {}
        }
    };
    lockOpen(window);

    // A reklámscriptek gyakran egy friss about:blank iframe-ből veszik elő
    // az eredeti window.open-t – azt is lecseréljük.
    const patchChild = (w) => {
        try {
            if (!w || w === window || w.__pbPatched) return;
            if (w.open === blockedOpen) return;
            lockOpen(w);
            try { Object.defineProperty(w, '__pbPatched', { value: true }); } catch (e) {}
            try {
                const wc = w.HTMLElement && w.HTMLElement.prototype.click;
                if (wc) w.HTMLElement.prototype.click = HTMLElement.prototype.click;
                if (w.EventTarget) w.EventTarget.prototype.dispatchEvent = EventTarget.prototype.dispatchEvent;
                if (w.HTMLFormElement) w.HTMLFormElement.prototype.submit = HTMLFormElement.prototype.submit;
            } catch (e) {}
        } catch (e) { /* idegen eredetű keret: ott a saját példányunk fut */ }
    };
    [HTMLIFrameElement, typeof HTMLFrameElement !== 'undefined' ? HTMLFrameElement : null,
     HTMLObjectElement].forEach(C => {
        if (!C) return;
        try {
            const dw = Object.getOwnPropertyDescriptor(C.prototype, 'contentWindow');
            if (dw && dw.get) Object.defineProperty(C.prototype, 'contentWindow', {
                configurable: true, enumerable: dw.enumerable,
                get() { const w = dw.get.call(this); patchChild(w); return w; }
            });
            const dd = Object.getOwnPropertyDescriptor(C.prototype, 'contentDocument');
            if (dd && dd.get) Object.defineProperty(C.prototype, 'contentDocument', {
                configurable: true, enumerable: dd.enumerable,
                get() { const d = dd.get.call(this); if (d) patchChild(d.defaultView); return d; }
            });
        } catch (e) {}
    });
    // window.frames[i] / window[i] úton elért keretek
    try {
        new MutationObserver(() => {
            for (let i = 0; i < window.length; i++) patchChild(window[i]);
        }).observe(document, { childList: true, subtree: true });
    } catch (e) {}

    // --- 2/c: programozott a.click() új ablakba ---
    try {
        const nativeClick = HTMLElement.prototype.click;
        HTMLElement.prototype.click = function () {
            if (isLinkEl(this) && isBlankTarget(this.target)) {
                log('programozott _blank kattintás blokkolva:', this.href);
                return;
            }
            return nativeClick.apply(this, arguments);
        };
    } catch (e) {}

    // --- 2/c2: dispatchEvent(new MouseEvent('click')) egy (akár a dokumentumba
    //     be sem tett) linken – ez a document szintű figyelőnket megkerülné ---
    try {
        const nativeDispatch = EventTarget.prototype.dispatchEvent;
        EventTarget.prototype.dispatchEvent = function (ev) {
            try {
                if (ev && /^(click|auxclick|mouseup)$/i.test(ev.type)) {
                    const a = isLinkEl(this) ? this :
                        (this && this.closest ? this.closest('a[target],area[target]') : null);
                    if (a && isBlankTarget(a.target)) {
                        log('szintetikus _blank kattintás blokkolva:', a.href);
                        return false;
                    }
                }
            } catch (e) {}
            return nativeDispatch.apply(this, arguments);
        };
    } catch (e) {}

    // --- 2/d: form submit új ablakba ---
    try {
        const nativeSubmit = HTMLFormElement.prototype.submit;
        HTMLFormElement.prototype.submit = function () {
            if (isBlankTarget(this.target)) {
                log('form submit _blank blokkolva');
                return;
            }
            return nativeSubmit.apply(this, arguments);
        };
    } catch (e) {}

    document.addEventListener('submit', function (e) {
        const f = e.target;
        if (f && isBlankTarget(f.target)) {
            e.preventDefault();
            e.stopImmediatePropagation();
            log('submit esemény blokkolva');
        }
    }, true);

    // --- 2/e: valódi kattintások, amik új fület nyitnának ---
    if (BLOCK_BLANK_LINKS) {
        const clickGuard = function (e) {
            // Ctrl / Cmd / Shift / középső gomb: szándékos új fül -> engedjük
            if (e.isTrusted && (e.ctrlKey || e.metaKey || e.shiftKey || e.button === 1)) return;

            const a = e.target && e.target.closest ? e.target.closest('a[target], area[target]') : null;
            if (!a) return;
            if (!isBlankTarget(a.target)) return;

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
            if (isBlankTarget(b.target)) b.removeAttribute('target');
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