import { baseDraft, cleanTitle, firstMatch } from "../shared";
import type { ExtractionRule } from "../types";

/**
 * Operational task rule. Ownership gaps are handled earlier by the
 * ownership rule, so this rule only fires for tasks that carry a recognisable
 * task marker.
 */
export const taskRule: ExtractionRule = {
  key: "task",
  matches: (text) =>
    /\btask\b|status\s*:\s*(open|in[- ]progress|blocked|done)|^[A-Z]{2,}-\d+/i.test(
      text,
    ),
  build: (source, chunk) => {
    const text = chunk.content.trim();
    const assignee = firstMatch(text, /assignee\s*:\s*([A-Za-z][A-Za-z .'-]{1,60})/i);
    const status = firstMatch(text, /status\s*:\s*([a-z -]+)/i);

    return baseDraft(source, chunk, {
      type: "TASK",
      title: cleanTitle(text.split(/[·|]/)[0] || "Task recorded") || "Task recorded",
      description: text,
      owner: assignee && !/unassigned/i.test(assignee) ? assignee : undefined,
      dueDate: firstMatch(text, /due\s*:?\s*([0-9]{4}-[0-9]{2}-[0-9]{2})/i),
      priority: /priority\s*:\s*high/i.test(text)
        ? "high"
        : /priority\s*:\s*critical/i.test(text)
          ? "critical"
          : "medium",
      status: "NEEDS_REVIEW",
      confidence: 0.7,
      attributes: status ? { taskStatus: status.toLowerCase() } : {},
    });
  },
};
