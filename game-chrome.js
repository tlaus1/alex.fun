/* game-chrome.js — single source of truth for alex.fun's per-game chrome
   (Back/Fullscreen top bar, bottom status bar, Backspace cover overlay).

   Each game page just includes:
     <script src="./game-chrome.js"
             data-game-name="Football Bros"
             data-theme-accent="#ff9d2e"
             data-status-bg="#0a0a0a"
             data-status-fg="rgba(255,165,0,0.65)"></script>

   The script handles everything else: CSS, markup, button wiring, cover
   overlay toggling, fullscreen, Back-to-dashboard navigation. Themes are
   driven by CSS variables read from this script's data attributes.
*/
(function () {
  const me = document.currentScript;
  const cfg = (me && me.dataset) || {};

  const GAME_NAME    = cfg.gameName    || document.title || "alex.fun";
  const THEME_ACCENT = cfg.themeAccent || "#ff9d2e";
  const STATUS_BG    = cfg.statusBg    || "#0a0a0a";
  const STATUS_FG    = cfg.statusFg    || "rgba(255,165,0,0.65)";
  const PANEL_BG     = cfg.panelBg     || "rgba(0,0,0,.82)";
  const HOVER_BG     = cfg.hoverBg     || "rgba(40,20,0,.95)";

  // ── Theme tokens on :root so per-page CSS can read them if needed ──
  const themeStyle = document.createElement("style");
  themeStyle.id = "alexfun-game-theme";
  themeStyle.textContent = `
    :root {
      --status-h: 26px;
      --alex-accent: ${THEME_ACCENT};
      --alex-panel:  ${PANEL_BG};
      --alex-hover:  ${HOVER_BG};
      --alex-status-bg: ${STATUS_BG};
      --alex-status-fg: ${STATUS_FG};
    }
  `;
  document.head.appendChild(themeStyle);

  // ── Shared chrome stylesheet ──────────────────────────────────────
  const css = document.createElement("style");
  css.id = "alexfun-game-chrome-css";
  css.textContent = `
    /* Top bar (Back / Fullscreen) */
    .alex-topbar {
      position: fixed; top: 10px; left: 10px; right: 10px;
      display: flex; justify-content: space-between; align-items: center; gap: 10px;
      pointer-events: none; z-index: 9000;
      font-family: "Martel Sans", Arial, sans-serif;
    }
    .alex-actions { display: flex; gap: 8px; pointer-events: auto; }
    .alex-btn {
      appearance: none;
      border: 1.5px solid color-mix(in srgb, var(--alex-accent) 45%, transparent);
      border-radius: 999px;
      background: var(--alex-panel);
      color: #fff;
      padding: 8px 14px;
      font: inherit; font-size: 12px; font-weight: 900;
      cursor: pointer;
      backdrop-filter: blur(10px);
      box-shadow: 0 8px 22px rgba(0,0,0,.45);
      text-transform: uppercase; letter-spacing: 0.5px;
      transition: background .15s, border-color .15s, color .15s, transform .15s;
    }
    .alex-btn:hover {
      background: var(--alex-hover);
      border-color: var(--alex-accent);
      transform: translateY(-1px);
    }

    /* Status bar */
    #alexStatusBar {
      position: fixed; bottom: 0; left: 0; right: 0;
      height: var(--status-h);
      display: flex; align-items: center; justify-content: space-between;
      padding: 0 14px;
      background: var(--alex-status-bg);
      border-top: 1px solid color-mix(in srgb, var(--alex-accent) 30%, transparent);
      font-family: "Martel Sans", Arial, sans-serif;
      font-size: 11px; font-weight: 800;
      color: var(--alex-status-fg);
      z-index: 9100;
    }
    #alexStatusBar .sb-cover { cursor: pointer; user-select: none; }
    #alexStatusBar .sb-cover:hover { color: #fff; }

    /* Cover overlay (Backspace) — sits above the music pill (z-index 10030) */
    #coverOverlay {
      position: fixed; inset: 0; z-index: 11000;
      background: #fff; opacity: 0; pointer-events: none;
      transition: opacity .45s cubic-bezier(.4,0,.2,1); cursor: pointer;
    }
    #coverOverlay.show { opacity: 1; pointer-events: auto; }
    #coverOverlay img {
      width: 100%; height: 100%;
      object-fit: cover; object-position: top;
      display: block;
    }
  `;
  document.head.appendChild(css);

  // ── Build chrome markup. Skip if it's already there (page-defined). ──
  function ready(fn) {
    if (document.readyState === "loading") {
      document.addEventListener("DOMContentLoaded", fn, { once: true });
    } else fn();
  }

  function buildChrome() {
    if (!document.getElementById("alexTopbar")) {
      const topbar = document.createElement("div");
      topbar.id = "alexTopbar";
      topbar.className = "alex-topbar";
      topbar.innerHTML = `
        <div class="alex-actions">
          <button class="alex-btn" id="alexBackBtn" type="button">Back</button>
        </div>
        <div class="alex-actions">
          <button class="alex-btn" id="alexFullscreenBtn" type="button">Fullscreen</button>
        </div>
      `;
      document.body.appendChild(topbar);
    }

    if (!document.getElementById("coverOverlay")) {
      const cover = document.createElement("div");
      cover.id = "coverOverlay";
      cover.setAttribute("aria-hidden", "true");
      cover.innerHTML = `<img data-cover-image alt="Cover">`;
      document.body.appendChild(cover);
    }

    if (!document.getElementById("alexStatusBar")) {
      const bar = document.createElement("div");
      bar.id = "alexStatusBar";
      bar.innerHTML = `
        <span id="alexStatusGameName">${escapeHtml(GAME_NAME)}</span>
        <span class="sb-cover" id="alexCoverHint">Backspace Cover Image</span>
      `;
      document.body.appendChild(bar);
    }
  }

  function wireChrome() {
    const backBtn = document.getElementById("alexBackBtn");
    if (backBtn) backBtn.addEventListener("click", () => {
      location.href = new URL("index.html", location.href).href;
    });

    const fsBtn = document.getElementById("alexFullscreenBtn");
    if (fsBtn) {
      fsBtn.addEventListener("click", async () => {
        try {
          if (!document.fullscreenElement) {
            await document.documentElement.requestFullscreen();
          } else {
            await document.exitFullscreen();
          }
        } catch (e) { /* ignore */ }
      });
      document.addEventListener("fullscreenchange", () => {
        fsBtn.textContent = document.fullscreenElement ? "Exit Fullscreen" : "Fullscreen";
      });
    }

    const cover = document.getElementById("coverOverlay");
    const hint  = document.getElementById("alexCoverHint");
    function toggleCover() {
      if (!cover) return;
      const showing = cover.classList.toggle("show");
      cover.setAttribute("aria-hidden", String(!showing));
    }
    if (cover) cover.addEventListener("click", toggleCover);
    if (hint)  hint.addEventListener("click", toggleCover);
    document.addEventListener("keydown", (e) => {
      if (e.key !== "Backspace" || e.metaKey || e.ctrlKey || e.altKey) return;
      const t = e.target;
      if (t && (t.tagName === "INPUT" || t.tagName === "TEXTAREA" || t.isContentEditable)) return;
      e.preventDefault();
      toggleCover();
    }, true);
  }

  function escapeHtml(s) {
    return String(s ?? "").replace(/[&<>"']/g,
      c => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
  }

  ready(() => { buildChrome(); wireChrome(); });
})();
