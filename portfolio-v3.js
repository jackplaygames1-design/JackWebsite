(function initReconciledPortfolio() {
  const stageOrder = ["final", "alternate-final", "video", "turntable", "texture-lookdev", "process", "wip"];
  const stageLabels = {
    final: "Final",
    "alternate-final": "Alternate final",
    video: "Video",
    turntable: "Turntable",
    "texture-lookdev": "Texture / lookdev",
    process: "Process",
    wip: "WIP",
  };
  const videoPattern = /\.(mp4|webm)$/i;
  const allGrid = document.getElementById("portfolioAllGrid");
  const selectedGrid = document.getElementById("portfolioSelectedGrid");
  const wipGrid = document.getElementById("portfolioWipGridV3");
  const creditGrid = document.getElementById("portfolioCreditGridV3");
  const workspace = document.getElementById("portfolioLauncherV3");
  const content = document.getElementById("portfolioContentV3");
  const tabs = Array.from(document.querySelectorAll("[data-portfolio-v3-view]"));
  const panels = Array.from(document.querySelectorAll("[data-portfolio-v3-panel]"));
  const dialog = document.getElementById("portfolioLightboxV3");
  const image = document.getElementById("portfolioLightboxImageV3");
  const video = document.getElementById("portfolioLightboxVideoV3");
  const title = document.getElementById("portfolioLightboxTitleV3");
  const meta = document.getElementById("portfolioLightboxMetaV3");
  const details = document.getElementById("portfolioLightboxCaptionV3");
  const credit = document.getElementById("portfolioLightboxCreditV3");
  const counter = document.getElementById("portfolioLightboxCounterV3");
  const stageFilters = document.getElementById("portfolioLightboxStageFiltersV3");
  const thumbs = document.getElementById("portfolioLightboxThumbsV3");
  const previous = document.getElementById("portfolioLightboxPrevV3");
  const next = document.getElementById("portfolioLightboxNextV3");
  const close = document.getElementById("portfolioLightboxCloseV3");
  const projectLink = document.getElementById("portfolioProjectLinkV3");

  if (!allGrid || !selectedGrid || !wipGrid || !creditGrid || !workspace || !dialog) {
    return;
  }

  const state = {
    projects: [],
    activeProject: 0,
    visibleMedia: [],
    activeMedia: 0,
    activeStage: "all",
    lastTrigger: null,
    pointerStartX: null,
  };

  function normalizeStage(value, section) {
    const normalized = String(value || "").trim().toLowerCase();
    if (["finished", "hero", "render", "rendered"].includes(normalized)) return "final";
    if (["bts", "viewport", "wireframe", "clay", "breakdown"].includes(normalized)) return "process";
    if (stageOrder.includes(normalized)) return normalized;
    return section === "wips" ? "wip" : "final";
  }

  function normalizeMedia(asset, project, index) {
    const entry = typeof asset === "string" ? { src: asset } : { ...asset };
    const type = entry.type === "video" || videoPattern.test(entry.src || "") ? "video" : "image";
    return {
      ...entry,
      type,
      stage: normalizeStage(entry.stage, project.section),
      alt: entry.alt || `${project.title} media ${index + 1}`,
      caption: entry.caption || "",
      poster: entry.poster || "",
    };
  }

  function normalizeProject(project, index) {
    const media = (project.media || project.images || []).map((asset, mediaIndex) => normalizeMedia(asset, project, mediaIndex));
    const stageCounts = Object.fromEntries(stageOrder.map((stage) => [stage, media.filter((entry) => entry.stage === stage).length]));
    return {
      ...project,
      id: String(project.id || project.slug || `project-${index}`),
      slug: String(project.slug || project.id || `project-${index}`),
      section: project.section === "wips" ? "wips" : "art",
      madeIn: Array.isArray(project.madeIn) ? project.madeIn.filter(Boolean) : [],
      sortOrder: Number(project.sortOrder) || 0,
      media,
      cover: media[0],
      stageCounts,
      availableStages: stageOrder.filter((stage) => stageCounts[stage]),
      originalIndex: index,
    };
  }

  function previewSource(entry) {
    if (entry.type === "video") return entry.poster;
    if (entry.src === "Dont Fret high quality banner.png") return "dont-fret-banner.webp";
    return entry.src;
  }

  function mediaCountLabel(project) {
    const imageCount = project.media.filter((entry) => entry.type === "image").length;
    const videoCount = project.media.length - imageCount;
    return `${imageCount} ${imageCount === 1 ? "image" : "images"} · ${videoCount} ${videoCount === 1 ? "video" : "videos"}`;
  }

  function createPreviewImage(entry, eager = false) {
    const preview = document.createElement("img");
    preview.src = previewSource(entry);
    preview.alt = entry.alt;
    preview.loading = eager ? "eager" : "lazy";
    preview.decoding = "async";
    preview.className = "portfolio-post-preview";
    return preview;
  }

  function createCard(project, cardIndex) {
    const button = document.createElement("button");
    button.type = "button";
    button.className = "portfolio-post portfolio-post-v3";
    button.dataset.projectId = project.id;
    button.setAttribute("aria-label", `Open ${project.title}: ${mediaCountLabel(project)}`);

    const imageShell = document.createElement("span");
    imageShell.className = "portfolio-post-image";
    imageShell.append(createPreviewImage(project.cover, cardIndex < 5));

    const count = document.createElement("span");
    count.className = "portfolio-post-counter";
    count.textContent = mediaCountLabel(project);
    imageShell.append(count);

    if (project.media.some((entry) => entry.type === "video")) {
      const play = document.createElement("span");
      play.className = "portfolio-post-play";
      play.setAttribute("aria-hidden", "true");
      play.textContent = "▶";
      imageShell.append(play);
    }

    if (project.media.length > 1) {
      const rail = document.createElement("span");
      rail.className = "portfolio-card-preview-rail";
      project.media.slice(1, 4).forEach((entry) => {
        const thumb = createPreviewImage(entry);
        thumb.className = "portfolio-card-preview-thumb";
        thumb.alt = "";
        rail.append(thumb);
      });
      imageShell.append(rail);
    }

    const openHint = document.createElement("span");
    openHint.className = "portfolio-post-open";
    openHint.textContent = "Open complete project";
    imageShell.append(openHint);

    const copy = document.createElement("span");
    copy.className = "portfolio-post-copy";
    const heading = document.createElement("span");
    heading.className = "portfolio-post-title";
    heading.textContent = project.title;
    copy.append(heading);

    const badges = document.createElement("span");
    badges.className = "portfolio-post-header";
    const date = document.createElement("span");
    date.className = "portfolio-post-badge";
    date.textContent = project.dateLabel;
    badges.append(date);
    if (project.status) {
      const status = document.createElement("span");
      status.className = "portfolio-post-badge portfolio-post-badge-status";
      status.textContent = project.status;
      badges.append(status);
    }
    copy.append(badges);

    const summary = document.createElement("span");
    summary.className = "portfolio-post-stage-summary";
    project.availableStages.forEach((stage) => {
      const chip = document.createElement("span");
      chip.className = `portfolio-post-stage-chip portfolio-post-stage-chip-${stage}`;
      chip.textContent = `${project.stageCounts[stage]} ${stageLabels[stage]}`;
      summary.append(chip);
    });
    copy.append(summary);

    if (project.text) {
      const description = document.createElement("span");
      description.className = "portfolio-post-meta";
      description.textContent = project.text;
      copy.append(description);
    }

    if (project.credit) {
      const projectCredit = document.createElement("span");
      projectCredit.className = "portfolio-post-credit";
      projectCredit.textContent = project.credit;
      copy.append(projectCredit);
    }

    button.append(imageShell, copy);
    button.addEventListener("click", () => openProject(project.id, button));
    return button;
  }

  function groupLabel(project) {
    const match = String(project.dateLabel || "").match(/\b(19|20)\d{2}\b/);
    return match ? match[0] : "Year unresolved";
  }

  function renderTimeline(container, projects, emptyText) {
    container.replaceChildren();
    if (!projects.length) {
      const empty = document.createElement("p");
      empty.className = "portfolio-empty";
      empty.textContent = emptyText;
      container.append(empty);
      return;
    }

    const groups = new Map();
    projects.forEach((project) => {
      const label = groupLabel(project);
      if (!groups.has(label)) groups.set(label, []);
      groups.get(label).push(project);
    });

    [...groups.entries()].forEach(([label, entries]) => {
      const era = document.createElement("section");
      era.className = "portfolio-era";
      const eraHeading = document.createElement("div");
      eraHeading.className = "portfolio-era-heading";
      eraHeading.innerHTML = `<p class="portfolio-era-kicker">Timeline</p><h3 class="portfolio-era-title">${label}</h3>`;
      const grid = document.createElement("div");
      grid.className = "portfolio-era-grid";
      entries.forEach((project, index) => grid.append(createCard(project, index)));
      era.append(eraHeading, grid);
      container.append(era);
    });
  }

  function createCreditCard(item) {
    const card = document.createElement("article");
    card.className = "portfolio-credit-card";
    if (item.image) {
      const mediaShell = document.createElement("div");
      mediaShell.className = "portfolio-credit-media";
      const preview = document.createElement("img");
      preview.src = item.image;
      preview.alt = item.alt || item.title;
      preview.loading = "lazy";
      mediaShell.append(preview);
      card.append(mediaShell);
    }
    const copy = document.createElement("div");
    copy.className = "portfolio-credit-copy";
    const badges = document.createElement("div");
    badges.className = "portfolio-credit-top";
    [item.type, item.status].filter(Boolean).forEach((label, index) => {
      const badge = document.createElement("span");
      badge.className = `portfolio-credit-badge${index ? " portfolio-credit-badge-status" : ""}`;
      badge.textContent = label;
      badges.append(badge);
    });
    copy.append(badges);
    const heading = document.createElement("h3");
    heading.className = "portfolio-credit-title";
    heading.textContent = item.title;
    copy.append(heading);
    const role = document.createElement("p");
    role.className = "portfolio-credit-role";
    role.textContent = item.role;
    copy.append(role);
    const description = document.createElement("p");
    description.className = "portfolio-credit-text";
    description.textContent = item.text;
    copy.append(description);
    if (item.link) {
      const link = document.createElement("a");
      link.className = "portfolio-credit-link";
      link.href = item.link;
      link.textContent = item.linkLabel || "Open project";
      if (/^https?:\/\//.test(item.link)) {
        link.target = "_blank";
        link.rel = "noreferrer";
      }
      copy.append(link);
    }
    card.append(copy);
    return card;
  }

  function setView(view, updateHash = true) {
    const valid = panels.some((panel) => panel.dataset.portfolioV3Panel === view) ? view : "all";
    panels.forEach((panel) => { panel.hidden = panel.dataset.portfolioV3Panel !== valid; });
    tabs.forEach((tab) => {
      const active = tab.dataset.portfolioV3View === valid;
      tab.classList.toggle("is-active", active);
      tab.setAttribute("aria-selected", String(active));
    });
    workspace.dataset.activePortfolioView = valid;
    content.hidden = false;
    if (updateHash) history.replaceState(null, "", `${location.pathname}${location.search}#${valid}`);
  }

  function filteredMedia(project) {
    if (state.activeStage === "all") return project.media;
    return project.media.filter((entry) => entry.stage === state.activeStage);
  }

  function renderFilters(project) {
    stageFilters.replaceChildren();
    ["all", ...project.availableStages].forEach((stage) => {
      const button = document.createElement("button");
      button.type = "button";
      button.className = "portfolio-lightbox-stage-filter";
      button.classList.toggle("is-active", state.activeStage === stage);
      button.textContent = stage === "all" ? `All (${project.media.length})` : `${stageLabels[stage]} (${project.stageCounts[stage]})`;
      button.addEventListener("click", () => {
        state.activeStage = stage;
        state.activeMedia = 0;
        renderDialog();
      });
      stageFilters.append(button);
    });
    stageFilters.hidden = project.availableStages.length < 2;
  }

  function renderThumbs() {
    thumbs.replaceChildren();
    state.visibleMedia.forEach((entry, index) => {
      const button = document.createElement("button");
      button.type = "button";
      button.className = "portfolio-lightbox-thumb";
      button.classList.toggle("is-active", index === state.activeMedia);
      button.setAttribute("aria-label", `Show ${entry.type === "video" ? "video" : "image"} ${index + 1}`);
      const preview = createPreviewImage(entry);
      preview.className = "portfolio-lightbox-thumb-preview";
      button.append(preview);
      if (entry.type === "video") {
        const badge = document.createElement("span");
        badge.className = "portfolio-lightbox-thumb-badge";
        badge.textContent = "Play";
        button.append(badge);
      }
      button.addEventListener("click", () => {
        state.activeMedia = index;
        renderDialog();
      });
      thumbs.append(button);
    });
    thumbs.hidden = state.visibleMedia.length < 2;
  }

  function renderDialog() {
    const project = state.projects[state.activeProject];
    state.visibleMedia = filteredMedia(project);
    if (!state.visibleMedia.length) {
      state.activeStage = "all";
      state.visibleMedia = project.media;
    }
    state.activeMedia = (state.activeMedia + state.visibleMedia.length) % state.visibleMedia.length;
    const entry = state.visibleMedia[state.activeMedia];

    if (entry.type === "video") {
      image.hidden = true;
      image.removeAttribute("src");
      video.hidden = false;
      video.src = entry.src;
      video.poster = entry.poster;
      video.preload = "metadata";
      video.setAttribute("aria-label", entry.alt);
    } else {
      video.pause();
      video.hidden = true;
      video.removeAttribute("src");
      video.removeAttribute("poster");
      video.load();
      image.hidden = false;
      image.src = entry.src;
      image.alt = entry.alt;
    }

    title.textContent = project.title;
    meta.textContent = [project.dateLabel, stageLabels[entry.stage], ...(project.madeIn || [])].filter(Boolean).join(" · ");
    details.textContent = entry.caption || project.text;
    credit.textContent = project.credit || "";
    credit.hidden = !project.credit;
    counter.textContent = `${state.activeMedia + 1} / ${state.visibleMedia.length} · ${mediaCountLabel(project)}`;
    previous.hidden = state.visibleMedia.length < 2;
    next.hidden = state.visibleMedia.length < 2;
    if (project.link) {
      projectLink.hidden = false;
      projectLink.href = project.link;
      projectLink.textContent = project.linkLabel || "Open project page";
    } else {
      projectLink.hidden = true;
      projectLink.removeAttribute("href");
    }
    renderFilters(project);
    renderThumbs();
  }

  function openProject(projectId, trigger = null) {
    const index = state.projects.findIndex((project) => project.id === projectId || project.slug === projectId);
    if (index < 0) return;
    state.activeProject = index;
    state.activeMedia = 0;
    state.activeStage = "all";
    state.lastTrigger = trigger || document.activeElement;
    renderDialog();
    dialog.hidden = false;
    document.body.style.overflow = "hidden";
    close.focus();
  }

  function closeDialog() {
    dialog.hidden = true;
    image.removeAttribute("src");
    video.pause();
    video.removeAttribute("src");
    video.removeAttribute("poster");
    video.load();
    document.body.style.overflow = "";
    state.lastTrigger?.focus?.();
  }

  function moveMedia(delta) {
    state.activeMedia += delta;
    renderDialog();
  }

  async function boot() {
    try {
      await (window.portfolioBootstrapPromise || Promise.resolve());
    } catch (error) {
      console.warn("Portfolio data fallback in use.", error);
    }

    state.projects = (window.portfolioItems || [])
      .map(normalizeProject)
      .filter((project) => project.title && project.media.length)
      .sort((left, right) => right.sortOrder - left.sortOrder || left.originalIndex - right.originalIndex);

    renderTimeline(allGrid, state.projects, "No projects are available yet.");
    renderTimeline(selectedGrid, state.projects.filter((project) => project.featured), "No selected projects are available yet.");
    renderTimeline(wipGrid, state.projects.filter((project) => project.availableStages.some((stage) => ["texture-lookdev", "process", "wip"].includes(stage))), "No process media is available yet.");
    (window.portfolioCredits || []).forEach((item) => creditGrid.append(createCreditCard(item)));

    document.getElementById("portfolioProjectCount").textContent = String(state.projects.length);
    document.getElementById("portfolioMediaCount").textContent = String(state.projects.reduce((sum, project) => sum + project.media.length, 0));

    const initialView = location.hash.replace("#", "").toLowerCase();
    setView(["all", "artwork", "wips", "resume"].includes(initialView) ? initialView : "all", false);
    const requestedProject = new URLSearchParams(location.search).get("project");
    if (requestedProject) openProject(requestedProject);
  }

  tabs.forEach((tab) => tab.addEventListener("click", () => setView(tab.dataset.portfolioV3View)));
  window.addEventListener("hashchange", () => setView(location.hash.replace("#", "").toLowerCase(), false));
  close.addEventListener("click", closeDialog);
  previous.addEventListener("click", () => moveMedia(-1));
  next.addEventListener("click", () => moveMedia(1));
  dialog.addEventListener("click", (event) => { if (event.target === dialog) closeDialog(); });
  dialog.addEventListener("pointerdown", (event) => { state.pointerStartX = event.clientX; });
  dialog.addEventListener("pointerup", (event) => {
    if (state.pointerStartX === null || state.visibleMedia.length < 2) return;
    const distance = event.clientX - state.pointerStartX;
    if (Math.abs(distance) > 55) moveMedia(distance > 0 ? -1 : 1);
    state.pointerStartX = null;
  });
  document.addEventListener("keydown", (event) => {
    if (dialog.hidden) return;
    if (event.key === "Escape") closeDialog();
    if (event.key === "ArrowLeft") moveMedia(-1);
    if (event.key === "ArrowRight") moveMedia(1);
    if (event.key === "Tab") {
      const focusable = Array.from(dialog.querySelectorAll("button:not([hidden]), a[href], video[controls]"));
      const first = focusable[0];
      const last = focusable[focusable.length - 1];
      if (event.shiftKey && document.activeElement === first) { event.preventDefault(); last.focus(); }
      if (!event.shiftKey && document.activeElement === last) { event.preventDefault(); first.focus(); }
    }
  });

  boot();
})();
