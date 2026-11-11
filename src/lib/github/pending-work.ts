/**
 * Outstanding repository work. Everything here is derived from data the
 * caller already retrieved with the authenticated user's access. Nothing is
 * fetched from the browser and no repository is cloned.
 */

export type PullRequestInput = {
  number: number;
  title: string;
  author: string;
  createdAt: string;
  updatedAt: string;
  draft?: boolean;
  assignees?: string[];
  files?: string[];
};

export type IssueInput = {
  number: number;
  title: string;
  author: string;
  createdAt: string;
  updatedAt: string;
  assignees?: string[];
  labels?: string[];
};

export type PendingItem = {
  kind: "pull_request" | "issue";
  number: number;
  title: string;
  author: string;
  assignedTo: string[];
  ageDays: number;
  stale: boolean;
  draft: boolean;
  files: string[];
};

export type PendingWorkSummary = {
  openPullRequests: PendingItem[];
  openIssues: PendingItem[];
  unassignedIssues: PendingItem[];
  staleItems: PendingItem[];
  totalOpen: number;
  caveat: string;
};

const STALE_AFTER_DAYS = 30;

function daysBetween(from: string, to: Date): number {
  const then = new Date(from).getTime();
  if (!Number.isFinite(then)) return 0;
  return Math.max(0, Math.floor((to.getTime() - then) / 86_400_000));
}

export function buildPendingWork(
  pulls: PullRequestInput[],
  issues: IssueInput[],
  now: Date = new Date(),
): PendingWorkSummary {
  const openPullRequests: PendingItem[] = pulls.map((pull) => {
    const ageDays = daysBetween(pull.updatedAt || pull.createdAt, now);
    return {
      kind: "pull_request",
      number: pull.number,
      title: pull.title,
      author: pull.author,
      assignedTo: pull.assignees ?? [],
      ageDays,
      stale: ageDays > STALE_AFTER_DAYS,
      draft: Boolean(pull.draft),
      files: pull.files ?? [],
    };
  });

  const openIssues: PendingItem[] = issues.map((issue) => {
    const ageDays = daysBetween(issue.updatedAt || issue.createdAt, now);
    return {
      kind: "issue",
      number: issue.number,
      title: issue.title,
      author: issue.author,
      assignedTo: issue.assignees ?? [],
      ageDays,
      stale: ageDays > STALE_AFTER_DAYS,
      draft: false,
      files: [],
    };
  });

  const all = [...openPullRequests, ...openIssues];

  return {
    openPullRequests,
    openIssues,
    unassignedIssues: openIssues.filter((issue) => issue.assignedTo.length === 0),
    staleItems: all.filter((item) => item.stale),
    totalOpen: all.length,
    caveat:
      "This list reflects the repository state returned by the GitHub API at fetch time. It is not a complete inventory of work.",
  };
}
