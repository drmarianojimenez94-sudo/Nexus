import { env } from "./env.js";

export const isGoogleConfigured = Boolean(
  env.googleClientId && env.googleClientSecret && env.googleRedirectUri,
);

/** Read-only for V1 (spec §7 lists write access too, but least-privilege first — expands when NexusBrain gets a createEvent tool). */
export const GOOGLE_SCOPES = {
  calendar: "https://www.googleapis.com/auth/calendar.readonly",
  gmailRead: "https://www.googleapis.com/auth/gmail.readonly",
  gmailCompose: "https://www.googleapis.com/auth/gmail.compose",
  contacts: "https://www.googleapis.com/auth/contacts.readonly",
  drive: "https://www.googleapis.com/auth/drive.readonly",
} as const;

export function buildGoogleAuthUrl(state: string, workspace = false): string {
  const params = new URLSearchParams({
    client_id: env.googleClientId!,
    redirect_uri: env.googleRedirectUri!,
    response_type: "code",
    scope: workspace
      ? Object.values(GOOGLE_SCOPES).join(" ")
      : GOOGLE_SCOPES.calendar,
    include_granted_scopes: "true",
    access_type: "offline",
    prompt: "consent",
    state,
  });
  return `https://accounts.google.com/o/oauth2/v2/auth?${params.toString()}`;
}

interface GoogleTokenResponse {
  access_token: string;
  refresh_token?: string;
  expires_in: number;
  scope: string;
  token_type: string;
}

export async function exchangeGoogleCode(
  code: string,
): Promise<GoogleTokenResponse> {
  const res = await fetch("https://oauth2.googleapis.com/token", {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    signal: AbortSignal.timeout(15_000),
    body: new URLSearchParams({
      client_id: env.googleClientId!,
      client_secret: env.googleClientSecret!,
      redirect_uri: env.googleRedirectUri!,
      grant_type: "authorization_code",
      code,
    }),
  });
  if (!res.ok) throw new Error(`Google token exchange failed: ${res.status}`);
  return res.json() as Promise<GoogleTokenResponse>;
}

export async function refreshGoogleAccessToken(
  refreshToken: string,
): Promise<GoogleTokenResponse> {
  const res = await fetch("https://oauth2.googleapis.com/token", {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    signal: AbortSignal.timeout(15_000),
    body: new URLSearchParams({
      client_id: env.googleClientId!,
      client_secret: env.googleClientSecret!,
      grant_type: "refresh_token",
      refresh_token: refreshToken,
    }),
  });
  if (!res.ok) throw new Error(`Google token refresh failed: ${res.status}`);
  return res.json() as Promise<GoogleTokenResponse>;
}

/** Best-effort — Google still expires the grant even if this call fails. */
export async function revokeGoogleToken(token: string): Promise<void> {
  try {
    await fetch(
      `https://oauth2.googleapis.com/revoke?token=${encodeURIComponent(token)}`,
      { method: "POST" },
    );
  } catch {
    // Nothing to recover — the local Integration row is deleted regardless.
  }
}

export interface GoogleCalendarEvent {
  id: string;
  summary?: string;
  description?: string;
  location?: string;
  start: { dateTime?: string; date?: string };
  end?: { dateTime?: string; date?: string };
}

/** Events from 7 days ago to 60 days out — enough for Today/Calendar without an unbounded import. */
export async function fetchGoogleCalendarEvents(
  accessToken: string,
): Promise<GoogleCalendarEvent[]> {
  const timeMin = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000).toISOString();
  const timeMax = new Date(Date.now() + 60 * 24 * 60 * 60 * 1000).toISOString();
  const params = new URLSearchParams({
    timeMin,
    timeMax,
    singleEvents: "true",
    orderBy: "startTime",
    maxResults: "250",
  });
  const res = await fetch(
    `https://www.googleapis.com/calendar/v3/calendars/primary/events?${params.toString()}`,
    {
      headers: { Authorization: `Bearer ${accessToken}` },
    },
  );
  if (!res.ok) throw new Error(`Google Calendar fetch failed: ${res.status}`);
  const body = (await res.json()) as { items?: GoogleCalendarEvent[] };
  return body.items ?? [];
}
