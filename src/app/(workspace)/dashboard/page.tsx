import Link from "next/link";
import { ReadinessPanel } from "@/components/ReadinessPanel";
import { Metric, PageTitle } from "@/components/ui";
import { getWorkspaceData } from "@/lib/demo/view";
import { CLAIM_TYPE_LABEL, formatDate, formatDay } from "@/lib/presentation";

export const dynamic = "force-dynamic";

export default async function DashboardPage() {
  const data = await getWorkspaceData();
  const approved = data.claims.filter((claim) => claim.status === "APPROVED").length;
  const attention = data.claims.filter(
    (claim) =>
      claim.status === "CONFLICTING" ||
      claim.status === "MISSING_EVIDENCE" ||
      claim.status === "NEEDS_REVIEW" ||
      claim.status === "INFERRED",
  ).length;
  const tasks = data.claims.filter(
    (claim) => claim.type === "TASK" || claim.type === "NEXT_ACTION",
  );
  const ownershipGaps = tasks.filter((task) => !task.owner).length;

  const health = [
    { label: "Approved", value: approved, color: "var(--positive)" },
    {
      label: "Needs review",
      value: data.claims.filter((claim) => claim.status === "NEEDS_REVIEW").length,
      color: "var(--info)",
    },
    {
      label: "Conflicting",
      value: data.claims.filter((claim) => claim.status === "CONFLICTING").length,
      color: "var(--danger)",
    },
    {
      label: "Missing evidence",
      value: data.claims.filter((claim) => claim.status === "MISSING_EVIDENCE").length,
      color: "var(--warn)",
    },
  ];
  const maxHealth = Math.max(...health.map((item) => item.value), 1);

  return (
    <>
      <PageTitle
        title="Knowledge command centre"
        description="See what the team knows, what remains uncertain, and what must be resolved before the handover can be trusted."
        actions={
          <>
            <Link className="btn" href="/sources">
              Add evidence
            </Link>
            <Link className="btn btn-primary" href="/review">
              Open review queue
            </Link>
          </>
        }
      />

      <div className="metrics">
        <Metric
          label="Accessible claims"
          value={data.claims.length}
          note={`${data.excludedCount} claim(s) excluded by role`}
        />
        <Metric label="Approved" value={approved} note="Verified and human-approved" />
        <Metric label="Needs attention" value={attention} note="Unresolved or missing evidence" />
        <Metric label="Ownership gaps" value={ownershipGaps} note="Tasks without a named owner" />
      </div>

      <div className="dashboard-grid">
        <ReadinessPanel readiness={data.readiness} />
        <section className="panel">
          <div className="panel-head">
            <div>
              <h2>Knowledge health</h2>
              <p>Counts use only records available to the current preview role.</p>
            </div>
            <span className="panel-kicker">{data.claims.length} accessible</span>
          </div>
          <div className="health-bars">
            {health.map((row) => (
              <div className="component-row" key={row.label}>
                <div className="component-label">
                  <span>{row.label}</span>
                  <strong>{row.value}</strong>
                </div>
                <div className="bar-track">
                  <div
                    className="bar-fill"
                    style={{
                      width: `${Math.max(row.value ? 4 : 0, (row.value / maxHealth) * 100)}%`,
                      background: row.color,
                    }}
                  />
                </div>
              </div>
            ))}
          </div>
          <div className="claim-meta" style={{ marginTop: 16 }}>
            <span>{data.sources.length} accessible sources</span>
            <span>{data.store.extractionRuns} extraction run(s)</span>
            <span>{data.reviews.length} review record(s)</span>
          </div>
        </section>
      </div>

      <div className="dashboard-grid">
        <section className="panel">
          <div className="panel-head">
            <div>
              <h2>Review queue</h2>
              <p>Claims that need a person to confirm the story.</p>
            </div>
            <Link className="btn" href="/review">
              Open queue
            </Link>
          </div>
          {data.queue.length ? (
            <div className="activity-list">
              {data.queue.slice(0, 5).map((claim) => (
                <Link
                  className="activity-row"
                  href={`/knowledge#claim-${claim.id}`}
                  key={claim.id}
                >
                  <span className="activity-icon">{CLAIM_TYPE_LABEL[claim.type].slice(0, 2)}</span>
                  <div>
                    <strong>{claim.title}</strong>
                    <small>{claim.description}</small>
                  </div>
                  <time>{claim.status.replace("_", " ")}</time>
                </Link>
              ))}
            </div>
          ) : (
            <div className="empty-state">Every accessible claim has a decision.</div>
          )}
        </section>

        <section className="panel">
          <div className="panel-head">
            <div>
              <h2>Recent activity</h2>
              <p>Every mutation writes an audit event.</p>
            </div>
            <Link className="btn" href="/timeline">
              View log
            </Link>
          </div>
          <div className="activity-list">
            {data.audit.slice(0, 6).map((event) => (
              <div className="activity-row" key={event.id}>
                <span className="activity-icon">{event.kind.split(".")[0].slice(0, 2)}</span>
                <div>
                  <strong>{event.title}</strong>
                  <small>{event.actor}</small>
                </div>
                <time>{formatDate(event.at).split(",")[0]}</time>
              </div>
            ))}
          </div>
        </section>
      </div>

      <section className="panel">
        <div className="panel-head">
          <div>
            <h2>Outstanding work</h2>
            <p>Tasks and next actions from accessible claims.</p>
          </div>
          <Link className="btn" href="/handovers">
            Prepare handover
          </Link>
        </div>
        <table className="table">
          <thead>
            <tr>
              <th>Type</th>
              <th>Work</th>
              <th>Owner</th>
              <th>Due</th>
              <th>Status</th>
            </tr>
          </thead>
          <tbody>
            {tasks.map((task) => (
              <tr key={task.id}>
                <td>{task.type === "TASK" ? "Task" : "Next action"}</td>
                <td>{task.title}</td>
                <td className={task.owner ? "" : "task-owner missing"}>
                  {task.owner ?? "Unassigned"}
                </td>
                <td>{task.dueDate ? formatDay(task.dueDate) : "—"}</td>
                <td>{task.status.replace("_", " ")}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </section>
    </>
  );
}
