import type { Claim, Readiness } from "@/lib/demo/types";

export function ReadinessPanel({
  readiness,
  title = "Handover readiness",
}: {
  readiness: Readiness;
  title?: string;
}) {
  return (
    <section className="panel readiness-panel">
      <div className="panel-head">
        <div>
          <h2>{title}</h2>
          <p>Deterministic 100-point signal. Every deduction is explained.</p>
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
  );
}

export function MiniReadiness({ readiness }: { readiness: Readiness }) {
  return (
    <div className="mini-readiness">
      <div
        className="score-ring score-ring-small"
        style={{
          background: `conic-gradient(var(--accent) 0 ${readiness.score}%, rgba(255,255,255,.08) ${readiness.score}% 100%)`,
        }}
      >
        <span>
          <strong>{readiness.score}</strong>
        </span>
      </div>
      <div>
        <strong>{readiness.score}% ready</strong>
        <p>
          {readiness.components.filter((component) => component.earned < component.max).length} of{" "}
          {readiness.components.length} components have lost points.
        </p>
      </div>
    </div>
  );
}

export function claimSummary(claim: Claim): string {
  return claim.description || claim.title;
}
