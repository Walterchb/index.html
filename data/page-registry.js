/*
  Page registry
  -------------
  The reading text is split into source-page groups. Script-tag loading keeps local
  file:// use functional; an optional private API can serve exactly the same groups
  when the collection grows beyond a single course.
*/
(function attachCoursePages(global) {
  const config = global.COURSE_DATA_CONFIG || {
    MODE: 'local-chunks', // local-chunks | remote-api
    API_BASE_URL: '',
    COURSE_ID: 'course-1'
  };

  const registry = {
    groups: new Map(),
    pages: new Map(),
    searchIndex: null,
    loading: new Map()
  };

  const currentScript = document.currentScript;
  const baseUrl = currentScript ? new URL('.', currentScript.src).href : new URL('./data/', window.location.href).href;

  function isRemote() {
    return config.MODE === 'remote-api' && String(config.API_BASE_URL || '').trim();
  }

  function apiUrl(path) {
    return `${String(config.API_BASE_URL).replace(/\/$/, '')}${path}`;
  }

  function loadScript(relativePath) {
    const url = new URL(relativePath, baseUrl).href;
    if (registry.loading.has(url)) return registry.loading.get(url);

    const promise = new Promise((resolve, reject) => {
      const script = document.createElement('script');
      script.src = url;
      script.async = true;
      script.onload = () => resolve();
      script.onerror = () => reject(new Error(`No se pudo cargar ${relativePath}.`));
      document.head.appendChild(script);
    }).finally(() => registry.loading.delete(url));

    registry.loading.set(url, promise);
    return promise;
  }

  async function fetchJson(path) {
    const response = await fetch(apiUrl(path), { headers: { Accept: 'application/json' }, credentials: 'include' });
    if (!response.ok) throw new Error(`El servicio de contenido respondió ${response.status}.`);
    return response.json();
  }

  function registerGroup(groupId, pages) {
    const list = Array.isArray(pages) ? pages : [];
    registry.groups.set(groupId, list);
    list.forEach((page) => registry.pages.set(Number(page.page), page));
  }

  function registerSearchIndex(index) {
    registry.searchIndex = Array.isArray(index) ? index : [];
  }

  async function loadGroup(groupId) {
    if (registry.groups.has(groupId)) return registry.groups.get(groupId);

    if (isRemote()) {
      const payload = await fetchJson(`/courses/${encodeURIComponent(config.COURSE_ID || 'course-1')}/page-groups/${encodeURIComponent(groupId)}`);
      registerGroup(groupId, payload.pages || payload);
      return registry.groups.get(groupId) || [];
    }

    const meta = global.COURSE_MANIFEST?.pageGroups?.[groupId];
    if (!meta?.path) throw new Error(`No se encontró el bloque de páginas ${groupId}.`);
    await loadScript(meta.path);
    return registry.groups.get(groupId) || [];
  }

  async function loadPage(pageNumber) {
    const page = Number(pageNumber);
    if (registry.pages.has(page)) return registry.pages.get(page);

    const groupId = Object.entries(global.COURSE_MANIFEST?.pageGroups || {})
      .find(([, value]) => page >= value.start && page <= value.end)?.[0];
    if (!groupId) throw new Error(`La página ${page} no pertenece al mapa del curso.`);

    await loadGroup(groupId);
    return registry.pages.get(page);
  }

  async function loadSearchIndex() {
    if (registry.searchIndex) return registry.searchIndex;
    if (isRemote()) {
      const payload = await fetchJson(`/courses/${encodeURIComponent(config.COURSE_ID || 'course-1')}/search-index`);
      registerSearchIndex(payload.index || payload);
      return registry.searchIndex || [];
    }
    await loadScript('page-search-index.js');
    return registry.searchIndex || [];
  }

  global.CoursePages = {
    config,
    registerGroup,
    registerSearchIndex,
    loadGroup,
    loadPage,
    loadSearchIndex,
    getPage: (page) => registry.pages.get(Number(page)),
    getGroup: (groupId) => registry.groups.get(groupId) || [],
    loadedPageCount: () => registry.pages.size
  };
})(window);
