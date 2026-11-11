export type Role = "lead" | "reviewer" | "treasurer" | "incoming";

export const ROLES: Role[] = ["lead", "reviewer", "treasurer", "incoming"];

export const DEFAULT_ROLE: Role = "lead";

export const ROLE_LABELS: Record<Role, string> = {
  lead: "Project lead",
  reviewer: "Reviewer",
  treasurer: "Treasurer",
  incoming: "Incoming member",
};

export function isRole(value: unknown): value is Role {
  return typeof value === "string" && (ROLES as string[]).includes(value);
}

export type ClaimType =
  | "DECISION"
  | "TASK"
  | "OWNERSHIP"
  | "DEPENDENCY"
  | "RISK"
  | "BLOCKER"
  | "QUESTION"
  | "NEXT_ACTION"
  | "MISSING_INFO"
  | "RECURRING_PROBLEM"
  | "NOTE";

export const CLAIM_TYPES: ClaimType[] = [
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

export type VerificationStatus =
  | "INFERRED"
  | "NEEDS_REVIEW"
  | "CONFLICTING"
  | "MISSING_EVIDENCE"
  | "APPROVED"
  | "REJECTED"
  | "SUPERSEDED";

export const VERIFICATION_STATUSES: VerificationStatus[] = [
  "INFERRED",
  "NEEDS_REVIEW",
  "CONFLICTING",
  "MISSING_EVIDENCE",
  "APPROVED",
  "REJECTED",
  "SUPERSEDED",
];

export type EvidenceStatus = "MISSING_EVIDENCE" | "PARTIAL" | "SUPPORTED" | "CONFLICTING";

export type CitationVerification = "PENDING" | "VERIFIED" | "FAILED";

export type Relation =
  | "DEPENDS_ON"
  | "AFFECTS"
  | "OWNS"
  | "WORKED_ON"
  | "SUPERSEDES"
  | "PART_OF"
  | "ABOUT"
  | "SUPPORTED_BY"
  | "BLOCKS"
  | "RELATES_TO";

export const RELATIONS: Relation[] = [
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

export type SourceKind = "md" | "txt" | "csv" | "json" | "interview" | "pdf" | "docx";
export type SourceAccess = "project" | "restricted" | "finance";
export type Priority = "low" | "medium" | "high" | "critical";

export type Project = {
  id: string;
  organisation: string;
  name: string;
  description: string;
  status: "active" | "handover" | "archived";
  departingMember: string;
  incomingMember: string;
  manager: string;
};

export type Chunk = {
  id: string;
  sourceId: string;
  projectId: string;
  index: number;
  page: number | null;
  section: string;
  content: string;
  charStart: number;
  charEnd: number;
  hash: string;
};

export type Source = {
  id: string;
  projectId: string;
  title: string;
  kind: SourceKind;
  access: SourceAccess;
  allowedRoles: Role[];
  content: string;
  chunks: Chunk[];
  hash: string;
  createdAt: string;
  createdBy: string;
  synthetic: boolean;
  extracted: boolean;
};

export type Citation = {
  id: string;
  claimId: string;
  sourceId: string;
  chunkId: string;
  quote: string;
  page: number | null;
  location: string;
  verification: CitationVerification;
  failureReason?: string;
  quoteHash: string;
};

export type Claim = {
  id: string;
  projectId: string;
  type: ClaimType;
  title: string;
  description: string;
  rationale?: string;
  owner?: string;
  dueDate?: string;
  priority?: Priority;
  subjectKey?: string;
  attributes?: Record<string, string>;
  status: VerificationStatus;
  evidenceStatus: EvidenceStatus;
  confidence: number;
  allowedRoles: Role[];
  citations: Citation[];
  supersededBy?: string;
  notes?: string;
  createdAt: string;
  updatedAt: string;
};

export type Relationship = {
  id: string;
  projectId: string;
  fromClaimId: string;
  toClaimId: string;
  relation: Relation;
  confidence: number;
  createdAt: string;
};

export type ImpactNode = {
  claimId: string;
  depth: number;
  path: string[];
  relation: Relation;
  viaClaimId: string;
};

export type ReviewRecord = {
  id: string;
  claimId: string;
  reviewer: string;
  action: "approve" | "reject" | "edit" | "resolve_conflict" | "request_clarification" | "supersede";
  fromStatus: VerificationStatus;
  toStatus: VerificationStatus;
  comment: string;
  at: string;
};

export type ReadinessComponent = {
  key: string;
  label: string;
  earned: number;
  max: number;
  reason: string;
};

export type Readiness = {
  score: number;
  components: ReadinessComponent[];
  reasons: string[];
  caveat?: string;
};

export type HandoverSection = {
  key: string;
  title: string;
  description: string;
  claims: Claim[];
};

export type HandoverVersion = {
  id: string;
  handoverId: string;
  version: number;
  audienceRole: Role;
  createdAt: string;
  createdBy: string;
  approvedAt?: string;
  approvedBy?: string;
  publishedAt?: string;
  readiness: Readiness;
  sections: HandoverSection[];
  openQuestions: Claim[];
  claimIds: string[];
  excludedCount: number;
  contentHash: string;
};

export type Handover = {
  id: string;
  projectId: string;
  title: string;
  audienceRole: Role;
  status: "draft" | "approved" | "published";
  createdAt: string;
  versions: HandoverVersion[];
  currentVersionId?: string;
};

export type Acknowledgement = {
  id: string;
  handoverId: string;
  versionId: string;
  acknowledgedBy: string;
  role: Role;
  note: string;
  at: string;
};

export type AuditEvent = {
  id: string;
  at: string;
  kind: string;
  title: string;
  actor: string;
  claimId?: string;
  sourceId?: string;
  handoverId?: string;
};

export type InterviewQuestion = {
  id: string;
  projectId: string;
  question: string;
  rationale: string;
  status: "open" | "answered" | "dismissed";
  answer?: string;
  answeredBy?: string;
  answeredAt?: string;
  createdAt: string;
};

export type Store = {
  project: Project;
  sources: Source[];
  claims: Claim[];
  relationships: Relationship[];
  reviews: ReviewRecord[];
  audit: AuditEvent[];
  handovers: Handover[];
  acknowledgements: Acknowledgement[];
  interviewQuestions: InterviewQuestion[];
  extractionRuns: number;
  seedVersion: number;
};
