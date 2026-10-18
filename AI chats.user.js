// ==UserScript==
// @name         AI chats
// @namespace    Claude
// @version      1.0
// @description
// @author       10Geri
// @match        https://chatgpt.com/*
// @match        https://chat.openai.com/*
// @match        https://claude.ai/*
// @match        https://grok.com/*
// @grant        GM_addStyle
// @run-at       document-start
// ==/UserScript==

(function () {
    'use strict';

    // =====================================================================
    // EGY FÁJL, DE OLDALANKÉNT TELJESEN ELKÜLÖNÍTETT SZAKASZOK
    //
    // A fenti négy @match minta miatt ez a szkript mind a négy domainen
    // lefut, DE a tényleges CSS-t lentebb egy domain-alapú elágazás
    // (lásd getSiteType) dönti el, és KIZÁRÓLAG az adott oldalhoz
    // tartozó szakasz kapcsol be - a másik kettő ilyenkor egyáltalán
    // meg sem hívódik. Ez ugyanaz az elkülönítési elv, mint amit a
    // Google keresőoldal-szkriptben a lap-típusoknál (Összes/Képek/stb.)
    // alkalmaztunk: egy oldal CSS-e szerkezetileg nem tud lefutni egy
    // másik oldalon, és mindegyik szakasz a SAJÁT try/catch blokkjában
    // fut, úgyhogy ha az egyik oldal DOM-ja/class-nevei a jövőben
    // megváltoznának és emiatt hibázna, az a másik két oldalt nem
    // érinti.
    // =====================================================================

    function injectCss(css, styleId) {
        if (typeof GM_addStyle === 'function') {
            GM_addStyle(css);
        } else {
            // Tartalék, ha a GM_addStyle valamiért nem elérhető (pl. a
            // felhasználó a @grant sort módosítja).
            const style = document.createElement('style');
            style.id = styleId;
            style.textContent = css;
            (document.head || document.documentElement).appendChild(style);
        }
    }

    // --- ChatGPT (chatgpt.com / chat.openai.com) ---
    function runChatGptSection() {
        try {
            const css = `
                :root {
                  --gpt-max-width: 98vw !important;
                  --gpt-side-margin: 16px !important;
                }
                /* Minden olyan elem, aminek a class-ja max-w-... -t tartalmaz */
                [class*="max-w-"] {
                  max-width: var(--gpt-max-width) !important;
                }
                /* A teljes üzenet-konténer és annak szülői */
                main [class*="mx-auto"] {
                  max-width: var(--gpt-max-width) !important;
                  width: 100% !important;
                }
                /* Az üzenet sorok (user + asszisztens) */
                [data-message-author-role] {
                  max-width: none !important;
                  width: 100% !important;
                }
                /* Az üzenetet körbevevő wrapper divek */
                [data-message-author-role] > div,
                [data-message-author-role] * {
                  max-width: none !important;
                }
                /* Az input/composer mező szélessége */
                form [class*="max-w-"] {
                  max-width: var(--gpt-max-width) !important;
                  width: 100% !important;
                }
                main, article, section {
                  max-width: 100% !important;
                  width: 100% !important;
                }
                @media (min-width: 2000px) {
                  :root {
                    --gpt-max-width: 99vw !important;
                  }
                }
            `;
            injectCss(css, 'gm-chatgpt-fullwidth');
        } catch (e) {
            console.error('[ai-chat-fullwidth][ChatGPT]', e);
        }
    }

    // --- Claude (claude.ai) ---
    function runClaudeSection() {
        try {
            const css = `
                :root {
                  --claude-max-width: 98vw !important;
                  --claude-side-margin: 16px !important;
                }
                div[class*="max-w-"] {
                  max-width: var(--claude-max-width) !important;
                  margin-left: auto !important;
                  margin-right: auto !important;
                  width: 100% !important;
                  padding-left: var(--claude-side-margin) !important;
                  padding-right: var(--claude-side-margin) !important;
                }
                div[class*="mx-auto"],
                div[class*="max-w-4xl"],
                div[class*="max-w-5xl"],
                div[class*="max-w-6xl"],
                div[class*="max-w-7xl"],
                div[class*="max-w-3xl"],
                div[class*="max-w-2xl"],
                div[class*="max-w-xl"],
                div[class*="max-w-lg"] {
                  max-width: var(--claude-max-width) !important;
                }
                [data-testid="conversation-turn"] {
                  max-width: none !important;
                  width: 100% !important;
                }
                main, article, section {
                  max-width: 100% !important;
                  width: 100% !important;
                }
                @media (min-width: 2000px) {
                  :root {
                    --claude-max-width: 99vw !important;
                  }
                }
            `;
            injectCss(css, 'gm-claude-fullwidth');
        } catch (e) {
            console.error('[ai-chat-fullwidth][Claude]', e);
        }
    }

    // --- Grok (grok.com) ---
    function runGrokSection() {
        try {
            const css = `
                :root {
                  --grok-max-width: 98vw !important;
                  --grok-side-margin: 16px !important;
                }
                div[class*="max-w-"] {
                  max-width: var(--grok-max-width) !important;
                  margin-left: auto !important;
                  margin-right: auto !important;
                  width: 100% !important;
                  padding-left: var(--grok-side-margin) !important;
                  padding-right: var(--grok-side-margin) !important;
                }
                div[class*="mx-auto"],
                div[class*="max-w-4xl"],
                div[class*="max-w-5xl"],
                div[class*="max-w-6xl"],
                div[class*="max-w-7xl"],
                div[class*="max-w-3xl"],
                div[class*="max-w-2xl"],
                div[class*="max-w-xl"],
                div[class*="max-w-lg"] {
                  max-width: var(--grok-max-width) !important;
                }
                [data-testid="conversation-turn"] {
                  max-width: none !important;
                  width: 100% !important;
                }
                main, article, section {
                  max-width: 100% !important;
                  width: 100% !important;
                }
                @media (min-width: 2000px) {
                  :root {
                    --grok-max-width: 99vw !important;
                  }
                }
                /* --- A "New Chat" (kezdő) oldal beviteli mezője ---
                   A Grok széles kijelzőn egy konténer-szabállyal (@xl:w-4/5)
                   80%-ra szűkíti a beviteli mezőt - ezt oldjuk fel (1), és a
                   körülötte lévő kártya visszaveszi a szülő oldalsó
                   paddingjét is (2). Így a mező a chat-oszlop kb. 98%-át
                   tölti ki, minden ablakméretnél, vw-becslés nélkül.
                   Mindkét class-név csak a kezdőoldalon fordul elő, a
                   megnyitott beszélgetések nézetét nem érinti. */
                div[class*="@xl:w-4/5"] {
                  width: 100% !important;
                }
                div[class*="h-[450px]"] {
                  width: calc(100% + 80px) !important;
                  max-width: none !important;
                }
            `;
            injectCss(css, 'gm-grok-fullwidth');
        } catch (e) {
            console.error('[ai-chat-fullwidth][Grok]', e);
        }

        // --- CTRL+J visszaadása a böngészőnek (Letöltések) ---
        // A Grok a CTRL+J-t "új chat" gyorsbillentyűnek foglalja le, és
        // preventDefault()-tal letiltja a böngésző saját funkcióját. Mi a
        // window-on, capture fázisban, document-start-kor (tehát a Grok
        // saját figyelői ELŐTT) elkapjuk az eseményt, és leállítjuk a
        // továbbterjedését - így a Grok kódja meg sem kapja. Szándékosan
        // NEM hívunk preventDefault()-ot, ezért a böngésző alapértelmezett
        // művelete (letöltési előzmények megnyitása) lefut.
        // Külön try/catch, hogy egy esetleges hiba a CSS-t ne érintse.
        try {
            window.addEventListener('keydown', function (e) {
                const isJ = e.code === 'KeyJ' || (e.key && e.key.toLowerCase() === 'j');
                if (isJ && e.ctrlKey && !e.shiftKey && !e.altKey && !e.metaKey) {
                    e.stopImmediatePropagation();
                    e.stopPropagation();
                }
            }, true);
        } catch (e) {
            console.error('[ai-chat-fullwidth][Grok][Ctrl+J]', e);
        }
    }

    // --- Domain-felismerés és szakaszonkénti (egymástól független) futtatás ---
    function getSiteType() {
        const host = location.hostname;
        if (host === 'chatgpt.com' || host === 'chat.openai.com') return 'chatgpt';
        if (host === 'claude.ai') return 'claude';
        if (host === 'grok.com') return 'grok';
        return null;
    }

    const siteType = getSiteType();

    switch (siteType) {
        case 'chatgpt':
            runChatGptSection();
            break;
        case 'claude':
            runClaudeSection();
            break;
        case 'grok':
            runGrokSection();
            break;
        default:
            // Elméletileg nem fordulhat elő, mert a @match minták már
            // eleve csak a fenti három site-ra korlátozzák a futást -
            // biztonsági háló, ha valamelyik site a jövőben másik
            // domainre költözne.
            break;
    }
})();