import type { DemoRole, DemoSource, KnowledgeItem } from "./demo-data";

export function validateCitation(source: Pick<DemoSource, "content" | "id">, citation: { sourceId: string; quote: string }): boolean {
  return source.id === citation.sourceId && citation.quote.trim().length > 0 && source.content.includes(citation.quote);
}

export function redactForRole(items: KnowledgeItem[], allowedSourceIds: Set<string>, role: DemoRole): KnowledgeItem[] {
  return items
    .filter((item) => item.allowedRoles.includes(role) && item.evidence.every((cite) => allowedSourceIds.has(cite.sourceId)))
    .map((item) => ({ ...item, evidence: item.evidence.filter((cite) => allowedSourceIds.has(cite.sourceId)) }));
}

export function calculateReadiness(items: KnowledgeItem[], taskCount: number): { score: number; reasons: string[] } {
  if (!items.length) return { score: 0, reasons: ["No accessible knowledge has been reviewed yet."] };
  const verified = items.filter((item) => item.status === "VERIFIED").length;
  const issues = items.filter((item) => item.status === "CONFLICTING" || item.status === "MISSING_EVIDENCE").length;
  const unowned = items.filter((item) => item.category === "Unassigned task" && !item.owner).length;
  const score = Math.max(0, Math.min(100, Math.round((verified / items.length) * 100 - issues * 9 - unowned * 6 - Math.max(0, taskCount - 2) * 2)));
  const reasons = [`${verified} of ${items.length} accessible findings are verified.`, `${issues} conflicts or evidence gaps remain.`, `${unowned} unassigned ownership gaps are included.`];
  return { score, reasons };
}

export function getVisibleSources(all: DemoSource[], role: DemoRole): DemoSource[] {
  return all.filter((source) => source.allowedRoles.includes(role));
}

export type ExtractedFinding = { title: string; category: string; description: string; status: "INFERRED" | "CONFLICTING" | "MISSING_EVIDENCE"; confidence: number; quote: string; location: string; sourceId: string };

/** Deterministic starter extraction. It never sets VERIFIED; every emitted quote is exact source text. */
export function extractFindings(records: { id: string; filename: string; content: string }[]): ExtractedFinding[] {
  const candidates: ExtractedFinding[] = [];
  for (const record of records) {
    const lines = record.content.split(/\r?\n/).map((line) => line.trim()).filter(Boolean);
    lines.forEach((line, index) => {
      if (/assignee\s*:\s*unassigned|owner\s*:\s*unassigned|no owner/i.test(line)) {
        candidates.push({ title: "Ownership needs clarification", category: "Unassigned task", description: line, status: "MISSING_EVIDENCE", confidence: 0.98, quote: line, location: `${record.filename} · line ${index + 1}`, sourceId: record.id });
      } else if (/why (?:this|the|that) (?:decision|option)|rationale (?:is )?missing|does not record why/i.test(line)) {
        candidates.push({ title: "Decision rationale is missing", category: "Decision", description: line, status: "MISSING_EVIDENCE", confidence: 0.82, quote: line, location: `${record.filename} · line ${index + 1}`, sourceId: record.id });
      } else if (/deployment|deploy(?:ment)? target|decision:|blocker:|dependency:|only person|single point/i.test(line)) {
        candidates.push({ title: /deploy/i.test(line) ? "Deployment target needs confirmation" : line.slice(0, 90), category: /deploy/i.test(line) ? "Technical decision" : "Project knowledge", description: line, status: "INFERRED", confidence: 0.58, quote: line, location: `${record.filename} · line ${index + 1}`, sourceId: record.id });
      }
    });
  }
  const deployments = candidates.filter((item) => /deploy/i.test(item.title));
  if (new Set(deployments.map((item) => item.description.match(/\b(vercel|netlify|render|railway)\b/i)?.[1]?.toLowerCase()).filter(Boolean)).size > 1) {
    for (const item of deployments) { item.status = "CONFLICTING"; item.title = "Production deployment target is conflicting"; item.confidence = 0.4; }
  }
  return candidates;
}
