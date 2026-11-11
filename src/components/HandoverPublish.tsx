"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import { postJson } from "@/lib/client/api";

export function HandoverPublish({ handoverId }: { handoverId: string }) {
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState<{ ok: boolean; text: string } | null>(null);

  async function publish() {
    setBusy(true);
    const result = await postJson(`/api/handovers/${handoverId}/publish`, {});
    setBusy(false);
    setMessage({ ok: result.ok, text: result.message });
    if (result.ok) router.refresh();
  }

  return (
    <div className="inline-action">
      <button className="btn btn-primary" disabled={busy} onClick={() => void publish()}>
        {busy ? "Publishing…" : "Publish this version"}
      </button>
      {message ? (
        <span className={message.ok ? "action-message ok" : "action-message error"}>
          {message.text}
        </span>
      ) : null}
    </div>
  );
}
