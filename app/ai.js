import { getClient } from "./auth.js";

export const AI_LIMITS = Object.freeze({ characters: 40000, pages: 50 });

/** Explicit, authenticated generation; this call transmits selected source text. */
export async function generateStudyMaterial({
  text = "",
  pages,
  mode = "all",
} = {}) {
  const client = getClient();
  if (!client)
    throw new Error("Configura Supabase e inicia sesión para utilizar la IA.");
  const { data: session, error: sessionError } = await client.auth.getSession();
  if (sessionError || !session.session?.access_token)
    throw new Error("Inicia sesión antes de generar material con IA.");
  if (!["all", "summary", "cards", "questions"].includes(mode))
    throw new Error("Tipo de material no válido.");
  const sourcePages =
    Array.isArray(pages) && pages.length
      ? pages
          .map((page) => ({
            number: Number(page.number),
            text: String(page.text || "").trim(),
          }))
          .filter((page) => page.text)
      : [{ number: 1, text: String(text).trim() }];
  if (
    !sourcePages.length ||
    sourcePages.reduce((sum, page) => sum + page.text.length, 0) < 100
  )
    throw new Error(
      "Selecciona al menos 100 caracteres de texto antes de generar material.",
    );
  if (
    sourcePages.length > AI_LIMITS.pages ||
    sourcePages.some(
      (page) => !Number.isInteger(page.number) || page.number < 1,
    )
  )
    throw new Error(
      "Selecciona hasta 50 páginas con números válidos por solicitud.",
    );
  if (
    sourcePages.reduce((sum, page) => sum + page.text.length, 0) >
    AI_LIMITS.characters
  )
    throw new Error(
      "El lote supera 40.000 caracteres. Selecciona menos páginas o una sola lección.",
    );
  const functionName = globalThis.CFA_CONFIG?.aiFunction || "study-ai";
  const { data, error } = await client.functions.invoke(functionName, {
    body: { pages: sourcePages, mode },
  });
  if (error) {
    let message = "";
    try {
      message = (await error.context?.json())?.error || "";
    } catch {
      /* Network/CORS errors have no JSON body. */
    }
    throw new Error(
      message ||
        "No se pudo generar el material. Revisa la sesión y la configuración de study-ai; consulta docs/GUIA_CONFIGURACION.md.",
    );
  }
  if (data?.error) throw new Error(data.error);
  if (
    !data ||
    typeof data.summary !== "string" ||
    !Array.isArray(data.cards) ||
    !Array.isArray(data.questions)
  )
    throw new Error(
      "El servidor devolvió una respuesta incompleta. No se guardó material.",
    );
  return data;
}
