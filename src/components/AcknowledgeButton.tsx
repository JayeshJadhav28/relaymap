"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import { postJson } from "@/lib/client/api";

export function AcknowledgeButton({
  handoverId,
  acknowledged,
}: {
  handoverId: string;
  acknowledged: boolean;
}) {
  const router = useRouter();
  const [note, setNote] = useState("I have received and understood this handover.");
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState<{ ok: boolean; text: string } | null>(null);

  async function acknowledge() {
    setBusy(true);
    const result = await postJson(`/api/handovers/${handoverId}/acknowledge`, { note });
    setBusy(false);
    setMessage({ ok: result.ok, text: result.message });
    if (result.ok) router.refresh();
  }

  if (acknowledged) {
    return <p className="acknowledged">Receipt acknowledged. The action is recorded in the audit trail.</p>;
  }

  return (
    <div className="acknowledge-box">
      <label className="field">
        <span>Receipt note</span>
        <textarea value={note} onChange={(event) => setNote(event.target.value)} rows={2} />
      </label>
      <div className="actions-row">
        <button className="btn btn-primary" disabled={busy} onClick={() => void acknowledge()}>
          {busy ? "Recording…" : "Acknowledge receipt"}
        </button>
      </div>
      {message ? (
        <p className={message.ok ? "action-message ok" : "action-message error"}>{message.text}</p>
      ) : null}
    </div>
  );
}
