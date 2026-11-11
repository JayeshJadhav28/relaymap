import { createHash } from "node:crypto";

/**
 * Content hashing for the evidence chain.
 *
 * The architecture requires SHA-256 over normalised text. These helpers are
 * server/test-only; client components must never import this module.
 */
export function sha256(value: string): string {
  return "sha256:" + createHash("sha256").update(value, "utf8").digest("hex");
}

export function normaliseText(value: string): string {
  return value.replace(/\r\n?/g, "\n").replace(/[ \t]+$/gm, "").trim();
}

export function quoteHash(quote: string): string {
  return sha256(normaliseText(quote));
}
