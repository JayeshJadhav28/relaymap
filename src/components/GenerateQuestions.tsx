"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import { postJson } from "@/lib/client/api";

export function GenerateQuestions({ canGenerate }: { canGenerate: boolean }) {
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState<{ ok: boolean; text: string } | null>(null);

  if (!canGenerate) return null;

  async function generate() {
    setBusy(true);
    const result = await postJson("/api/interview/generate", {});
    setBusy(false);
    setMessage({ ok: result.ok, text: result.message });
    if (result.ok) router.refresh();
  }

  return (
    <div style={{ marginTop: 8 }}>
      <button className="btn" disabled={busy} onClick={() => void generate()}>
        {busy ? "Finding gaps…" : "Generate gap questions"}
      </button>
      {message ? (
        <p className={message.ok ? "action-message ok" : "action-message error"}>
          {message.text}
        </p>
      ) : null}
    </div>
  );
}
