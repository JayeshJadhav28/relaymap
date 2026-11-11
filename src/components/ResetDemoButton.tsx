"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import { postJson } from "@/lib/client/api";

export function ResetDemoButton({ enabled = true }: { enabled?: boolean }) {
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState("");

  async function reset() {
    setBusy(true);
    const result = await postJson("/api/reset", {});
    setBusy(false);
    setMessage(result.message);
    if (result.ok) router.refresh();
  }

  if (!enabled) {
    return (
      <p className="subtle">
        The synthetic reset endpoint is disabled because a Supabase project is configured. Demo
        reset must not be reachable outside demo mode.
      </p>
    );
  }

  return (
    <div className="inline-action">
      <button className="btn btn-danger" disabled={busy} onClick={() => void reset()}>
        {busy ? "Resetting…" : "Reset synthetic demo"}
      </button>
      {message ? <span className="subtle">{message}</span> : null}
    </div>
  );
}
