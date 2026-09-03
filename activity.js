(() => {
  "use strict";

  const app = window.Outabout;
  if (!app) throw new Error("Outabout runtime fehlt.");

  const modes = Object.freeze({
    wandern: {
      label: "Wandern",
      icon: "🥾",
      profile: "hiking-mountain",
      profileParams: {
        "profile:SAC_scale_limit": 3,
        "profile:SAC_scale_preferred": 1,
      },
      overlay: "hiking",
      wayLabel: "Wanderwege",
    },
    alpin: {
      label: "Alpin",
      icon: "⛰️",
      profile: "hiking-mountain",
      profileParams: {
        "profile:SAC_scale_limit": 6,
        "profile:SAC_scale_preferred": 3,
      },
      overlay: "hiking",
      wayLabel: "Alpine Wege",
    },
    rennrad: {
      label: "Rennrad",
      icon: "🚴",
      profile: "fastbike",
      profileParams: {},
      overlay: "cycling",
      wayLabel: "Radrouten",
    },
    gravel: {
      label: "Gravel",
      icon: "🚲",
      profile: "gravel",
      profileParams: {},
      overlay: "cycling",
      wayLabel: "Gravel-/Radrouten",
    },
    mtb: {
      label: "Mountainbike",
      icon: "🚵",
      profile: "mtb",
      profileParams: {},
      overlay: "mtb",
      wayLabel: "MTB-Routen",
    },
    spazieren: {
      label: "Spazieren",
      icon: "🚶",
      profile: "hiking-mountain",
      profileParams: {
        "profile:SAC_scale_limit": 1,
        "profile:SAC_scale_preferred": 1,
        "profile:allow_steps": 0,
      },
      overlay: "hiking",
      wayLabel: "Spazierwege",
    },
  });

  const toggle = app.el("routeModeToggle");
  const menu = app.el("routeModeMenu");

  function getConfig() {
    return modes[app.state.activity] || modes.wandern;
  }

  function render() {
    const config = getConfig();
    if (toggle) toggle.textContent = `${config.icon} ${config.label} ▾`;
    document.querySelectorAll('input[name="routeMode"]').forEach((input) => {
      input.checked = input.value === app.state.activity;
    });
    const wayLabel = app.el("routesLabel");
    if (wayLabel) wayLabel.textContent = config.wayLabel;
  }

  function setMode(key, { silent = false } = {}) {
    if (!modes[key]) return false;
    const changed = app.state.activity !== key;
    app.state.activity = key;
    render();
    if (changed && !silent)
      app.emit("activity:change", { key, config: modes[key] });
    if (!silent) app.setStatus(`${modes[key].label} aktiv.`);
    return true;
  }

  app.activity = {
    modes,
    get key() {
      return app.state.activity;
    },
    get config() {
      return getConfig();
    },
    set: setMode,
  };

  toggle?.addEventListener("click", (event) => {
    event.preventDefault();
    event.stopPropagation();
    const open = !menu?.classList.contains("open");
    app.el("filterMenu")?.classList.remove("open");
    app.el("filterToggle")?.setAttribute("aria-expanded", "false");
    menu?.classList.toggle("open", open);
    toggle.setAttribute("aria-expanded", String(open));
  });

  menu?.addEventListener("click", (event) => event.stopPropagation());
  menu?.addEventListener("change", (event) => {
    if (event.target?.name !== "routeMode") return;
    setMode(event.target.value);
    menu.classList.remove("open");
    toggle?.setAttribute("aria-expanded", "false");
  });

  render();
})();
