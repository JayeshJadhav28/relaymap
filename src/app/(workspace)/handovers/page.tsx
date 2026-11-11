import Link from "next/link";
import { AskBuddy } from "@/components/AskBuddy";
import { HandoverCard } from "@/components/HandoverCard";
import { HandoverCreate } from "@/components/HandoverCreate";
import { EmptyState, PageTitle } from "@/components/ui";
import { getWorkspaceData } from "@/lib/demo/view";

export const dynamic = "force-dynamic";

export default async function HandoversPage() {
  const data = await getWorkspaceData();

  return (
    <>
      <PageTitle
        title="Handover studio"
        description="Assemble approved knowledge for a specific recipient role, publish an immutable version, and record acknowledgement."
        actions={
          <Link className="btn" href="/review">
            Review claims
          </Link>
        }
      />

      {data.role === "lead" ? <HandoverCreate /> : null}

      {data.role === "incoming" ? (
        <div className="demo-banner">
          <span className="demo-dot" />
          <span>
            You are previewing the incoming owner. Only published handovers addressed to the
            incoming role are visible. Drafts, finance sources and unapproved claims are excluded.
          </span>
        </div>
      ) : null}

      <AskBuddy projectId={data.project.id} />

      {data.handovers.length ? (
        data.handovers.map((handover) => (
          <HandoverCard
            key={handover.id}
            handover={handover}
            sources={data.sources}
            acknowledgements={data.acknowledgements}
            role={data.role}
            canManage={data.capabilities.canManage}
            canAcknowledge={data.capabilities.canAcknowledge}
          />
        ))
      ) : (
        <EmptyState>
          {data.role === "lead"
            ? "No handover exists yet. Generate a draft to preview the recipient view."
            : "No published handover is available for this role yet. The project lead must publish one first."}
        </EmptyState>
      )}

      <section className="panel" style={{ marginTop: 14 }}>
        <div className="panel-head">
          <div>
            <h2>Assembly rules</h2>
            <p>What the recipient can and cannot receive.</p>
          </div>
        </div>
        <ul className="trust-list">
          <li>
            Approved claims become factual sections. Unresolved claims appear only under “Unresolved
            items — not approved facts”.
          </li>
          <li>
            Restricted sources and every claim citing them are excluded before the draft is created.
          </li>
          <li>Only the excluded count is disclosed; excluded content is never returned.</li>
          <li>
            Publishing snapshots the claim set, readiness rubric and SHA-256 content hash. The
            version cannot be edited afterwards.
          </li>
        </ul>
      </section>
    </>
  );
}
