"use client";

import Link from "next/link";
import { useParams } from "next/navigation";
import { useCallback, useEffect, useMemo, useState } from "react";
import type { Claim } from "@/lib/demo/types";
import { CLAIM_TYPE_LABEL, formatDate, STATUS_LABEL } from "@/lib/presentation";
import { useRealApi } from "@/components/real/RealApiProvider";
import { RealEmpty, RealError, RealLoading } from "@/components/real/states";
import { KnowledgeList } from "@/components/real/KnowledgeList";
import { ReviewPanel } from "@/components/real/ReviewPanel";
import { SourceIntakeForm } from "@/components/real/SourceIntakeForm";
import { HandoverPanel } from "@/components/real/HandoverPanel";
import { TimelinePanel } from "@/components/real/TimelinePanel";
import type { RealWorkspaceSnapshot } from "@/lib/real/types";
import { PROJECT_ROLE_LABEL } from "@/lib/real/types";

type TabKey =
  | "overview"
  | "sources"
  | "review"
  | "knowledge"
  | "handovers"
  | "timeline";

const TABS: { key: TabKey; label: string }[] = [
  { key: "overview", label: "Overview" },
  { key: "sources", label: "Sources" },
  { key: "review", label: "Review" },
  { key: "knowledge", label: "Knowledge" },
  { key: "handovers", label: "Handovers" },
  { key: "timeline", label: "Timeline" },
];

export default function RealProjectPage() {
  const params = useParams<{ id: string }>();
  const projectId = params?.id ?? "";
  const { call } = useRealApi();
  const [snapshot, setSnapshot] = useState<RealWorkspaceSnapshot | null>(null);
  const [tab, setTab] = useState<TabKey>("overview");
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<{ code: string; message: string } | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    const result = await call<{ source: "real"; snapshot: RealWorkspaceSnapshot }>(
      `/api/app/projects/${encodeURIComponent(projectId)}`,
    );
    setLoading(false);
    if (!result.ok) {
      setError({ code: result.code, message: result.message });
      return;
    }
    setSnapshot(result.data.snapshot);
  }, [call, projectId]);

  useEffect(() => {
    if (!projectId) return;
    let cancelled = false;
    void call<{ source: "real"; snapshot: RealWorkspaceSnapshot }>(
      `/api/app/projects/${encodeURIComponent(projectId)}`,
    ).then((result) => {
      if (cancelled) return;
      setLoading(false);
      if (!result.ok) {
        setError({ code: result.code, message: result.message });
        return;
      }
      setSnapshot(result.data.snapshot);
    });
    return () => {
      cancelled = true;
    };
  }, [call, projectId]);

  const stats = useMemo(() => {
    if (!snapshot) {
      return { approved: 0, attention: 0, sources: 0, owners: 0 };
    }
    const approved = snapshot.claims.filter((claim) => claim.status === "APPROVED").length;
    const attention = snapshot.claims.filter((claim) =>
      ["CONFLICTING", "MISSING_EVIDENCE", "NEEDS_REVIEW", "INFERRED"].includes(claim.status),
    ).length;
    const tasks = snapshot.claims.filter(
      (claim) => claim.type === "TASK" || claim.type === "NEXT_ACTION",
    );
    return {
      approved,
      attention,
      sources: snapshot.sources.length,
      owners: tasks.filter((task) => !task.owner).length,
    };
  }, [snapshot]);

  if (loading && !snapshot) {
    return <RealLoading label="Reading this project under your Firebase identity…" />;
  }

  if (error) {
    const denied = error.code === "NOT_FOUND" || error.code === "FORBIDDEN";
    return (
      <div className="real-page">
        <RealError
          title={denied ? "Access denied" : "Project unavailable"}
          message={
            denied
              ? "This project either does not exist or is not visible to your membership. No demo data was substituted."
              : error.message
          }
          onRetry={denied ? undefined : load}
        />
        <p className="subtle">
          <Link href="/app" className="text-link">
            Back to your projects
          </Link>
        </p>
      </div>
    );
  }

  if (!snapshot) {
    return (
      <div className="real-page">
        <RealEmpty title="Project not found">
          Return to the workspace list and choose a project you belong to.
        </RealEmpty>
      </div>
    );
  }

  const { project, organization, role, capabilities, readiness, queue } = snapshot;

  return (
    <div className="real-page">
      <header className="real-page-head project-head">
        <div>
          <div className="row-meta">
            <span className="context-chip">{organization.name}</span>
            <span className="badge badge-quiet">{PROJECT_ROLE_LABEL[role]}</span>
            {organization.clearance === "finance" ? (
              <span className="badge badge-quiet">Finance clearance</span>
            ) : null}
          </div>
          <h1>{project.name}</h1>
          <p>{project.description || "No project description has been recorded yet."}</p>
        </div>
        <div className="head-actions">
          <Link className="btn" href="/app">
            All projects
          </Link>
        </div>
      </header>

      <nav className="tab-bar" aria-label="Project sections">
        {TABS.map((item) => (
          <button
            key={item.key}
            type="button"
            className={`tab${tab === item.key ? " active" : ""}`}
            aria-current={tab === item.key ? "page" : undefined}
            onClick={() => setTab(item.key)}
          >
            {item.label}
            {item.key === "review" && queue.length ? (
              <span className="tab-count">{queue.length}</span>
            ) : null}
          </button>
        ))}
      </nav>

      {tab === "overview" ? (
        <div className="stack">
          <div className="metrics">
            <div className="metric">
              <div className="metric-head">
                <span>Accessible claims</span>
              </div>
              <strong>{snapshot.claims.length}</strong>
              <small>
                {snapshot.allClaimCount} total · {snapshot.excludedCount} excluded by access
              </small>
            </div>
            <div className="metric">
              <div className="metric-head">
                <span>Approved</span>
              </div>
              <strong>{stats.approved}</strong>
              <small>Verified and human-approved facts</small>
            </div>
            <div className="metric">
              <div className="metric-head">
                <span>Needs attention</span>
              </div>
              <strong>{stats.attention}</strong>
              <small>Unresolved, conflicting or missing evidence</small>
            </div>
            <div className="metric">
              <div className="metric-head">
                <span>Ownership gaps</span>
              </div>
              <strong>{stats.owners}</strong>
              <small>Task or next action without a named owner</small>
            </div>
          </div>

          <div className="detail-grid detail-grid-wide">
            <section className="panel readiness-panel">
              <div className="panel-head">
                <div>
                  <h2>Handover readiness</h2>
                  <p>
                    Deterministic 100-point signal. Every deduction is explained against the
                    records this role can read.
                  </p>
                </div>
                <span className="panel-kicker">Rubric 25/25/15/15/10/10</span>
              </div>
              <div className="readiness-top">
                <div
                  className="score-ring"
                  style={{
                    background: `conic-gradient(var(--accent) 0 ${readiness.score}%, rgba(255,255,255,.08) ${readiness.score}% 100%)`,
                  }}
                >
                  <span>
                    <strong>{readiness.score}</strong>
                    <small>/100</small>
                  </span>
                </div>
                <div className="readiness-components">
                  {readiness.components.map((component) => (
                    <div className="component-row" key={component.key}>
                      <div className="component-label">
                        <span>{component.label}</span>
                        <span className="mono">
                          {component.earned}/{component.max}
                        </span>
                      </div>
                      <div className="bar-track">
                        <div
                          className="bar-fill"
                          style={{ width: `${(component.earned / component.max) * 100}%` }}
                        />
                      </div>
                      <p>{component.reason}</p>
                    </div>
                  ))}
                </div>
              </div>
              <div className="caveat">
                <strong>Readiness caveat.</strong>{" "}
                {readiness.caveat ??
                  "A readiness score is a signal, not a guarantee of successful knowledge transfer."}
              </div>
            </section>

            <div className="stack">
              <section className="panel">
                <div className="panel-head">
                  <div>
                    <h2>Project record</h2>
                    <p>Read from the workspace database under row-level security.</p>
                  </div>
                </div>
                <dl className="fact-list">
                  <div>
                    <dt>Organisation role</dt>
                    <dd>{organization.role}</dd>
                  </div>
                  <div>
                    <dt>Project role</dt>
                    <dd>{PROJECT_ROLE_LABEL[role]}</dd>
                  </div>
                  <div>
                    <dt>Sources</dt>
                    <dd>{stats.sources}</dd>
                  </div>
                  <div>
                    <dt>Handovers</dt>
                    <dd>{snapshot.handovers.length}</dd>
                  </div>
                  <div>
                    <dt>Review records</dt>
                    <dd>{snapshot.reviews.length}</dd>
                  </div>
                  <div>
                    <dt>Project status</dt>
                    <dd>{project.status}</dd>
                  </div>
                </dl>
              </section>

              <section className="panel">
                <div className="panel-head">
                  <div>
                    <h2>Next step</h2>
                    <p>What this role can do now.</p>
                  </div>
                </div>
                <ul className="trust-list">
                  {capabilities.canContribute ? (
                    <li>Add a source; every extracted claim begins unapproved.</li>
                  ) : null}
                  {capabilities.canReview ? (
                    <li>
                      Work the review queue — {queue.length} claim(s) currently need a decision.
                    </li>
                  ) : null}
                  {capabilities.canLead ? (
                    <li>Assemble and publish an immutable handover version.</li>
                  ) : null}
                  {capabilities.canAcknowledge ? (
                    <li>Acknowledge a published handover addressed to the incoming role.</li>
                  ) : null}
                  {!capabilities.canContribute && !capabilities.canReview ? (
                    <li>Your role is read-only. Approved material stays visible after publication.</li>
                  ) : null}
                </ul>
                <div className="actions-row">
                  <button className="btn" type="button" onClick={() => setTab("review")}>
                    Open review queue
                  </button>
                  <button className="btn" type="button" onClick={() => setTab("handovers")}>
                    Handovers
                  </button>
                </div>
              </section>
            </div>
          </div>

          {queue.length ? (
            <section className="panel">
              <div className="panel-head">
                <div>
                  <h2>Review queue</h2>
                  <p>Claims that need a person to confirm the story.</p>
                </div>
                <button className="btn" type="button" onClick={() => setTab("review")}>
                  Open queue
                </button>
              </div>
              <div className="activity-list">
                {queue.slice(0, 5).map((claim) => (
                  <QueueRow claim={claim} key={claim.id} onOpen={() => setTab("review")} />
                ))}
              </div>
            </section>
          ) : null}
        </div>
      ) : null}

      {tab === "sources" ? (
        <div className="stack">
          {capabilities.canContribute ? (
            <SourceIntakeForm
              projectId={projectId}
              canUseFinance={role === "lead" || organization.clearance === "finance"}
              onDone={load}
            />
          ) : (
            <RealEmpty title="Read-only sources">
              Your project role can read sources but cannot add new ones.
            </RealEmpty>
          )}

          {snapshot.sources.length ? (
            <div className="source-grid">
              {snapshot.sources.map((source) => (
                <article className="panel source-card" key={source.id}>
                  <div className="source-top">
                    <div>
                      <h3>{source.title}</h3>
                      <span className="subtle">
                        {source.kind.toUpperCase()} · {source.chunks.length} chunk(s)
                      </span>
                    </div>
                    <span className="badge badge-quiet">
                      {source.access === "finance" ? "Finance only" : "Project"}
                    </span>
                  </div>
                  <div className="source-meta">
                    <span>Added {formatDate(source.createdAt)}</span>
                    <span>by {source.createdBy}</span>
                    <span className="mono">
                      {source.hash.replace(/^sha256:/, "").slice(0, 16)}
                    </span>
                  </div>
                  <p className="source-preview">
                    {source.content.slice(0, 220)}
                    {source.content.length > 220 ? "…" : ""}
                  </p>
                  <p className="subtle">
                    {source.extracted ? "Extraction complete" : "Extraction pending"} · private
                    storage object retained
                  </p>
                </article>
              ))}
            </div>
          ) : (
            <RealEmpty title="No sources yet">
              {capabilities.canContribute
                ? "Upload a text, markdown, CSV, JSON, PDF or DOCX file. It goes to the private source bucket before extraction."
                : "No accessible source exists for this project yet."}
            </RealEmpty>
          )}
        </div>
      ) : null}

      {tab === "review" ? (
        <div className="stack">
          <section className="panel">
            <div className="panel-head">
              <div>
                <h2>Review queue</h2>
                <p>
                  Approval requires an exact, chunk-bound citation that verifies. Unresolved claims
                  are never promoted into a handover as facts.
                </p>
              </div>
              <span className="panel-kicker">{queue.length} waiting</span>
            </div>
          </section>
          <ReviewPanel
            projectId={projectId}
            claims={queue}
            canReview={capabilities.canReview}
            onDone={load}
          />
        </div>
      ) : null}

      {tab === "knowledge" ? (
        <KnowledgeList
          claims={snapshot.claims}
          sources={snapshot.sources}
          excludedCount={snapshot.excludedCount}
        />
      ) : null}

      {tab === "handovers" ? (
        <HandoverPanel
          projectId={projectId}
          handovers={snapshot.handovers}
          acknowledgements={snapshot.acknowledgements}
          canLead={capabilities.canLead}
          canAcknowledge={capabilities.canAcknowledge}
          onDone={load}
        />
      ) : null}

      {tab === "timeline" ? (
        <TimelinePanel
          audit={snapshot.audit}
          reviews={snapshot.reviews}
          claims={snapshot.claims}
        />
      ) : null}
    </div>
  );
}

function QueueRow({ claim, onOpen }: { claim: Claim; onOpen: () => void }) {
  return (
    <button className="activity-row activity-button" type="button" onClick={onOpen}>
      <span className="activity-icon">{CLAIM_TYPE_LABEL[claim.type].slice(0, 2)}</span>
      <div>
        <strong>{claim.title}</strong>
        <small>
          {CLAIM_TYPE_LABEL[claim.type]} · {STATUS_LABEL[claim.status]}
        </small>
      </div>
      <time>{Math.round(claim.confidence * 100)}%</time>
    </button>
  );
}
