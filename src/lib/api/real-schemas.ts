import { z } from "zod";

export const UuidSchema = z.string().uuid();

export const RealSourceBodySchema = z
  .object({
    filename: z.string().min(1).max(255),
    content: z.string().min(1).max(500_000).optional(),
    contentBase64: z.string().min(1).max(4_000_000).optional(),
    access: z.enum(["project", "finance"]).default("project"),
  })
  .strict()
  .refine(
    (value) => (value.content === undefined) !== (value.contentBase64 === undefined),
    { message: "Provide exactly one of content or contentBase64." },
  );

export const BootstrapBodySchema = z
  .object({
    organizationName: z.string().trim().min(2).max(100),
    projectName: z.string().trim().min(2).max(120),
    projectDescription: z.string().max(4000).optional(),
  })
  .strict();

export const OrganizationBodySchema = z
  .object({ name: z.string().trim().min(2).max(100) })
  .strict();

export const ProjectBodySchema = z
  .object({
    organizationId: UuidSchema,
    name: z.string().trim().min(2).max(120),
    description: z.string().max(4000).optional(),
  })
  .strict();

export const RealReviewBodySchema = z
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

export const RealHandoverBodySchema = z
  .object({
    audienceRole: z.enum([
      "lead",
      "reviewer",
      "contributor",
      "departed",
      "incoming",
      "viewer",
    ]),
    title: z.string().min(2).max(160).optional(),
  })
  .strict();

export const RealAcknowledgeBodySchema = z
  .object({ note: z.string().max(1000).optional() })
  .strict();

export const InvitationBodySchema = z
  .object({
    email: z.string().trim().email().max(254),
    role: z.enum(["admin", "manager", "member", "viewer"]),
    clearance: z.enum(["standard", "finance"]).default("standard"),
    projectId: UuidSchema.optional(),
    projectRole: z
      .enum(["lead", "reviewer", "contributor", "departed", "incoming", "viewer"])
      .optional(),
    expiresInDays: z.number().int().min(1).max(30).optional(),
  })
  .strict()
  .refine(
    (value) => (value.projectId === undefined) === (value.projectRole === undefined),
    { message: "Choose both a project and a project role, or neither." },
  );

export const AcceptInvitationBodySchema = z
  .object({ token: z.string().trim().min(16).max(500) })
  .strict();

export const ProfileBodySchema = z
  .object({ displayName: z.string().trim().min(2).max(100) })
  .strict();
