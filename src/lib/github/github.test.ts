import { describe, expect, it } from "vitest";
import { buildExplanation, explainConcentration } from "./explanations";
import { buildPortfolioInsights } from "./insights";
import {
  computeKnowledgeConcentration,
  concentrationBand,
} from "./knowledge-risk";
import { buildPendingWork } from "./pending-work";

describe("knowledge concentration", () => {
  it("applies the documented formula when blame and commit data exist", () => {
    const result = computeKnowledgeConcentration({
      path: "src/billing.ts",
      blameShare: 0.9,
      commitShare: 0.8,
      commits12m: 10,
      importers: 2,
      topAuthor: "aarav",
    });
    expect(result.available).toBe(true);
    expect(result.basis).toBe("blame+commits");
    expect(result.orphanShare).toBeCloseTo(0.86, 4);
    expect(result.ocs).toBeCloseTo(6.1866, 4);
    expect(concentrationBand(result)).toBe("high");
  });

  it("refuses to invent blame data and reports commits only", () => {
    const result = computeKnowledgeConcentration({
      path: "src/routes.ts",
      commitShare: 0.75,
      commits12m: 4,
      importers: 1,
    });
    expect(result.available).toBe(false);
    expect(result.basis).toBe("commits-only");
    expect(result.ocs).toBeUndefined();
    expect(result.reason).toContain("no blame share was inferred");
    expect(concentrationBand(result)).toBe("unknown");
  });

  it("returns insufficient when no share data exists at all", () => {
    const result = computeKnowledgeConcentration({
      path: "src/unknown.ts",
      commits12m: 0,
      importers: 0,
    });
    expect(result.available).toBe(false);
    expect(result.basis).toBe("insufficient");
  });

  it("clamps out-of-range shares instead of accepting impossible values", () => {
    const result = computeKnowledgeConcentration({
      path: "src/clamped.ts",
      blameShare: 2,
      commitShare: -1,
      commits12m: 1,
      importers: 0,
    });
    expect(result.orphanShare).toBeCloseTo(0.6, 4);
  });
});

describe("portfolio insights", () => {
  const files = [
    {
      path: "src/billing.ts",
      blameShare: 0.95,
      commitShare: 0.9,
      commits12m: 12,
      importers: 3,
      topAuthor: "aarav",
    },
    {
      path: "src/util.ts",
      blameShare: 0.1,
      commitShare: 0.2,
      commits12m: 20,
      importers: 8,
      topAuthor: "meera",
    },
  ];

  it("identifies single-owner and fragile files", () => {
    const insights = buildPortfolioInsights(files);
    expect(insights.singleOwnerFiles.map((file) => file.path)).toContain("src/billing.ts");
    expect(insights.fragileAreas.map((file) => file.path)).toContain("src/billing.ts");
    expect(insights.concentratedFiles.map((file) => file.path)).toContain("src/billing.ts");
    const util = insights.concentratedFiles.find((file) => file.path === "src/util.ts");
    expect(util?.band).toBe("medium");
  });

  it("marks receiver suggestions as requiring human confirmation", () => {
    const insights = buildPortfolioInsights(files, {
      "src/billing.ts": [
        { login: "riya", commitShare: 0.2, alreadyInvolved: true },
        { login: "sam", commitShare: 0, alreadyInvolved: false },
      ],
    });
    const suggestion = insights.suggestedReceivers.find(
      (item) => item.path === "src/billing.ts",
    )!;
    expect(suggestion.requiresHumanConfirmation).toBe(true);
    expect(suggestion.candidates.map((candidate) => candidate.login)).toEqual(["riya"]);
  });

  it("always carries caveats about what the score does not mean", () => {
    const insights = buildPortfolioInsights(files);
    expect(insights.caveats.join(" ")).toContain("not from demonstrated understanding");
    expect(insights.caveats.join(" ")).toContain("require human confirmation");
  });
});

describe("pending work", () => {
  const now = new Date("2026-11-10T10:00:00.000Z");

  it("summarises open pull requests and issues with age", () => {
    const summary = buildPendingWork(
      [
        {
          number: 42,
          title: "Reconcile rider alerts",
          author: "aarav",
          createdAt: "2026-10-01T00:00:00.000Z",
          updatedAt: "2026-10-05T00:00:00.000Z",
          draft: true,
          assignees: [],
        },
      ],
      [
        {
          number: 7,
          title: "Confirm deployment target",
          author: "meera",
          createdAt: "2026-11-01T00:00:00.000Z",
          updatedAt: "2026-11-08T00:00:00.000Z",
          assignees: [],
        },
        {
          number: 8,
          title: "Document import",
          author: "aarav",
          createdAt: "2026-11-02T00:00:00.000Z",
          updatedAt: "2026-11-09T00:00:00.000Z",
          assignees: ["riya"],
        },
      ],
      now,
    );

    expect(summary.totalOpen).toBe(3);
    expect(summary.openPullRequests[0].draft).toBe(true);
    expect(summary.openPullRequests[0].stale).toBe(true);
    expect(summary.unassignedIssues.map((issue) => issue.number)).toEqual([7]);
    expect(summary.staleItems.map((item) => item.number)).toEqual([42]);
    expect(summary.caveat).toContain("not a complete inventory");
  });
});

describe("grounded explanations", () => {
  it("collects real references and flags unsupported statements as inferred", () => {
    const explanation = buildExplanation([
      {
        text: "Commit abc123 introduced the importer.",
        references: [{ kind: "commit", id: "abc123" }],
      },
      { text: "The team probably wanted to save time.", references: [] },
    ]);

    expect(explanation.citations).toEqual([{ kind: "commit", id: "abc123" }]);
    expect(explanation.inferred).toBe(true);
    expect(explanation.text).toContain("[inferred]");
    expect(explanation.unsupportedStatements).toHaveLength(1);
  });

  it("deduplicates repeated references", () => {
    const explanation = buildExplanation([
      { text: "a", references: [{ kind: "pull", id: "12" }] },
      { text: "b", references: [{ kind: "pull", id: "12" }] },
    ]);
    expect(explanation.citations).toHaveLength(1);
  });

  it("marks a concentration explanation as inferred when no code reference exists", () => {
    const result = computeKnowledgeConcentration({
      path: "src/billing.ts",
      blameShare: 0.9,
      commitShare: 0.8,
      commits12m: 10,
      importers: 2,
    });
    expect(explainConcentration(result, []).inferred).toBe(true);
    expect(
      explainConcentration(result, [{ kind: "commit", id: "abc123" }]).inferred,
    ).toBe(false);
  });
});
