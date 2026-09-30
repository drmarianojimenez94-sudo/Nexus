import { describe, expect, it, vi } from "vitest";
import { createLatestRequest } from "./latestRequest";

function deferred<T>() {
  let resolve!: (value: T) => void;
  let reject!: (reason: unknown) => void;
  const promise = new Promise<T>((ok, fail) => {
    resolve = ok;
    reject = fail;
  });
  return { promise, resolve, reject };
}

describe("patient read ordering", () => {
  it("keeps patient B when the earlier patient A read finishes later", async () => {
    const requests = createLatestRequest(),
      publish = vi.fn();
    const patientA = deferred<string>(),
      patientB = deferred<string>();
    const a = requests.run(() => patientA.promise, publish);
    const b = requests.run(() => patientB.promise, publish);
    patientB.resolve("B");
    await b;
    patientA.resolve("A");
    await a;
    expect(publish.mock.calls).toEqual([[{ data: "B" }]]);
  });

  it("ignores failures and successful reads after leaving the patient page", async () => {
    const requests = createLatestRequest(),
      publish = vi.fn();
    const first = deferred<string>();
    const failed = requests.run(() => first.promise, publish);
    requests.invalidate();
    first.reject(new Error("old request"));
    await failed;
    const second = deferred<string>();
    const successful = requests.run(() => second.promise, publish);
    requests.invalidate();
    second.resolve("A");
    await successful;
    expect(publish).not.toHaveBeenCalled();
  });
});
