import type {
  Acknowledgement,
  AuditEvent,
  Claim,
  Handover,
  InterviewQuestion,
  Project,
  Readiness,
  ReviewRecord,
  Role,
  Source,
  Store,
} from "@/lib/demo/types";
import { getStore } from "./store";
import { capabilitiesFor, getCurrentRole, type RoleCapabilities } from "./roles";
import { computeReadiness, reviewQueue } from "./service";
import { redactClaimsForRole } from "@/lib/domain/redaction";

export type WorkspaceData = {
  role: Role;
  capabilities: RoleCapabilities;
  project: Project;
  store: Store;
  claims: Claim[];
  allClaims: Claim[];
  sources: Source[];
  readiness: Readiness;
  queue: Claim[];
  handovers: Handover[];
  acknowledgements: Acknowledgement[];
  audit: AuditEvent[];
  reviews: ReviewRecord[];
  interviewQuestions: InterviewQuestion[];
  excludedCount: number;
};

const TYPE_RANK: Record<Claim["type"], number> = {
  DECISION: 0,
  RISK: 1,
  BLOCKER: 2,
  DEPENDENCY: 3,
  TASK: 4,
  NEXT_ACTION: 5,
  OWNERSHIP: 6,
  QUESTION: 7,
  MISSING_INFO: 8,
  RECURRING_PROBLEM: 9,
  NOTE: 10,
};

export async function getWorkspaceData(): Promise<WorkspaceData> {
  const role = await getCurrentRole();
  const store = getStore();
  const redacted = redactClaimsForRole(store.claims, store.sources, role);
  const claims = [...redacted.visible].sort(
    (a, b) => TYPE_RANK[a.type] - TYPE_RANK[b.type] || a.title.localeCompare(b.title),
  );
  const sources = store.sources.filter((source) => source.allowedRoles.includes(role));
  const handovers = store.handovers
    .filter(
      (handover) =>
        role === "lead" ||
        (handover.audienceRole === role && handover.status === "published"),
    )
    .sort((a, b) => b.createdAt.localeCompare(a.createdAt));
  const handoverIds = new Set(handovers.map((handover) => handover.id));
  const acknowledgements = store.acknowledgements.filter((ack) =>
    handoverIds.has(ack.handoverId),
  );
  const visibleIds = new Set(claims.map((claim) => claim.id));

  return {
    role,
    capabilities: capabilitiesFor(role),
    project: store.project,
    store,
    claims,
    allClaims: store.claims,
    sources,
    readiness: computeReadiness(store, role),
    queue: reviewQueue(store, role),
    handovers,
    acknowledgements,
    audit: [...store.audit].sort((a, b) => b.at.localeCompare(a.at)),
    reviews: store.reviews
      .filter((review) => visibleIds.has(review.claimId))
      .sort((a, b) => b.at.localeCompare(a.at)),
    interviewQuestions:
      role === "lead" || role === "reviewer" ? store.interviewQuestions : [],
    excludedCount: redacted.excludedCount,
  };
}

export async function getHandoverView(handoverId: string) {
  const role = await getCurrentRole();
  const store = getStore();
  const handover = store.handovers.find((item) => item.id === handoverId);
  if (!handover) return null;
  const visible =
    role === "lead" ||
    (handover.audienceRole === role && handover.status === "published");
  if (!visible) return null;
  return {
    role,
    capabilities: capabilitiesFor(role),
    project: store.project,
    handover,
    acknowledgements: store.acknowledgements.filter(
      (ack) => ack.handoverId === handover.id,
    ),
  };
}

export function claimById(store: Store, id: string): Claim | undefined {
  return store.claims.find((claim) => claim.id === id);
}

export function sourceById(store: Store, id: string): Source | undefined {
  return store.sources.find((source) => source.id === id);
}
