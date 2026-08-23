(function bootstrapPortfolioFromSupabase() {
  const api = window.PortfolioSupabase;
  const canonicalProjects = Array.isArray(window.portfolioItems) ? window.portfolioItems : [];
  const revisionTime = Date.parse(window.PORTFOLIO_DATA_REVISION || "") || 0;

  function projectKey(project) {
    return String(project?.slug || project?.id || project?.title || "").trim().toLowerCase();
  }

  function isNewerThanReconciliation(project) {
    const updatedTime = Date.parse(project?.updatedAt || "");
    return Number.isFinite(updatedTime) && updatedTime > revisionTime;
  }

  function mergeCanonicalWithRemote(remoteProjects) {
    const remoteByKey = new Map(remoteProjects.map((project) => [projectKey(project), project]));
    const canonicalKeys = new Set(canonicalProjects.map(projectKey));

    const merged = canonicalProjects.map((canonical) => {
      const remote = remoteByKey.get(projectKey(canonical));

      if (!remote || !isNewerThanReconciliation(remote)) {
        return canonical;
      }

      return {
        ...canonical,
        ...remote,
        id: canonical.id,
        slug: canonical.slug,
        featured: canonical.featured,
        credit: canonical.credit,
        link: canonical.link,
        linkLabel: canonical.linkLabel,
      };
    });

    remoteProjects.forEach((remote) => {
      const key = projectKey(remote);

      if (!key || canonicalKeys.has(key) || !isNewerThanReconciliation(remote)) {
        return;
      }

      merged.push({
        ...remote,
        id: remote.slug || remote.id,
        featured: false,
      });
    });

    return merged;
  }

  window.portfolioBootstrapPromise = (async () => {
    if (!api?.isConfigured()) {
      window.portfolioItems = canonicalProjects;
      window.portfolioSource = "canonical-local";
      return;
    }

    const remoteProjects = api.fetchPublicPortfolioProjects
      ? await api.fetchPublicPortfolioProjects()
      : await api.fetchPublishedProjects();

    window.portfolioItems = Array.isArray(remoteProjects)
      ? mergeCanonicalWithRemote(remoteProjects)
      : canonicalProjects;
    window.portfolioSource = Array.isArray(remoteProjects)
      ? "canonical+supabase-newer-edits"
      : "canonical-local";
  })().catch((error) => {
    console.warn("Unable to load portfolio projects from Supabase; using the reconciled local source.", error);
    window.portfolioItems = canonicalProjects;
    window.portfolioSource = "canonical-local";
  });
})();
