import { randomUUID } from "node:crypto";
import type {
  Acknowledgement,
  AuditEvent,
  Claim,
  Handover,
  InterviewQuestion,
  Readiness,
  Role,
  Source,
  Store,
} from "./types";
import { capabilitiesFor } from "./roles";
import { buildCitation } from "@/lib/domain/citations";
import { draftToClaim, toClaimTypeCategory } from "@/lib/domain/extraction";
import { extractDrafts } from "@/lib/extraction/engine";
import { answerFromKnowledge, type BuddyAnswer } from "@/lib/agents/buddy";
import { generateGapQuestions } from "@/lib/agents/interviewer";
import { buildScribeDraft } from "@/lib/agents/scribe";
import { verifyClaimEvidence } from "@/lib/domain/evidence";
import {
  createHandoverVersion,
  latestVersion,
  publishHandover as publishVersion,
  acknowledgeHandover as buildAcknowledgement,
} from "@/lib/domain/handover";
import { traverseImpact } from "@/lib/domain/graph";
import { calculateReadiness } from "@/lib/domain/readiness";
import { redactClaimsForRole } from "@/lib/domain/redaction";
import { sha256 } from "@/lib/domain/hash";
import {
  MAX_SOURCE_BYTES,
  chunkText,
  parseDocument,
  parseDocumentAsync,
  type ParsedDocument,
} from "@/lib/ingestion/document-parser";

export type ServiceFailure = {
  ok: false;
  status: number;
  code: string;
  message: string;
  fields?: Record<string, string>;
};

export type ServiceSuccess<T> = { ok: true; value: T };
export type ServiceResult<T> = ServiceSuccess<T> | ServiceFailure;

function failure(
  status: number,
  code: string,
  message: string,
  fields?: Record<string, string>,
): ServiceFailure {
  return { ok: false, status, code, message, fields };
}

function nowIso(): string {
  return new Date().toISOString();
}

function audit(
  store: Store,
  event: Omit<AuditEvent, "id" | "at">,
): AuditEvent {
  const entry: AuditEvent = { id: `evt-${randomUUID()}`, at: nowIso(), ...event };
  store.audit.push(entry);
  return entry;
}

export function visibleClaims(store: Store, role: Role): Claim[] {
  return redactClaimsForRole(store.claims, store.sources, role).visible;
}

export function computeReadiness(store: Store, role: Role): Readiness {
  return calculateReadiness({
    claims: visibleClaims(store, role),
    sources: store.sources,
    handovers: store.handovers.filter((handover) => handover.audienceRole === role),
    acknowledgements: store.acknowledgements,
  });
}

type BuildSourceInput = {
  document: ParsedDocument;
  projectId: string;
  access: Source["access"];
  allowedRoles: Role[];
  createdBy: string;
  /** Optional human-readable title; uploads fall back to the filename. */
  title?: string;
};

function buildSource(input: BuildSourceInput): Source {
  const id = `src-${randomUUID()}`;
  const chunks = chunkText(
    input.document.text,
    input.document.chunkMode,
    input.document.pages,
  ).map((chunk) => ({
    id: `chunk-${id}-${String(chunk.index + 1).padStart(3, "0")}`,
    sourceId: id,
    projectId: input.projectId,
    index: chunk.index,
    page: chunk.page,
    section: chunk.section,
    content: chunk.content,
    charStart: chunk.charStart,
    charEnd: chunk.charEnd,
    hash: sha256(chunk.content),
  }));

  return {
    id,
    projectId: input.projectId,
    title: input.title?.trim() || input.document.filename,
    kind: input.document.kind,
    access: input.access,
    allowedRoles: input.allowedRoles,
    content: input.document.text,
    chunks,
    hash: input.document.contentHash,
    createdAt: nowIso(),
    createdBy: input.createdBy,
    synthetic: true,
    extracted: false,
  };
}

function deploymentTargets(claim: Claim): string[] {
  const raw = claim.attributes?.target ?? "";
  return raw
    .split(",")
    .map((value) => value.trim().toLowerCase())
    .filter((value) => value.length > 0 && value !== "conflict");
}

function reconcileDeploymentConflicts(store: Store): number {
  const group = store.claims.filter(
    (claim) => claim.subjectKey === "deployment-target" && deploymentTargets(claim).length > 0,
  );
  const targets = new Set(group.flatMap(deploymentTargets));
  if (targets.size <= 1) return 0;

  let changed = 0;
  for (const claim of group) {
    if (
      claim.status === "APPROVED" ||
      claim.status === "REJECTED" ||
      claim.status === "SUPERSEDED"
    ) {
      continue;
    }
    claim.status = "CONFLICTING";
    claim.evidenceStatus = "CONFLICTING";
    claim.confidence = Math.min(claim.confidence, 0.4);
    claim.attributes = { ...claim.attributes, conflict: [...targets].sort().join(",") };
    claim.updatedAt = nowIso();
    changed += 1;
  }
  return changed;
}

export type AddSourceInput = {
  filename: string;
  /** Plain text upload for text-like formats. */
  content?: string;
  /** Base64 upload for binary formats (PDF, DOCX). */
  contentBase64?: string;
  access: Source["access"];
  role: Role;
  actor: string;
};

function decodeBase64(value: string): Uint8Array | null {
  const compact = value.replace(/\s+/g, "");
  if (!compact || compact.length % 4 !== 0 || !/^[A-Za-z0-9+/]+={0,2}$/.test(compact)) {
    return null;
  }
  const buffer = Buffer.from(compact, "base64");
  // Re-encoding catches silently truncated or non-canonical input.
  if (buffer.toString("base64").replace(/=+$/, "") !== compact.replace(/=+$/, "")) {
    return null;
  }
  return new Uint8Array(buffer);
}

export async function addSource(
  store: Store,
  input: AddSourceInput,
): Promise<ServiceResult<{ source: Source; claimIds: string[]; conflicts: number }>> {
  if (!capabilitiesFor(input.role).canUpload) {
    return failure(403, "FORBIDDEN", "This role cannot add project sources.");
  }
  if (input.access === "finance" && !["lead", "treasurer"].includes(input.role)) {
    return failure(403, "FORBIDDEN", "Only the project lead or treasurer can add finance sources.");
  }

  let parsed;
  if (input.contentBase64 !== undefined) {
    const bytes = decodeBase64(input.contentBase64);
    if (!bytes) {
      return failure(400, "MALFORMED_SOURCE", "The base64 file payload is not valid base64.");
    }
    parsed = await parseDocumentAsync({ filename: input.filename, bytes });
  } else if (typeof input.content === "string") {
    parsed = parseDocument({ filename: input.filename, content: input.content });
  } else {
    return failure(400, "VALIDATION_FAILED", "Provide either content or contentBase64.");
  }

  if (!parsed.ok) {
    return failure(
      parsed.code === "PAYLOAD_TOO_LARGE"
        ? 413
        : parsed.code === "UNSUPPORTED_MEDIA_TYPE"
          ? 415
          : parsed.code === "PARSER_UNAVAILABLE"
            ? 503
            : 400,
      parsed.code,
      parsed.message,
    );
  }

  const duplicate = store.sources.find(
    (source) => source.hash === parsed.document.contentHash,
  );
  if (duplicate) {
    return failure(409, "CONFLICT", `This source is already present as "${duplicate.title}".`);
  }

  const source = buildSource({
    document: parsed.document,
    projectId: store.project.id,
    access: input.access,
    allowedRoles: input.access === "finance" ? ["lead", "treasurer"] : ["lead", "reviewer", "treasurer", "incoming"],
    createdBy: input.actor,
  });
  store.sources.push(source);
  audit(store, {
    kind: "source.added",
    title: `Source ingested: ${source.title}`,
    actor: input.actor,
    sourceId: source.id,
  });

  const extraction = runExtraction(store, {
    sourceIds: [source.id],
    role: input.role,
    actor: input.actor,
  });
  if (!extraction.ok) return extraction;

  return {
    ok: true,
    value: {
      source,
      claimIds: extraction.value.claimIds,
      conflicts: extraction.value.conflicts,
    },
  };
}

export type ExtractionResult = {
  claimIds: string[];
  added: number;
  conflicts: number;
  sourceIds: string[];
};

export function runExtraction(
  store: Store,
  input: { sourceIds?: string[]; role: Role; actor: string },
): ServiceResult<ExtractionResult> {
  if (!capabilitiesFor(input.role).canReview && !capabilitiesFor(input.role).canUpload) {
    return failure(403, "FORBIDDEN", "This role cannot run extraction.");
  }

  const targets = store.sources.filter((source) =>
    input.sourceIds ? input.sourceIds.includes(source.id) : !source.extracted,
  );

  if (!targets.length) {
    return { ok: true, value: { claimIds: [], added: 0, conflicts: 0, sourceIds: [] } };
  }

  const created: string[] = [];
  for (const source of targets) {
    if (source.projectId !== store.project.id) continue;
    const drafts = extractDrafts([source]);
    for (const draft of drafts) {
      const duplicate = store.claims.some((claim) =>
        claim.citations.some(
          (citation) =>
            citation.sourceId === draft.sourceId && citation.quote === draft.quote,
        ),
      );
      if (duplicate) continue;

      const claimId = `k-${randomUUID()}`;
      const claim = draftToClaim(draft, claimId, store.project.id, nowIso());
      const citedChunk = source.chunks.find((chunk) => chunk.id === draft.chunkId);
      claim.allowedRoles =
        source.access === "finance"
          ? ["lead", "treasurer"]
          : ["lead", "reviewer", "treasurer", "incoming"];
      claim.citations = [
        buildCitation(
          `cite-${claimId}-${draft.chunkId}`,
          claimId,
          source,
          {
            sourceId: draft.sourceId,
            chunkId: draft.chunkId,
            quote: draft.quote,
            page: citedChunk?.page ?? null,
          },
          draft.location,
          "VERIFIED",
        ),
      ];
      store.claims.push(claim);
      created.push(claim.id);
    }
    source.extracted = true;
  }

  const conflicts = reconcileDeploymentConflicts(store);
  store.extractionRuns += 1;

  audit(store, {
    kind: "extraction.run",
    title: `Extraction produced ${created.length} claim(s) from ${targets.length} source(s)`,
    actor: input.actor,
  });

  return {
    ok: true,
    value: {
      claimIds: created,
      added: created.length,
      conflicts,
      sourceIds: targets.map((source) => source.id),
    },
  };
}

export type ReviewAction =
  | "approve"
  | "reject"
  | "edit"
  | "resolve_conflict"
  | "request_clarification"
  | "mark_inferred";

const REVIEW_TRANSITIONS: Record<ReviewAction, Claim["status"]> = {
  approve: "APPROVED",
  reject: "REJECTED",
  edit: "NEEDS_REVIEW",
  resolve_conflict: "APPROVED",
  request_clarification: "NEEDS_REVIEW",
  mark_inferred: "INFERRED",
};

export function reviewClaim(
  store: Store,
  input: {
    claimId: string;
    action: ReviewAction;
    role: Role;
    actor: string;
    comment?: string;
    title?: string;
    description?: string;
    rationale?: string;
  },
): ServiceResult<Claim> {
  if (!capabilitiesFor(input.role).canReview) {
    return failure(403, "FORBIDDEN", "This role cannot review claims.");
  }
  const claim = visibleClaims(store, input.role).find((item) => item.id === input.claimId);
  if (!claim) return failure(404, "NOT_FOUND", "Claim not found.");

  const comment = input.comment?.trim() ?? "";
  if (
    ["reject", "edit", "resolve_conflict", "request_clarification"].includes(input.action) &&
    !comment
  ) {
    return failure(400, "VALIDATION_FAILED", "A reviewer comment is required for this action.");
  }

  if (input.action === "approve" || input.action === "resolve_conflict") {
    const verification = verifyClaimEvidence(claim, store.sources);
    if (!verification.ok) {
      return failure(422, "UNPROCESSABLE", "The claim cannot be approved.", {
        evidence: verification.errors.join(" "),
      });
    }
    if (input.action === "resolve_conflict" && !input.rationale?.trim() && !comment) {
      return failure(
        400,
        "VALIDATION_FAILED",
        "Resolving a conflict requires a recorded human rationale.",
      );
    }
  }

  const fromStatus = claim.status;
  if (input.action === "edit") {
    if (input.title?.trim()) claim.title = input.title.trim();
    if (input.description?.trim()) claim.description = input.description.trim();
    if (input.rationale?.trim()) claim.rationale = input.rationale.trim();
  }
  if (input.action === "resolve_conflict" && (input.rationale?.trim() || comment)) {
    claim.rationale = input.rationale?.trim() || comment;
  }

  claim.status = REVIEW_TRANSITIONS[input.action];
  claim.updatedAt = nowIso();
  if (input.action === "approve" || input.action === "resolve_conflict") {
    claim.evidenceStatus = claim.citations.length > 1 ? "SUPPORTED" : "PARTIAL";
  }

  store.reviews.push({
    id: `review-${randomUUID()}`,
    claimId: claim.id,
    reviewer: input.actor,
    action:
      input.action === "mark_inferred"
        ? "approve"
        : input.action,
    fromStatus,
    toStatus: claim.status,
    comment: comment || "Reviewed in the synthetic demo.",
    at: nowIso(),
  });

  audit(store, {
    kind: `claim.${input.action}`,
    title: `${toClaimTypeCategory(claim.type)} ${input.action.replace("_", " ")}: ${claim.title}`,
    actor: input.actor,
    claimId: claim.id,
  });

  return { ok: true, value: claim };
}

export function createHandover(
  store: Store,
  input: { role: Role; actor: string; audienceRole: Role; title?: string },
): ServiceResult<Handover> {
  if (!capabilitiesFor(input.role).canManage) {
    return failure(403, "FORBIDDEN", "Only the project lead can generate a handover.");
  }

  const readiness = computeReadiness(store, input.audienceRole);
  const scribe = buildScribeDraft({
    project: store.project,
    claims: store.claims,
    sources: store.sources,
    audienceRole: input.audienceRole,
  });
  const assembly = scribe.assembly;

  const handoverId = `ho-${randomUUID()}`;
  const draft: Handover = {
    id: handoverId,
    projectId: store.project.id,
    title: input.title?.trim() || "CampusConnect handover",
    audienceRole: input.audienceRole,
    status: "draft",
    createdAt: nowIso(),
    versions: [],
  };

  const version = createHandoverVersion({
    id: `hv-${randomUUID()}`,
    handover: draft,
    audienceRole: input.audienceRole,
    createdBy: input.actor,
    createdAt: nowIso(),
    readiness,
    assembly,
  });

  draft.versions = [version];
  store.handovers.push(draft);

  audit(store, {
    kind: "handover.created",
    title: `Handover draft created for ${input.audienceRole}`,
    actor: input.actor,
    handoverId,
  });

  return { ok: true, value: draft };
}

export function publishHandover(
  store: Store,
  input: { handoverId: string; role: Role; actor: string },
): ServiceResult<Handover> {
  if (!capabilitiesFor(input.role).canManage) {
    return failure(403, "FORBIDDEN", "Only the project lead can publish a handover.");
  }
  const handover = store.handovers.find((item) => item.id === input.handoverId);
  if (!handover) return failure(404, "NOT_FOUND", "Handover not found.");

  const version = latestVersion(handover);
  if (!version) return failure(422, "UNPROCESSABLE", "The handover has no version to publish.");
  if (version.publishedAt) {
    return failure(409, "CONFLICT", "A published handover version is immutable.");
  }
  const approvedClaims = version.sections.reduce(
    (count, section) => count + section.claims.length,
    0,
  );
  if (approvedClaims === 0) {
    return failure(
      422,
      "UNPROCESSABLE",
      "A handover cannot be published before at least one claim is approved.",
    );
  }

  const published = publishVersion(handover, version.id, nowIso());
  const index = store.handovers.findIndex((item) => item.id === handover.id);
  store.handovers[index] = published;

  audit(store, {
    kind: "handover.published",
    title: `Handover version ${version.version} published`,
    actor: input.actor,
    handoverId: handover.id,
  });

  return { ok: true, value: published };
}

export function acknowledgeHandover(
  store: Store,
  input: { handoverId: string; role: Role; actor: string; note?: string },
): ServiceResult<Acknowledgement> {
  const handover = store.handovers.find((item) => item.id === input.handoverId);
  if (!handover) return failure(404, "NOT_FOUND", "Handover not found.");
  if (input.role !== handover.audienceRole) {
    return failure(403, "FORBIDDEN", "Only the intended recipient can acknowledge this handover.");
  }
  if (handover.status !== "published" || !handover.currentVersionId) {
    return failure(422, "UNPROCESSABLE", "Only a published handover can be acknowledged.");
  }

  const duplicate = store.acknowledgements.find(
    (ack) =>
      ack.handoverId === handover.id &&
      ack.versionId === handover.currentVersionId &&
      ack.acknowledgedBy === input.actor,
  );
  if (duplicate) {
    return failure(409, "CONFLICT", "This handover version has already been acknowledged.");
  }

  const acknowledgement = buildAcknowledgement({
    id: `ack-${randomUUID()}`,
    handover,
    versionId: handover.currentVersionId,
    acknowledgedBy: input.actor,
    role: input.role,
    note: input.note?.trim() || "Receipt acknowledged in the synthetic demo.",
    at: nowIso(),
  });
  store.acknowledgements.push(acknowledgement);

  audit(store, {
    kind: "handover.acknowledged",
    title: `Handover version ${latestVersion(handover)?.version ?? ""} acknowledged`,
    actor: input.actor,
    handoverId: handover.id,
  });

  return { ok: true, value: acknowledgement };
}

export function answerInterviewQuestion(
  store: Store,
  input: { questionId: string; answer: string; role: Role; actor: string },
): ServiceResult<{ question: InterviewQuestion; source: Source }> {
  if (!input.answer.trim()) {
    return failure(400, "VALIDATION_FAILED", "An answer is required.");
  }
  if (!["lead", "reviewer"].includes(input.role)) {
    return failure(403, "FORBIDDEN", "This role cannot record interview answers.");
  }
  const question = store.interviewQuestions.find((item) => item.id === input.questionId);
  if (!question) return failure(404, "NOT_FOUND", "Interview question not found.");

  question.status = "answered";
  question.answer = input.answer.trim();
  question.answeredBy = input.actor;
  question.answeredAt = nowIso();

  const content = `Interview question: ${question.question}\nInterview answer: ${question.answer}`;
  const document: ParsedDocument = {
    filename: `interview-${question.id}.md`,
    kind: "interview",
    text: content,
    contentHash: sha256(content),
    chunkMode: "line",
    bytes: Buffer.byteLength(content, "utf8"),
  };
  const source = buildSource({
    document,
    projectId: store.project.id,
    access: "project",
    allowedRoles: ["lead", "reviewer", "treasurer", "incoming"],
    createdBy: input.actor,
    title: `Interview answer recorded: ${question.question}`,
  });
  store.sources.push(source);

  audit(store, {
    kind: "interview.answered",
    title: `Interview answer recorded: ${question.question}`,
    actor: input.actor,
    sourceId: source.id,
  });

  return { ok: true, value: { question, source } };
}

export function generateInterviewQuestions(
  store: Store,
  input: { role: Role; actor: string },
): ServiceResult<InterviewQuestion[]> {
  if (!["lead", "reviewer"].includes(input.role)) {
    return failure(403, "FORBIDDEN", "This role cannot generate interview questions.");
  }

  const gaps = generateGapQuestions(
    visibleClaims(store, input.role),
    store.interviewQuestions.map((question) => question.question),
  );
  if (!gaps.length) return { ok: true, value: [] };

  const created: InterviewQuestion[] = gaps.map((gap) => ({
    id: `q-${randomUUID()}`,
    projectId: store.project.id,
    question: gap.question,
    rationale: gap.rationale,
    status: "open",
    createdAt: nowIso(),
  }));
  store.interviewQuestions.push(...created);

  audit(store, {
    kind: "interview.generated",
    title: `Interviewer generated ${created.length} gap question(s)`,
    actor: input.actor,
  });

  return { ok: true, value: created };
}

export function askBuddy(
  store: Store,
  input: { question: string; role: Role },
): ServiceResult<BuddyAnswer> {
  const question = input.question.trim();
  if (question.length < 3) {
    return failure(400, "VALIDATION_FAILED", "A question of at least 3 characters is required.");
  }
  return {
    ok: true,
    value: answerFromKnowledge(question, visibleClaims(store, input.role)),
  };
}

export function projectImpact(
  store: Store,
  input: { claimId: string; role: Role; maxDepth?: number },
): ServiceResult<{
  startClaimId: string;
  nodes: { claim: Claim; depth: number; path: string[]; relation: string }[];
  hiddenCount: number;
}> {
  const visible = visibleClaims(store, input.role);
  const visibleIds = new Set(visible.map((claim) => claim.id));
  if (!visibleIds.has(input.claimId)) {
    return failure(404, "NOT_FOUND", "Claim not found.");
  }
  const traversed = traverseImpact(
    input.claimId,
    store.relationships,
    Math.max(1, Math.min(5, input.maxDepth ?? 3)),
  );
  const byId = new Map(store.claims.map((claim) => [claim.id, claim]));
  const nodes = traversed
    .filter((node) => visibleIds.has(node.claimId))
    .map((node) => ({
      claim: byId.get(node.claimId)!,
      depth: node.depth,
      path: node.path,
      relation: node.relation,
    }));
  return {
    ok: true,
    value: {
      startClaimId: input.claimId,
      nodes,
      hiddenCount: traversed.length - nodes.length,
    },
  };
}

export function reviewQueue(store: Store, role: Role): Claim[] {
  return visibleClaims(store, role)
    .filter(
      (claim) =>
        claim.status === "NEEDS_REVIEW" ||
        claim.status === "INFERRED" ||
        claim.status === "CONFLICTING" ||
        claim.status === "MISSING_EVIDENCE",
    )
    .sort((a, b) => {
      const rank = (status: Claim["status"]) =>
        status === "CONFLICTING" ? 0 : status === "MISSING_EVIDENCE" ? 1 : 2;
      return rank(a.status) - rank(b.status) || a.title.localeCompare(b.title);
    });
}

export function sourceCountsForRole(store: Store, role: Role): Source[] {
  return store.sources.filter((source) => source.allowedRoles.includes(role));
}

export { MAX_SOURCE_BYTES };
