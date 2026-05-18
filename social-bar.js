/* social-bar.js — bottom-bar Friends / Messages on every game page.
   - Injects compact pill buttons into the page's existing bottom status bar
     (or into a fallback bar if the page has none).
   - Clicking either button opens a self-contained panel ABOVE the bar; no
     navigation away from the game.
   - The panel can read friends, groups, threads and send DMs / group messages
     directly via the existing Supabase RPCs, mirroring the dashboard UX.
*/
(function () {
  // Don't run on the dashboard — it has its own controls.
  const path = location.pathname.split("/").pop() || "";
  if (path === "" || path === "index.html") return;

  function ready(fn) {
    if (document.readyState === "loading") {
      document.addEventListener("DOMContentLoaded", fn, { once: true });
    } else fn();
  }

  const ACTIVE_USER_KEY  = "alexFunActiveUserV1";
  const SOCIAL_KEY_BASE  = "alexFunSocialV1";
  const SESSION_TOKEN_KEY = "alexFunSessionTokenV1";

  function getActiveUser() { return localStorage.getItem(ACTIVE_USER_KEY) || ""; }
  function getSessionToken() { return localStorage.getItem(SESSION_TOKEN_KEY) || ""; }
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
  function escapeHtml(s){
    return String(s ?? "").replace(/[&<>"']/g, c => ({"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#39;"}[c]));
  }

  // ── Lazy supabase client (uses the loaded supabase-config.js globals) ──
  let supabase = null;
  function getSupabase(){
    if (supabase) return supabase;
    if (window.supabase && window.ALEX_FUN_SUPABASE_URL && window.ALEX_FUN_SUPABASE_PUBLISHABLE_KEY) {
      supabase = window.supabase.createClient(
        window.ALEX_FUN_SUPABASE_URL,
        window.ALEX_FUN_SUPABASE_PUBLISHABLE_KEY,
      );
    }
    return supabase;
  }

  function init() {
    if (!getActiveUser()) return;

    injectStyles();
    injectButtons();
    injectPanel();
  }

  function injectStyles(){
    const css = `
      .alexfun-sb-btns {
        display: inline-flex; gap: 6px; align-items: center;
        font-family: Inter, ui-sans-serif, system-ui, sans-serif;
      }
      .alexfun-sb-btn {
        appearance: none; border: 1px solid rgba(255,255,255,.18);
        background: rgba(255,255,255,.06); color: inherit;
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
      /* Fallback bottom bar when the page has no status bar to inject into. */
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

      /* ── In-place panel ─────────────────────────────────────────── */
      #alexfunSocialPanel {
        position: fixed;
        left: 12px; right: auto; bottom: calc(var(--status-h, 26px) + 10px);
        width: min(380px, calc(100vw - 24px));
        height: min(540px, calc(100vh - var(--status-h, 26px) - 24px));
        z-index: 10030;
        background: #14181f; color: #ececec;
        border: 1.5px solid rgba(255,255,255,.12);
        border-radius: 16px; padding: 12px;
        box-shadow: 0 24px 60px rgba(0,0,0,.55);
        transform: translateY(14px) scale(.98); opacity: 0; pointer-events: none;
        transition: transform .22s cubic-bezier(.4,0,.2,1), opacity .22s;
        display: flex; flex-direction: column; overflow: hidden;
        font-family: Inter, ui-sans-serif, system-ui, sans-serif;
      }
      #alexfunSocialPanel.show { transform: translateY(0) scale(1); opacity: 1; pointer-events: auto; }
      #alexfunSocialPanel * { box-sizing: border-box; }
      .afsp-head {
        flex-shrink: 0; display: flex; align-items: center; gap: 8px;
        margin: -4px -4px 8px; padding: 4px 4px 8px;
        border-bottom: 1px solid rgba(255,255,255,.06);
      }
      .afsp-head h3 { margin: 0; font-size: 14px; font-weight: 900; flex: 1; }
      .afsp-close {
        appearance: none; border: 1px solid rgba(255,255,255,.18);
        background: transparent; color: #ececec;
        width: 24px; height: 24px; padding: 0; border-radius: 999px;
        font: inherit; font-size: 13px; font-weight: 900; cursor: pointer;
      }
      .afsp-back {
        appearance: none; border: 1px solid rgba(255,255,255,.18);
        background: transparent; color: #ececec;
        padding: 3px 9px; border-radius: 999px;
        font: inherit; font-size: 10.5px; font-weight: 900; cursor: pointer;
        display: none;
      }
      .afsp-back.show { display: inline-flex; }
      .afsp-list {
        flex: 1; overflow-y: auto; min-height: 0;
        display: grid; gap: 6px;
      }
      .afsp-row {
        display: flex; align-items: center; gap: 8px;
        padding: 8px 10px; border-radius: 10px;
        background: rgba(255,255,255,.04); cursor: pointer;
        border: 1px solid rgba(255,255,255,.04);
        transition: background .12s, border-color .12s;
      }
      .afsp-row:hover { background: rgba(255,107,61,.10); border-color: rgba(255,107,61,.3); }
      .afsp-row strong { font-size: 13px; flex: 1; min-width: 0; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
      .afsp-row.has-unread { background: linear-gradient(90deg, rgba(239,68,68,.10), rgba(239,68,68,0) 70%); border-color: rgba(239,68,68,.32); }
      .afsp-row.is-group { background: linear-gradient(90deg, rgba(124,58,237,.12), transparent 70%); border-color: rgba(124,58,237,.32); }
      .afsp-unread {
        margin-left: auto;
        min-width: 18px; height: 18px; padding: 0 5px;
        border-radius: 999px;
        background: linear-gradient(135deg, #ef4444, #dc2626);
        color: #fff; font-size: 10px; font-weight: 900;
        display: inline-flex; align-items: center; justify-content: center;
      }

      .afsp-thread {
        flex: 1; min-height: 0; overflow-y: auto;
        display: flex; flex-direction: column; gap: 4px;
        padding-right: 4px;
      }
      .afsp-thread-head { font-size: 12.5px; font-weight: 900; margin-bottom: 6px; }
      .afsp-thread-head .members { display: block; font-size: 10.5px; font-weight: 700; color: rgba(255,255,255,.55); margin-top: 2px; }
      .afsp-bubble {
        max-width: 80%; padding: 6px 10px; border-radius: 12px;
        font-size: 12px; font-weight: 700; line-height: 1.3;
        word-break: break-word;
      }
      .afsp-bubble.mine   { align-self: flex-end;   background: linear-gradient(135deg, #ff6b3d, #ff9a3d); color: #fff; }
      .afsp-bubble.theirs { align-self: flex-start; background: rgba(255,255,255,.08); color: #ececec; }
      .afsp-bubble .sender { display: block; font-size: 9.5px; font-weight: 900; opacity: .8; margin-bottom: 1px; text-transform: uppercase; letter-spacing: .3px; }
      .afsp-empty { text-align: center; color: rgba(255,255,255,.5); font-size: 12px; font-weight: 700; padding: 14px 8px; }
      .afsp-input-row { flex-shrink: 0; display: flex; gap: 6px; margin-top: 8px; }
      .afsp-input {
        flex: 1; resize: none;
        background: #060a14; color: #fff;
        border: 1px solid rgba(255,255,255,.14);
        border-radius: 10px;
        padding: 8px 10px; font: inherit; font-size: 12px;
        min-height: 38px; max-height: 80px;
      }
      .afsp-input:focus { outline: none; border-color: #ff6b3d; box-shadow: 0 0 0 3px rgba(255,107,61,.18); }
      .afsp-send {
        appearance: none; border: 0; border-radius: 10px;
        padding: 0 14px;
        background: linear-gradient(135deg, #ff6b3d, #ff9a3d); color: #fff;
        font: inherit; font-size: 11px; font-weight: 900; cursor: pointer;
        flex-shrink: 0;
      }
    `;
    const style = document.createElement("style");
    style.textContent = css;
    document.head.appendChild(style);
  }

  function injectButtons(){
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

    // Try to plug into the page's status bar. Most games use #alexStatusBar
    // or #statusBar; if neither exists, fall back to a minimal floating bar.
    let host = document.getElementById("alexStatusBar") || document.getElementById("statusBar");
    if (host) {
      // Drop the buttons in front of the cover-image hint if present, so the
      // typical layout becomes:  [Game name | Friends · Messages | Backspace]
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
      btn.addEventListener("click", () => openSocialPanel(btn.dataset.target));
    });

    function updateBadges(){
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
    window.__alexfunSbUpdateBadges = updateBadges;
  }

  // ── In-place panel ──────────────────────────────────────────────────
  let panelEl = null;
  let selectedFriend = "";
  let selectedGroup  = "";
  let myGroups = [];
  let groupThreadMsgs = [];

  function injectPanel(){
    panelEl = document.createElement("div");
    panelEl.id = "alexfunSocialPanel";
    panelEl.setAttribute("aria-hidden", "true");
    panelEl.innerHTML = `
      <div class="afsp-head">
        <button class="afsp-back" type="button" aria-label="Back to list">← Back</button>
        <h3 class="afsp-title">Messages</h3>
        <button class="afsp-close" type="button" aria-label="Close">×</button>
      </div>
      <div class="afsp-body">
        <div class="afsp-list" hidden></div>
        <div class="afsp-thread" hidden></div>
        <div class="afsp-input-row" hidden>
          <textarea class="afsp-input" rows="1" placeholder="Write a message"></textarea>
          <button class="afsp-send" type="button">Send</button>
        </div>
      </div>
    `;
    panelEl.style.display = "flex"; // override flex so the inner layout works
    document.body.appendChild(panelEl);

    panelEl.querySelector(".afsp-close").addEventListener("click", closeSocialPanel);
    panelEl.querySelector(".afsp-back").addEventListener("click", () => {
      selectedFriend = ""; selectedGroup = "";
      renderListView();
    });
    panelEl.querySelector(".afsp-send").addEventListener("click", sendCurrentMessage);
    panelEl.querySelector(".afsp-input").addEventListener("keydown", e => {
      if (e.key === "Enter" && !e.shiftKey && !e.ctrlKey && !e.metaKey && !e.altKey) {
        e.preventDefault();
        sendCurrentMessage();
      }
    });
  }

  async function openSocialPanel(target){
    panelEl.classList.add("show");
    panelEl.setAttribute("aria-hidden", "false");
    selectedFriend = ""; selectedGroup = "";
    renderListView("Loading…");
    await refreshSocialState();
    renderListView();
  }
  function closeSocialPanel(){
    panelEl.classList.remove("show");
    panelEl.setAttribute("aria-hidden", "true");
  }

  async function refreshSocialState(){
    const sb = getSupabase();
    const token = getSessionToken();
    if (!sb || !token) return;
    try {
      const [s, g] = await Promise.all([
        sb.rpc("list_social_state", { p_token: token }),
        sb.rpc("list_my_groups",    { p_token: token }),
      ]);
      if (s && !s.error && s.data) {
        try { localStorage.setItem(socialKey(), JSON.stringify(s.data)); } catch(_) {}
      }
      myGroups = (g && !g.error && Array.isArray(g.data))
        ? g.data.map(row => ({
            id: row.group_id,
            name: row.name || "Group",
            members: Array.isArray(row.members) ? row.members : [],
            last_message_at: row.last_message_at,
            unread_count: Number(row.unread_count) || 0,
          }))
        : myGroups;
    } catch(_) { /* keep last cache */ }
    if (typeof window.__alexfunSbUpdateBadges === "function") window.__alexfunSbUpdateBadges();
  }

  function buildMergedSocialEntries(){
    const s = loadSocial();
    const friends = Array.isArray(s.friends) ? s.friends : [];
    const messages = (s.messages && !Array.isArray(s.messages)) ? s.messages : {};
    function lastAt(arr){
      let n = 0;
      for (const m of arr || []) {
        const t = Date.parse(m && m.created_at) || 0;
        if (t > n) n = t;
      }
      return n;
    }
    function unread(arr){
      let n = 0;
      for (const m of arr || []) if (m && !m.mine && !m.read_at && !isBroadcast(m)) n++;
      return n;
    }
    const entries = [];
    friends.forEach(name => {
      const t = (messages[name] || []);
      entries.push({
        kind: "friend",
        id: name,
        label: name,
        unread: unread(t),
        lastAt: lastAt(t),
        members: null,
      });
    });
    (myGroups || []).forEach(g => {
      entries.push({
        kind: "group",
        id: g.id,
        label: g.name,
        unread: g.unread_count || 0,
        lastAt: g.last_message_at ? Date.parse(g.last_message_at) : 0,
        members: g.members || [],
      });
    });
    entries.sort((a, b) => {
      if ((a.unread > 0) !== (b.unread > 0)) return a.unread > 0 ? -1 : 1;
      if (b.lastAt !== a.lastAt) return b.lastAt - a.lastAt;
      return a.label.localeCompare(b.label);
    });
    return entries;
  }

  function renderListView(loadingText){
    panelEl.querySelector(".afsp-back").classList.remove("show");
    panelEl.querySelector(".afsp-title").textContent = "Messages";
    const listEl = panelEl.querySelector(".afsp-list");
    const threadEl = panelEl.querySelector(".afsp-thread");
    const inputRow = panelEl.querySelector(".afsp-input-row");
    threadEl.hidden = true;
    inputRow.hidden = true;
    listEl.hidden = false;

    if (loadingText) {
      listEl.innerHTML = `<div class="afsp-empty">${escapeHtml(loadingText)}</div>`;
      return;
    }
    const entries = buildMergedSocialEntries();
    if (!entries.length) {
      listEl.innerHTML = `<div class="afsp-empty">Add friends or create a group chat on the dashboard.</div>`;
      return;
    }
    listEl.innerHTML = entries.map(e => {
      const badge = e.unread > 0 ? `<span class="afsp-unread">${e.unread > 9 ? "9+" : e.unread}</span>` : "";
      const cls = (e.kind === "group" ? "is-group" : "") + (e.unread > 0 ? " has-unread" : "");
      const dataAttr = e.kind === "group" ? `data-group="${escapeHtml(e.id)}"` : `data-friend="${escapeHtml(e.id)}"`;
      const icon = e.kind === "group" ? "👥 " : "";
      return `<div class="afsp-row ${cls}" ${dataAttr}>
        <strong>${icon}${escapeHtml(e.label)}</strong>${badge}
      </div>`;
    }).join("");
    listEl.querySelectorAll(".afsp-row").forEach(row => {
      row.addEventListener("click", () => {
        if (row.dataset.group) { selectedGroup = row.dataset.group; selectedFriend = ""; openGroupThread(); }
        else                   { selectedFriend = row.dataset.friend; selectedGroup = ""; openFriendThread(); }
      });
    });
  }

  function openFriendThread(){
    panelEl.querySelector(".afsp-back").classList.add("show");
    panelEl.querySelector(".afsp-title").textContent = selectedFriend;
    const listEl   = panelEl.querySelector(".afsp-list");
    const threadEl = panelEl.querySelector(".afsp-thread");
    const inputRow = panelEl.querySelector(".afsp-input-row");
    listEl.hidden = true;
    threadEl.hidden = false;
    inputRow.hidden = false;

    // Optimistically clear local unread badges.
    const s = loadSocial();
    const t = (s.messages && s.messages[selectedFriend]) || [];
    const nowIso = new Date().toISOString();
    let touched = false;
    t.forEach(m => { if (m && !m.mine && !m.read_at) { m.read_at = nowIso; touched = true; } });
    if (touched) {
      try { localStorage.setItem(socialKey(), JSON.stringify(s)); } catch(_) {}
      if (typeof window.__alexfunSbUpdateBadges === "function") window.__alexfunSbUpdateBadges();
    }
    const sb = getSupabase(); const tok = getSessionToken();
    if (sb && tok) {
      sb.rpc("mark_messages_read", { p_token: tok, p_other_username: selectedFriend }).catch(()=>{});
    }

    renderFriendThread(t);
  }
  function renderFriendThread(thread){
    const threadEl = panelEl.querySelector(".afsp-thread");
    if (!thread.length) {
      threadEl.innerHTML = `<div class="afsp-empty">No messages yet — say hi.</div>`;
      return;
    }
    const CAP = 150;
    const slice = thread.length > CAP ? thread.slice(-CAP) : thread;
    threadEl.innerHTML = slice.map(m => {
      const body = typeof m === "string" ? m : (m.body || "");
      const mine = !!(m && m.mine);
      return `<div class="afsp-bubble ${mine ? "mine" : "theirs"}">${escapeHtml(body)}</div>`;
    }).join("");
    threadEl.scrollTop = threadEl.scrollHeight;
  }

  async function openGroupThread(){
    const g = (myGroups || []).find(x => x.id === selectedGroup);
    panelEl.querySelector(".afsp-back").classList.add("show");
    panelEl.querySelector(".afsp-title").innerHTML = g
      ? `👥 ${escapeHtml(g.name)}<span class="members" style="display:block;font-size:10.5px;font-weight:700;color:rgba(255,255,255,.55);margin-top:2px;">${escapeHtml((g.members || []).join(", "))}</span>`
      : "Group";
    const listEl   = panelEl.querySelector(".afsp-list");
    const threadEl = panelEl.querySelector(".afsp-thread");
    const inputRow = panelEl.querySelector(".afsp-input-row");
    listEl.hidden = true; threadEl.hidden = false; inputRow.hidden = false;

    threadEl.innerHTML = `<div class="afsp-empty">Loading…</div>`;
    if (g) g.unread_count = 0;
    if (typeof window.__alexfunSbUpdateBadges === "function") window.__alexfunSbUpdateBadges();

    const sb = getSupabase(); const tok = getSessionToken();
    if (!sb || !tok) { threadEl.innerHTML = `<div class="afsp-empty">Not connected.</div>`; return; }
    sb.rpc("mark_group_read", { p_token: tok, p_group_id: selectedGroup }).catch(()=>{});
    try {
      const { data, error } = await sb.rpc("list_group_messages", { p_token: tok, p_group_id: selectedGroup });
      if (error) throw error;
      groupThreadMsgs = (data || []).map(m => ({ sender: m.sender, body: m.body, created_at: m.created_at }));
      renderGroupThread();
    } catch (e) {
      threadEl.innerHTML = `<div class="afsp-empty">Could not load thread.</div>`;
    }
  }
  function renderGroupThread(){
    const threadEl = panelEl.querySelector(".afsp-thread");
    if (!groupThreadMsgs.length) {
      threadEl.innerHTML = `<div class="afsp-empty">No messages yet.</div>`;
      return;
    }
    const me = (getActiveUser() || "").toLowerCase();
    threadEl.innerHTML = groupThreadMsgs.map(m => {
      const mine = (m.sender || "").toLowerCase() === me;
      return `<div class="afsp-bubble ${mine ? "mine" : "theirs"}">`
           + `<span class="sender">${escapeHtml(mine ? "You" : m.sender)}</span>`
           + escapeHtml(m.body || "")
           + `</div>`;
    }).join("");
    threadEl.scrollTop = threadEl.scrollHeight;
  }

  async function sendCurrentMessage(){
    const input = panelEl.querySelector(".afsp-input");
    const text  = input.value.trim();
    if (!text) return;
    const sb = getSupabase(); const tok = getSessionToken();
    if (!sb || !tok) { alert("Not connected."); return; }
    input.disabled = true;
    try {
      if (selectedGroup) {
        const { error } = await sb.rpc("send_group_message", {
          p_token: tok, p_group_id: selectedGroup, p_body: text,
        });
        if (error) throw error;
        input.value = "";
        // Re-fetch the group thread.
        const { data } = await sb.rpc("list_group_messages", { p_token: tok, p_group_id: selectedGroup });
        groupThreadMsgs = (data || []).map(m => ({ sender: m.sender, body: m.body, created_at: m.created_at }));
        renderGroupThread();
      } else if (selectedFriend) {
        const { error } = await sb.rpc("send_direct_message", {
          p_token: tok, p_recipient_username: selectedFriend, p_body: text,
        });
        if (error) throw error;
        input.value = "";
        // Optimistically append to local thread + refetch state.
        const s = loadSocial();
        s.messages = s.messages || {};
        s.messages[selectedFriend] = s.messages[selectedFriend] || [];
        s.messages[selectedFriend].push({ body: text, mine: true, created_at: new Date().toISOString() });
        try { localStorage.setItem(socialKey(), JSON.stringify(s)); } catch(_) {}
        renderFriendThread(s.messages[selectedFriend]);
        refreshSocialState();
      }
    } catch (e) {
      alert((e && e.message) || "Send failed.");
    } finally {
      input.disabled = false;
      input.focus();
    }
  }

  ready(init);
})();
