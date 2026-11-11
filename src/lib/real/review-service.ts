import "server-only";
import type { SupabaseClient } from "@supabase/supabase-js";
import type { Claim, VerificationStatus } from "@/lib/demo/types";
import { mapClaim, rows } from "./mapping";
import { capabilitiesForProjectRole, type ProjectRole } from "./types";
import { recordAudit } from "./workspace-service";

export type RealReviewAction =
  | "approve"
  | "reject"
  | "edit"
  | "resolve_conflict"
  | "request_clarification"
  | "mark_inferred";

const NEXT_STATUS: Record<RealReviewAction, VerificationStatus> = {
  approve: "APPROVED",
  reject: "REJECTED",
  edit: "NEEDS_REVIEW",
  resolve_conflict: "APPROVED",
  request_clarification: "NEEDS_REVIEW",
  mark_inferred: "INFERRED",
};

export class ReviewError extends Error {
  status: number;
  code: string;

  constructor(status: number, code: string, message: string) {
    super(message);
    this.name = "ReviewError";
    this.status = status;
    this.code = code;
  }
}

export async function reviewRealClaim(
  supabase: SupabaseClient,
  input: {
    claimId: string;
    projectId: string;
    organizationId: string;
    role: ProjectRole;
    appUserId: string;
    action: RealReviewAction;
    comment?: string;
    title?: string;
    description?: string;
    rationale?: string;
  },
): Promise<Claim> {
  if (!capabilitiesForProjectRole(input.role).canReview) {
    throw new ReviewError(403, "FORBIDDEN", "This role cannot review claims.");
  }

  const existing = await supabase
    .from("knowledge_items")
    .select("id, title, verification_status, evidence_citations(id, verification, quote_hash)")
    .eq("id", input.claimId)
    .eq("project_id", input.projectId)
    .maybeSingle();
  if (existing.error) throw existing.error;
  if (!existing.data) {
    throw new ReviewError(404, "NOT_FOUND", "Claim not found or not visible to this role.");
  }

  const comment = (input.comment ?? "").trim();
  if (
    ["reject", "edit", "resolve_conflict", "request_clarification"].includes(input.action) &&
    !comment
  ) {
    throw new ReviewError(
      400,
      "VALIDATION_FAILED",
      "A reviewer comment is required for this action.",
    );
  }

  if (input.action === "approve" || input.action === "resolve_conflict") {
    const citations = rows(
      (existing.data as Record<string, unknown>).evidence_citations,
    );
    const verified = citations.filter((citation) => citation.verification === "VERIFIED");
    if (verified.length === 0) {
      throw new ReviewError(
        422,
        "UNPROCESSABLE",
        "Approval requires at least one verified, chunk-bound citation.",
      );
    }
    if (input.action === "resolve_conflict" && !(input.rationale?.trim() || comment)) {
      throw new ReviewError(
        400,
        "VALIDATION_FAILED",
        "Resolving a conflict requires a recorded human rationale.",
      );
    }
  }

  let rationaleNote = comment || null;
  if (input.action === "resolve_conflict" || input.action === "edit") {
    rationaleNote = (input.rationale ?? "").trim() || comment || null;
  }

  if (input.action === "edit") {
    const updates: Record<string, unknown> = {
      reviewer_id: input.appUserId,
      reviewer_note: rationaleNote,
      updated_at: new Date().toISOString(),
    };
    if (input.title?.trim()) updates.title = input.title.trim().slice(0, 200);
    if (input.description?.trim()) updates.description = input.description.trim();
    const edit = await supabase
      .from("knowledge_items")
      .update(updates)
      .eq("id", input.claimId)
      .eq("project_id", input.projectId);
    if (edit.error) {
      throw new ReviewError(403, "FORBIDDEN", "The claim could not be edited under RLS.");
    }
  }

  const rpc = await supabase.rpc("review_knowledge_item", {
    p_item_id: input.claimId,
    p_status: NEXT_STATUS[input.action],
    p_comment: rationaleNote ?? "",
  });
  if (rpc.error) {
    const message = rpc.error.message ?? "";
    if (message.includes("verified evidence")) {
      throw new ReviewError(
        422,
        "UNPROCESSABLE",
        "Approval requires verified evidence. Verify the citation before approving.",
      );
    }
    if (message.includes("not found")) {
      throw new ReviewError(404, "NOT_FOUND", "Claim not found or not visible to this role.");
    }
    throw rpc.error;
  }

  const loaded = await supabase
    .from("knowledge_items")
    .select("*, evidence_citations(*)")
    .eq("id", input.claimId)
    .eq("project_id", input.projectId)
    .maybeSingle();
  if (loaded.error || !loaded.data) {
    throw loaded.error ?? new ReviewError(404, "NOT_FOUND", "Claim not found after review.");
  }
  const claim = mapClaim(loaded.data as Record<string, unknown>);

  await recordAudit(supabase, {
    organizationId: input.organizationId,
    projectId: input.projectId,
    actorId: input.appUserId,
    action: `claim.${input.action}`,
    entityType: "knowledge_item",
    entityId: claim.id,
    title: `${claim.type} ${input.action.replace(/_/g, " ")}: ${claim.title}`,
  });

  return claim;
}
