import "server-only";
import type { SupabaseClient } from "@supabase/supabase-js";
import type {
  Acknowledgement,
  AuditEvent,
  Claim,
  Handover,
  ReviewRecord,
  Source,
} from "@/lib/demo/types";
import { calculateReadiness } from "@/lib/domain/readiness";
import {
  actorLabel,
  mapAcknowledgement,
  mapAuditEvent,
  mapClaim,
  mapHandover,
  mapProject,
  mapReview,
  mapSource,
  rows,
  str,
} from "./mapping";
import {
  capabilitiesForProjectRole,
  type RealWorkspaceSnapshot,
} from "./types";
import { getRealContext, resolveProjectAccess } from "./context-service";
import { reconcileDeploymentConflicts } from "./conflict";
import type { AppUser } from "./auth";

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

export async function loadWorkspace(
  supabase: SupabaseClient,
  appUser: AppUser,
  projectId: string,
): Promise<RealWorkspaceSnapshot | null> {
  const access = await resolveProjectAccess(supabase, appUser, projectId);
  if (!access) return null;

  const [context, sourcesResult, claimsResult, handoversResult, auditResult] = await Promise.all([
    getRealContext(supabase, appUser),
    supabase
      .from("sources")
      .select("*, source_chunks(*)")
      .eq("project_id", projectId)
      .order("created_at", { ascending: false }),
    supabase
      .from("knowledge_items")
      .select("*, evidence_citations(*)")
      .eq("project_id", projectId)
      .order("updated_at", { ascending: false }),
    supabase
      .from("handovers")
      .select("*, handover_versions(*)")
      .eq("project_id", projectId)
      .order("created_at", { ascending: false }),
    supabase
      .from("audit_logs")
      .select("*")
      .eq("project_id", projectId)
      .order("created_at", { ascending: false })
      .limit(200),
  ]);

  if (sourcesResult.error || claimsResult.error || handoversResult.error) {
    throw new Error("workspace_unavailable");
  }

  const organizationName = str(access.organization, "name", "Organisation");
  const displayName = appUser.display_name || appUser.email || "You";
  const sources: Source[] = rows(sourcesResult.data).map((row) =>
    mapSource(row, actorLabel(str(row, "uploaded_by"), appUser.id, displayName)),
  );
  const allClaims: Claim[] = reconcileDeploymentConflicts(
    rows(claimsResult.data).map(mapClaim),
  );

  const readableSourceIds = new Set(
    sources
      .filter(
        (source) =>
          source.access === "project" ||
          access.role === "lead" ||
          access.clearance === "finance",
      )
      .map((source) => source.id),
  );
  const readableSources = sources.filter((source) => readableSourceIds.has(source.id));
  const visibleClaims = allClaims
    .filter((claim) => claim.citations.every((citation) => readableSourceIds.has(citation.sourceId)))
    .sort(
      (a, b) => TYPE_RANK[a.type] - TYPE_RANK[b.type] || a.title.localeCompare(b.title),
    );
  const visibleClaimIds = new Set(visibleClaims.map((claim) => claim.id));

  const rawHandovers = rows(handoversResult.data);
  const handoverRows = rawHandovers.filter((row) => {
    const status = str(row, "status", "draft");
    const published =
      status === "published" || status === "shared" || status === "acknowledged";
    return access.role === "lead" || (str(row, "audience_role") === access.role && published);
  });
  const handoverIds = handoverRows.map((row) => str(row, "id"));

  const [reviewsResult, acknowledgementsResult] = await Promise.all([
    visibleClaimIds.size
      ? supabase
          .from("review_records")
          .select("*")
          .in("knowledge_item_id", [...visibleClaimIds])
          .order("created_at", { ascending: false })
      : Promise.resolve({ data: [], error: null }),
    handoverIds.length
      ? supabase
          .from("handover_acknowledgements")
          .select("*")
          .in("handover_id", handoverIds)
          .order("acknowledged_at", { ascending: false })
      : Promise.resolve({ data: [], error: null }),
  ]);

  const acknowledgements: Acknowledgement[] = rows(acknowledgementsResult.data)
    .map((row) =>
      mapAcknowledgement(
        row,
        actorLabel(str(row, "user_id"), appUser.id, displayName),
      ),
    )
    .filter((ack) => handoverIds.includes(ack.handoverId));
  const handovers: Handover[] = handoverRows
    .map((row) => mapHandover(row))
    .sort((a, b) => b.createdAt.localeCompare(a.createdAt));
  const reviews: ReviewRecord[] = rows(reviewsResult.data).map((row) =>
    mapReview(row, actorLabel(str(row, "reviewer_id"), appUser.id, displayName)),
  );

  const audit: AuditEvent[] = rows(auditResult.data)
    .map((row) =>
      mapAuditEvent(row, actorLabel(str(row, "actor_id"), appUser.id, displayName)),
    )
    .sort((a, b) => b.at.localeCompare(a.at));

  const readiness = calculateReadiness({
    claims: visibleClaims,
    sources: readableSources,
    handovers,
    acknowledgements,
  });

  const queue = visibleClaims
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

  return {
    context,
    project: mapProject(access.project, organizationName),
    organization: {
      id: str(access.organization, "id"),
      name: organizationName,
      role: access.orgRole,
      clearance: access.clearance,
    },
    role: access.role,
    capabilities: capabilitiesForProjectRole(access.role),
    sources,
    claims: visibleClaims,
    allClaimCount: allClaims.length,
    excludedCount: allClaims.length - visibleClaims.length,
    queue,
    reviews,
    handovers,
    acknowledgements,
    audit,
    readiness,
  };
}

/**
 * Demo parity: two deployment targets on the same project are a visible
 * conflict even when they arrived in separate uploads. The database remains the
 * system of record; this read-time reconciliation never invents evidence.
 */

export async function recordAudit(
  supabase: SupabaseClient,
  input: {
    organizationId: string;
    projectId: string;
    actorId: string;
    action: string;
    entityType: string;
    entityId?: string | null;
    title: string;
  },
): Promise<void> {
  await supabase.from("audit_logs").insert({
    organization_id: input.organizationId,
    project_id: input.projectId,
    actor_id: input.actorId,
    action: input.action,
    entity_type: input.entityType,
    entity_id: input.entityId ?? null,
    metadata: { title: input.title },
  });
}
