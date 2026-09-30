import { z } from "zod";
export const googleMailDraftSchema = z.object({
  to: z.string().email().max(254),
  subject: z
    .string()
    .trim()
    .min(1)
    .max(200)
    .refine((s) => !/[\r\n]/.test(s)),
  body: z.string().min(1).max(50000),
});
export interface GoogleMailMessage {
  id: string;
  subject: string;
  from: string;
  to: string;
  snippet: string;
  text: string;
}
export interface GoogleContact {
  id: string;
  name: string;
  emails: string[];
  phones: string[];
  organization: string;
}
export interface GoogleDriveFile {
  id: string;
  name: string;
  mimeType: string;
  modifiedTime?: string;
  webViewLink?: string;
  size?: string;
}
export interface GoogleDraftPreview {
  id: string;
  to: string;
  subject: string;
  text: string;
  confirmationToken: string;
}
