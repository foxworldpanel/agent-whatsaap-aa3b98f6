import { describe, expect, it } from "vitest";

/**
 * Modelo executável do último fence de entrega.
 *
 * Ele não substitui o teste do Supabase/Uazapi, mas exercita a propriedade de
 * concorrência que o runtime deve preservar: qualquer inbound posterior ao
 * snapshot do Customer Turn torna a geração antiga obsoleta em todos os
 * pontos anteriores ao provider send.
 */
type Phase = "claude" | "humanization" | "tts" | "between_parts";

function shouldSuppressGeneratedReply(params: {
  snapshotAt: number;
  currentTurnJobIds: string[];
  inboundJobs: Array<{ id: string; createdAt: number; status: "pending" | "processing_safe" | "completed" }>;
}) {
  const own = new Set(params.currentTurnJobIds);
  return params.inboundJobs.some(
    (job) =>
      job.status === "pending" &&
      job.createdAt > params.snapshotAt &&
      !own.has(job.id),
  );
}

describe("Customer Turn concurrency property", () => {
  it.each<Phase>(["claude", "humanization", "tts", "between_parts"])(
    "suppresses generation A when message B arrives during %s",
    (_phase) => {
      expect(
        shouldSuppressGeneratedReply({
          snapshotAt: 1000,
          currentTurnJobIds: ["A"],
          inboundJobs: [
            { id: "A", createdAt: 900, status: "completed" },
            { id: "B", createdAt: 1001, status: "pending" },
          ],
        }),
      ).toBe(true);
    },
  );

  it("does not suppress due to an older orphan pending job", () => {
    expect(
      shouldSuppressGeneratedReply({
        snapshotAt: 1000,
        currentTurnJobIds: ["A"],
        inboundJobs: [{ id: "OLD", createdAt: 999, status: "pending" }],
      }),
    ).toBe(false);
  });

  it("does not suppress a job already attached to the current snapshot", () => {
    expect(
      shouldSuppressGeneratedReply({
        snapshotAt: 1000,
        currentTurnJobIds: ["A", "B"],
        inboundJobs: [{ id: "B", createdAt: 1001, status: "pending" }],
      }),
    ).toBe(false);
  });
});
