import request from "supertest";
import { describe, expect, it } from "vitest";
import { createApp } from "../app.js";

const app = createApp();

describe("auth", () => {
  it("registers a new user and sets session cookies", async () => {
    const res = await request(app).post("/auth/register").send({
      name: "Mariano",
      email: "mariano@example.com",
      password: "supersecret123",
    });

    expect(res.status).toBe(201);
    expect(res.body.user.email).toBe("mariano@example.com");
    expect(res.body.user.passwordHash).toBeUndefined();
    expect(res.headers["set-cookie"]).toBeDefined();
  });

  it("rejects duplicate registration", async () => {
    await request(app).post("/auth/register").send({
      name: "Mariano",
      email: "mariano@example.com",
      password: "supersecret123",
    });
    const res = await request(app).post("/auth/register").send({
      name: "Mariano",
      email: "mariano@example.com",
      password: "supersecret123",
    });
    expect(res.status).toBe(409);
  });

  it("logs in with correct credentials and rejects wrong password", async () => {
    await request(app).post("/auth/register").send({
      name: "Mariano",
      email: "mariano@example.com",
      password: "supersecret123",
    });

    const ok = await request(app).post("/auth/login").send({
      email: "mariano@example.com",
      password: "supersecret123",
    });
    expect(ok.status).toBe(200);

    const bad = await request(app).post("/auth/login").send({
      email: "mariano@example.com",
      password: "wrong-password",
    });
    expect(bad.status).toBe(401);
  });

  it("rejects /auth/me without a session", async () => {
    const res = await request(app).get("/auth/me");
    expect(res.status).toBe(401);
  });

  it("returns the current user for an authenticated session", async () => {
    const agent = request.agent(app);
    await agent.post("/auth/register").send({
      name: "Mariano",
      email: "mariano@example.com",
      password: "supersecret123",
    });

    const res = await agent.get("/auth/me");
    expect(res.status).toBe(200);
    expect(res.body.user.email).toBe("mariano@example.com");
  });

  // apps/mobile has no cookie jar, so /auth/* hands it the raw tokens in
  // the JSON body instead — but only when it identifies itself, so the
  // web client's responses never carry a JS-readable token (see
  // isMobileClient in routes/auth.ts for why that matters).
  describe("mobile client (Bearer tokens instead of cookies)", () => {
    it("never includes tokens in the body for a plain web request", async () => {
      const res = await request(app).post("/auth/register").send({
        name: "Mariano",
        email: "mariano@example.com",
        password: "supersecret123",
      });
      expect(res.body.accessToken).toBeUndefined();
      expect(res.body.refreshToken).toBeUndefined();
    });

    it("includes accessToken/refreshToken when X-Nexus-Client: mobile is set", async () => {
      const res = await request(app)
        .post("/auth/register")
        .set("X-Nexus-Client", "mobile")
        .send({ name: "Mariano", email: "mariano@example.com", password: "supersecret123" });

      expect(typeof res.body.accessToken).toBe("string");
      expect(typeof res.body.refreshToken).toBe("string");
    });

    it("accepts the issued accessToken as a Bearer header with no cookies at all", async () => {
      const registered = await request(app)
        .post("/auth/register")
        .set("X-Nexus-Client", "mobile")
        .send({ name: "Mariano", email: "mariano@example.com", password: "supersecret123" });

      const res = await request(app)
        .get("/auth/me")
        .set("Authorization", `Bearer ${registered.body.accessToken}`);
      expect(res.status).toBe(200);
      expect(res.body.user.email).toBe("mariano@example.com");
    });

    it("refreshes via a body refreshToken and returns fresh tokens as JSON", async () => {
      const registered = await request(app)
        .post("/auth/register")
        .set("X-Nexus-Client", "mobile")
        .send({ name: "Mariano", email: "mariano@example.com", password: "supersecret123" });

      const refreshed = await request(app)
        .post("/auth/refresh")
        .set("X-Nexus-Client", "mobile")
        .send({ refreshToken: registered.body.refreshToken });

      expect(refreshed.status).toBe(200);
      expect(typeof refreshed.body.accessToken).toBe("string");
      // The old refresh token is revoked on rotation — reusing it must fail.
      const reused = await request(app)
        .post("/auth/refresh")
        .set("X-Nexus-Client", "mobile")
        .send({ refreshToken: registered.body.refreshToken });
      expect(reused.status).toBe(401);
    });

    it("logs out via a body refreshToken with no cookies", async () => {
      const registered = await request(app)
        .post("/auth/register")
        .set("X-Nexus-Client", "mobile")
        .send({ name: "Mariano", email: "mariano@example.com", password: "supersecret123" });

      const loggedOut = await request(app)
        .post("/auth/logout")
        .send({ refreshToken: registered.body.refreshToken });
      expect(loggedOut.status).toBe(204);

      const reused = await request(app)
        .post("/auth/refresh")
        .set("X-Nexus-Client", "mobile")
        .send({ refreshToken: registered.body.refreshToken });
      expect(reused.status).toBe(401);
    });
  });
});
