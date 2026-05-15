/*
 * alex.fun music bridge
 * ─────────────────────
 * Drop-in script that gives every page on the site the same Spotify music
 * player. Persists playback state (URI + position + paused flag) in
 * localStorage so when you navigate between pages, music resumes seamlessly
 * from where it left off (with a ~1-2s gap while the Spotify iframe loads).
 *
 * The Dynamic-Island-style pill is auto-injected at top center on every page.
 * It only becomes visible once music is actively loaded.
 *
 * Auto-pauses when the cover image goes up (works with any of three common
 * cover patterns used across the site).
 *
 * Public API (window.alexFunMusic):
 *   .open()              — open the music modal
 *   .close()             — close it (pill stays visible if music is loaded)
 *   .togglePlayPause()   — flip the play/pause state via Spotify API
 *   .loadUri(uri)        — load a specific spotify: URI
 *   .urlToUri(url)       — convert open.spotify.com URLs to spotify: URIs
 */
(function () {
  if (window.__alexFunMusicBridge) return;
  window.__alexFunMusicBridge = true;

  // ─── Config ──────────────────────────────────────────────────────────────
  const STORAGE_KEY = "alexFunMusic";
  const MAX_AGE_MS  = 24 * 60 * 60 * 1000;                   // 24 hours
  const DEFAULT_URI = "spotify:playlist:37i9dQZF1DXcBWIGoYBM5M"; // Today's Top Hits

  // ─── State persistence ───────────────────────────────────────────────────
  function saveState(partial) {
    try {
      const cur = loadState() || {};
      const merged = Object.assign({}, cur, partial, { timestamp: Date.now() });
      localStorage.setItem(STORAGE_KEY, JSON.stringify(merged));
    } catch (_) {}
  }
  function loadState() {
    try {
      const raw = localStorage.getItem(STORAGE_KEY);
      if (!raw) return null;
      const s = JSON.parse(raw);
      if (!s || !s.uri) return null;
      if (Date.now() - (s.timestamp || 0) > MAX_AGE_MS) return null;
      return s;
    } catch (_) { return null; }
  }

  // ─── Inject CSS ──────────────────────────────────────────────────────────
  const CSS = `
    /* Music modal (Spotify embed) */
    .music-modal {
      position: fixed; inset: 0; z-index: 10050;
      background: rgba(0,0,0,.6); backdrop-filter: blur(8px);
      display: none; align-items: center; justify-content: center; padding: 24px;
    }
    .music-modal.show { display: flex; }
    .music-modal-frame {
      width: min(640px, 96vw);
      border-radius: 18px; overflow: hidden; position: relative;
      background: #121212; box-shadow: 0 24px 80px rgba(0,0,0,.5);
      border: 1px solid rgba(255,255,255,.12);
      display: flex; flex-direction: column;
    }
    .music-modal-close {
      position: absolute; top: 10px; right: 10px; z-index: 2;
      width: 32px; height: 32px; border-radius: 50%;
      background: rgba(0,0,0,.72); color: #fff; border: 1px solid rgba(255,255,255,.2);
      cursor: pointer; font-size: 16px; font-weight: 900;
      display: flex; align-items: center; justify-content: center;
      backdrop-filter: blur(8px);
    }
    .music-modal-close:hover { background: rgba(0,0,0,.9); }
    .music-modal-bar { display: flex; gap: 8px; padding: 16px 56px 12px 16px; }
    .music-modal-bar input {
      flex: 1; min-width: 0; padding: 10px 14px;
      border: 1px solid rgba(255,255,255,.15); border-radius: 999px;
      background: rgba(255,255,255,.06); color: #fff;
      font: 600 13px Inter, ui-sans-serif, system-ui, sans-serif; outline: none;
    }
    .music-modal-bar input:focus { border-color: #1db954; }
    .music-modal-bar input::placeholder { color: rgba(255,255,255,.4); }
    .music-modal-bar button {
      padding: 10px 22px; border: 0; border-radius: 999px;
      background: #1db954; color: #000;
      font: 700 13px Inter, ui-sans-serif, system-ui, sans-serif; cursor: pointer;
      transition: background .15s;
    }
    .music-modal-bar button:hover { background: #1ed760; }
    .music-modal-tip {
      padding: 0 16px 14px;
      font: 500 11px Inter, ui-sans-serif, system-ui, sans-serif;
      color: rgba(255,255,255,.4);
    }
    #musicSpotifyEmbed { padding: 0 16px 16px; min-height: 84px; }
    #musicSpotifyEmbed iframe {
      width: 100%; height: 152px; border: 0; border-radius: 12px; display: block;
    }

    /* Dynamic-Island-style pill */
    #musicIsland {
      position: fixed; top: 12px; left: 50%;
      z-index: 10030;
      display: none;
      width: 0; height: 36px;
      transform: translateX(-50%);
      pointer-events: none;
      --island-w: 96px;
      --island-w-hover: 256px;
      --island-bg: #000;
      --island-fg: #fff;
      --island-accent: #4ade80;
      --island-art-bg: linear-gradient(135deg, #f97316, #db2777);
      --island-spring: cubic-bezier(0.34, 1.56, 0.64, 1);
      --island-spring-soft: cubic-bezier(0.32, 0.72, 0, 1);
    }
    /* Pill themes — explicit overrides take priority over auto-detection */
    #musicIsland[data-pill-theme="light"] {
      --island-bg: #f5f5f7;
      --island-fg: #1a1a1a;
      --island-accent: #16a34a;
      --island-art-bg: linear-gradient(135deg, #fbbf24, #ec4899);
    }
    /* Game/clicker pages position the pill at the bottom. !important is
       belt-and-suspenders against animation rules re-applying `top`. */
    #musicIsland[data-pill-position="bottom"] {
      top: auto !important;
      bottom: 38px !important;  /* clears the 24-26px status bar most game pages use */
    }
    #musicIsland[data-pill-position="bottom"].show {
      animation: islandIntroBottom .55s var(--island-spring) both;
    }
    @keyframes islandIntroBottom {
      0%   { opacity: 0; transform: translateX(-50%) translateY(14px) scale(.55); }
      60%  { opacity: 1; }
      100% { opacity: 1; transform: translateX(-50%) translateY(0) scale(1); }
    }
    #musicIsland.show {
      display: block;
      animation: islandIntro .55s var(--island-spring) both;
    }
    @keyframes islandIntro {
      0%   { opacity: 0; transform: translateX(-50%) translateY(-14px) scale(.55); }
      60%  { opacity: 1; }
      100% { opacity: 1; transform: translateX(-50%) translateY(0) scale(1); }
    }
    .island-blobs { position: absolute; inset: -12px; filter: url(#islandGoo); pointer-events: none; }
    .island-blob-main {
      position: absolute; top: 12px; left: 50%;
      height: 36px; width: var(--island-w);
      margin-left: calc(var(--island-w) / -2);
      background: var(--island-bg); border-radius: 100px;
      transition: width .65s var(--island-spring), margin-left .65s var(--island-spring), background .25s;
    }
    .island-blob-orb {
      position: absolute; top: 14px;
      height: 32px; width: 32px; left: 50%;
      margin-left: calc(var(--island-w) / 2 - 30px);
      background: var(--island-bg); border-radius: 50%;
      opacity: 0;
      transition: margin-left .65s var(--island-spring), opacity .3s var(--island-spring-soft), background .25s;
    }
    #musicIsland:hover .island-blob-main, #musicIsland:focus-within .island-blob-main {
      width: var(--island-w-hover);
      margin-left: calc(var(--island-w-hover) / -2);
    }
    #musicIsland:hover .island-blob-orb, #musicIsland:focus-within .island-blob-orb {
      opacity: 1;
      margin-left: calc(var(--island-w-hover) / 2 - 30px);
    }

    .island-fg {
      position: absolute; top: 0; left: 50%;
      height: 36px; width: var(--island-w);
      margin-left: calc(var(--island-w) / -2);
      display: flex; align-items: center; justify-content: center;
      gap: 8px; padding: 0 14px;
      color: var(--island-fg);
      font: 700 12px/1 Inter, ui-sans-serif, system-ui, sans-serif;
      pointer-events: auto; cursor: pointer; user-select: none; overflow: hidden;
      transition: width .65s var(--island-spring), margin-left .65s var(--island-spring), color .25s, padding .65s var(--island-spring);
    }
    #musicIsland:hover .island-fg, #musicIsland:focus-within .island-fg {
      width: var(--island-w-hover);
      margin-left: calc(var(--island-w-hover) / -2);
      justify-content: flex-start; padding-left: 8px;
    }

    .island-eq {
      display: inline-flex; gap: 2.5px; height: 14px; align-items: flex-end;
      flex: 0 0 auto;
      transition: opacity .25s, transform .45s var(--island-spring);
    }
    .island-eq i {
      display: block; width: 3px; background: var(--island-accent);
      border-radius: 1px; transform-origin: bottom;
      animation: islandEq 1s infinite ease-in-out;
      transition: background .25s;
    }
    .island-eq i:nth-child(1) { animation-delay: 0s;    height: 60%;  }
    .island-eq i:nth-child(2) { animation-delay: .15s;  height: 100%; }
    .island-eq i:nth-child(3) { animation-delay: .35s;  height: 50%;  }
    .island-eq i:nth-child(4) { animation-delay: .55s;  height: 80%;  }
    @keyframes islandEq {
      0%, 100% { transform: scaleY(0.35); }
      50%      { transform: scaleY(1);    }
    }
    #musicIsland.paused .island-eq i { animation-play-state: paused; opacity: .4; }
    #musicIsland:hover .island-eq, #musicIsland:focus-within .island-eq {
      transform: scale(.85); opacity: .75;
    }

    .island-art {
      width: 26px; height: 26px; border-radius: 7px;
      background: var(--island-art-bg);
      flex: 0 0 auto;
      display: flex; align-items: center; justify-content: center;
      font-size: 14px; color: #fff;
      opacity: 0; transform: scale(.55) translateX(-4px);
      transition: opacity .3s var(--island-spring-soft), transform .55s var(--island-spring);
      box-shadow: 0 4px 12px rgba(0,0,0,.25);
    }
    #musicIsland:hover .island-art, #musicIsland:focus-within .island-art {
      opacity: 1; transform: scale(1) translateX(0);
    }

    .island-songname {
      display: flex; flex-direction: column; gap: 1px; min-width: 0;
      opacity: 0; transform: translateX(-6px);
      transition: opacity .35s var(--island-spring-soft) .1s,
                  transform .45s var(--island-spring) .1s;
      flex: 1 1 auto; overflow: hidden;
    }
    #musicIsland:hover .island-songname, #musicIsland:focus-within .island-songname {
      opacity: 1; transform: translateX(0);
    }
    .island-songtitle {
      font-size: 11.5px; font-weight: 800;
      white-space: nowrap; overflow: hidden; text-overflow: ellipsis;
      letter-spacing: 0.1px; color: var(--island-fg);
    }
    .island-songsub {
      font-size: 9.5px; font-weight: 600; opacity: .55;
      white-space: nowrap; overflow: hidden; text-overflow: ellipsis;
      color: var(--island-fg);
    }

    .island-pause {
      position: absolute; top: 2px;
      width: 32px; height: 32px; border-radius: 50%;
      border: 0; background: transparent;
      color: var(--island-fg); font: 900 0/1 inherit;
      display: flex; align-items: center; justify-content: center;
      cursor: pointer; pointer-events: auto;
      left: 50%; margin-left: calc(var(--island-w) / 2 - 30px); opacity: 0;
      transition: margin-left .65s var(--island-spring), opacity .3s var(--island-spring-soft), color .25s;
    }
    .island-pause::before { content: "⏸"; font-size: 12px; font-weight: 900; }
    #musicIsland.paused .island-pause::before { content: "▶"; }
    #musicIsland:hover .island-pause, #musicIsland:focus-within .island-pause {
      opacity: 1; margin-left: calc(var(--island-w-hover) / 2 - 30px);
    }
    .island-pause:active { transform: scale(.9); transition: transform .1s ease; }
  `;

  function injectStyles() {
    const style = document.createElement("style");
    style.id = "alexFunMusicStyles";
    style.textContent = CSS;
    document.head.appendChild(style);
  }

  // ─── Inject markup ───────────────────────────────────────────────────────
  function injectMarkup() {
    // SVG goo filter
    document.body.insertAdjacentHTML("beforeend", `
      <svg width="0" height="0" style="position:absolute;pointer-events:none;" aria-hidden="true">
        <defs>
          <filter id="islandGoo">
            <feGaussianBlur in="SourceGraphic" stdDeviation="7" result="blur" />
            <feColorMatrix in="blur" mode="matrix"
              values="1 0 0 0 0
                      0 1 0 0 0
                      0 0 1 0 0
                      0 0 0 22 -11" result="goo" />
            <feBlend in="SourceGraphic" in2="goo" />
          </filter>
        </defs>
      </svg>
      <div id="musicModal" class="music-modal" aria-hidden="true">
        <div class="music-modal-frame">
          <button class="music-modal-close" id="musicModalClose" type="button" aria-label="Close">✕</button>
          <div class="music-modal-bar">
            <input type="text" id="musicSpotifyInput" placeholder="Paste a Spotify track / album / playlist URL…" autocomplete="off" spellcheck="false">
            <button id="musicSpotifyLoadBtn" type="button">Load</button>
          </div>
          <div class="music-modal-tip">
            <strong style="color:#1db954;display:block;margin-bottom:6px;">To listen to your own playlist:</strong>
            <ol style="margin:0 0 0 18px;padding:0;line-height:1.6;">
              <li>Open <a href="https://open.spotify.com" target="_blank" rel="noopener noreferrer" style="color:#1db954;text-decoration:none;font-weight:700;">Spotify ↗</a> in a new tab &amp; log in</li>
              <li>Find a playlist, album, or track</li>
              <li>Click <strong>⋯</strong> → <strong>Share</strong> → <strong>Copy link to playlist</strong></li>
              <li>Paste it above &amp; hit <strong>Load</strong></li>
            </ol>
            <div style="margin-top:8px;opacity:.7;">Note: Spotify blocks its own login page from being embedded, so login has to happen on spotify.com itself.</div>
          </div>
          <div id="musicSpotifyEmbed"></div>
        </div>
      </div>
      <div id="musicIsland" role="group" aria-label="Music player">
        <div class="island-blobs" aria-hidden="true">
          <div class="island-blob-main"></div>
          <div class="island-blob-orb"></div>
        </div>
        <div class="island-fg" role="button" tabindex="0" aria-label="Open music player">
          <span class="island-eq" aria-hidden="true"><i></i><i></i><i></i><i></i></span>
          <span class="island-art" aria-hidden="true">♪</span>
          <span class="island-songname">
            <span class="island-songtitle">Now Playing</span>
            <span class="island-songsub">Spotify</span>
          </span>
        </div>
        <button class="island-pause" id="musicPillPauseBtn" type="button" aria-label="Play/Pause"></button>
      </div>
    `);
  }

  // ─── Spotify Iframe API ──────────────────────────────────────────────────
  let spotifyApi        = null;
  let spotifyController = null;
  let spotifyIsPaused   = true;
  let lastPosition      = 0;            // milliseconds
  let lastUri           = null;
  let coverPaused       = false;
  let saveTimer         = null;

  function loadSpotifyIframeAPI() {
    if (spotifyApi) return Promise.resolve(spotifyApi);
    if (window.SpotifyIframeApi) { spotifyApi = window.SpotifyIframeApi; return Promise.resolve(spotifyApi); }
    return new Promise(resolve => {
      const prev = window.onSpotifyIframeApiReady;
      window.onSpotifyIframeApiReady = (api) => {
        spotifyApi = api;
        window.SpotifyIframeApi = api;
        if (typeof prev === "function") { try { prev(api); } catch (_) {} }
        resolve(api);
      };
      if (!document.querySelector('script[src*="open.spotify.com/embed/iframe-api"]')) {
        const s = document.createElement("script");
        s.src = "https://open.spotify.com/embed/iframe-api/v1";
        s.async = true;
        document.head.appendChild(s);
      }
    });
  }

  function urlToUri(input) {
    input = (input || "").trim();
    if (!input) return null;
    if (/^spotify:(track|playlist|album|artist|episode|show):[a-zA-Z0-9]+$/.test(input)) return input;
    // Accept any spotify URL: optional intl-xx/ locale prefix, optional embed/,
    // and tolerate query string after the ID (e.g. ?si=...)
    const m = input.match(/spotify\.com\/(?:intl-[a-z-]+\/)?(?:embed\/)?(track|playlist|album|artist|episode|show)\/([a-zA-Z0-9]+)/i);
    return m ? `spotify:${m[1].toLowerCase()}:${m[2]}` : null;
  }

  function uriToUrl(uri) {
    const m = uri.match(/^spotify:(track|playlist|album|artist|episode|show):([a-zA-Z0-9]+)$/);
    return m ? `https://open.spotify.com/${m[1]}/${m[2]}` : null;
  }

  // Spotify's public oEmbed endpoint: returns { title, thumbnail_url, ... }
  // for any public Spotify URL — no auth required, CORS open. Used to populate
  // the pill's song title + album art (the Iframe API itself doesn't expose
  // any track metadata).
  async function fetchOEmbed(uri) {
    const url = uriToUrl(uri);
    if (!url) return null;
    try {
      const res = await fetch(`https://open.spotify.com/oembed?url=${encodeURIComponent(url)}`);
      if (!res.ok) return null;
      return await res.json();
    } catch (_) { return null; }
  }

  // Pull the high-res cover art from inside the oEmbed `html` payload, which
  // contains the real `<iframe>` with a `src` like .../embed/iframe/v3/... and
  // a metadata snippet. As a fallback we use the `thumbnail_url` (300px max).
  function pickThumbnail(oembed) {
    if (!oembed) return null;
    if (oembed.thumbnail_url) return oembed.thumbnail_url;
    return null;
  }

  async function updatePillInfo(uri) {
    if (!uri) return;
    const titleEl = document.querySelector(".island-songtitle");
    const subEl   = document.querySelector(".island-songsub");
    const artEl   = document.querySelector(".island-art");
    // Paint a "Loading…" state immediately so the user sees something happen
    // before the oEmbed round-trip completes.
    if (titleEl) titleEl.textContent = "Loading…";
    if (subEl)   subEl.textContent   = "Spotify";

    const oe = await fetchOEmbed(uri);
    const title = (oe && oe.title) || "Now Playing";
    const thumb = pickThumbnail(oe);
    if (titleEl) titleEl.textContent = title;
    if (subEl)   subEl.textContent   = (oe && oe.provider_name) || "Spotify";
    if (artEl) {
      if (thumb) {
        artEl.style.background = `url("${thumb}") center/cover, var(--island-art-bg)`;
        artEl.textContent = "";
      } else {
        artEl.style.background = "";
        artEl.textContent = "♪";
      }
    }
    // Persist so the pill is populated immediately on the next page load
    if (oe) saveState({ title: title, thumb: thumb });
  }

  function pillEl() { return document.getElementById("musicIsland"); }

  // Game pages + 67 Clicker get the pill at the bottom; dashboard at top.
  function isGamePage() {
    const path = location.pathname.toLowerCase();
    return !(path === "/" || path === "" || path.endsWith("/index.html") || path.endsWith("/"));
  }
  function applyPagePosition() {
    const el = pillEl(); if (!el) return;
    el.dataset.pillPosition = isGamePage() ? "bottom" : (window.__alexFunPillPosition || "top");
  }
  // Pick the pill theme. Order: explicit html[data-theme] → game pages default
  // to dark (most games are dark themed and body bg sampling is unreliable
  // when the dark style sits on a wrapper rather than <body>) → otherwise
  // sample body+html background luminance and pick a contrasting theme.
  function applyAutoTheme() {
    const el = pillEl(); if (!el) return;
    const declared = document.documentElement.getAttribute("data-theme");
    if (declared === "dark")  { el.dataset.pillTheme = "dark";  return; }
    if (declared === "light") { el.dataset.pillTheme = "light"; return; }
    if (isGamePage()) { el.dataset.pillTheme = "dark"; return; }
    // Dashboard sampling — try body then html
    try {
      let bg = getComputedStyle(document.body).backgroundColor;
      if (!bg || /rgba?\(0,\s*0,\s*0,\s*0\)/.test(bg) || bg === "transparent") {
        bg = getComputedStyle(document.documentElement).backgroundColor || "rgb(255,255,255)";
      }
      const m  = bg.match(/(\d+)\D+(\d+)\D+(\d+)/);
      if (!m) { el.dataset.pillTheme = "dark"; return; }
      const lum = 0.299*+m[1] + 0.587*+m[2] + 0.114*+m[3];
      el.dataset.pillTheme = lum < 140 ? "dark" : "light";
    } catch (_) { el.dataset.pillTheme = "dark"; }
  }
  // Public helper: pages can override "top" / "bottom" for the pill. Game
  // pages are always "bottom" — the optional arg lets the dashboard switch
  // when entering/leaving the in-page 67 Clicker view.
  window.__alexFunSetPillPosition = function (pos) {
    window.__alexFunPillPosition = pos;
    const el = pillEl();
    if (!el) return;
    const final = isGamePage() ? "bottom" : (pos || "top");
    el.dataset.pillPosition = final;
    // Also re-apply theme since the page context may have changed
    applyAutoTheme();
  };

  function scheduleSave() {
    if (saveTimer) clearTimeout(saveTimer);
    saveTimer = setTimeout(() => {
      saveState({
        uri:       lastUri,
        position:  lastPosition,
        isPaused:  spotifyIsPaused
      });
    }, 700);
  }

  async function ensureController(uri, seekMs, autoplay) {
    const api      = await loadSpotifyIframeAPI();
    const el       = document.getElementById("musicSpotifyEmbed");
    const prevUri  = lastUri;
    const finalUri = uri || lastUri || DEFAULT_URI;
    const isNewUri = uri && uri !== prevUri;
    lastUri = finalUri;

    // Fire-and-forget metadata fetch so the pill shows the song title + art
    updatePillInfo(finalUri);

    if (spotifyController) {
      if (isNewUri) spotifyController.loadUri(finalUri);
      if (typeof seekMs === "number" && seekMs > 0) {
        setTimeout(() => { try { spotifyController.seek(seekMs / 1000); } catch (_) {} }, 600);
      }
      if (autoplay) {
        setTimeout(() => { try { spotifyController.play(); } catch (_) {} }, isNewUri ? 800 : 200);
      }
      return spotifyController;
    }
    return new Promise(resolve => {
      api.createController(el, { uri: finalUri, theme: "0" }, (controller) => {
        spotifyController = controller;
        controller.addListener("playback_update", (e) => {
          spotifyIsPaused = !!e.data.isPaused;
          lastPosition    = e.data.position || 0;
          pillEl().classList.toggle("paused", spotifyIsPaused);
          scheduleSave();
        });
        // Spotify needs ~1s after createController fires before seek/play work
        if (typeof seekMs === "number" && seekMs > 0) {
          setTimeout(() => { try { controller.seek(seekMs / 1000); } catch (_) {} }, 1200);
        }
        if (autoplay) {
          setTimeout(() => { try { controller.play(); } catch (_) {} }, 1400);
        }
        resolve(controller);
      });
    });
  }

  // ─── Cover-image detection (auto-pause / resume) ─────────────────────────
  function handleCoverShown() {
    if (spotifyController && !spotifyIsPaused) {
      coverPaused = true;
      try { spotifyController.pause(); } catch (_) {}
    }
    if (spotifyController) pillEl().classList.add("paused");
  }
  function handleCoverHidden() {
    if (coverPaused && spotifyController) {
      coverPaused = false;
      try { spotifyController.play(); } catch (_) {}
    }
  }

  function watchCoverState() {
    // Pattern 1: #coverOverlay.show (most game pages)
    const cover = document.getElementById("coverOverlay");
    if (cover) {
      let prev = cover.classList.contains("show");
      new MutationObserver(() => {
        const cur = cover.classList.contains("show");
        if (cur !== prev) { prev = cur; cur ? handleCoverShown() : handleCoverHidden(); }
      }).observe(cover, { attributes: true, attributeFilter: ["class"] });
      if (prev) handleCoverShown();
    }
    // Pattern 2: body.cover-mode (drift-boss / space-waves style)
    let bodyPrev = document.body.classList.contains("cover-mode");
    new MutationObserver(() => {
      const cur = document.body.classList.contains("cover-mode");
      if (cur !== bodyPrev) { bodyPrev = cur; cur ? handleCoverShown() : handleCoverHidden(); }
    }).observe(document.body, { attributes: true, attributeFilter: ["class"] });
    if (bodyPrev) handleCoverShown();

    // Pattern 3: index.html — #idlePhoto without .hidden = cover visible
    const idle = document.getElementById("idlePhoto");
    if (idle) {
      let idlePrev = !idle.classList.contains("hidden");
      new MutationObserver(() => {
        const cur = !idle.classList.contains("hidden");
        if (cur !== idlePrev) { idlePrev = cur; cur ? handleCoverShown() : handleCoverHidden(); }
      }).observe(idle, { attributes: true, attributeFilter: ["class"] });
      if (idlePrev) handleCoverShown();
    }
  }

  // ─── Public API ──────────────────────────────────────────────────────────
  function openModal() {
    const modal = document.getElementById("musicModal");
    if (!modal) return;
    modal.classList.add("show");
    modal.setAttribute("aria-hidden", "false");
    pillEl().classList.remove("show");
    // Only auto-create the controller if we already have something to play
    // (e.g. user is reopening the modal while a track is loaded). Otherwise
    // wait for the user to paste a URL — empty state is intentional.
    if (lastUri || spotifyController) ensureController();
  }
  function closeModal() {
    const modal = document.getElementById("musicModal");
    if (!modal) return;
    modal.classList.remove("show");
    modal.setAttribute("aria-hidden", "true");
    if (spotifyController) pillEl().classList.add("show");
  }
  function togglePlayPause() {
    if (!spotifyController) return;
    try {
      if (spotifyIsPaused) spotifyController.play();
      else                 spotifyController.pause();
    } catch (_) {}
  }

  // ─── Init ────────────────────────────────────────────────────────────────
  function init() {
    if (document.getElementById("musicIsland")) return; // already injected
    injectStyles();
    injectMarkup();

    document.getElementById("musicModalClose").addEventListener("click", closeModal);
    document.getElementById("musicModal").addEventListener("click", e => {
      if (e.target === document.getElementById("musicModal")) closeModal();
    });

    const input = document.getElementById("musicSpotifyInput");
    const loadBtn = document.getElementById("musicSpotifyLoadBtn");
    loadBtn.addEventListener("click", async () => {
      const uri = urlToUri(input.value);
      if (!uri) {
        input.focus();
        input.placeholder = "Invalid URL — try a Spotify track/album/playlist link";
        return;
      }
      const originalLabel = loadBtn.textContent;
      loadBtn.textContent = "Loading…";
      loadBtn.disabled = true;
      input.value = "";
      // Reveal the pill instantly so the user sees "Loading…" feedback there too
      pillEl().classList.add("show");
      try {
        // autoplay = true so playback starts the moment the embed is ready
        await ensureController(uri, 0, true);
      } finally {
        loadBtn.textContent = originalLabel;
        loadBtn.disabled = false;
      }
    });
    input.addEventListener("keydown", e => {
      if (e.key === "Enter") { e.preventDefault(); loadBtn.click(); }
    });

    const fg = pillEl().querySelector(".island-fg");
    fg.addEventListener("click", openModal);
    fg.addEventListener("keydown", e => {
      if (e.key === "Enter" || e.key === " ") { e.preventDefault(); openModal(); }
    });
    document.getElementById("musicPillPauseBtn").addEventListener("click", e => {
      e.stopPropagation();
      togglePlayPause();
    });

    watchCoverState();
    applyPagePosition();
    applyAutoTheme();
    // Re-evaluate theme/position whenever <html>'s data-theme flips (the
    // shared light/dark toggle on index.html mutates that attribute).
    new MutationObserver(applyAutoTheme).observe(document.documentElement, {
      attributes: true, attributeFilter: ["data-theme"]
    });

    // Warm up the Spotify SDK in the background so the first user click
    // doesn't have to wait for it to download + initialize.
    loadSpotifyIframeAPI().catch(() => {});

    // Restore previous playback on page load
    const saved = loadState();
    if (saved && saved.uri) {
      // Paint the pill from cached metadata immediately so it doesn't flicker
      // through "Now Playing — Spotify" while oEmbed re-fetches in the bg.
      if (saved.title || saved.thumb) {
        const titleEl = document.querySelector(".island-songtitle");
        const artEl   = document.querySelector(".island-art");
        if (titleEl && saved.title) titleEl.textContent = saved.title;
        if (artEl && saved.thumb) {
          artEl.style.background = `url("${saved.thumb}") center/cover, var(--island-art-bg)`;
          artEl.textContent = "";
        }
      }
      // Estimate where music WOULD be now, accounting for elapsed wall-clock
      // time since save (if it was playing when saved).
      const elapsed = Math.max(0, Date.now() - (saved.timestamp || Date.now()));
      const predictedMs = saved.isPaused
        ? (saved.position || 0)
        : Math.max(0, (saved.position || 0) + elapsed);
      ensureController(saved.uri, predictedMs);
      pillEl().classList.add("show");
      if (saved.isPaused) pillEl().classList.add("paused");
    }
  }

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", init);
  } else {
    init();
  }

  // Save state on page unload too, as a safety net
  window.addEventListener("pagehide", () => {
    if (lastUri) saveState({ uri: lastUri, position: lastPosition, isPaused: spotifyIsPaused });
  });

  // Expose API
  window.alexFunMusic = {
    open:            openModal,
    close:           closeModal,
    togglePlayPause: togglePlayPause,
    loadUri:         (uri) => ensureController(uri),
    urlToUri:        urlToUri
  };
})();
