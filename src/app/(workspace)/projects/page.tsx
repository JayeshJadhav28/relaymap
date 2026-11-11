import Link from "next/link";
import {
  EmptyState,
  Metric,
  PageTitle,
  ProjectFacts,
  RoleGuide,
} from "@/components/ui";
import { StatusBadge } from "@/components/StatusBadge";
import { getWorkspaceData } from "@/lib/demo/view";
import { formatDate } from "@/lib/presentation";

export const dynamic = "force-dynamic";

export default async function ProjectsPage() {
  const data = await getWorkspaceData();
  const risks = data.claims.filter((claim) => claim.status !== "APPROVED");
  const approved = data.claims.filter((claim) => claim.status === "APPROVED").length;

  return (
    <>
      <PageTitle
        title="Projects"
        description="Project knowledge and continuity status for the synthetic CampusConnect workspace."
        actions={
          <Link className="btn" href="/knowledge">
            Browse knowledge
          </Link>
        }
      />

      <section className="panel" style={{ marginBottom: 14 }}>
        <div className="panel-head">
          <div>
            <h2>{data.project.name}</h2>
            <p>Active pilot · preparing a role-aware handover</p>
          </div>
          <span className="status status-positive">Active</span>
        </div>
        <p style={{ maxWidth: 900 }}>{data.project.description}</p>
        <div className="project-facts" style={{ marginTop: 18 }}>
          <ProjectFacts project={data.project} />
        </div>
        <div className="metrics" style={{ margin: "18px 0 0" }}>
          <Metric label="Accessible sources" value={data.sources.length} note="Role-filtered" />
          <Metric label="Knowledge claims" value={data.claims.length} note="Visible to this role" />
          <Metric label="Approved" value={approved} note="Human-reviewed" />
          <Metric
            label="Readiness"
            value={`${data.readiness.score}/100`}
            note="Deterministic signal"
          />
        </div>
      </section>

      <div className="detail-grid detail-grid-wide">
        <section className="panel">
          <div className="panel-head">
            <div>
              <h2>Transition risks and open findings</h2>
              <p>Nothing here is presented as a settled fact until it is approved.</p>
            </div>
            <span className="panel-kicker">{risks.length} open</span>
          </div>
          {risks.length ? (
            <div className="activity-list">
              {risks.map((claim) => (
                <Link className="activity-row" href={`/knowledge#claim-${claim.id}`} key={claim.id}>
                  <span className="activity-icon">{claim.type.slice(0, 2)}</span>
                  <div>
                    <strong>{claim.title}</strong>
                    <small>{claim.description}</small>
                  </div>
                  <StatusBadge status={claim.status} />
                </Link>
              ))}
            </div>
          ) : (
            <EmptyState>All visible claims are approved.</EmptyState>
          )}
        </section>

        <div className="stack">
          <section className="panel">
            <div className="panel-head">
              <div>
                <h2>Project ownership</h2>
                <p>Fictional CampusConnect roster.</p>
              </div>
              <span className="panel-kicker">Synthetic</span>
            </div>
            <div className="activity-list">
              {[
                ["MS", "Meera Shah", "Project lead · departing member"],
                ["AA", "Aarav Anand", "Technical owner · route import"],
                ["RK", "Riya Kapoor", "General member · review support"],
                ["HR", "Hemant Rai", "Incoming owner · transition recipient"],
              ].map(([initials, name, detail]) => (
                <div className="activity-row" key={name}>
                  <span className="avatar">{initials}</span>
                  <div>
                    <strong>{name}</strong>
                    <small>{detail}</small>
                  </div>
                </div>
              ))}
            </div>
          </section>

          <section className="panel">
            <div className="panel-head">
              <div>
                <h2>Latest recorded activity</h2>
                <p>Audit events are append-only in the synthetic store.</p>
              </div>
            </div>
            <div className="activity-list">
              {data.audit.slice(0, 4).map((event) => (
                <div className="activity-row" key={event.id}>
                  <span className="activity-icon">EV</span>
                  <div>
                    <strong>{event.title}</strong>
                    <small>
                      {event.actor} · {formatDate(event.at)}
                    </small>
                  </div>
                </div>
              ))}
            </div>
          </section>
        </div>
      </div>

      <section className="panel" style={{ marginTop: 14 }}>
        <div className="panel-head">
          <div>
            <h2>Role preview</h2>
            <p>Permissions are applied server-side before any page is rendered.</p>
          </div>
        </div>
        <RoleGuide current={data.role} />
      </section>
    </>
  );
}
