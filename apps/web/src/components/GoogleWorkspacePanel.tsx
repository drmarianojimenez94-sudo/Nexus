"use client";
import { useEffect, useRef, useState } from "react";
import type {
  GoogleContact,
  GoogleDraftPreview,
  GoogleDriveFile,
  GoogleMailMessage,
} from "@nexus/shared";
import { api } from "@/lib/api";
import { useAuth } from "@/lib/auth-context";
import { useApiData } from "@/lib/useApiData";

type Tab = "mail" | "contacts" | "drive";
const scopeRoot = "https://www.googleapis.com/auth/";
const scopes = [
  "gmail.readonly",
  "gmail.compose",
  "contacts.readonly",
  "drive.readonly",
];

export function GoogleWorkspacePanel() {
  const { user } = useAuth();
  const { data, reload } = useApiData<{
    googleConfigured: boolean;
    integrations: { provider: string; scopes: string | null; status: string }[];
  }>("/connectors/status");
  const [tab, setTab] = useState<Tab>("mail"),
    [q, setQ] = useState("");
  const [mail, setMail] = useState<GoogleMailMessage[]>([]),
    [contacts, setContacts] = useState<GoogleContact[]>([]),
    [files, setFiles] = useState<GoogleDriveFile[]>([]);
  const [selected, setSelected] = useState<GoogleMailMessage | null>(null),
    [document, setDocument] = useState<{
      text: string;
      truncated: boolean;
      file: GoogleDriveFile;
    } | null>(null);
  const [draft, setDraft] = useState<GoogleDraftPreview | null>(null),
    [confirm, setConfirm] = useState(false);
  const [to, setTo] = useState(""),
    [subject, setSubject] = useState(""),
    [body, setBody] = useState("");
  const [busy, setBusy] = useState(false),
    [message, setMessage] = useState(""),
    [nextPage, setNextPage] = useState<string | undefined>();
  const owner = useRef(user?.id);
  owner.current = user?.id;
  const generation = useRef(0);
  useEffect(() => {
    generation.current++;
    setMail([]);
    setContacts([]);
    setFiles([]);
    setSelected(null);
    setDocument(null);
    setDraft(null);
    setConfirm(false);
    setTo("");
    setSubject("");
    setBody("");
    setMessage("");
    setBusy(false);
  }, [user?.id]);
  const google = data?.integrations.find(
    (i) => i.provider === "google_calendar",
  );
  const missing = scopes.filter(
    (s) => !google?.scopes?.split(" ").includes(scopeRoot + s),
  );
  async function run(work: () => Promise<void>) {
    if (busy) return;
    const id = owner.current,
      version = generation.current;
    setBusy(true);
    setMessage("");
    try {
      await work();
    } catch (e) {
      if (id === owner.current && version === generation.current)
        setMessage(
          e instanceof Error ? e.message : "No se pudo completar la operación.",
        );
    } finally {
      if (id === owner.current && version === generation.current)
        setBusy(false);
    }
  }
  function current(id: string | undefined, version: number) {
    return id === owner.current && version === generation.current;
  }
  async function search(page?: string) {
    const id = owner.current,
      version = generation.current;
    const params = new URLSearchParams({ q });
    if (page) params.set("pageToken", page);
    if (tab === "mail") {
      const result = await api.get<{
        messages: GoogleMailMessage[];
        nextPageToken?: string;
      }>(`/google-workspace/mail?${params}`);
      if (current(id, version)) {
        setMail(result.messages);
        setNextPage(result.nextPageToken);
        setSelected(null);
      }
    } else if (tab === "contacts") {
      const result = await api.get<{
        contacts: GoogleContact[];
        nextPageToken?: string;
      }>(`/google-workspace/contacts?${params}`);
      if (current(id, version)) {
        setContacts(result.contacts);
        setNextPage(result.nextPageToken);
      }
    } else {
      const result = await api.get<{
        files: GoogleDriveFile[];
        nextPageToken?: string;
      }>(`/google-workspace/drive?${params}`);
      if (current(id, version)) {
        setFiles(result.files);
        setNextPage(result.nextPageToken);
        setDocument(null);
      }
    }
  }
  async function list(page?: string) {
    await run(() => search(page));
  }
  async function connect() {
    const result = await api.get<{ authUrl: string }>(
      "/connectors/google/authorize?workspace=true",
    );
    window.location.assign(result.authUrl);
  }
  async function createDraft() {
    const id = owner.current,
      version = generation.current;
    const result = await api.post<GoogleDraftPreview>(
      "/google-workspace/drafts",
      { to, subject, body },
    );
    if (current(id, version)) {
      setDraft(result);
      setConfirm(false);
      setMessage(
        "Borrador guardado en Gmail. Revisá el contenido antes de enviarlo.",
      );
    }
  }
  async function send() {
    if (!draft || !confirm) return;
    const id = owner.current,
      version = generation.current;
    try {
      await api.post(
        `/google-workspace/drafts/${encodeURIComponent(draft.id)}/send`,
        { confirmed: true, confirmationToken: draft.confirmationToken },
      );
    } catch (e) {
      if (current(id, version)) {
        setDraft(null);
        setConfirm(false);
      }
      throw e;
    }
    if (current(id, version)) {
      setDraft(null);
      setConfirm(false);
      setBody("");
      setSubject("");
      setMessage("Correo enviado.");
    }
  }
  const button =
    "rounded-xl border border-nexus-border px-3 py-2 text-sm disabled:opacity-40";
  const input =
    "w-full rounded-xl border border-nexus-border bg-nexus-bg p-3 text-sm";
  return (
    <section id="google" className="glass-panel scroll-mt-4 space-y-4 p-4">
      <h2 className="text-lg font-medium">Correo, contactos y archivos</h2>
      <p className="text-sm text-nexus-muted">
        Buscá tus correos, contactos y archivos personales. El contenido se
        consulta cuando lo pedís; no se incorpora al consultorio ni se envía
        automáticamente a la IA.
      </p>
      {!data?.googleConfigured ? (
        <p className="text-sm text-nexus-muted">
          La conexión con Google todavía requiere configuración en el servidor.
        </p>
      ) : (
        <>
          {(missing.length > 0 || google?.status !== "CONNECTED") && (
            <div className="space-y-2">
              <p className="text-sm">
                Para habilitar estas herramientas, autorizá lectura de Gmail,
                contactos y Drive, y creación y envío de borradores. Google
                mostrará cada permiso.
              </p>
              <button
                className={button}
                disabled={busy}
                onClick={() => void run(connect)}
              >
                Conectar o ampliar permisos de Google
              </button>
              <button
                className={button}
                disabled={busy}
                onClick={() => void reload()}
              >
                Actualizar estado
              </button>
            </div>
          )}
          <div
            className="flex flex-wrap gap-2"
            role="tablist"
            aria-label="Herramientas Google"
          >
            {(["mail", "contacts", "drive"] as Tab[]).map((t) => (
              <button
                key={t}
                role="tab"
                aria-selected={tab === t}
                className={button}
                disabled={busy}
                onClick={() => {
                  generation.current++;
                  setTab(t);
                  setQ("");
                  setNextPage(undefined);
                  setMessage("");
                }}
              >
                {{ mail: "Gmail", contacts: "Contactos", drive: "Drive" }[t]}
              </button>
            ))}
          </div>
          <form
            className="flex gap-2"
            onSubmit={(e) => {
              e.preventDefault();
              void list();
            }}
          >
            <input
              className={input}
              aria-label="Buscar en Google"
              placeholder={
                tab === "mail"
                  ? "Buscar correos (admite filtros de Gmail)"
                  : tab === "drive"
                    ? "Nombre del archivo"
                    : "Nombre, correo o teléfono"
              }
              value={q}
              onChange={(e) => setQ(e.target.value)}
              maxLength={300}
            />
            <button className={button} disabled={busy} type="submit">
              Buscar
            </button>
          </form>
          {tab === "mail" && (
            <>
              <ul className="space-y-2">
                {mail.map((m) => (
                  <li key={m.id}>
                    <button
                      className="w-full rounded-xl border border-nexus-border p-3 text-left"
                      disabled={busy}
                      onClick={() =>
                        void run(async () => {
                          const id = owner.current,
                            version = generation.current;
                          const result = await api.get<GoogleMailMessage>(
                            `/google-workspace/mail/${encodeURIComponent(m.id)}`,
                          );
                          if (current(id, version)) setSelected(result);
                        })
                      }
                    >
                      <span className="block break-words font-medium">
                        {m.subject || "Sin asunto"}
                      </span>
                      <span className="block break-words text-xs text-nexus-muted">
                        {m.from}
                      </span>
                      <span className="block break-words text-sm">
                        {m.snippet}
                      </span>
                    </button>
                  </li>
                ))}
              </ul>
              {selected && (
                <article className="space-y-2 rounded-xl border border-nexus-border p-3">
                  <h3 className="break-words font-medium">
                    {selected.subject}
                  </h3>
                  <p className="break-words text-sm">
                    De: {selected.from} · Para: {selected.to}
                  </p>
                  <pre className="whitespace-pre-wrap break-words font-sans text-sm">
                    {selected.text ||
                      selected.snippet ||
                      "Este correo no contiene texto simple. Abrilo en Gmail para ver el formato completo."}
                  </pre>
                </article>
              )}
              <form
                className="space-y-3 border-t border-nexus-border pt-3"
                onSubmit={(e) => {
                  e.preventDefault();
                  void run(createDraft);
                }}
              >
                <h3 className="font-medium">Nuevo borrador</h3>
                <label className="block text-sm">
                  Destinatario
                  <input
                    type="email"
                    required
                    className={input}
                    value={to}
                    onChange={(e) => {
                      setTo(e.target.value);
                      setDraft(null);
                      setConfirm(false);
                    }}
                  />
                </label>
                <label className="block text-sm">
                  Asunto
                  <input
                    required
                    maxLength={200}
                    className={input}
                    value={subject}
                    onChange={(e) => {
                      setSubject(e.target.value);
                      setDraft(null);
                      setConfirm(false);
                    }}
                  />
                </label>
                <label className="block text-sm">
                  Mensaje
                  <textarea
                    required
                    maxLength={50000}
                    rows={5}
                    className={input}
                    value={body}
                    onChange={(e) => {
                      setBody(e.target.value);
                      setDraft(null);
                      setConfirm(false);
                    }}
                  />
                </label>
                <button className={button} disabled={busy} type="submit">
                  Guardar borrador en Gmail
                </button>
              </form>
              {draft && (
                <div className="space-y-3 rounded-xl border border-nexus-border p-3">
                  <h3 className="font-medium">Revisión antes de enviar</h3>
                  <p className="break-words">Para: {draft.to}</p>
                  <p className="break-words">Asunto: {draft.subject}</p>
                  <pre className="whitespace-pre-wrap break-words font-sans text-sm">
                    {draft.text}
                  </pre>
                  <label className="flex items-start gap-2 text-sm">
                    <input
                      type="checkbox"
                      checked={confirm}
                      onChange={(e) => setConfirm(e.target.checked)}
                    />
                    Confirmo enviar este contenido a {draft.to}.
                  </label>
                  <button
                    disabled={busy || !confirm}
                    className={button}
                    onClick={() => void run(send)}
                  >
                    Enviar correo confirmado
                  </button>
                  <button
                    className={button}
                    disabled={busy}
                    onClick={() => {
                      setDraft(null);
                      setConfirm(false);
                    }}
                  >
                    Dejar como borrador
                  </button>
                </div>
              )}
            </>
          )}
          {tab === "contacts" && (
            <ul className="space-y-2">
              {contacts.map((c) => (
                <li
                  key={c.id}
                  className="space-y-1 rounded-xl border border-nexus-border p-3"
                >
                  <p className="break-words font-medium">{c.name}</p>
                  <p className="break-words text-sm">{c.organization}</p>
                  <p className="break-words text-sm">{c.phones.join(" · ")}</p>
                  {c.emails.map((email) => (
                    <button
                      className={`${button} break-all`}
                      key={email}
                      disabled={busy}
                      onClick={() => {
                        setTo(email);
                        setTab("mail");
                        setDraft(null);
                        setConfirm(false);
                      }}
                    >
                      {email} · Redactar
                    </button>
                  ))}
                </li>
              ))}
            </ul>
          )}
          {tab === "drive" && (
            <>
              <ul className="space-y-2">
                {files.map((f) => (
                  <li
                    key={f.id}
                    className="space-y-2 rounded-xl border border-nexus-border p-3"
                  >
                    <p className="break-words font-medium">{f.name}</p>
                    <p className="break-words text-xs text-nexus-muted">
                      {f.mimeType} ·{" "}
                      {f.modifiedTime
                        ? new Date(f.modifiedTime).toLocaleDateString()
                        : ""}
                    </p>
                    <button
                      disabled={busy}
                      className={button}
                      onClick={() =>
                        void run(async () => {
                          const id = owner.current,
                            version = generation.current;
                          const result = await api.get<{
                            text: string;
                            truncated: boolean;
                            file: GoogleDriveFile;
                          }>(
                            `/google-workspace/drive/${encodeURIComponent(f.id)}/text`,
                          );
                          if (current(id, version)) setDocument(result);
                        })
                      }
                    >
                      Leer texto
                    </button>
                    <a
                      className={`${button} inline-block`}
                      href={`https://drive.google.com/file/d/${encodeURIComponent(f.id)}/view`}
                      target="_blank"
                      rel="noreferrer"
                    >
                      Abrir en Drive
                    </a>
                  </li>
                ))}
              </ul>
              {document && (
                <article className="rounded-xl border border-nexus-border p-3">
                  <h3 className="break-words font-medium">
                    {document.file.name}
                  </h3>
                  {document.truncated && (
                    <p className="text-sm text-nexus-warning">
                      Vista limitada a los primeros 100 KB.
                    </p>
                  )}
                  <pre className="whitespace-pre-wrap break-words font-sans text-sm">
                    {document.text}
                  </pre>
                </article>
              )}
            </>
          )}
          {nextPage && (
            <button
              className={button}
              disabled={busy}
              onClick={() => void list(nextPage)}
            >
              Página siguiente
            </button>
          )}
        </>
      )}
      {busy && (
        <p role="status" className="text-sm text-nexus-muted">
          Consultando Google…
        </p>
      )}
      {message && (
        <p role="status" className="break-words text-sm">
          {message}
        </p>
      )}
    </section>
  );
}
