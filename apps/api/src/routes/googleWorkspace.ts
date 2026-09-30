import { Router } from "express";
import { z } from "zod";
import { googleMailDraftSchema, type GoogleDriveFile } from "@nexus/shared";
import { authenticate } from "../middleware/authenticate.js";
import { asyncHandler } from "../middleware/asyncHandler.js";
import { HttpError } from "../middleware/errorHandler.js";
import { GOOGLE_SCOPES } from "../lib/googleCalendar.js";
import {
  type MailPayload,
  draftRaw,
  googleJSON,
  googleRequest,
  limitedText,
  mailMessage,
  sendConfirmation,
  verifyConfirmation,
  workspaceToken,
} from "../lib/googleWorkspace.js";
import { recordAudit } from "../lib/audit.js";
export const googleWorkspaceRouter = Router();
googleWorkspaceRouter.use(authenticate, (req, res, next) => {
  res.setHeader("Cache-Control", "no-store");
  if (req.get("X-Nexus-Owner") !== req.userId)
    return next(
      new HttpError(
        409,
        "La cuenta cambió. Recargá Nexus antes de usar Google.",
      ),
    );
  next();
});
const query = z.object({
  q: z.string().max(300).default(""),
  pageToken: z.string().max(2000).optional(),
});
const idSchema = z.string().regex(/^[a-zA-Z0-9_-]{1,200}$/);
const gmail = "https://gmail.googleapis.com/gmail/v1/users/me";
const sending = new Set<string>();
googleWorkspaceRouter.get(
  "/mail",
  asyncHandler(async (req, res) => {
    const i = query.parse(req.query),
      t = await workspaceToken(req.userId!, GOOGLE_SCOPES.gmailRead),
      p = new URLSearchParams({ maxResults: "15", q: i.q });
    if (i.pageToken) p.set("pageToken", i.pageToken);
    const data = (await googleJSON(t, `${gmail}/messages?${p}`)) as {
      messages?: { id: string }[];
      nextPageToken?: string;
    };
    const messages = await Promise.all(
      (data.messages ?? [])
        .slice(0, 15)
        .map(async (m) =>
          mailMessage(
            (await googleJSON(
              t,
              `${gmail}/messages/${encodeURIComponent(m.id)}?format=metadata&metadataHeaders=Subject&metadataHeaders=From&metadataHeaders=To`,
            )) as MailPayload,
          ),
        ),
    );
    res.json({ messages, nextPageToken: data.nextPageToken });
  }),
);
googleWorkspaceRouter.get(
  "/mail/:id",
  asyncHandler(async (req, res) => {
    const id = idSchema.parse(req.params.id),
      t = await workspaceToken(req.userId!, GOOGLE_SCOPES.gmailRead);
    res.json(
      mailMessage(
        (await googleJSON(
          t,
          `${gmail}/messages/${id}?format=full`,
        )) as MailPayload,
      ),
    );
  }),
);
googleWorkspaceRouter.post(
  "/drafts",
  asyncHandler(async (req, res) => {
    const i = googleMailDraftSchema.parse(req.body),
      t = await workspaceToken(req.userId!, GOOGLE_SCOPES.gmailCompose),
      raw = draftRaw(i);
    const d = (await googleJSON(t, `${gmail}/drafts`, {
      method: "POST",
      body: JSON.stringify({ message: { raw } }),
    })) as { id: string };
    // Gmail may canonicalize MIME. Sign the stored representation, never an assumed byte copy.
    const stored = (await googleJSON(
      t,
      `${gmail}/drafts/${idSchema.parse(d.id)}?format=raw`,
    )) as { message?: { raw?: string } };
    if (!stored.message?.raw)
      throw new HttpError(
        502,
        "Borrador creado en Gmail, pero no se pudo verificar. Revisalo en Gmail.",
      );
    await recordAudit({
      userId: req.userId!,
      action: "connector.gmail.draft.create",
      entityType: "gmail_draft",
      entityId: d.id,
    });
    res.status(201).json({
      id: d.id,
      to: i.to,
      subject: i.subject,
      text: i.body,
      confirmationToken: sendConfirmation(
        req.userId!,
        d.id,
        stored.message.raw,
      ),
    });
  }),
);
googleWorkspaceRouter.post(
  "/drafts/:id/send",
  asyncHandler(async (req, res) => {
    const id = idSchema.parse(req.params.id),
      i = z
        .object({
          confirmed: z.literal(true),
          confirmationToken: z.string().max(3000),
        })
        .parse(req.body),
      t = await workspaceToken(req.userId!, GOOGLE_SCOPES.gmailCompose),
      key = `${req.userId}:${id}`;
    if (sending.has(key))
      throw new HttpError(409, "Este borrador ya se está enviando.");
    sending.add(key);
    try {
      const d = (await googleJSON(t, `${gmail}/drafts/${id}?format=raw`)) as {
        message?: { raw?: string };
      };
      if (!d.message?.raw)
        throw new HttpError(409, "No se pudo verificar el borrador.");
      verifyConfirmation(i.confirmationToken, req.userId!, id, d.message.raw);
      // Supplying the exact reviewed raw snapshot prevents concurrent Gmail edits from changing recipients/content.
      const sent = (await googleJSON(t, `${gmail}/drafts/send`, {
        method: "POST",
        body: JSON.stringify({ id, message: { raw: d.message.raw } }),
      })) as { id: string };
      await recordAudit({
        userId: req.userId!,
        action: "connector.gmail.send.confirmed",
        entityType: "gmail_message",
        entityId: sent.id,
      }).catch(() => console.error("Google send audit could not be stored"));
      res.json({ id: sent.id });
    } finally {
      sending.delete(key);
    }
  }),
);
interface Person {
  resourceName: string;
  names?: { displayName: string }[];
  emailAddresses?: { value: string }[];
  phoneNumbers?: { value: string }[];
  organizations?: { name: string }[];
}
googleWorkspaceRouter.get(
  "/contacts",
  asyncHandler(async (req, res) => {
    const i = query.parse(req.query),
      t = await workspaceToken(req.userId!, GOOGLE_SCOPES.contacts),
      mask = "names,emailAddresses,phoneNumbers,organizations",
      root = "https://people.googleapis.com/v1/people";
    const p = new URLSearchParams(
      i.q
        ? { query: i.q, readMask: mask, pageSize: "20" }
        : {
            personFields: mask,
            pageSize: "30",
            sortOrder: "FIRST_NAME_ASCENDING",
          },
    );
    if (i.pageToken && !i.q) p.set("pageToken", i.pageToken);
    if (i.q)
      await googleRequest(
        t,
        `${root}:searchContacts?${new URLSearchParams({ query: "", readMask: mask, pageSize: "1" })}`,
      );
    const data = (await googleJSON(
      t,
      `${root}${i.q ? ":searchContacts" : "/me/connections"}?${p}`,
    )) as {
      connections?: Person[];
      results?: { person: Person }[];
      nextPageToken?: string;
    };
    res.json({
      contacts:
        (i.q
          ? data.results?.map((r) => r.person)
          : (data.connections ?? [])
        )?.map((p) => ({
          id: p.resourceName,
          name: p.names?.[0]?.displayName ?? "Sin nombre",
          emails: p.emailAddresses?.map((e) => e.value) ?? [],
          phones: p.phoneNumbers?.map((e) => e.value) ?? [],
          organization: p.organizations?.[0]?.name ?? "",
        })) ?? [],
      nextPageToken: data.nextPageToken,
    });
  }),
);
googleWorkspaceRouter.get(
  "/drive",
  asyncHandler(async (req, res) => {
    const i = query.parse(req.query),
      t = await workspaceToken(req.userId!, GOOGLE_SCOPES.drive),
      escaped = i.q.replace(/\\/g, "\\\\").replace(/'/g, "\\'");
    const p = new URLSearchParams({
      q: `trashed = false${escaped ? ` and name contains '${escaped}'` : ""}`,
      pageSize: "20",
      fields:
        "files(id,name,mimeType,modifiedTime,webViewLink,size),nextPageToken",
      orderBy: "modifiedTime desc",
    });
    if (i.pageToken) p.set("pageToken", i.pageToken);
    res.json(
      await googleJSON(t, `https://www.googleapis.com/drive/v3/files?${p}`),
    );
  }),
);
googleWorkspaceRouter.get(
  "/drive/:id/text",
  asyncHandler(async (req, res) => {
    const id = idSchema.parse(req.params.id),
      t = await workspaceToken(req.userId!, GOOGLE_SCOPES.drive),
      root = `https://www.googleapis.com/drive/v3/files/${id}`;
    const file = (await googleJSON(
      t,
      `${root}?fields=id,name,mimeType,size`,
    )) as GoogleDriveFile;
    let url: string;
    if (file.mimeType === "application/vnd.google-apps.document")
      url = `${root}/export?mimeType=text%2Fplain`;
    else if (
      ["text/plain", "text/markdown", "text/csv", "application/json"].includes(
        file.mimeType,
      )
    )
      url = `${root}?alt=media`;
    else
      throw new HttpError(
        415,
        "La lectura admite Google Docs, texto, Markdown, CSV y JSON. Para otros archivos, abrilos en Drive.",
      );
    res.json({ file, ...(await limitedText(await googleRequest(t, url))) });
  }),
);
