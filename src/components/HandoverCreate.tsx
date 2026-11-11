"use client";

import { useRouter } from "next/navigation";
import { useState, type FormEvent } from "react";
import { postJson } from "@/lib/client/api";

export function HandoverCreate() {
  const router = useRouter();
  const [audienceRole, setAudienceRole] = useState("incoming");
  const [title, setTitle] = useState("CampusConnect handover");
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState<{ ok: boolean; text: string } | null>(null);

  async function onSubmit(event: FormEvent) {
    event.preventDefault();
    setBusy(true);
    const result = await postJson<{ handoverId?: string }>("/api/handovers", {
      audienceRole,
      title,
    });
    setBusy(false);
    setMessage({ ok: result.ok, text: result.message });
    if (result.ok) router.refresh();
  }

  return (
    <form className="panel" onSubmit={onSubmit}>
      <div className="panel-head">
        <div>
          <h2>Build a handover</h2>
          <p>
            Assembly uses the recipient role&apos;s permissions. Restricted sources and any claim
            citing them are excluded before the draft is created.
          </p>
        </div>
        <span className="panel-kicker">Lead only</span>
      </div>
      <div className="upload-grid">
        <label className="field">
          <span>Recipient role</span>
          <select value={audienceRole} onChange={(event) => setAudienceRole(event.target.value)}>
            <option value="incoming">Incoming owner</option>
            <option value="reviewer">Reviewer</option>
            <option value="treasurer">Treasurer</option>
          </select>
        </label>
        <label className="field">
          <span>Title</span>
          <input value={title} onChange={(event) => setTitle(event.target.value)} />
        </label>
      </div>
      <div className="actions-row">
        <button className="btn btn-primary" type="submit" disabled={busy}>
          {busy ? "Assembling…" : "Generate draft"}
        </button>
      </div>
      {message ? (
        <p className={message.ok ? "action-message ok" : "action-message error"} role="status">
          {message.text}
        </p>
      ) : null}
    </form>
  );
}
