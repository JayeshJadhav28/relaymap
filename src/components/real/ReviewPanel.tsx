"use client";

import { useState } from "react";
import type { Claim } from "@/lib/demo/types";
import { useRealApi } from "@/components/real/RealApiProvider";
import { RealEmpty, RealError } from "@/components/real/states";

type Action =
  | "approve"
  | "reject"
  | "request_clarification"
  | "mark_inferred"
  | "resolve_conflict";

export function ReviewPanel({
  projectId,
  claims,
  canReview,
  onDone,
}: {
  projectId: string;
  claims: Claim[];
  canReview: boolean;
  onDone: () => void;
}) {
  const { call } = useRealApi();
  const [comments, setComments] = useState<Record<string, string>>({});
  const [busyId, setBusyId] = useState<string | null>(null);
  const [errors, setErrors] = useState<Record<string, string>>({});

  async function submit(claim: Claim, action: Action) {
    setBusyId(claim.id);
    setErrors((current) => ({ ...current, [claim.id]: "" }));
    const comment = comments[claim.id]?.trim();
    const result = await call<{ claim: Claim; message: string }>(
      `/api/app/projects/${projectId}/claims/${claim.id}/review`,
      {
        method: "POST",
        body: JSON.stringify({
          action,
          comment: comment || undefined,
          rationale: action === "resolve_conflict" ? comment : undefined,
        }),
      },
    );
    setBusyId(null);
    if (!result.ok) {
      setErrors((current) => ({ ...current, [claim.id]: result.message }));
      return;
    }
    setComments((current) => ({ ...current, [claim.id]: "" }));
    onDone();
  }

  if (!claims.length) {
    return (
      <RealEmpty title="Review queue is clear">
        No accessible claim is waiting for a human decision. Published handovers still require
        deliberate approval.
      </RealEmpty>
    );
  }

  return (
    <div className="queue">
      {claims.map((claim) => (
        <article className="panel evidence-row" key={claim.id}>
          <div className="evidence-main">
            <div className="row-meta">
              <span className={`badge badge-${claim.status.toLowerCase()}`}>{claim.status}</span>
              <span className="badge">{claim.type}</span>
              <span className="mono">{Math.round(claim.confidence * 100)}% confidence</span>
            </div>
            <h3>{claim.title}</h3>
            <p>{claim.description}</p>
            {claim.citations.length ? (
              <blockquote className="quote">
                <p>{claim.citations[0].quote}</p>
                <footer>
                  {claim.citations[0].location} ·{" "}
                  <span className="mono">{claim.citations[0].quoteHash.slice(0, 26)}…</span> ·{" "}
                  {claim.citations[0].verification}
                </footer>
              </blockquote>
            ) : (
              <p className="action-message error">No citation is attached.</p>
            )}
          </div>
          <div className="evidence-actions">
            {canReview ? (
              <>
                <label className="field">
                  <span>Reviewer comment</span>
                  <textarea
                    rows={2}
                    value={comments[claim.id] ?? ""}
                    onChange={(event) =>
                      setComments((current) => ({ ...current, [claim.id]: event.target.value }))
                    }
                    placeholder="Why this decision is correct"
                  />
                </label>
                <div className="button-row">
                  <button
                    className="btn btn-primary"
                    type="button"
                    disabled={busyId === claim.id || claim.status === "APPROVED"}
                    onClick={() => void submit(claim, "approve")}
                  >
                    Approve
                  </button>
                  <button
                    className="btn"
                    type="button"
                    disabled={busyId === claim.id}
                    onClick={() => void submit(claim, "request_clarification")}
                  >
                    Ask for clarification
                  </button>
                  <button
                    className="btn"
                    type="button"
                    disabled={busyId === claim.id}
                    onClick={() => void submit(claim, "reject")}
                  >
                    Reject
                  </button>
                  <button
                    className="btn btn-quiet"
                    type="button"
                    disabled={busyId === claim.id}
                    onClick={() => void submit(claim, "mark_inferred")}
                  >
                    Mark inferred
                  </button>
                  {claim.status === "CONFLICTING" ? (
                    <button
                      className="btn"
                      type="button"
                      disabled={busyId === claim.id}
                      onClick={() => void submit(claim, "resolve_conflict")}
                    >
                      Resolve conflict
                    </button>
                  ) : null}
                </div>
                <small className="subtle">
                  Reject, edit, clarification and conflict resolution require a comment. Approval
                  requires a verified citation.
                </small>
              </>
            ) : (
              <p className="subtle">Your role can read this queue but cannot review it.</p>
            )}
            {errors[claim.id] ? (
              <RealError title="Review not recorded" message={errors[claim.id]} />
            ) : null}
          </div>
        </article>
      ))}
    </div>
  );
}
