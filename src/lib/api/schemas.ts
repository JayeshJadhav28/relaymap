import { z } from "zod";

export const RoleSchema = z.enum(["lead", "reviewer", "treasurer", "incoming"]);

export const RoleBodySchema = z.object({ role: RoleSchema }).strict();

export const SourceBodySchema = z
  .object({
    filename: z.string().min(1).max(255),
    content: z.string().min(1).max(500_000).optional(),
    /** Raw bytes as base64, used for PDF and DOCX uploads. */
    contentBase64: z.string().min(1).max(4_000_000).optional(),
    access: z.enum(["project", "finance"]).default("project"),
  })
  .strict()
  .refine(
    (value) => (value.content === undefined) !== (value.contentBase64 === undefined),
    { message: "Provide exactly one of content or contentBase64." },
  );

export const ExtractBodySchema = z
  .object({ sourceId: z.string().min(1).max(100).optional() })
  .strict();

export const ReviewBodySchema = z
  .object({
    action: z.enum([
      "approve",
      "reject",
      "edit",
      "resolve_conflict",
      "request_clarification",
      "mark_inferred",
    ]),
    comment: z.string().max(2000).optional(),
    title: z.string().min(2).max(200).optional(),
    description: z.string().max(4000).optional(),
    rationale: z.string().max(2000).optional(),
  })
  .strict();

export const HandoverBodySchema = z
  .object({
    audienceRole: RoleSchema.default("incoming"),
    title: z.string().min(2).max(160).optional(),
  })
  .strict();

export const AcknowledgeBodySchema = z
  .object({ note: z.string().max(1000).optional() })
  .strict();

export const InterviewAnswerBodySchema = z
  .object({ answer: z.string().min(1).max(4000) })
  .strict();

export const BuddyQuestionBodySchema = z
  .object({ question: z.string().trim().min(3).max(500) })
  .strict();
