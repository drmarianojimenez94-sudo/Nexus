import { executePlan, medicineVertical, type ApiRequest, type CapturePlan, type DayBrief } from "@nexus/verticals";
import { api } from "./api";

export const vertical = medicineVertical;

export type CaptureMode = "typed" | "dictated" | "ambient";

export function interpret(text: string, opts: { captureMode: CaptureMode; consentConfirmed: boolean; subjectId?: string }) {
  return api.post<{ plan: CapturePlan }>(`/verticals/${vertical.id}/capture`, { text, ...opts }).then((r) => r.plan);
}

export function loadDay() {
  return api.get<{ brief: DayBrief }>(`/verticals/${vertical.id}/day`).then((r) => r.brief);
}

const fetcher = (r: ApiRequest) => (r.method === "GET" ? api.get(r.path) : r.method === "PATCH" ? api.patch(r.path, r.body) : api.post(r.path, r.body));

export function confirmPlan(plan: CapturePlan, selected: string[]) {
  return executePlan(plan.steps, fetcher, selected);
}
