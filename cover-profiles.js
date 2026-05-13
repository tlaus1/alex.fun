(function(){
  const profiles = [
    {
      title: "Clever | Portal",
      cover: "./cleverpage.png",
      icon: "./clever1.png",
      alt: "Clever portal cover"
    },
    {
      title: "Home - Google Drive",
      cover: "./cover-google-drive.png",
      icon: "https://upload.wikimedia.org/wikipedia/commons/thumb/1/12/Google_Drive_icon_%282020%29.svg/3840px-Google_Drive_icon_%282020%29.svg.png",
      alt: "Google Drive cover"
    },
    {
      title: "Clever | Log in with Clever",
      cover: "./cover-clever-login.png",
      icon: "./clever1.png",
      alt: "Clever login cover"
    },
    {
      title: "New Tab",
      cover: "./cover-new-tab.png",
      icon: "./new-tab-icon.svg",
      alt: "New Tab cover"
    },
    {
      title: "Castify V3 Extension Popup",
      cover: "./cover-screencastify.png",
      icon: "https://cdn.prod.website-files.com/639781d572293a44a8b20e90/639781d572293a4ad9b20f41_android-chrome-384x384.png",
      alt: "Screencastify sign in cover"
    }
  ];

  function chooseProfile(){
    const saved = sessionStorage.getItem("alexFunCoverProfile");
    const existing = profiles.find(profile => profile.title === saved);
    if(existing) return existing;
    const profile = profiles[Math.floor(Math.random() * profiles.length)];
    sessionStorage.setItem("alexFunCoverProfile", profile.title);
    return profile;
  }

  function setFavicon(profile){
    let icon = document.querySelector("link[rel~='icon']");
    if(!icon){
      icon = document.createElement("link");
      icon.rel = "icon";
      document.head.appendChild(icon);
    }
    icon.href = resolveSiteUrl(profile.icon);
  }

  function resolveSiteUrl(value){
    if(/^https?:\/\//i.test(value)) return value;
    return new URL(value, location.href).href;
  }

  function setCoverImages(profile){
    document.querySelectorAll("#idlePhoto img, #coverOverlay img, img[data-cover-image]").forEach(img => {
      img.src = resolveSiteUrl(profile.cover);
      img.alt = profile.alt;
    });
  }

  function applyProfile(profile){
    document.title = profile.title;
    setFavicon(profile);
    setCoverImages(profile);
  }

  const profile = chooseProfile();
  window.alexFunCoverProfile = profile;
  applyProfile(profile);

  if(document.readyState === "loading"){
    document.addEventListener("DOMContentLoaded", () => applyProfile(profile));
  }else{
    applyProfile(profile);
  }
})();
