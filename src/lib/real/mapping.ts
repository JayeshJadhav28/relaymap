import type {
  Acknowledgement,
  AuditEvent,
  Chunk,
  Claim,
  Citation,
  ClaimType,
  EvidenceStatus,
  Handover,
  HandoverVersion,
  Priority,
  Project,
  Relation,
  ReviewRecord,
  Role,
  Source,
  SourceAccess,
  SourceKind,
  VerificationStatus,
} from "@/lib/demo/types";

export type Row = Record<string, unknown>;

export function asRow(value: unknown): Row {
  return value && typeof value === "object" ? (value as Row) : {};
}

export function rows(value: unknown): Row[] {
  return Array.isArray(value) ? value.filter((item) => item && typeof item === "object").map(asRow) : [];
}

export function str(row: Row, key: string, fallback = ""): string {
  const value = row[key];
  return typeof value === "string" ? value : fallback;
}

export function num(row: Row, key: string, fallback = 0): number {
  const value = row[key];
  return typeof value === "number" && Number.isFinite(value) ? value : fallback;
}

export function nullableNum(row: Row, key: string): number | null {
  const value = row[key];
  return typeof value === "number" && Number.isFinite(value) ? value : null;
}

export function bool(row: Row, key: string, fallback = false): boolean {
  const value = row[key];
  return typeof value === "boolean" ? value : fallback;
}

export function object(row: Row, key: string): Row {
  return asRow(row[key]);
}

export function actorLabel(actorId: string, appUserId: string, displayName: string): string {
  return actorId && actorId === appUserId ? displayName : "Workspace member";
}

const CLAIM_TYPES: ClaimType[] = [
  "DECISION",
  "TASK",
  "OWNERSHIP",
  "DEPENDENCY",
  "RISK",
  "BLOCKER",
  "QUESTION",
  "NEXT_ACTION",
  "MISSING_INFO",
  "RECURRING_PROBLEM",
  "NOTE",
];

const STATUSES: VerificationStatus[] = [
  "INFERRED",
  "NEEDS_REVIEW",
  "CONFLICTING",
  "MISSING_EVIDENCE",
  "APPROVED",
  "REJECTED",
  "SUPERSEDED",
];

const EVIDENCE_STATUSES: EvidenceStatus[] = [
  "MISSING_EVIDENCE",
  "PARTIAL",
  "SUPPORTED",
  "CONFLICTING",
];

const RELATIONS: Relation[] = [
  "DEPENDS_ON",
  "AFFECTS",
  "OWNS",
  "WORKED_ON",
  "SUPERSEDES",
  "PART_OF",
  "ABOUT",
  "SUPPORTED_BY",
  "BLOCKS",
  "RELATES_TO",
];

function asClaimType(value: string): ClaimType {
  return CLAIM_TYPES.includes(value as ClaimType) ? (value as ClaimType) : "NOTE";
}

function asStatus(value: string): VerificationStatus {
  return STATUSES.includes(value as VerificationStatus)
    ? (value as VerificationStatus)
    : "INFERRED";
}

function asEvidenceStatus(value: string): EvidenceStatus {
  return EVIDENCE_STATUSES.includes(value as EvidenceStatus)
    ? (value as EvidenceStatus)
    : "MISSING_EVIDENCE";
}

function asRelation(value: string): Relation {
  return RELATIONS.includes(value as Relation) ? (value as Relation) : "RELATES_TO";
}

function sourceKind(sourceType: string, filename: string): SourceKind {
  switch (sourceType) {
    case "markdown":
    case "md":
      return "md";
    case "csv":
      return "csv";
    case "json":
      return "json";
    case "pdf":
      return "pdf";
    case "docx":
      return "docx";
    case "interview":
      return "interview";
    case "txt":
    case "text":
    case "meeting":
    case "chat":
    case "task_board":
    case "github":
      return "txt";
    default: {
      const extension = filename.toLowerCase().split(".").pop();
      if (extension === "md" || extension === "markdown") return "md";
      if (extension === "csv") return "csv";
      if (extension === "json") return "json";
      if (extension === "pdf") return "pdf";
      if (extension === "docx") return "docx";
      return "txt";
    }
  }
}

export function mapProject(row: Row, organizationName: string): Project {
  return {
    id: str(row, "id"),
    organisation: organizationName,
    name: str(row, "name"),
    description: str(row, "description"),
    status: str(row, "status") === "archived" ? "archived" : "active",
    departingMember: "",
    incomingMember: "",
    manager: "",
  };
}

export function mapSource(row: Row, createdBy: string): Source {
  const accessLevel = str(row, "access_level", "project");
  const access: SourceAccess = accessLevel === "finance" ? "finance" : "project";
  const filename = str(row, "filename");
  const chunks: Chunk[] = rows(row.source_chunks)
    .sort((a, b) => num(a, "chunk_index") - num(b, "chunk_index"))
    .map((chunk) => ({
      id: str(chunk, "id"),
      sourceId: str(chunk, "source_id"),
      projectId: str(chunk, "project_id"),
      index: num(chunk, "chunk_index"),
      page: nullableNum(chunk, "page_number"),
      section: str(chunk, "section_title", "Document"),
      content: str(chunk, "content"),
      charStart: num(chunk, "char_start"),
      charEnd: num(chunk, "char_end"),
      hash: str(chunk, "content_hash"),
    }));

  return {
    id: str(row, "id"),
    projectId: str(row, "project_id"),
    title: filename,
    kind: sourceKind(str(row, "source_type"), filename),
    access,
    allowedRoles: access === "finance" ? ["lead", "treasurer"] : ["lead", "reviewer", "treasurer", "incoming"],
    content: str(row, "content"),
    chunks,
    hash: str(row, "content_hash"),
    createdAt: str(row, "created_at", new Date().toISOString()),
    createdBy,
    synthetic: false,
    extracted: str(row, "extraction_status", "pending") === "parsed",
  };
}

export function mapCitation(row: Row): Citation {
  const verification = str(row, "verification", "PENDING");
  return {
    id: str(row, "id"),
    claimId: str(row, "knowledge_item_id"),
    sourceId: str(row, "source_id"),
    chunkId: str(row, "chunk_id"),
    quote: str(row, "exact_snippet"),
    page: nullableNum(row, "page_number"),
    location: str(row, "source_location", "Source"),
    verification:
      verification === "VERIFIED" || verification === "FAILED" ? verification : "PENDING",
    quoteHash: str(row, "quote_hash"),
  };
}

export function mapClaim(row: Row): Claim {
  const attributes = object(row, "attributes");
  const citations = rows(row.evidence_citations).map(mapCitation);
  const accessLevel = str(row, "access_level", "project");
  const reviewerNote = str(row, "reviewer_note").trim();
  const rationale =
    reviewerNote ||
    (typeof attributes.rationale === "string" ? attributes.rationale : undefined);
  const owner =
    typeof attributes.ownerName === "string" && attributes.ownerName.trim()
      ? attributes.ownerName
      : undefined;
  const dueDate =
    typeof attributes.dueDate === "string" && attributes.dueDate.trim()
      ? attributes.dueDate
      : undefined;
  const priorityValue = typeof attributes.priority === "string" ? attributes.priority : "medium";

  return {
    id: str(row, "id"),
    projectId: str(row, "project_id"),
    type: asClaimType(str(row, "claim_type", "NOTE")),
    title: str(row, "title"),
    description: str(row, "description"),
    rationale: rationale || undefined,
    owner,
    dueDate,
    priority: (["low", "medium", "high", "critical"].includes(priorityValue)
      ? priorityValue
      : "medium") as Priority,
    subjectKey: str(row, "subject_key") || undefined,
    attributes: Object.fromEntries(
      Object.entries(attributes).map(([key, value]) => [key, String(value)]),
    ),
    status: asStatus(str(row, "verification_status", "INFERRED")),
    evidenceStatus: asEvidenceStatus(str(row, "evidence_status", "MISSING_EVIDENCE")),
    confidence: num(row, "confidence_score", 0),
    allowedRoles:
      accessLevel === "finance"
        ? ["lead", "treasurer"]
        : ["lead", "reviewer", "treasurer", "incoming"],
    citations,
    createdAt: str(row, "created_at", new Date().toISOString()),
    updatedAt: str(row, "updated_at", new Date().toISOString()),
  };
}

export function mapReview(row: Row, reviewer: string): ReviewRecord {
  const action = str(row, "action", "edit");
  return {
    id: str(row, "id"),
    claimId: str(row, "knowledge_item_id"),
    reviewer,
    action: (["approve", "reject", "edit", "resolve_conflict", "request_clarification", "supersede"].includes(
      action,
    )
      ? action
      : "edit") as ReviewRecord["action"],
    fromStatus: asStatus(str(row, "prior_status", "INFERRED")),
    toStatus: asStatus(str(row, "next_status", "INFERRED")),
    comment: str(row, "comment"),
    at: str(row, "created_at", new Date().toISOString()),
  };
}

function mapVersion(row: Row): HandoverVersion | null {
  const body = object(row, "body");
  const stored = object(body, "handoverVersion");
  if (stored.id && Array.isArray(stored.sections)) {
    return stored as unknown as HandoverVersion;
  }
  return null;
}

export function mapHandover(row: Row): Handover {
  const versions = rows(row.handover_versions)
    .map(mapVersion)
    .filter((version): version is HandoverVersion => Boolean(version))
    .sort((a, b) => a.version - b.version);
  const currentVersion = versions.find((version) => version.version === num(row, "current_version"));
  const dbStatus = str(row, "status", "draft");
  const status: Handover["status"] =
    dbStatus === "published" || dbStatus === "shared" || dbStatus === "acknowledged"
      ? "published"
      : dbStatus === "approved"
        ? "approved"
        : "draft";

  return {
    id: str(row, "id"),
    projectId: str(row, "project_id"),
    title: str(row, "title", "Project handover"),
    audienceRole: str(row, "audience_role", "incoming") as Role,
    status,
    createdAt: str(row, "created_at", new Date().toISOString()),
    versions,
    currentVersionId: currentVersion?.id,
  };
}

export function mapAcknowledgement(row: Row, acknowledgedBy: string): Acknowledgement {
  return {
    id: str(row, "id"),
    handoverId: str(row, "handover_id"),
    versionId: str(row, "version_id"),
    acknowledgedBy,
    role: str(row, "role", "incoming") as Role,
    note: str(row, "note", str(row, "comment")),
    at: str(row, "acknowledged_at", str(row, "created_at", new Date().toISOString())),
  };
}

export function mapAuditEvent(row: Row, actor: string): AuditEvent {
  const metadata = object(row, "metadata");
  const entityType = str(row, "entity_type");
  return {
    id: str(row, "id"),
    at: str(row, "created_at", new Date().toISOString()),
    kind: str(row, "action", "audit.event"),
    title:
      typeof metadata.title === "string" && metadata.title
        ? metadata.title
        : str(row, "action", "Workspace event"),
    actor,
    claimId: entityType === "knowledge_item" ? str(row, "entity_id") || undefined : undefined,
    sourceId: entityType === "source" ? str(row, "entity_id") || undefined : undefined,
    handoverId: entityType === "handover" ? str(row, "entity_id") || undefined : undefined,
  };
}

export function mapRelationship(row: Row) {
  return {
    id: str(row, "id"),
    projectId: str(row, "project_id"),
    fromClaimId: str(row, "from_claim_id"),
    toClaimId: str(row, "to_claim_id"),
    relation: asRelation(str(row, "relation")),
    confidence: num(row, "confidence", 1),
    createdAt: str(row, "created_at", new Date().toISOString()),
  };
}
