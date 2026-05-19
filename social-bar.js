/* social-bar.js v5 — iframe edition.
   Opens the actual dashboard Friends/Messages panel above the bottom bar
   (loaded via iframe with ?embed= parameter). No redirect, no copy: the
   panel rendered inside is the literal dashboard panel JS+HTML.

   Bottom-bar buttons live INSIDE the page's existing status bar, so they
   appear universally below the game.
*/
(function () {
  try { console.log("[alex.fun] social-bar v9 (Martel Sans) loaded"); } catch (_) {}

  const path = location.pathname.split("/").pop() || "";
  if (path === "" || path === "index.html") return;

  function ready(fn) {
    if (document.readyState === "loading") {
      document.addEventListener("DOMContentLoaded", fn, { once: true });
    } else fn();
  }

  const ACTIVE_USER_KEY  = "alexFunActiveUserV1";
  const SOCIAL_KEY_BASE  = "alexFunSocialV1";

  function getActiveUser() { return localStorage.getItem(ACTIVE_USER_KEY) || ""; }
  function normalize(u) { return (u || "").trim().toLowerCase().replace(/[^a-z0-9_-]/g, ""); }
  function socialKey() {
    const u = normalize(getActiveUser()) || "guest";
    return SOCIAL_KEY_BASE + "__" + u;
  }
  function loadSocial() {
    try { return JSON.parse(localStorage.getItem(socialKey()) || "{}"); }
    catch (_) { return {}; }
  }
  function isBroadcast(m) {
    if (!m) return false;
    if (m.kind === "broadcast" || m.is_broadcast === true) return true;
    const body = typeof m === "string" ? m : (m.body || "");
    return /^\s*📢/.test(body);
  }
  function unreadDmCount() {
    const s = loadSocial();
    const msgs = s.messages;
    if (!msgs) return 0;
    let total = 0;
    const walk = (m) => { if (m && !m.mine && !m.read_at && !isBroadcast(m)) total++; };
    if (Array.isArray(msgs)) msgs.forEach(walk);
    else Object.values(msgs).forEach(arr => Array.isArray(arr) && arr.forEach(walk));
    return total;
  }
  function friendRequestCount() {
    const s = loadSocial();
    return Array.isArray(s.incomingRequests) ? s.incomingRequests.length : 0;
  }

  function init() {
    // Always inject Martel Sans so the page's own status-bar text matches the
    // dashboard, even when no user is logged in (the rest of the social bar
    // only runs once a user is active).
    injectFont();
    if (!getActiveUser()) return;

    injectStyles();
    const buttons = injectButtons();
    if (!buttons) return;
    injectIframeShell();

    function updateBadges() {
      const fc = friendRequestCount();
      const mc = unreadDmCount();
      const fb = buttons.querySelector('[data-badge="friends"]');
      const mb = buttons.querySelector('[data-badge="messages"]');
      if (fc > 0) { fb.textContent = fc > 9 ? "9+" : String(fc); fb.hidden = false; }
      else        { fb.hidden = true; }
      if (mc > 0) { mb.textContent = mc > 9 ? "9+" : String(mc); mb.hidden = false; }
      else        { mb.hidden = true; }
    }
    updateBadges();
    setInterval(updateBadges, 5000);
    window.addEventListener("storage", updateBadges);
  }

  function injectFont() {
    // Match the dashboard typography. Skip if the page already has it linked.
    if (document.querySelector('link[href*="Martel+Sans"]')) return;
    const pre1 = document.createElement("link");
    pre1.rel = "preconnect"; pre1.href = "https://fonts.googleapis.com";
    document.head.appendChild(pre1);
    const pre2 = document.createElement("link");
    pre2.rel = "preconnect"; pre2.href = "https://fonts.gstatic.com"; pre2.crossOrigin = "";
    document.head.appendChild(pre2);
    const link = document.createElement("link");
    link.rel = "stylesheet";
    link.href = "https://fonts.googleapis.com/css2?family=Martel+Sans:wght@400;600;700;800;900&display=swap";
    document.head.appendChild(link);
  }

  function injectStyles() {
    const css = `
      .alexfun-sb-btns {
        display: inline-flex; gap: 6px; align-items: center;
        font-family: "Martel Sans", Arial, sans-serif;
      }
      .alexfun-sb-btn {
        appearance: none;
        border: 1px solid rgba(255,255,255,.18);
        background: rgba(255,255,255,.06);
        color: inherit;
        padding: 3px 10px; border-radius: 999px;
        font: inherit; font-size: 11px; font-weight: 900;
        letter-spacing: .3px;
        cursor: pointer; display: inline-flex; align-items: center; gap: 5px;
        transition: background .15s, border-color .15s, transform .15s;
      }
      .alexfun-sb-btn:hover {
        background: rgba(255,107,61,.18);
        border-color: rgba(255,107,61,.55);
        transform: translateY(-1px);
      }
      .alexfun-sb-btn .alexfun-sb-badge {
        min-width: 16px; height: 16px; padding: 0 4px;
        border-radius: 999px;
        background: linear-gradient(135deg, #ef4444, #dc2626);
        color: #fff; font-size: 9.5px; font-weight: 900;
        display: inline-flex; align-items: center; justify-content: center;
        box-shadow: 0 2px 5px rgba(239,68,68,.45);
      }
      /* display:inline-flex was overriding the [hidden] attribute, so force
         the badge to fully disappear when it has no count. */
      .alexfun-sb-btn .alexfun-sb-badge[hidden] { display: none !important; }
      .alexfun-sb-fallback {
        position: fixed; bottom: 0; left: 0; right: 0;
        height: 26px; padding: 0 14px;
        display: flex; align-items: center; justify-content: flex-end; gap: 8px;
        background: rgba(10,15,25,.85); backdrop-filter: blur(10px);
        border-top: 1px solid rgba(255,255,255,.08);
        z-index: 9100;
        font-family: "Martel Sans", Arial, sans-serif;
        color: #fff;
      }

      /* iframe shell anchored above the status bar */
      #alexfunSocialFrame {
        position: fixed;
        left: 12px;
        bottom: calc(var(--status-h, 26px) + 10px);
        width: min(780px, calc(100vw - 24px));
        height: min(720px, calc(100vh - var(--status-h, 26px) - 24px));
        z-index: 10030;
        border-radius: 18px; overflow: hidden;
        background: #14181f;
        border: 1.5px solid rgba(255,255,255,.12);
        box-shadow: 0 24px 60px rgba(0,0,0,.6);
        transform: translateY(14px) scale(.98); opacity: 0; pointer-events: none;
        transition: transform .22s cubic-bezier(.4,0,.2,1), opacity .22s;
        display: flex; flex-direction: column;
      }
      #alexfunSocialFrame.show { transform: translateY(0) scale(1); opacity: 1; pointer-events: auto; }
      #alexfunSocialFrame iframe { flex: 1; width: 100%; border: 0; background: transparent; }
      #alexfunSocialFrame .alexfun-sb-close {
        position: absolute; top: 10px; right: 12px; z-index: 2;
        appearance: none; border: 1px solid rgba(255,255,255,.2);
        background: rgba(20,24,31,.9); color: #ececec;
        width: 30px; height: 30px; padding: 0; border-radius: 999px;
        font: inherit; font-size: 15px; font-weight: 900; cursor: pointer;
        backdrop-filter: blur(6px);
      }
      .alexfun-sb-backdrop {
        position: fixed; inset: 0; z-index: 10029;
        background: rgba(0,0,0,.4); backdrop-filter: blur(2px);
        opacity: 0; pointer-events: none;
        transition: opacity .2s;
      }
      .alexfun-sb-backdrop.show { opacity: 1; pointer-events: auto; }
    `;
    const style = document.createElement("style");
    style.textContent = css;
    document.head.appendChild(style);
  }

  function injectButtons() {
    const buttons = document.createElement("span");
    buttons.className = "alexfun-sb-btns";
    buttons.innerHTML = `
      <button type="button" class="alexfun-sb-btn" data-target="friends" aria-label="Friends">
        👤 Friends <span class="alexfun-sb-badge" data-badge="friends" hidden></span>
      </button>
      <button type="button" class="alexfun-sb-btn" data-target="messages" aria-label="Messages">
        ✉ Messages <span class="alexfun-sb-badge" data-badge="messages" hidden></span>
      </button>
    `;

    // Land the buttons inside the existing status bar where one exists.
    let host = document.getElementById("alexStatusBar") || document.getElementById("statusBar");
    if (host) {
      const coverHint = host.querySelector(".sb-cover, [id$='CoverHint'], [id='coverHint']");
      if (coverHint) host.insertBefore(buttons, coverHint);
      else host.appendChild(buttons);
    } else {
      const fallback = document.createElement("div");
      fallback.className = "alexfun-sb-fallback";
      fallback.appendChild(buttons);
      document.body.appendChild(fallback);
    }

    buttons.querySelectorAll(".alexfun-sb-btn").forEach(btn => {
      btn.addEventListener("click", () => openSocialFrame(btn.dataset.target));
    });
    return buttons;
  }

  let shellEl = null;
  let backdropEl = null;

  function injectIframeShell() {
    backdropEl = document.createElement("div");
    backdropEl.className = "alexfun-sb-backdrop";
    backdropEl.addEventListener("click", closeSocialFrame);
    document.body.appendChild(backdropEl);

    shellEl = document.createElement("div");
    shellEl.id = "alexfunSocialFrame";
    shellEl.innerHTML = `
      <button type="button" class="alexfun-sb-close" aria-label="Close">×</button>
      <iframe title="alex.fun social" allow="clipboard-read; clipboard-write"></iframe>
    `;
    shellEl.querySelector(".alexfun-sb-close").addEventListener("click", closeSocialFrame);
    document.body.appendChild(shellEl);

    document.addEventListener("keydown", (e) => {
      if (e.key === "Escape" && shellEl.classList.contains("show")) closeSocialFrame();
    });
  }

  function openSocialFrame(target) {
    const frame = shellEl.querySelector("iframe");
    const url = new URL("index.html", location.href);
    url.searchParams.set("embed", target === "friends" ? "friends" : "messages");
    // Cache-bust the iframe URL so updates to index.html (especially its
    // embed-mode CSS) actually reach this nested document. Date.now() also
    // forces a fresh load each open so panel state never leaks between opens.
    url.searchParams.set("_t", String(Date.now()));
    frame.src = url.href;
    shellEl.classList.add("show");
    backdropEl.classList.add("show");
  }
  function closeSocialFrame() {
    shellEl.classList.remove("show");
    backdropEl.classList.remove("show");
    // Detach the iframe src so it isn't running in the background.
    const frame = shellEl.querySelector("iframe");
    setTimeout(() => { if (!shellEl.classList.contains("show")) frame.src = "about:blank"; }, 250);
  }

  ready(init);
})();
