/**
 * Synthetic CampusConnect seed.
 *
 * The scenario is retained from demo-data.ts in relay-knowledge-continuity
 * (MIT, Copyright (c) 2026 Relay contributors) and extended with chunks,
 * immutable review history and graph relationships. All names, budgets and
 * contact details are fictional.
 */
import type {
  AuditEvent,
  Chunk,
  Citation,
  Claim,
  Handover,
  InterviewQuestion,
  Project,
  Relationship,
  ReviewRecord,
  Source,
  Store,
} from "./types";
import { sha256, quoteHash } from "@/lib/domain/hash";
import { chunkText } from "@/lib/ingestion/document-parser";

const PROJECT: Project = {
  id: "proj-campusconnect",
  organisation: "CampusConnect",
  name: "CampusConnect rider experience",
  description:
    "CampusConnect helps students navigate campus transit and rider alerts. The project is preparing a pilot and needs a confirmed deployment target, documented route-import operations, and an owner for rider-alert reconciliation.",
  status: "handover",
  departingMember: "Meera Shah",
  incomingMember: "Hemant Rai",
  manager: "Meera Shah",
};

type SourceInput = {
  id: string;
  title: string;
  kind: Source["kind"];
  access: Source["access"];
  allowedRoles: Source["allowedRoles"];
  content: string;
  createdAt: string;
  createdBy: string;
  mode: "line" | "paragraph";
};

function chunkId(sourceId: string, index: number): string {
  return `chunk-${sourceId}-${String(index + 1).padStart(2, "0")}`;
}

function buildSource(input: SourceInput): Source {
  const chunks: Chunk[] = chunkText(input.content, input.mode).map((chunk) => ({
    id: chunkId(input.id, chunk.index),
    sourceId: input.id,
    projectId: PROJECT.id,
    index: chunk.index,
    page: null,
    section: chunk.section,
    content: chunk.content,
    charStart: chunk.charStart,
    charEnd: chunk.charEnd,
    hash: sha256(chunk.content),
  }));

  return {
    id: input.id,
    projectId: PROJECT.id,
    title: input.title,
    kind: input.kind,
    access: input.access,
    allowedRoles: input.allowedRoles,
    content: input.content,
    chunks,
    hash: sha256(input.content),
    createdAt: input.createdAt,
    createdBy: input.createdBy,
    synthetic: true,
    extracted: true,
  };
}

function citation(
  claimId: string,
  source: Source,
  quote: string,
  location?: string,
): Citation {
  const chunk = source.chunks.find((item) => item.content.includes(quote));
  if (!chunk) {
    throw new Error(`Seed quote is not inside a single chunk of ${source.id}: ${quote}`);
  }
  return {
    id: `cite-${claimId}-${chunk.id}`,
    claimId,
    sourceId: source.id,
    chunkId: chunk.id,
    quote,
    page: null,
    location: location ?? `${source.title} · ${chunk.section}`,
    verification: "VERIFIED",
    quoteHash: quoteHash(quote),
  };
}

const ALL_ROLES: Claim["allowedRoles"] = ["lead", "reviewer", "treasurer", "incoming"];

export function createSeedStore(): Store {
  const github = buildSource({
    id: "src-github",
    title: "CampusConnect · GitHub export",
    kind: "md",
    access: "project",
    allowedRoles: ALL_ROLES,
    createdAt: "2026-10-27T09:00:00.000Z",
    createdBy: "Aarav Anand",
    mode: "paragraph",
    content: [
      "# CampusConnect README",
      "",
      "Deployment target: Vercel.",
      "",
      "## Ownership",
      "",
      "Aarav maintains the deployment workflow.",
      "",
      "Issue #42: Reconcile rider alerts before the pilot.",
    ].join("\n"),
  });

  const meeting = buildSource({
    id: "src-meeting",
    title: "Pilot readiness · meeting notes",
    kind: "md",
    access: "project",
    allowedRoles: ALL_ROLES,
    createdAt: "2026-10-26T15:30:00.000Z",
    createdBy: "Meera Shah",
    mode: "paragraph",
    content: [
      "# Pilot readiness meeting",
      "",
      "Decision: We moved the production deployment to Netlify for the pilot.",
      "",
      "The team selected the new route importer, but the meeting notes do not record why.",
      "",
      "Aarav is currently the only person who knows the bus-map import process.",
    ].join("\n"),
  });

  const chat = buildSource({
    id: "src-chat",
    title: "#campusconnect · chat export",
    kind: "txt",
    access: "project",
    allowedRoles: ALL_ROLES,
    createdAt: "2026-10-25T11:00:00.000Z",
    createdBy: "Riya Kapoor",
    mode: "line",
    content: [
      "Meera: Can someone own rider-alert reconciliation?",
      "Riya: I can review it after the pilot.",
      "Aarav: I will document the route import steps this week.",
    ].join("\n"),
  });

  const tasks = buildSource({
    id: "src-tasks",
    title: "Pilot launch · task board",
    kind: "csv",
    access: "project",
    allowedRoles: ALL_ROLES,
    createdAt: "2026-10-24T10:00:00.000Z",
    createdBy: "Meera Shah",
    mode: "line",
    content: [
      "CC-42 · Reconcile rider alerts · Status: Open · Assignee: Unassigned",
      "CC-31 · Document route import · Status: In progress · Assignee: Aarav",
      "CC-38 · Confirm production deployment target · Status: Open · Assignee: Meera",
      "CC-44 · Add backup owner for route operations · Status: Open · Assignee: Unassigned",
    ].join("\n"),
  });

  const finance = buildSource({
    id: "src-finance",
    title: "Sponsor commitment · restricted note",
    kind: "txt",
    access: "finance",
    allowedRoles: ["lead", "treasurer"],
    createdAt: "2026-10-23T09:00:00.000Z",
    createdBy: "Meera Shah",
    mode: "line",
    content: [
      "SYNTHETIC DEMO ONLY - not real sponsor data.",
      "Sample sponsor budget: $18,400.",
      "Fictional demo contact: +1 (202) 555-0147.",
    ].join("\n"),
  });

  const sources = [github, meeting, chat, tasks, finance];
  const now = "2026-11-05T09:00:00.000Z";

  const claims: Claim[] = [
    {
      id: "k-deploy",
      projectId: PROJECT.id,
      type: "DECISION",
      title: "Production deployment target is conflicting",
      description:
        "The repository export says Vercel, while the latest pilot meeting says Netlify. A reviewer must confirm the current target.",
      rationale: "Two source records disagree; no rationale has been approved yet.",
      owner: "Meera Shah",
      priority: "high",
      subjectKey: "deployment-target",
      attributes: { target: "vercel,netlify", conflict: "netlify,vercel" },
      status: "CONFLICTING",
      evidenceStatus: "CONFLICTING",
      confidence: 0.52,
      allowedRoles: ALL_ROLES,
      citations: [
        citation(
          "k-deploy",
          github,
          "Deployment target: Vercel.",
          "README.md · Deployment",
        ),
        citation(
          "k-deploy",
          meeting,
          "Decision: We moved the production deployment to Netlify for the pilot.",
          "Pilot readiness · Decision",
        ),
      ],
      createdAt: "2026-10-27T09:05:00.000Z",
      updatedAt: now,
    },
    {
      id: "k-rationale",
      projectId: PROJECT.id,
      type: "DECISION",
      title: "Route importer decision has no rationale",
      description:
        "A route importer was selected, but the available meeting note does not explain the trade-off or alternatives.",
      subjectKey: "decision-rationale",
      priority: "high",
      status: "MISSING_EVIDENCE",
      evidenceStatus: "MISSING_EVIDENCE",
      confidence: 0.38,
      allowedRoles: ALL_ROLES,
      citations: [
        citation("k-rationale", meeting, "The team selected the new route importer, but the meeting notes do not record why."),
      ],
      createdAt: "2026-10-26T15:35:00.000Z",
      updatedAt: now,
    },
    {
      id: "k-busmap",
      projectId: PROJECT.id,
      type: "RISK",
      title: "Bus-map import knowledge is concentrated",
      description:
        "The notes identify Aarav as the only current holder of the bus-map import process. Add a backup owner and document the runbook.",
      rationale:
        "Synthetic fixture approved during demo preparation to demonstrate a verified continuity risk.",
      owner: "Aarav Anand",
      priority: "high",
      subjectKey: "knowledge-concentration",
      status: "APPROVED",
      evidenceStatus: "SUPPORTED",
      confidence: 0.96,
      allowedRoles: ALL_ROLES,
      citations: [
        citation("k-busmap", meeting, "Aarav is currently the only person who knows the bus-map import process."),
      ],
      createdAt: "2026-10-26T15:40:00.000Z",
      updatedAt: now,
    },
    {
      id: "k-owner",
      projectId: PROJECT.id,
      type: "TASK",
      title: "Rider-alert reconciliation has no owner",
      description:
        "Task CC-42 is open with no assignee. Confirm an owner before the pilot handover.",
      dueDate: "2026-11-03",
      priority: "high",
      subjectKey: "ownership-gap",
      attributes: { taskStatus: "open", reference: "CC-42" },
      status: "NEEDS_REVIEW",
      evidenceStatus: "SUPPORTED",
      confidence: 0.99,
      allowedRoles: ALL_ROLES,
      citations: [
        citation("k-owner", tasks, "CC-42 · Reconcile rider alerts · Status: Open · Assignee: Unassigned"),
      ],
      createdAt: "2026-10-24T10:05:00.000Z",
      updatedAt: now,
    },
    {
      id: "k-task-route",
      projectId: PROJECT.id,
      type: "TASK",
      title: "Document route import",
      description:
        "Aarav is documenting the route-import steps this week. This is the operational runbook the incoming owner needs.",
      owner: "Aarav Anand",
      dueDate: "2026-11-04",
      priority: "high",
      attributes: { taskStatus: "in_progress", reference: "CC-31" },
      status: "APPROVED",
      evidenceStatus: "SUPPORTED",
      confidence: 0.88,
      allowedRoles: ALL_ROLES,
      citations: [
        citation("k-task-route", tasks, "CC-31 · Document route import · Status: In progress · Assignee: Aarav"),
      ],
      createdAt: "2026-10-24T10:06:00.000Z",
      updatedAt: now,
    },
    {
      id: "k-task-deploy",
      projectId: PROJECT.id,
      type: "TASK",
      title: "Confirm production deployment target",
      description:
        "Meera owns the task to confirm the current deployment target before the pilot.",
      owner: "Meera Shah",
      dueDate: "2026-11-05",
      priority: "high",
      subjectKey: "deployment-target-task",
      attributes: { taskStatus: "open", reference: "CC-38" },
      status: "NEEDS_REVIEW",
      evidenceStatus: "SUPPORTED",
      confidence: 0.8,
      allowedRoles: ALL_ROLES,
      citations: [
        citation("k-task-deploy", tasks, "CC-38 · Confirm production deployment target · Status: Open · Assignee: Meera"),
      ],
      createdAt: "2026-10-24T10:07:00.000Z",
      updatedAt: now,
    },
    {
      id: "k-task-backup",
      projectId: PROJECT.id,
      type: "TASK",
      title: "Add backup owner for route operations",
      description:
        "No backup owner is assigned for route operations. The incoming owner must not become the next single point of failure.",
      dueDate: "2026-11-07",
      priority: "high",
      subjectKey: "ownership-gap",
      attributes: { taskStatus: "open", reference: "CC-44" },
      status: "NEEDS_REVIEW",
      evidenceStatus: "SUPPORTED",
      confidence: 0.95,
      allowedRoles: ALL_ROLES,
      citations: [
        citation("k-task-backup", tasks, "CC-44 · Add backup owner for route operations · Status: Open · Assignee: Unassigned"),
      ],
      createdAt: "2026-10-24T10:08:00.000Z",
      updatedAt: now,
    },
    {
      id: "k-dependency",
      projectId: PROJECT.id,
      type: "DEPENDENCY",
      title: "Pilot launch depends on rider-alert reconciliation",
      description:
        "Issue #42 records that rider alerts must be reconciled before the pilot can proceed.",
      owner: "Riya Kapoor",
      priority: "high",
      subjectKey: "pilot-dependency",
      status: "APPROVED",
      evidenceStatus: "PARTIAL",
      confidence: 0.86,
      allowedRoles: ALL_ROLES,
      citations: [
        citation("k-dependency", github, "Issue #42: Reconcile rider alerts before the pilot."),
      ],
      createdAt: "2026-10-27T09:06:00.000Z",
      updatedAt: now,
    },
    {
      id: "k-question",
      projectId: PROJECT.id,
      type: "QUESTION",
      title: "Who will own rider-alert reconciliation?",
      description:
        "Meera asked for an owner in the team chat. Riya offered to review it after the pilot, which is not a confirmed handover owner.",
      priority: "high",
      subjectKey: "ownership-question",
      status: "NEEDS_REVIEW",
      evidenceStatus: "SUPPORTED",
      confidence: 0.7,
      allowedRoles: ALL_ROLES,
      citations: [
        citation("k-question", chat, "Meera: Can someone own rider-alert reconciliation?"),
      ],
      createdAt: "2026-10-25T11:05:00.000Z",
      updatedAt: now,
    },
    {
      id: "k-next-riya",
      projectId: PROJECT.id,
      type: "NEXT_ACTION",
      title: "Riya to review rider-alert reconciliation after the pilot",
      description:
        "Riya offered a review after the pilot. The offer has no due date and is not a commitment to own the work.",
      owner: "Riya Kapoor",
      priority: "medium",
      status: "NEEDS_REVIEW",
      evidenceStatus: "SUPPORTED",
      confidence: 0.64,
      allowedRoles: ALL_ROLES,
      citations: [
        citation("k-next-riya", chat, "Riya: I can review it after the pilot."),
      ],
      createdAt: "2026-10-25T11:06:00.000Z",
      updatedAt: now,
    },
    {
      id: "k-finance",
      projectId: PROJECT.id,
      type: "NOTE",
      title: "Synthetic sponsor commitment",
      description:
        "Restricted synthetic finance record included to demonstrate role-aware source redaction. It is not real sponsor data.",
      owner: "Meera Shah",
      priority: "medium",
      status: "APPROVED",
      evidenceStatus: "SUPPORTED",
      confidence: 1,
      allowedRoles: ["lead", "treasurer"],
      citations: [
        citation("k-finance", finance, "Sample sponsor budget: $18,400."),
        citation("k-finance", finance, "Fictional demo contact: +1 (202) 555-0147."),
      ],
      createdAt: "2026-10-23T09:05:00.000Z",
      updatedAt: now,
    },
  ];

  const relationships: Relationship[] = [
    {
      id: "rel-deploy-task",
      projectId: PROJECT.id,
      fromClaimId: "k-deploy",
      toClaimId: "k-task-deploy",
      relation: "AFFECTS",
      confidence: 0.9,
      createdAt: now,
    },
    {
      id: "rel-deploy-owner",
      projectId: PROJECT.id,
      fromClaimId: "k-task-deploy",
      toClaimId: "k-owner",
      relation: "DEPENDS_ON",
      confidence: 0.85,
      createdAt: now,
    },
    {
      id: "rel-owner-backup",
      projectId: PROJECT.id,
      fromClaimId: "k-owner",
      toClaimId: "k-task-backup",
      relation: "DEPENDS_ON",
      confidence: 0.8,
      createdAt: now,
    },
    {
      id: "rel-busmap-backup",
      projectId: PROJECT.id,
      fromClaimId: "k-busmap",
      toClaimId: "k-task-backup",
      relation: "AFFECTS",
      confidence: 0.88,
      createdAt: now,
    },
    {
      id: "rel-dependency-owner",
      projectId: PROJECT.id,
      fromClaimId: "k-dependency",
      toClaimId: "k-owner",
      relation: "DEPENDS_ON",
      confidence: 0.76,
      createdAt: now,
    },
  ];

  const reviews: ReviewRecord[] = [
    {
      id: "review-seed-busmap",
      claimId: "k-busmap",
      reviewer: "Meera Shah",
      action: "approve",
      fromStatus: "NEEDS_REVIEW",
      toStatus: "APPROVED",
      comment:
        "Approved as a synthetic fixture: the quotation is exact and the continuity risk is explicit.",
      at: "2026-10-26T16:00:00.000Z",
    },
    {
      id: "review-seed-route",
      claimId: "k-task-route",
      reviewer: "Meera Shah",
      action: "approve",
      fromStatus: "NEEDS_REVIEW",
      toStatus: "APPROVED",
      comment: "Task and owner are directly quoted from the task board.",
      at: "2026-10-26T16:05:00.000Z",
    },
    {
      id: "review-seed-dependency",
      claimId: "k-dependency",
      reviewer: "Meera Shah",
      action: "approve",
      fromStatus: "NEEDS_REVIEW",
      toStatus: "APPROVED",
      comment: "Exact issue reference; owner remains a separate open question.",
      at: "2026-10-27T10:00:00.000Z",
    },
    {
      id: "review-seed-finance",
      claimId: "k-finance",
      reviewer: "Meera Shah",
      action: "approve",
      fromStatus: "NEEDS_REVIEW",
      toStatus: "APPROVED",
      comment: "Synthetic finance fixture, restricted to lead and treasurer roles.",
      at: "2026-10-23T10:00:00.000Z",
    },
  ];

  const audit: AuditEvent[] = [
    {
      id: "evt-seed-1",
      at: "2026-10-27T09:00:00.000Z",
      kind: "source.added",
      title: "GitHub export ingested",
      actor: "Aarav Anand",
      sourceId: "src-github",
    },
    {
      id: "evt-seed-2",
      at: "2026-10-26T16:00:00.000Z",
      kind: "claim.approved",
      title: "Continuity risk approved after evidence check",
      actor: "Meera Shah",
      claimId: "k-busmap",
    },
    {
      id: "evt-seed-3",
      at: "2026-10-25T11:00:00.000Z",
      kind: "conflict.detected",
      title: "Vercel and Netlify deployment records disagree",
      actor: "RelayMap extraction",
      claimId: "k-deploy",
    },
    {
      id: "evt-seed-4",
      at: "2026-10-24T10:05:00.000Z",
      kind: "ownership.gap",
      title: "CC-42 has no assignee",
      actor: "RelayMap extraction",
      claimId: "k-owner",
    },
  ];

  const interviewQuestions: InterviewQuestion[] = [
    {
      id: "q-deploy",
      projectId: PROJECT.id,
      question: "Which deployment target is current: Vercel or Netlify, and why was it changed?",
      rationale: "Two source records disagree and no rationale is recorded.",
      status: "open",
      createdAt: now,
    },
    {
      id: "q-owner",
      projectId: PROJECT.id,
      question: "Who will own rider-alert reconciliation before the pilot?",
      rationale: "CC-42 is open with no assignee.",
      status: "open",
      createdAt: now,
    },
    {
      id: "q-rationale",
      projectId: PROJECT.id,
      question: "Why was the new route importer selected over the alternatives?",
      rationale: "The meeting note explicitly says the reason is not recorded.",
      status: "open",
      createdAt: now,
    },
    {
      id: "q-runbook",
      projectId: PROJECT.id,
      question: "What is the recovery procedure if the route importer fails during the pilot?",
      rationale: "Only one person currently knows the bus-map import process.",
      status: "open",
      createdAt: now,
    },
  ];

  const handovers: Handover[] = [];
  const acknowledgements: Store["acknowledgements"] = [];

  return {
    project: PROJECT,
    sources,
    claims,
    relationships,
    reviews,
    audit,
    handovers,
    acknowledgements,
    interviewQuestions,
    extractionRuns: 1,
    seedVersion: 1,
  };
}
