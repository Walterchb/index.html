/* Authentication is optional: without config the application stays local. */
let client = null;
let user = null;
let initialization = null;
let pendingRecovery = null;
const listeners = new Set();

const config = () => globalThis.CFA_CONFIG || {};
export function isConfigured() {
  const c = config();
  return Boolean(c.supabaseUrl?.trim() && c.supabaseAnonKey?.trim());
}
export function getClient() {
  return client;
}
export function getUser() {
  return user;
}
export function onAuthChange(callback) {
  listeners.add(callback);
  if (pendingRecovery) {
    const recoveryUser = pendingRecovery;
    pendingRecovery = null;
    setTimeout(() => {
      try {
        if (listeners.has(callback))
          Promise.resolve(callback(recoveryUser, "PASSWORD_RECOVERY")).catch(
            console.error,
          );
      } catch (e) {
        console.error(e);
      }
    }, 0);
  }
  return () => listeners.delete(callback);
}
function notify(event) {
  const snapshot = user;
  // Do not await Supabase calls inside onAuthStateChange (SDK lock).
  setTimeout(() => {
    if (event === "PASSWORD_RECOVERY" && !listeners.size)
      pendingRecovery = snapshot;
    listeners.forEach((fn) => {
      try {
        Promise.resolve(fn(snapshot, event)).catch(console.error);
      } catch (e) {
        console.error(e);
      }
    });
  }, 0);
}
function publicKeyOnly(key) {
  if (key.startsWith("sb_secret_"))
    throw new Error(
      "Usa la clave pública de Supabase. Nunca uses una clave secreta en config.js.",
    );
  try {
    const payload = JSON.parse(
      atob((key.split(".")[1] || "").replace(/-/g, "+").replace(/_/g, "/")),
    );
    if (payload.role === "service_role") throw new Error("SERVICE_ROLE");
  } catch (e) {
    if (e.message === "SERVICE_ROLE")
      throw new Error(
        "La clave service_role no debe publicarse. Usa la clave anon o publishable.",
      );
  }
}
export async function initAuth() {
  if (!isConfigured()) return null;
  if (!initialization)
    initialization = (async () => {
      const c = config();
      const url = new URL(c.supabaseUrl.trim());
      if (
        url.protocol !== "https:" &&
        !["localhost", "127.0.0.1"].includes(url.hostname)
      ) {
        throw new Error("La URL de Supabase debe usar HTTPS.");
      }
      publicKeyOnly(c.supabaseAnonKey.trim());
      const { createClient } = await import("../vendor/supabase.js");
      client = createClient(
        url.href.replace(/\/$/, ""),
        c.supabaseAnonKey.trim(),
        {
          auth: {
            persistSession: true,
            autoRefreshToken: true,
            detectSessionInUrl: true,
            storageKey: "cfa-study-auth-v3",
          },
        },
      );
      client.auth.onAuthStateChange((event, session) => {
        user = session?.user || null;
        notify(event);
      });
      const { data, error } = await client.auth.getSession();
      if (error) throw error;
      user = data.session?.user || null;
      return user;
    })().catch((error) => {
      initialization = null;
      throw error;
    });
  await initialization;
  return user;
}
function requireClient() {
  if (!client)
    throw new Error(
      "Completa supabaseUrl y supabaseAnonKey en config.js y recarga la página.",
    );
  return client;
}
function emailValue(email) {
  const value = String(email || "")
    .trim()
    .toLowerCase();
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value))
    throw new Error("Escribe un correo válido.");
  return value;
}
function passwordValue(password) {
  if (typeof password !== "string" || password.length < 8)
    throw new Error("La contraseña debe tener al menos 8 caracteres.");
  return password;
}
function redirectURL() {
  const loc = globalThis.location;
  if (!loc || !/^https?:$/.test(loc.protocol))
    throw new Error("Abre la aplicación desde su URL web para usar el login.");
  return `${loc.origin}${loc.pathname}`;
}
function friendly(error) {
  const messages = {
    invalid_credentials: "Correo o contraseña incorrectos.",
    email_not_confirmed:
      "Confirma tu correo con el enlace enviado por Supabase.",
    over_email_send_rate_limit:
      "Se alcanzó el límite de correos. Espera unos minutos y vuelve a intentarlo.",
    user_already_exists:
      "Este correo ya tiene una cuenta. Inicia sesión o recupera tu contraseña.",
    signup_disabled: "El registro está desactivado en tu proyecto Supabase.",
  };
  return new Error(
    messages[error.code] ||
      error.message ||
      "No se pudo completar la autenticación.",
  );
}
export async function signIn(email, password) {
  await initAuth();
  const { data, error } = await requireClient().auth.signInWithPassword({
    email: emailValue(email),
    password,
  });
  if (error) throw friendly(error);
  user = data.user;
  return data;
}
export async function signUp(email, password) {
  await initAuth();
  const { data, error } = await requireClient().auth.signUp({
    email: emailValue(email),
    password: passwordValue(password),
    options: { emailRedirectTo: redirectURL() },
  });
  if (error) throw friendly(error);
  return data;
}
export async function signOut() {
  const { error } = await requireClient().auth.signOut({ scope: "local" });
  if (error) throw friendly(error);
  user = null;
}
export async function resetPassword(email) {
  await initAuth();
  const { error } = await requireClient().auth.resetPasswordForEmail(
    emailValue(email),
    { redirectTo: redirectURL() },
  );
  if (error) throw friendly(error);
  return true;
}
export async function updatePassword(password) {
  const { data, error } = await requireClient().auth.updateUser({
    password: passwordValue(password),
  });
  if (error) throw friendly(error);
  return data;
}
