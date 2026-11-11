export type DemoRole = "lead" | "member" | "treasurer" | "incoming";
export type FindingStatus = "VERIFIED" | "INFERRED" | "CONFLICTING" | "MISSING_EVIDENCE";

export type DemoSource = {
  id: string; title: string; kind: string; date: string; owner: string;
  status: "Processed" | "Review needed"; access: "Project" | "Finance only";
  allowedRoles: DemoRole[]; content: string;
};

export type Evidence = { sourceId: string; quote: string; location: string };
export type KnowledgeItem = {
  id: string; title: string; category: string; summary: string; status: FindingStatus;
  confidence: number; owner: string | null; updated: string; allowedRoles: DemoRole[];
  evidence: Evidence[]; reviewerNote?: string;
};

export const roles: { id: DemoRole; label: string; caption: string }[] = [
  { id: "lead", label: "Project lead", caption: "Project-wide demo access" },
  { id: "member", label: "Team member", caption: "Permitted project material" },
  { id: "treasurer", label: "Treasurer", caption: "Includes synthetic finance demo" },
  { id: "incoming", label: "Incoming owner", caption: "Approved handover material" },
];

export const sources: DemoSource[] = [
  { id: "src-github", title: "CampusConnect · GitHub export", kind: "GitHub", date: "Oct 27, 2026", owner: "Aarav", status: "Processed", access: "Project", allowedRoles: ["lead", "member", "treasurer", "incoming"], content: "README.md · Deployment target: Vercel.\nops/deploy.md · Aarav maintains the deployment workflow.\nissue #42 · Reconcile rider alerts before the pilot." },
  { id: "src-meeting", title: "Pilot readiness · meeting notes", kind: "Meeting notes", date: "Oct 26, 2026", owner: "Meera", status: "Processed", access: "Project", allowedRoles: ["lead", "member", "treasurer", "incoming"], content: "Decision: We moved the production deployment to Netlify for the pilot.\nThe team selected the new route importer, but the meeting notes do not record why.\nAarav is currently the only person who knows the bus-map import process." },
  { id: "src-chat", title: "#campusconnect · chat export", kind: "Team chat", date: "Oct 25, 2026", owner: "Riya", status: "Processed", access: "Project", allowedRoles: ["lead", "member", "treasurer", "incoming"], content: "Meera: Can someone own rider-alert reconciliation?\nRiya: I can review it after the pilot.\nAarav: I will document the route import steps this week." },
  { id: "src-tasks", title: "Pilot launch · task board", kind: "Task board", date: "Oct 24, 2026", owner: "Meera", status: "Review needed", access: "Project", allowedRoles: ["lead", "member", "treasurer", "incoming"], content: "CC-42 · Reconcile rider alerts · Status: Open · Assignee: Unassigned\nCC-31 · Document route import · Status: In progress · Assignee: Aarav" },
  { id: "src-finance", title: "Sponsor commitment · restricted note", kind: "Finance note", date: "Oct 23, 2026", owner: "Meera", status: "Processed", access: "Finance only", allowedRoles: ["lead", "treasurer"], content: "SYNTHETIC DEMO ONLY — not real sponsor data.\nSample sponsor budget: $18,400.\nFictional demo contact: +1 (202) 555-0147." },
];

export const knowledge: KnowledgeItem[] = [
  { id: "k-deploy", title: "Production deployment target", category: "Technical decision", summary: "The repository export says Vercel, while the latest pilot meeting says Netlify. A reviewer must confirm the current target.", status: "CONFLICTING", confidence: 0.52, owner: "Meera", updated: "2h ago", allowedRoles: ["lead", "member", "treasurer", "incoming"], evidence: [{ sourceId: "src-github", quote: "Deployment target: Vercel.", location: "README.md · Deployment" }, { sourceId: "src-meeting", quote: "We moved the production deployment to Netlify for the pilot.", location: "Pilot readiness · Decision" }] },
  { id: "k-rationale", title: "Route importer decision has no rationale", category: "Decision", summary: "A route importer was selected, but the available meeting note does not explain the trade-off or alternatives.", status: "MISSING_EVIDENCE", confidence: 0.38, owner: null, updated: "5h ago", allowedRoles: ["lead", "member", "treasurer", "incoming"], evidence: [{ sourceId: "src-meeting", quote: "The team selected the new route importer, but the meeting notes do not record why.", location: "Pilot readiness · Decision" }] },
  { id: "k-busmap", title: "Bus-map import knowledge is concentrated", category: "Continuity risk", summary: "The notes identify Aarav as the only current holder of the bus-map import process. Add a backup owner and document the runbook.", status: "VERIFIED", confidence: 0.96, owner: "Aarav", updated: "Yesterday", allowedRoles: ["lead", "member", "treasurer", "incoming"], evidence: [{ sourceId: "src-meeting", quote: "Aarav is currently the only person who knows the bus-map import process.", location: "Pilot readiness · Risks" }] },
  { id: "k-owner", title: "Rider-alert reconciliation has no owner", category: "Unassigned task", summary: "Task CC-42 is open with no assignee. Confirm an owner before the pilot handover.", status: "MISSING_EVIDENCE", confidence: 0.99, owner: null, updated: "Yesterday", allowedRoles: ["lead", "member", "treasurer", "incoming"], evidence: [{ sourceId: "src-tasks", quote: "CC-42 · Reconcile rider alerts · Status: Open · Assignee: Unassigned", location: "Pilot launch · CC-42" }] },
  { id: "k-finance", title: "Synthetic sponsor commitment", category: "Finance", summary: "Restricted synthetic finance record included to demonstrate role-aware source redaction.", status: "VERIFIED", confidence: 1, owner: "Meera", updated: "Oct 23", allowedRoles: ["lead", "treasurer"], evidence: [{ sourceId: "src-finance", quote: "Sample sponsor budget: $18,400.", location: "Sponsor commitment · Budget" }, { sourceId: "src-finance", quote: "Fictional demo contact: +1 (202) 555-0147.", location: "Sponsor commitment · Contact" }] },
];

export const activity = [
  { label: "Source ingested", detail: "Pilot readiness · meeting notes", when: "2h ago", icon: "file" },
  { label: "Conflict detected", detail: "Vercel and Netlify deployment records disagree", when: "2h ago", icon: "alert" },
  { label: "Ownership gap found", detail: "CC-42 has no assignee", when: "Yesterday", icon: "task" },
  { label: "Knowledge risk surfaced", detail: "Bus-map import depends on one contributor", when: "Yesterday", icon: "users" },
];

export const tasks = [
  { id: "CC-42", title: "Reconcile rider alerts", owner: "Unassigned", due: "Nov 03", priority: "High" },
  { id: "CC-31", title: "Document route import", owner: "Aarav", due: "Nov 04", priority: "High" },
  { id: "CC-38", title: "Confirm production deployment target", owner: "Meera", due: "Nov 05", priority: "Medium" },
  { id: "CC-44", title: "Add backup owner for route operations", owner: "Unassigned", due: "Nov 07", priority: "Medium" },
];
