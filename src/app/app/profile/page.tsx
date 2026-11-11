"use client";

import { useCallback, useEffect, useState, type FormEvent } from "react";
import { useRealApi } from "@/components/real/RealApiProvider";
import { RealError, RealLoading } from "@/components/real/states";

type ProfileResponse = {
  user: {
    id: string;
    email: string | null;
    displayName: string;
    emailVerified: boolean;
  };
  organizations: { id: string; name: string; role: string; clearance: string }[];
};

export default function RealProfilePage() {
  const { call } = useRealApi();
  const [data, setData] = useState<ProfileResponse | null>(null);
  const [displayName, setDisplayName] = useState("");
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [message, setMessage] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    const result = await call<ProfileResponse>("/api/app/profile");
    setLoading(false);
    if (!result.ok) {
      setError(result.message);
      return;
    }
    setData(result.data);
    setDisplayName(result.data.user.displayName);
  }, [call]);

  useEffect(() => {
    let cancelled = false;
    void call<ProfileResponse>("/api/app/profile").then((result) => {
      if (cancelled) return;
      setLoading(false);
      if (!result.ok) {
        setError(result.message);
        return;
      }
      setData(result.data);
      setDisplayName(result.data.user.displayName);
    });
    return () => {
      cancelled = true;
    };
  }, [call]);

  async function onSubmit(event: FormEvent) {
    event.preventDefault();
    setBusy(true);
    setError(null);
    setMessage(null);
    const result = await call<{ user: ProfileResponse["user"] }>("/api/app/profile", {
      method: "PATCH",
      body: JSON.stringify({ displayName }),
    });
    setBusy(false);
    if (!result.ok) {
      setError(result.message);
      return;
    }
    setMessage("Display name updated.");
    setData((current) => (current ? { ...current, user: result.data.user } : current));
  }

  if (loading && !data) return <RealLoading label="Loading your profile…" />;
  if (!data) {
    return (
      <div className="real-page real-page-narrow">
        <RealError title="Profile unavailable" message={error ?? "Unknown error."} onRetry={load} />
      </div>
    );
  }

  return (
    <div className="real-page real-page-narrow">
      <header className="real-page-head">
        <div>
          <p className="eyebrow">Account</p>
          <h1>{data.user.displayName}</h1>
          <p>{data.user.email}</p>
        </div>
      </header>

      <section className="panel">
        <div className="panel-head">
          <h2>Identity</h2>
          <p>Firebase is the only user authentication provider.</p>
        </div>
        <dl className="fact-list">
          <div>
            <dt>Email verified</dt>
            <dd>{data.user.emailVerified ? "Yes" : "No"}</dd>
          </div>
          <div>
            <dt>Internal app user</dt>
            <dd className="mono">{data.user.id}</dd>
          </div>
        </dl>
        <form className="form-grid" onSubmit={onSubmit}>
          <label className="field">
            <span>Display name</span>
            <input
              value={displayName}
              onChange={(event) => setDisplayName(event.target.value)}
              minLength={2}
              maxLength={100}
              required
            />
          </label>
          <button className="btn btn-primary" type="submit" disabled={busy}>
            {busy ? "Saving…" : "Save display name"}
          </button>
        </form>
        {message ? <p className="action-message ok">{message}</p> : null}
        {error ? <RealError title="Update failed" message={error} /> : null}
      </section>

      <section className="panel">
        <div className="panel-head">
          <h2>Memberships</h2>
          <p>Organisation roles are not app-wide; they apply per organisation.</p>
        </div>
        {data.organizations.length ? (
          <ul className="plain-list">
            {data.organizations.map((organization) => (
              <li key={organization.id}>
                <strong>{organization.name}</strong>
                <span>
                  {organization.role} · {organization.clearance} clearance
                </span>
              </li>
            ))}
          </ul>
        ) : (
          <p>No memberships.</p>
        )}
      </section>
    </div>
  );
}
