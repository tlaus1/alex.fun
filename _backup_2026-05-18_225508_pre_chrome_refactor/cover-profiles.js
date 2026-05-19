(function(){
  const profiles = [
    {
      key: "clever-portal",
      title: "Clever | Portal",
      cover: "./cleverpage.png",
      icon: "./clever1.png",
      alt: "Clever portal cover"
    },
    {
      key: "google-drive",
      title: "Home - Google Drive",
      cover: "./cover-google-drive.png",
      icon: "https://upload.wikimedia.org/wikipedia/commons/thumb/1/12/Google_Drive_icon_%282020%29.svg/3840px-Google_Drive_icon_%282020%29.svg.png",
      alt: "Google Drive cover"
    },
    {
      key: "clever-login",
      title: "Clever | Log in with Clever",
      cover: "./cover-clever-login.png",
      icon: "./clever1.png",
      alt: "Clever login cover"
    },
    {
      key: "new-tab",
      title: "New Tab",
      cover: "./cover-new-tab.png",
      icon: "./new-tab-icon.svg",
      alt: "New Tab cover"
    },
    {
      key: "screencastify",
      title: "Castify V3 Extension Popup",
      cover: "./cover-screencastify.png",
      icon: "https://cdn.prod.website-files.com/639781d572293a44a8b20e90/639781d572293a4ad9b20f41_android-chrome-384x384.png",
      alt: "Screencastify sign in cover"
    },
    {
      key: "desmos",
      title: "Desmos | Graphing Calculator",
      cover: "./cover-desmos.png",
      icon: "./icon-desmos.png",
      alt: "Desmos graphing calculator"
    },
    {
      key: "sora",
      title: "Sora - Where Students Read - Sign in",
      cover: "./cover-sora.png",
      icon: "./icon-sora.png",
      alt: "Sora student reading app"
    }
  ];

  // Expose profiles list for settings UI
  window.alexFunProfiles = profiles;

  function chooseProfile(){
    // 1. Persistent user preference (localStorage)
    const pinned = localStorage.getItem("alexFunCoverProfileKey");
    if(pinned){
      const found = profiles.find(p => p.key === pinned);
      if(found) return found;
    }
    // 2. Session-level random pick
    const saved = sessionStorage.getItem("alexFunCoverProfile");
    const existing = profiles.find(p => p.title === saved);
    if(existing) return existing;
    const profile = profiles[Math.floor(Math.random() * profiles.length)];
    sessionStorage.setItem("alexFunCoverProfile", profile.title);
    return profile;
  }

  function setFavicon(profile){
    // Remove every existing icon link first — Chrome picks the LAST one it sees,
    // and a stale <link rel="icon"> from the HTML head can override our update.
    document.querySelectorAll("link[rel~='icon']").forEach(el => el.remove());
    const href = resolveSiteUrl(profile.icon);
    const link = document.createElement("link");
    link.rel  = "icon";
    // Declaring the MIME type explicitly so browsers don't reject SVGs.
    if(/\.svg($|\?)/i.test(href))      link.type = "image/svg+xml";
    else if(/\.png($|\?)/i.test(href)) link.type = "image/png";
    // Cache-bust so a swapped icon shows up immediately instead of the
    // browser keeping the previous favicon pinned.
    link.href = href + (href.includes("?") ? "&" : "?") + "v=" + Date.now();
    document.head.appendChild(link);
  }

  function resolveSiteUrl(value){
    if(/^https?:\/\//i.test(value)) return value;
    return new URL(value, location.href).href;
  }

  function setCoverImages(profile){
    const coverUrl = resolveSiteUrl(profile.cover);
    document.documentElement.style.setProperty("--alex-cover-image", `url("${coverUrl.replace(/["\\\n\r\f]/g, "")}")`);
    document.querySelectorAll("#idlePhoto img, #coverOverlay img, img[data-cover-image]").forEach(img => {
      img.src = coverUrl;
      img.alt = profile.alt;
      const frame = img.closest("#idlePhoto, #coverOverlay");
      if(frame) frame.style.backgroundImage = "";
    });
  }

  function applyProfile(profile){
    document.title = profile.title;
    setFavicon(profile);
    setCoverImages(profile);
  }

  // Public: switch profile and persist
  window.alexFunSetProfile = function(key){
    const profile = profiles.find(p => p.key === key);
    if(!profile) return;
    if(key === "random"){
      localStorage.removeItem("alexFunCoverProfileKey");
      sessionStorage.removeItem("alexFunCoverProfile");
    } else {
      localStorage.setItem("alexFunCoverProfileKey", key);
      sessionStorage.setItem("alexFunCoverProfile", profile.title);
    }
    applyProfile(profile);
    window.alexFunCoverProfile = profile;
  };

  const profile = chooseProfile();
  window.alexFunCoverProfile = profile;
  applyProfile(profile);

  if(document.readyState === "loading"){
    document.addEventListener("DOMContentLoaded", () => applyProfile(profile));
  }else{
    applyProfile(profile);
  }
})();
