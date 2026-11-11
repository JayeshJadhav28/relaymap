import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { createSeedStore } from "@/lib/demo/seed";
import { addSource, reviewClaim } from "@/lib/demo/service";

const LEAD = "Meera Shah (project lead)";

const fixture = (name: string): string =>
  readFileSync(
    new URL(`../ingestion/__fixtures__/${name}`, import.meta.url),
  ).toString("base64");

describe("ingestion, extraction and review", () => {
  it("ingests a source, extracts claims and never auto-approves them", async () => {
    const store = createSeedStore();
    const result = await addSource(store, {
      filename: "new-decision.md",
      content: "Deployment target: Railway.\n\nOwner: Unassigned.",
      access: "project",
      role: "lead",
      actor: LEAD,
    });

    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.value.source.chunks.length).toBeGreaterThan(0);
    expect(result.value.claimIds.length).toBeGreaterThan(0);

    for (const claimId of result.value.claimIds) {
      const claim = store.claims.find((item) => item.id === claimId)!;
      expect(claim.status).not.toBe("APPROVED");
      expect(claim.citations.length).toBeGreaterThan(0);
    }
    expect(store.audit.some((event) => event.kind === "source.added")).toBe(true);
    expect(store.audit.some((event) => event.kind === "extraction.run")).toBe(true);
  });

  it("rejects duplicate source content", async () => {
    const store = createSeedStore();
    const result = await addSource(store, {
      filename: "copy-of-github.md",
      content: store.sources[0].content,
      access: "project",
      role: "lead",
      actor: LEAD,
    });
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.status).toBe(409);
  });

  it("ingests a PDF from base64 and keeps page provenance", async () => {
    const store = createSeedStore();
    const result = await addSource(store, {
      filename: "handover-notes.pdf",
      contentBase64: fixture("sample.pdf"),
      access: "project",
      role: "lead",
      actor: LEAD,
    });
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.value.source.kind).toBe("pdf");
    expect(result.value.source.chunks[0].page).toBe(1);
    expect(result.value.source.chunks[0].section).toBe("Page 1");
    expect(result.value.claimIds.length).toBeGreaterThan(0);
    for (const claim of store.claims.filter((item) => result.value.claimIds.includes(item.id))) {
      expect(claim.status).not.toBe("APPROVED");
      expect(claim.citations[0].page).toBe(1);
      expect(claim.citations[0].quote).toBe(claim.citations[0].quote.trim());
    }
  });

  it("rejects an invalid base64 payload before parsing", async () => {
    const store = createSeedStore();
    const result = await addSource(store, {
      filename: "notes.pdf",
      contentBase64: "not base64 ***",
      access: "project",
      role: "lead",
      actor: LEAD,
    });
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.status).toBe(400);
  });

  it("enforces upload permissions by role", async () => {
    const store = createSeedStore();
    const result = await addSource(store, {
      filename: "treasurer-note.md",
      content: "Deployment target: Vercel.",
      access: "project",
      role: "treasurer",
      actor: "Dev Patel (treasurer)",
    });
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.status).toBe(403);
  });

  it("blocks approval when a citation has been tampered with", () => {
    const store = createSeedStore();
    const claim = store.claims.find((item) => item.id === "k-task-deploy")!;
    claim.citations[0].quote = "A quotation that does not exist in the chunk.";

    const result = reviewClaim(store, {
      claimId: claim.id,
      action: "approve",
      role: "lead",
      actor: LEAD,
      comment: "Trying to approve an invalid citation.",
    });

    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.status).toBe(422);
    expect(claim.status).toBe("NEEDS_REVIEW");
  });

  it("approves a claim only after exact verification and appends a review record", () => {
    const store = createSeedStore();
    const before = store.reviews.length;

    const result = reviewClaim(store, {
      claimId: "k-task-deploy",
      action: "approve",
      role: "reviewer",
      actor: "Riya Kapoor (reviewer)",
      comment: "The quotation is exact and the task is clearly open.",
    });

    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.value.status).toBe("APPROVED");
    expect(store.reviews.length).toBe(before + 1);
    expect(store.reviews.at(-1)?.comment).toContain("exact");
    expect(store.audit.some((event) => event.kind === "claim.approve")).toBe(true);
  });

  it("requires a comment for clarification and rejection", () => {
    const store = createSeedStore();
    for (const action of ["request_clarification", "reject", "edit"] as const) {
      const result = reviewClaim(store, {
        claimId: "k-owner",
        action,
        role: "lead",
        actor: LEAD,
      });
      expect(result.ok).toBe(false);
      if (!result.ok) expect(result.status).toBe(400);
    }
  });

  it("rejects review attempts from a non-reviewer role", () => {
    const store = createSeedStore();
    const result = reviewClaim(store, {
      claimId: "k-owner",
      action: "approve",
      role: "incoming",
      actor: "Hemant Rai (incoming owner)",
      comment: "Should not be allowed.",
    });
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.status).toBe(403);
  });
});
