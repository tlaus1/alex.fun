/* social-bar.js
   Injects a floating "Friends / Messages" bar on every game page so the user
   doesn't have to bounce back to the dashboard just to check a DM.

   Clicking either button navigates to index.html with a hash (#friends or
   #messages); the dashboard reads that hash on load and auto-opens the
   matching panel.

   Loaded as `<script defer src="./social-bar.js">` on every game page.
   Skips itself when run on index.html (the dashboard has its own controls).
*/
(function () {
  // Skip on the dashboard — it has its own bar.
  const path = location.pathname.split("/").pop() || "";
  if (path === "" || path === "index.html") return;

  function ready(fn) {
    if (document.readyState === "loading") {
      document.addEventListener("DOMContentLoaded", fn, { once: true });
    } else fn();
  }

  const ACTIVE_USER_KEY = "alexFunActiveUserV1";
  const SOCIAL_KEY_BASE = "alexFunSocialV1";

  function getActiveUser() { return localStorage.getItem(ACTIVE_USER_KEY) || ""; }
  function normalize(u) { return (u || "").trim().toLowerCase().replace(/[^a-z0-9_-]/g, ""); }
  function socialKey() {
    // Mirror index.html's profileKey scheme: <base>__<normalized-username>
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
    // Don't show the bar for unsigned-in users — clicking it would land them
    // on the auth overlay anyway.
    if (!getActiveUser()) return;

    const style = document.createElement("style");
    style.textContent = `
      #alexFunSocialBar {
        position: fixed; bottom: calc(var(--status-h, 26px) + 10px); left: 12px;
        z-index: 9050;
        display: flex; gap: 8px;
        font-family: Inter, ui-sans-serif, system-ui, sans-serif;
        pointer-events: none;
      }
      #alexFunSocialBar .sb-btn {
        pointer-events: auto;
        appearance: none;
        border: 1px solid rgba(255,255,255,.18);
        background: rgba(10,15,25,.85);
        color: #fff;
        backdrop-filter: blur(12px);
        padding: 8px 14px;
        border-radius: 999px;
        font: inherit; font-size: 12px; font-weight: 900;
        letter-spacing: .3px; text-transform: uppercase;
        cursor: pointer;
        box-shadow: 0 8px 22px rgba(0,0,0,.45);
        display: inline-flex; align-items: center; gap: 6px;
        position: relative;
        transition: transform .15s cubic-bezier(.34,1.56,.64,1), background .15s, border-color .15s;
      }
      #alexFunSocialBar .sb-btn:hover {
        background: rgba(40,20,0,.95);
        border-color: rgba(255,107,61,.55);
        transform: translateY(-1px);
      }
      #alexFunSocialBar .sb-badge {
        min-width: 18px; height: 18px; padding: 0 5px;
        border-radius: 999px;
        background: linear-gradient(135deg, #ef4444, #dc2626);
        color: #fff; font-size: 10.5px; font-weight: 900;
        display: inline-flex; align-items: center; justify-content: center;
        box-shadow: 0 2px 6px rgba(239,68,68,.45);
        animation: sbBadgePop .35s cubic-bezier(.34,1.56,.64,1);
      }
      @keyframes sbBadgePop {
        from { transform: scale(0); }
        60%  { transform: scale(1.2); }
        to   { transform: scale(1); }
      }
    `;
    document.head.appendChild(style);

    const bar = document.createElement("div");
    bar.id = "alexFunSocialBar";
    bar.innerHTML = `
      <button class="sb-btn" data-target="friends" type="button" aria-label="Open friends panel">
        👤 Friends <span class="sb-badge" data-badge="friends" hidden></span>
      </button>
      <button class="sb-btn" data-target="messages" type="button" aria-label="Open messages panel">
        ✉ Messages <span class="sb-badge" data-badge="messages" hidden></span>
      </button>
    `;
    document.body.appendChild(bar);

    function updateBadges() {
      const fc = friendRequestCount();
      const mc = unreadDmCount();
      const fb = bar.querySelector('[data-badge="friends"]');
      const mb = bar.querySelector('[data-badge="messages"]');
      if (fc > 0) { fb.textContent = fc > 9 ? "9+" : String(fc); fb.hidden = false; }
      else        { fb.hidden = true; }
      if (mc > 0) { mb.textContent = mc > 9 ? "9+" : String(mc); mb.hidden = false; }
      else        { mb.hidden = true; }
    }

    bar.querySelectorAll(".sb-btn").forEach(btn => {
      btn.addEventListener("click", () => {
        const target = btn.dataset.target;
        const url = new URL("index.html", location.href);
        url.hash = "#" + target;
        location.href = url.href;
      });
    });

    updateBadges();
    // Re-check periodically so badges stay live without a refresh.
    setInterval(updateBadges, 5000);
    // Fires when another tab writes to localStorage.
    window.addEventListener("storage", updateBadges);
  }

  ready(init);
})();
