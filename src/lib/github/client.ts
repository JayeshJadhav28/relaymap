import "server-only";
import type { IssueInput, PullRequestInput } from "./pending-work";

/**
 * Server-only GitHub REST access.
 *
 * Rules enforced here:
 * - the token is read from the server environment, never from the browser;
 * - the token is never logged or returned;
 * - only the REST API is used — no `git clone` in a request path;
 * - every call fails closed with a typed error.
 */

const API_BASE = "https://api.github.com";

export type GitHubRepository = {
  owner: string;
  name: string;
  defaultBranch: string;
  private: boolean;
  url: string;
  openIssues: number;
};

export class GitHubRequestError extends Error {
  readonly status: number;
  readonly code: string;

  constructor(status: number, code: string, message: string) {
    super(message);
    this.name = "GitHubRequestError";
    this.status = status;
    this.code = code;
  }
}

export function githubToken(): string | null {
  const token = (process.env.GITHUB_TOKEN ?? "").trim();
  return token.length > 0 ? token : null;
}

export function isGitHubConfigured(): boolean {
  return githubToken() !== null;
}

async function githubFetch<T>(path: string, token?: string): Promise<T> {
  const auth = token ?? githubToken();
  if (!auth) {
    throw new GitHubRequestError(
      401,
      "GITHUB_NOT_CONFIGURED",
      "GitHub is not configured. Set GITHUB_TOKEN in the server environment.",
    );
  }

  const response = await fetch(`${API_BASE}${path}`, {
    headers: {
      Accept: "application/vnd.github+json",
      Authorization: `Bearer ${auth}`,
      "X-GitHub-Api-Version": "2022-11-28",
      "User-Agent": "relaymap",
    },
    cache: "no-store",
  });

  if (!response.ok) {
    const code =
      response.status === 401
        ? "GITHUB_UNAUTHORIZED"
        : response.status === 403
          ? "GITHUB_FORBIDDEN"
          : response.status === 404
            ? "GITHUB_NOT_FOUND"
            : "GITHUB_REQUEST_FAILED";
    throw new GitHubRequestError(
      response.status,
      code,
      `GitHub request failed with status ${response.status}.`,
    );
  }

  return (await response.json()) as T;
}

type RawRepository = {
  name: string;
  full_name: string;
  default_branch: string;
  private: boolean;
  html_url: string;
  open_issues_count: number;
  owner: { login: string };
};

type RawPull = {
  number: number;
  title: string;
  user: { login: string } | null;
  created_at: string;
  updated_at: string;
  draft: boolean;
  assignees: Array<{ login: string }> | null;
};

type RawIssue = {
  number: number;
  title: string;
  user: { login: string } | null;
  created_at: string;
  updated_at: string;
  assignees: Array<{ login: string }> | null;
  labels: Array<{ name: string } | string> | null;
  pull_request?: unknown;
};

export async function fetchRepository(
  owner: string,
  repo: string,
  token?: string,
): Promise<GitHubRepository> {
  const raw = await githubFetch<RawRepository>(
    `/repos/${encodeURIComponent(owner)}/${encodeURIComponent(repo)}`,
    token,
  );
  return {
    owner: raw.owner.login,
    name: raw.name,
    defaultBranch: raw.default_branch,
    private: raw.private,
    url: raw.html_url,
    openIssues: raw.open_issues_count,
  };
}

export async function fetchOpenPullRequests(
  owner: string,
  repo: string,
  token?: string,
): Promise<PullRequestInput[]> {
  const raw = await githubFetch<RawPull[]>(
    `/repos/${encodeURIComponent(owner)}/${encodeURIComponent(repo)}/pulls?state=open&per_page=100`,
    token,
  );
  return raw.map((pull) => ({
    number: pull.number,
    title: pull.title,
    author: pull.user?.login ?? "unknown",
    createdAt: pull.created_at,
    updatedAt: pull.updated_at,
    draft: pull.draft,
    assignees: (pull.assignees ?? []).map((assignee) => assignee.login),
  }));
}

export async function fetchOpenIssues(
  owner: string,
  repo: string,
  token?: string,
): Promise<IssueInput[]> {
  const raw = await githubFetch<RawIssue[]>(
    `/repos/${encodeURIComponent(owner)}/${encodeURIComponent(repo)}/issues?state=open&per_page=100`,
    token,
  );
  return raw
    .filter((issue) => !issue.pull_request)
    .map((issue) => ({
      number: issue.number,
      title: issue.title,
      author: issue.user?.login ?? "unknown",
      createdAt: issue.created_at,
      updatedAt: issue.updated_at,
      assignees: (issue.assignees ?? []).map((assignee) => assignee.login),
      labels: (issue.labels ?? []).map((label) =>
        typeof label === "string" ? label : label.name,
      ),
    }));
}
