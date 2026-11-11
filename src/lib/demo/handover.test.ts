import { describe, expect, it } from "vitest";
import { createSeedStore } from "@/lib/demo/seed";
import {
  acknowledgeHandover,
  createHandover,
  publishHandover,
} from "@/lib/demo/service";
import { latestVersion } from "@/lib/domain/handover";

const ACTOR = "Meera Shah (project lead)";

describe("handover assembly and versioning", () => {
  it("assembles from recipient permissions and excludes restricted claims", () => {
    const store = createSeedStore();
    const result = createHandover(store, {
      role: "lead",
      actor: ACTOR,
      audienceRole: "incoming",
    });

    expect(result.ok).toBe(true);
    if (!result.ok) return;
    const version = latestVersion(result.value)!;
    const includedIds = version.sections.flatMap((section) =>
      section.claims.map((claim) => claim.id),
    );

    expect(includedIds).not.toContain("k-finance");
    expect(version.excludedCount).toBeGreaterThan(0);
    expect(version.openQuestions.length).toBeGreaterThan(0);
    expect(version.openQuestions.some((claim) => claim.id === "k-finance")).toBe(false);
    expect(version.contentHash).toMatch(/^sha256:[a-f0-9]{64}$/);
  });

  it("rejects non-lead assembly", () => {
    const store = createSeedStore();
    const result = createHandover(store, {
      role: "reviewer",
      actor: "Riya Kapoor (reviewer)",
      audienceRole: "incoming",
    });
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.status).toBe(403);
  });

  it("refuses to publish a handover with no approved claim", () => {
    const store = createSeedStore();
    store.claims = store.claims.map((claim) => ({
      ...claim,
      status: claim.status === "APPROVED" ? "NEEDS_REVIEW" : claim.status,
    }));

    const created = createHandover(store, {
      role: "lead",
      actor: ACTOR,
      audienceRole: "incoming",
    });
    expect(created.ok).toBe(true);
    if (!created.ok) return;

    const published = publishHandover(store, {
      handoverId: created.value.id,
      role: "lead",
      actor: ACTOR,
    });
    expect(published.ok).toBe(false);
    if (!published.ok) expect(published.status).toBe(422);
  });

  it("publishes an immutable version and records a recipient acknowledgement", () => {
    const store = createSeedStore();
    const created = createHandover(store, {
      role: "lead",
      actor: ACTOR,
      audienceRole: "incoming",
    });
    expect(created.ok).toBe(true);
    if (!created.ok) return;

    const published = publishHandover(store, {
      handoverId: created.value.id,
      role: "lead",
      actor: ACTOR,
    });
    expect(published.ok).toBe(true);
    if (!published.ok) return;
    expect(published.value.status).toBe("published");
    expect(published.value.currentVersionId).toBeTruthy();

    const version = latestVersion(published.value)!;
    expect(version.publishedAt).toBeTruthy();

    const tooLate = publishHandover(store, {
      handoverId: created.value.id,
      role: "lead",
      actor: ACTOR,
    });
    expect(tooLate.ok).toBe(false);
    if (!tooLate.ok) expect(tooLate.status).toBe(409);

    const wrongRecipient = acknowledgeHandover(store, {
      handoverId: created.value.id,
      role: "reviewer",
      actor: "Riya Kapoor (reviewer)",
    });
    expect(wrongRecipient.ok).toBe(false);
    if (!wrongRecipient.ok) expect(wrongRecipient.status).toBe(403);

    const acknowledged = acknowledgeHandover(store, {
      handoverId: created.value.id,
      role: "incoming",
      actor: "Hemant Rai (incoming owner)",
      note: "Read and understood.",
    });
    expect(acknowledged.ok).toBe(true);
    if (!acknowledged.ok) return;
    expect(acknowledged.value.versionId).toBe(published.value.currentVersionId);
    expect(acknowledged.value.note).toBe("Read and understood.");

    const duplicate = acknowledgeHandover(store, {
      handoverId: created.value.id,
      role: "incoming",
      actor: "Hemant Rai (incoming owner)",
    });
    expect(duplicate.ok).toBe(false);
    if (!duplicate.ok) expect(duplicate.status).toBe(409);
  });

  it("keeps a published snapshot stable when the live claim is edited later", () => {
    const store = createSeedStore();
    const created = createHandover(store, {
      role: "lead",
      actor: ACTOR,
      audienceRole: "incoming",
    });
    expect(created.ok).toBe(true);
    if (!created.ok) return;

    const published = publishHandover(store, {
      handoverId: created.value.id,
      role: "lead",
      actor: ACTOR,
    });
    expect(published.ok).toBe(true);
    if (!published.ok) return;

    const version = latestVersion(published.value)!;
    const snapshotClaim = version.sections
      .flatMap((section) => section.claims)
      .find((claim) => claim.status === "APPROVED");
    expect(snapshotClaim).toBeTruthy();
    if (!snapshotClaim) return;

    const originalTitle = snapshotClaim.title;
    const live = store.claims.find((claim) => claim.id === snapshotClaim.id)!;
    live.title = "Mutated after publication";

    const stillPublished = store.handovers.find((item) => item.id === created.value.id)!;
    const after = latestVersion(stillPublished)!;
    const afterClaim = after.sections
      .flatMap((section) => section.claims)
      .find((claim) => claim.id === snapshotClaim.id);
    expect(afterClaim?.title).toBe(originalTitle);
    expect(snapshotClaim.title).toBe(originalTitle);
  });
});
