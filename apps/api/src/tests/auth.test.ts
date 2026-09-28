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
});
