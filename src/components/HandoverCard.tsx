import type {
  Acknowledgement,
  Handover,
  Role,
  Source,
} from "@/lib/demo/types";
import { latestVersion } from "@/lib/domain/handover";
import { formatDate, shortHash, STATUS_LABEL } from "@/lib/presentation";
import { AcknowledgeButton } from "./AcknowledgeButton";
import { HandoverPublish } from "./HandoverPublish";

export function HandoverCard({
  handover,
  sources,
  acknowledgements,
  role,
  canManage,
  canAcknowledge,
}: {
  handover: Handover;
  sources: Source[];
  acknowledgements: Acknowledgement[];
  role: Role;
  canManage: boolean;
  canAcknowledge: boolean;
}) {
  const version =
    handover.versions.find((item) => item.id === handover.currentVersionId) ??
    latestVersion(handover);
  const acknowledged = acknowledgements.some(
    (ack) => ack.handoverId === handover.id && ack.versionId === version?.id,
  );
  const published = handover.status === "published" && handover.currentVersionId;
  const sourceById = new Map(sources.map((source) => [source.id, source]));

  return (
    <section className="panel handover-card">
      <div className="handover-head">
        <div>
          <div className="claim-kicker">
            <span className="type-chip">Handover</span>
            <span className="pill">Audience: {handover.audienceRole}</span>
            <span className="pill">{handover.status}</span>
          </div>
          <h2>{handover.title}</h2>
          <div className="handover-meta">
            <span>Created {formatDate(handover.createdAt)}</span>
            {version ? <span>Version {version.version}</span> : null}
            {version ? <span>{version.claimIds.length} included claim(s)</span> : null}
            {version ? <span>{version.excludedCount} excluded by recipient permissions</span> : null}
            {version ? <span className="mono">hash {shortHash(version.contentHash)}</span> : null}
          </div>
        </div>
        {version ? (
          <div className="handover-actions">
            <span className={published ? "status status-positive" : "status status-neutral"}>
              {published ? "Published" : "Draft"}
            </span>
            <div className="actions-row">
              {published ? (
                <a
                  className="print-link"
                  href={`/api/handovers/${handover.id}/report`}
                  target="_blank"
                  rel="noreferrer"
                >
                  Printable report
                </a>
              ) : canManage ? (
                <HandoverPublish handoverId={handover.id} />
              ) : null}
            </div>
          </div>
        ) : null}
      </div>

      {version ? (
        <>
          <div className="handover-sections">
            {version.sections.map((section) => (
              <div className="section-block" key={section.key}>
                <h4>{section.title}</h4>
                <p>{section.description}</p>
                {section.claims.length ? (
                  <div className="section-claims">
                    {section.claims.map((claim) => (
                      <div className="section-claim" key={claim.id}>
                        <strong>{claim.title}</strong>
                        <p>{claim.description}</p>
                        <p className="subtle">
                          Owner: {claim.owner ?? "unresolved"} · Due: {claim.dueDate ?? "—"}
                        </p>
                        {claim.citations.map((citation) => (
                          <blockquote key={citation.id}>
                            “{citation.quote}” —{" "}
                            {sourceById.get(citation.sourceId)?.title ?? "source"} · {citation.location}
                          </blockquote>
                        ))}
                      </div>
                    ))}
                  </div>
                ) : (
                  <p className="subtle" style={{ marginTop: 6 }}>
                    No approved claim is currently in this section.
                  </p>
                )}
              </div>
            ))}
          </div>

          {version.openQuestions.length ? (
            <div className="open-questions">
              <h4>Unresolved items — not approved facts</h4>
              <p className="subtle">
                These remain visible so the incoming owner knows what still needs a human answer.
              </p>
              <ul>
                {version.openQuestions.map((claim) => (
                  <li key={claim.id}>
                    <strong>{claim.title}</strong> — {STATUS_LABEL[claim.status]}. {claim.description}
                  </li>
                ))}
              </ul>
            </div>
          ) : null}

          <div className="version-table">
            <table className="table">
              <thead>
                <tr>
                  <th>Version</th>
                  <th>Created</th>
                  <th>Published</th>
                  <th>Readiness</th>
                  <th>Claims</th>
                  <th>Content hash</th>
                </tr>
              </thead>
              <tbody>
                {handover.versions.map((item) => (
                  <tr key={item.id}>
                    <td>v{item.version}</td>
                    <td>{formatDate(item.createdAt)}</td>
                    <td>{item.publishedAt ? formatDate(item.publishedAt) : "Not published"}</td>
                    <td>{item.readiness.score}/100</td>
                    <td>{item.claimIds.length}</td>
                    <td className="mono">{shortHash(item.contentHash)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          {published && canAcknowledge && role === handover.audienceRole ? (
            <AcknowledgeButton handoverId={handover.id} acknowledged={Boolean(acknowledged)} />
          ) : null}

          {acknowledgements.length ? (
            <div className="acknowledged">
              Acknowledged by{" "}
              {acknowledgements.map((ack) => ack.acknowledgedBy).join(", ")} on{" "}
              {formatDate(acknowledgements[acknowledgements.length - 1].at)}.
            </div>
          ) : null}
        </>
      ) : (
        <div className="empty-state">This handover has no version.</div>
      )}
    </section>
  );
}
