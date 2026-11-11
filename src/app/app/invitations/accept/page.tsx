"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState, useSyncExternalStore, type FormEvent } from "react";
import { useRealApi } from "@/components/real/RealApiProvider";
import { RealError } from "@/components/real/states";

function subscribeHash(onChange: () => void) {
  window.addEventListener("hashchange", onChange);
  return () => window.removeEventListener("hashchange", onChange);
}

function readHashToken(): string {
  const hash = window.location.hash.replace(/^#/, "");
  return new URLSearchParams(hash).get("token") ?? "";
}

function readServerToken(): string {
  return "";
}

export default function AcceptInvitationPage() {
  const router = useRouter();
  const { call } = useRealApi();
  const hashToken = useSyncExternalStore(subscribeHash, readHashToken, readServerToken);
  const [draft, setDraft] = useState<string | null>(null);
  const token = draft ?? hashToken;
  const setToken = setDraft;
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [accepted, setAccepted] = useState(false);

  async function onSubmit(event: FormEvent) {
    event.preventDefault();
    setBusy(true);
    setError(null);
    const result = await call<{ organizationId: string }>("/api/app/invitations/accept", {
      method: "POST",
      body: JSON.stringify({ token }),
    });
    setBusy(false);
    if (!result.ok) {
      setError(result.message);
      return;
    }
    setAccepted(true);
    router.push("/app");
    router.refresh();
  }

  return (
    <div className="real-page real-page-narrow">
      <header className="real-page-head">
        <div>
          <p className="eyebrow">Invitation</p>
          <h1>Join an organisation</h1>
          <p>
            The invitation must match your verified Firebase email. Acceptance is single-use and
            recorded in the append-only audit trail.
          </p>
        </div>
      </header>

      {accepted ? (
        <div className="state-panel">
          <div>
            <strong>Invitation accepted.</strong>
            <p>Your organisation membership is now active.</p>
            <Link className="btn btn-primary" href="/app">
              Open workspace
            </Link>
          </div>
        </div>
      ) : (
        <form className="panel form-panel" onSubmit={onSubmit}>
          <label className="field">
            <span>Invitation token</span>
            <textarea
              value={token}
              onChange={(event) => setToken(event.target.value)}
              required
              minLength={16}
              rows={3}
              placeholder="Paste the token from the invitation link"
            />
          </label>
          {error ? <RealError title="Invitation not accepted" message={error} /> : null}
          <button className="btn btn-primary" type="submit" disabled={busy}>
            {busy ? "Accepting…" : "Accept invitation"}
          </button>
          <p className="subtle">
            The token is read from the link fragment, so it is not sent to the server as part of
            the page request.
          </p>
        </form>
      )}
    </div>
  );
}
