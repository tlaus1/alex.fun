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
      icon: "data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='64' height='64' viewBox='0 0 64 64'%3E%3Ccircle cx='32' cy='32' r='30' fill='%2323292f'/%3E%3C/svg%3E",
      alt: "New Tab cover"
    },
    {
      title: "Screencastify - Sign In",
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
    icon.href = profile.icon;
  }

  function setCoverImages(profile){
    document.querySelectorAll("#idlePhoto img, #coverOverlay img, img[data-cover-image]").forEach(img => {
      img.src = profile.cover;
      img.alt = profile.alt;
    });
  }

  const profile = chooseProfile();
  window.alexFunCoverProfile = profile;
  document.title = profile.title;
  setFavicon(profile);

  if(document.readyState === "loading"){
    document.addEventListener("DOMContentLoaded", () => setCoverImages(profile));
  }else{
    setCoverImages(profile);
  }
})();
