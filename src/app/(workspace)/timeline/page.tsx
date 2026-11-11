import Link from "next/link";
import { GenerateQuestions } from "@/components/GenerateQuestions";
import { InterviewAnswer } from "@/components/InterviewAnswer";
import { PageTitle } from "@/components/ui";
import { getWorkspaceData } from "@/lib/demo/view";
import { projectImpact } from "@/lib/demo/service";
import { CLAIM_TYPE_LABEL, formatDate, STATUS_LABEL } from "@/lib/presentation";

export const dynamic = "force-dynamic";

export default async function TimelinePage() {
  const data = await getWorkspaceData();
  const decisions = data.claims.filter((claim) => claim.type === "DECISION");
  const claimById = new Map(data.claims.map((claim) => [claim.id, claim]));

  return (
    <>
      <PageTitle
        title="Timeline and impact"
        description="An append-only event trail plus bounded impact traversal. The graph shows recorded relationships, not every possible real-world consequence."
        actions={
          <Link className="btn" href="/review">
            Review changes
          </Link>
        }
      />

      <div className="detail-grid detail-grid-wide">
        <section className="panel">
          <div className="panel-head">
            <div>
              <h2>Impact explorer</h2>
              <p>Decisions followed through AFFECTS, DEPENDS_ON and BLOCKS relationships.</p>
            </div>
            <span className="panel-kicker">Max depth 3</span>
          </div>
          {decisions.map((decision) => {
            const impact = projectImpact(data.store, {
              claimId: decision.id,
              role: data.role,
              maxDepth: 3,
            });
            const nodes = impact.ok ? impact.value.nodes : [];
            return (
              <div className="section-block" key={decision.id}>
                <h4>{decision.title}</h4>
                {nodes.length ? (
                  <div className="activity-list" style={{ marginTop: 7 }}>
                    {nodes.map((node) => (
                      <div className="activity-row" key={`${decision.id}-${node.claim.id}`}>
                        <span className="depth-chip">hop {node.depth}</span>
                        <div>
                          <strong>{node.claim.title}</strong>
                          <small>
                            {CLAIM_TYPE_LABEL[node.claim.type]} · {node.relation.toLowerCase().replace("_", " ")}
                          </small>
                        </div>
                        <span className="subtle">{STATUS_LABEL[node.claim.status]}</span>
                      </div>
                    ))}
                  </div>
                ) : (
                  <p className="subtle" style={{ marginTop: 6 }}>
                    No downstream relationship is recorded for this role.
                  </p>
                )}
                {impact.ok && impact.value.hiddenCount ? (
                  <p className="subtle" style={{ marginTop: 5 }}>
                    {impact.value.hiddenCount} impacted claim(s) are hidden by the current role.
                  </p>
                ) : null}
              </div>
            );
          })}
        </section>

        <div className="stack">
          <section className="panel">
            <div className="panel-head">
              <div>
                <h2>Interview gaps</h2>
                <p>Focused questions derived from unresolved evidence.</p>
              </div>
            </div>
            <GenerateQuestions canGenerate={data.capabilities.canReview} />
            {data.interviewQuestions.length ? (
              <div className="activity-list">
                {data.interviewQuestions.map((question) => (
                  <div
                    key={question.id}
                    style={{ padding: "10px 0", borderBottom: "1px solid var(--border)" }}
                  >
                    <div className="activity-row">
                      <span className="activity-icon">Q</span>
                      <div>
                        <strong>{question.question}</strong>
                        <small>{question.rationale}</small>
                      </div>
                      <span className="pill">{question.status}</span>
                    </div>
                    {question.answer ? (
                      <p className="subtle" style={{ marginTop: 6 }}>
                        Recorded by {question.answeredBy}: “{question.answer}”
                      </p>
                    ) : null}
                    {question.status === "open" ? (
                      <InterviewAnswer questionId={question.id} answered={false} />
                    ) : null}
                  </div>
                ))}
              </div>
            ) : (
              <div className="empty-state">Interview questions are visible to the lead and reviewer.</div>
            )}
            <p className="subtle" style={{ marginTop: 10 }}>
              Answers are recorded as attributable interview sources and must be extracted and
              reviewed before they can enter a handover.
            </p>
          </section>

          <section className="panel">
            <div className="panel-head">
              <div>
                <h2>Evidence chain rule</h2>
                <p>Why the audit trail matters.</p>
              </div>
            </div>
            <ul className="trust-list">
              <li>Claim → citation → source → chunk → exact quotation.</li>
              <li>Approval is blocked unless every citation verifies.</li>
              <li>Published versions are immutable snapshots.</li>
              <li>Acknowledgement references a specific version.</li>
            </ul>
          </section>
        </div>
      </div>

      <section className="panel">
        <div className="panel-head">
          <div>
            <h2>Audit trail</h2>
            <p>Newest first. The synthetic store is process-local and resets on restart.</p>
          </div>
          <span className="panel-kicker">{data.audit.length} events</span>
        </div>
        <table className="table">
          <thead>
            <tr>
              <th>When</th>
              <th>Event</th>
              <th>Kind</th>
              <th>Actor</th>
              <th>Entity</th>
            </tr>
          </thead>
          <tbody>
            {data.audit.map((event) => (
              <tr key={event.id}>
                <td>{formatDate(event.at)}</td>
                <td>{event.title}</td>
                <td className="mono">{event.kind}</td>
                <td>{event.actor}</td>
                <td className="mono">
                  {event.claimId ? claimById.get(event.claimId)?.title ?? "restricted claim" : event.sourceId ?? event.handoverId ?? "—"}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </section>
    </>
  );
}
