import { createClient } from "@/lib/supabase/server";

const ADMIN_EMAIL = "derbycafe33@gmail.com";
const MAX_QUESTION_LENGTH = 1500;
const MAX_WEBHOOK_RESPONSE_BYTES = 64 * 1024;

function jsonError(message: string, status: number) {
  return Response.json({ error: message }, { status });
}

function isAllowedOrigin(request: Request) {
  const origin = request.headers.get("origin");
  if (!origin) return true;
  const host = request.headers.get("x-forwarded-host") ?? request.headers.get("host");
  try {
    return Boolean(host) && new URL(origin).host === host;
  } catch {
    return false;
  }
}

export async function POST(request: Request) {
  if (!isAllowedOrigin(request)) return jsonError("Requête d’origine refusée.", 403);

  const supabase = await createClient();
  const { data, error: authError } = await supabase.auth.getClaims();
  const email = typeof data?.claims?.email === "string" ? data.claims.email.toLowerCase() : "";
  if (authError || email !== ADMIN_EMAIL) return jsonError("Authentification administrateur requise.", 401);

  const contentType = request.headers.get("content-type") ?? "";
  if (!contentType.toLowerCase().includes("application/json")) {
    return jsonError("Le message doit être envoyé au format JSON.", 415);
  }
  const contentLength = Number(request.headers.get("content-length") ?? 0);
  if (contentLength > 8 * 1024) return jsonError("Le message dépasse la taille autorisée.", 413);

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return jsonError("Le corps de la requête est invalide.", 400);
  }
  if (typeof body !== "object" || body === null || !("question" in body) || typeof body.question !== "string") {
    return jsonError("Saisissez une question pour l’assistant.", 400);
  }
  const question = body.question.trim();
  if (!question || question.length > MAX_QUESTION_LENGTH) {
    return jsonError(`La question doit contenir entre 1 et ${MAX_QUESTION_LENGTH} caractères.`, 400);
  }

  const webhookUrl = process.env.N8N_CHAT_WEBHOOK_URL;
  const webhookToken = process.env.N8N_CHAT_WEBHOOK_TOKEN;
  if (!webhookUrl || !webhookToken) {
    return jsonError("Le webhook IA n8n n’est pas configuré côté serveur.", 503);
  }

  let endpoint: URL;
  try {
    endpoint = new URL(webhookUrl);
  } catch {
    return jsonError("L’URL du webhook IA n8n est invalide.", 503);
  }
  const localHost = endpoint.hostname === "localhost" || endpoint.hostname === "127.0.0.1" || endpoint.hostname === "::1";
  if (endpoint.protocol !== "https:" && !(endpoint.protocol === "http:" && localHost)) {
    return jsonError("Le webhook IA doit utiliser HTTPS (sauf en local).", 503);
  }

  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 25_000);
  let response: Response;
  let responseText: string;
  try {
    response = await fetch(endpoint, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${webhookToken}`,
      },
      body: JSON.stringify({ question }),
      cache: "no-store",
      redirect: "error",
      signal: controller.signal,
    });
    if (!response.ok) return jsonError(`Le webhook n8n a répondu avec le statut ${response.status}.`, 502);
    const contentLengthHeader = response.headers.get("content-length");
    if (contentLengthHeader && Number(contentLengthHeader) > MAX_WEBHOOK_RESPONSE_BYTES) {
      return jsonError("La réponse du webhook dépasse la taille autorisée.", 502);
    }
    responseText = await response.text();
  } catch (fetchError) {
    if (fetchError instanceof Error && fetchError.name === "AbortError") {
      return jsonError("Le webhook n8n n’a pas répondu dans les 25 secondes.", 504);
    }
    return jsonError("Connexion au webhook n8n impossible.", 502);
  } finally {
    clearTimeout(timeout);
  }
  if (new TextEncoder().encode(responseText).byteLength > MAX_WEBHOOK_RESPONSE_BYTES) {
    return jsonError("La réponse du webhook dépasse la taille autorisée.", 502);
  }
  let result: unknown;
  try {
    result = JSON.parse(responseText);
  } catch {
    return jsonError("Le webhook n8n doit retourner un objet JSON contenant answer.", 502);
  }
  if (typeof result !== "object" || result === null || !("answer" in result) ||
      typeof result.answer !== "string" || !result.answer.trim()) {
    return jsonError("La réponse du webhook n8n ne contient pas de réponse answer valide.", 502);
  }

  return Response.json({ answer: result.answer.trim() }, { headers: { "Cache-Control": "no-store" } });
}
