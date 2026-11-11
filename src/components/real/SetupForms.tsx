"use client";

import { useState, type FormEvent } from "react";
import { useRouter } from "next/navigation";
import { useRealApi } from "@/components/real/RealApiProvider";
import { RealError } from "@/components/real/states";
import type { ApiFailure } from "@/lib/real/client";

function failureMessage(result: ApiFailure): string {
  const fields = result.fields
    ? Object.entries(result.fields)
        .map(([key, value]) => `${key}: ${value}`)
        .join("; ")
    : "";
  return fields ? `${result.message} ${fields}` : result.message;
}

export function BootstrapForm({ onDone }: { onDone: () => void }) {
  const { call } = useRealApi();
  const router = useRouter();
  const [organizationName, setOrganizationName] = useState("");
  const [projectName, setProjectName] = useState("");
  const [projectDescription, setProjectDescription] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function onSubmit(event: FormEvent) {
    event.preventDefault();
    setBusy(true);
    setError(null);
    const result = await call<{ organizationId: string; projectId: string }>(
      "/api/app/bootstrap",
      {
        method: "POST",
        body: JSON.stringify({
          organizationName,
          projectName,
          projectDescription: projectDescription || undefined,
        }),
      },
    );
    setBusy(false);
    if (!result.ok) {
      setError(failureMessage(result));
      return;
    }
    onDone();
    router.push(`/app/projects/${result.data.projectId}`);
  }

  return (
    <form className="panel form-panel" onSubmit={onSubmit}>
      <div className="panel-head">
        <h2>Set up your first workspace</h2>
        <p>
          The database assigns you the organisation admin and project lead roles in the same
          transaction. The client cannot choose them.
        </p>
      </div>
      <div className="form-grid">
        <label className="field">
          <span>Organisation name</span>
          <input
            value={organizationName}
            onChange={(event) => setOrganizationName(event.target.value)}
            minLength={2}
            maxLength={100}
            required
            placeholder="Northwind Operations"
          />
        </label>
        <label className="field">
          <span>First project name</span>
          <input
            value={projectName}
            onChange={(event) => setProjectName(event.target.value)}
            minLength={2}
            maxLength={120}
            required
            placeholder="Pilot handover"
          />
        </label>
      </div>
      <label className="field">
        <span>Project description (optional)</span>
        <textarea
          value={projectDescription}
          onChange={(event) => setProjectDescription(event.target.value)}
          maxLength={4000}
          rows={3}
        />
      </label>
      {error ? <RealError title="Setup failed" message={error} /> : null}
      <button className="btn btn-primary" type="submit" disabled={busy}>
        {busy ? "Creating…" : "Create organisation and project"}
      </button>
    </form>
  );
}

export function CreateProjectForm({
  organizations,
  onDone,
}: {
  organizations: { id: string; name: string; role: string }[];
  onDone: () => void;
}) {
  const { call } = useRealApi();
  const router = useRouter();
  const [organizationId, setOrganizationId] = useState(organizations[0]?.id ?? "");
  const [name, setName] = useState("");
  const [description, setDescription] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function onSubmit(event: FormEvent) {
    event.preventDefault();
    setBusy(true);
    setError(null);
    const result = await call<{ projectId: string }>("/api/app/projects", {
      method: "POST",
      body: JSON.stringify({
        organizationId,
        name,
        description: description || undefined,
      }),
    });
    setBusy(false);
    if (!result.ok) {
      setError(failureMessage(result));
      return;
    }
    onDone();
    router.push(`/app/projects/${result.data.projectId}`);
  }

  return (
    <form className="panel form-panel" onSubmit={onSubmit}>
      <div className="panel-head">
        <h2>New project</h2>
        <p>You become the project lead. Organisation roles still apply on top.</p>
      </div>
      <div className="form-grid">
        <label className="field">
          <span>Organisation</span>
          <select
            value={organizationId}
            onChange={(event) => setOrganizationId(event.target.value)}
            required
          >
            {organizations.map((organization) => (
              <option key={organization.id} value={organization.id}>
                {organization.name} · {organization.role}
              </option>
            ))}
          </select>
        </label>
        <label className="field">
          <span>Project name</span>
          <input
            value={name}
            onChange={(event) => setName(event.target.value)}
            minLength={2}
            maxLength={120}
            required
          />
        </label>
      </div>
      <label className="field">
        <span>Description (optional)</span>
        <textarea
          value={description}
          onChange={(event) => setDescription(event.target.value)}
          maxLength={4000}
          rows={2}
        />
      </label>
      {error ? <RealError title="Project creation failed" message={error} /> : null}
      <button className="btn btn-primary" type="submit" disabled={busy || !organizationId}>
        {busy ? "Creating…" : "Create project"}
      </button>
    </form>
  );
}

export function CreateOrganizationForm({ onDone }: { onDone: () => void }) {
  const { call } = useRealApi();
  const [name, setName] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function onSubmit(event: FormEvent) {
    event.preventDefault();
    setBusy(true);
    setError(null);
    const result = await call<{ organizationId: string }>("/api/app/organizations", {
      method: "POST",
      body: JSON.stringify({ name }),
    });
    setBusy(false);
    if (!result.ok) {
      setError(failureMessage(result));
      return;
    }
    setName("");
    onDone();
  }

  return (
    <form className="panel form-panel" onSubmit={onSubmit}>
      <div className="panel-head">
        <h2>New organisation</h2>
        <p>The database assigns you the organisation admin role.</p>
      </div>
      <label className="field">
        <span>Organisation name</span>
        <input
          value={name}
          onChange={(event) => setName(event.target.value)}
          minLength={2}
          maxLength={100}
          required
        />
      </label>
      {error ? <RealError title="Organisation creation failed" message={error} /> : null}
      <button className="btn btn-primary" type="submit" disabled={busy}>
        {busy ? "Creating…" : "Create organisation"}
      </button>
    </form>
  );
}
