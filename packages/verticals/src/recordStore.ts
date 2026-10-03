import type { VerticalAdapter } from "./plan";

/**
 * Adaptador del almacén cifrado de registros profesionales de NEXUS.
 *
 * Personas, registros con plantilla versionada, borrador→validado y
 * pendientes con vencimiento son genéricos: hoy viven montados en
 * `/clinical/*` porque medicina fue la primera vertical, pero cualquier
 * vertical los reutiliza (sus plantillas se registran como `vertical:id`).
 */
export const recordStoreAdapter: VerticalAdapter = {
  findSubject: (query) => ({
    request: { method: "GET", path: `/clinical/patients?q=${encodeURIComponent(query)}` },
    listPath: "patients",
    resultIdPath: "id",
  }),
  createSubject: ({ name, document, phone, allergies, clientId }) => ({
    request: {
      method: "POST",
      path: "/clinical/patients",
      body: { name, document: document ?? "", phone: phone ?? "", allergies: allergies ?? "", clientId },
    },
    resultIdPath: "patient.id",
  }),
  createRecord: ({ templateId, occurredAt, fields, dictation, clientId }) => ({
    request: {
      method: "POST",
      path: "/clinical/patients/:subjectId/encounters",
      body: { templateId, occurredAt, fields, dictation, clientId },
    },
    bind: { "path.:subjectId": "$subject" },
    resultIdPath: "encounter.id",
  }),
  createFollowup: ({ title, kind, dueAt, clientId }) => ({
    request: { method: "POST", path: "/clinical/followups", body: { title, kind, dueAt, clientId } },
    bind: { "body.patientId": "$subject" },
    resultIdPath: "followup.id",
  }),
  createAppointment: ({ title, startAt, endAt }) => ({
    request: { method: "POST", path: "/events", body: { title, startAt, endAt } },
    resultIdPath: "event.id",
  }),
  createTask: ({ title, deadline }) => ({
    request: { method: "POST", path: "/tasks", body: { title, ...(deadline ? { deadline } : {}) } },
    resultIdPath: "task.id",
  }),
};
