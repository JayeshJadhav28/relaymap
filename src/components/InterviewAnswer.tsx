"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import { postJson } from "@/lib/client/api";

export function InterviewAnswer({
  questionId,
  answered,
}: {
  questionId: string;
  answered: boolean;
}) {
  const router = useRouter();
  const [answer, setAnswer] = useState("");
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState<{ ok: boolean; text: string } | null>(null);

  if (answered) {
    return <p className="subtle">Answer recorded as an attributable source.</p>;
  }

  async function submit() {
    setBusy(true);
    const result = await postJson(`/api/interview/${questionId}/answer`, { answer });
    setBusy(false);
    setMessage({ ok: result.ok, text: result.message });
    if (result.ok) {
      setAnswer("");
      router.refresh();
    }
  }

  return (
    <div className="interview-answer">
      <label className="field">
        <span>Recorded answer</span>
        <textarea
          value={answer}
          onChange={(event) => setAnswer(event.target.value)}
          rows={2}
          placeholder="Write only what the departing member actually confirms."
        />
      </label>
      <button className="btn" disabled={busy || !answer.trim()} onClick={() => void submit()}>
        {busy ? "Saving…" : "Save as source"}
      </button>
      {message ? (
        <p className={message.ok ? "action-message ok" : "action-message error"}>{message.text}</p>
      ) : null}
    </div>
  );
}
