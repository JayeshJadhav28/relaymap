"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import { postJson } from "@/lib/client/api";

export function ExtractionButton({ sourceId }: { sourceId: string }) {
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState("");

  async function run() {
    setBusy(true);
    const result = await postJson("/api/extract", { sourceId });
    setBusy(false);
    setMessage(result.message);
    if (result.ok) router.refresh();
  }

  return (
    <div className="inline-action">
      <button className="btn" disabled={busy} onClick={() => void run()}>
        {busy ? "Extracting…" : "Run extraction"}
      </button>
      {message ? <span className="subtle">{message}</span> : null}
    </div>
  );
}
