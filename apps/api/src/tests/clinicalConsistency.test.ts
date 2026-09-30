import request from "supertest";
import { beforeEach, afterEach, it, expect, vi } from "vitest";
import { randomUUID } from "node:crypto";
import { createApp } from "../app.js";
import { prisma } from "../lib/prisma.js";
import * as audit from "../lib/audit.js";
import { reconcileClinicalIndexes } from "../lib/clinicalIndexes.js";
import { encryptClinical, clinicalHash } from "../lib/clinicalCrypto.js";
const app = createApp();
let agent: ReturnType<typeof request.agent>, userId: string;
beforeEach(async () => {
  agent = request.agent(app);
  userId = (
    await agent
      .post("/auth/register")
      .send({
        name: "Fixture",
        email: "consistent@test.example",
        password: "strongpassword123",
      })
  ).body.user.id;
});
afterEach(() => vi.restoreAllMocks());
it("rolls back a patient write if its audit cannot be persisted", async () => {
  vi.spyOn(audit, "recordAudit").mockRejectedValueOnce(
    new Error("Audit unavailable"),
  );
  expect(
    (await agent.post("/clinical/patients").send({ name: "Uncommitted" }))
      .status,
  ).toBe(500);
  expect(await prisma.patient.count()).toBe(0);
});
it("does not duplicate patient or followup retries and refuses changed payload", async () => {
  const clientId = randomUUID();
  const input = { name: "Idempotente", clientId };
  const first = await agent.post("/clinical/patients").send(input);
  expect(
    (await agent.post("/clinical/patients").send(input)).body.patient.id,
  ).toBe(first.body.patient.id);
  expect(
    (
      await agent
        .post("/clinical/patients")
        .send({ ...input, name: "Different" })
    ).status,
  ).toBe(409);
  const followup = {
    patientId: first.body.patient.id,
    title: "Control",
    dueAt: new Date().toISOString(),
    clientId: randomUUID(),
  };
  const one = await agent.post("/clinical/followups").send(followup);
  expect(
    (await agent.post("/clinical/followups").send(followup)).body.followup.id,
  ).toBe(one.body.followup.id);
  expect(await prisma.clinicalFollowup.count()).toBe(1);
});
it("reconciles legacy alphanumeric documents without losing punctuation-insensitive search", async () => {
  const id = randomUUID();
  await prisma.patient.create({
    data: {
      id,
      userId,
      searchTokens: [],
      documentHash: clinicalHash("123", userId),
      recordEncrypted: encryptClinical(
        { name: "Legacy", document: "AB123" },
        `${userId}:patient:${id}`,
      ),
    },
  });
  await reconcileClinicalIndexes();
  expect(
    (
      await agent
        .post("/clinical/patients")
        .send({ name: "Passport C", document: "CD123" })
    ).status,
  ).toBe(201);
  expect(
    (
      await agent
        .post("/clinical/patients")
        .send({ name: "Duplicate A", document: "AB-123" })
    ).status,
  ).toBe(409);
  expect((await agent.get("/clinical/patients?q=AB123")).body.total).toBe(1);
});
