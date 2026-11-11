"use client";

import { useState } from "react";

type BuddyResponse = {
  question: string;
  answer: string;
  claims: Array<{ id: string; title: string; type: string; status: string }>;
  citations: Array<{
    claimId: string;
    sourceId: string;
    chunkId: string;
    quote: string;
    location: string;
  }>;
  insufficientEvidence: boolean;
  needsReview: boolean;
  caveat: string;
};

export function AskBuddy({ projectId }: { projectId: string }) {
  const [question, setQuestion] = useState("");
  const [busy, setBusy] = useState(false);
  const [result, setResult] = useState<BuddyResponse | null>(null);
  const [error, setError] = useState<string | null>(null);

  async function ask() {
    setBusy(true);
    setError(null);
    setResult(null);
    try {
      const response = await fetch(`/api/projects/${projectId}/ask`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ question }),
        cache: "no-store",
      });
      const payload = (await response.json().catch(() => null)) as
        | BuddyResponse
        | { error?: { message?: string } }
        | null;
      if (!response.ok) {
        setError(
          (payload && "error" in payload && payload.error?.message) ||
            `Request failed with status ${response.status}.`,
        );
        return;
      }
      if (!payload || !("answer" in payload) || typeof payload.answer !== "string") {
        setError("The response did not contain a grounded answer.");
        return;
      }
      setResult(payload);
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "The request could not be completed.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <section className="panel" style={{ marginBottom: 14 }}>
      <div className="panel-head">
        <div>
          <h2>Ask the Buddy</h2>
          <p>
            Answers are limited to knowledge visible to your role. Every answer cites its exact
            source quotation, and unreviewed records are labelled.
          </p>
        </div>
        <span className="panel-kicker">Grounded Q&amp;A</span>
      </div>

      <label className="field">
        <span>Question about this project</span>
        <textarea
          rows={2}
          value={question}
          onChange={(event) => setQuestion(event.target.value)}
          placeholder="e.g. Which deployment target is current?"
        />
      </label>
      <button
        className="btn"
        disabled={busy || question.trim().length < 3}
        onClick={() => void ask()}
      >
        {busy ? "Searching recorded knowledge…" : "Ask"}
      </button>

      {error ? <p className="action-message error">{error}</p> : null}

      {result ? (
        <div style={{ marginTop: 12 }}>
          <p style={{ whiteSpace: "pre-wrap" }}>{result.answer}</p>
          {result.needsReview ? (
            <p className="action-message error">
              This answer includes records that are not approved. Treat them as open items.
            </p>
          ) : null}
          {result.citations.length ? (
            <div className="activity-list" style={{ marginTop: 8 }}>
              {result.citations.map((citation, index) => (
                <div className="activity-row" key={`${citation.chunkId}-${index}`}>
                  <span className="activity-icon">“</span>
                  <div>
                    <strong>{citation.quote}</strong>
                    <small>
                      {citation.location} · chunk {citation.chunkId}
                    </small>
                  </div>
                </div>
              ))}
            </div>
          ) : (
            <p className="subtle">No citation was available for this answer.</p>
          )}
          <p className="subtle" style={{ marginTop: 8 }}>
            {result.caveat}
          </p>
        </div>
      ) : null}
    </section>
  );
}
