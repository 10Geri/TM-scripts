// ==UserScript==
// @name         DownSub
// @namespace    Claude
// @version      1.0
// @description
// @author       10Geri
// @match        *://downsub.com/*
// @match        *://*.downsub.com/*
// @grant        GM_addStyle
// @run-at       document-start
// ==/UserScript==

(function () {
  'use strict';

  const css = `
    /* Külső kártya */
    .v-card.v-card--flat.v-sheet.v-sheet--outlined.theme--light.pa-4 {
      display: flex !important;
      flex-direction: column !important;
      align-items: center !important;
      text-align: center !important;
    }
    /* A "row no-gutters" (fő sor: bal oszlop + jobb oszlop) legyen oszlopos, középre igazított */
    .container.ds-info.outlined .row.no-gutters {
      display: flex !important;
      flex-direction: column !important;
      align-items: center !important;
      width: 100% !important;
    }
    /* A col-sm-7 / col-sm-5 oszlopok ne legyenek fél-fél szélesek, hanem teljes szélesség, tartalmuk középen */
    .container.ds-info.outlined [class*="col-sm-"],
    .container.ds-info.outlined [class*="col-md-"] {
      max-width: 100% !important;
      flex: 0 0 100% !important;
      display: flex !important;
      flex-direction: column !important;
      align-items: center !important;
      text-align: center !important;
    }
    /* Videó thumbnail + cím sor */
    .container.ds-info.outlined .d-flex.flex-no-wrap.justify-start {
      justify-content: center !important;
      align-items: center !important;
      text-align: center !important;
    }
    /* Minden "layout justify-start" sor (nyelvenkénti gombsorok, bilingual/auto-translate sorok) */
    .container.ds-info.outlined .layout.justify-start {
      justify-content: center !important;
    }
    /* A "row my-2" sorok (Bilingual + Auto-translate fejlécek és dropdownok) */
    .container.ds-info.outlined .row.my-2 {
      justify-content: center !important;
      align-items: center !important;
      text-align: center !important;
    }
    /* Címsorok (Bilingual, Auto-translate from) középre */
    .container.ds-info.outlined .title.mt-2.pl-3.text-left {
      justify-content: center !important;
      text-align: center !important;
      padding-left: 0 !important;
    }
    /* Nyelvválasztó dropdownok középre */
    .container.ds-info.outlined .v-input {
      margin-left: auto !important;
      margin-right: auto !important;
    }
    /* Minden belső szöveg középre, biztonsági háló */
    .container.ds-info.outlined * {
      text-align: center !important;
    }
  `;

  if (typeof GM_addStyle !== 'undefined') {
    GM_addStyle(css);
  } else {
    const style = document.createElement('style');
    style.textContent = css;
    document.documentElement.appendChild(style);
  }
})();