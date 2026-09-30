import crypto from "node:crypto";
import { prisma } from "./prisma.js";
import { env } from "./env.js";
import { decryptToken, encryptToken } from "./tokenCrypto.js";
import { refreshGoogleAccessToken } from "./googleCalendar.js";
import { HttpError } from "../middleware/errorHandler.js";
import type { GoogleMailMessage } from "@nexus/shared";
const inflight = new Map<string, Promise<string>>();
export async function workspaceToken(
  userId: string,
  scope: string,
): Promise<string> {
  const i = await prisma.integration.findUnique({
    where: { userId_provider: { userId, provider: "google_calendar" } },
  });
  if (!i?.accessToken || i.status !== "CONNECTED")
    throw new HttpError(409, "Conectá Google desde Ajustes.");
  if (!i.scopes?.split(" ").includes(scope))
    throw new HttpError(
      403,
      "Falta este permiso. Ampliá los permisos de Google desde Ajustes.",
    );
  if (!i.expiresAt || i.expiresAt.getTime() > Date.now() + 60000)
    return decryptToken(i.accessToken);
  if (!i.refreshToken)
    throw new HttpError(409, "Reconectá Google para renovar el acceso.");
  let pending = inflight.get(i.id);
  if (!pending) {
    pending = (async () => {
      try {
        const t = await refreshGoogleAccessToken(decryptToken(i.refreshToken!));
        const updated = await prisma.integration.updateMany({
          where: { id: i.id, userId, status: "CONNECTED" },
          data: {
            accessToken: encryptToken(t.access_token),
            expiresAt: new Date(Date.now() + t.expires_in * 1000),
          },
        });
        if (!updated.count) throw new Error();
        return t.access_token;
      } catch {
        throw new HttpError(
          409,
          "No se pudo renovar Google. Reconectá la cuenta.",
        );
      } finally {
        inflight.delete(i.id);
      }
    })();
    inflight.set(i.id, pending);
  }
  return pending;
}
export async function googleRequest(
  token: string,
  url: string,
  options: RequestInit = {},
): Promise<Response> {
  let res: Response;
  try {
    res = await fetch(url, {
      ...options,
      redirect: "error",
      signal: AbortSignal.timeout(15000),
      headers: {
        Authorization: `Bearer ${token}`,
        "Content-Type": "application/json",
        ...options.headers,
      },
    });
  } catch {
    throw new HttpError(
      502,
      "Google no respondió. Si estabas enviando, revisá Enviados antes de reintentar.",
    );
  }
  if (!res.ok) {
    if (res.status === 401 || res.status === 403)
      throw new HttpError(
        403,
        "Google rechazó el acceso. Revisá permisos y reconectá la cuenta.",
      );
    if (res.status === 404)
      throw new HttpError(404, "El elemento ya no está disponible en Google.");
    throw new HttpError(
      502,
      "Google no completó la operación. Si estabas enviando, revisá Enviados antes de reintentar.",
    );
  }
  return res;
}
export async function limitedText(
  res: Response,
  limit = 100000,
): Promise<{ text: string; truncated: boolean }> {
  const reader = res.body?.getReader();
  if (!reader) return { text: "", truncated: false };
  const chunks: Uint8Array[] = [];
  let total = 0,
    truncated = false;
  try {
    while (true) {
      const next = await reader.read();
      if (next.done) break;
      chunks.push(next.value.slice(0, Math.max(0, limit - total)));
      total += next.value.length;
      if (total > limit) {
        truncated = true;
        break;
      }
    }
  } finally {
    await reader.cancel().catch(() => {});
  }
  return { text: Buffer.concat(chunks).toString("utf8"), truncated };
}
export async function googleJSON(
  token: string,
  url: string,
  options: RequestInit = {},
): Promise<unknown> {
  const result = await limitedText(
    await googleRequest(token, url, options),
    2_000_000,
  );
  if (result.truncated)
    throw new HttpError(
      413,
      "El contenido supera el límite de lectura de Nexus. Abrilo en Google.",
    );
  try {
    return JSON.parse(result.text);
  } catch {
    throw new HttpError(502, "Google devolvió una respuesta inválida.");
  }
}
export interface MailPayload {
  id: string;
  snippet?: string;
  payload?: Part;
}
interface Part {
  mimeType?: string;
  body?: { data?: string };
  parts?: Part[];
  headers?: { name: string; value: string }[];
}
export function mailMessage(m: MailPayload): GoogleMailMessage {
  const header = (name: string) =>
    m.payload?.headers?.find((h) => h.name.toLowerCase() === name)?.value ?? "";
  const parts: string[] = [];
  function collect(p?: Part, depth = 0) {
    if (!p || depth > 10) return;
    if (p.mimeType === "text/plain" && p.body?.data)
      parts.push(Buffer.from(p.body.data, "base64url").toString("utf8"));
    p.parts?.slice(0, 50).forEach((x) => collect(x, depth + 1));
  }
  collect(m.payload);
  return {
    id: m.id,
    subject: header("subject"),
    from: header("from"),
    to: header("to"),
    snippet: m.snippet ?? "",
    text: parts.join("\n").slice(0, 100000),
  };
}
export function draftRaw(i: {
  to: string;
  subject: string;
  body: string;
}): string {
  return Buffer.from(
    `To: ${i.to}\r\nSubject: =?UTF-8?B?${Buffer.from(i.subject).toString("base64")}?=\r\nMIME-Version: 1.0\r\nContent-Type: text/plain; charset=UTF-8\r\nContent-Transfer-Encoding: base64\r\n\r\n${
      Buffer.from(i.body)
        .toString("base64")
        .match(/.{1,76}/g)
        ?.join("\r\n") ?? ""
    }`,
  ).toString("base64url");
}
const digest = (raw: string) =>
  crypto.createHash("sha256").update(raw).digest("hex");
export function sendConfirmation(
  userId: string,
  draftId: string,
  raw: string,
): string {
  const p = Buffer.from(
    JSON.stringify({
      userId,
      draftId,
      digest: digest(raw),
      expires: Date.now() + 600000,
    }),
  ).toString("base64url");
  return `${p}.${crypto.createHmac("sha256", env.authSecret).update(`google-mail-send:${p}`).digest("base64url")}`;
}
export function verifyConfirmation(
  token: string,
  userId: string,
  draftId: string,
  raw: string,
): void {
  try {
    const [p, s] = token.split(".");
    const expected = crypto
        .createHmac("sha256", env.authSecret)
        .update(`google-mail-send:${p}`)
        .digest(),
      actual = Buffer.from(s ?? "", "base64url");
    if (
      actual.length !== expected.length ||
      !crypto.timingSafeEqual(expected, actual)
    )
      throw new Error();
    const data = JSON.parse(Buffer.from(p!, "base64url").toString());
    if (
      data.userId !== userId ||
      data.draftId !== draftId ||
      data.digest !== digest(raw) ||
      data.expires < Date.now()
    )
      throw new Error();
  } catch {
    throw new HttpError(
      409,
      "El borrador cambió o la confirmación venció. Revisalo en Gmail y creá un nuevo borrador antes de enviar.",
    );
  }
}
