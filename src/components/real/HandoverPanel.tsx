"use client";

import { useState, type FormEvent } from "react";
import type {
  Acknowledgement,
  Handover,
  HandoverVersion,
  Role,
} from "@/lib/demo/types";
import { formatDate } from "@/lib/presentation";
import { useFirebaseAuth } from "@/lib/firebase/auth-provider";
import { useRealApi } from "@/components/real/RealApiProvider";
import { RealEmpty, RealError } from "@/components/real/states";

type AudienceRole =
  | "lead"
  | "reviewer"
  | "contributor"
  | "departed"
  | "incoming"
  | "viewer";

const AUDIENCE_LABEL: Record<AudienceRole, string> = {
  lead: "Project lead",
  reviewer: "Reviewer",
  contributor: "Contributor",
  departed: "Departed member",
  incoming: "Incoming owner",
  viewer: "Viewer",
};

const DEMO_ROLE_TO_AUDIENCE: Record<Role, AudienceRole> = {
  lead: "lead",
  reviewer: "reviewer",
  treasurer: "viewer",
  incoming: "incoming",
};

function currentVersion(handover: Handover): HandoverVersion | undefined {
  return handover.currentVersionId
    ? handover.versions.find((version) => version.id === handover.currentVersionId)
    : handover.versions[handover.versions.length - 1];
}

export function HandoverPanel({
  projectId,
  handovers,
  acknowledgements,
  canLead,
  canAcknowledge,
  onDone,
}: {
  projectId: string;
  handovers: Handover[];
  acknowledgements: Acknowledgement[];
  canLead: boolean;
  canAcknowledge: boolean;
  onDone: () => void;
}) {
  const { call } = useRealApi();
  const { getAccessToken } = useFirebaseAuth();
  const [audienceRole, setAudienceRole] = useState<AudienceRole>("incoming");
  const [title, setTitle] = useState("");
  const [note, setNote] = useState("");
  const [busy, setBusy] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [message, setMessage] = useState<string | null>(null);

  async function createHandover(event: FormEvent) {
    event.preventDefault();
    setBusy("create");
    setError(null);
    setMessage(null);
    const result = await call<{ handoverId: string; versionId: string }>(
      `/api/app/projects/${projectId}/handovers`,
      {
        method: "POST",
        body: JSON.stringify({ audienceRole, title: title.trim() || undefined }),
      },
    );
    setBusy(null);
    if (!result.ok) {
      setError(result.message);
      return;
    }
    setTitle("");
    setMessage(
      `Draft assembled for ${AUDIENCE_LABEL[audienceRole]}. Nothing is visible to the recipient until a version is published.`,
    );
    onDone();
  }

  async function publish(handoverId: string) {
    setBusy(`publish:${handoverId}`);
    setError(null);
    setMessage(null);
    const result = await call<{ version: number }>(
      `/api/app/projects/${projectId}/handovers/${handoverId}/publish`,
      { method: "POST" },
    );
    setBusy(null);
    if (!result.ok) {
      setError(result.message);
      return;
    }
    setMessage(
      `Version ${result.data.version} published. The claim set and content hash are now immutable.`,
    );
    onDone();
  }

  async function acknowledge(handoverId: string) {
    setBusy(`ack:${handoverId}`);
    setError(null);
    setMessage(null);
    const result = await call<{ acknowledgement: { versionId: string } }>(
      `/api/app/projects/${projectId}/handovers/${handoverId}/acknowledge`,
      {
        method: "POST",
        body: JSON.stringify({ note: note.trim() || undefined }),
      },
    );
    setBusy(null);
    if (!result.ok) {
      setError(result.message);
      return;
    }
    setNote("");
    setMessage("Receipt acknowledged against the published version and recorded in the audit trail.");
    onDone();
  }

  async function download(handoverId: string) {
    setBusy(`report:${handoverId}`);
    setError(null);
    setMessage(null);
    try {
      const token = await getAccessToken();
      if (!token) throw new Error("Your Firebase session expired. Sign in again.");
      const response = await fetch(
        `/api/app/projects/${projectId}/handovers/${handoverId}/report`,
        { headers: { Authorization: `Bearer ${token}` }, cache: "no-store" },
      );
      if (!response.ok) {
        const body = (await response.json().catch(() => null)) as
          | { error?: { message?: string } }
          | null;
        throw new Error(body?.error?.message ?? "The report could not be generated.");
      }
      const blob = await response.blob();
      const disposition = response.headers.get("Content-Disposition") ?? "";
      const match = disposition.match(/filename="([^"]+)"/);
      const filename = match?.[1] ?? `${projectId}-handover.html`;
      const url = URL.createObjectURL(blob);
      const anchor = document.createElement("a");
      anchor.href = url;
      anchor.download = filename;
      anchor.click();
      URL.revokeObjectURL(url);
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "The report could not be generated.");
    } finally {
      setBusy(null);
    }
  }

  return (
    <div className="stack">
      {error ? <RealError title="Handover action failed" message={error} /> : null}
      {message ? <p className="action-message ok">{message}</p> : null}

      {canLead ? (
        <form className="panel form-panel" onSubmit={createHandover}>
          <div className="panel-head">
            <div>
              <h2>Assemble a handover</h2>
              <p>
                The draft is built from the recipient role&apos;s permissions, never the author&apos;s.
                Unresolved claims stay under open questions and are never shown as facts.
              </p>
            </div>
          </div>
          <div className="form-grid">
            <label className="field">
              <span>Recipient role</span>
              <select
                value={audienceRole}
                onChange={(event) => setAudienceRole(event.target.value as AudienceRole)}
              >
                {(Object.keys(AUDIENCE_LABEL) as AudienceRole[]).map((role) => (
                  <option key={role} value={role}>
                    {AUDIENCE_LABEL[role]}
                  </option>
                ))}
              </select>
              <small>Only this role will see the published version.</small>
            </label>
            <label className="field">
              <span>Title (optional)</span>
              <input
                value={title}
                onChange={(event) => setTitle(event.target.value)}
                maxLength={160}
                placeholder="Operations handover"
              />
            </label>
          </div>
          <button className="btn btn-primary" type="submit" disabled={busy === "create"}>
            {busy === "create" ? "Assembling…" : "Assemble draft"}
          </button>
        </form>
      ) : null}

      {handovers.length ? (
        handovers.map((handover) => {
          const version = currentVersion(handover);
          const audience = DEMO_ROLE_TO_AUDIENCE[handover.audienceRole] ?? "incoming";
          const versionAcknowledgements = acknowledgements.filter(
            (ack) => ack.handoverId === handover.id,
          );
          const acknowledged = version
            ? versionAcknowledgements.some((ack) => ack.versionId === version.id)
            : false;
          const approvedClaims =
            version?.sections.reduce((total, section) => total + section.claims.length, 0) ?? 0;

          return (
            <article className="panel handover-card" key={handover.id}>
              <div className="handover-head">
                <div>
                  <div className="row-meta">
                    <span
                      className={`badge badge-${handover.status === "published" ? "approved" : "needs_review"}`}
                    >
                      {handover.status === "published" ? "Published" : "Draft"}
                    </span>
                    <span className="badge badge-quiet">{AUDIENCE_LABEL[audience]}</span>
                    {version ? (
                      <span className="mono subtle">version {version.version}</span>
                    ) : null}
                  </div>
                  <h3>{handover.title}</h3>
                </div>
                <span className="mono subtle">{formatDate(handover.createdAt)}</span>
              </div>

              {version ? (
                <>
                  <div className="handover-meta">
                    <span>
                      Readiness{" "}
                      <strong className="mono">{version.readiness.score}/100</strong>
                    </span>
                    <span>
                      Approved claims <strong className="mono">{approvedClaims}</strong>
                    </span>
                    <span>
                      Open questions{" "}
                      <strong className="mono">{version.openQuestions.length}</strong>
                    </span>
                    <span>
                      Content hash{" "}
                      <span className="mono">
                        {version.contentHash.replace(/^sha256:/, "").slice(0, 12)}
                      </span>
                    </span>
                    {version.publishedAt ? (
                      <span>Published {formatDate(version.publishedAt)}</span>
                    ) : null}
                  </div>

                  <div className="handover-sections">
                    {version.sections.map((section) => (
                      <div className="section-block" key={section.key}>
                        <h4>{section.title}</h4>
                        {section.claims.length ? (
                          <div className="section-claims">
                            {section.claims.map((claim) => (
                              <div className="section-claim" key={claim.id}>
                                <strong>{claim.title}</strong>
                                <p>{claim.description}</p>
                                {claim.citations[0] ? (
                                  <blockquote>{claim.citations[0].quote}</blockquote>
                                ) : null}
                              </div>
                            ))}
                          </div>
                        ) : (
                          <p className="subtle">No approved claim is available for this section.</p>
                        )}
                      </div>
                    ))}
                  </div>

                  {version.openQuestions.length ? (
                    <div className="open-questions">
                      <h4>Unresolved items — not approved facts</h4>
                      <ul>
                        {version.openQuestions.map((claim) => (
                          <li key={claim.id}>
                            <strong>{claim.title}</strong> — {claim.status.replace(/_/g, " ")}.{" "}
                            {claim.description}
                          </li>
                        ))}
                      </ul>
                    </div>
                  ) : null}

                  {versionAcknowledgements.length ? (
                    <div className="acknowledged">
                      <strong>Recorded receipts</strong>
                      <ul className="plain-list">
                        {versionAcknowledgements.map((ack) => (
                          <li key={ack.id}>
                            <span>
                              {ack.acknowledgedBy} · {formatDate(ack.at)}
                            </span>
                            <span className="subtle">{ack.note}</span>
                          </li>
                        ))}
                      </ul>
                    </div>
                  ) : null}
                </>
              ) : (
                <p className="subtle">
                  This handover has no assembled version body yet. Publish is blocked.
                </p>
              )}

              <div className="actions-row">
                {canLead && handover.status !== "published" ? (
                  <button
                    className="btn btn-primary"
                    type="button"
                    disabled={busy === `publish:${handover.id}`}
                    onClick={() => void publish(handover.id)}
                  >
                    {busy === `publish:${handover.id}` ? "Publishing…" : "Publish version"}
                  </button>
                ) : null}
                {handover.status === "published" ? (
                  <button
                    className="btn"
                    type="button"
                    disabled={busy === `report:${handover.id}`}
                    onClick={() => void download(handover.id)}
                  >
                    {busy === `report:${handover.id}` ? "Generating…" : "Download report"}
                  </button>
                ) : null}
                {canAcknowledge && handover.status === "published" && !acknowledged ? (
                  <button
                    className="btn btn-primary"
                    type="button"
                    disabled={busy === `ack:${handover.id}`}
                    onClick={() => void acknowledge(handover.id)}
                  >
                    {busy === `ack:${handover.id}` ? "Recording…" : "Acknowledge receipt"}
                  </button>
                ) : null}
                {acknowledged ? <span className="pill">Receipt recorded</span> : null}
              </div>

              {canAcknowledge && handover.status === "published" && !acknowledged ? (
                <label className="field">
                  <span>Receipt note (optional)</span>
                  <textarea
                    rows={2}
                    value={note}
                    onChange={(event) => setNote(event.target.value)}
                    maxLength={1000}
                    placeholder="What you have received and understood"
                  />
                </label>
              ) : null}
            </article>
          );
        })
      ) : (
        <RealEmpty title="No handovers yet">
          {canLead
            ? "Assemble a draft for the incoming owner once the review queue has been worked through."
            : "No published handover is addressed to your role yet."}
        </RealEmpty>
      )}
    </div>
  );
}
