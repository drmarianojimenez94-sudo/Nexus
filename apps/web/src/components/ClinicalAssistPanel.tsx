"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import Link from "next/link";
import type { GuidelineMatch, Habit } from "@nexus/verticals";
import { api } from "@/lib/api";

export interface ClinicalSuggestions {
  summary: string;
  considerations: string[];
  workup: string[];
  treatmentOptions: Array<{ option: string; rationale: string; source: string }>;
  followupChecks: string[];
  redFlags: string[];
  questions: string[];
}

export interface AssistResponse {
  guidelines: GuidelineMatch[];
  prevention: string[];
  habits: Habit[];
  ai: ClinicalSuggestions | null;
  aiStatus: "ok" | "not_configured" | "disabled" | "error";
  aiProvider: string | null;
  sent: {
    age: number | null;
    sex: string;
    allergies: string;
    medication: string;
    history: string;
    fields: Record<string, string>;
    habits: string[];
  };
}

const DEBOUNCE_MS = 2000;

function List({ title, items, tone }: { title: string; items: string[]; tone?: "alert" }) {
  if (!items.length) return null;
  return (
    <div>
      <h4 className={`text-xs font-semibold uppercase tracking-wider ${tone === "alert" ? "text-nexus-danger" : "text-nexus-muted"}`}>
        {title}
      </h4>
      <ul className="mt-1 list-disc space-y-1 pl-5">
        {items.map((item, i) => (
          <li key={`${i}-${item}`}>{item}</li>
        ))}
      </ul>
    </div>
  );
}

function Block({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <section className="flex flex-col gap-2 border-t border-nexus-border pt-3">
      <h3 className="font-semibold">{title}</h3>
      {children}
    </section>
  );
}

/**
 * Asistente clínico en vivo: mientras se carga la consulta consulta
 * /verticals/medicine/assist (con ~2 s de pausa) y muestra recordatorios de
 * guías, prevención, la conducta habitual del profesional y, si hay IA,
 * sugerencias sobre el caso desidentificado. Nunca escribe en la consulta.
 */
export function ClinicalAssistPanel({
  fields,
  text = "",
  subjectId,
  subjectName,
}: {
  fields: Record<string, string>;
  /** Texto libre antes de interpretarlo en campos. */
  text?: string;
  subjectId?: string;
  /** Nombre de un paciente sin ficha: el servidor lo quita antes de la IA. */
  subjectName?: string;
}) {
  const [data, setData] = useState<AssistResponse | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [nonce, setNonce] = useState(0);
  const sequence = useRef(0);
  const immediate = useRef(false);

  const cleanFields = useMemo(
    () =>
      Object.fromEntries(
        Object.entries(fields)
          .filter(([, v]) => typeof v === "string" && v.trim())
          .map(([k, v]) => [k, v.slice(0, 10000)]),
      ),
    [fields],
  );
  const content = `${Object.values(cleanFields).join(" ")} ${text}`.trim();
  const ready = content.length >= 8 || !!subjectId;
  const payload = useMemo(
    () =>
      JSON.stringify({
        fields: cleanFields,
        ...(text.trim() ? { text: text.slice(0, 8000) } : {}),
        ...(subjectId ? { subjectId } : {}),
        ...(!subjectId && subjectName ? { subject: { name: subjectName } } : {}),
        includeAi: true,
      }),
    [cleanFields, text, subjectId, subjectName],
  );

  useEffect(() => {
    if (!ready) return;
    const current = ++sequence.current;
    const delay = immediate.current ? 0 : DEBOUNCE_MS;
    immediate.current = false;
    const timer = setTimeout(() => {
      setLoading(true);
      setError(null);
      api
        .post<AssistResponse>("/verticals/medicine/assist", JSON.parse(payload))
        .then((result) => {
          if (current === sequence.current) setData(result);
        })
        .catch((e) => {
          if (current === sequence.current)
            setError(e instanceof Error ? e.message : "No se pudo consultar el asistente.");
        })
        .finally(() => {
          if (current === sequence.current) setLoading(false);
        });
    }, delay);
    return () => clearTimeout(timer);
  }, [payload, ready, nonce]);

  // Al cambiar de paciente o vaciar la consulta, no quedan sugerencias viejas.
  useEffect(() => {
    if (!ready) {
      sequence.current++;
      setData(null);
      setLoading(false);
    }
  }, [ready]);

  const retry = useCallback(() => {
    immediate.current = true;
    setNonce((n) => n + 1);
  }, []);
  const ai = data?.ai;

  return (
    <aside
      aria-label="Asistente clínico IA"
      className="glass-panel flex flex-col gap-3 p-4 text-sm lg:sticky lg:top-4 lg:max-h-[calc(100dvh-2rem)] lg:overflow-y-auto"
    >
      <header>
        <p className="hud-label text-nexus-cyan">Asistente clínico IA</p>
        <p className="mt-1 rounded-lg border border-nexus-amber/50 px-2 py-1 text-xs text-nexus-amber">
          Sugerencias para el profesional — verificar. No se agregan solas a la consulta.
        </p>
      </header>
      <p role="status" className="text-xs text-nexus-muted">
        {!ready
          ? "Empezá a escribir o dictar: te muestro guías, prevención y sugerencias."
          : loading
            ? "Analizando la consulta…"
            : data
              ? "Actualizado con lo último que cargaste."
              : "Esperando una pausa para analizar…"}
      </p>
      {error && (
        <p role="alert" className="text-xs text-nexus-danger">
          {error}{" "}
          <button type="button" onClick={retry} className="text-nexus-cyan underline">
            Reintentar
          </button>
        </p>
      )}

      {data && (
        <>
          {data.aiStatus === "not_configured" && (
            <p className="rounded-lg border border-nexus-border p-2 text-xs text-nexus-muted">
              IA no configurada: se muestran solo recordatorios de guías.{" "}
              <Link href="/settings" className="text-nexus-cyan underline">
                Ajustes
              </Link>
            </p>
          )}
          {data.aiStatus === "error" && (
            <p className="rounded-lg border border-nexus-amber/50 p-2 text-xs text-nexus-amber">
              La IA no respondió esta vez; las guías siguen disponibles.{" "}
              <button type="button" onClick={retry} className="text-nexus-cyan underline">
                Reintentar
              </button>
            </p>
          )}

          {ai && (
            <Block title="Sugerencias IA">
              {ai.summary && <p>{ai.summary}</p>}
              <List title="Signos de alarma" items={ai.redFlags} tone="alert" />
              <List title="Considerar" items={ai.considerations} />
              <List title="Estudios" items={ai.workup} />
              {ai.treatmentOptions.length > 0 && (
                <div>
                  <h4 className="text-xs font-semibold uppercase tracking-wider text-nexus-muted">
                    Opciones de tratamiento
                  </h4>
                  <ul className="mt-1 flex flex-col gap-2">
                    {ai.treatmentOptions.map((t, i) => (
                      <li key={`${i}-${t.option}`} className="rounded-lg border border-nexus-border p-2">
                        <p className="font-medium">{t.option}</p>
                        {t.rationale && <p className="text-xs text-nexus-muted">{t.rationale}</p>}
                        {t.source && <p className="text-xs text-nexus-cyan">Fuente: {t.source}</p>}
                      </li>
                    ))}
                  </ul>
                </div>
              )}
              <List title="Controles en el seguimiento" items={ai.followupChecks} />
              <List title="Preguntas que faltan" items={ai.questions} />
              {data.aiProvider && (
                <p className="text-xs text-nexus-muted">Generado con {data.aiProvider === "anthropic" ? "Claude" : data.aiProvider === "gemini" ? "Gemini" : data.aiProvider}.</p>
              )}
            </Block>
          )}

          {data.habits.length > 0 && (
            <Block title="Tu conducta habitual (aprendida de vos)">
              <ul className="flex flex-col gap-2">
                {data.habits.map((h) => (
                  <li key={h.key}>
                    <p className="font-medium">{h.label}</p>
                    <ul className="mt-1 list-disc space-y-1 pl-5 text-xs">
                      {h.treatments.slice(0, 3).map((t) => (
                        <li key={t.text}>
                          {t.text} <span className="text-nexus-muted">({t.count} {t.count === 1 ? "vez" : "veces"})</span>
                        </li>
                      ))}
                    </ul>
                  </li>
                ))}
              </ul>
              <a href="/brain" className="mt-2 inline-block text-xs text-nexus-cyan">Ver todo lo que aprendí →</a>
            </Block>
          )}

          {data.guidelines.length > 0 && (
            <Block title="Recordatorios de guías">
              {data.guidelines.map((g) => (
                <details key={g.id} className="rounded-lg border border-nexus-border p-2" open={data.guidelines.length === 1}>
                  <summary className="cursor-pointer font-medium">{g.label}</summary>
                  <List title="Controlar" items={g.checks} />
                  <div className="mt-2">
                    <List title="Abordaje" items={g.approach} />
                  </div>
                  {g.sources.length > 0 && (
                    <p className="mt-2 text-xs text-nexus-cyan">Fuentes: {g.sources.join(" · ")}</p>
                  )}
                </details>
              ))}
            </Block>
          )}

          {data.prevention.length > 0 && (
            <Block title="Prevención por edad y sexo">
              <ul className="list-disc space-y-1 pl-5">
                {data.prevention.map((p) => (
                  <li key={p}>{p}</li>
                ))}
              </ul>
            </Block>
          )}

          {!ai && !data.habits.length && !data.guidelines.length && !data.prevention.length && (
            <p className="text-xs text-nexus-muted">
              No encontré guías para lo cargado hasta ahora. Sumá el diagnóstico presuntivo o el tratamiento y vuelvo a buscar solo.
            </p>
          )}

          <details className="rounded-lg border border-nexus-border p-2 text-xs">
            <summary className="cursor-pointer">Qué se envió a la IA (sin nombre ni DNI)</summary>
            {data.aiStatus === "ok" || data.aiStatus === "error" ? null : (
              <p className="mt-1 text-nexus-muted">
                En esta consulta no se envió nada a la IA; esto es lo que se enviaría.
              </p>
            )}
            <dl className="mt-2 flex flex-col gap-1">
              <div>
                <dt className="inline font-semibold">Edad: </dt>
                <dd className="inline">{data.sent.age ?? "no registrada"}</dd>
                {data.sent.sex && (
                  <>
                    <dt className="ml-2 inline font-semibold">Sexo: </dt>
                    <dd className="inline">{data.sent.sex}</dd>
                  </>
                )}
              </div>
              {(
                [
                  ["Alergias", data.sent.allergies],
                  ["Medicación", data.sent.medication],
                  ["Antecedentes", data.sent.history],
                  ...Object.entries(data.sent.fields),
                ] as Array<[string, string]>
              )
                .filter(([, v]) => v)
                .map(([k, v]) => (
                  <div key={k}>
                    <dt className="font-semibold">{k}</dt>
                    <dd className="whitespace-pre-wrap break-words text-nexus-muted">{v}</dd>
                  </div>
                ))}
              {data.sent.habits.length > 0 && (
                <div>
                  <dt className="font-semibold">Tu conducta habitual</dt>
                  <dd className="text-nexus-muted">{data.sent.habits.join(" | ")}</dd>
                </div>
              )}
            </dl>
          </details>
        </>
      )}
    </aside>
  );
}
