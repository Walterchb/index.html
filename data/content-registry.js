/*
  Content registry and lazy loader
  -------------------------------
  Local mode works directly from file:// because it loads small JavaScript chunks with
  <script> tags. This avoids loading the complete reading packet, glossary, and full-text
  index at startup. Remote API mode is optional for a published version.
*/
(function attachStudyContentRegistry(global) {
  const config = global.CONTENT_CONFIG || {
    MODE: "local-chunks", // "local-chunks" | "remote-api"
    API_BASE_URL: ""
  };

  const registry = {
    sections: new Map(),
    exercises: new Map(),
    glossary: null,
    searchIndex: null,
    loading: new Map()
  };

  const currentScript = document.currentScript;
  const baseUrl = currentScript ? new URL(".", currentScript.src).href : new URL("./data/", window.location.href).href;

  function isRemote() {
    return config.MODE === "remote-api" && String(config.API_BASE_URL || "").trim();
  }

  function joinUrl(path) {
    return new URL(path, baseUrl).href;
  }

  function scriptLoad(relativePath) {
    const url = joinUrl(relativePath);
    if (registry.loading.has(url)) return registry.loading.get(url);
    const promise = new Promise((resolve, reject) => {
      const script = document.createElement("script");
      script.src = url;
      script.async = true;
      script.onload = () => resolve();
      script.onerror = () => reject(new Error(`No se pudo cargar el recurso de estudio: ${relativePath}`));
      document.head.appendChild(script);
    }).finally(() => registry.loading.delete(url));
    registry.loading.set(url, promise);
    return promise;
  }

  async function apiLoad(path) {
    const root = String(config.API_BASE_URL).replace(/\/$/, "");
    const response = await fetch(`${root}${path}`, { headers: { Accept: "application/json" } });
    if (!response.ok) throw new Error(`El servicio de contenido respondió ${response.status}.`);
    return response.json();
  }

  function registerSection(id, section) {
    registry.sections.set(id, section);
  }

  function registerExercises(moduleId, exercises) {
    registry.exercises.set(moduleId, exercises || []);
  }

  function registerGlossary(entries) {
    registry.glossary = entries || [];
  }

  function registerSearchIndex(index) {
    registry.searchIndex = index || [];
  }

  async function loadSection(id) {
    if (registry.sections.has(id)) return registry.sections.get(id);
    if (isRemote()) {
      const payload = await apiLoad(`/sections/${encodeURIComponent(id)}`);
      registerSection(id, payload.section || payload);
      return registry.sections.get(id);
    }
    await scriptLoad(`sections/${id}.js`);
    return registry.sections.get(id);
  }

  async function loadExercises(moduleId) {
    if (registry.exercises.has(moduleId)) return registry.exercises.get(moduleId);
    if (isRemote()) {
      const payload = await apiLoad(`/exercises?module=${encodeURIComponent(moduleId)}`);
      registerExercises(moduleId, payload.exercises || payload);
      return registry.exercises.get(moduleId);
    }
    await scriptLoad(`exercises/${moduleId}.js`);
    return registry.exercises.get(moduleId) || [];
  }

  async function loadAllExercises(moduleIds) {
    const lists = await Promise.all(moduleIds.map(loadExercises));
    return lists.flat();
  }

  async function loadGlossary() {
    if (registry.glossary) return registry.glossary;
    if (isRemote()) {
      const payload = await apiLoad(`/glossary`);
      registerGlossary(payload.glossary || payload);
      return registry.glossary;
    }
    await scriptLoad("glossary.js");
    return registry.glossary || [];
  }

  async function loadSearchIndex() {
    if (registry.searchIndex) return registry.searchIndex;
    if (isRemote()) {
      const payload = await apiLoad(`/search-index`);
      registerSearchIndex(payload.index || payload);
      return registry.searchIndex;
    }
    await scriptLoad("search-index.js");
    return registry.searchIndex || [];
  }

  global.StudyContentRegistry = {
    config,
    registerSection,
    registerExercises,
    registerGlossary,
    registerSearchIndex,
    loadSection,
    loadExercises,
    loadAllExercises,
    loadGlossary,
    loadSearchIndex,
    getLoadedSection: (id) => registry.sections.get(id),
    getLoadedExercises: (moduleId) => registry.exercises.get(moduleId) || [],
    getLoadedGlossary: () => registry.glossary || [],
    getLoadedSearchIndex: () => registry.searchIndex || []
  };
})(window);
