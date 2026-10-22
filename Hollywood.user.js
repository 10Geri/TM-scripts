// ==UserScript==
// @name         Hollywood
// @namespace    Claude
// @version      1.0
// @description
// @author       10Geri
// @match        https://app.hollywoodnyelvstudio.hu/*
// @match        https://docs.google.com/presentation/*
// @run-at       document-start
// @grant        none
// ==/UserScript==

(function() {
    'use strict';

    // A beágyazott Google Slides iframe-ben (docs.google.com) CSAK a fenti
    // diákra vonatkozó rész fusson, a Hollywood-oldal többi módosítása ne.
    if (location.hostname === 'docs.google.com') {
        initGoogleSlidesEmbed();
        return;
    }

    // =====================================================================
    // --- Google Slides beágyazott nézegető (a "drive" widget iframe-je) ---
    // A többoldalas szöveges diák egy docs.google.com-os iframe-ben futnak.
    // Ott a szöveg NEM valódi szöveg, hanem SVG-görbékre (path) rajzolt betűk,
    // ezért magától nem jelölhető ki. Két dolgot csinálunk:
    //  1) A dián belüli kattintás ne lapozzon tovább (a lenti vezérlősáv
    //     gombjai - ◀ 1 ▶ ⋮, "Megnyitás új lapon" - és a linkek működnek).
    //  2) Minden szövegdoboz fölé egy átlátszó, de KIJELÖLHETŐ szövegréteget
    //     teszünk a doboz akadálymentesítési (aria-label) szövegéből, soronként
    //     a látható sorokhoz igazítva. Kijelöléskor kék kiemelés látszik, a
    //     Ctrl+C pedig a tényleges szöveget másolja.
    // =====================================================================
    function initGoogleSlidesEmbed() {
        const LAYER_CLASS = 'hw-slide-text-layer';
        const SVG_NS = 'http://www.w3.org/2000/svg';
        const XHTML_NS = 'http://www.w3.org/1999/xhtml';
        // A lenti vezérlősáv (◀ 1 ▶ ⋮, "Megnyitás új lapon") és a linkek
        // továbbra is normálisan működjenek.
        const NAV_SELECTOR = '[class*="punch-viewer-nav"], [class*="punch-viewer-nav-"], [role="toolbar"], '
            + '[role="menu"], [role="menuitem"], [role="menubar"], [role="listbox"], [role="option"], '
            + 'button, [role="button"], a[href], input, select, textarea';
        const POINTER_TYPES = ['click', 'dblclick', 'auxclick', 'mousedown', 'mouseup',
            'pointerdown', 'pointerup', 'touchstart', 'touchend', 'selectstart', 'dragstart'];
        const nativeAdd = EventTarget.prototype.addEventListener;
        const nativeRemove = EventTarget.prototype.removeEventListener;

        console.info('[Hollywood] Google Slides modul aktív ebben a keretben:', location.pathname);
        // Visszajelzés a befoglaló oldalnak, hogy ebben a keretben elindultunk.
        // (Ha nem érkezik meg, a Hollywood-oldal újratölti a keretet - a Tampermonkey
        // ugyanis néha kihagyja a menet közben létrehozott iframe-eket.)
        function announceReady() {
            try { if (window.parent && window.parent !== window) window.parent.postMessage({ __hollywood: 'slides-ready' }, '*'); } catch (err) {}
        }
        announceReady();
        [100, 500, 1500, 3000].forEach(ms => setTimeout(announceReady, ms));
        nativeAdd.call(window, 'message', e => {
            if (e.data && e.data.__hollywood === 'slides-ping') announceReady();
        });

        // A látható dia(k) téglalapja a képernyőn.
        function slideRects() {
            const rects = [];
            document.querySelectorAll('.punch-viewer-svgpage-svgcontainer > svg, .sketchyViewerContent, .punch-viewer-content')
                .forEach(el => {
                    const r = el.getBoundingClientRect();
                    if (r.width > 20 && r.height > 20) rects.push(r);
                });
            return rects;
        }
        function eventPoint(e) {
            if (e.touches && e.touches[0]) return { x: e.touches[0].clientX, y: e.touches[0].clientY };
            if (e.changedTouches && e.changedTouches[0]) return { x: e.changedTouches[0].clientX, y: e.changedTouches[0].clientY };
            if (typeof e.clientX === 'number' && (e.clientX || e.clientY)) return { x: e.clientX, y: e.clientY };
            return null;
        }
        function isNavTarget(t) {
            const el = t && (t.nodeType === 1 ? t : t.parentElement);
            if (!el || !el.closest) return false;
            if (el.closest('.' + LAYER_CLASS)) return false;
            return !!el.closest(NAV_SELECTOR);
        }
        // Egy egér/érintés esemény a dián (és nem a vezérlősávon) történt-e.
        // Elsősorban KOORDINÁTA alapján döntünk, így az sem számít, ha a dia fölött
        // egy láthatatlan "kattintás-elkapó" réteg ül.
        function isSlideEvent(e) {
            if (!e || POINTER_TYPES.indexOf(e.type) === -1) return false;
            if (isNavTarget(e.target)) return false;
            const t = e.target && (e.target.nodeType === 1 ? e.target : e.target.parentElement);
            if (t && t.closest && t.closest('.' + LAYER_CLASS)) return true;
            const p = eventPoint(e);
            if (!p) {
                return !!(t && t.closest && t.closest('.punch-viewer-svgpage-svgcontainer, .sketchyViewerContent, .punch-viewer-content'));
            }
            return slideRects().some(r => p.x >= r.left && p.x <= r.right && p.y >= r.top && p.y <= r.bottom);
        }

        // --- 1) Kattintásra ne lapozzon ---
        // a) A nézegető SAJÁT eseménykezelőit "becsomagoljuk": dián történt
        //    kattintásnál/egérlenyomásnál egyszerűen nem futnak le. Így az sem
        //    számít, hogy melyik elemre, milyen sorrendben regisztrálták őket, és
        //    azt sem tudják megakadályozni (preventDefault), hogy kijelölj.
        const wrappedListeners = new WeakMap();
        EventTarget.prototype.addEventListener = function(type, listener, options) {
            if (POINTER_TYPES.indexOf(type) !== -1 && listener && !listener.__hwOwn) {
                let perType = wrappedListeners.get(listener);
                if (!perType) { perType = {}; wrappedListeners.set(listener, perType); }
                if (!perType[type]) {
                    perType[type] = function(e) {
                        if (isSlideEvent(e)) return;
                        return typeof listener === 'function'
                            ? listener.apply(this, arguments)
                            : listener.handleEvent.apply(listener, arguments);
                    };
                }
                return nativeAdd.call(this, type, perType[type], options);
            }
            return nativeAdd.call(this, type, listener, options);
        };
        EventTarget.prototype.removeEventListener = function(type, listener, options) {
            const perType = listener && wrappedListeners.get(listener);
            if (perType && perType[type]) {
                nativeRemove.call(this, type, perType[type], options);
            }
            return nativeRemove.call(this, type, listener, options);
        };
        // A régi stílusú, property-n keresztüli kezelők (el.onclick = ...) ellen.
        ['onclick', 'onmousedown', 'onmouseup', 'onpointerdown', 'onpointerup', 'onselectstart'].forEach(prop => {
            [HTMLElement.prototype, Document.prototype, SVGElement.prototype].forEach(proto => {
                const desc = Object.getOwnPropertyDescriptor(proto, prop);
                if (!desc || !desc.set || !desc.configurable) return;
                Object.defineProperty(proto, prop, {
                    configurable: true, enumerable: desc.enumerable,
                    get: desc.get,
                    set: function(fn) {
                        if (typeof fn !== 'function') return desc.set.call(this, fn);
                        return desc.set.call(this, function(e) { if (isSlideEvent(e)) return; return fn.apply(this, arguments); });
                    }
                });
            });
        });
        // b) Biztonsági háló: ha valami mégis a becsomagolás ELŐTT került fel,
        //    a legkorábbi ponton (window, capture) megállítjuk a továbbterjedést.
        //    Az alapértelmezett viselkedést (natív kijelölés) NEM tiltjuk.
        function stopOnSlide(e) {
            if (!isSlideEvent(e)) return;
            e.stopPropagation();
            e.stopImmediatePropagation();
        }
        stopOnSlide.__hwOwn = true;
        POINTER_TYPES.forEach(type => {
            nativeAdd.call(window, type, stopOnSlide, { capture: true, passive: true });
            nativeAdd.call(document, type, stopOnSlide, { capture: true, passive: true });
        });

        // c) Ha a dia fölött egy átlátszó réteg ül, ami elnyeli az egeret (ez
        //    lapozna, és miatta nem lehetne kijelölni), azt "átlátszóvá" tesszük az
        //    egér számára, hogy a kijelölhető szövegréteg kapja meg az egeret.
        function clearBlockersAt(x, y) {
            if (!document.elementsFromPoint) return;
            const stack = document.elementsFromPoint(x, y);
            for (const el of stack) {
                if (el.closest && el.closest('.' + LAYER_CLASS)) return;           // elértük a szövegréteget
                if (el.closest && el.closest('.punch-viewer-svgpage-svgcontainer')) return; // maga a dia
                if (el === document.documentElement || el === document.body) return;
                if (isNavTarget(el)) return;
                if (el.querySelector && el.querySelector('.punch-viewer-svgpage-svgcontainer')) return; // a dia szülője
                el.style.setProperty('pointer-events', 'none', 'important');
            }
        }
        function onPointerMove(e) {
            const p = eventPoint(e);
            if (!p || e.buttons) return;
            if (!slideRects().some(r => p.x >= r.left && p.x <= r.right && p.y >= r.top && p.y <= r.bottom)) return;
            clearBlockersAt(p.x, p.y);
        }
        onPointerMove.__hwOwn = true;
        nativeAdd.call(window, 'mousemove', onPointerMove, { capture: true, passive: true });

        // --- 2) Kijelölhető szövegréteg ---
        // CSS-t elsősorban közvetlenül az elemekre írunk (element.style), mert a
        // Google oldalainak biztonsági szabályai (CSP) a beszúrt <style> elemet
        // letilthatják. A kijelölés színe (::selection) csak "extra".
        try {
            const sheet = new CSSStyleSheet();
            sheet.replaceSync('.' + LAYER_CLASS + ' span::selection { background: rgba(0, 120, 215, 0.35) !important; color: transparent !important; }');
            document.adoptedStyleSheets = document.adoptedStyleSheets.concat([sheet]);
        } catch (err) { /* nem baj, marad az alapértelmezett kijelölésszín */ }
        const imp = (el, props) => Object.keys(props).forEach(k => el.style.setProperty(k, props[k], 'important'));

        const measureCtx = document.createElement('canvas').getContext('2d');
        measureCtx.font = '100px Arial';
        const textWidth = s => measureCtx.measureText(s).width;

        // A szövegdobozhoz tartozó betű-görbék: az aria-labeles csoport UTÁNI
        // testvérelemek, egészen a következő aria-labeles csoportig.
        function glyphBoxesFor(group) {
            const boxes = [];
            // A betűgörbék kétféleképpen állhatnak: a szövegdoboz csoportján BELÜL,
            // vagy a csoport UTÁN, testvérként (a Google mindkettőt használja).
            const sources = [group];
            for (let el = group.nextElementSibling; el; el = el.nextElementSibling) {
                if (el.id && el.id.indexOf('a11y-') === 0) break;
                if (el.classList && el.classList.contains(LAYER_CLASS)) break;
                // Ha a testvér már egy MÁSIK szövegdobozt tartalmaz (pl. animált,
                // csoportba zárt sorokat), ott megállunk - azok nem ide tartoznak.
                if (el.querySelector && el.querySelector('g[id^="a11y-"]')) break;
                sources.push(el);
            }
            sources.forEach(el => {
                const paths = el.tagName.toLowerCase() === 'path' ? [el] : Array.from(el.querySelectorAll('path'));
                paths.forEach(p => {
                    // másik szövegdobozhoz tartozó betűk ne keveredjenek ide
                    const owner = p.closest('g[id^="a11y-"]');
                    if (owner && owner !== group) return;
                    if (parseFloat(p.getAttribute('fill-opacity')) === 0) return;
                    if ((p.getAttribute('fill') || '') === 'none') return;
                    let b;
                    try { b = p.getBBox(); } catch (err) { return; }
                    if (!b || b.width <= 0 || b.height <= 0) return;
                    // háttér-téglalapok (pl. kiemelés) ne számítsanak betűnek
                    if (!/[qc]/i.test(p.getAttribute('d') || '')) return;
                    boxes.push({ x1: b.x, y1: b.y, x2: b.x + b.width, y2: b.y + b.height });
                });
            });
            return boxes;
        }
        // Egy elem tényleges láthatósága (a diák animációi opacity-vel jelenítik meg
        // a sorokat: amíg a nyíllal elő nem hívod őket, átlátszóak).
        function effectiveOpacity(el, root) {
            let o = 1;
            for (let e = el; e && e !== root; e = e.parentElement) {
                const cs = window.getComputedStyle(e);
                if (cs.display === 'none' || cs.visibility === 'hidden') return 0;
                o *= parseFloat(cs.opacity);
                if (!(o > 0)) return 0;
            }
            return o;
        }

        // Görbék csoportosítása látható sorokká (függőleges átfedés alapján).
        function clusterLines(boxes) {
            boxes.sort((a, b) => (a.y1 + a.y2) - (b.y1 + b.y2));
            const lines = [];
            boxes.forEach(b => {
                const cy = (b.y1 + b.y2) / 2;
                const line = lines.find(l => cy >= l.y1 && cy <= l.y2);
                if (line) {
                    line.boxes.push(b);
                    line.x1 = Math.min(line.x1, b.x1); line.x2 = Math.max(line.x2, b.x2);
                    line.y1 = Math.min(line.y1, b.y1); line.y2 = Math.max(line.y2, b.y2);
                } else {
                    lines.push(Object.assign({ boxes: [b] }, b));
                }
            });
            lines.sort((a, b) => a.y1 - b.y1);
            // egymásba csúszott sorok összevonása
            for (let i = lines.length - 1; i > 0; i--) {
                const a = lines[i - 1], b = lines[i];
                const overlap = Math.min(a.y2, b.y2) - Math.max(a.y1, b.y1);
                if (overlap > 0.5 * Math.min(a.y2 - a.y1, b.y2 - b.y1)) {
                    a.x1 = Math.min(a.x1, b.x1); a.x2 = Math.max(a.x2, b.x2);
                    a.y1 = Math.min(a.y1, b.y1); a.y2 = Math.max(a.y2, b.y2);
                    a.boxes = a.boxes.concat(b.boxes);
                    lines.splice(i, 1);
                }
            }
            // A sor "tipikus" betűmagassága és teteje: a szavak dobozainak
            // mediánja (egy-egy magasabb jel, pl. / vagy ˈ, ne torzítsa).
            const median = arr => { const s = arr.slice().sort((x, y) => x - y); return s[Math.floor(s.length / 2)]; };
            lines.forEach(l => {
                l.h = median(l.boxes.map(b => b.y2 - b.y1));
                l.top = median(l.boxes.map(b => b.y1));
            });
            return lines;
        }

        // Melyik bekezdés hány látható sort foglal el (sortörés miatt egy
        // bekezdés több sor is lehet). Dinamikus programozás: a bekezdés
        // becsült szélessége és a sorok szélessége minél jobban egyezzen,
        // a bekezdésen BELÜLI sorközök pedig kicsik legyenek.
        function assignLines(paras, lines) {
            const P = paras.length, L = lines.length;
            if (!P || !L) return null;
            if (L <= P) {
                const res = [];
                for (let i = 0; i < P; i++) res.push(i < L ? [i, i] : null);
                return res;
            }
            const pw = paras.map(textWidth);
            const lw = lines.map(l => l.x2 - l.x1);
            const scale = lw.reduce((a, b) => a + b, 0) / Math.max(1, pw.reduce((a, b) => a + b, 0));
            const gaps = [];
            for (let i = 0; i < L - 1; i++) gaps.push(Math.max(0, lines[i + 1].y1 - lines[i].y2));
            const sortedGaps = gaps.slice().sort((a, b) => a - b);
            const medGap = sortedGaps[Math.floor(sortedGaps.length / 2)] || 1;
            const cost = (p, a, b) => {
                let W = 0;
                for (let i = a; i <= b; i++) W += lw[i];
                const r = Math.log(Math.max(1, pw[p] * scale) / Math.max(1, W));
                let c = r * r;
                // tele sor után jön a következő sor? (a nem utolsó soroknak közel
                // teljes szélességűnek kell lenniük)
                const maxW = Math.max.apply(null, lw);
                for (let i = a; i < b; i++) {
                    c += 0.3 * (gaps[i] / (medGap + 1));
                    if (lw[i] < 0.6 * maxW) c += 1;
                }
                return c;
            };
            const INF = 1e18;
            const dp = Array.from({ length: P + 1 }, () => new Array(L + 1).fill(INF));
            const from = Array.from({ length: P + 1 }, () => new Array(L + 1).fill(-1));
            dp[0][0] = 0;
            for (let p = 1; p <= P; p++) {
                for (let l = p; l <= L - (P - p); l++) {
                    for (let k = p - 1; k < l; k++) {
                        if (dp[p - 1][k] >= INF) continue;
                        const v = dp[p - 1][k] + cost(p - 1, k, l - 1);
                        if (v < dp[p][l]) { dp[p][l] = v; from[p][l] = k; }
                    }
                }
            }
            const res = new Array(P);
            let l = L;
            for (let p = P; p >= 1; p--) {
                const k = from[p][l];
                res[p - 1] = [k, l - 1];
                l = k;
            }
            return res;
        }

        // Egy bekezdés szövegének elosztása a hozzá tartozó sorok között, a sorok
        // szélességének arányában (szóhatáron törve).
        function splitParagraph(text, lineWidths) {
            if (lineWidths.length === 1) return [text];
            const words = text.split(/(?<= )/); // a szóköz a szó végén marad
            const total = textWidth(text) || 1;
            const lwTotal = lineWidths.reduce((a, b) => a + b, 0) || 1;
            const out = [];
            let wi = 0, acc = 0, accLw = 0;
            for (let li = 0; li < lineWidths.length; li++) {
                if (li === lineWidths.length - 1) { out.push(words.slice(wi).join('')); break; }
                accLw += lineWidths[li];
                const target = total * accLw / lwTotal;
                let chunk = '';
                while (wi < words.length) {
                    const w = textWidth(words[wi]);
                    // akkor vesszük még be a szót, ha a közepe a határ előtt van
                    if (chunk && acc + w / 2 > target) break;
                    chunk += words[wi]; acc += w; wi++;
                }
                out.push(chunk);
            }
            return out;
        }

        function buildLayer(svg) {
            const allGroups = Array.from(svg.querySelectorAll('g[id^="a11y-"][aria-label]'));
            // Csak a MÁR LÁTHATÓ szövegdobozokhoz készítünk réteget, és az
            // ujjlenyomatba beleszámít a láthatóság is - így amikor a nyíllal
            // előhívsz egy újabb sort, a réteg automatikusan újraépül.
            const groups = allGroups.filter(g => effectiveOpacity(g, svg.parentElement) > 0.05);
            const signature = allGroups.map(g => (effectiveOpacity(g, svg.parentElement) > 0.05 ? '1' : '0')
                + g.getAttribute('aria-label')).join('\u0001');
            const old = svg.querySelector(':scope > .' + LAYER_CLASS);
            if (old && old.__hwSignature === signature) return;
            if (!groups.length) { if (old) old.remove(); return; }
            const vb = svg.viewBox && svg.viewBox.baseVal;
            if (!vb || !vb.width) return;
            if (svg.getBoundingClientRect().width === 0) return; // még nem látható

            const fo = document.createElementNS(SVG_NS, 'foreignObject');
            fo.setAttribute('class', LAYER_CLASS);
            imp(fo, { 'pointer-events': 'auto', 'overflow': 'visible' });
            fo.setAttribute('x', vb.x); fo.setAttribute('y', vb.y);
            fo.setAttribute('width', vb.width); fo.setAttribute('height', vb.height);
            const root = document.createElementNS(XHTML_NS, 'div');
            imp(root, { 'position': 'relative', 'width': '100%', 'height': '100%', 'margin': '0', 'padding': '0',
                'pointer-events': 'auto', 'user-select': 'text', '-webkit-user-select': 'text' });
            fo.appendChild(root);

            const lineEls = [];
            groups.forEach(group => {
                const groupLineEls = [];
                const label = (group.getAttribute('aria-label') || '').replace(/ /g, ' ');
                const paras = label.split('\n').map(s => s.replace(/\s+$/, '')).filter(s => s.trim());
                const lines = clusterLines(glyphBoxesFor(group));
                const map = assignLines(paras, lines);
                if (!map) return;
                paras.forEach((para, pi) => {
                    const range = map[pi];
                    if (!range) { // nincs neki külön sor: az utolsó sorhoz fűzzük
                        const last = lineEls[lineEls.length - 1];
                        if (last) { last.firstChild.textContent += '\n' + para; }
                        return;
                    }
                    const myLines = lines.slice(range[0], range[1] + 1);
                    const parts = splitParagraph(para, myLines.map(l => l.x2 - l.x1));
                    myLines.forEach((ln, i) => {
                        // A sor-doboz a dia jobb széléig és a következő sor tetejéig
                        // ér: így ha a kijelölés húzása közben a sor utáni üres
                        // részre ér az egér, a kijelölés a sor végére ugrik (nem a
                        // szöveg elejére).
                        const d = document.createElementNS(XHTML_NS, 'div');
                        d.className = 'hw-line';
                        imp(d, { 'position': 'absolute', 'margin': '0', 'padding': '0', 'border': '0',
                            'white-space': 'pre', 'cursor': 'text', 'pointer-events': 'auto',
                            'user-select': 'text', '-webkit-user-select': 'text' });
                        const span = document.createElementNS(XHTML_NS, 'span');
                        const h = ln.h;
                        span.textContent = (parts[i] || '').replace(/ +$/, '');
                        imp(span, { 'display': 'inline-block', 'transform-origin': '0 0', 'color': 'transparent',
                            'background': 'transparent', 'font-family': 'Arial, Helvetica, sans-serif',
                            'line-height': '1.24', 'white-space': 'pre', 'pointer-events': 'auto',
                            'user-select': 'text', '-webkit-user-select': 'text',
                            'font-size': (h * 1.15) + 'px' });
                        d.appendChild(span);
                        const top = ln.top - h * 0.18;
                        imp(d, { 'left': ln.x1 + 'px', 'top': top + 'px',
                            'width': Math.max(1, vb.x + vb.width - ln.x1) + 'px', 'height': (h * 1.45) + 'px' });
                        d.__hwTop = top;
                        d.__hwTargetWidth = ln.x2 - ln.x1;
                        d.__hwJoin = i === 0 ? '\n' : ' '; // ami ELÉ kerül másoláskor
                        root.appendChild(d);
                        groupLineEls.push(d);
                        lineEls.push(d);
                    });
                });
                // függőleges hézagok: a sor doboza érjen le a következő sorig
                groupLineEls.sort((a, b) => a.__hwTop - b.__hwTop);
                for (let i = 0; i < groupLineEls.length - 1; i++) {
                    const gap = groupLineEls[i + 1].__hwTop - groupLineEls[i].__hwTop;
                    if (gap > parseFloat(groupLineEls[i].style.height)) groupLineEls[i].style.setProperty('height', gap + 'px', 'important');
                }
            });
            fo.__hwSignature = signature;
            if (old) old.remove();
            svg.appendChild(fo);
            // vízszintes nyújtás, hogy a kijelölés pontosan a látható sort fedje
            lineEls.forEach(d => {
                const span = d.firstChild;
                const w = span.offsetWidth;
                if (w > 0) span.style.setProperty('transform', 'scaleX(' + (d.__hwTargetWidth / w) + ')', 'important');
            });
        }

        function buildAll() {
            document.querySelectorAll('.punch-viewer-svgpage-svgcontainer > svg').forEach(svg => {
                try { buildLayer(svg); } catch (err) { /* egy hibás dia ne állítsa meg a többit */ }
            });
        }

        // Másolás: a sortöréssel tördelt bekezdés sorait szóközzel, a bekezdéseket
        // új sorral fűzzük össze, és az oldal ne tudja megakadályozni a másolást.
        nativeAdd.call(window, 'copy', function(e) {
            const sel = window.getSelection();
            if (!sel || !sel.rangeCount || sel.isCollapsed) return;
            const range = sel.getRangeAt(0);
            const layerNode = n => n && (n.nodeType === 1 ? n : n.parentElement);
            const inLayer = n => { const el = layerNode(n); return !!(el && el.closest && el.closest('.' + LAYER_CLASS)); };
            if (!inLayer(range.startContainer) && !inLayer(range.endContainer)) return;
            const lineDivs = Array.from(document.querySelectorAll('.' + LAYER_CLASS + ' .hw-line'))
                .filter(d => range.intersectsNode(d.firstChild));
            let text = '';
            lineDivs.forEach((d, i) => {
                const node = d.firstChild.firstChild;
                let t = d.textContent;
                if (node && range.startContainer === node && range.endContainer === node) t = t.slice(range.startOffset, range.endOffset);
                else if (node && range.startContainer === node) t = t.slice(range.startOffset);
                else if (node && range.endContainer === node) t = t.slice(0, range.endOffset);
                text += (i === 0 ? '' : d.__hwJoin) + t;
            });
            if (!text) return;
            e.stopImmediatePropagation();
            e.preventDefault();
            e.clipboardData.setData('text/plain', text);
        }, true);
        // A nézegető a Ctrl+C / Ctrl+A billentyűket se nyelje el
        nativeAdd.call(window, 'keydown', function(e) {
            const k = (e.key || '').toLowerCase();
            if ((e.ctrlKey || e.metaKey) && (k === 'c' || k === 'a')) {
                e.stopImmediatePropagation();
                if (k === 'a') {
                    // Ctrl+A: csak az aktuális dia szövegét jelölje ki
                    const layer = Array.from(document.querySelectorAll('.' + LAYER_CLASS))
                        .find(l => l.getBoundingClientRect().width > 0);
                    if (layer) {
                        e.preventDefault();
                        const r = document.createRange();
                        r.selectNodeContents(layer.firstChild);
                        const s = window.getSelection();
                        s.removeAllRanges(); s.addRange(r);
                    }
                }
            }
        }, true);

        let scheduled = false;
        let delayed = null;
        function schedule() {
            // Az animációk (sorok előhívása) 0,3-0,5 mp alatt futnak le, ezért a
            // képkocka utáni építés mellett kicsit később is újrapróbáljuk.
            if (!delayed) delayed = setTimeout(() => { delayed = null; buildAll(); }, 450);
            if (scheduled) return;
            scheduled = true;
            requestAnimationFrame(() => { scheduled = false; buildAll(); });
        }
        function start() {
            new MutationObserver(muts => {
                // a saját rétegünk beszúrása ne indítsa újra
                if (muts.every(m => {
                    const target = m.target && (m.target.nodeType === 1 ? m.target : m.target.parentElement);
                    if (target && target.closest && target.closest('.' + LAYER_CLASS)) return true; // saját réteg
                    const nodes = Array.from(m.addedNodes).concat(Array.from(m.removedNodes));
                    // attribútum-változásnál nincs be-/kikerült elem: az MINDIG érdekel
                    // minket (így vesszük észre, ha egy animált sor megjelenik)
                    return nodes.length > 0 && nodes.every(n => n.classList && n.classList.contains(LAYER_CLASS));
                })) return;
                schedule();
            }).observe(document.documentElement, {
                childList: true, subtree: true,
                attributes: true, attributeFilter: ['style', 'class', 'opacity', 'transform', 'visibility']
            });
            nativeAdd.call(window, 'resize', schedule);
            schedule();
        }
        if (document.documentElement) start();
        else nativeAdd.call(document, 'DOMContentLoaded', start);
        setInterval(buildAll, 1500);
    }

    // ====================== Hollywood-oldal ======================

    // --- Indítás Chrome alkalmazás-ablakban (desktop app) ---
    // Az alkalmazás-ablak hidegindításakor a Tampermonkey néha csak akkor injektálja
    // a szkriptet, amikor az oldal saját kódja már elindult. Ilyenkor a kamerát,
    // a másolás-tiltást stb. az oldal már a mi beavatkozásaink ELŐTT beállította,
    // ezért úgy tűnt, mintha a szkript nem futna. Ha ezt észleljük, magunk töltjük
    // újra az oldalt (pont amit eddig kézzel kellett) - legfeljebb kétszer egy
    // lapon, így ez soha nem válhat végtelen újratöltéssé.
    const HW_LATE_RELOAD_FLAG = 'hwLateInjectReload';
    function hwAppAlreadyRunning() {
        try {
            if (window.__reactRouterVersion !== undefined) return true;
            const root = document.getElementById('root');
            return !!(root && root.childElementCount > 0);
        } catch (e) { return false; }
    }
    if (window.top === window) {
        if (!hwAppAlreadyRunning()) {
            try { sessionStorage.removeItem(HW_LATE_RELOAD_FLAG); } catch (e) {}
        } else {
            let tries = 2;
            try { tries = parseInt(sessionStorage.getItem(HW_LATE_RELOAD_FLAG) || '0', 10) || 0; } catch (e) {}
            if (tries < 2) {
                try { sessionStorage.setItem(HW_LATE_RELOAD_FLAG, String(tries + 1)); } catch (e) {}
                console.info('[Hollywood] A szkript az oldal elindulása UTÁN töltődött be - újratöltöm az oldalt.');
                setTimeout(() => location.reload(), tries ? 400 : 0);
                return;
            }
        }
    }
    // DOMContentLoaded helyett: ha a DOM már kész, azonnal (következő körben) fut.
    function onDomReady(fn) {
        if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', fn);
        else setTimeout(fn, 0);
    }

    // =====================================================================
    // --- Kamera: alapból kikapcsolva, közelítés, tükrözés, alapértelmezett eszközök ---
    //  - Közelítés: ha a kamera tud hardveresen közelíteni, azt állítjuk be
    //    (egyszeri beállítás). Ha nem tud (pl. az USB Camera), a kamerakép
    //    "nézetét" vágjuk ki: a képkocka pixeleihez NEM nyúlunk, nem másoljuk és
    //    nem rajzoljuk újra, csak megadjuk, melyik része látszódjon (VideoFrame
    //    visibleRect). Ez képkockánként néhány század ezredmásodperc - a Zoom a
    //    képet egyébként is átméretezi a küldéshez, ezért plusz munka gyakorlatilag
    //    nincs. Hogy a közelített kép ne legyen homályos, a kamerától a közelítés
    //    mértékében nagyobb felbontást kérünk (legfeljebb 1280x720) - ez is
    //    egyszeri beállítás.
    //  - Tükrözés: a Zoom SDK saját tükrözési beállítását kapcsoljuk (egyszer).
    //  - Alapból kikapcsolt kamera: a Zoom SDK videóindítását csak akkor engedjük,
    //    ha a felhasználó maga kérte (kamera-gombra kattintott).
    //  - Alapértelmezett eszközök: USB Camera (ha nincs: Integrated Camera) és
    //    Mikrofon (USB Audio).
    // A beállításokat (közelítés %, tükrözés) a böngésző megjegyzi.
    // =====================================================================
    const HW_ZOOM_KEY = 'hwCameraZoom';
    const HW_MIRROR_KEY = 'hwCameraMirror';
    const HW_ZOOM_DEFAULT = 50;
    const HW_SOFT_ZOOM_MAX = 2;            // 100% = 2x közelítés (ha a kamera nem tud közelíteni)
    const HW_MAX_CAPTURE = { width: 1280, height: 720 };   // a kamerától kért legnagyobb felbontás
    const HW_CAMERA_PREFERENCE = [/^USB Camera\b/i, /^Integrated Camera\b/i];
    const HW_MIC_PREFERENCE = /^Mikrofon \(USB Audio\)/i;
    const HW_ZOOM_CAMERA = /^USB Camera\b/i;   // közelítés csak ennél a kameránál
    function hwLsGet(k) { try { return localStorage.getItem(k); } catch (e) { return null; } }
    function hwLsSet(k, v) { try { localStorage.setItem(k, v); } catch (e) {} }
    let hwZoomPercent = (() => {
        const v = parseFloat(hwLsGet(HW_ZOOM_KEY));
        return isFinite(v) ? Math.min(100, Math.max(0, v)) : HW_ZOOM_DEFAULT;
    })();
    let hwMirror = hwLsGet(HW_MIRROR_KEY) !== '0';   // alapból tükrözve
    let hwZoomMode = null;                             // null | 'hardware' | 'view' | 'none'
    let hwStream = null;                               // a Zoom SDK videó-stream objektuma
    let hwPreferredCameraId = null;
    let hwSessionCameraId = null;                      // ebben a munkamenetben kézzel választott kamera

    // Az oldal saját "Haladó" beállításai között is ugyanez szerepeljen.
    function syncAppMirrorSetting() {
        try {
            const s = JSON.parse(hwLsGet('zoomAdvancedSettings') || '{}') || {};
            if (s.mirrorVideo === hwMirror) return;
            s.mirrorVideo = hwMirror;
            hwLsSet('zoomAdvancedSettings', JSON.stringify(s));
        } catch (e) {}
    }
    syncAppMirrorSetting();

    // --- Alapértelmezett kamera és mikrofon ---
    // Az eszközlistában a kívánt kamera kerül előre (a Zoom és az oldal is az első
    // kamerát választja alapból), a mikrofont pedig az oldal saját mentett
    // beállításába ("zoomMicrophonePreference") írjuk be - minden betöltéskor
    // egyszer, így ha az órán kézzel mást választasz, az addig megmarad.
    function hwIsAliasDevice(d) { return d.deviceId === 'default' || d.deviceId === 'communications'; }
    function hwCameraRank(d) {
        for (let i = 0; i < HW_CAMERA_PREFERENCE.length; i++) if (HW_CAMERA_PREFERENCE[i].test(d.label || '')) return i;
        return HW_CAMERA_PREFERENCE.length;
    }
    function hwSortDevices(list) {
        const cams = list.filter(d => d.kind === 'videoinput');
        if (cams.length < 2) return list;
        const sorted = cams.slice().sort((a, b) => hwCameraRank(a) - hwCameraRank(b));
        let i = 0;
        return list.map(d => (d.kind === 'videoinput' ? sorted[i++] : d));
    }
    let hwMicPreferenceApplied = false;
    const hwDeviceLabels = new Map();   // kamera-azonosító -> név
    function hwApplyDevicePreferences(list) {
        list.forEach(d => { if (d.kind === 'videoinput' && d.label) hwDeviceLabels.set(d.deviceId, d.label); });
        const cams = list.filter(d => d.kind === 'videoinput' && d.label);
        const bestCam = cams.slice().sort((a, b) => hwCameraRank(a) - hwCameraRank(b))[0];
        if (bestCam && hwCameraRank(bestCam) < HW_CAMERA_PREFERENCE.length) hwPreferredCameraId = bestCam.deviceId;
        if (hwMicPreferenceApplied) return;
        const mic = list.find(d => d.kind === 'audioinput' && !hwIsAliasDevice(d) && HW_MIC_PREFERENCE.test(d.label || ''));
        if (!mic && !list.some(d => d.label)) return;   // még nincsenek nevek - később újra
        hwMicPreferenceApplied = true;
        if (mic) hwLsSet('zoomMicrophonePreference', mic.deviceId);
    }
    if (window.MediaDevices && MediaDevices.prototype.enumerateDevices) {
        const origEnumerate = MediaDevices.prototype.enumerateDevices;
        MediaDevices.prototype.enumerateDevices = function() {
            return origEnumerate.apply(this, arguments).then(list => {
                try { hwApplyDevicePreferences(list); return hwSortDevices(list); } catch (e) { return list; }
            });
        };
        try { navigator.mediaDevices.enumerateDevices().catch(() => {}); } catch (e) {}
    }

    // --- A felhasználó kérte-e a kamerát? ---
    const CAMERA_INTENT_MS = 20000;   // kamera-gomb után ennyi ideig indulhat a kamera
    const BUTTON_INTENT_MS = 1500;    // bármely (ikon)gomb után ennyi ideig
    const CAMERA_CONTROL_RE = /kamer|camera|fa-video\b|videocam/i;
    let cameraIntentUntil = 0;
    let buttonIntentUntil = 0;
    function noteUserIntent(target) {
        const el = target && (target.nodeType === 1 ? target : target.parentElement);
        if (!el || !el.closest || el.closest('.hw-cam-extra')) return;
        const ctl = el.closest('button, [role="button"], select, a, label');
        if (!ctl) return;
        buttonIntentUntil = Date.now() + BUTTON_INTENT_MS;
        const desc = [ctl.textContent, ctl.getAttribute('title'), ctl.getAttribute('aria-label'),
            ctl.innerHTML.slice(0, 1500)].join(' ');
        if (CAMERA_CONTROL_RE.test(desc)) cameraIntentUntil = Date.now() + CAMERA_INTENT_MS;
    }
    ['pointerdown', 'click'].forEach(type => {
        EventTarget.prototype.addEventListener.call(window, type, e => { if (e.isTrusted) noteUserIntent(e.target); }, true);
    });
    EventTarget.prototype.addEventListener.call(window, 'keyup', e => {
        if (e.isTrusted && (e.key === 'Enter' || e.key === ' ')) noteUserIntent(document.activeElement);
    }, true);
    function cameraStartAllowed(stream) {
        const now = Date.now();
        if (now < cameraIntentUntil || now < buttonIntentUntil) return true;
        // ha már megy a kamera (pl. kameraváltás), azt ne akadályozzuk
        try { if (stream && typeof stream.isCapturingVideo === 'function' && stream.isCapturingVideo()) return true; } catch (e) {}
        return false;
    }

    // --- A Zoom SDK stream-osztályának "megfogása" ---
    // Az SDK a stream-objektum belsejét egy Symbol("stream") kulcs alatt tárolja,
    // és ezt a kulcsot a konstruktorban állítja be. A Symbol létrehozását
    // figyelve (még az oldal kódja előtt) erre a kulcsra egy egyszeri "csapdát"
    // teszünk: amikor az SDK létrehozza a stream-objektumot, megkapjuk, és az
    // osztályának metódusait kiegészítjük.
    const hwPatchedProtos = new WeakSet();
    function patchZoomStreamProto(proto) {
        if (!proto || hwPatchedProtos.has(proto)) return;
        if (typeof proto.startVideo !== 'function' || typeof proto.mirrorVideo !== 'function') return;
        hwPatchedProtos.add(proto);
        const origStart = proto.startVideo;
        const origMirror = proto.mirrorVideo;
        proto.__hwOrigMirror = origMirror;
        proto.startVideo = function(options) {
            hwStream = this;
            if (!cameraStartAllowed(this)) {
                console.info('[Hollywood] A kamera automatikus bekapcsolását kihagytam (alapból kikapcsolva).');
                return Promise.resolve();
            }
            const self = this;
            const opts = Object.assign({}, options || {}, { mirrored: hwMirror });
            // Alapértelmezett kamera: ha az oldal nem ad meg konkrét kamerát, akkor az
            // ebben a munkamenetben kézzel választott, különben az USB Camera
            // (ha az nincs: Integrated Camera).
            if (opts.cameraId && opts.cameraId !== 'default') hwSessionCameraId = opts.cameraId;
            else if (hwSessionCameraId || hwPreferredCameraId) opts.cameraId = hwSessionCameraId || hwPreferredCameraId;
            return Promise.resolve(origStart.call(this, opts)).then(result => {
                try { Promise.resolve(origMirror.call(self, hwMirror)).catch(() => {}); } catch (e) {}
                return result;
            });
        };
        // Az oldal saját hívásai is mindig a MI beállításunkat alkalmazzák.
        proto.mirrorVideo = function() {
            hwStream = this;
            return origMirror.call(this, hwMirror);
        };
        if (typeof proto.switchCamera === 'function') {
            const origSwitch = proto.switchCamera;
            proto.switchCamera = function(cameraId) {
                if (typeof cameraId === 'string' && cameraId && cameraId !== 'default') hwSessionCameraId = cameraId;
                return origSwitch.apply(this, arguments);
            };
        }
        // A kameralistában a kívánt kamera legyen az első (az oldal ezt választja ki).
        if (typeof proto.getCameraList === 'function') {
            const origList = proto.getCameraList;
            proto.getCameraList = function() {
                const res = origList.apply(this, arguments);
                const sortList = l => (Array.isArray(l)
                    ? l.slice().sort((a, b) => hwCameraRank(a || {}) - hwCameraRank(b || {})) : l);
                return res && typeof res.then === 'function' ? res.then(sortList) : sortList(res);
            };
        }
        console.info('[Hollywood] Zoom kamera-kezelés aktív.');
    }
    (function hookZoomStreamSymbol() {
        const NativeSymbol = window.Symbol;
        if (typeof NativeSymbol !== 'function' || NativeSymbol.__hwWrapped) return;
        const traps = [];
        function removeTraps() {
            traps.forEach(sym => { try { delete Object.prototype[sym]; } catch (e) {} });
            traps.length = 0;
        }
        function restoreSymbol() { if (window.Symbol === HwSymbol) window.Symbol = NativeSymbol; }
        function trapSymbol(sym) {
            try {
                Object.defineProperty(Object.prototype, sym, {
                    configurable: true, enumerable: false,
                    get: function() { return undefined; },
                    set: function(value) {
                        Object.defineProperty(this, sym, { value: value, writable: true, configurable: true, enumerable: true });
                        try {
                            const proto = Object.getPrototypeOf(this);
                            if (proto && typeof proto.startVideo === 'function' && typeof proto.mirrorVideo === 'function') {
                                hwStream = this;
                                patchZoomStreamProto(proto);
                                removeTraps();
                                restoreSymbol();
                            }
                        } catch (e) {}
                    }
                });
                traps.push(sym);
            } catch (e) {}
        }
        const HwSymbol = function Symbol(description) {
            if (new.target) throw new TypeError('Symbol is not a constructor');
            const sym = NativeSymbol(description);
            if (description === 'stream') trapSymbol(sym);
            return sym;
        };
        Reflect.ownKeys(NativeSymbol).forEach(k => {
            if (k === 'length' || k === 'name' || k === 'prototype') return;
            try { Object.defineProperty(HwSymbol, k, Object.getOwnPropertyDescriptor(NativeSymbol, k)); } catch (e) {}
        });
        try { HwSymbol.prototype = NativeSymbol.prototype; } catch (e) {}
        HwSymbol.toString = function() { return NativeSymbol.toString(); };
        HwSymbol.__hwWrapped = true;
        window.Symbol = HwSymbol;
        // Az oldal kódja az első másodpercekben betöltődik - utána már nincs
        // szükség a figyelésre (a csapda a stream létrejöttéig marad).
        EventTarget.prototype.addEventListener.call(window, 'load', () => setTimeout(restoreSymbol, 5000));
    })();

    // --- Kamerakép közelítése ---
    // Ha a kamera tud hardveresen közelíteni, azt használjuk (egyszeri beállítás).
    // Ha nem (pl. az USB Camera), a kamera képének közepéből vágunk ki egy részt.
    //
    // Élesben kimérve, a lefagyás oka: a Zoom képfeldolgozása (virtuális háttér)
    // leáll vagy belassul, ha a futó kamerakép bármilyen mérete menet közben
    // megváltozik. Ezért a kép "geometriája" egy kamera-indítás alatt SOSEM változik:
    //  - induláskor a kamera saját (natív) felbontásában kérjük a képet - a Chrome
    //    nem méretez át semmit -, és ebből a közelítésnek megfelelő középső részt
    //    adjuk tovább. A kivágás nem nyúl a pixelekhez (nem másol, nem rajzol
    //    újra), csak megmondja, melyik rész látszódjon;
    //  - a csúszka húzása közben a közelítés csak a SAJÁT előnézeteden látszik
    //    (a böngésző nagyítja meg a megjelenített képet), a Zoomba menő kép nem
    //    változik;
    //  - a csúszka elengedésekor, ha a kamera be van kapcsolva, a script egyszer
    //    ki- és bekapcsolja a kamerát (kb. 1-2 mp), és az új kép már a beállított
    //    közelítéssel indul. Utána a gépnek nincs vele dolga.
    const hwCameraFeeds = new Set();   // futó kamerák
    const hwStats = { frames: 0, errors: 0, restarts: 0 };
    let hwPtzState = 'prompt';
    try {
        navigator.permissions.query({ name: 'camera', panTiltZoom: true })
            .then(p => { hwPtzState = p.state; p.onchange = () => { hwPtzState = p.state; }; })
            .catch(() => {});
    } catch (e) {}
    function hwZoomFactor() { return 1 + (HW_SOFT_ZOOM_MAX - 1) * hwZoomPercent / 100; }
    function even2(n) { return Math.max(2, Math.round(n / 2) * 2); }
    // Hardveres zoom értéke (null, ha a kamera nem tud közelíteni).
    function hwHardwareZoomValue(track) {
        let caps;
        try { caps = track.getCapabilities ? track.getCapabilities() : null; } catch (e) { caps = null; }
        const z = caps && caps.zoom;
        if (!z || typeof z.min !== 'number' || !(z.max > z.min)) return null;
        let v = z.min + (z.max - z.min) * hwZoomPercent / 100;
        if (z.step > 0) v = z.min + Math.round((v - z.min) / z.step) * z.step;
        return Math.min(z.max, Math.max(z.min, v));
    }
    function hwConstraintNum(c) {
        if (typeof c === 'number') return c;
        if (!c || typeof c !== 'object') return null;
        for (const k of ['exact', 'ideal', 'max', 'min']) if (typeof c[k] === 'number') return c[k];
        return null;
    }
    // A kamerától kért (natív) felbontás: akkora, hogy a kivágott rész körülbelül a
    // Zoom által kért méretű legyen (legfeljebb HW_MAX_CAPTURE).
    function hwCaptureSize(req, f) {
        return {
            width: even2(Math.min(Math.max(HW_MAX_CAPTURE.width, req.w), req.w * f)),
            height: even2(Math.min(Math.max(HW_MAX_CAPTURE.height, req.h), req.h * f))
        };
    }
    function hwViewZoomFrame(frame, feed) {
        const r = frame.visibleRect || { x: 0, y: 0, width: frame.codedWidth, height: frame.codedHeight };
        const dw = even2(feed.req.w), dh = even2(feed.req.h);
        // A kivágás mérete ennél a kamera-indításnál rögzített (az első képkockából számoljuk).
        if (!feed.crop || feed.crop.srcW !== r.width || feed.crop.srcH !== r.height) {
            const f = feed.f;
            let w = even2(r.width / f), h = even2(w * dh / dw);
            if (h > r.height) { h = even2(r.height / f); w = Math.min(r.width, even2(h * dw / dh)); }
            w = Math.min(w, r.width); h = Math.min(h, r.height);
            feed.crop = { srcW: r.width, srcH: r.height, w: w, h: h,
                x: Math.floor((r.width - w) / 4) * 2, y: Math.floor((r.height - h) / 4) * 2 };
        }
        const c = feed.crop;
        if (c.w === r.width && c.h === r.height && frame.displayWidth === dw && frame.displayHeight === dh) return frame;
        try {
            const out = new VideoFrame(frame, {
                visibleRect: { x: r.x + c.x, y: r.y + c.y, width: c.w, height: c.h },
                displayWidth: dw, displayHeight: dh
            });
            frame.close();
            hwStats.frames++;
            return out;
        } catch (e) {
            hwStats.errors++;
            return frame;
        }
    }
    function hwMakeViewZoomTrack(src, req, f) {
        if (typeof MediaStreamTrackProcessor !== 'function' || typeof MediaStreamTrackGenerator !== 'function'
            || typeof VideoFrame !== 'function' || typeof TransformStream !== 'function') return null;
        let processor, generator;
        try {
            processor = new MediaStreamTrackProcessor({ track: src });
            generator = new MediaStreamTrackGenerator({ kind: 'video' });
        } catch (e) { return null; }
        const feed = { src: src, out: generator, req: req, mode: 'view', f: f, crop: null };
        processor.readable
            .pipeThrough(new TransformStream({ transform(frame, controller) { controller.enqueue(hwViewZoomFrame(frame, feed)); } }))
            .pipeTo(generator.writable)
            .catch(() => {})
            .then(() => { hwCameraFeeds.delete(feed); hwUpdatePreviewScale(); });
        // A Zoom felé a kimenő sáv úgy viselkedjen, mint maga a kamera.
        const nativeStop = generator.stop.bind(generator);
        generator.stop = function() { hwCameraFeeds.delete(feed); try { src.stop(); } catch (e) {} return nativeStop(); };
        generator.getSettings = function() {
            const s = Object.assign({}, src.getSettings());
            s.width = even2(feed.req.w); s.height = even2(feed.req.h);
            s.aspectRatio = s.width / s.height;
            return s;
        };
        generator.getCapabilities = function() { return src.getCapabilities(); };
        generator.getConstraints = function() { return src.getConstraints(); };
        // A kamera beállításain menet közben nem változtatunk (lásd fent).
        generator.applyConstraints = function() { return Promise.resolve(); };
        try { Object.defineProperty(generator, 'label', { value: src.label, configurable: true }); } catch (e) {}
        hwCameraFeeds.add(feed);
        return generator;
    }
    function hwLiveViewFeed() {
        let feed = null;
        hwCameraFeeds.forEach(f => { if (f.mode === 'view' && f.src.readyState === 'live') feed = f; });
        return feed;
    }
    // Élő előnézet: a saját képedet (a beállítások ablakában és a jobb alsó
    // sarokban) a böngésző nagyítja/kicsinyíti, amíg az új közelítés be nem áll.
    function hwUpdatePreviewScale() {
        const feed = hwLiveViewFeed();
        const k = feed ? hwZoomFactor() / feed.f : 1;
        const ids = new Set();
        document.querySelectorAll('[role="dialog"] video, .modal video').forEach(v => {
            const t = v.srcObject && v.srcObject.getVideoTracks && v.srcObject.getVideoTracks()[0];
            if (t) ids.add(t.id);
        });
        document.querySelectorAll('video').forEach(v => {
            const t = v.srcObject && v.srcObject.getVideoTracks && v.srcObject.getVideoTracks()[0];
            if (t && ids.has(t.id) && Math.abs(k - 1) > 0.005) {
                v.style.setProperty('scale', String(k));
                v.__hwScaled = true;
                if (v.parentElement && k > 1) v.parentElement.style.setProperty('overflow', 'hidden');
            } else if (v.__hwScaled) {
                v.style.removeProperty('scale');
                v.__hwScaled = false;
            }
        });
    }
    // A kamera egyszeri ki- és bekapcsolása a beállítások ablakának saját gombjával
    // (így az oldal és a Zoom állapota is rendben marad).
    function hwDialogCameraButton(re) {
        return Array.from(document.querySelectorAll('[role="dialog"] button, .modal button'))
            .find(b => re.test((b.textContent || '').trim()) && !b.disabled && b.offsetParent !== null) || null;
    }
    let hwRestarting = false;
    let hwLastRestartedFeed = null;
    async function hwRestartCameraForZoom() {
        if (hwRestarting) return;
        const feed = hwLiveViewFeed();
        if (!feed || Math.abs(feed.f - hwZoomFactor()) < 0.005) return;
        // ugyanazt a kameraképet csak egyszer próbáljuk újraindítani (ha a Zoom
        // nem indított új képet, nem próbálkozunk végtelenül)
        if (feed === hwLastRestartedFeed) return;
        const offBtn = hwDialogCameraButton(/^Kamera kikapcsolása$/);
        if (!offBtn) return;   // nincs bekapcsolt kamera: a következő indításkor érvényesül
        hwLastRestartedFeed = feed;
        hwRestarting = true;
        try {
            cameraIntentUntil = Date.now() + CAMERA_INTENT_MS;
            offBtn.click();
            let onBtn = null;
            for (let i = 0; i < 40 && !onBtn; i++) {
                await new Promise(r => setTimeout(r, 150));
                onBtn = hwDialogCameraButton(/^Kamera bekapcsolása$/);
            }
            if (onBtn) {
                await new Promise(r => setTimeout(r, 300));
                cameraIntentUntil = Date.now() + CAMERA_INTENT_MS;
                onBtn.click();
                hwStats.restarts++;
            }
        } finally {
            setTimeout(() => { hwRestarting = false; hwZoomApplySoon(1500); }, 2500);
        }
    }
    let hwZoomApplyTimer = null;
    function hwZoomApplySoon(ms) {
        clearTimeout(hwZoomApplyTimer);
        hwZoomApplyTimer = setTimeout(hwRestartCameraForZoom, ms);
    }
    // A csúszka: húzás közben csak az előnézet, elengedéskor (rövid várakozás
    // után) az egyszeri átállítás.
    function hwOnZoomChanged(released) {
        hwCameraFeeds.forEach(feed => {
            if (feed.src.readyState !== 'live') { hwCameraFeeds.delete(feed); return; }
            if (feed.mode === 'hardware') {
                const v = hwHardwareZoomValue(feed.src);
                if (v !== null) feed.src.applyConstraints({ advanced: [{ zoom: v }] }).catch(() => {});
            }
        });
        hwUpdatePreviewScale();
        if (released) hwZoomApplySoon(400);   // csak elengedéskor (vagy billentyűvel állítva)
        hwUpdateCameraControls();
    }
    if (window.MediaDevices && MediaDevices.prototype.getUserMedia) {
        const origGUM = MediaDevices.prototype.getUserMedia;
        MediaDevices.prototype.getUserMedia = function(constraints) {
            const self = this;
            let c = constraints, req = null, f = 1;
            try {
                if (c && c.video) {
                    const v = Object.assign({}, c.video === true ? {} : c.video);
                    req = { w: even2(hwConstraintNum(v.width) || 640), h: even2(hwConstraintNum(v.height) || 360) };
                    // Alapértelmezett kamera: ha a kérés nem nevez meg kamerát (pl. a
                    // beállítások előnézete), ne a Windows alapértelmezettje (Integrated
                    // Camera) induljon, hanem az ebben a munkamenetben választott, vagy
                    // az USB Camera.
                    const exactId = v.deviceId && (typeof v.deviceId === 'string' ? v.deviceId : (v.deviceId.exact || v.deviceId.ideal));
                    if (exactId && exactId !== 'default') hwSessionCameraId = exactId;
                    else if (hwSessionCameraId || hwPreferredCameraId) v.deviceId = { exact: hwSessionCameraId || hwPreferredCameraId };
                    // A "zoom: true" kéri el a hardveres közelítés jogát (csak olyan
                    // kameránál kérdez rá a Chrome, ami tud ilyet).
                    if (hwPtzState !== 'denied' && !('zoom' in v)) v.zoom = true;
                    // Közelítés csak az USB Camerán (az Integrated Camera képéhez nem nyúlunk).
                    const camId = v.deviceId && (v.deviceId.exact || v.deviceId.ideal || v.deviceId);
                    const camLabel = typeof camId === 'string' ? (hwDeviceLabels.get(camId) || '') : '';
                    f = hwZoomMode === 'hardware' || !HW_ZOOM_CAMERA.test(camLabel) ? 1 : hwZoomFactor();
                    if (f > 1.001) {
                        // natív kameramód, a Chrome nem méretez át
                        const size = hwCaptureSize(req, f);
                        v.width = { ideal: size.width };
                        v.height = { ideal: size.height };
                        v.resizeMode = 'none';
                        delete v.advanced;
                    }
                    c = Object.assign({}, c, { video: v });
                }
            } catch (e) { c = constraints; req = null; }
            const finish = stream => {
                if (!req) return stream;
                try {
                    const src = stream.getVideoTracks()[0];
                    if (!src) return stream;
                    if (!HW_ZOOM_CAMERA.test(src.label || '')) {
                        // nem az USB Camera: a kép érintetlenül megy tovább
                        hwZoomMode = 'off';
                        hwUpdateCameraControls();
                        setTimeout(hwUpdatePreviewScale, 300);
                        return stream;
                    }
                    const hv = hwHardwareZoomValue(src);
                    if (hv !== null) {
                        // A kamera maga tud közelíteni: egyszeri beállítás, eredeti felbontással.
                        hwZoomMode = 'hardware';
                        const feed = { src: src, out: src, req: req, mode: 'hardware' };
                        hwCameraFeeds.add(feed);
                        src.addEventListener('ended', () => hwCameraFeeds.delete(feed));
                        src.applyConstraints({ width: { ideal: req.w }, height: { ideal: req.h }, advanced: [{ zoom: hv }] }).catch(() => {});
                        hwUpdateCameraControls();
                        return stream;
                    }
                    if (f <= 1.001) {
                        // 0%: nincs mit kivágni - a kamera képe érintetlenül megy tovább,
                        // csak nyilvántartjuk (az előnézethez és a későbbi átállításhoz).
                        hwZoomMode = 'view';
                        const feed = { src: src, out: src, req: req, mode: 'view', f: 1, crop: null };
                        hwCameraFeeds.add(feed);
                        src.addEventListener('ended', () => { hwCameraFeeds.delete(feed); hwUpdatePreviewScale(); });
                        hwUpdateCameraControls();
                        setTimeout(hwUpdatePreviewScale, 300);
                        return stream;
                    }
                    const out = hwMakeViewZoomTrack(src, req, f);
                    if (!out) { hwZoomMode = 'none'; hwUpdateCameraControls(); return stream; }
                    hwZoomMode = 'view';
                    hwUpdateCameraControls();
                    setTimeout(hwUpdatePreviewScale, 300);
                    return new MediaStream([out].concat(stream.getAudioTracks()));
                } catch (e) { return stream; }
            };
            return origGUM.call(this, c).then(finish, err => {
                // ha a módosított kérés nem sikerülne, az eredetivel próbáljuk újra
                if (c === constraints) throw err;
                return origGUM.call(self, constraints).then(finish);
            });
        };
    }
    window.__hollywoodCamera = () => ({
        zoomPercent: hwZoomPercent, factor: hwZoomFactor(), mode: hwZoomMode, mirror: hwMirror,
        preferredCamera: hwPreferredCameraId, sessionCamera: hwSessionCameraId, zoomStreamPatched: !!hwStream, stats: hwStats,
        feeds: Array.from(hwCameraFeeds).map(f => ({ mode: f.mode, label: f.src.label, out: f.req.w + 'x' + f.req.h,
            camera: (f.src.getSettings().width || '?') + 'x' + (f.src.getSettings().height || '?'), factor: f.f,
            crop: f.crop ? f.crop.w + 'x' + f.crop.h : null }))
    });

    // --- Zoom-beállítások ablak: "Közelítés" csúszka + "Kamera tükrözése" gomb ---
    // A Kamera sor alá, a Mikrofon felirat fölé kerül. A beszúrás MutationObserverből
    // történik, még az ablak első kirajzolása előtt, így semmi nem ugrik el utólag.
    function hwFindLeafLabel(root, text) {
        const els = root.querySelectorAll('label, div, span, p, h5, h6, strong, b, legend');
        for (const el of els) {
            if (el.childElementCount === 0 && el.textContent.trim() === text) return el;
        }
        return null;
    }
    function hwStyleMirrorButton(btn) {
        btn.setAttribute('aria-pressed', hwMirror ? 'true' : 'false');
        btn.title = hwMirror ? 'A kamerakép tükrözve (kattints a kikapcsoláshoz)' : 'A kamerakép nincs tükrözve (kattints a bekapcsoláshoz)';
        const green = btn.__hwGreen || '#1e9a38';
        if (hwMirror) {
            ['background', 'background-color', 'color', 'border-color'].forEach(p => btn.style.removeProperty(p));
        } else {
            btn.style.setProperty('background', '#fff', 'important');
            btn.style.setProperty('color', green, 'important');
            btn.style.setProperty('border-color', green, 'important');
        }
    }
    function hwUpdateCameraControls() {
        document.querySelectorAll('.hw-cam-extra').forEach(box => {
            const slider = box.querySelector('input[type="range"]');
            const pct = box.querySelector('.hw-zoom-pct');
            const note = box.querySelector('.hw-zoom-note');
            const btn = box.querySelector('.hw-mirror-btn');
            if (slider && document.activeElement !== slider) slider.value = String(hwZoomPercent);
            if (pct) pct.textContent = Math.round(hwZoomPercent) + '%';
            if (note) note.textContent = hwZoomMode === 'none' ? ' – ez a böngésző nem támogatja a közelítést' : (hwZoomMode === 'off' ? ' – csak az USB Camerán működik' : '');
            if (btn) hwStyleMirrorButton(btn);
        });
    }
    function hwBuildCameraControls(dlg) {
        if (dlg.querySelector('.hw-cam-extra')) return;
        const camLabel = hwFindLeafLabel(dlg, 'Kamera');
        const micLabel = hwFindLeafLabel(dlg, 'Mikrofon');
        if (!camLabel || !micLabel) return;
        // A Mikrofon blokkja: a Mikrofon felirattól felfelé addig megyünk, amíg a
        // szülő már a Kamera feliratot is tartalmazza - ez elé szúrunk be.
        let micBlock = micLabel;
        while (micBlock.parentElement && !micBlock.parentElement.contains(camLabel)) micBlock = micBlock.parentElement;
        const container = micBlock.parentElement;
        if (!container) return;
        const camBtn = Array.from(dlg.querySelectorAll('button'))
            .find(b => /Kamera\s+(be|ki)kapcsolása/i.test(b.textContent || ''));
        const camSelect = dlg.querySelector('select');
        const prev = micBlock.previousElementSibling;

        const box = document.createElement('div');
        box.className = 'hw-cam-extra';
        if (prev) box.style.marginBottom = window.getComputedStyle(prev).marginBottom;

        const label = document.createElement(camLabel.tagName === 'LABEL' ? 'label' : camLabel.tagName.toLowerCase());
        label.className = camLabel.className;
        label.style.whiteSpace = 'nowrap';
        label.style.overflow = 'hidden';
        label.style.textOverflow = 'ellipsis';
        label.style.maxWidth = '100%';
        label.textContent = 'Közelítés';
        const note = document.createElement('span');
        note.className = 'hw-zoom-note';
        note.style.cssText = 'font-size: 0.85em; color: #6c757d;';
        label.appendChild(note);
        box.appendChild(label);

        const row = document.createElement('div');
        let gap = 12;
        if (camBtn && camSelect) {
            const g = camBtn.getBoundingClientRect().left - camSelect.getBoundingClientRect().right;
            if (g > 0 && g < 60) gap = g;
        }
        row.style.cssText = 'display: flex; align-items: center; gap: ' + gap + 'px;';

        const left = document.createElement('div');
        left.style.cssText = 'flex: 1 1 auto; min-width: 0; display: flex; align-items: center; gap: 10px;';
        const slider = document.createElement('input');
        slider.type = 'range';
        slider.min = '0'; slider.max = '100'; slider.step = '1';
        slider.value = String(hwZoomPercent);
        slider.setAttribute('aria-label', 'Kamera közelítése');
        const green = camBtn ? window.getComputedStyle(camBtn).backgroundColor : '#1e9a38';
        slider.style.cssText = 'flex: 1 1 auto; min-width: 0; margin: 0; cursor: pointer; accent-color: ' + green + ';';
        const pct = document.createElement('span');
        pct.className = 'hw-zoom-pct';
        pct.style.cssText = 'flex: 0 0 3.2em; text-align: right; font-variant-numeric: tabular-nums;';
        pct.textContent = Math.round(hwZoomPercent) + '%';
        left.appendChild(slider);
        left.appendChild(pct);
        row.appendChild(left);

        const btn = document.createElement('button');
        btn.type = 'button';
        btn.className = (camBtn ? camBtn.className : 'btn btn-success') + ' hw-mirror-btn';
        btn.textContent = 'Kamera tükrözése';
        btn.__hwGreen = green;
        if (camBtn) {
            const w = camBtn.getBoundingClientRect().width;
            if (w > 0) btn.style.flex = '0 0 ' + w + 'px';
        }
        btn.style.whiteSpace = 'nowrap';
        row.appendChild(btn);
        box.appendChild(row);

        slider.addEventListener('input', () => {
            hwZoomPercent = Math.min(100, Math.max(0, parseFloat(slider.value) || 0));
            hwLsSet(HW_ZOOM_KEY, String(hwZoomPercent));
            pct.textContent = Math.round(hwZoomPercent) + '%';
            hwOnZoomChanged(false);
        });
        slider.addEventListener('change', () => hwOnZoomChanged(true));
        btn.addEventListener('click', e => {
            e.preventDefault();
            e.stopPropagation();
            hwMirror = !hwMirror;
            hwLsSet(HW_MIRROR_KEY, hwMirror ? '1' : '0');
            syncAppMirrorSetting();
            hwStyleMirrorButton(btn);
            // azonnali, egyszeri átállítás a Zoomban (ha épp megy a kamera)
            const proto = hwStream && Object.getPrototypeOf(hwStream);
            if (proto && proto.__hwOrigMirror) {
                try { Promise.resolve(proto.__hwOrigMirror.call(hwStream, hwMirror)).catch(() => {}); } catch (err) {}
            }
        });

        container.insertBefore(box, micBlock);
        hwStyleMirrorButton(btn);
        hwUpdateCameraControls();
    }
    function hwEnsureCameraControls() {
        const dialogs = document.querySelectorAll('[role="dialog"], .modal, .modal-content');
        dialogs.forEach(dlg => { try { hwBuildCameraControls(dlg); } catch (e) {} });
    }

    // --- Hangfelvételek neve (pl. T2.1.mp3): csak felirat, nem szerkeszthető ---
    // Kijelölni és másolni lehet, de belekattintva nem lehet átírni.
    const AUDIO_NAME_RE = /\.(mp3|wav|m4a|ogg|oga|aac|flac|wma|webm)\s*$/i;
    function hwLockAudioNames() {
        document.querySelectorAll('input, textarea, [contenteditable]:not([contenteditable="false"])').forEach(el => {
            if (el.classList.contains('hw-audio-name')) {
                if (el.tagName === 'INPUT' || el.tagName === 'TEXTAREA') { if (!el.readOnly) el.readOnly = true; }
                else if (el.getAttribute('contenteditable') !== 'false') el.setAttribute('contenteditable', 'false');
                return;
            }
            const isField = el.tagName === 'INPUT' || el.tagName === 'TEXTAREA';
            if (el.tagName === 'INPUT' && !/^(text|search|url)?$/i.test(el.getAttribute('type') || '')) return;
            const value = isField ? el.value : el.textContent;
            const inAudioWidget = !!el.closest('[data-type="mp3"]');
            if (!inAudioWidget && !AUDIO_NAME_RE.test((value || '').trim())) return;
            el.classList.add('hw-audio-name');
            if (isField) el.readOnly = true;
            else el.setAttribute('contenteditable', 'false');
        });
    }
    // A hanganyag-dobozok címe (pl. "T2.1.mp3") az oldalon egy "kattintásra
    // szerkeszthető" elem: rákattintva szövegmezővé alakul. Ezt az elemet teljesen
    // elrejtjük, és a helyére egy sima, ugyanúgy kinéző feliratot teszünk - erre
    // kattintva semmi nem történik, csak kijelölni lehet. A csere még a kirajzolás
    // előtt történik, így semmi nem ugrik el.
    function hwStaticAudioTitles() {
        document.querySelectorAll('[data-type="mp3"] hr').forEach(hr => {
            const card = hr.parentElement;
            if (!card) return;
            const orig = Array.from(card.children).find(c => c !== hr && c.nextElementSibling === hr
                && !c.classList.contains('hw-mp3-title'))
                || card.querySelector(':scope > [data-hw-orig]');
            if (!orig) return;
            const field = orig.querySelector('input, textarea');
            const text = ((field ? field.value : orig.textContent) || '').trim();
            if (!text) return;
            let label = orig.previousElementSibling;
            if (!label || !label.classList.contains('hw-mp3-title')) {
                // a kinézetet az eredeti felirattól vesszük át
                const src = Array.from(orig.querySelectorAll('*')).find(e => e.childElementCount === 0 && (e.textContent || '').trim()) || field || orig;
                const cs = window.getComputedStyle(src);
                const box = orig.getBoundingClientRect();
                label = document.createElement('div');
                label.className = 'hw-mp3-title';
                ['font-family', 'font-size', 'font-weight', 'font-style', 'line-height', 'letter-spacing', 'color']
                    .forEach(p => label.style.setProperty(p, cs.getPropertyValue(p)));
                if (!field) {
                    label.style.setProperty('padding', cs.getPropertyValue('padding'));
                    if (box.height) label.style.setProperty('min-height', box.height + 'px');
                }
                card.insertBefore(label, orig);
            }
            if (label.textContent !== text) label.textContent = text;
            orig.setAttribute('data-hw-orig', '1');
        });
    }
    function injectAudioNameStyle() {
        if (document.getElementById('hollywood-audio-names')) return;
        const style = document.createElement('style');
        style.id = 'hollywood-audio-names';
        style.textContent = `
            .hw-silent-menu .stud-menu-up,
            .hw-silent-menu #studmenu + [role="menu"] {
              visibility: hidden !important;
              transition: none !important;
            }
            [data-type="mp3"] [data-hw-orig] {
              display: none !important;
            }
            .hw-mp3-title {
              display: flex !important;
              align-items: center;
              cursor: text !important;
              user-select: text !important;
              -webkit-user-select: text !important;
              white-space: nowrap;
              overflow: hidden;
              text-overflow: ellipsis;
            }
            .hw-audio-name,
            [data-type="mp3"] input[type="text"],
            [data-type="mp3"] input:not([type]),
            [data-type="mp3"] textarea {
              cursor: text !important;
              caret-color: transparent !important;
              background-color: transparent !important;
              border-color: transparent !important;
              box-shadow: none !important;
              outline: none !important;
              resize: none !important;
            }
        `;
        (document.head || document.documentElement).appendChild(style);
    }
    if (document.head || document.documentElement) injectAudioNameStyle();
    else onDomReady(injectAudioNameStyle);
    // Biztonsági háló: ha valami mégis szerkesztené (pl. az oldal visszaírná a mezőt
    // szerkeszthetőre), a gépelés/beillesztés/ejtés ne menjen át.
    ['beforeinput', 'drop'].forEach(type => {
        EventTarget.prototype.addEventListener.call(window, type, e => {
            const t = e.target;
            if (t && t.closest && t.closest('.hw-audio-name')) { e.preventDefault(); e.stopImmediatePropagation(); }
        }, true);
    });

    // Ezeket a lehető leghamarabb (a kirajzolás előtt) futtatjuk minden DOM-változásnál.
    let hwUiScheduled = false;
    function hwRunUiFixes() {
        hwUiScheduled = false;
        try { hwEnsureCameraControls(); } catch (e) {}
        try { hwLockAudioNames(); } catch (e) {}
        try { hwStaticAudioTitles(); } catch (e) {}
    }
    function startHwUiObserver() {
        new MutationObserver(() => {
            // mikrotaszkban fut: a böngésző a következő kirajzolás előtt lefuttatja
            if (hwUiScheduled) return;
            hwUiScheduled = true;
            Promise.resolve().then(hwRunUiFixes);
        }).observe(document.documentElement, { childList: true, subtree: true });
        hwRunUiFixes();
    }
    if (document.documentElement) startHwUiObserver();
    else document.addEventListener('DOMContentLoaded', startHwUiObserver);
    setInterval(hwRunUiFixes, 1000);

    // --- Másolás / beillesztés tiltásának feloldása ---
    // Ezeket az eseményeket teljesen letiltjuk (ezekhez nincs szükség Tab-logikára)
    // A 'beforeinput'-ot is idevettük, mert sok (pl. React-alapú) oldal ezen keresztül
    // (inputType: "insertFromPaste") tiltja a beillesztést, nem csak a 'paste' eseményen.
    const fullyBlockedEvents = ['copy', 'paste', 'cut', 'contextmenu', 'selectstart', 'dragstart', 'beforeinput'];
    // A billentyűk, amikre a vágólap-tiltó scriptek jellemzően figyelnek (Ctrl/Cmd + C/V/X/A)
    const clipboardKeys = ['c', 'v', 'x', 'a'];
    function isClipboardShortcut(e) {
        if (!e) return false;
        const key = (e.key || '').toLowerCase();
        return (e.ctrlKey || e.metaKey) && clipboardKeys.includes(key);
    }
    const originalAddEventListener = EventTarget.prototype.addEventListener;
    EventTarget.prototype.addEventListener = function(type, listener, options) {
        if (fullyBlockedEvents.includes(type)) {
            // copy/paste/cut/beforeinput/stb. eseményekre egyáltalán nem engedjük
            // felcsatlakozni az oldal handlerét
            return;
        }
        if (type === 'keydown' && typeof listener === 'function') {
            // keydown-ot NEM tiltjuk le globálisan (mert az oldal saját Tab-kezelése is ezen megy),
            // csak azt a konkrét hívást nyeljük el, ami vágólap-parancsot akarna blokkolni.
            const wrappedListener = function(e) {
                if (isClipboardShortcut(e)) {
                    return; // ne engedjük az oldal handlerét lefutni Ctrl+C/V/X/A esetén
                }
                return listener.apply(this, arguments);
            };
            return originalAddEventListener.call(this, type, wrappedListener, options);
        }
        return originalAddEventListener.call(this, type, listener, options);
    };
    // Ha a tiltás inline attribútummal/property-vel (pl. oncopy="return false",
    // vagy el.onpaste = fn dinamikusan) megy, azt is nullázzuk - most már
    // azonnal (MutationObserver), nem csak másodpercenként.
    function clearInlineHandlers(root) {
        (root || document).querySelectorAll(
            'input, textarea, [oncopy], [onpaste], [oncut], [oncontextmenu], [onselectstart], [onbeforeinput]'
        ).forEach(el => {
            el.oncopy = null;
            el.onpaste = null;
            el.oncut = null;
            el.oncontextmenu = null;
            el.onselectstart = null;
            el.onbeforeinput = null;
        });
    }
    onDomReady(() => clearInlineHandlers());
    // Fallback, ha valami mégis a fenti réseken kívül kerülne be
    setInterval(() => clearInlineHandlers(), 1000);
    // Azonnali reakció új mezők/dinamikusan beillesztett tartalom esetén,
    // hogy ne kelljen a fenti 1 másodperces intervallumra várni.
    function startObserver() {
        const observer = new MutationObserver((mutations) => {
            for (const m of mutations) {
                if (m.type === 'childList' && m.addedNodes.length) {
                    m.addedNodes.forEach(node => {
                        if (node.nodeType === 1) {
                            if (node.matches && (node.matches('input, textarea') )) {
                                clearInlineHandlers(node.parentNode || document);
                            } else {
                                clearInlineHandlers(node);
                            }
                        }
                    });
                } else if (m.type === 'attributes') {
                    clearInlineHandlers(m.target.parentNode || document);
                }
            }
        });
        observer.observe(document.documentElement, {
            childList: true,
            subtree: true,
            attributes: true,
            attributeFilter: ['oncopy', 'onpaste', 'oncut', 'oncontextmenu', 'onselectstart', 'onbeforeinput']
        });
    }
    if (document.documentElement) {
        startObserver();
    } else {
        onDomReady(startObserver);
    }
    // Késői indulás esetén (az oldal kódja már felcsatolta a tiltó kezelőit) a
    // vágólap-események továbbterjedését a legelső ponton (window, capture) állítjuk
    // meg - így az oldal kezelői nem futnak le, a böngésző alapművelete viszont igen.
    ['copy', 'paste', 'cut', 'contextmenu', 'selectstart', 'dragstart'].forEach(type => {
        originalAddEventListener.call(window, type, e => { e.stopImmediatePropagation(); }, true);
    });
    // A gombok (és gomb-szerű elemek) szövegét nem lehet kijelölni,
    // így pl. Ctrl+A esetén sem jelöli ki őket a böngésző, csak a sima szöveget.
    function injectButtonNoSelectStyle() {
        const style = document.createElement('style');
        style.id = 'hollywood-no-select-buttons';
        style.textContent = `
            button,
            input[type="button"],
            input[type="submit"],
            input[type="reset"],
            [role="button"],
            [class*="btn"],
            [class*="button"] {
                -webkit-user-select: none !important;
                -moz-user-select: none !important;
                -ms-user-select: none !important;
                user-select: none !important;
            }
        `;
        (document.head || document.documentElement).appendChild(style);
    }
    if (document.head || document.documentElement) {
        injectButtonNoSelectStyle();
    } else {
        onDomReady(injectButtonNoSelectStyle);
    }
    // ÚJ, BEILLESZTETT RÉSZ: a korábbi Stylus "Hollywood" userstyle
    // átirata. A @-moz-document domain(...) csomagolóra itt nincs
    // szükség, mert a fájl tetején lévő @match már eleve csak az
    // app.hollywoodnyelvstudio.hu domainen futtatja a szkriptet.
    //
    // FONTOS ELV: a teljes szélességre nyújtás KIZÁRÓLAG a tartalmi
    // widgetekre (data-type=..., .course-test) és azok belsejére
    // vonatkozik - a LAYOUT konténereket (.container, .row, .col-*,
    // valamint a bal oldali sáv / oldalsó panel elemeit) szándékosan
    // NEM piszkáljuk. Ha ezeket is 100%-ra nyújtanánk, a tartalom
    // ráfolyna a bal oldali sávra, és az kezelhetetlenné válna.
    // Így viszont a widgetek mindig a szülőjük teljes szélességét
    // kitöltik: amíg a bal sáv látszik, addig a mellette maradó helyet,
    // ha pedig a fenti menügombbal eltünteted a bal sávot, a container
    // magától kiszélesedik - és a widgetek automatikusan követik.
    //
    // (A gomb-kijelölés-tiltás magasabb CSS-specificitása miatt a lenti
    // globális "* { user-select: text }" szabály NEM írja felül a
    // gombokra vonatkozó "user-select: none"-t - a kettő békésen megfér
    // egymás mellett, mind a kettő !important, de a gombokra vonatkozó
    // szelektor specifikusabb.)
    function injectHollywoodLayoutStyle() {
        const style = document.createElement('style');
        style.id = 'hollywood-fullwidth-layout';
        style.textContent = `
            /* Minden elem, ahol az inline stílus max-width: 1024px */
            [style*="max-width: 1024px"] {
              max-width: 100% !important;
            }
            /* Minden widget típus és közvetlen gyerekük */
            [data-type="sayer"],
            [data-type="sayerorig"],
            [data-type="sayertalk"],
            [data-type="notes"],
            [data-type="corrector"],
            [data-type="download"],
            [data-type="mp3"],
            [data-type="testdrive"],
            [data-type="sayer"] > div,
            [data-type="sayerorig"] > div,
            [data-type="sayertalk"] > div {
              max-width: 100% !important;
              width: 100% !important;
            }
            /* drive elem: a szülőjéhez képest teljes szélességű - a 94%-os
               szélességet és a 3-3%-os térközt a lenti "Médiás widgetek"
               JS-rész állítja be (inline, így az erősebb ennél). */
            [data-type="drive"] {
              min-width: 100% !important;
              max-width: 100% !important;
              width: 100% !important;
            }
            /* course-test elem */
            .course-test {
              max-width: 100% !important;
              width: 100% !important;
            }
            /* Bootstrap d-inline-block felülírása */
            .d-inline-block {
              max-width: 100% !important;
              width: 100% !important;
            }
            /* A widgetek BELSEJÉBEN lévő wrapper divek is töltsék ki a
               widget teljes szélességét (a widget maga már 100%-os, de a
               belső burkolók gyakran tartalom-szélességűek maradnak).
               Szándékosan csak a data-type widgetek és a .course-test
               leszármazottaira szűkítve, hogy a layout ne sérüljön. */
            [data-type] > div > div,
            .course-test > div {
              max-width: 100% !important;
            }
            /* --- Beillesztés engedélyezése text input mezőkbe --- */
            input[type="text"] {
              pointer-events: auto !important;
              user-select: text !important;
              -webkit-user-select: text !important;
              -moz-user-select: text !important;
            }
            input[type="text"]:disabled,
            input[type="text"][readonly] {
              pointer-events: auto !important;
              opacity: 1 !important;
              background-color: initial !important;
            }
            /* --- Kijelölt szöveg másolásának engedélyezése mindenhol --- */
            * {
              user-select: text !important;
              -webkit-user-select: text !important;
              -moz-user-select: text !important;
              -ms-user-select: text !important;
            }
            /* --- A tartalomoszlop PIROS görgetősávja NE látszódjon --- */
            /* Az ablak jobb szélén futó piros sáv a tartalomoszlopé
               (#movescroll). A kártyákat a kártyalista SAJÁT, szürke sávja
               görgeti - az érintetlen marad, ahogy a bal oldali menü
               (offcanvasorig) piros sávja is. Maga a görgetés kikapcsolását
               a lenti "Az oldal alja" JS-rész intézi. */
            #movescroll,
            .scrollbar1.scrollbar2:not(.offcanvasorig) {
              scrollbar-width: none !important;
            }
            #movescroll::-webkit-scrollbar,
            .scrollbar1.scrollbar2:not(.offcanvasorig)::-webkit-scrollbar {
              width: 0 !important;
              height: 0 !important;
              display: none !important;
            }
            /* --- Bal oldali sáv: a diaszámok legyenek jól olvashatók --- */
            /* A számok az oldal saját inline stílusával abszolút pozicionált,
               9px-es szürke divek a listaelem jobb felső sarkában. Itt 2,5x
               nagyobbra, pirosra vesszük őket, fehér háttérrel és magasabb
               z-indexszel - így akkor is olvashatók, ha rálógnak a feliratra. */
            li.mycitem > div[style*="position: absolute"][style*="font-size: 9px"],
            li.mycitem > div[style*="position: absolute"][style*="top: 3px"][style*="right: 5px"] {
              font-size: 16px !important;
              line-height: 1.1 !important;
              color: #c8102e !important;
              background: #fff !important;
              z-index: 5 !important;
              padding: 0 3px !important;
              border-radius: 3px !important;
            }
        `;
        (document.head || document.documentElement).appendChild(style);
    }
    if (document.head || document.documentElement) {
        injectHollywoodLayoutStyle();
    } else {
        onDomReady(injectHollywoodLayoutStyle);
    }
    // ÚJ: dinamikus, JS-alapú javítás azokra az esetekre, amikor egy elem
    // NEM osztály vagy data-type alapján, hanem konkrét px-es inline
    // "max-width" / "width" értékkel szűkíti magát (pl. "max-width: 860px"),
    // amit a fenti statikus CSS szelektorok nem tudnak előre lefedni.
    //
    // KRITIKUS MEGSZORÍTÁS: ez a javítás KIZÁRÓLAG a tartalmi widgetek
    // (data-type=..., .course-test) BELSEJÉBEN fut. Korábban a teljes
    // dokumentumon végigment, és emiatt a bal oldali sáv saját inline
    // szélességét (pl. width: 300px) is 100%-ra írta át - ettől a bal
    // oldal kezelhetetlenné vált. A widget-gyökerekre szűkítéssel a
    // layout (bal sáv, fejléc, oldalsó panelek) garantáltan érintetlen
    // marad, mert azok soha nem leszármazottai ezeknek a gyökereknek.
    const WIDTH_FIX_ROOT_SELECTOR = '[data-type], .course-test';
    // Csak a viszonylag nagy (>= 200px) inline korlátokat írjuk felül, hogy
    // ne törjünk el kis ikonokat/gombokat, amiknek jogosan van pl.
    // "max-width: 24px" jellegű inline stílusuk.
    const WIDE_INLINE_PX_THRESHOLD = 200;
    function parsePxValue(value) {
        const match = value && value.match(/^(\d+(?:\.\d+)?)px$/);
        return match ? parseFloat(match[1]) : null;
    }
    function fixElementInlineWidth(el) {
        const mw = parsePxValue(el.style.maxWidth);
        const w = parsePxValue(el.style.width);
        if (mw !== null && mw >= WIDE_INLINE_PX_THRESHOLD) {
            el.style.setProperty('max-width', '100%', 'important');
        }
        if (w !== null && w >= WIDE_INLINE_PX_THRESHOLD) {
            el.style.setProperty('width', '100%', 'important');
        }
    }
    function fixWideInlineWidths(root) {
        // A widget-gyökereket mindig a dokumentumból keressük ki, és csak
        // azokon belül nézünk inline szélességeket.
        document.querySelectorAll(WIDTH_FIX_ROOT_SELECTOR).forEach(widgetRoot => {
            // Ha kaptunk egy szűkítő root-ot (pl. egy frissen beszúrt node),
            // csak az azzal átfedő widgeteket dolgozzuk fel - így nem megyünk
            // fölöslegesen végig minden widgeten minden apró változásnál.
            if (root && root.nodeType === 1 && root !== document
                && !widgetRoot.contains(root) && !root.contains(widgetRoot)) {
                return;
            }
            // A médiás (diák, videó) widgetek szélességét (94%) a "Médiás widgetek" rész
            // adja - azt ne írjuk felül 100%-ra.
            if (!widgetRoot.querySelector(MEDIA_SELECTOR)) fixElementInlineWidth(widgetRoot);
            widgetRoot.querySelectorAll('[style*="max-width"], [style*="width"]')
                .forEach(fixElementInlineWidth);
        });
    }
    onDomReady(() => fixWideInlineWidths());
    // Fallback intervallum, ha dinamikusan, JS-ből kerülne be új inline
    // szélesség-korlátozás (pl. egy React re-render után)
    setInterval(() => fixWideInlineWidths(), 1000);
    // Azonnali reakció új elemek beszúrásakor is, hogy ne kelljen a fenti
    // 1 másodperces intervallumra várni
    function startWidthObserver() {
        const observer = new MutationObserver((mutations) => {
            for (const m of mutations) {
                if (m.type === 'childList' && m.addedNodes.length) {
                    m.addedNodes.forEach(node => {
                        if (node.nodeType === 1) {
                            fixWideInlineWidths(node);
                        }
                    });
                } else if (m.type === 'attributes' && m.attributeName === 'style') {
                    fixWideInlineWidths(m.target);
                }
            }
        });
        observer.observe(document.documentElement, {
            childList: true,
            subtree: true,
            attributes: true,
            attributeFilter: ['style']
        });
    }
    if (document.documentElement) {
        startWidthObserver();
    } else {
        onDomReady(startWidthObserver);
    }
    // --- A "Trénernek" (notes) dobozok magassága egérrel állítható ---
    // Minden ilyen szövegdoboz FELSŐ és ALSÓ éle is megfogható: az él fölé érve
    // ns-resize kurzor jelenik meg, és fel/le húzva nő vagy csökken a doboz.
    // A felső élnél húzás közben együtt görgetjük a tartalomoszlopot, így úgy
    // látszik, mintha a doboz teteje menne felfelé, az alja pedig maradna.
    // A doboz növekedésével a jobb oldali tartalom is magasabb lesz (görgethető).
    // A beállítást az oldal NEM jegyzi meg: frissítés után minden alapállapotú.
    const NOTES_WIDGET_SELECTOR = '[data-type="notes"]';
    const NOTES_HANDLE_CLASS = 'hw-notes-resize-handle';
    const NOTES_HANDLE_SIZE = 10;  // a megfogható sáv vastagsága (px)
    const NOTES_MIN_HEIGHT = 60;   // ennél kisebbre ne lehessen húzni

    // A widget állítható szövegdobozai: a szerkesztőmezők, vagy ha ilyen nincs,
    // a görgethető szövegdobozok.
    function findNotesBoxes(widget) {
        const boxes = Array.from(widget.querySelectorAll('textarea, [contenteditable="true"]'));
        if (boxes.length) return boxes;
        return Array.from(widget.querySelectorAll('div, section, pre')).filter(el => {
            const cs = window.getComputedStyle(el);
            const r = el.getBoundingClientRect();
            if (r.height < 40 || r.width < 80) return false;
            return (cs.overflowY === 'auto' || cs.overflowY === 'scroll') && el.scrollHeight > r.height + 2;
        });
    }
    // A görgethető tartalomoszlop (a doboz feletti legközelebbi görgethető ős).
    function findScrollParent(el) {
        for (let p = el.parentElement; p; p = p.parentElement) {
            const cs = window.getComputedStyle(p);
            if ((cs.overflowY === 'auto' || cs.overflowY === 'scroll') && p.scrollHeight > p.clientHeight + 1) return p;
        }
        return document.scrollingElement || document.documentElement;
    }
    function positionNotesHandle(handle) {
        const box = handle.__hwBox;
        const host = handle.parentElement;
        if (!box || !host || !box.isConnected) return;
        const br = box.getBoundingClientRect();
        const hr = host.getBoundingClientRect();
        const top = (handle.dataset.edge === 'top' ? br.top : br.bottom) - hr.top - NOTES_HANDLE_SIZE / 2;
        handle.style.setProperty('top', top + 'px', 'important');
        handle.style.setProperty('left', (br.left - hr.left) + 'px', 'important');
        handle.style.setProperty('width', br.width + 'px', 'important');
    }
    function makeNotesHandle(box, edge) {
        const handle = document.createElement('div');
        handle.className = NOTES_HANDLE_CLASS;
        handle.dataset.edge = edge;
        handle.__hwBox = box;
        handle.title = 'Húzd a doboz magasságának állításához';
        [['position', 'absolute'], ['height', NOTES_HANDLE_SIZE + 'px'], ['cursor', 'ns-resize'],
         ['z-index', '30'], ['background', 'transparent'], ['user-select', 'none'],
         ['touch-action', 'none']].forEach(p => handle.style.setProperty(p[0], p[1], 'important'));
        handle.addEventListener('mouseenter', () => handle.style.setProperty('background', 'rgba(0,0,0,0.12)', 'important'));
        handle.addEventListener('mouseleave', () => { if (!handle.__hwDrag) handle.style.setProperty('background', 'transparent', 'important'); });
        handle.addEventListener('pointerdown', e => {
            if (e.button !== 0) return;
            const scroller = findScrollParent(box);
            handle.__hwDrag = { y: e.clientY, h: box.getBoundingClientRect().height, scroll: scroller.scrollTop, scroller: scroller };
            try { handle.setPointerCapture(e.pointerId); } catch (err) {}
            e.preventDefault();
            e.stopPropagation();
        });
        handle.addEventListener('pointermove', e => {
            const d = handle.__hwDrag;
            if (!d) return;
            const delta = e.clientY - d.y;
            const newHeight = Math.max(NOTES_MIN_HEIGHT, edge === 'top' ? d.h - delta : d.h + delta);
            box.style.setProperty('height', newHeight + 'px', 'important');
            box.style.setProperty('min-height', NOTES_MIN_HEIGHT + 'px', 'important');
            box.style.setProperty('max-height', 'none', 'important');
            if (edge === 'top') {
                // A doboz lefelé nő, ezért ugyanennyivel lejjebb görgetünk: így az
                // ALJA marad a helyén, a teteje pedig "felfelé megy".
                d.scroller.scrollTop = d.scroll + (newHeight - d.h);
            }
            widgetHandles(handle.parentElement).forEach(positionNotesHandle);
            e.preventDefault();
        });
        const end = e => {
            if (!handle.__hwDrag) return;
            handle.__hwDrag = null;
            handle.style.setProperty('background', 'transparent', 'important');
            try { handle.releasePointerCapture(e.pointerId); } catch (err) {}
        };
        handle.addEventListener('pointerup', end);
        handle.addEventListener('pointercancel', end);
        return handle;
    }
    function widgetHandles(host) {
        return host ? Array.from(host.querySelectorAll(':scope > .' + NOTES_HANDLE_CLASS)) : [];
    }
    function fixNotesWidgets() {
        document.querySelectorAll(NOTES_WIDGET_SELECTOR).forEach(widget => {
            findNotesBoxes(widget).forEach(box => {
                const host = box.parentElement;
                if (!host) return;
                if (window.getComputedStyle(host).position === 'static') {
                    host.style.setProperty('position', 'relative', 'important');
                }
                // a natív (jobb alsó sarkos) átméretezés is maradjon meg
                if (box.tagName === 'TEXTAREA') box.style.setProperty('resize', 'vertical', 'important');
                const mine = widgetHandles(host).filter(h => h.__hwBox === box);
                if (mine.length !== 2) {
                    mine.forEach(h => h.remove());
                    host.appendChild(makeNotesHandle(box, 'top'));
                    host.appendChild(makeNotesHandle(box, 'bottom'));
                }
                widgetHandles(host).forEach(positionNotesHandle);
            });
        });
    }
    onDomReady(fixNotesWidgets);
    setInterval(fixNotesWidgets, 1000);

    // --- Médiás widgetek (Google-diák, videó) : a jobb oldali rész 94%-a ---
    // A lapozós Google-diák (drive widget) és a videók a tartalomoszlop 94%-át
    // foglalják el, bal és jobb oldalon 3-3% térközzel. A widgeten belül a
    // médiáig vezető burkolók 100%-osak, maga a média (iframe / video / kép)
    // pedig kitölti a szélességet, és megtartja az eredeti oldalarányát (így nem
    // torzul, és nem marad fölötte/alatta üres sáv).
    const MEDIA_SELECTOR = 'iframe, video, [class*="video" i], [class*="player" i], [data-type*="video" i], [data-type="youtube"], [data-type="vimeo"]';
    const MEDIA_WIDGET_EXCLUDE = '[data-type="sayer"], [data-type="sayerorig"], [data-type="sayertalk"], [data-type="testdrive"], .course-test, #sayer-container';
    function setImportantIfNeededSimple(el, prop, value) {
        if (el.style.getPropertyValue(prop) === value
            && el.style.getPropertyPriority(prop) === 'important') return;
        el.style.setProperty(prop, value, 'important');
    }
    // A médiát tartalmazó widget: a legkülső [data-type] ős, vagy ha nincs, a
    // görgethető tartalomoszlop (#movescroll) közvetlen gyereke.
    function findMediaWidget(media) {
        let widget = null;
        for (let el = media; el && el !== document.body; el = el.parentElement) {
            if (el.hasAttribute && el.hasAttribute('data-type')) widget = el;
            if (el.parentElement && el.parentElement.id === 'movescroll') { if (!widget) widget = el; break; }
        }
        return widget;
    }
    function fixMediaWidgets() {
        const done = new Set();
        document.querySelectorAll(MEDIA_SELECTOR).forEach(media => {
            if (!media.isConnected || media.closest(MEDIA_WIDGET_EXCLUDE)) return;
            const widget = findMediaWidget(media);
            if (!widget || widget.matches(MEDIA_WIDGET_EXCLUDE) || widget.querySelector(MEDIA_WIDGET_EXCLUDE)) return;
            // a kis ikon-szerű elemekhez (pl. egy apró "video" osztályú gomb) ne nyúljunk
            const r = media.getBoundingClientRect();
            if (media.tagName !== 'IFRAME' && media.tagName !== 'VIDEO' && r.width < 200) return;
            if (!done.has(widget)) {
                done.add(widget);
                setImportantIfNeededSimple(widget, 'box-sizing', 'border-box');
                setImportantIfNeededSimple(widget, 'min-width', '0');
                setImportantIfNeededSimple(widget, 'width', '94%');
                setImportantIfNeededSimple(widget, 'max-width', '94%');
                setImportantIfNeededSimple(widget, 'margin-left', '3%');
                setImportantIfNeededSimple(widget, 'margin-right', '3%');
            }
            if (media === widget) return; // maga a widget "videós" - a belsejét a többi elem intézi
            // a widget és a média közötti burkolók töltsék ki a widgetet
            for (let el = media.parentElement; el && el !== widget; el = el.parentElement) {
                const pos = window.getComputedStyle(el).position;
                if (pos === 'absolute' || pos === 'fixed') continue;
                setImportantIfNeededSimple(el, 'width', '100%');
                setImportantIfNeededSimple(el, 'max-width', '100%');
            }
            const cs = window.getComputedStyle(media);
            if (cs.position === 'absolute' || cs.position === 'fixed') return; // reszponzív burkolóban ül
            // Az eredeti oldalarányt az ELSŐ alkalommal jegyezzük meg.
            if (!media.__hwAspect && r.width > 0 && r.height > 0) {
                media.__hwAspect = /docs\.google\.com\/presentation/.test(media.src || '')
                    ? '960 / 569'                       // 16:9 dia + alsó vezérlősáv
                    : (Math.round(r.width) + ' / ' + Math.round(r.height));
            }
            setImportantIfNeededSimple(media, 'width', '100%');
            setImportantIfNeededSimple(media, 'max-width', '100%');
            if (media.__hwAspect) {
                setImportantIfNeededSimple(media, 'height', 'auto');
                setImportantIfNeededSimple(media, 'aspect-ratio', media.__hwAspect);
            }
        });
    }
    onDomReady(fixMediaWidgets);
    setInterval(fixMediaWidgets, 1000);
    // --- ÚJ: a kártyás terület körüli BAL / JOBB / FELSŐ térköz megszüntetése ---
    // Elvárás: a kártyákat tartalmazó nagy elem körül a bal, jobb és felső térköz
    // tűnjön el, és CSAK az ALSÓ maradjon meg.
    //
    // A térköz KÉT helyről jön, ezért kétféleképpen kezeljük:
    //
    //  1) BELÜLRŐL (a widgeten belüli burkolók): a valódi kártyás doboz több
    //     burkoló divben ül, és épp ezek adják a felső hézagot (egy
    //     "margin-top: 40px"-es burkoló, alatta egy "padding: 10px 0 0"-ás div,
    //     majd egy abszolút pozicionált panel "inset: 10px 0 0"-val). Ezért a
    //     widget gyökerétől a kártyalista konténeréig (#sayer-container) vezető ÚT
    //     minden elemén nullázzuk a felső/bal/jobb margót és paddinget - abszolút
    //     pozicionált elemnél a top/left/right eltolást is. Az útvonalon KÍVÜLI és
    //     a listán BELÜLI elemeket (kártyák paddingje, a lista 24px-es oldalsó
    //     térköze, a ◀ ▶ gombok pozíciója) nem bántjuk.
    //
    //  2) KÍVÜLRŐL (a görgethető tartalomoszlop belső térköze): a widget oldalsó
    //     hézagát a szülő (#movescroll) 35px-es paddingja adja.
    //     FONTOS: ezt a paddinget NEM vesszük el! Az oldal több eleme - például a
    //     sárga instrukciós sáv (.topitemch) - "margin: -35px"-tel van ehhez
    //     igazítva, és ha a paddinget kivennénk, azok kilógnának: a sárga sáv
    //     teteje levágódna, oldalt pedig a tartalom 35px-szel túlérne a görgethető
    //     területen -> megjelenne egy (piros) vízszintes görgetősáv.
    //     Helyette ugyanazt a trükköt használjuk, amit maga az oldal: a widgetet
    //     negatív oldalsó margóval húzzuk ki pontosan a padding széléig, így se
    //     hézag, se kilógás nem marad.
    //
    // Az ALSÓ térköz (a widget pb-1 osztálya, a burkolók margin-bottom: 50px-e, a
    // lista alján lévő padding-bottom: 80px, a tartalomoszlop alsó paddingja)
    // mindenhol érintetlen marad.
    const CARD_AREA_ROOT_SELECTOR = [
        '#sayer-container',
        '[data-type="sayer"]',
        '[data-type="sayerorig"]',
        '[data-type="sayertalk"]',
        '[data-type="testdrive"]',
        '.course-test'
    ].join(', ');
    // A kártyalista tényleges konténere a widgeten belül (eddig megyünk le).
    const CARD_LIST_SELECTOR = '#sayer-container';
    // Csak ezeket az oldalakat nullázzuk - a 'bottom' szándékosan kimarad.
    const CLEARED_SPACING_SIDES = ['top', 'left', 'right'];
    // Biztonsági korlát a burkolólánc bejárásához.
    const MAX_SPACING_FIX_DEPTH = 8;
    // ÚJ: az alsó térköz ideiglenes csökkentése. Alapesetben 0, vagyis a kártyás
    // doboz alatti hézag akkora, mint az oldalsó (35px). Ha az oldal alja nem
    // férne ki a képernyőn, a lenti "Az oldal alja" rész ezt megnöveli, és akkor
    // ennyivel kisebb lesz az alsó térköz (legfeljebb nulláig) - így nem marad
    // fölösleges hely, és nincs mit legörgetni.
    const HW_MAX_BOTTOM_GAP_PENALTY = 40;
    let hwBottomGapPenalty = 0;
    // Csak akkor írunk, ha tényleg változna az érték - különben a saját írásunk
    // újabb MutationObserver-eseményt szülne, az pedig újabb írást (végtelen kör).
    function setImportantIfNeeded(el, prop, value) {
        if (el.style.getPropertyValue(prop) === value
            && el.style.getPropertyPriority(prop) === 'important') return;
        el.style.setProperty(prop, value, 'important');
    }
    function clearSideSpacing(el) {
        if (!el || el.nodeType !== 1) return;
        const cs = window.getComputedStyle(el);
        const positioned = cs.position === 'absolute' || cs.position === 'fixed';
        CLEARED_SPACING_SIDES.forEach(side => {
            const cap = side.charAt(0).toUpperCase() + side.slice(1);
            // Csak ott nyúlunk hozzá, ahol TÉNYLEGESEN van térköz ("ahol van térköz").
            if (parseFloat(cs['margin' + cap]) > 0) {
                setImportantIfNeeded(el, 'margin-' + side, '0px');
            }
            if (parseFloat(cs['padding' + cap]) > 0) {
                setImportantIfNeeded(el, 'padding-' + side, '0px');
            }
            // Abszolút/fix pozicionált burkolónál maga az eltolás is térköz
            // (pl. "inset: 10px 0 0" -> 10px-es felső hézag).
            if (positioned && parseFloat(cs[side]) > 0) {
                setImportantIfNeeded(el, side, '0px');
            }
        });
    }
    // A widget gyökerétől a kártyalista konténeréig vezető út elemei (a lista is
    // benne van, a listán BELÜLI elemek viszont már nem).
    function getWidgetInnerChain(widgetRoot) {
        const chain = [];
        const list = widgetRoot.querySelector(CARD_LIST_SELECTOR);
        if (list && list !== widgetRoot) {
            let el = list;
            while (el && el !== widgetRoot) {
                chain.push(el);
                el = el.parentElement;
            }
            return chain;
        }
        // Nincs ismert kártyalista (pl. .course-test): csak az egyértelmű,
        // egygyerekes burkolóláncon megyünk le, ahol nem tévedhetünk el.
        let el = widgetRoot;
        let depth = 0;
        while (el && depth < MAX_SPACING_FIX_DEPTH) {
            const kids = Array.from(el.children);
            if (kids.length !== 1) break;
            chain.push(kids[0]);
            el = kids[0];
            depth++;
        }
        return chain;
    }
    // A widget kihúzása a szülő belső térközéből - a szülő paddingjéhez NEM nyúlunk.
    function pullCardRootOutOfParentPadding(cardRoot) {
        const parent = cardRoot.parentElement;
        if (!parent || parent === document.body || parent === document.documentElement) return;
        const cs = window.getComputedStyle(cardRoot);
        // abszolút/fix pozicionált elemre a negatív margó nem a kívánt hatást adná
        if (cs.position === 'absolute' || cs.position === 'fixed') return;
        const pcs = window.getComputedStyle(parent);
        const padL = parseFloat(pcs.paddingLeft) || 0;
        const padR = parseFloat(pcs.paddingRight) || 0;
        const padT = parseFloat(pcs.paddingTop) || 0;
        if (padL > 0) setImportantIfNeeded(cardRoot, 'margin-left', (-padL) + 'px');
        if (padR > 0) setImportantIfNeeded(cardRoot, 'margin-right', (-padR) + 'px');
        if (padL > 0 || padR > 0) {
            // A fenti teljes-szélesség CSS width/max-width: 100%-ot ad a widgetnek,
            // ami a negatív margókkal együtt 35px-es kilógást (és vízszintes
            // görgetősávot) okozna. Auto szélességgel a widget pontosan a szülő
            // padding-dobozát tölti ki - se hézag, se túllógás.
            setImportantIfNeeded(cardRoot, 'width', 'auto');
            setImportantIfNeeded(cardRoot, 'max-width', 'none');
        }
        // Felső térköz:
        //  - ha a widget a szülő ELSŐ eleme, a szülő felső paddingja adja a hézagot,
        //    ezt ugyanúgy negatív margóval oltjuk ki;
        //  - egyébként a fölötte lévő elem (pl. a sárga instrukciós sáv) alsó
        //    margója a kártyás elem felső térköze -> ugyanekkora negatív margóval
        //    kioltjuk (a két margó összege/összecsúszása így pontosan 0 lesz).
        //    KIVÉTEL: ha fölötte egy MÁSIK kártyás widget van, annak az alsó
        //    térközéhez nem nyúlunk, mert az meg kell maradjon.
        const prev = cardRoot.previousElementSibling;
        if (parent.firstElementChild === cardRoot) {
            if (padT > 0) setImportantIfNeeded(cardRoot, 'margin-top', (-padT) + 'px');
        } else if (prev && !(prev.matches && prev.matches(CARD_AREA_ROOT_SELECTOR))) {
            const prevMarginBottom = parseFloat(window.getComputedStyle(prev).marginBottom) || 0;
            if (prevMarginBottom > 0) {
                setImportantIfNeeded(cardRoot, 'margin-top', (-prevMarginBottom) + 'px');
            }
        }
    }
    // Egy elem akkor "látható", ha tényleg megjelenik a képernyőn. A kártyalistában
    // az még meg nem jelenített kártyák "visibility: hidden"-nel ülnek a DOM-ban.
    function isElementVisible(el) {
        if (!el || el.nodeType !== 1 || !el.isConnected) return false;
        const cs = window.getComputedStyle(el);
        if (cs.display === 'none' || cs.visibility !== 'visible') return false;
        if (parseFloat(cs.opacity) === 0) return false;
        const r = el.getBoundingClientRect();
        return r.width > 0 && r.height > 0;
    }
    // FONTOS: a függőleges térközöket NEM méréssel állítjuk be. A mérés+visszaírás
    // visszacsatolt kör, ami az oldal átmeneteivel/újrarajzolásával együtt nem áll
    // be, hanem másodpercenként ide-oda ugráltatja a blokkot. Helyette a STATIKUS
    // CSS-értékekből számoljuk ki a szükséges (negatív) alsó margót: ezek az
    // értékek nem függenek attól, amit mi beállítunk, így az eredmény stabil.
    //
    // Mennyi üres sáv van a látható kártyás doboz (panel) alja és a widget doboza
    // alja között: a panel saját alsó margója + a fölötte lévő burkolók
    // (összecsúszó) alsó margói + a widget saját alsó paddingja.
    function panelBottomExtra(widgetRoot) {
        const chain = getWidgetInnerChain(widgetRoot); // a listától a gyökér felé
        let panelSeen = false;
        let panelMargin = 0;
        let collapsed = 0;
        for (let i = 0; i < chain.length; i++) {
            const cs = window.getComputedStyle(chain[i]);
            const mb = parseFloat(cs.marginBottom) || 0;
            if (!panelSeen) {
                // a panelen BELÜLI elemek nem adnak hozzá semmit
                if (cs.position === 'absolute' || cs.position === 'fixed') {
                    panelSeen = true;
                    panelMargin = mb;
                }
                continue;
            }
            if (mb > collapsed) collapsed = mb; // az egymás alatti burkolók margói összecsúsznak
        }
        const rootPadBottom = parseFloat(window.getComputedStyle(widgetRoot).paddingBottom) || 0;
        return panelMargin + collapsed + rootPadBottom;
    }
    // Egy elem alján lévő üres sáv a látható tartalom aljától az elem aljáig
    // (saját alsó padding + az utolsó gyerekek alsó margói/paddingjai).
    function trailingInnerSpace(el, depth) {
        depth = depth || 0;
        if (!el || el.nodeType !== 1 || depth > 5) return 0;
        const cs = window.getComputedStyle(el);
        let space = parseFloat(cs.paddingBottom) || 0;
        const kids = Array.from(el.children).filter(isElementVisible);
        const last = kids[kids.length - 1];
        if (!last) return space;
        const lcs = window.getComputedStyle(last);
        if (lcs.position === 'absolute' || lcs.position === 'fixed') return space;
        space += parseFloat(lcs.marginBottom) || 0;
        return space + trailingInnerSpace(last, depth + 1);
    }
    // A kártyás widget alatti hézag beállítása a kívánt értékre.
    function setCardRootBottomGap(cardRoot, targetGap, parentPadBottom) {
        const extra = panelBottomExtra(cardRoot);
        const trailing = cardRoot.nextElementSibling ? 0 : parentPadBottom;
        setImportantIfNeeded(cardRoot, 'margin-bottom',
            (Math.round((targetGap - extra - trailing) * 10) / 10) + 'px');
    }
    // A tartalomoszlop UTOLSÓ eleme alatti hézag beállítása (itt a szülő alsó
    // paddingja is beleszámít).
    function setLastElementBottomGap(el, targetGap, parentPadBottom) {
        const extra = trailingInnerSpace(el);
        setImportantIfNeeded(el, 'margin-bottom',
            (Math.round((targetGap - extra - parentPadBottom) * 10) / 10) + 'px');
    }

    // =====================================================================
    // --- ÚJ: a kártyás doboz alatti záró felirat (pl. "Ennek a feladatnak a
    //     lezárásához keress meg egy trénert!") ---
    // Ha a tartalomoszlopban a kártyás widget után már csak egy rövid felirat
    // jön, akkor:
    //  - a felirat a kártyás doboz alsó vonala FÖLÖTT ül, alatta HW_NOTE_GAP
    //    (minimális) térközzel - nem a vonalon;
    //  - a vonal alatt nem marad üres sáv: a kártyás doboz egészen a
    //    tartalomoszlop aljáig (a "Jegyzet készítése" gombig) ér. A doboz
    //    nagyobb lesz, a kártyákat továbbra is a saját (szürke) sávja görgeti.
    // A margókat itt is úgy számoljuk, hogy ne függjenek a saját írásainktól
    // (a doboz alja és a widget alja közötti távolság, a felirat magassága és
    // alsó belső térköze egyike sem változik attól, amit beállítunk), így az
    // eredmény stabil, nem ugrál.
    // =====================================================================
    const HW_NOTE_GAP = 6;            // a felirat és az alatta lévő vonal közötti térköz (px)
    const HW_NOTE_MAX_HEIGHT = 200;   // ennél magasabb elemet nem tekintünk "záró feliratnak"
    function hwTrailingNote(cardRoot) {
        if (!cardRoot || cardRoot.matches(CARD_LIST_SELECTOR)) return null;
        const parent = cardRoot.parentElement;
        if (!parent || !parent.matches(HW_PAGE_COLUMN_SELECTOR) || parent.classList.contains('offcanvasorig')) return null;
        const last = parent.lastElementChild;
        if (!last || last === cardRoot || cardRoot.nextElementSibling !== last) return null;
        if (last.matches(CARD_AREA_ROOT_SELECTOR) || last.querySelector(CARD_AREA_ROOT_SELECTOR)) return null;
        if (!isElementVisible(last)) return null;
        const lastRect = last.getBoundingClientRect();
        if (lastRect.height > HW_NOTE_MAX_HEIGHT) return null;
        const box = hwSizedBox(cardRoot);
        if (!box || !isElementVisible(box)) return null;
        return { parent: parent, last: last, box: box, lastRect: lastRect };
    }
    function hwColumnNote(col) {
        const last = col.lastElementChild;
        const card = last && last.previousElementSibling;
        if (!card || !card.matches(CARD_AREA_ROOT_SELECTOR)) return null;
        return hwTrailingNote(card);
    }
    // A felirat elhelyezése: a kártyás widget és a felirat alsó margója.
    function hwPlaceTrailingNote(cardRoot, note, parentPadBottom) {
        const panelBottom = note.box.getBoundingClientRect().bottom;
        const below = cardRoot.getBoundingClientRect().bottom - panelBottom;   // a vonal alatti rész a widgeten belül
        const trailing = trailingInnerSpace(note.last);                        // a felirat alatti belső térköz
        const px = v => (Math.round(v * 10) / 10) + 'px';
        // a felirat szövegének alja = a vonal - HW_NOTE_GAP
        setImportantIfNeeded(cardRoot, 'margin-bottom', px(-below - HW_NOTE_GAP - note.lastRect.height + trailing));
        // az oszlop tartalma pontosan a vonalnál érjen véget
        setImportantIfNeeded(note.last, 'margin-bottom', px(-(trailing - HW_NOTE_GAP) - parentPadBottom));
    }
    // A kártyás doboz magassága: érjen le a tartalomoszlop aljáig.
    function hwFillColumnWithCardBox(col, note) {
        const cs = window.getComputedStyle(col);
        const colBottom = col.getBoundingClientRect().bottom - (parseFloat(cs.borderBottomWidth) || 0);
        const r = note.box.getBoundingClientRect();
        const diff = colBottom - r.bottom;
        if (Math.abs(diff) > 0.5) {
            hwSetBoxHeight(note.box, Math.max(HW_MIN_BOX_HEIGHT, Math.round((r.height + diff) * 10) / 10));
        }
        hwBottomGapPenalty = 0;
        // a felirat alatti (átlátszó) belső térköz miatt se lehessen legörgetni
        setImportantIfNeeded(col, 'overflow-y', 'hidden');
        if (col.scrollTop) col.scrollTop = 0;
    }
    function hwFitNoteColumns() {
        hwPageColumns().forEach(col => {
            try { const note = hwColumnNote(col); if (note) hwFillColumnWithCardBox(col, note); } catch (e) {}
        });
    }

    // Gombsor: olyan elem, aminek KIZÁRÓLAG gombok a gyerekei (pl. "Újra |
    // Csoport visszaállítása | Következő csoport").
    function isButtonRow(el) {
        if (!el || el.nodeType !== 1) return false;
        const kids = Array.from(el.children);
        if (!kids.length) return false;
        const allButtons = kids.every(k => k.tagName === 'BUTTON'
            || (k.getAttribute && k.getAttribute('role') === 'button'));
        if (!allButtons) return false;
        const ownText = Array.from(el.childNodes)
            .filter(n => n.nodeType === 3)
            .map(n => n.textContent.trim())
            .join('');
        return ownText === '';
    }
    // Megkeresi azt a szintet, aminek az utolsó látható gyereke gombsor.
    function findButtonRowLevel(root) {
        let el = root;
        let depth = 0;
        while (el && depth < 4) {
            const kids = Array.from(el.children).filter(isElementVisible);
            const last = kids[kids.length - 1];
            if (last && kids.length >= 2 && isButtonRow(last)) return { kids: kids, row: last };
            if (kids.length !== 1) return null;
            el = kids[0];
            depth++;
        }
        return null;
    }
    // A kártyalista alján lévő nagy üres hely (padding-bottom: 80px): amikor a
    // lista végén ott a gombsor, alatta pont akkora térköz maradjon, mint fölötte.
    // Ha nincs gombsor (gyakorlás közben), az eredeti érték marad, hogy az utolsó
    // kártya ne kerüljön a lebegő ◀ ▶ gombok alá.
    function fixCardListBottomGap(widgetRoot) {
        const list = widgetRoot.matches(CARD_LIST_SELECTOR)
            ? widgetRoot
            : widgetRoot.querySelector(CARD_LIST_SELECTOR);
        if (!list) return;
        const listKids = Array.from(list.children).filter(isElementVisible);
        const inner = listKids[listKids.length - 1];
        if (!inner) return;
        // Az eredeti értéket az ELSŐ futáskor jegyezzük meg, hogy pontosan vissza
        // tudjuk adni. (Puszta removeProperty nem elég: a 80px az oldal inline
        // "padding: 0 0 80px" rövidítéséből jön, azt a törlés véglegesen elvenné.)
        if (inner.__hwOriginalPaddingBottom === undefined) {
            inner.__hwOriginalPaddingBottom = window.getComputedStyle(inner).paddingBottom;
        }
        const level = findButtonRowLevel(inner);
        if (!level) {
            // nincs (már) gombsor -> visszaadjuk az oldal eredeti térközét
            if (inner.style.getPropertyPriority('padding-bottom') === 'important') {
                inner.style.removeProperty('padding-bottom');
                if (window.getComputedStyle(inner).paddingBottom !== inner.__hwOriginalPaddingBottom) {
                    inner.style.setProperty('padding-bottom', inner.__hwOriginalPaddingBottom);
                }
            }
            return;
        }
        const prev = level.kids[level.kids.length - 2];
        const gapAbove = Math.max(0, Math.round(
            level.row.getBoundingClientRect().top - prev.getBoundingClientRect().bottom));
        // 2px tűrés: a kiemelt kártya "transform: scale(1.01)" animációja miatt a
        // mért hézag pixelnyit ingadozhat - ettől ne írjuk át újra és újra.
        const applied = parseFloat(inner.style.getPropertyValue('padding-bottom'));
        if (isFinite(applied) && Math.abs(applied - gapAbove) < 2) return;
        setImportantIfNeeded(inner, 'padding-bottom', gapAbove + 'px');
    }
    function fixCardAreaSpacing() {
        document.querySelectorAll(CARD_AREA_ROOT_SELECTOR).forEach(cardRoot => {
            clearSideSpacing(cardRoot);                                 // maga a widget
            getWidgetInnerChain(cardRoot).forEach(clearSideSpacing);    // befelé a kártyalistáig
            pullCardRootOutOfParentPadding(cardRoot);                   // kifelé a szülő paddingjéből
            fixCardListBottomGap(cardRoot);                             // a lista alja a gombsor alatt
            // A kártyás doboz ALATTI (és az oszlop legalján maradó) függőleges
            // térköz akkora legyen, mint az OLDALSÓ térköz - vagyis amennyi a
            // tartalomoszlop vízszintes paddingja (jellemzően 35px). Ha az oldal
            // alja így nem férne ki, ebből vonunk le (hwBottomGapPenalty), hogy ne
            // maradjon fölösleges, görgethető üres hely.
            const parent = cardRoot.parentElement;
            if (!parent || cardRoot.matches(CARD_LIST_SELECTOR)) return;
            const pcs = window.getComputedStyle(parent);
            const parentPadBottom = parseFloat(pcs.paddingBottom) || 0;
            // Záró felirat a kártyás doboz alatt: külön elhelyezés (lásd fent).
            const note = hwTrailingNote(cardRoot);
            if (note) { hwPlaceTrailingNote(cardRoot, note, parentPadBottom); return; }
            const base = parseFloat(pcs.paddingLeft) || parseFloat(pcs.paddingRight) || 0;
            if (base <= 0) return;
            const target = Math.max(0, base - hwBottomGapPenalty);
            setCardRootBottomGap(cardRoot, target, parentPadBottom);
            const last = parent.lastElementChild;
            if (last && last !== cardRoot && isElementVisible(last)) {
                setLastElementBottomGap(last, target, parentPadBottom);
            }
        });
    }
    // A saját inline írásaink is 'style' mutációt okoznak, ezért a futtatást egy
    // animációs képkockára gyűjtjük össze, és a közben érkező (részben általunk
    // kiváltott) mutációkat nem futtatjuk le újra.
    let spacingFixScheduled = false;
    let spacingFixApplying = false;
    function scheduleCardAreaSpacingFix() {
        if (spacingFixScheduled || spacingFixApplying) return;
        spacingFixScheduled = true;
        requestAnimationFrame(() => {
            spacingFixScheduled = false;
            spacingFixApplying = true;
            try {
                fixCardAreaSpacing();
                // a záró feliratos oszlopok kitöltése még ugyanebben a képkockában,
                // a kirajzolás előtt - így betöltéskor sem ugrik el semmi
                hwFitNoteColumns();
            } finally {
                setTimeout(() => { spacingFixApplying = false; }, 0);
            }
        });
    }
    onDomReady(scheduleCardAreaSpacingFix);
    // Fallback: React re-render / oldalváltás után is álljon helyre a beállítás.
    setInterval(() => fixCardAreaSpacing(), 1000);
    // Azonnali reakció: új kártyás elem beszúrása vagy inline stílus átírása esetén.
    function startSpacingObserver() {
        const observer = new MutationObserver(() => scheduleCardAreaSpacingFix());
        observer.observe(document.documentElement, {
            childList: true,
            subtree: true,
            attributes: true,
            attributeFilter: ['style', 'class']
        });
    }
    if (document.documentElement) {
        startSpacingObserver();
    } else {
        onDomReady(startSpacingObserver);
    }

    // =====================================================================
    // --- ÚJ: az oldal alján ne maradjon fölösleges hely, és a PIROS
    //     görgetősáv ne görgessen ---
    // A jobb oldali tartalomoszlopnak (#movescroll) saját, PIROS görgetősávja van
    // az ablak jobb szélén. Ez jellemzően csak néhány tíz pixelnyi ÜRES helyet
    // görgetne, ezért magát a sávot elrejtjük (lásd a fenti CSS-t), a tartalmat
    // pedig úgy igazítjuk, hogy pontosan elférjen a képernyőn:
    //   1) ha az oszlop tartalma túllóg, azoknak a widgeteknek a magasságát
    //      csökkentjük, amelyeknek VAN saját (szürke) görgetősávjuk - tipikusan a
    //      kártyalistának -, így semmi nem vész el: a kártyákat a szürke sáv
    //      görgeti tovább;
    //   2) ha ez sem elég, a legalsó térközt vesszük el (legfeljebb nulláig);
    //   3) ha megint felszabadul hely (pl. nagyobb ablak), fordított sorrendben
    //      mindent visszaadunk.
    // Amíg a tartalom elfér, az oszlop görgetését teljesen kikapcsoljuk
    // (overflow-y: hidden) - így semmiképp nem lehet "legörgetni" az üres részre.
    // Ha egy oldalon tényleg több tartalom van, mint amennyi kifér (és nincs mit
    // zsugorítani), a görgetés megmarad - csak a piros sáv nem látszik -, nehogy
    // elérhetetlenné váljon valami.
    //
    // A bal oldali menü (offcanvasorig) piros sávja érintetlen marad, és a
    // kártyalista saját, SZÜRKE sávja sem változik.
    // =====================================================================
    const HW_PAGE_COLUMN_SELECTOR = '#movescroll, .scrollbar1.scrollbar2';
    const HW_MIN_BOX_HEIGHT = 120;   // ennél kisebbre egy widgetet sem zsugorítunk
    const HW_FIT_TOLERANCE = 1;      // ekkora eltérést (px) még nem igazítunk

    function hwPageColumns() {
        return Array.from(document.querySelectorAll(HW_PAGE_COLUMN_SELECTOR))
            .filter(el => !el.classList.contains('offcanvasorig'));
    }
    // A widget méretét adó doboz: px-ben megadott inline magassággal (ezt az oldal
    // állítja be). Csak néhány szintet megyünk le, hogy olcsó maradjon.
    function hwSizedBox(el, depth) {
        depth = depth || 0;
        if (depth > 4) return null;
        for (const kid of el.children) {
            if (/(^|;)\s*height:\s*[\d.]+px/.test(kid.getAttribute('style') || '')) return kid;
            const deep = hwSizedBox(kid, depth + 1);
            if (deep) return deep;
        }
        return null;
    }
    // Van-e a dobozon belül saját (szürke) görgetősávval rendelkező rész?
    function hwInnerScroller(el, depth) {
        depth = depth || 0;
        if (depth > 3) return null;
        for (const kid of el.children) {
            const cs = window.getComputedStyle(kid);
            if ((cs.overflowY === 'auto' || cs.overflowY === 'scroll')
                && kid.scrollHeight > kid.clientHeight + 2) return kid;
            const deep = hwInnerScroller(kid, depth + 1);
            if (deep) return deep;
        }
        return null;
    }
    // A zsugorítható dobozok. A "Trénernek" (notes) dobozokat kihagyjuk: azok
    // magasságát te állítod egérrel, azt nem írjuk felül.
    function hwShrinkBoxes(col) {
        const boxes = [];
        col.querySelectorAll('[data-type]').forEach(widget => {
            if (widget.closest('[data-type="notes"]')) return;
            const box = hwSizedBox(widget);
            if (!box || boxes.indexOf(box) !== -1) return;
            if (!hwInnerScroller(box)) return;
            const h = box.getBoundingClientRect().height;
            // Ha nem MI állítottuk be a mostani magasságot, akkor ez az "eredeti"
            // (ennél nagyobbra soha nem növeljük vissza).
            if (box.__hwSetHeight === undefined || Math.abs(h - box.__hwSetHeight) > 1) {
                box.__hwFullHeight = h;
            }
            boxes.push(box);
        });
        return boxes;
    }
    function hwBoxHeight(box) { return box.getBoundingClientRect().height; }
    function hwSetBoxHeight(box, h) {
        box.__hwSetHeight = h;
        box.style.setProperty('height', h + 'px', 'important');
    }
    function hwColumnOverflow(col) { return col.scrollHeight - col.clientHeight; }
    // A legalsó térköz ideiglenes csökkentése (lásd fixCardAreaSpacing).
    function hwApplyGapPenalty(col, value) {
        const next = Math.max(0, Math.min(HW_MAX_BOTTOM_GAP_PENALTY, value));
        if (Math.abs(next - hwBottomGapPenalty) > 0.5) {
            hwBottomGapPenalty = next;
            try { fixCardAreaSpacing(); } catch (e) {}
        }
        return hwColumnOverflow(col);
    }
    function hwFitPageColumn(col) {
        // Záró feliratos oldal: a kártyás doboz kitölti az oszlopot (lásd fent).
        const note = hwColumnNote(col);
        if (note) { hwFillColumnWithCardBox(col, note); return; }
        let over = hwColumnOverflow(col);
        if (Math.abs(over) > HW_FIT_TOLERANCE) {
            const boxes = hwShrinkBoxes(col);
            // 1) túllóg -> a saját görgetősávval rendelkező widgetek zsugorítása
            for (const box of boxes) {
                if (over <= HW_FIT_TOLERANCE) break;
                const cur = hwBoxHeight(box);
                const next = Math.max(HW_MIN_BOX_HEIGHT, cur - over);
                if (next >= cur - 0.5) continue;
                hwSetBoxHeight(box, next);
                over -= cur - next;
            }
            // 2) ha még mindig túllóg -> a legalsó térköz elvétele
            if (over > HW_FIT_TOLERANCE) over = hwApplyGapPenalty(col, hwBottomGapPenalty + over);
            // 3) ha felszabadult hely -> előbb a térköz, utána a magasság vissza
            if (over < -HW_FIT_TOLERANCE && hwBottomGapPenalty > 0) {
                over = hwApplyGapPenalty(col, hwBottomGapPenalty + over);
            }
            for (const box of boxes) {
                if (over >= -HW_FIT_TOLERANCE) break;
                const cur = hwBoxHeight(box);
                const full = box.__hwFullHeight;
                if (!(full > cur + 0.5)) continue;
                const next = Math.min(full, cur - over);
                hwSetBoxHeight(box, next);
                over += next - cur;
            }
        }
        // Ha a tartalom elfér, a görgetést teljesen kikapcsoljuk.
        setImportantIfNeeded(col, 'overflow-y',
            hwColumnOverflow(col) <= HW_FIT_TOLERANCE ? 'hidden' : 'auto');
    }
    function hwFitPageColumns() {
        hwPageColumns().forEach(col => { try { hwFitPageColumn(col); } catch (e) {} });
    }
    onDomReady(hwFitPageColumns);
    setInterval(hwFitPageColumns, 1000);
    originalAddEventListener.call(window, 'resize', () => setTimeout(hwFitPageColumns, 100));
    // --- Nyílgombok -> jobb alsó Next (▶) / Previous (◀) gomb ---
    // Down és Right = jobbra nyíl gomb (Next / Következő)
    // Up   és Left  = balra nyíl gomb (Previous / Előző)
    function findNavButton(kind) {
        // kind: 'next' vagy 'previous'
        const ariaLabel = kind === 'next' ? 'Next' : 'Previous';
        const title = kind === 'next' ? 'Következő' : 'Előző';
        return document.querySelector(`button[aria-label="${ariaLabel}"]`)
            || document.querySelector(`button[title="${title}"]`);
    }
    function isTypingTarget(target) {
        if (!target) return false;
        const tag = (target.tagName || '').toLowerCase();
        return tag === 'input' || tag === 'textarea' || target.isContentEditable;
    }
    function handleNavKey(e) {
        const isNextKey = e.key === 'ArrowDown' || e.key === 'ArrowRight';
        const isPrevKey = e.key === 'ArrowUp' || e.key === 'ArrowLeft';
        if (!isNextKey && !isPrevKey) return;
        // Ne zavarjuk, ha épp egy mezőben (pl. "Ismétlések" input) gépelünk/léptetünk
        if (isTypingTarget(e.target)) return;
        const kind = isNextKey ? 'next' : 'previous';
        const btn = findNavButton(kind);
        if (!btn) return; // nincs kártyás/nyíl-gombos elem az oldalon -> hagyjuk a normál viselkedést
        // Elkapjuk az eseményt a lehető legkorábban (window, capture fázis), és teljesen
        // megállítjuk, mielőtt az oldal saját (fókusz-alapú) nyílgomb-kezelése lefutna.
        e.preventDefault();
        e.stopPropagation();
        e.stopImmediatePropagation();
        btn.click();
        // Ne maradjon a gombon a fókusz, hogy az oldal saját roving-focus logikája
        // ne tudjon a következő lenyomáskor beleszólni.
        if (document.activeElement && typeof document.activeElement.blur === 'function') {
            document.activeElement.blur();
        }
    }
    // window szinten, capture fázisban -> ez fut le elsőként, még az oldal saját
    // (bármely elemre regisztrált) keydown-figyelői előtt, fókusztól függetlenül.
    window.addEventListener('keydown', handleNavKey, true);
    // --- "Újra" gomb -> a kártyák eltüntetése UTÁN görgessen fel a container tetejére ---
    function isRestartButton(el) {
        return !!el && el.tagName === 'BUTTON' && el.textContent.trim() === 'Újra';
    }
    function getScrollableAncestors(el) {
        // Az összes ősszülőt összegyűjtjük (nem csak az elsőt, ami görgethetőnek tűnik),
        // mert nem lehetünk biztosak benne, melyik a ténylegesen látható görgetősáv -
        // lehet, hogy egymásba ágyazott konténerek is vannak.
        const result = [];
        let node = el ? el.parentElement : null;
        while (node) {
            result.push(node);
            node = node.parentElement;
        }
        return result;
    }
    window.addEventListener('click', function(e) {
        const btn = e.target.closest('button');
        if (!isRestartButton(btn)) return;
        // FONTOS: a görgethető konténer(ek) referenciáját MÉG a kattintás pillanatában,
        // szinkron módon rögzítjük - mielőtt az oldal (React) esetleg lecseréli/eltávolítja
        // magát a gombot (pl. mert a teljes kártyalista-résztfa újrarenderelődik). Ha ezt
        // késleltetve, a gombból kiindulva próbálnánk újraszámolni, a gomb már leválasztott
        // (detached) node lehetne, és a felfelé séta semmit sem találna - ez volt az eddigi hiba.
        const containers = getScrollableAncestors(btn);
        // Biztonsági kiegészítés: a ténylegesen görgő konténer ismert azonosítója (ha létezik).
        const known = document.getElementById('sayer-container');
        if (known && !containers.includes(known)) containers.push(known);
        const scrollNow = () => {
            containers.forEach(node => {
                if (node && node.isConnected) node.scrollTop = 0;
            });
            window.scrollTo(0, 0);
            if (document.scrollingElement) document.scrollingElement.scrollTop = 0;
            document.documentElement.scrollTop = 0;
            document.body.scrollTop = 0;
        };
        // Nem tudjuk pontosan, mennyi idő alatt tűnnek el ténylegesen a kártyák
        // (lehet azonnali, lehet CSS-átmenetes ~250-330ms, lehet aszinkron adatfrissítés
        // is), ezért többször, elosztva próbáljuk a tetejére állítani a görgetést.
        [0, 50, 150, 300, 600].forEach(delay => setTimeout(scrollNow, delay));
    }, true);
    // --- "Erő" beillesztés Ctrl/Cmd+V-re, szöveges mezőkben ---
    // Az eddigi védelem (addEventListener tiltás + onpaste/onbeforeinput property nullázása)
    // nem fog meg egy olyan tiltást, amit az oldal pl. a mező onkeydown property-jén keresztül
    // (nem addEventListener-rel!) valósít meg. Ahelyett, hogy találgatnánk, milyen módszerrel
    // blokkol az oldal, magát a Ctrl+V-t kapjuk el a lehető legkorábban (window, capture fázis),
    // és teljesen megállítjuk az eseményt (stopImmediatePropagation), mielőtt az bármilyen
    // formában (addEventListener, onkeydown/onpaste property, stb.) elérhetné magát a mezőt.
    // Ezután a vágólap tartalmát kézzel írjuk be, és natív 'input' eseményt küldünk, hogy pl.
    // egy React-alapos state is frissüljön.
    function isTextEditable(el) {
        if (!el) return false;
        // csak olvasható / letiltott mező (pl. a hangfájlok neve) NEM szerkeszthető
        if (el.readOnly || el.disabled) return false;
        if (el.closest && el.closest('.hw-audio-name')) return false;
        const tag = el.tagName;
        return tag === 'INPUT' || tag === 'TEXTAREA' || el.isContentEditable === true;
    }
    function setNativeValue(el, value) {
        const proto = el.tagName === 'TEXTAREA' ? window.HTMLTextAreaElement.prototype : window.HTMLInputElement.prototype;
        const descriptor = Object.getOwnPropertyDescriptor(proto, 'value');
        if (descriptor && descriptor.set) {
            descriptor.set.call(el, value);
        } else {
            el.value = value;
        }
    }
    async function forcePaste(e) {
        const key = (e.key || '').toLowerCase();
        if (!(e.ctrlKey || e.metaKey) || key !== 'v') return;
        const target = e.target;
        if (!isTextEditable(target)) return;
        if (!navigator.clipboard || !navigator.clipboard.readText) return; // nincs Clipboard API - hagyjuk a natív útvonalat
        // A lehető legkorábban, még minden más kezelő előtt teljesen megállítjuk az eseményt.
        e.preventDefault();
        e.stopPropagation();
        e.stopImmediatePropagation();
        try {
            const text = await navigator.clipboard.readText();
            if (!text) return;
            if (target.isContentEditable) {
                document.execCommand('insertText', false, text);
                return;
            }
            const start = target.selectionStart != null ? target.selectionStart : target.value.length;
            const end = target.selectionEnd != null ? target.selectionEnd : target.value.length;
            const newValue = target.value.slice(0, start) + text + target.value.slice(end);
            setNativeValue(target, newValue);
            const cursorPos = start + text.length;
            if (typeof target.setSelectionRange === 'function') {
                target.setSelectionRange(cursorPos, cursorPos);
            }
            // Natív 'input' esemény, hogy a React (vagy más keretrendszer) állapota frissüljön.
            target.dispatchEvent(new Event('input', { bubbles: true }));
        } catch (err) {
            // Ha a vágólap olvasása nem sikerül (pl. jogosultság hiánya), nincs mit tenni.
        }
    }
    // FONTOS: az originalAddEventListener-t hívjuk közvetlenül, NEM a window.addEventListener-t,
    // mert a fájl elején lévő patch a 'keydown' listenereket becsomagolja, és a becsomagolt
    // verzió pont a Ctrl/Cmd+V-t (mint vágólap-parancsot) nyelné el - ami itt pont az ellenkezője
    // lenne annak, amit el akarunk érni. Az eredeti addEventListener-rel megkerüljük ezt.
    originalAddEventListener.call(window, 'keydown', forcePaste, true);
    // --- Jobb Shift -> a lista utolsó, hangszóró (lejátszás) gombbal rendelkező kártyájának lejátszása ---
    // A billentyűzeten az Enter alatti, jobb oldali Shift gomb (fizikai hely szerint azonosítva,
    // a "code" mezővel: "ShiftRight" - ez akkor is a jobb Shiftet jelenti, ha a "key" mindkét
    // Shiftre csak annyit mond: "Shift") lenyomására megkeressük a kártyalista konténerén
    // (#sayer-container) belül az UTOLSÓ olyan kártyát, aminek van hangszóró/lejátszás gombja,
    // és arra kattintunk - mintha a felhasználó saját maga kattintott volna rá.
    //
    // Mivel az oldal ikon-gombjai (a korábbi "Online tanfolyam" gombhoz hasonlóan) jellemzően
    // nem kapnak külön aria-label/title szöveget, a felismerés két lépcsős:
    //   1) ha MÉGIS van beszédes címke (aria-label/title) a hangra/lejátszásra utalva, azt
    //      részesítjük előnyben;
    //   2) egyébként egy méret/alak alapú heurisztikával azonosítjuk: egy kis, kb. négyzet
    //      alakú, szöveg nélküli gomb/ikon (ez tipikusan egy hangszóró-ikon egy gombban).
    // A fejléc- (Ismétlések / Hangfelismerés / Felolvas) és lábléc-gombokat (Előző/Következő,
    // Újra) kifejezetten kizárjuk, nehogy véletlenül azokat találja a heurisztika.
    const SAYER_CONTAINER_ID = 'sayer-container';
    const NAV_OR_HEADER_BUTTON_RE = /^(next|previous|következő|előző|hangfelismerés|felolvas|újra|ismétlések)$/i;
    const SPEAKER_LABEL_RE = /hangfelvétel|hangfájl|lejátsz|felolvas|speaker|play|audio|hang/i;
    function looksLikeSpeakerButton(el) {
        // Csak a TÉNYLEGESEN LÁTHATÓ kártyák jöhetnek szóba: a lista végén a még
        // meg nem jelenített kártyák is a DOM-ban vannak ("visibility: hidden",
        // "pointer-events: none"), korábban ezek közül a legutolsót találta el.
        if (!isElementVisible(el)) return false;
        if (el.disabled) return false;
        if (window.getComputedStyle(el).pointerEvents === 'none') return false;
        const label = (el.getAttribute('aria-label') || el.getAttribute('title') || '').trim();
        const visibleText = (el.textContent || '').trim();
        if (NAV_OR_HEADER_BUTTON_RE.test(label) || NAV_OR_HEADER_BUTTON_RE.test(visibleText)) return false;
        // 1) egyértelmű, hangra/lejátszásra utaló címke
        if (label && SPEAKER_LABEL_RE.test(label)) return true;
        // 2) méret/alak alapú heurisztika: szöveg nélküli, kis, kb. négyzet alakú ikon-gomb
        if (visibleText.length > 1) return false; // valódi szöveges gombnak (pl. "Újra") nem felel meg
        const r = el.getBoundingClientRect();
        if (!(r.width >= 18 && r.width <= 56 && r.height >= 18 && r.height <= 56)) return false;
        if (Math.abs(r.width - r.height) > 10) return false; // nagyjából négyzet alakú
        return true;
    }
    function findLastCardSpeakerButton(container) {
        const candidates = Array.from(container.querySelectorAll('button, [role="button"]'));
        for (let i = candidates.length - 1; i >= 0; i--) {
            if (looksLikeSpeakerButton(candidates[i])) return candidates[i];
        }
        return null;
    }
    function handleShiftRightKey(e) {
        if (e.code !== 'ShiftRight') return;
        if (e.repeat) return; // lenyomva tartva ne indítsa el újra és újra
        if (isTypingTarget(e.target)) return;
        // Csak a kártyás gyakorló felületen legyen aktív (ahol létezik a lista konténere)
        const container = document.getElementById(SAYER_CONTAINER_ID);
        if (!container) return;
        const btn = findLastCardSpeakerButton(container);
        if (!btn) return;
        e.preventDefault();
        btn.click();
    }
    // window szinten, capture fázisban - hogy más gombra eső fókusztól függetlenül működjön.
    originalAddEventListener.call(window, 'keydown', handleShiftRightKey, true);
    // --- Szóköz -> az "Újra" gomb megnyomása (amikor látható) ---
    // Fókusztól és egérpozíciótól függetlenül működik. Egyetlen kivétel: ha épp
    // egy szöveges mezőben gépelsz, ott a szóköz marad szóköz.
    function findVisibleRestartButton() {
        const candidates = Array.from(document.querySelectorAll('button, [role="button"]'));
        for (let i = candidates.length - 1; i >= 0; i--) {
            const b = candidates[i];
            if (b.disabled) continue;
            if ((b.textContent || '').trim() !== 'Újra') continue;
            if (!isElementVisible(b)) continue;
            if (window.getComputedStyle(b).pointerEvents === 'none') continue;
            return b;
        }
        return null;
    }
    function handleSpaceRestart(e) {
        if (e.code !== 'Space' && e.key !== ' ' && e.key !== 'Spacebar') return;
        if (e.ctrlKey || e.metaKey || e.altKey) return; // Ctrl+Szóköz = kamera be/ki (lent)
        if (e.repeat) return;
        if (isTypingTarget(e.target)) return; // mezőben a szóköz maradjon szóköz
        const btn = findVisibleRestartButton();
        if (!btn) return;
        e.preventDefault();
        e.stopPropagation();
        e.stopImmediatePropagation();
        btn.click();
        // Ne maradjon fókusz azon, amin épp volt - így a következő szóköz is
        // biztosan ide fut be.
        if (document.activeElement && typeof document.activeElement.blur === 'function') {
            document.activeElement.blur();
        }
    }
    originalAddEventListener.call(window, 'keydown', handleSpaceRestart, true);

    // --- Ctrl + Szóköz -> kamera be- és kikapcsolása ---
    // Az oldal saját kamera-gombját nyomjuk meg (így az oldal és a Zoom állapota is
    // rendben marad): ha a Zoom-beállítások ablaka nyitva van, az ottani gombot,
    // különben a lenti "További lehetőségek" menü "Kamera be/kikapcsolása" pontját.
    // A menü ilyenkor nem villan fel (láthatatlanul nyitjuk meg és csukjuk be).
    const CAMERA_TOGGLE_RE = /^Kamera (be|ki)kapcsolása$/;
    let hwCameraToggleBusy = false;
    function hwVisibleButton(root, re) {
        return Array.from(root.querySelectorAll('button, [role="menuitem"]'))
            .find(b => re.test((b.textContent || '').trim()) && !b.disabled && b.offsetParent !== null) || null;
    }
    async function hwToggleCamera() {
        if (hwCameraToggleBusy) return;
        hwCameraToggleBusy = true;
        const html = document.documentElement;
        try {
            cameraIntentUntil = Date.now() + CAMERA_INTENT_MS;
            const dialog = document.querySelector('[role="dialog"], .modal.show');
            const dialogBtn = dialog && hwVisibleButton(dialog, CAMERA_TOGGLE_RE);
            if (dialogBtn) { dialogBtn.click(); return; }
            const menuBtn = document.getElementById('studmenu');
            if (!menuBtn) return;
            html.classList.add('hw-silent-menu');
            const wasOpen = menuBtn.getAttribute('aria-expanded') === 'true';
            if (!wasOpen) menuBtn.click();
            let item = null;
            for (let i = 0; i < 10 && !item; i++) {
                await new Promise(r => setTimeout(r, 30));
                const menu = menuBtn.parentElement && menuBtn.parentElement.querySelector('[role="menu"]');
                item = menu && Array.from(menu.querySelectorAll('[role="menuitem"], button'))
                    .find(b => CAMERA_TOGGLE_RE.test((b.textContent || '').trim()) && !b.disabled);
            }
            if (item) item.click();
            else console.info('[Hollywood] A kamera most nem kapcsolható (nincs videóhívás).');
            await new Promise(r => setTimeout(r, 30));
            if (menuBtn.getAttribute('aria-expanded') === 'true' && !wasOpen) menuBtn.click();
        } catch (err) {
            console.warn('[Hollywood] kamera be/ki:', err && err.message);
        } finally {
            setTimeout(() => html.classList.remove('hw-silent-menu'), 60);
            setTimeout(() => { hwCameraToggleBusy = false; }, 400);
        }
    }
    function handleCtrlSpace(e) {
        if (!(e.ctrlKey || e.metaKey) || e.altKey || e.shiftKey) return;
        if (e.code !== 'Space' && e.key !== ' ' && e.key !== 'Spacebar') return;
        e.preventDefault();
        e.stopPropagation();
        e.stopImmediatePropagation();
        if (e.repeat) return;
        hwToggleCamera();
    }
    originalAddEventListener.call(window, 'keydown', handleCtrlSpace, true);

    // --- Biztonsági háló: az oldal belső lapváltásai (SPA) után is fusson minden ---
    // Az oldal nem tölt újra a menüpontok között, csak kicseréli a tartalmat. Ha egy
    // ilyen váltás után valamelyik beállítás lemaradna, ez a rész pótolja: újra
    // lefuttatja az összes igazítást, és ha a beszúrt stílusaink eltűntek, visszateszi
    // őket. Minden hívás külön try/catch-ben fut, hogy egy hiba ne állítsa meg a többit.
    function hwRunAllFixers() {
        if (!document.getElementById('hollywood-fullwidth-layout')) {
            try { injectHollywoodLayoutStyle(); } catch (e) {}
        }
        if (!document.getElementById('hollywood-no-select-buttons')) {
            try { injectButtonNoSelectStyle(); } catch (e) {}
        }
        if (!document.getElementById('hollywood-audio-names')) {
            try { injectAudioNameStyle(); } catch (e) {}
        }
        [clearInlineHandlers, fixWideInlineWidths, fixCardAreaSpacing, fixNotesWidgets, fixMediaWidgets, checkSlideFrames, hwRunUiFixes, hwFitPageColumns]
            .forEach(fn => { try { fn(); } catch (e) { console.warn('[Hollywood] hiba:', e && e.message); } });
        if (window.__hollywood) window.__hollywood.runs++;
    }
    function hwRunAllFixersSoon() {
        setTimeout(hwRunAllFixers, 60);
        setTimeout(hwRunAllFixers, 400);
        setTimeout(hwRunAllFixers, 1200);
    }
    ['popstate', 'hashchange', 'pageshow', 'visibilitychange', 'focus', 'load'].forEach(type => {
        originalAddEventListener.call(window, type, hwRunAllFixersSoon, true);
    });
    // Az SPA-lapváltás a History API-n keresztül megy - erre is ráülünk.
    ['pushState', 'replaceState'].forEach(method => {
        const original = history[method];
        if (typeof original !== 'function') return;
        history[method] = function() {
            const result = original.apply(this, arguments);
            hwRunAllFixersSoon();
            return result;
        };
    });
    setInterval(hwRunAllFixers, 1500);
    hwRunAllFixersSoon();

    // --- A diavetítés (iframe) szkriptjének ellenőrzése ---
    // A Tampermonkey néha kihagyja a menet közben létrehozott iframe-eket: ilyenkor a
    // dián belül nem működik a kijelölés és a lapozás-tiltás, és csak újratöltésre
    // javul meg. A keretben futó rész jelez nekünk; ha a jelzés nem érkezik meg,
    // egyszer (szükség esetén kétszer) újratöltjük magát a keretet.
    const readySlideFrames = new WeakSet();
    const slideFrameRetries = new WeakMap();
    originalAddEventListener.call(window, 'message', e => {
        if (!e.data || e.data.__hollywood !== 'slides-ready') return;
        document.querySelectorAll('iframe').forEach(f => {
            if (f.contentWindow === e.source) readySlideFrames.add(f);
        });
    }, false);
    function isSlideFrame(f) {
        return /docs\.google\.com\/presentation/.test(f.src || '');
    }
    function checkSlideFrames() {
        document.querySelectorAll('iframe').forEach(f => {
            if (!isSlideFrame(f) || readySlideFrames.has(f)) return;
            if (f.__hwCheckStarted) return;
            f.__hwCheckStarted = true;
            // adunk neki időt a betöltésre, és közben meg is kérdezzük
            const ping = setInterval(() => {
                try { f.contentWindow.postMessage({ __hollywood: 'slides-ping' }, '*'); } catch (err) {}
            }, 700);
            setTimeout(() => {
                clearInterval(ping);
                if (readySlideFrames.has(f) || !f.isConnected) return;
                const tries = (slideFrameRetries.get(f) || 0) + 1;
                slideFrameRetries.set(f, tries);
                if (tries > 2) {
                    console.warn('[Hollywood] A diavetítés keretébe nem sikerült betölteni a szkriptet.');
                    return;
                }
                console.info('[Hollywood] A diavetítés kerete szkript nélkül indult - újratöltöm (' + tries + '.).');
                f.__hwCheckStarted = false;
                const src = f.src;
                f.src = 'about:blank';
                setTimeout(() => { f.src = src; }, 50);
            }, 5000);
        });
    }
    setInterval(checkSlideFrames, 1000);

    // --- Diagnosztika: látszódjon a konzolban, hogy a szkript elindult-e ---
    window.__hollywood = { started: new Date().toISOString(), runs: 0, lateStart: document.readyState !== 'loading' };
    console.info('[Hollywood] szkript elindult a fő oldalon:', location.pathname);
})();