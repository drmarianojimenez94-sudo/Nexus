import { describe, expect, it } from "vitest";
import { isEmailConfigured, sendEmail } from "../lib/email.js";

// RESEND_API_KEY is intentionally unset in the test env (vitest.config.ts)
// — same "never required" pattern as AI_API_KEY. The configured path
// (an actual send) is covered by internal.test.ts, which mocks this
// module so it doesn't need a real Resend key or network access.
describe("email (not configured)", () => {
  it("reports unconfigured", () => {
    expect(isEmailConfigured).toBe(false);
  });

  it("sendEmail no-ops instead of throwing", async () => {
    const ok = await sendEmail({ to: "test@example.com", subject: "Hi", html: "<p>hi</p>" });
    expect(ok).toBe(false);
  });
});
