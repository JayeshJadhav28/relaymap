"use client";

import { useRouter } from "next/navigation";
import { useState, type FormEvent } from "react";
import { postJson } from "@/lib/client/api";

export function ReviewActions({
  claimId,
  status,
}: {
  claimId: string;
  status: string;
}) {
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  const [comment, setComment] = useState("");
  const [message, setMessage] = useState<{ ok: boolean; text: string } | null>(null);
  const [editing, setEditing] = useState(false);
  const [title, setTitle] = useState("");
  const [description, setDescription] = useState("");
  const [rationale, setRationale] = useState("");

  async function submit(action: string, extra: Record<string, unknown> = {}) {
    setBusy(true);
    setMessage(null);
    const result = await postJson(`/api/knowledge/${claimId}/review`, {
      action,
      comment: comment.trim() || undefined,
      ...extra,
    });
    setBusy(false);
    setMessage({ ok: result.ok, text: result.message });
    if (result.ok) {
      setComment("");
      setEditing(false);
      setTitle("");
      setDescription("");
      setRationale("");
      router.refresh();
    }
  }

  function submitEdit(event: FormEvent) {
    event.preventDefault();
    // The API requires a reviewer justification for edits. Surface the same
    // rule in the UI instead of sending an edit the server will reject.
    if (!comment.trim()) {
      setMessage({ ok: false, text: "A reviewer comment is required for this action." });
      return;
    }
    void submit("edit", {
      title: title.trim() || undefined,
      description: description.trim() || undefined,
      rationale: rationale.trim() || undefined,
    });
  }

  return (
    <div className="review-actions">
      <div className="actions-row">
        <button
          className="btn btn-primary"
          disabled={busy || status === "APPROVED"}
          onClick={() => void submit("approve", { comment: comment.trim() || "Approved after checking the exact citation." })}
        >
          Approve
        </button>
        <button
          className="btn"
          disabled={busy}
          onClick={() => void submit("reject", { comment: comment.trim() || "Rejected in the synthetic review." })}
        >
          Reject
        </button>
        <button className="btn" disabled={busy} onClick={() => setEditing((value) => !value)}>
          {editing ? "Cancel edit" : "Edit"}
        </button>
        {status === "CONFLICTING" ? (
          <button
            className="btn"
            disabled={busy}
            onClick={() =>
              void submit("resolve_conflict", {
                rationale: rationale.trim() || comment.trim() || "Conflict resolved by the reviewer.",
                comment: comment.trim() || "Conflict resolved after human review.",
              })
            }
          >
            Resolve conflict
          </button>
        ) : null}
        <button
          className="btn"
          disabled={busy}
          onClick={() => void submit("request_clarification", { comment: comment.trim() || "More evidence is required." })}
        >
          Request clarification
        </button>
      </div>

      <label className="field">
        <span>Reviewer comment</span>
        <textarea
          value={comment}
          onChange={(event) => setComment(event.target.value)}
          rows={2}
          placeholder="Required for rejection, editing, clarification and conflict resolution."
        />
      </label>

      {editing ? (
        <form className="edit-form" onSubmit={submitEdit}>
          <label className="field">
            <span>Corrected title</span>
            <input value={title} onChange={(event) => setTitle(event.target.value)} placeholder="Optional" />
          </label>
          <label className="field">
            <span>Corrected description</span>
            <textarea
              value={description}
              onChange={(event) => setDescription(event.target.value)}
              rows={3}
              placeholder="Describe what the evidence actually supports."
            />
          </label>
          <label className="field">
            <span>Recorded rationale</span>
            <textarea
              value={rationale}
              onChange={(event) => setRationale(event.target.value)}
              rows={2}
              placeholder="Only write what a human has confirmed; never invent a reason."
            />
          </label>
          <button className="btn btn-primary" disabled={busy} type="submit">
            Save correction
          </button>
        </form>
      ) : null}

      {message ? (
        <p className={message.ok ? "action-message ok" : "action-message error"} role="status">
          {message.text}
        </p>
      ) : null}
    </div>
  );
}
