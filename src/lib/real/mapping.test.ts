import { describe, expect, it } from "vitest";
import {
  actorLabel,
  asRow,
  bool,
  mapAcknowledgement,
  mapAuditEvent,
  mapCitation,
  mapClaim,
  mapHandover,
  mapProject,
  mapReview,
  mapSource,
  nullableNum,
  num,
  object,
  rows,
  str,
} from "./mapping";

describe("row helpers", () => {
  it("coerces unsafe JSON into rows without throwing", () => {
    expect(asRow(null)).toEqual({});
    expect(asRow("nope")).toEqual({});
    expect(asRow({ id: "x" })).toEqual({ id: "x" });
    expect(rows([{ id: "a" }, null, "b", { id: "c" }])).toEqual([{ id: "a" }, { id: "c" }]);
    expect(rows(undefined)).toEqual([]);
  });

  it("reads only values of the expected type", () => {
    const row = { text: "hi", count: 3, flag: true, nested: { a: 1 } };
    expect(str(row, "text")).toBe("hi");
    expect(str(row, "count", "fallback")).toBe("fallback");
    expect(num(row, "count")).toBe(3);
    expect(num(row, "text")).toBe(0);
    expect(nullableNum(row, "text")).toBeNull();
    expect(bool(row, "flag")).toBe(true);
    expect(bool(row, "text")).toBe(false);
    expect(object(row, "nested")).toEqual({ a: 1 });
    expect(object(row, "missing")).toEqual({});
  });

  it("names the acting user but never another member's raw id", () => {
    expect(actorLabel("user-1", "user-1", "Meera Shah")).toBe("Meera Shah");
    expect(actorLabel("user-2", "user-1", "Meera Shah")).toBe("Workspace member");
    expect(actorLabel("", "user-1", "Meera Shah")).toBe("Workspace member");
  });
});

describe("project mapping", () => {
  it("only treats archived as archived", () => {
    expect(mapProject({ id: "p", name: "P", status: "archived" }, "Org").status).toBe("archived");
    expect(mapProject({ id: "p", name: "P", status: "active" }, "Org").status).toBe("active");
    expect(mapProject({ id: "p" }, "Org").status).toBe("active");
  });
});

describe("source mapping", () => {
  const row = {
    id: "s1",
    project_id: "p1",
    filename: "meeting-notes.md",
    source_type: "markdown",
    access_level: "finance",
    content: "full",
    content_hash: "hash",
    extraction_status: "parsed",
    created_at: "2026-10-01T00:00:00.000Z",
    source_chunks: [
      { id: "c2", source_id: "s1", chunk_index: 1, content: "second", char_start: 10, char_end: 16 },
      { id: "c1", source_id: "s1", chunk_index: 0, content: "first", char_start: 0, char_end: 5, page_number: 2 },
    ],
  };

  it("orders chunks and maps access, kind and provenance", () => {
    const source = mapSource(row, "Meera Shah");
    expect(source.kind).toBe("md");
    expect(source.access).toBe("finance");
    expect(source.allowedRoles).toEqual(["lead", "treasurer"]);
    expect(source.chunks.map((chunk) => chunk.id)).toEqual(["c1", "c2"]);
    expect(source.chunks[0].page).toBe(2);
    expect(source.chunks[1].page).toBeNull();
    expect(source.extracted).toBe(true);
    expect(source.synthetic).toBe(false);
    expect(source.createdBy).toBe("Meera Shah");
  });

  it("keeps project sources readable by every demo role", () => {
    const source = mapSource({ ...row, access_level: "project" }, "Meera Shah");
    expect(source.access).toBe("project");
    expect(source.allowedRoles).toContain("incoming");
  });

  it("falls back to the file extension when the stored type is unknown", () => {
    expect(mapSource({ ...row, source_type: "upload", filename: "a.pdf" }, "").kind).toBe("pdf");
    expect(mapSource({ ...row, source_type: "upload", filename: "a.docx" }, "").kind).toBe("docx");
    expect(mapSource({ ...row, source_type: "upload", filename: "a.bin" }, "").kind).toBe("txt");
  });
});

describe("claim mapping", () => {
  const base = {
    id: "k1",
    project_id: "p1",
    claim_type: "DECISION",
    title: "Move to Netlify",
    description: "Pilot host",
    verification_status: "APPROVED",
    evidence_status: "SUPPORTED",
    confidence_score: 0.91,
    attributes: { rationale: "Meetings agreed", ownerName: "Meera", dueDate: "2026-11-10", priority: "high" },
    evidence_citations: [
      { id: "cit", knowledge_item_id: "k1", source_id: "s1", chunk_id: "c1", exact_snippet: "quote", verification: "VERIFIED", quote_hash: "h" },
    ],
  };

  it("maps a complete claim and its citations", () => {
    const claim = mapClaim(base);
    expect(claim.type).toBe("DECISION");
    expect(claim.status).toBe("APPROVED");
    expect(claim.rationale).toBe("Meetings agreed");
    expect(claim.owner).toBe("Meera");
    expect(claim.dueDate).toBe("2026-11-10");
    expect(claim.priority).toBe("high");
    expect(claim.citations).toHaveLength(1);
    expect(claim.citations[0].verification).toBe("VERIFIED");
  });

  it("prefers the reviewer note over the recorded attribute", () => {
    expect(mapClaim({ ...base, reviewer_note: "Decided in review" }).rationale).toBe(
      "Decided in review",
    );
    expect(mapClaim({ ...base, reviewer_note: "   " }).rationale).toBe("Meetings agreed");
  });

  it("drops blank owners and due dates", () => {
    const claim = mapClaim({ ...base, attributes: { ownerName: " ", dueDate: "" } });
    expect(claim.owner).toBeUndefined();
    expect(claim.dueDate).toBeUndefined();
  });

  it("falls back to safe vocabulary for unknown statuses and priorities", () => {
    const claim = mapClaim({
      ...base,
      claim_type: "SPECULATION",
      verification_status: "VERIFIED",
      evidence_status: "MAYBE",
      attributes: { priority: "urgent" },
    });
    expect(claim.type).toBe("NOTE");
    expect(claim.status).toBe("INFERRED");
    expect(claim.evidenceStatus).toBe("MISSING_EVIDENCE");
    expect(claim.priority).toBe("medium");
  });

  it("marks finance claims as visible only to lead and treasurer", () => {
    expect(mapClaim({ ...base, access_level: "finance" }).allowedRoles).toEqual([
      "lead",
      "treasurer",
    ]);
  });
});

describe("citation mapping", () => {
  it("normalises an unknown verification state to pending", () => {
    expect(mapCitation({ verification: "MAYBE" }).verification).toBe("PENDING");
    expect(mapCitation({ verification: "FAILED" }).verification).toBe("FAILED");
  });
});

describe("review mapping", () => {
  it("keeps known actions and falls back to edit", () => {
    expect(mapReview({ action: "approve" }, "Meera").action).toBe("approve");
    expect(mapReview({ action: "resolve_conflict" }, "Meera").action).toBe("resolve_conflict");
    expect(mapReview({ action: "invented" }, "Meera").action).toBe("edit");
  });

  it("maps prior and next statuses with the same vocabulary guard", () => {
    const review = mapReview({ prior_status: "NEEDS_REVIEW", next_status: "APPROVED" }, "Meera");
    expect(review.fromStatus).toBe("NEEDS_REVIEW");
    expect(review.toStatus).toBe("APPROVED");
    expect(mapReview({ prior_status: "VERIFIED" }, "Meera").fromStatus).toBe("INFERRED");
  });
});

describe("handover mapping", () => {
  const version = {
    id: "v2",
    handoverId: "h1",
    version: 2,
    audienceRole: "incoming",
    createdAt: "2026-11-02T00:00:00.000Z",
    sections: [],
    openQuestions: [],
    claimIds: [],
    excludedCount: 0,
    readiness: { score: 80, components: [], reasons: [] },
    contentHash: "hash",
  };

  it("picks the current version and normalises status", () => {
    const handover = mapHandover({
      id: "h1",
      project_id: "p1",
      title: "Handover",
      audience_role: "incoming",
      status: "acknowledged",
      current_version: 2,
      handover_versions: [
        { body: { handoverVersion: version } },
        {
          body: {
            handoverVersion: {
              ...version,
              id: "v1",
              version: 1,
            },
          },
        },
      ],
    });

    expect(handover.status).toBe("published");
    expect(handover.versions.map((item) => item.version)).toEqual([1, 2]);
    expect(handover.currentVersionId).toBe("v2");
  });

  it("ignores version bodies that are not a stored snapshot", () => {
    const handover = mapHandover({
      id: "h1",
      status: "draft",
      handover_versions: [{ body: {} }, { body: null }],
    });
    expect(handover.versions).toEqual([]);
    expect(handover.currentVersionId).toBeUndefined();
  });
});

describe("acknowledgement and audit mapping", () => {
  it("falls back from note to comment and from acknowledged_at to created_at", () => {
    const ack = mapAcknowledgement(
      { handover_id: "h", version_id: "v", comment: "Received", created_at: "then" },
      "Incoming",
    );
    expect(ack.note).toBe("Received");
    expect(ack.at).toBe("then");
    expect(ack.acknowledgedBy).toBe("Incoming");
    expect(ack.role).toBe("incoming");
  });

  it("uses the recorded title and routes entity ids by type", () => {
    const audit = mapAuditEvent(
      {
        action: "claim.approved",
        entity_type: "knowledge_item",
        entity_id: "k1",
        metadata: { title: "Claim approved" },
      },
      "Meera",
    );
    expect(audit.title).toBe("Claim approved");
    expect(audit.claimId).toBe("k1");
    expect(audit.sourceId).toBeUndefined();

    const sourceAudit = mapAuditEvent(
      { action: "source.ingested", entity_type: "source", entity_id: "s1" },
      "Meera",
    );
    expect(sourceAudit.title).toBe("source.ingested");
    expect(sourceAudit.sourceId).toBe("s1");
  });
});
