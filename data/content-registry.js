/*
  Study assets registry
  ---------------------
  Exercises and glossary are separate from the reading pages. The local version uses
  script tags so it works under file://; remote-api mode is intended for a private,
  authenticated course library.
*/
(function attachStudyContentRegistry(global) {
  const config = global.COURSE_DATA_CONFIG || {
    MODE: 'local-chunks', // local-chunks | remote-api
    API_BASE_URL: '',
    COURSE_ID: 'course-1'
  };

  const registry = {
    exercises: new Map(),
    glossary: null,
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

  function scriptLoad(relativePath) {
    const url = new URL(relativePath, baseUrl).href;
    if (registry.loading.has(url)) return registry.loading.get(url);
    const promise = new Promise((resolve, reject) => {
      const script = document.createElement('script');
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
    const response = await fetch(apiUrl(path), { headers: { Accept: 'application/json' }, credentials: 'include' });
    if (!response.ok) throw new Error(`El servicio de contenido respondió ${response.status}.`);
    return response.json();
  }

  function registerExercises(moduleId, exercises) {
    registry.exercises.set(moduleId, exercises || []);
  }

  function registerGlossary(entries) {
    registry.glossary = entries || [];
  }

  async function loadExercises(moduleId) {
    if (registry.exercises.has(moduleId)) return registry.exercises.get(moduleId);
    if (isRemote()) {
      const payload = await apiLoad(`/courses/${encodeURIComponent(config.COURSE_ID || 'course-1')}/exercises/${encodeURIComponent(moduleId)}`);
      registerExercises(moduleId, payload.exercises || payload);
      return registry.exercises.get(moduleId) || [];
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
      const payload = await apiLoad(`/courses/${encodeURIComponent(config.COURSE_ID || 'course-1')}/glossary`);
      registerGlossary(payload.glossary || payload);
      return registry.glossary || [];
    }
    await scriptLoad('glossary.js');
    return registry.glossary || [];
  }

  global.StudyContentRegistry = {
    config,
    registerExercises,
    registerGlossary,
    loadExercises,
    loadAllExercises,
    loadGlossary,
    getLoadedExercises: (moduleId) => registry.exercises.get(moduleId) || [],
    getLoadedGlossary: () => registry.glossary || []
  };
})(window);
