/* social-bar.js v4 — navigates back to the dashboard with the right panel
   already open. No iframe, no slim copy — the user lands on index.html and
   the real Friends/Messages panel is open immediately. */
(function () {
  try { console.log("[alex.fun] social-bar v4 (navigate) loaded"); } catch (_) {}

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
    if (!getActiveUser()) return;
    injectStyles();
    const buttons = injectButtons();
    if (!buttons) return;

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

  function injectStyles() {
    const css = `
      .alexfun-sb-btns {
        display: inline-flex; gap: 6px; align-items: center;
        font-family: Inter, ui-sans-serif, system-ui, sans-serif;
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
      .alexfun-sb-fallback {
        position: fixed; bottom: 0; left: 0; right: 0;
        height: 26px; padding: 0 14px;
        display: flex; align-items: center; justify-content: flex-end; gap: 8px;
        background: rgba(10,15,25,.85); backdrop-filter: blur(10px);
        border-top: 1px solid rgba(255,255,255,.08);
        z-index: 9100;
        font-family: Inter, ui-sans-serif, system-ui, sans-serif;
        color: #fff;
      }
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
      btn.addEventListener("click", () => {
        const target = btn.dataset.target;
        const url = new URL("index.html", location.href);
        url.hash = "#" + target;
        location.href = url.href;
      });
    });
    return buttons;
  }

  ready(init);
})();
