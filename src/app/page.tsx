import Link from "next/link";
import { ArrowRight, Link2 } from "lucide-react";
import { getStore } from "@/lib/demo/store";
import { ROLE_LABEL } from "@/lib/presentation";
import { LogoMark } from "@/components/LogoMark";

export const dynamic = "force-dynamic";

export default function LandingPage() {
  const store = getStore();
  const approved = store.claims.filter((claim) => claim.status === "APPROVED").length;
  const needsAttention = store.claims.filter(
    (claim) =>
      claim.status === "CONFLICTING" ||
      claim.status === "MISSING_EVIDENCE" ||
      claim.status === "NEEDS_REVIEW",
  ).length;

  // One real, traceable record from the synthetic fixture: an approved claim
  // bound to an exact quotation from a source chunk.
  const featured =
    store.claims.find(
      (claim) =>
        claim.status === "APPROVED" &&
        claim.citations.some(
          (citation) => citation.verification === "VERIFIED" && citation.quote.trim().length > 0,
        ),
    ) ?? store.claims.find((claim) => claim.citations.length > 0);

  const citation = featured?.citations.find((item) => item.quote.trim().length > 0);
  const source = store.sources.find((item) => item.id === citation?.sourceId);
  const chunk = source?.chunks.find((item) => item.id === citation?.chunkId);
  const review = featured
    ? store.reviews.filter((record) => record.claimId === featured.id).slice(-1)[0]
    : undefined;

  return (
    <div className="landing-page">
      <header className="landing-nav">
        <Link href="/" className="brand">
          <span className="brandmark">
            <LogoMark size={20} />
          </span>
          relaymap
        </Link>
        <nav className="landing-links">
          <Link href="/dashboard">Demo workspace</Link>
          <Link href="/app">Real workspace</Link>
          <Link href="/login">Sign in</Link>
        </nav>
      </header>

      <main>
        <section className="landing-hero">
          <div>
            <span className="landing-logo">
              <LogoMark size={32} />
            </span>
            <span className="eyebrow">
              <Link2 size={14} strokeWidth={1.5} aria-hidden="true" />
              Evidence-driven project continuity
            </span>
            <h1>
              Leave the project.
              <br />
              <em>Not the knowledge.</em>
            </h1>
            <p className="lede">
              RelayMap turns scattered project records into a structured, evidence-linked,
              human-approved and permission-aware handover. Every important assertion either cites
              an exact source quotation or is visibly marked uncertain, conflicting or missing.
            </p>
            <div className="landing-actions">
              <Link className="btn btn-primary" href="/dashboard">
                Enter the synthetic demo
                <ArrowRight size={15} strokeWidth={1.5} aria-hidden="true" />
              </Link>
              <Link className="btn" href="/login">
                Sign in to a real workspace
              </Link>
            </div>
            <p className="landing-note">
              The demo is fully labelled synthetic data: fictional CampusConnect records that
              reset on restart. Real accounts sign in with Firebase; their rows are governed by
              Supabase row-level security and never mix with the demo.
            </p>
          </div>

          <aside className="landing-panel">
            <h2>One claim, traced end to end</h2>

            {featured && citation ? (
              <>
                <figure className="record-card">
                  <div className="record-top">
                    <span className="badge badge-approved">Approved</span>
                    <span className="type-chip">{featured.type}</span>
                  </div>
                  <strong className="record-title">{featured.title}</strong>
                  <blockquote>{`“${citation.quote}”`}</blockquote>
                  <figcaption>
                    <span>{source?.title ?? "Source record"}</span>
                    <span>
                      chunk {typeof chunk?.index === "number" ? chunk.index + 1 : "—"}
                      {citation.page ? ` · p. ${citation.page}` : ""}
                    </span>
                    <span className="mini-state mini-verified">
                      {citation.verification === "VERIFIED" ? "Quotation verified" : "Unverified"}
                    </span>
                  </figcaption>
                </figure>

                <div className="relay-trace" aria-label="Relay trace: chunk to claim to review to handover">
                  <span>Chunk</span>
                  <span>Claim</span>
                  <span>Review</span>
                  <span>Handover</span>
                </div>

                <p className="record-note">
                  {review
                    ? `${review.action === "approve" ? "Approved" : "Reviewed"} by ${review.reviewer}. The decision is kept in an append-only review record.`
                    : "Human approval is required before any claim can appear in a handover."}
                </p>
              </>
            ) : null}

            <div className="landing-stats">
              <div className="landing-stat">
                <span>Synthetic sources</span>
                <strong>{store.sources.length}</strong>
              </div>
              <div className="landing-stat">
                <span>Knowledge claims</span>
                <strong>{store.claims.length}</strong>
              </div>
              <div className="landing-stat">
                <span>Human-approved</span>
                <strong>{approved}</strong>
              </div>
              <div className="landing-stat">
                <span>Needs attention</span>
                <strong>{needsAttention}</strong>
              </div>
              <div className="landing-stat">
                <span>Preview roles</span>
                <span className="subtle">
                  {(["lead", "reviewer", "treasurer", "incoming"] as const)
                    .map((role) => ROLE_LABEL[role])
                    .join(" · ")}
                </span>
              </div>
            </div>
          </aside>
        </section>

        <section className="landing-grid">
          <article className="feature-card">
            <h3>Exact, chunk-bound evidence</h3>
            <p>
              A claim references a real source, a real chunk and an exact quotation. Invented
              quotations and wrong-chunk citations fail verification in TypeScript and again in
              PostgreSQL.
            </p>
          </article>
          <article className="feature-card">
            <h3>Human approval only</h3>
            <p>
              Deterministic extraction proposes claims. Nothing becomes approved automatically.
              Approval requires a verified citation, a reviewer identity and an append-only review
              record.
            </p>
          </article>
          <article className="feature-card">
            <h3>Permission-aware assembly</h3>
            <p>
              Handovers are assembled using the recipient&apos;s permissions. Restricted finance
              sources and every claim citing them are excluded before the draft exists.
            </p>
          </article>
          <article className="feature-card">
            <h3>Immutable versions</h3>
            <p>
              Publishing snapshots the exact claim set, content hash and readiness calculation.
              Recipients acknowledge a specific version, producing an audit trail.
            </p>
          </article>
          <article className="feature-card">
            <h3>Answers all seven questions</h3>
            <p>
              What happened, why, who was responsible, what is unfinished, what depends on it,
              what can go wrong, and what should happen next.
            </p>
          </article>
          <article className="feature-card">
            <h3>Honest about uncertainty</h3>
            <p>
              Conflicts, missing rationale, ownership gaps and knowledge concentration are
              first-class findings. The product never invents a reason to fill a gap.
            </p>
          </article>
        </section>
      </main>

      
    </div>
  );
}
