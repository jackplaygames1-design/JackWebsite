(function bootstrapPortfolioFromSupabase() {
  const api = window.PortfolioSupabase;
  const localProjects = Array.isArray(window.portfolioItems) ? window.portfolioItems : [];
  const archiveProjects = Array.isArray(window.portfolioArchiveItems) ? window.portfolioArchiveItems : [];
  const mediaAdditions = window.portfolioMediaAdditions && typeof window.portfolioMediaAdditions === "object"
    ? window.portfolioMediaAdditions
    : {};

  function mergeMedia(existingMedia, extraMedia) {
    const merged = [];
    const seenSources = new Set();

    [...(Array.isArray(existingMedia) ? existingMedia : []), ...(Array.isArray(extraMedia) ? extraMedia : [])]
      .forEach((media) => {
        const source = typeof media === "string" ? media : media?.src;

        if (!source || seenSources.has(source)) {
          return;
        }

        seenSources.add(source);
        merged.push(media);
      });

    return merged;
  }

  function addProjectProcess(project) {
    const additions = mediaAdditions[project?.title];

    if (!Array.isArray(additions) || !additions.length) {
      return project;
    }

    return {
      ...project,
      media: mergeMedia(project.media || project.images, additions),
    };
  }

  function mergeArchiveProjects(projects) {
    const mergedProjects = projects.map(addProjectProcess);
    const existingTitles = new Set(mergedProjects.map((project) => project?.title).filter(Boolean));

    archiveProjects.forEach((project) => {
      if (!project?.title || existingTitles.has(project.title)) {
        return;
      }

      existingTitles.add(project.title);
      mergedProjects.push(addProjectProcess(project));
    });

    return mergedProjects;
  }

  window.portfolioBootstrapPromise = (async () => {
    if (!api?.isConfigured()) {
      window.portfolioItems = mergeArchiveProjects(localProjects);
      window.portfolioSource = "local+archive";
      return;
    }

    const remoteProjects = api.fetchPublicPortfolioProjects
      ? await api.fetchPublicPortfolioProjects()
      : await api.fetchPublishedProjects();

    if (Array.isArray(remoteProjects) && remoteProjects.length) {
      window.portfolioItems = mergeArchiveProjects(remoteProjects);
      window.portfolioSource = "supabase+archive";
    } else {
      window.portfolioItems = mergeArchiveProjects(localProjects);
      window.portfolioSource = "local+archive";
    }
  })().catch((error) => {
    console.warn("Unable to load portfolio projects from Supabase.", error);
    window.portfolioItems = mergeArchiveProjects(localProjects);
    window.portfolioSource = "local+archive";
  });
})();
