import { getClient, getUser } from "./auth.js";

export const KINDS = Object.freeze([
  "courses",
  "modules",
  "lessons",
  "documents",
  "cards",
  "questions",
  "progress",
  "notes",
  "attempts",
  "sessions",
  "settings",
]);
const listeners = new Set();
let current = null;
let syncJob = null;
let syncTimer = null;
let eventsInstalled = false;
let channel = null;
let scopeGeneration = 0;
let state = {
  mode: "local",
  pending: 0,
  lastSync: null,
  error: null,
  syncing: false,
  conflicts: 0,
};
const uuid = () => crypto.randomUUID();
const clone = (value) => (value == null ? value : structuredClone(value));
const now = () => new Date().toISOString();
const key = (kind, id) => `${kind}:${id}`;
const bucket = () => globalThis.CFA_CONFIG?.storageBucket || "cfa-documents";
const maxBytes = () =>
  Math.min(40, Math.max(1, Number(globalThis.CFA_CONFIG?.maxFileMB) || 40)) *
  1024 *
  1024;
const SAFE_FILE_TYPES = new Set([
  "application/pdf",
  "image/png",
  "image/jpeg",
  "image/webp",
  "image/bmp",
  "text/plain",
  "text/markdown",
  "application/octet-stream",
]);
function safeFileType(type, name = "") {
  const provided = String(type || "")
    .split(";")[0]
    .trim()
    .toLowerCase();
  if (provided && !SAFE_FILE_TYPES.has(provided))
    throw new Error(
      "Tipo de archivo no permitido. Usa PDF, PNG, JPEG, WEBP, BMP, TXT o Markdown. No se admiten HTML, SVG ni archivos ejecutables.",
    );
  if (provided && provided !== "application/octet-stream") return provided;
  const extension = String(name).split(".").pop().toLowerCase();
  if (
    [
      "html",
      "htm",
      "svg",
      "svgz",
      "xhtml",
      "js",
      "mjs",
      "exe",
      "bat",
      "cmd",
      "com",
      "ps1",
    ].includes(extension)
  )
    throw new Error(
      "Este tipo de archivo no se admite como material de estudio.",
    );
  return (
    {
      pdf: "application/pdf",
      png: "image/png",
      jpg: "image/jpeg",
      jpeg: "image/jpeg",
      webp: "image/webp",
      bmp: "image/bmp",
      txt: "text/plain",
      md: "text/markdown",
      markdown: "text/markdown",
    }[extension] || "application/octet-stream"
  );
}
function validateKind(kind) {
  if (!KINDS.includes(kind)) throw new Error(`Tipo de dato inválido: ${kind}`);
}
function validateId(id) {
  if (typeof id !== "string" || !/^[a-zA-Z0-9_.:-]{1,160}$/.test(id))
    throw new Error("Identificador de dato inválido.");
  return id;
}
function context() {
  if (!current) throw new Error("El almacenamiento aún no está inicializado.");
  return current;
}
function sameContext(ctx) {
  return current === ctx;
}
function cloud(ctx) {
  return Boolean(ctx.userId && getClient() && getUser()?.id === ctx.userId);
}
function checkCloud(ctx) {
  if (!sameContext(ctx) || !cloud(ctx))
    throw new Error(
      "La cuenta cambió. Vuelve a sincronizar desde la cuenta correcta.",
    );
}
function request(req) {
  return new Promise((resolve, reject) => {
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
}
async function transaction(ctx, names, mode, callback) {
  const tx = ctx.db.transaction(names, mode);
  const done = new Promise((resolve, reject) => {
    tx.oncomplete = resolve;
    tx.onabort = tx.onerror = () =>
      reject(
        tx.error ||
          new Error(
            "No se pudo guardar. Comprueba el espacio libre del navegador.",
          ),
      );
  });
  const stores = Object.fromEntries(
    names.map((name) => [name, tx.objectStore(name)]),
  );
  let value;
  try {
    value = await callback(stores, tx);
  } catch (error) {
    try {
      tx.abort();
    } catch {
      /* already finished */
    }
    await done.catch(() => {});
    throw error;
  }
  await done;
  return value;
}
function openDatabase(scope) {
  return new Promise((resolve, reject) => {
    const req = indexedDB.open(`cfa-study-v3:${scope}`, 1);
    req.onupgradeneeded = () => {
      const db = req.result;
      const records = db.createObjectStore("records", { keyPath: "key" });
      records.createIndex("kind", "kind");
      db.createObjectStore("outbox", { keyPath: "key" });
      db.createObjectStore("files", { keyPath: "id" });
      db.createObjectStore("meta", { keyPath: "key" });
      db.createObjectStore("conflicts", { keyPath: "key" });
    };
    req.onsuccess = () => {
      req.result.onversionchange = () => req.result.close();
      resolve(req.result);
    };
    req.onerror = () =>
      reject(
        new Error(
          "No se pudo abrir el almacenamiento local. Habilita los datos del sitio y vuelve a intentarlo.",
        ),
      );
    req.onblocked = () =>
      reject(
        new Error(
          "Cierra las otras pestañas de la aplicación para actualizar el almacenamiento.",
        ),
      );
  });
}
export function status() {
  return { ...state };
}
export function subscribe(fn) {
  listeners.add(fn);
  return () => listeners.delete(fn);
}
function emit(detail = {}) {
  listeners.forEach((fn) => {
    try {
      fn({ ...status(), ...detail });
    } catch (e) {
      console.error(e);
    }
  });
}
async function refresh(ctx, detail = {}) {
  const counts = await transaction(
    ctx,
    ["outbox", "files", "conflicts"],
    "readonly",
    async (s) => {
      const [pending, files, conflicts] = await Promise.all([
        request(s.outbox.count()),
        request(s.files.getAll()),
        request(s.conflicts.count()),
      ]);
      return {
        pending: pending + files.filter((f) => !f.uploaded).length,
        conflicts,
      };
    },
  );
  if (sameContext(ctx)) {
    state.pending = ctx.userId ? counts.pending : 0;
    state.conflicts = counts.conflicts;
    emit(detail);
  }
}
function scheduleSync() {
  clearTimeout(syncTimer);
  if (current?.userId) syncTimer = setTimeout(() => sync(), 700);
}
async function changed(ctx, detail = {}) {
  await refresh(ctx, { type: "change", source: "local", ...detail });
  if (sameContext(ctx)) {
    channel?.postMessage({ scope: ctx.scope });
    scheduleSync();
  }
}
export async function initStore(userId = null) {
  if (userId !== null) validateId(userId);
  const generation = ++scopeGeneration;
  const scope = userId || "guest";
  if (current?.scope === scope) return status();
  // A book import belongs to the scope where it started. Abort its entire
  // transaction immediately when another account is requested, even while the
  // new account's database is still opening.
  for (const tx of current?.batchTransactions || []) {
    try {
      tx.abort();
    } catch {
      /* The transaction already completed. */
    }
  }
  const db = await openDatabase(scope);
  if (generation !== scopeGeneration) {
    db.close();
    return status();
  }
  clearTimeout(syncTimer);
  const old = current;
  current = { db, scope, userId };
  old?.db.close();
  state = {
    mode: userId && getClient() ? "cloud" : "local",
    pending: 0,
    lastSync: null,
    error: null,
    syncing: false,
    conflicts: 0,
  };
  const ctx = current;
  const last = await transaction(ctx, ["meta"], "readonly", (s) =>
    request(s.meta.get("lastSync")),
  );
  if (!sameContext(ctx)) return status();
  state.lastSync = last?.value || null;
  await refresh(ctx, { type: "scope" });
  if (!eventsInstalled) {
    eventsInstalled = true;
    globalThis.addEventListener?.("online", () => sync());
    globalThis.addEventListener?.("focus", () => sync());
    globalThis.document?.addEventListener("visibilitychange", () => {
      if (document.visibilityState === "visible") sync();
    });
    if ("BroadcastChannel" in globalThis) {
      channel = new BroadcastChannel("cfa-study-storage-v3");
      channel.onmessage = (event) => {
        if (current && event.data.scope === current.scope)
          refresh(current, { type: "change", source: "tab", changed: 1 })
            .then(scheduleSync)
            .catch(console.error);
      };
    }
    setInterval(() => {
      if (!globalThis.document || document.visibilityState === "visible")
        sync();
    }, 45000);
  }
  scheduleSync();
  return status();
}
export async function list(kind) {
  validateKind(kind);
  const rows = await transaction(context(), ["records"], "readonly", (s) =>
    request(s.records.index("kind").getAll(kind)),
  );
  return rows.filter((row) => !row.deleted).map((row) => clone(row.data));
}
export async function get(kind, id) {
  validateKind(kind);
  validateId(id);
  const row = await transaction(context(), ["records"], "readonly", (s) =>
    request(s.records.get(key(kind, id))),
  );
  return row && !row.deleted ? clone(row.data) : null;
}
function dataValue(object) {
  if (!object || typeof object !== "object" || Array.isArray(object))
    throw new Error("El registro debe ser un objeto.");
  const value = JSON.parse(JSON.stringify(object));
  value.id = validateId(value.id || uuid());
  value.updatedAt = now();
  if (JSON.stringify(value).length > 8 * 1024 * 1024)
    throw new Error(
      "El texto de este registro es demasiado grande. Divídelo en documentos o lecciones más pequeños.",
    );
  return value;
}
export async function put(kind, object) {
  validateKind(kind);
  const ctx = context(),
    data = dataValue(object),
    entityKey = key(kind, data.id);
  await transaction(
    ctx,
    ["records", "outbox", "conflicts"],
    "readwrite",
    async (s) => {
      const previous = await request(s.records.get(entityKey));
      const revision = previous?.revision || 0;
      const operationId = uuid();
      s.records.put({
        key: entityKey,
        kind,
        id: data.id,
        data,
        deleted: false,
        revision,
      });
      s.outbox.put({
        key: entityKey,
        kind,
        id: data.id,
        data,
        deleted: false,
        expectedRevision: revision,
        operationId,
      });
      const conflict = await request(s.conflicts.get(entityKey));
      if (conflict) {
        conflict.local = data;
        conflict.localDeleted = false;
        s.conflicts.put(conflict);
      }
    },
  );
  await changed(ctx, { kind, id: data.id });
  return clone(data);
}

/**
 * Save a complete import in one local transaction. Records remain in the
 * durable outbox until the existing cloud synchronizer acknowledges each one.
 * By default all identifiers must be new, including previously deleted IDs.
 * For reorganization, { createOnly: false, remove: [{ kind, id }] } also writes
 * deletion tombstones atomically. Returned values include only the upserts.
 */
export async function putBatch(items, { createOnly = true, remove = [] } = {}) {
  const ctx = context();
  const generation = scopeGeneration;
  if (
    !Array.isArray(items) ||
    !Array.isArray(remove) ||
    (!items.length && !remove.length) ||
    items.length + remove.length > 3000
  )
    throw new Error("La importación debe contener entre 1 y 3000 registros.");
  if (typeof createOnly !== "boolean")
    throw new Error("La opción createOnly debe ser verdadera o falsa.");
  if (createOnly && remove.length)
    throw new Error("Para eliminar registros debes indicar createOnly: false.");

  const seen = new Set();
  const prepared = items.map((item) => {
    if (!item || typeof item !== "object" || Array.isArray(item))
      throw new Error("Cada registro debe indicar su tipo y sus datos.");
    validateKind(item.kind);
    const data = dataValue(item.data);
    const entityKey = key(item.kind, data.id);
    if (seen.has(entityKey))
      throw new Error("La importación contiene identificadores repetidos.");
    seen.add(entityKey);
    return { kind: item.kind, data, entityKey, deleted: false };
  });
  for (const item of remove) {
    if (!item || typeof item !== "object" || Array.isArray(item))
      throw new Error("Cada eliminación debe indicar su tipo e identificador.");
    validateKind(item.kind);
    validateId(item.id);
    const entityKey = key(item.kind, item.id);
    if (seen.has(entityKey))
      throw new Error(
        "Un registro no puede guardarse o eliminarse más de una vez en la misma operación.",
      );
    seen.add(entityKey);
    prepared.push({
      kind: item.kind,
      data: { id: item.id, updatedAt: now() },
      entityKey,
      deleted: true,
    });
  }
  const checkContext = () => {
    if (
      !sameContext(ctx) ||
      generation !== scopeGeneration ||
      (ctx.userId && getClient() && getUser()?.id !== ctx.userId)
    )
      throw new Error(
        "La cuenta cambió. Vuelve a importar desde la cuenta correcta.",
      );
  };

  let batchTransaction;
  checkContext();
  try {
    await transaction(
      ctx,
      ["records", "outbox", "conflicts"],
      "readwrite",
      async (s, tx) => {
        batchTransaction = tx;
        (ctx.batchTransactions ||= new Set()).add(tx);
        const previous = await Promise.all(
          prepared.map(async ({ entityKey }) => ({
            record: await request(s.records.get(entityKey)),
            conflict: await request(s.conflicts.get(entityKey)),
          })),
        );
        checkContext();
        if (
          createOnly &&
          previous.some(({ record, conflict }) => record || conflict)
        )
          throw new Error(
            "Uno de los registros de la importación ya existe. No se ha guardado ningún cambio.",
          );

        for (let index = 0; index < prepared.length; index++) {
          const { kind, data, entityKey, deleted } = prepared[index];
          const { record, conflict } = previous[index];
          const revision = record?.revision || 0;
          s.records.put({
            key: entityKey,
            kind,
            id: data.id,
            data,
            deleted,
            revision,
          });
          s.outbox.put({
            key: entityKey,
            kind,
            id: data.id,
            data,
            deleted,
            expectedRevision: revision,
            operationId: uuid(),
          });
          if (conflict) {
            conflict.local = data;
            conflict.localDeleted = deleted;
            s.conflicts.put(conflict);
          }
        }
      },
    );
  } catch (error) {
    checkContext();
    throw error;
  } finally {
    ctx.batchTransactions?.delete(batchTransaction);
  }
  // Completion can precede a subsequent account switch. Never refresh the new
  // account with this import's state or schedule its work in another scope.
  if (sameContext(ctx))
    await changed(ctx, {
      changed: prepared.length,
      kinds: [...new Set(prepared.map(({ kind }) => kind))],
    });
  return prepared
    .filter(({ deleted }) => !deleted)
    .map(({ data }) => clone(data));
}

export async function remove(kind, id) {
  validateKind(kind);
  validateId(id);
  const ctx = context(),
    entityKey = key(kind, id);
  await transaction(
    ctx,
    ["records", "outbox", "conflicts"],
    "readwrite",
    async (s) => {
      const previous = await request(s.records.get(entityKey));
      const revision = previous?.revision || 0;
      const data = { id, updatedAt: now() };
      s.records.put({
        key: entityKey,
        kind,
        id,
        data,
        deleted: true,
        revision,
      });
      s.outbox.put({
        key: entityKey,
        kind,
        id,
        data,
        deleted: true,
        expectedRevision: revision,
        operationId: uuid(),
      });
      const conflict = await request(s.conflicts.get(entityKey));
      if (conflict) {
        conflict.local = data;
        conflict.localDeleted = true;
        s.conflicts.put(conflict);
      }
    },
  );
  await changed(ctx, { kind, id });
}
function remoteRow(row) {
  return {
    key: key(row.kind, row.id),
    kind: row.kind,
    id: row.id,
    data: row.payload,
    revision: row.revision,
    deleted: row.deleted,
  };
}
async function pushChanges(ctx) {
  const pending = await transaction(ctx, ["outbox"], "readonly", (s) =>
    request(s.outbox.getAll()),
  );
  for (const item of pending) {
    checkCloud(ctx);
    const existingConflict = await transaction(
      ctx,
      ["conflicts"],
      "readonly",
      (s) => request(s.conflicts.get(item.key)),
    );
    if (existingConflict) continue;
    const { data, error } = await getClient().rpc("apply_study_change", {
      p_owner_id: ctx.userId,
      p_kind: item.kind,
      p_id: item.id,
      p_payload: item.data,
      p_deleted: item.deleted,
      p_expected_revision: item.expectedRevision,
      p_operation_id: item.operationId,
    });
    if (error)
      throw new Error(
        `No se pudo sincronizar: ${error.message}. Verifica que ejecutaste supabase/schema.sql.`,
      );
    checkCloud(ctx);
    if (!data || !["applied", "conflict"].includes(data.status))
      throw new Error("La respuesta de sincronización no es válida.");
    await transaction(
      ctx,
      ["records", "outbox", "conflicts"],
      "readwrite",
      async (s) => {
        const latest = await request(s.outbox.get(item.key));
        if (!latest) return;
        if (data.status === "conflict") {
          s.conflicts.put({
            key: item.key,
            kind: item.kind,
            id: item.id,
            local: latest.data,
            localDeleted: latest.deleted,
            remote: data.record,
            detectedAt: now(),
          });
        } else {
          const local = await request(s.records.get(item.key));
          if (local) {
            local.revision = Math.max(local.revision, data.record.revision);
            s.records.put(local);
          }
          if (latest.operationId === item.operationId)
            s.outbox.delete(item.key);
          else {
            latest.expectedRevision = Math.max(
              latest.expectedRevision,
              data.record.revision,
            );
            s.outbox.put(latest);
          }
        }
      },
    );
  }
}
async function pullChanges(ctx) {
  // Read lightweight revisions first; download large lesson/PDF text only when
  // changed. Immutable-key pagination includes tombstones for offline devices.
  const metadata = [];
  let offset = 0;
  while (true) {
    checkCloud(ctx);
    const { data, error } = await getClient()
      .from("study_records")
      .select("kind,id,revision,deleted")
      .eq("owner_id", ctx.userId)
      .order("kind")
      .order("id")
      .range(offset, offset + 499);
    if (error)
      throw new Error(`No se pudo descargar el avance: ${error.message}`);
    metadata.push(...data);
    if (data.length < 500) break;
    offset += data.length;
  }
  checkCloud(ctx);
  const needed = new Map();
  await transaction(
    ctx,
    ["records", "outbox", "conflicts"],
    "readonly",
    async (s) => {
      for (const row of metadata) {
        if (!KINDS.includes(row.kind)) continue;
        const entityKey = key(row.kind, row.id);
        const pending = await request(s.outbox.get(entityKey));
        let needsPayload = false;
        if (pending) {
          const conflict = await request(s.conflicts.get(entityKey));
          needsPayload = Boolean(
            conflict && conflict.remote?.revision !== row.revision,
          );
        } else {
          const local = await request(s.records.get(entityKey));
          needsPayload = !local || row.revision > local.revision;
        }
        if (needsPayload) {
          if (!needed.has(row.kind)) needed.set(row.kind, []);
          needed.get(row.kind).push(row.id);
        }
      }
    },
  );
  const rows = [];
  for (const [kind, ids] of needed) {
    for (let i = 0; i < ids.length; i += 100) {
      checkCloud(ctx);
      const { data, error } = await getClient()
        .from("study_records")
        .select("kind,id,payload,revision,deleted")
        .eq("owner_id", ctx.userId)
        .eq("kind", kind)
        .in("id", ids.slice(i, i + 100));
      if (error)
        throw new Error(
          `No se pudo descargar el contenido actualizado: ${error.message}`,
        );
      rows.push(...data);
    }
  }
  checkCloud(ctx);
  let changes = 0;
  await transaction(
    ctx,
    ["records", "outbox", "conflicts"],
    "readwrite",
    async (s) => {
      for (const row of rows) {
        if (!KINDS.includes(row.kind)) continue;
        const entityKey = key(row.kind, row.id);
        const pending = await request(s.outbox.get(entityKey));
        if (pending) {
          const conflict = await request(s.conflicts.get(entityKey));
          if (conflict) {
            conflict.remote = row;
            conflict.local = pending.data;
            conflict.localDeleted = pending.deleted;
            s.conflicts.put(conflict);
          }
          continue;
        }
        const existing = await request(s.records.get(entityKey));
        if (!existing || row.revision > existing.revision) {
          s.records.put(remoteRow(row));
          changes++;
        }
      }
    },
  );
  return changes;
}
export async function sync() {
  const ctx = current;
  if (!ctx || !cloud(ctx)) return status();
  if (syncJob) {
    if (syncJob.ctx === ctx) return syncJob.promise;
    await syncJob.promise.catch(() => {});
    if (!sameContext(ctx)) return status();
  }
  if (globalThis.navigator?.onLine === false) {
    state.error =
      "Sin conexión. Tus cambios siguen guardados en este dispositivo.";
    emit({ type: "sync" });
    return status();
  }
  const job = { ctx, promise: null };
  syncJob = job;
  job.promise = (async () => {
    state.syncing = true;
    state.error = null;
    emit({ type: "sync" });
    try {
      let fileError = null;
      try {
        await uploadFiles(ctx);
      } catch (error) {
        fileError = error;
      }
      await pushChanges(ctx);
      const remoteChanges = await pullChanges(ctx);
      const timestamp = now();
      await transaction(ctx, ["meta"], "readwrite", (s) =>
        request(s.meta.put({ key: "lastSync", value: timestamp })),
      );
      if (sameContext(ctx)) state.lastSync = timestamp;
      await refresh(
        ctx,
        remoteChanges
          ? { type: "change", source: "remote", changed: remoteChanges }
          : { type: "sync" },
      );
      if (fileError) throw fileError;
      if (sameContext(ctx) && state.conflicts)
        state.error = `${state.conflicts} conflicto(s) entre dispositivos. Conservamos ambas versiones; resuélvelos en Ajustes.`;
    } catch (error) {
      if (sameContext(ctx))
        state.error =
          error.message ||
          "La sincronización falló. Tus cambios locales están guardados.";
    } finally {
      if (sameContext(ctx)) {
        state.syncing = false;
        await refresh(ctx, { type: "sync" }).catch(() => {});
      }
      if (syncJob === job) syncJob = null;
    }
    return status();
  })();
  return job.promise;
}
export async function listConflicts() {
  return transaction(context(), ["conflicts"], "readonly", (s) =>
    request(s.conflicts.getAll()),
  );
}
export async function resolveConflict(kind, id, choice) {
  validateKind(kind);
  validateId(id);
  if (!["local", "remote"].includes(choice))
    throw new Error(
      "Elige la versión de este dispositivo o la versión de la nube.",
    );
  const ctx = context(),
    entityKey = key(kind, id);
  await transaction(
    ctx,
    ["records", "outbox", "conflicts", "meta"],
    "readwrite",
    async (s) => {
      const conflict = await request(s.conflicts.get(entityKey));
      if (!conflict) return;
      const pending = await request(s.outbox.get(entityKey));
      // Retain both versions in a recovery archive included in backups.
      s.meta.put({
        key: `resolved:${uuid()}`,
        value: {
          ...conflict,
          local: pending?.data || conflict.local,
          choice,
          resolvedAt: now(),
        },
      });
      if (choice === "remote") {
        if (conflict.remote) s.records.put(remoteRow(conflict.remote));
        else s.records.delete(entityKey);
        s.outbox.delete(entityKey);
      } else {
        const local = await request(s.records.get(entityKey));
        const revision = conflict.remote?.revision || 0;
        if (local) {
          local.revision = revision;
          s.records.put(local);
        }
        if (pending) {
          pending.expectedRevision = revision;
          pending.operationId = uuid();
          s.outbox.put(pending);
        }
      }
      s.conflicts.delete(entityKey);
    },
  );
  if (sameContext(ctx)) state.error = null;
  await changed(ctx, { kind, id });
}
async function digest(blob) {
  const hash = await crypto.subtle.digest("SHA-256", await blob.arrayBuffer());
  return [...new Uint8Array(hash)]
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("");
}
export async function saveFile(file, id = uuid()) {
  if (!(file instanceof Blob)) throw new Error("Selecciona un archivo válido.");
  if (file.size > maxBytes())
    throw new Error(
      `El archivo supera el límite de ${maxBytes() / 1024 / 1024} MB.`,
    );
  if (!file.size) throw new Error("El archivo está vacío.");
  validateId(id);
  const ctx = context();
  const fileType = safeFileType(file.type, file.name || "");
  const safeBlob = new Blob([file], { type: fileType });
  const meta = {
    fileId: id,
    name: file.name || "documento",
    size: file.size,
    type: fileType,
    sha256: await digest(file),
  };
  if (ctx.userId) meta.storagePath = `${ctx.userId}/${id}`;
  await transaction(ctx, ["files"], "readwrite", async (s) => {
    const existing = await request(s.files.get(id));
    if (existing && existing.meta.sha256 !== meta.sha256)
      throw new Error(
        "Ese archivo ya existe. Usa un nuevo identificador para reemplazarlo.",
      );
    if (!existing) s.files.put({ id, blob: safeBlob, meta, uploaded: false });
  });
  await changed(ctx, { type: "file", id });
  return meta;
}
async function uploadFiles(ctx) {
  const files = await transaction(ctx, ["files"], "readonly", (s) =>
    request(s.files.getAll()),
  );
  for (const file of files.filter((f) => !f.uploaded)) {
    checkCloud(ctx);
    const path = `${ctx.userId}/${file.id}`;
    const fileType = safeFileType(file.meta.type, file.meta.name);
    safeFileType(file.blob.type, file.meta.name);
    const { error } = await getClient()
      .storage.from(bucket())
      .upload(path, file.blob, { upsert: false, contentType: fileType });
    if (error) {
      if (
        ![400, 409].includes(Number(error.statusCode)) &&
        !/already exists|duplicate/i.test(error.message)
      ) {
        throw new Error(
          `Archivo pendiente (${file.meta.name}): ${error.message}`,
        );
      }
      // A retry after a lost response is safe only if the bytes match.
      const remote = await getClient().storage.from(bucket()).download(path);
      if (remote.error || (await digest(remote.data)) !== file.meta.sha256)
        throw new Error(
          `No se pudo verificar el archivo remoto ${file.meta.name}. La copia local se conserva.`,
        );
    }
    checkCloud(ctx);
    await transaction(ctx, ["files"], "readwrite", async (s) => {
      const latest = await request(s.files.get(file.id));
      if (latest?.meta.sha256 === file.meta.sha256) {
        latest.uploaded = true;
        latest.meta.storagePath = path;
        s.files.put(latest);
      }
    });
  }
}
export async function loadFile(fileId) {
  validateId(fileId);
  const ctx = context();
  const cached = await transaction(ctx, ["files"], "readonly", (s) =>
    request(s.files.get(fileId)),
  );
  if (cached?.blob) {
    const type = safeFileType(cached.meta.type, cached.meta.name);
    safeFileType(cached.blob.type, cached.meta.name);
    return new Blob([cached.blob], { type });
  }
  checkCloud(ctx);
  const path = `${ctx.userId}/${fileId}`;
  const { data, error } = await getClient()
    .storage.from(bucket())
    .download(path);
  if (error)
    throw new Error(
      `No se pudo abrir el archivo: ${error.message}. Conecta este dispositivo para descargarlo por primera vez.`,
    );
  checkCloud(ctx);
  const type = safeFileType(data.type, fileId);
  const safeBlob = new Blob([data], { type });
  const meta = {
    fileId,
    name: fileId,
    size: data.size,
    type,
    storagePath: path,
    sha256: await digest(data),
  };
  await transaction(ctx, ["files"], "readwrite", (s) =>
    request(s.files.put({ id: fileId, blob: safeBlob, meta, uploaded: true })),
  );
  return safeBlob;
}
function toBase64(blob) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result).split(",")[1]);
    reader.onerror = () => reject(reader.error);
    reader.readAsDataURL(blob);
  });
}
function fromBase64(value, type) {
  if (
    typeof value !== "string" ||
    value.length > Math.ceil((maxBytes() * 4) / 3) + 16
  )
    throw new Error("Archivo de respaldo demasiado grande o inválido.");
  let bytes;
  try {
    bytes = Uint8Array.from(atob(value), (char) => char.charCodeAt(0));
  } catch {
    throw new Error("El respaldo contiene un archivo corrupto.");
  }
  return new Blob([bytes], { type });
}
function referencedFiles(value, found = new Set()) {
  if (!value || typeof value !== "object") return found;
  if (typeof value.fileId === "string") found.add(value.fileId);
  for (const nested of Object.values(value))
    if (nested && typeof nested === "object") referencedFiles(nested, found);
  return found;
}
function rebaseFileReferences(value, userId) {
  if (!value || typeof value !== "object") return;
  if (typeof value.fileId === "string") {
    if (userId) value.storagePath = `${userId}/${value.fileId}`;
    else delete value.storagePath;
  }
  for (const nested of Object.values(value))
    if (nested && typeof nested === "object")
      rebaseFileReferences(nested, userId);
}
export async function exportBackup() {
  const ctx = context();
  let snapshot = await transaction(
    ctx,
    ["records", "files", "conflicts", "meta"],
    "readonly",
    async (s) => {
      const [records, files, conflicts, metadata] = await Promise.all([
        request(s.records.getAll()),
        request(s.files.getAll()),
        request(s.conflicts.getAll()),
        request(s.meta.getAll()),
      ]);
      return { records, files, conflicts, metadata };
    },
  );
  const ids = referencedFiles(
    snapshot.records.filter((r) => !r.deleted).map((r) => r.data),
  );
  const known = new Set(snapshot.files.map((f) => f.id));
  for (const id of ids)
    if (!known.has(id)) {
      try {
        await loadFile(id);
      } catch (e) {
        throw new Error(
          `No se exportó un respaldo incompleto: falta descargar ${id}. ${e.message}`,
        );
      }
    }
  if (!sameContext(ctx))
    throw new Error("La cuenta cambió durante la exportación.");
  snapshot.files = await transaction(ctx, ["files"], "readonly", (s) =>
    request(s.files.getAll()),
  );
  const records = Object.fromEntries(
    KINDS.map((kind) => [
      kind,
      snapshot.records
        .filter((r) => r.kind === kind && !r.deleted)
        .map((r) => r.data),
    ]),
  );
  const files = [];
  for (const file of snapshot.files)
    files.push({
      ...file.meta,
      fileId: file.id,
      base64: await toBase64(file.blob),
    });
  return {
    format: "cfa-study",
    version: 3,
    exportedAt: now(),
    records,
    files,
    conflicts: snapshot.conflicts,
    recovery: snapshot.metadata.filter((m) => m.key.startsWith("resolved:")),
  };
}
export async function importBackup(input) {
  const ctx = context();
  const backup = typeof input === "string" ? JSON.parse(input) : input;
  if (
    backup?.format !== "cfa-study" ||
    backup.version !== 3 ||
    !backup.records ||
    typeof backup.records !== "object"
  ) {
    throw new Error(
      "Este archivo no es un respaldo CFA Study versión 3. Usa el importador para archivos de la plataforma anterior.",
    );
  }
  const records = [];
  for (const [kind, values] of Object.entries(backup.records)) {
    validateKind(kind);
    if (!Array.isArray(values)) throw new Error(`Respaldo inválido: ${kind}.`);
    for (const value of values) {
      const data = dataValue(value);
      rebaseFileReferences(data, ctx.userId);
      records.push({ kind, data });
    }
  }
  if (
    !Array.isArray(backup.files || []) ||
    !Array.isArray(backup.conflicts || []) ||
    !Array.isArray(backup.recovery || [])
  )
    throw new Error(
      "La lista de archivos o versiones del respaldo es inválida.",
    );
  const files = [];
  for (const item of backup.files || []) {
    const id = validateId(item.fileId),
      blob = fromBase64(item.base64, safeFileType(item.type, item.name));
    const hash = await digest(blob);
    if (item.sha256 && hash !== item.sha256)
      throw new Error(
        `El archivo ${item.name || id} no supera la verificación de integridad.`,
      );
    const meta = {
      fileId: id,
      name: String(item.name || id),
      size: blob.size,
      type: blob.type,
      sha256: hash,
    };
    if (ctx.userId) meta.storagePath = `${ctx.userId}/${id}`;
    files.push({ id, blob, meta, uploaded: false });
  }
  const filesById = new Set(files.map((f) => f.id));
  for (const id of referencedFiles(records.map((r) => r.data))) {
    if (!filesById.has(id)) {
      const existing = await transaction(ctx, ["files"], "readonly", (s) =>
        request(s.files.get(id)),
      );
      if (!existing)
        throw new Error(`El respaldo está incompleto: falta el archivo ${id}.`);
    }
  }
  if (!sameContext(ctx))
    throw new Error("La cuenta cambió durante la importación.");
  // Validate everything before the atomic write. Existing matching IDs are restored intentionally.
  await transaction(
    ctx,
    ["records", "outbox", "files", "meta", "conflicts"],
    "readwrite",
    async (s) => {
      for (const file of files) {
        const existing = await request(s.files.get(file.id));
        if (existing && existing.meta.sha256 !== file.meta.sha256)
          throw new Error(
            "Un archivo con el mismo identificador tiene contenido diferente. No se importó el respaldo.",
          );
        if (!existing) s.files.put(file);
      }
      for (const item of records) {
        const entityKey = key(item.kind, item.data.id);
        const previous = await request(s.records.get(entityKey));
        const revision = previous?.revision || 0;
        if (previous)
          s.meta.put({
            key: `resolved:${uuid()}`,
            value: {
              kind: item.kind,
              id: item.data.id,
              local: previous.data,
              choice: "backup-import",
              resolvedAt: now(),
            },
          });
        s.records.put({
          key: entityKey,
          kind: item.kind,
          id: item.data.id,
          data: item.data,
          deleted: false,
          revision,
        });
        s.outbox.put({
          key: entityKey,
          kind: item.kind,
          id: item.data.id,
          data: item.data,
          deleted: false,
          expectedRevision: revision,
          operationId: uuid(),
        });
        const conflict = await request(s.conflicts.get(entityKey));
        if (conflict) {
          conflict.local = item.data;
          conflict.localDeleted = false;
          s.conflicts.put(conflict);
        }
      }
      // Conflicts from another account are recovery evidence, never active writes to that account.
      for (const item of [
        ...(backup.conflicts || []),
        ...(backup.recovery || []),
      ])
        s.meta.put({ key: `resolved:${uuid()}`, value: item });
    },
  );
  await changed(ctx, { type: "import" });
  return { records: records.length, files: files.length };
}
