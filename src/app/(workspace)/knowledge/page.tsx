import Link from "next/link";
import { ClaimCard } from "@/components/ClaimCard";
import { EmptyState, PageTitle } from "@/components/ui";
import { getWorkspaceData } from "@/lib/demo/view";
import { projectImpact } from "@/lib/demo/service";
import { CLAIM_TYPE_LABEL, STATUS_LABEL } from "@/lib/presentation";
import type { ClaimType, VerificationStatus } from "@/lib/demo/types";

export const dynamic = "force-dynamic";

const CLAIM_TYPES = Object.keys(CLAIM_TYPE_LABEL) as ClaimType[];
const STATUSES: VerificationStatus[] = [
  "APPROVED",
  "NEEDS_REVIEW",
  "INFERRED",
  "CONFLICTING",
  "MISSING_EVIDENCE",
  "REJECTED",
  "SUPERSEDED",
];

export default async function KnowledgePage({
  searchParams,
}: {
  searchParams: Promise<{ q?: string; type?: string; status?: string }>;
}) {
  const params = await searchParams;
  const query = (params.q ?? "").trim().toLowerCase();
  const type = params.type ?? "all";
  const status = params.status ?? "all";
  const data = await getWorkspaceData();

  const filtered = data.claims.filter((claim) => {
    if (type !== "all" && claim.type !== type) return false;
    if (status !== "all" && claim.status !== status) return false;
    if (!query) return true;
    return `${claim.title} ${claim.description} ${claim.owner ?? ""} ${claim.rationale ?? ""}`
      .toLowerCase()
      .includes(query);
  });

  return (
    <>
      <PageTitle
        title="Knowledge base"
        description="Evidence-linked claims from accessible sources. Search, open a citation, and review the exact quotation before trusting the claim."
        actions={
          <Link className="btn" href="/review">
            Review queue
          </Link>
        }
      />

      <form className="filter-bar panel" method="get" action="/knowledge">
        <label className="field">
          <span>Search</span>
          <input
            className="search-input"
            name="q"
            defaultValue={params.q ?? ""}
            placeholder="Title, description, owner or rationale"
          />
        </label>
        <label className="field">
          <span>Type</span>
          <select name="type" defaultValue={type}>
            <option value="all">All types</option>
            {CLAIM_TYPES.map((item) => (
              <option value={item} key={item}>
                {CLAIM_TYPE_LABEL[item]}
              </option>
            ))}
          </select>
        </label>
        <label className="field">
          <span>Status</span>
          <select name="status" defaultValue={status}>
            <option value="all">All statuses</option>
            {STATUSES.map((item) => (
              <option value={item} key={item}>
                {STATUS_LABEL[item]}
              </option>
            ))}
          </select>
        </label>
        <button className="btn btn-primary" type="submit">
          Filter
        </button>
        <Link className="btn" href="/knowledge">
          Clear
        </Link>
        <span className="subtle">
          {filtered.length} of {data.claims.length} accessible claims · {data.excludedCount} excluded
          by role
        </span>
      </form>

      {filtered.length ? (
        filtered.map((claim) => {
          let affected: { claim: typeof claim; depth: number; relation: string }[] = [];
          if (claim.type === "DECISION") {
            const impact = projectImpact(data.store, {
              claimId: claim.id,
              role: data.role,
              maxDepth: 3,
            });
            if (impact.ok) {
              affected = impact.value.nodes.map((node) => ({
                claim: node.claim,
                depth: node.depth,
                relation: node.relation,
              }));
            }
          }
          return (
            <ClaimCard
              key={claim.id}
              claim={claim}
              sources={data.sources}
              canReview={data.capabilities.canReview}
              affected={affected}
            />
          );
        })
      ) : (
        <EmptyState>No accessible claim matches those filters.</EmptyState>
      )}

      <section className="panel">
        <div className="panel-head">
          <div>
            <h2>Why a claim can disappear for a role</h2>
            <p>Redaction is deliberately all-or-nothing at claim level.</p>
          </div>
        </div>
        <ul className="trust-list">
          <li>
            A claim is visible only when the role is permitted and every cited source is permitted.
          </li>
          <li>
            Partial evidence is never shown because the summary itself could disclose the restricted
            fact.
          </li>
          <li>
            Finance-restricted claims are visible to the project lead and treasurer, and excluded
            from every other role including the incoming owner.
          </li>
        </ul>
      </section>
    </>
  );
}
