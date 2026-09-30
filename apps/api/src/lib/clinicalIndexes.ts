import { prisma } from "./prisma.js";
import {
  decryptClinical,
  clinicalHash,
  normalizeDocument,
  searchTokens,
} from "./clinicalCrypto.js";
import { patientInputSchema, type PatientInput } from "@nexus/shared";
// Reconcile legacy document hashes and formatted-document search tokens atomically.
// Run before accepting traffic; no ciphertext/key is logged or exported.
export async function reconcileClinicalIndexes() {
  await prisma.$transaction(
    async (tx) => {
      await tx.$executeRaw`SELECT pg_advisory_xact_lock(74269184)`;
      const rows = await tx.patient.findMany();
      const records = rows.map((row) => ({
        row,
        data: patientInputSchema.parse(
          decryptClinical<PatientInput>(
            row.recordEncrypted,
            `${row.userId}:patient:${row.id}`,
          ),
        ),
      }));
      await tx.patient.updateMany({ data: { documentHash: null } });
      for (const { row, data } of records)
        await tx.patient.update({
          where: { id: row.id },
          data: {
            updatedAt: row.updatedAt,
            documentHash: data.document
              ? clinicalHash(normalizeDocument(data.document), row.userId)
              : null,
            searchTokens: searchTokens(data.name, data.document, row.userId),
          },
        });
    },
    { timeout: 120000 },
  );
}
