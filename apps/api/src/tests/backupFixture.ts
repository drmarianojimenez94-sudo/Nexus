import { PrismaClient } from "@prisma/client";
import { encryptClinical, decryptClinical } from "../lib/clinicalCrypto.js";
import { randomUUID } from "node:crypto";
const db = new PrismaClient();
try {
  if (process.argv[2] === "seed") {
    const user = await db.user.create({
      data: {
        name: "Backup fixture",
        email: "backup-fixture@example.test",
        passwordHash: "test-only",
      },
    });
    const id = randomUUID();
    await db.patient.create({
      data: {
        id,
        userId: user.id,
        searchTokens: [],
        recordEncrypted: encryptClinical(
          { name: "Paciente de restauración", document: "TST123" },
          `${user.id}:patient:${id}`,
        ),
      },
    });
  } else {
    const row = await db.patient.findFirstOrThrow({
      where: { user: { email: "backup-fixture@example.test" } },
    });
    const record = decryptClinical<{ name: string }>(
      row.recordEncrypted,
      `${row.userId}:patient:${row.id}`,
    );
    if (record.name !== "Paciente de restauración")
      throw Error("Restore clinical data mismatch");
  }
} finally {
  await db.$disconnect();
}
