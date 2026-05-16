/*
 * alex.fun music bridge (YouTube edition)
 * ─────────────────────────────────────────
 * Drop-in script that gives every page on the site the same YouTube music
 * player. Persists playback state (videoId/playlistId + position + paused
 * flag) in localStorage so when you navigate between pages, music resumes
 * seamlessly from where it left off (~1-2s gap while the YT iframe loads).
 *
 * The Dynamic-Island-style pill is auto-injected at top center on every page.
 * It only becomes visible once a video/playlist is actively loaded.
 *
 * Auto-pauses when the cover image goes up (three common cover patterns).
 *
 * Public API (window.alexFunMusic):
 *   .open()               — open the music modal
 *   .close()              — close it (pill stays visible if music is loaded)
 *   .togglePlayPause()    — flip play/pause via the YT IFrame API
 *   .loadItem(kindOrUrl)  — load a video (`{kind:"video", id}`) or accept a YT URL string
 */
(function () {
  if (window.__alexFunMusicBridge) return;
  window.__alexFunMusicBridge = true;

  // ─── Config ──────────────────────────────────────────────────────────────
  const STORAGE_KEY = "alexFunMusic";
  const MAX_AGE_MS  = 24 * 60 * 60 * 1000; // 24 hours

  // ─── State persistence ───────────────────────────────────────────────────
  function saveState(partial) {
    try {
      const cur    = loadState() || {};
      const merged = Object.assign({}, cur, partial, { timestamp: Date.now() });
      localStorage.setItem(STORAGE_KEY, JSON.stringify(merged));
    } catch (_) {}
  }
  function loadState() {
    try {
      const raw = localStorage.getItem(STORAGE_KEY);
      if (!raw) return null;
      const s = JSON.parse(raw);
      if (!s || !s.id) return null;
      if (Date.now() - (s.timestamp || 0) > MAX_AGE_MS) return null;
      return s;
    } catch (_) { return null; }
  }

  // ─── Inject CSS ──────────────────────────────────────────────────────────
  const CSS = `
    /* Spotify search dropdown (same UI works for YouTube) */
    #musicSearchResults {
      position: relative;
      margin: 0 16px 8px;
      max-height: 280px;
      overflow-y: auto;
      border-radius: 12px;
      background: #1a1a1a;
      border: 1px solid rgba(255,255,255,.1);
      display: none;
    }
    #musicSearchResults.show { display: block; }
    .music-search-row {
      display: flex; align-items: center; gap: 10px;
      padding: 8px 12px;
      cursor: pointer;
      border-bottom: 1px solid rgba(255,255,255,.06);
      transition: background .12s;
    }
    .music-search-row:last-child { border-bottom: 0; }
    .music-search-row:hover, .music-search-row.focused { background: rgba(255,0,0,.15); }
    .music-search-row img {
      width: 44px; height: 32px;
      border-radius: 4px;
      object-fit: cover;
      flex: 0 0 auto;
      background: #333;
    }
    .music-search-row .row-text { min-width: 0; flex: 1 1 auto; }
    .music-search-row .row-name {
      font: 700 13px Inter, sans-serif; color: #fff;
      white-space: nowrap; overflow: hidden; text-overflow: ellipsis;
    }
    .music-search-row .row-sub {
      font: 600 11px Inter, sans-serif; color: rgba(255,255,255,.55);
      white-space: nowrap; overflow: hidden; text-overflow: ellipsis;
      margin-top: 2px;
    }
    .music-search-row .row-kind {
      font: 800 9px Inter, sans-serif; letter-spacing: 1px; text-transform: uppercase;
      color: rgba(255,80,80,.85);
      padding: 2px 6px; border: 1px solid rgba(255,80,80,.4);
      border-radius: 99px; flex: 0 0 auto;
    }
    .music-search-empty {
      padding: 14px 16px; color: rgba(255,255,255,.45);
      font: 600 12px Inter, sans-serif; text-align: center;
    }

    /* Music modal (YouTube embed) */
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
    .music-modal-bar input:focus { border-color: #ff0033; }
    .music-modal-bar input::placeholder { color: rgba(255,255,255,.4); }
    .music-modal-bar button {
      padding: 10px 22px; border: 0; border-radius: 999px;
      background: #ff0033; color: #fff;
      font: 700 13px Inter, ui-sans-serif, system-ui, sans-serif; cursor: pointer;
      transition: background .15s;
    }
    .music-modal-bar button:hover { background: #ff2a52; }
    .music-modal-tip {
      padding: 0 16px 14px;
      font: 500 11px Inter, ui-sans-serif, system-ui, sans-serif;
      color: rgba(255,255,255,.4);
    }
    #musicYouTubeMount,
    #musicYouTubeMount > iframe {
      width: 100%; height: 280px; border: 0; border-radius: 0; display: block;
    }
    #musicYouTubeMount { padding: 0 0 0 0; min-height: 80px; }

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
      --island-accent: #ff3344;
      --island-art-bg: linear-gradient(135deg, #ff0033, #b30033);
      --island-spring: cubic-bezier(0.34, 1.56, 0.64, 1);
      --island-spring-soft: cubic-bezier(0.32, 0.72, 0, 1);
    }
    #musicIsland[data-pill-theme="light"] {
      --island-bg: #f5f5f7;
      --island-fg: #1a1a1a;
      --island-accent: #c00020;
      --island-art-bg: linear-gradient(135deg, #ff5577, #ff0033);
    }
    #musicIsland[data-pill-position="bottom"] {
      top: auto !important;
      bottom: 38px !important;
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
            <input type="text" id="musicSpotifyInput" placeholder="Search YouTube or paste a video / playlist URL…" autocomplete="off" spellcheck="false">
            <button id="musicSpotifyLoadBtn" type="button">Load</button>
          </div>
          <div id="musicSearchResults" role="listbox" aria-label="YouTube search results"></div>
          <div id="musicSpotifyStatus" style="padding:0 16px 8px;font:600 11px Inter,sans-serif;color:rgba(255,255,255,.6);min-height:14px;"></div>
          <div class="music-modal-tip">
            <strong style="color:#ff5577;display:block;margin-bottom:6px;">How to play:</strong>
            <div style="line-height:1.6;">
              <strong>1. Search:</strong> Type any song / artist / video name above. Click a result.<br>
              <strong>2. Paste a link:</strong> Any YouTube URL — <code>youtube.com/watch?v=…</code>, <code>youtu.be/…</code>, or a playlist <code>list=…</code> link works.
            </div>
          </div>
          <div id="musicYouTubeMount"></div>
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
            <span class="island-songsub">YouTube</span>
          </span>
        </div>
        <button class="island-pause" id="musicPillPauseBtn" type="button" aria-label="Play/Pause"></button>
      </div>
    `);
  }

  // ─── YouTube IFrame Player API ───────────────────────────────────────────
  let ytApi          = null;
  let ytPlayer       = null;
  let ytIsPaused     = true;
  let ytCurrentItem  = null;  // { kind: "video"|"playlist", id: string }
  let lastPosition   = 0;     // milliseconds
  let coverPaused    = false;
  let saveTimer      = null;
  let positionPoll   = null;

  function loadYouTubeIframeAPI() {
    if (window.YT && window.YT.Player) { ytApi = window.YT; return Promise.resolve(window.YT); }
    return new Promise((resolve, reject) => {
      let done = false;
      const finish = () => { if (done) return; done = true; ytApi = window.YT; resolve(window.YT); };
      const fail   = (err) => { if (done) return; done = true; reject(err || new Error("YT API failed")); };
      const prev = window.onYouTubeIframeAPIReady;
      window.onYouTubeIframeAPIReady = () => {
        if (typeof prev === "function") { try { prev(); } catch (_) {} }
        finish();
      };
      if (!document.querySelector('script[src*="youtube.com/iframe_api"]')) {
        const s = document.createElement("script");
        s.src = "https://www.youtube.com/iframe_api";
        s.async = true;
        s.onerror = () => fail(new Error("YouTube IFrame API failed to load"));
        document.head.appendChild(s);
      }
      setTimeout(() => fail(new Error("YouTube IFrame API timed out")), 45000);
    });
  }

  // Accepts: bare 11-char video ID, youtube.com/watch?v=…, youtu.be/…,
  // youtube.com/embed/…, youtube.com/playlist?list=…, youtube.com/watch?v=…&list=…
  // Returns { kind, id } or null.
  function parseYouTube(input) {
    input = (input || "").trim();
    if (!input) return null;
    // Plain video ID
    if (/^[a-zA-Z0-9_-]{11}$/.test(input)) return { kind: "video", id: input };
    // Try playlist first — list= param
    const listMatch = input.match(/[?&]list=([a-zA-Z0-9_-]+)/);
    // Then video — v= or youtu.be/<id>
    const videoMatch =
         input.match(/[?&]v=([a-zA-Z0-9_-]{11})/)
      || input.match(/youtu\.be\/([a-zA-Z0-9_-]{11})/)
      || input.match(/youtube\.com\/embed\/([a-zA-Z0-9_-]{11})/)
      || input.match(/youtube\.com\/shorts\/([a-zA-Z0-9_-]{11})/);
    if (videoMatch) return { kind: "video", id: videoMatch[1] };
    if (listMatch)  return { kind: "playlist", id: listMatch[1] };
    return null;
  }

  function itemToWatchUrl(item) {
    if (!item) return null;
    return item.kind === "playlist"
      ? `https://www.youtube.com/playlist?list=${item.id}`
      : `https://www.youtube.com/watch?v=${item.id}`;
  }

  // YouTube's public oEmbed endpoint — title, author_name, thumbnail_url.
  async function fetchYouTubeOEmbed(item) {
    const url = itemToWatchUrl(item);
    if (!url) return null;
    try {
      const res = await fetch(`https://www.youtube.com/oembed?url=${encodeURIComponent(url)}&format=json`);
      if (!res.ok) return null;
      return await res.json();
    } catch (_) { return null; }
  }

  function pillEl() { return document.getElementById("musicIsland"); }

  function isGamePage() {
    const path = location.pathname.toLowerCase();
    return !(path === "/" || path === "" || path.endsWith("/index.html") || path.endsWith("/"));
  }
  function applyPagePosition() {
    const el = pillEl(); if (!el) return;
    const wantBottom = isGamePage() || window.__alexFunPillPosition === "bottom";
    if (wantBottom) {
      el.style.top    = "auto";
      el.style.bottom = "38px";
      el.dataset.pillPosition = "bottom";
    } else {
      el.style.top    = "12px";
      el.style.bottom = "auto";
      el.dataset.pillPosition = "top";
    }
  }
  function applyAutoTheme() {
    const el = pillEl(); if (!el) return;
    const declared = document.documentElement.getAttribute("data-theme");
    if (declared === "dark")  { el.dataset.pillTheme = "dark";  return; }
    if (declared === "light") { el.dataset.pillTheme = "light"; return; }
    if (isGamePage())          { el.dataset.pillTheme = "dark"; return; }
    try {
      let bg = getComputedStyle(document.body).backgroundColor;
      if (!bg || /rgba?\(0,\s*0,\s*0,\s*0\)/.test(bg) || bg === "transparent") {
        bg = getComputedStyle(document.documentElement).backgroundColor || "rgb(255,255,255)";
      }
      const m = bg.match(/(\d+)\D+(\d+)\D+(\d+)/);
      if (!m) { el.dataset.pillTheme = "dark"; return; }
      const lum = 0.299*+m[1] + 0.587*+m[2] + 0.114*+m[3];
      el.dataset.pillTheme = lum < 140 ? "dark" : "light";
    } catch (_) { el.dataset.pillTheme = "dark"; }
  }
  window.__alexFunSetPillPosition = function (pos) {
    window.__alexFunPillPosition = pos;
    applyPagePosition();
    applyAutoTheme();
  };

  async function updatePillInfo(item) {
    if (!item) return;
    const titleEl = document.querySelector(".island-songtitle");
    const subEl   = document.querySelector(".island-songsub");
    const artEl   = document.querySelector(".island-art");
    if (titleEl) titleEl.textContent = "Loading…";
    if (subEl)   subEl.textContent   = "YouTube";
    const oe = await fetchYouTubeOEmbed(item);
    const title = (oe && oe.title) || "Now Playing";
    const thumb = (oe && oe.thumbnail_url) || null;
    const author = (oe && oe.author_name) || "YouTube";
    if (titleEl) titleEl.textContent = title;
    if (subEl)   subEl.textContent   = author;
    if (artEl) {
      if (thumb) {
        artEl.style.background = `url("${thumb}") center/cover, var(--island-art-bg)`;
        artEl.textContent = "";
      } else {
        artEl.style.background = "";
        artEl.textContent = "♪";
      }
    }
    if (oe) saveState({ kind: item.kind, id: item.id, title, thumb });
  }

  function scheduleSave() {
    if (saveTimer) clearTimeout(saveTimer);
    saveTimer = setTimeout(() => {
      if (!ytCurrentItem) return;
      saveState({
        kind:     ytCurrentItem.kind,
        id:       ytCurrentItem.id,
        position: lastPosition,
        isPaused: ytIsPaused,
      });
    }, 700);
  }

  function startPositionPolling() {
    if (positionPoll) clearInterval(positionPoll);
    positionPoll = setInterval(() => {
      if (!ytPlayer || typeof ytPlayer.getCurrentTime !== "function") return;
      try {
        lastPosition = (ytPlayer.getCurrentTime() || 0) * 1000;
        scheduleSave();
      } catch (_) {}
    }, 2000);
  }

  function setStatus(msg) {
    const el = document.getElementById("musicSpotifyStatus");
    if (el) el.textContent = msg || "";
  }

  async function ensurePlayer(item, seekMs, autoplay) {
    setStatus("Loading YouTube player…");
    const yt = await loadYouTubeIframeAPI();
    setStatus("Mounting player…");
    const finalItem = item || ytCurrentItem;
    if (!finalItem) { setStatus(""); return; }
    const isNewItem = !ytCurrentItem
      || finalItem.kind !== ytCurrentItem.kind
      || finalItem.id   !== ytCurrentItem.id;
    ytCurrentItem = finalItem;
    updatePillInfo(finalItem);

    // Existing player → just swap content
    if (ytPlayer && typeof ytPlayer.loadVideoById === "function") {
      try {
        if (finalItem.kind === "playlist") {
          if (autoplay) ytPlayer.loadPlaylist({ list: finalItem.id, listType: "playlist", index: 0 });
          else          ytPlayer.cuePlaylist({ list: finalItem.id, listType: "playlist", index: 0 });
        } else {
          const startSeconds = typeof seekMs === "number" && seekMs > 0 ? seekMs / 1000 : 0;
          if (autoplay) ytPlayer.loadVideoById({ videoId: finalItem.id, startSeconds });
          else          ytPlayer.cueVideoById({ videoId: finalItem.id, startSeconds });
        }
      } catch (_) {}
      setStatus("Loaded — playing");
      setTimeout(() => setStatus(""), 2000);
      return ytPlayer;
    }

    // First-time player creation
    return new Promise((resolve, reject) => {
      const mount = document.getElementById("musicYouTubeMount");
      if (!mount) { setStatus(""); return reject(new Error("Mount missing")); }
      // Replace the mount with a placeholder div the API will swap for an iframe.
      mount.innerHTML = `<div id="ytPlayerEl"></div>`;
      const playerVars = {
        autoplay:       autoplay ? 1 : 0,
        controls:       1,
        rel:            0,
        modestbranding: 1,
        playsinline:    1,
      };
      const config = {
        width:  "100%",
        height: "280",
        playerVars,
        events: {
          onReady: (e) => {
            try {
              if (typeof seekMs === "number" && seekMs > 0 && finalItem.kind === "video") {
                e.target.seekTo(seekMs / 1000, true);
              }
              if (autoplay) e.target.playVideo();
            } catch (_) {}
            startPositionPolling();
            setStatus("Loaded — playing");
            setTimeout(() => setStatus(""), 2000);
            resolve(e.target);
          },
          onStateChange: (e) => {
            // 0 ended, 1 playing, 2 paused, 3 buffering, 5 cued
            ytIsPaused = (e.data !== 1);
            pillEl().classList.toggle("paused", ytIsPaused);
            scheduleSave();
          },
          onError: (e) => {
            setStatus("⚠ Player error (code " + e.data + ")");
          },
        },
      };
      if (finalItem.kind === "playlist") {
        config.playerVars.list     = finalItem.id;
        config.playerVars.listType = "playlist";
      } else {
        config.videoId = finalItem.id;
      }
      ytPlayer = new yt.Player("ytPlayerEl", config);
    });
  }

  // ─── Cover-image detection (auto-pause / resume) ─────────────────────────
  function handleCoverShown() {
    if (ytPlayer && !ytIsPaused) {
      coverPaused = true;
      try { ytPlayer.pauseVideo(); } catch (_) {}
    }
    const p = pillEl();
    if (p) {
      p.classList.add("paused");
      // Hide the pill while the cover is up so it can't leak through any
      // game pages whose cover overlay sits at a lower z-index than the pill.
      p.style.visibility = "hidden";
    }
  }
  function handleCoverHidden() {
    if (coverPaused && ytPlayer) {
      coverPaused = false;
      try { ytPlayer.playVideo(); } catch (_) {}
    }
    const p = pillEl();
    if (p) p.style.visibility = "";
  }
  function watchCoverState() {
    const cover = document.getElementById("coverOverlay");
    if (cover) {
      let prev = cover.classList.contains("show");
      new MutationObserver(() => {
        const cur = cover.classList.contains("show");
        if (cur !== prev) { prev = cur; cur ? handleCoverShown() : handleCoverHidden(); }
      }).observe(cover, { attributes: true, attributeFilter: ["class"] });
      if (prev) handleCoverShown();
    }
    let bodyPrev = document.body.classList.contains("cover-mode");
    new MutationObserver(() => {
      const cur = document.body.classList.contains("cover-mode");
      if (cur !== bodyPrev) { bodyPrev = cur; cur ? handleCoverShown() : handleCoverHidden(); }
    }).observe(document.body, { attributes: true, attributeFilter: ["class"] });
    if (bodyPrev) handleCoverShown();
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
    if (ytCurrentItem || ytPlayer) ensurePlayer();
  }
  function closeModal() {
    const modal = document.getElementById("musicModal");
    if (!modal) return;
    modal.classList.remove("show");
    modal.setAttribute("aria-hidden", "true");
    if (ytPlayer) pillEl().classList.add("show");
  }
  function togglePlayPause() {
    if (!ytPlayer) return;
    try {
      if (ytIsPaused) ytPlayer.playVideo();
      else            ytPlayer.pauseVideo();
    } catch (_) {}
  }

  // ─── Search via Supabase Edge Function ───────────────────────────────────
  const SEARCH_DEBOUNCE_MS = 250;
  let searchDebounce = null;
  let lastQuery = "";
  let cachedResults = [];

  function spotifyConfig() {
    return {
      url: window.ALEX_FUN_SUPABASE_URL,
      key: window.ALEX_FUN_SUPABASE_PUBLISHABLE_KEY,
    };
  }
  async function runYouTubeSearch(query) {
    const { url, key } = spotifyConfig();
    if (!url || !key) throw new Error("Supabase config missing — search is unavailable here");
    const res = await fetch(`${url}/functions/v1/youtube-search`, {
      method: "POST",
      headers: {
        "Content-Type":  "application/json",
        Authorization:   `Bearer ${key}`,
        apikey:          key,
      },
      body: JSON.stringify({ q: query }),
    });
    if (!res.ok) throw new Error(`Search HTTP ${res.status}`);
    const data = await res.json();
    if (data.error) throw new Error(data.error);
    return data.results || [];
  }
  function escapeHtml(s) {
    return String(s).replace(/[&<>"']/g, c => (
      { "&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#39;" }[c]
    ));
  }
  function renderSearchResults(results) {
    const box = document.getElementById("musicSearchResults");
    if (!box) return;
    if (!results.length) {
      box.classList.add("show");
      box.innerHTML = `<div class="music-search-empty">No results</div>`;
      return;
    }
    box.classList.add("show");
    box.innerHTML = results.map((r, i) => `
      <div class="music-search-row" data-kind="${r.kind}" data-id="${r.id}" data-i="${i}" role="option">
        <img src="${r.image || ""}" alt="" onerror="this.style.visibility='hidden'">
        <div class="row-text">
          <div class="row-name">${escapeHtml(r.name || "")}</div>
          <div class="row-sub">${escapeHtml(r.artists || "")}</div>
        </div>
        <span class="row-kind">${r.kind}</span>
      </div>`).join("");
    box.querySelectorAll(".music-search-row").forEach(row => {
      row.addEventListener("click", () => pickResult(row.dataset.kind, row.dataset.id));
    });
  }
  function hideSearchResults() {
    const box = document.getElementById("musicSearchResults");
    if (box) { box.classList.remove("show"); box.innerHTML = ""; }
  }
  async function pickResult(kind, id) {
    hideSearchResults();
    const input = document.getElementById("musicSpotifyInput");
    if (input) input.value = "";
    pillEl().classList.add("show");
    try { await ensurePlayer({ kind, id }, 0, true); } catch (err) { console.error(err); }
  }
  function setupSearch(input) {
    input.addEventListener("input", () => {
      const value = input.value.trim();
      clearTimeout(searchDebounce);
      if (!value || parseYouTube(value)) {
        hideSearchResults();
        return;
      }
      if (value === lastQuery) return;
      searchDebounce = setTimeout(async () => {
        lastQuery = value;
        setStatus("Searching…");
        try {
          cachedResults = await runYouTubeSearch(value);
          renderSearchResults(cachedResults);
          setStatus("");
        } catch (err) {
          setStatus("⚠ " + (err.message || err));
          hideSearchResults();
        }
      }, SEARCH_DEBOUNCE_MS);
    });
    input.addEventListener("keydown", (e) => {
      if (e.key !== "Enter") return;
      const value = input.value.trim();
      if (!value) return;
      if (parseYouTube(value)) return;
      e.preventDefault();
      if (cachedResults.length) pickResult(cachedResults[0].kind, cachedResults[0].id);
    });
    input.addEventListener("blur", () => { setTimeout(hideSearchResults, 180); });
  }

  // ─── Init ────────────────────────────────────────────────────────────────
  function init() {
    if (document.getElementById("musicIsland")) return;
    injectStyles();
    injectMarkup();

    document.getElementById("musicModalClose").addEventListener("click", closeModal);
    document.getElementById("musicModal").addEventListener("click", e => {
      if (e.target === document.getElementById("musicModal")) closeModal();
    });

    const input = document.getElementById("musicSpotifyInput");
    const loadBtn = document.getElementById("musicSpotifyLoadBtn");
    setupSearch(input);
    loadBtn.addEventListener("click", async () => {
      const item = parseYouTube(input.value);
      if (!item) {
        input.focus();
        input.placeholder = "Invalid URL — paste a YouTube video or playlist link, or use search above";
        return;
      }
      const originalLabel = loadBtn.textContent;
      loadBtn.textContent = "Loading…";
      loadBtn.disabled = true;
      input.value = "";
      pillEl().classList.add("show");
      try {
        await ensurePlayer(item, 0, true);
        loadBtn.textContent = originalLabel;
      } catch (err) {
        console.error("Music load failed:", err);
        loadBtn.textContent = "Failed — retry";
        setStatus("⚠ " + (err && err.message ? err.message : String(err)));
        setTimeout(() => { loadBtn.textContent = originalLabel; }, 3000);
      } finally {
        loadBtn.disabled = false;
      }
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
    new MutationObserver(applyAutoTheme).observe(document.documentElement, {
      attributes: true, attributeFilter: ["data-theme"]
    });
    loadYouTubeIframeAPI().catch(() => {});

    const saved = loadState();
    if (saved && saved.id) {
      if (saved.title || saved.thumb) {
        const titleEl = document.querySelector(".island-songtitle");
        const artEl   = document.querySelector(".island-art");
        if (titleEl && saved.title) titleEl.textContent = saved.title;
        if (artEl && saved.thumb) {
          artEl.style.background = `url("${saved.thumb}") center/cover, var(--island-art-bg)`;
          artEl.textContent = "";
        }
      }
      const elapsed = Math.max(0, Date.now() - (saved.timestamp || Date.now()));
      const predictedMs = saved.isPaused
        ? (saved.position || 0)
        : Math.max(0, (saved.position || 0) + elapsed);
      ensurePlayer({ kind: saved.kind || "video", id: saved.id }, predictedMs, !saved.isPaused);
      pillEl().classList.add("show");
      if (saved.isPaused) pillEl().classList.add("paused");
    }
  }

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", init);
  } else {
    init();
  }

  window.addEventListener("pagehide", () => {
    if (ytCurrentItem) {
      saveState({
        kind:     ytCurrentItem.kind,
        id:       ytCurrentItem.id,
        position: lastPosition,
        isPaused: ytIsPaused,
      });
    }
  });

  window.alexFunMusic = {
    open:            openModal,
    close:           closeModal,
    togglePlayPause: togglePlayPause,
    loadItem:        (item) => ensurePlayer(typeof item === "string" ? parseYouTube(item) : item, 0, true),
    parseYouTube:    parseYouTube,
  };
})();
