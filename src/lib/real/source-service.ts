import "server-only";
import { createHash, randomUUID } from "node:crypto";
import type { SupabaseClient } from "@supabase/supabase-js";
import type { Source, SourceAccess } from "@/lib/demo/types";
import { toClaimTypeCategory } from "@/lib/domain/extraction";
import { extractDrafts } from "@/lib/extraction/engine";
import {
  MAX_SOURCE_BYTES,
  chunkText,
  parseDocument,
  parseDocumentAsync,
  type ParsedDocument,
} from "@/lib/ingestion/document-parser";
import { capabilitiesForProjectRole, type ProjectRole } from "./types";
import type { AppUser } from "./auth";
import { rows, str } from "./mapping";
import { uploadSourceObject, removeSourceObject } from "./storage";

export type IngestSourceInput = {
  filename: string;
  content?: string;
  contentBase64?: string;
  access: SourceAccess;
  organizationId: string;
  projectId: string;
  role: ProjectRole;
  clearance: "standard" | "finance";
  appUser: AppUser;
};

export type IngestSourceResult = {
  sourceId: string;
  filename: string;
  chunks: number;
  claimIds: string[];
  conflicts: number;
  hash: string;
  storagePath: string | null;
};

export class SourceIngestionError extends Error {
  status: number;
  code: string;
  fields?: Record<string, string>;

  constructor(
    status: number,
    code: string,
    message: string,
    fields?: Record<string, string>,
  ) {
    super(message);
    this.name = "SourceIngestionError";
    this.status = status;
    this.code = code;
    this.fields = fields;
  }
}

function decodeBase64(value: string): Uint8Array | null {
  const compact = value.replace(/\s+/g, "");
  if (!compact || compact.length % 4 !== 0 || !/^[A-Za-z0-9+/]+={0,2}$/.test(compact)) {
    return null;
  }
  const buffer = Buffer.from(compact, "base64");
  if (buffer.toString("base64").replace(/=+$/, "") !== compact.replace(/=+$/, "")) {
    return null;
  }
  return new Uint8Array(buffer);
}

const SOURCE_TYPE: Record<ParsedDocument["kind"], string> = {
  md: "markdown",
  txt: "text",
  csv: "csv",
  json: "json",
  pdf: "pdf",
  docx: "docx",
  interview: "interview",
};

const MIME_TYPE: Record<ParsedDocument["kind"], string> = {
  md: "text/markdown",
  txt: "text/plain",
  csv: "text/csv",
  json: "application/json",
  pdf: "application/pdf",
  docx: "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
  interview: "text/markdown",
};

function parseFailure(parsed: { code: string; message: string }): SourceIngestionError {
  const status =
    parsed.code === "PAYLOAD_TOO_LARGE"
      ? 413
      : parsed.code === "UNSUPPORTED_MEDIA_TYPE"
        ? 415
        : parsed.code === "PARSER_UNAVAILABLE"
          ? 503
          : 400;
  return new SourceIngestionError(status, parsed.code, parsed.message);
}

/**
 * Ingests a source for the real workspace: parse → upload to private storage →
 * insert source + immutable chunks → extract claims with chunk-bound evidence.
 * Nothing is auto-approved and every write runs under the caller's Firebase
 * JWT, so RLS remains the authority.
 */
export async function ingestSource(
  supabase: SupabaseClient,
  input: IngestSourceInput,
): Promise<IngestSourceResult> {
  const capabilities = capabilitiesForProjectRole(input.role);
  if (!capabilities.canContribute) {
    throw new SourceIngestionError(403, "FORBIDDEN", "This role cannot add project sources.");
  }
  if (
    input.access === "finance" &&
    input.role !== "lead" &&
    input.clearance !== "finance"
  ) {
    throw new SourceIngestionError(
      403,
      "FORBIDDEN",
      "Only the project lead or a finance-cleared member can add finance sources.",
    );
  }

  let parsed;
  if (input.contentBase64 !== undefined) {
    const bytes = decodeBase64(input.contentBase64);
    if (!bytes) {
      throw new SourceIngestionError(
        400,
        "MALFORMED_SOURCE",
        "The base64 file payload is not valid base64.",
      );
    }
    if (bytes.byteLength > MAX_SOURCE_BYTES) {
      throw new SourceIngestionError(
        413,
        "PAYLOAD_TOO_LARGE",
        `The source exceeds the ${Math.round(MAX_SOURCE_BYTES / 1024)} KB limit.`,
      );
    }
    parsed = await parseDocumentAsync({ filename: input.filename, bytes });
  } else if (typeof input.content === "string") {
    parsed = parseDocument({ filename: input.filename, content: input.content });
  } else {
    throw new SourceIngestionError(
      400,
      "VALIDATION_FAILED",
      "Provide either content or contentBase64.",
    );
  }

  if (parsed.ok === false) throw parseFailure(parsed);
  const document = parsed.document;

  const duplicate = await supabase
    .from("sources")
    .select("id, filename")
    .eq("project_id", input.projectId)
    .eq("content_hash", document.contentHash)
    .limit(1)
    .maybeSingle();
  if (duplicate.error) throw duplicate.error;
  if (duplicate.data) {
    throw new SourceIngestionError(
      409,
      "CONFLICT",
      `This source is already present as "${str(duplicate.data as Record<string, unknown>, "filename", "an existing source")}".`,
    );
  }

  const sourceId = randomUUID();
  const bytes =
    input.contentBase64 !== undefined
      ? (decodeBase64(input.contentBase64) as Uint8Array)
      : new Uint8Array(Buffer.from(document.text, "utf8"));

  const stored = await uploadSourceObject(supabase, {
    organizationId: input.organizationId,
    projectId: input.projectId,
    sourceId,
    filename: document.filename,
    bytes,
    contentType: MIME_TYPE[document.kind],
  }).catch((error: unknown) => {
    throw new SourceIngestionError(
      503,
      "STORAGE_UNAVAILABLE",
      "The source could not be stored in the private bucket. Check that the storage migration is applied and Firebase third-party auth is enabled for Storage.",
      { storage: error instanceof Error ? error.message : "upload failed" },
    );
  });

  const insert = await supabase
    .from("sources")
    .insert({
      id: sourceId,
      project_id: input.projectId,
      source_type: SOURCE_TYPE[document.kind],
      filename: document.filename,
      content: document.text,
      access_level: input.access,
      uploaded_by: input.appUser.id,
      processing_status: "processed",
      content_hash: document.contentHash,
      mime_type: MIME_TYPE[document.kind],
      size_bytes: document.bytes,
      storage_path: stored.path,
      page_count: document.pages?.length ?? null,
      extraction_status: "parsing",
      is_synthetic: false,
    })
    .select("id")
    .single();

  if (insert.error || !insert.data) {
    await removeSourceObject(supabase, stored.path);
    throw insert.error ?? new Error("source_insert_failed");
  }

  const chunkInputs = chunkText(document.text, document.chunkMode, document.pages).map(
    (chunk) => ({
      id: randomUUID(),
      source_id: sourceId,
      project_id: input.projectId,
      chunk_index: chunk.index,
      page_number: chunk.page,
      section_title: chunk.section,
      content: chunk.content,
      char_start: chunk.charStart,
      char_end: chunk.charEnd,
      content_hash:
        "sha256:" + createHash("sha256").update(chunk.content, "utf8").digest("hex"),
    }),
  );

  const chunkInsert = await supabase.from("source_chunks").insert(chunkInputs);
  if (chunkInsert.error) {
    throw chunkInsert.error;
  }

  const domainSource: Source = {
    id: sourceId,
    projectId: input.projectId,
    title: document.filename,
    kind: document.kind,
    access: input.access,
    allowedRoles:
      input.access === "finance"
        ? ["lead", "treasurer"]
        : ["lead", "reviewer", "treasurer", "incoming"],
    content: document.text,
    chunks: chunkInputs.map((chunk) => ({
      id: chunk.id,
      sourceId,
      projectId: input.projectId,
      index: chunk.chunk_index,
      page: chunk.page_number,
      section: chunk.section_title ?? "Document",
      content: chunk.content,
      charStart: chunk.char_start,
      charEnd: chunk.char_end,
      hash: chunk.content_hash,
    })),
    hash: document.contentHash,
    createdAt: new Date().toISOString(),
    createdBy: input.appUser.display_name || input.appUser.email || "You",
    synthetic: false,
    extracted: false,
  };

  const existingTargets = await loadDeploymentTargets(supabase, input.projectId);
  const drafts = extractDrafts([domainSource]).map((draft) => {
    if (draft.subjectKey !== "deployment-target") return draft;
    const target = (draft.attributes?.target ?? "").toLowerCase();
    if (!target) return draft;
    const others = new Set(existingTargets.filter((value) => value && value !== target));
    if (others.size === 0) return draft;
    const all = [...others, target].sort();
    return {
      ...draft,
      status: "CONFLICTING" as const,
      confidence: Math.min(draft.confidence, 0.4),
      attributes: { ...draft.attributes, conflict: all.join(",") },
    };
  });

  const claimIds: string[] = [];
  let conflicts = 0;
  for (const draft of drafts) {
    const citedChunk = domainSource.chunks.find((chunk) => chunk.id === draft.chunkId);
    const attributes: Record<string, string> = { ...(draft.attributes ?? {}) };
    if (draft.owner) attributes.ownerName = draft.owner;
    if (draft.dueDate) attributes.dueDate = draft.dueDate;
    if (draft.priority) attributes.priority = draft.priority;
    if (draft.rationale) attributes.rationale = draft.rationale;

    const claimInsert = await supabase
      .from("knowledge_items")
      .insert({
        project_id: input.projectId,
        category: toClaimTypeCategory(draft.type),
        claim_type: draft.type,
        title: draft.title.slice(0, 200),
        description: draft.description,
        verification_status: draft.status,
        evidence_status:
          draft.status === "CONFLICTING"
            ? "CONFLICTING"
            : draft.status === "MISSING_EVIDENCE"
              ? "MISSING_EVIDENCE"
              : "SUPPORTED",
        access_level: input.access,
        confidence_score: draft.confidence,
        subject_key: draft.subjectKey ?? null,
        attributes,
        created_by: input.appUser.id,
      })
      .select("id")
      .single();

    if (claimInsert.error || !claimInsert.data) {
      throw claimInsert.error ?? new Error("claim_insert_failed");
    }
    const claimId = str(claimInsert.data as Record<string, unknown>, "id");
    claimIds.push(claimId);

    const citation = await supabase.from("evidence_citations").insert({
      knowledge_item_id: claimId,
      source_id: sourceId,
      chunk_id: draft.chunkId,
      exact_snippet: draft.quote,
      source_location: draft.location,
      page_number: citedChunk?.page ?? null,
    });
    if (citation.error) throw citation.error;
  }

  if (drafts.some((draft) => draft.status === "CONFLICTING")) conflicts += 1;

  await supabase
    .from("sources")
    .update({ extraction_status: "parsed", extraction_error: null })
    .eq("id", sourceId);

  return {
    sourceId,
    filename: document.filename,
    chunks: chunkInputs.length,
    claimIds,
    conflicts,
    hash: document.contentHash,
    storagePath: stored.path,
  };
}

async function loadDeploymentTargets(
  supabase: SupabaseClient,
  projectId: string,
): Promise<string[]> {
  const { data, error } = await supabase
    .from("knowledge_items")
    .select("attributes")
    .eq("project_id", projectId)
    .eq("subject_key", "deployment-target");
  if (error) return [];
  return rows(data)
    .map((row) => {
      const attributes = row.attributes;
      if (!attributes || typeof attributes !== "object") return "";
      const target = (attributes as Record<string, unknown>).target;
      return typeof target === "string" ? target.trim().toLowerCase() : "";
    })
    .filter(Boolean);
}
