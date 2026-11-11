"use client";

import type { AuditEvent, Claim, ReviewRecord } from "@/lib/demo/types";
import { formatDate, STATUS_LABEL } from "@/lib/presentation";
import { RealEmpty } from "@/components/real/states";

/**
 * Append-only audit view. The relay trace is rendered as an ordered list so a
 * reader can follow source → claim → review → handover without decorative
 * noise.
 */
export function TimelinePanel({
  audit,
  reviews,
  claims,
}: {
  audit: AuditEvent[];
  reviews: ReviewRecord[];
  claims: Claim[];
}) {
  const claimById = new Map(claims.map((claim) => [claim.id, claim]));

  return (
    <div className="stack">
      <section className="panel">
        <div className="panel-head">
          <div>
            <h2>Audit trail</h2>
            <p>
              Newest first. Every mutation on the real path writes an append-only event; database
              detail is never echoed into the browser.
            </p>
          </div>
          <span className="panel-kicker">{audit.length} events</span>
        </div>

        {audit.length ? (
          <ol className="timeline-list">
            {audit.map((event) => {
              const claim = event.claimId ? claimById.get(event.claimId) : undefined;
              return (
                <li className="timeline-row" key={event.id}>
                  <span className="timeline-node" aria-hidden="true" />
                  <div className="timeline-body">
                    <div className="row-meta">
                      <span className="mono subtle">{event.kind}</span>
                      <time className="subtle">{formatDate(event.at)}</time>
                    </div>
                    <strong>{event.title}</strong>
                    <p className="subtle">
                      {event.actor}
                      {claim ? ` · ${claim.title}` : ""}
                      {event.sourceId ? ` · source ${event.sourceId.slice(0, 8)}` : ""}
                      {event.handoverId ? ` · handover ${event.handoverId.slice(0, 8)}` : ""}
                    </p>
                  </div>
                </li>
              );
            })}
          </ol>
        ) : (
          <RealEmpty title="No audit events yet">
            Events appear when you add a source, review a claim, publish a handover, or acknowledge
            a receipt.
          </RealEmpty>
        )}
      </section>

      <section className="panel">
        <div className="panel-head">
          <div>
            <h2>Review decisions</h2>
            <p>
              One record per decision on a visible claim. A decision is never inferred from an
              updated status alone.
            </p>
          </div>
          <span className="panel-kicker">{reviews.length} records</span>
        </div>

        {reviews.length ? (
          <div className="table-wrap">
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
                {reviews.map((review) => (
                  <tr key={review.id}>
                    <td>{formatDate(review.at)}</td>
                    <td>{claimById.get(review.claimId)?.title ?? "restricted claim"}</td>
                    <td className="mono">{review.action.replace(/_/g, " ")}</td>
                    <td>
                      {STATUS_LABEL[review.fromStatus]} → {STATUS_LABEL[review.toStatus]}
                    </td>
                    <td>{review.reviewer}</td>
                    <td>{review.comment || "—"}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        ) : (
          <RealEmpty title="No decisions recorded">
            Approve, reject, or request clarification on a claim to create the first review record.
          </RealEmpty>
        )}
      </section>
    </div>
  );
}
