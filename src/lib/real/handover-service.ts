import "server-only";
import { randomUUID } from "node:crypto";
import type { SupabaseClient } from "@supabase/supabase-js";
import type { Handover, HandoverVersion, Role } from "@/lib/demo/types";
import { buildScribeDraft } from "@/lib/agents/scribe";
import { createHandoverVersion } from "@/lib/domain/handover";
import { calculateReadiness } from "@/lib/domain/readiness";
import { redactClaimsForRole } from "@/lib/domain/redaction";
import { generateHandoverHtml } from "@/lib/handover/report-generator";
import { mapHandover, str } from "./mapping";
import {
  capabilitiesForProjectRole,
  roleToDemoRole,
  type ProjectRole,
  type RealWorkspaceSnapshot,
} from "./types";
import { recordAudit } from "./workspace-service";

const DB_AUDIENCE_ROLES: ProjectRole[] = [
  "lead",
  "reviewer",
  "contributor",
  "departed",
  "incoming",
  "viewer",
];

export function isHandoverAudienceRole(value: unknown): value is ProjectRole {
  return typeof value === "string" && DB_AUDIENCE_ROLES.includes(value as ProjectRole);
}

export class HandoverError extends Error {
  status: number;
  code: string;

  constructor(status: number, code: string, message: string) {
    super(message);
    this.name = "HandoverError";
    this.status = status;
    this.code = code;
  }
}

export async function createRealHandover(
  supabase: SupabaseClient,
  input: {
    snapshot: RealWorkspaceSnapshot;
    audienceRole: ProjectRole;
    title?: string;
    appUserId: string;
  },
): Promise<{ handoverId: string; versionId: string }> {
  if (!capabilitiesForProjectRole(input.snapshot.role).canLead) {
    throw new HandoverError(403, "FORBIDDEN", "Only the project lead can create a handover.");
  }
  if (!isHandoverAudienceRole(input.audienceRole)) {
    throw new HandoverError(400, "VALIDATION_FAILED", "Unknown handover audience role.");
  }

  const audienceDemoRole: Role = roleToDemoRole(input.audienceRole);
  const audienceClaims = redactClaimsForRole(
    input.snapshot.claims,
    input.snapshot.sources,
    audienceDemoRole,
  ).visible;
  const readiness = calculateReadiness({
    claims: audienceClaims,
    sources: input.snapshot.sources,
    handovers: input.snapshot.handovers,
    acknowledgements: input.snapshot.acknowledgements,
  });
  const scribe = buildScribeDraft({
    project: input.snapshot.project,
    claims: input.snapshot.claims,
    sources: input.snapshot.sources,
    audienceRole: audienceDemoRole,
  });

  const handoverId = randomUUID();
  const versionId = randomUUID();
  const now = new Date().toISOString();

  const draft: Handover = {
    id: handoverId,
    projectId: input.snapshot.project.id,
    title:
      input.title?.trim().slice(0, 160) ||
      `${input.snapshot.project.name} handover`,
    audienceRole: audienceDemoRole,
    status: "draft",
    createdAt: now,
    versions: [],
  };

  const version: HandoverVersion = createHandoverVersion({
    id: versionId,
    handover: draft,
    audienceRole: audienceDemoRole,
    createdBy: input.snapshot.context.user.displayName,
    createdAt: now,
    readiness,
    assembly: scribe.assembly,
  });
  version.audienceRole = audienceDemoRole;

  const handoverInsert = await supabase.from("handovers").insert({
    id: handoverId,
    project_id: input.snapshot.project.id,
    audience_role: input.audienceRole,
    title: draft.title,
    body: { handoverVersion: version },
    status: "draft",
    created_by: input.appUserId,
    current_version: 1,
  });
  if (handoverInsert.error) throw handoverInsert.error;

  const versionInsert = await supabase.from("handover_versions").insert({
    id: versionId,
    handover_id: handoverId,
    version: 1,
    audience_role: input.audienceRole,
    body: { handoverVersion: version },
    readiness_score: readiness.score,
    readiness_reasons: readiness.reasons,
    content_hash: version.contentHash,
    created_by: input.appUserId,
  });
  if (versionInsert.error) throw versionInsert.error;

  const claimRows = [
    ...scribe.assembly.sections.flatMap((section) =>
      section.claims.map((claim, index) => ({
        version_id: versionId,
        claim_id: claim.id,
        section: section.key,
        position: index,
      })),
    ),
    ...scribe.assembly.openQuestions.map((claim, index) => ({
      version_id: versionId,
      claim_id: claim.id,
      section: "open",
      position: index,
    })),
  ];
  if (claimRows.length) {
    const claimsInsert = await supabase.from("handover_version_claims").insert(claimRows);
    if (claimsInsert.error) throw claimsInsert.error;
  }

  await recordAudit(supabase, {
    organizationId: input.snapshot.organization.id,
    projectId: input.snapshot.project.id,
    actorId: input.appUserId,
    action: "handover.created",
    entityType: "handover",
    entityId: handoverId,
    title: `Handover draft created for ${input.audienceRole}`,
  });

  return { handoverId, versionId };
}

export async function publishRealHandover(
  supabase: SupabaseClient,
  input: {
    handoverId: string;
    projectId: string;
    organizationId: string;
    role: ProjectRole;
    appUserId: string;
  },
): Promise<{ handoverId: string; versionId: string; version: number }> {
  if (!capabilitiesForProjectRole(input.role).canLead) {
    throw new HandoverError(403, "FORBIDDEN", "Only the project lead can publish a handover.");
  }

  const handoverResult = await supabase
    .from("handovers")
    .select("id, project_id, status, current_version")
    .eq("id", input.handoverId)
    .eq("project_id", input.projectId)
    .maybeSingle();
  if (handoverResult.error) throw handoverResult.error;
  if (!handoverResult.data) throw new HandoverError(404, "NOT_FOUND", "Handover not found.");

  const versionResult = await supabase
    .from("handover_versions")
    .select("id, version, body, published_at")
    .eq("handover_id", input.handoverId)
    .order("version", { ascending: false })
    .limit(1)
    .maybeSingle();
  if (versionResult.error) throw versionResult.error;
  if (!versionResult.data) {
    throw new HandoverError(422, "UNPROCESSABLE", "The handover has no version to publish.");
  }

  const versionRow = versionResult.data as Record<string, unknown>;
  if (versionRow.published_at) {
    throw new HandoverError(409, "CONFLICT", "A published handover version is immutable.");
  }

  const body = versionRow.body as Record<string, unknown> | undefined;
  const stored = body?.handoverVersion as HandoverVersion | undefined;
  const approvedClaims =
    stored?.sections?.reduce((count, section) => count + section.claims.length, 0) ?? 0;
  if (approvedClaims === 0) {
    throw new HandoverError(
      422,
      "UNPROCESSABLE",
      "A handover cannot be published before at least one claim is approved.",
    );
  }

  const publishedAt = new Date().toISOString();
  const versionUpdate = await supabase
    .from("handover_versions")
    .update({ published_at: publishedAt })
    .eq("id", str(versionRow, "id"))
    .eq("handover_id", input.handoverId);
  if (versionUpdate.error) throw versionUpdate.error;

  const handoverUpdate = await supabase
    .from("handovers")
    .update({
      status: "published",
      current_version: Number(versionRow.version),
      published_at: publishedAt,
      updated_at: publishedAt,
    })
    .eq("id", input.handoverId)
    .eq("project_id", input.projectId);
  if (handoverUpdate.error) throw handoverUpdate.error;

  await recordAudit(supabase, {
    organizationId: input.organizationId,
    projectId: input.projectId,
    actorId: input.appUserId,
    action: "handover.published",
    entityType: "handover",
    entityId: input.handoverId,
    title: `Handover version ${versionRow.version} published`,
  });

  return {
    handoverId: input.handoverId,
    versionId: str(versionRow, "id"),
    version: Number(versionRow.version),
  };
}

export async function acknowledgeRealHandover(
  supabase: SupabaseClient,
  input: {
    handoverId: string;
    projectId: string;
    organizationId: string;
    role: ProjectRole;
    appUserId: string;
    note?: string;
  },
): Promise<{
  acknowledgementId: string;
  handoverId: string;
  versionId: string;
  note: string;
}> {
  const handoverResult = await supabase
    .from("handovers")
    .select("id, project_id, status, current_version, audience_role")
    .eq("id", input.handoverId)
    .eq("project_id", input.projectId)
    .maybeSingle();
  if (handoverResult.error) throw handoverResult.error;
  if (!handoverResult.data) throw new HandoverError(404, "NOT_FOUND", "Handover not found.");

  const handover = handoverResult.data as Record<string, unknown>;
  const audienceRole = str(handover, "audience_role");
  if (input.role !== audienceRole) {
    throw new HandoverError(
      403,
      "FORBIDDEN",
      "Only the intended recipient can acknowledge this handover.",
    );
  }
  if (str(handover, "status") !== "published") {
    throw new HandoverError(
      422,
      "UNPROCESSABLE",
      "Only a published handover can be acknowledged.",
    );
  }

  const versionResult = await supabase
    .from("handover_versions")
    .select("id")
    .eq("handover_id", input.handoverId)
    .eq("version", Number(handover.current_version))
    .maybeSingle();
  if (versionResult.error) throw versionResult.error;
  if (!versionResult.data) {
    throw new HandoverError(422, "UNPROCESSABLE", "The published version could not be resolved.");
  }

  const versionId = str(versionResult.data as Record<string, unknown>, "id");
  const note = input.note?.trim().slice(0, 1000) || "Receipt acknowledged.";
  const insert = await supabase
    .from("handover_acknowledgements")
    .insert({
      handover_id: input.handoverId,
      version_id: versionId,
      user_id: input.appUserId,
      role: roleToDemoRole(input.role),
      note,
      comment: note,
    })
    .select("id")
    .single();

  if (insert.error) {
    if ((insert.error.message ?? "").toLowerCase().includes("duplicate")) {
      throw new HandoverError(
        409,
        "CONFLICT",
        "This handover version has already been acknowledged.",
      );
    }
    throw insert.error;
  }

  await recordAudit(supabase, {
    organizationId: input.organizationId,
    projectId: input.projectId,
    actorId: input.appUserId,
    action: "handover.acknowledged",
    entityType: "handover",
    entityId: input.handoverId,
    title: `Handover acknowledged by ${input.role}`,
  });

  return {
    acknowledgementId: str(insert.data as Record<string, unknown>, "id"),
    handoverId: input.handoverId,
    versionId,
    note,
  };
}

export async function loadPublishedHandover(
  supabase: SupabaseClient,
  projectId: string,
  handoverId: string,
): Promise<Handover | null> {
  const result = await supabase
    .from("handovers")
    .select("*, handover_versions(*), handover_acknowledgements(*)")
    .eq("id", handoverId)
    .eq("project_id", projectId)
    .maybeSingle();
  if (result.error || !result.data) return null;
  const row = result.data as Record<string, unknown>;
  return mapHandover(row);
}

export async function buildRealHandoverReport(
  supabase: SupabaseClient,
  input: {
    project: RealWorkspaceSnapshot["project"];
    projectId: string;
    handoverId: string;
  },
): Promise<{ filename: string; html: string } | null> {
  const handover = await loadPublishedHandover(supabase, input.projectId, input.handoverId);
  if (!handover) return null;
  const version = handover.currentVersionId
    ? handover.versions.find((item) => item.id === handover.currentVersionId)
    : undefined;
  if (!version || !version.publishedAt) {
    throw new HandoverError(
      422,
      "UNPROCESSABLE",
      "Only a published handover version can be exported.",
    );
  }
  const html = generateHandoverHtml({
    project: input.project,
    handover,
    version,
    generatedAt: new Date().toISOString(),
    synthetic: false,
  });
  const safe = input.project.name.replace(/[^\w\-]+/g, "-").replace(/-+/g, "-");
  return { filename: `${safe || "handover"}-v${version.version}.html`, html };
}
