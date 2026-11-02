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
// @match        *://gobsao8u.com/*
// @match        *://*.gobsao8u.com/*
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
        'gobsao8u.com'
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
     * HDMOZI FILMOLDAL – az oldal marad, csak a film helyére (pontosan
     * az eredeti lejátszó helyére és méretére) kerül egy sima <video>.
     * Az oldal saját forráslistája (alul) is ezt a lejátszót vezérli.
     * A külső reklámscriptek nem töltődnek be.
     * Eredeti lejátszó: a sáv „Eredeti lejátszó” linkje (#eredeti).
     * ------------------------------------------------------------------ */
    if (/(^|\.)hdmozi\.hu$/i.test(location.hostname) &&
        window.top === window.self &&
        /^\/movies\/[^/]+/i.test(location.pathname) &&
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
            frameEl.setAttribute('sandbox', 'allow-scripts allow-same-origin allow-presentation');
            frameEl.setAttribute('allowfullscreen', '');
            frameEl.setAttribute('allow', 'autoplay; fullscreen; encrypted-media; picture-in-picture');
            frameEl.setAttribute('referrerpolicy', 'origin');
            frameEl.src = url;
            box.insertBefore(frameEl, msgEl);
        }

        // --- ok.ru: rejtett keretben kiolvassuk a közvetlen linkeket ---
        const okruCache = {};
        function okruResolve(url) {
            if (okruCache[url]) return okruCache[url];
            okruCache[url] = new Promise((resolve) => {
                const f = document.createElement('iframe');
                f.style.cssText = 'position:absolute;left:-9999px;top:0;width:1px;height:1px;border:0;visibility:hidden';
                f.src = url.split('#')[0] + '#' + OKRU_EXTRACT_HASH;
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
                timer = setTimeout(() => finish({ error: 'Az ok.ru nem válaszolt.' }), 20000);
                document.body.appendChild(f);
            });
            return okruCache[url];
        }

        const kindOf = (url) => {
            if (/\.(mp4|webm|m4v|ogv)(\?|#|$)/i.test(url)) return 'direct';
            if (/^https?:\/\/([a-z0-9-]+\.)*ok\.ru\/videoembed\//i.test(url)) return 'okru';
            return 'frame';
        };

        // true = sikerült videót mutatni
        async function play(src) {
            const my = ++token;
            if (src.kind === 'direct') { showVideo([{ name: '', url: src.url }], pagePoster); return true; }
            if (src.kind === 'frame') { showFrame(src.url); return true; }

            stopVideo();
            clearFrame();
            video.style.display = '';
            qBox.textContent = '';
            msg('Betöltés…');
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

            // automatikus választás: előbb a sima videóként lejátszhatók, végül keret
            const order = sources.slice().sort((a, b) => (a.kind === 'frame') - (b.kind === 'frame'));
            for (const s of order) {
                markBtn(s.nume);
                markLi(s.li);
                if (await play(s)) return;
            }
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