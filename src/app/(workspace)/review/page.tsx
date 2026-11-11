import Link from "next/link";
import { ClaimCard } from "@/components/ClaimCard";
import { EmptyState, PageTitle } from "@/components/ui";
import { getWorkspaceData } from "@/lib/demo/view";
import { formatDate } from "@/lib/presentation";

export const dynamic = "force-dynamic";

export default async function ReviewPage() {
  const data = await getWorkspaceData();
  const claimById = new Map(data.claims.map((claim) => [claim.id, claim]));

  return (
    <>
      <PageTitle
        title="Review centre"
        description="Approve, reject, correct or clarify every consequential finding. Approval is blocked when evidence does not verify."
        actions={
          <Link className="btn" href="/knowledge">
            Browse all claims
          </Link>
        }
      />

      <div className="demo-banner">
        <span className="demo-dot" />
        <span>
          <strong>Human decision required.</strong> Deterministic extraction never approves its own
          claims. A reviewer identity, an exact citation and an append-only review record are
          required before anything becomes handover fact.
        </span>
      </div>

      {!data.capabilities.canReview ? (
        <EmptyState>
          This role can read permitted findings but cannot approve them. Switch to the project lead
          or reviewer to use the review actions.
        </EmptyState>
      ) : null}

      {data.queue.length ? (
        data.queue.map((claim) => (
          <ClaimCard
            key={claim.id}
            claim={claim}
            sources={data.sources}
            canReview={data.capabilities.canReview}
          />
        ))
      ) : (
        <EmptyState>No accessible claim is waiting for review.</EmptyState>
      )}

      <section className="panel" style={{ marginTop: 14 }}>
        <div className="panel-head">
          <div>
            <h2>Review history</h2>
            <p>Append-only records visible for claims this role can read.</p>
          </div>
          <span className="panel-kicker">{data.reviews.length} recorded</span>
        </div>
        {data.reviews.length ? (
          <table className="table">
            <thead>
              <tr>
                <th>When</th>
                <th>Claim</th>
                <th>Action</th>
                <th>From → to</th>
                <th>Reviewer</th>
                <th>Comment</th>
              </tr>
            </thead>
            <tbody>
              {data.reviews.map((review) => (
                <tr key={review.id}>
                  <td>{formatDate(review.at)}</td>
                  <td>{claimById.get(review.claimId)?.title ?? review.claimId}</td>
                  <td>{review.action.replace("_", " ")}</td>
                  <td>
                    {review.fromStatus} → {review.toStatus}
                  </td>
                  <td>{review.reviewer}</td>
                  <td>{review.comment}</td>
                </tr>
              ))}
            </tbody>
          </table>
        ) : (
          <div className="empty-state">No review records yet.</div>
        )}
      </section>
    </>
  );
}
