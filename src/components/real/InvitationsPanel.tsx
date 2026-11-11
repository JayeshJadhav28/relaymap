"use client";

import { useCallback, useEffect, useState, type FormEvent } from "react";
import { useRealApi } from "@/components/real/RealApiProvider";
import { RealEmpty, RealError } from "@/components/real/states";

type ProjectOption = {
  id: string;
  organizationId: string;
  name: string;
};

type ProjectRole =
  | "reviewer"
  | "contributor"
  | "departed"
  | "incoming"
  | "viewer";

type Invitation = {
  id: string;
  email: string;
  role: string;
  clearance: string;
  projectId: string | null;
  projectRole: string | null;
  expiresAt: string;
  acceptedAt: string | null;
};

export function InvitationsPanel({
  organizations,
  projects,
}: {
  organizations: { id: string; name: string; role: string }[];
  projects: ProjectOption[];
}) {
  const { call } = useRealApi();
  const manageable = organizations.filter(
    (organization) => organization.role === "admin" || organization.role === "manager",
  );
  const [organizationId, setOrganizationId] = useState(manageable[0]?.id ?? "");
  const [email, setEmail] = useState("");
  const [role, setRole] = useState<"admin" | "manager" | "member" | "viewer">("member");
  const [clearance, setClearance] = useState<"standard" | "finance">("standard");
  const [projectId, setProjectId] = useState("");
  const [projectRole, setProjectRole] = useState<ProjectRole>("incoming");
  const [items, setItems] = useState<Invitation[]>([]);
  const [issued, setIssued] = useState<{ email: string; path: string; token: string } | null>(
    null,
  );
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);

  const organizationProjects = projects.filter(
    (project) => project.organizationId === organizationId,
  );

  const load = useCallback(async () => {
    if (!organizationId) return;
    const result = await call<{ invitations: Invitation[] }>(
      `/api/app/organizations/${organizationId}/invitations`,
    );
    if (result.ok) setItems(result.data.invitations);
  }, [call, organizationId]);

  useEffect(() => {
    if (!organizationId) return;
    let cancelled = false;
    void call<{ invitations: Invitation[] }>(
      `/api/app/organizations/${organizationId}/invitations`,
    ).then((result) => {
      if (!cancelled && result.ok) setItems(result.data.invitations);
    });
    return () => {
      cancelled = true;
    };
  }, [call, organizationId]);

  async function onCreate(event: FormEvent) {
    event.preventDefault();
    setBusy(true);
    setError(null);
    setIssued(null);
    setCopied(false);
    const result = await call<{
      token: string;
      invitePath: string;
      invitation: Invitation;
    }>(`/api/app/organizations/${organizationId}/invitations`, {
      method: "POST",
      body: JSON.stringify({
        email,
        role,
        clearance,
        ...(projectId ? { projectId, projectRole } : {}),
      }),
    });
    setBusy(false);
    if (!result.ok) {
      setError(result.message);
      return;
    }
    setIssued({
      email: result.data.invitation.email,
      path: result.data.invitePath,
      token: result.data.token,
    });
    setEmail("");
    void load();
  }

  if (!manageable.length) {
    return (
      <section className="panel">
        <div className="panel-head">
          <h2>Invitations</h2>
          <p>Only an organisation admin or manager can invite people.</p>
        </div>
      </section>
    );
  }

  return (
    <section className="panel">
      <div className="panel-head">
        <h2>Invitations</h2>
        <p>
          Tokens are stored only as SHA-256 hashes, are single-use, and expire. The intended
          recipient must accept while signed in with the same verified email address. A project
          assignment is granted together with the organisation membership, in the same
          transaction.
        </p>
      </div>
      <form className="form-grid" onSubmit={onCreate}>
        <label className="field">
          <span>Organisation</span>
          <select
            value={organizationId}
            onChange={(event) => {
              setOrganizationId(event.target.value);
              setProjectId("");
            }}
          >
            {manageable.map((organization) => (
              <option key={organization.id} value={organization.id}>
                {organization.name}
              </option>
            ))}
          </select>
        </label>
        <label className="field">
          <span>Email</span>
          <input
            type="email"
            value={email}
            onChange={(event) => setEmail(event.target.value)}
            required
            placeholder="incoming.owner@example.com"
          />
        </label>
        <label className="field">
          <span>Organisation role</span>
          <select value={role} onChange={(event) => setRole(event.target.value as typeof role)}>
            <option value="member">Member</option>
            <option value="manager">Manager</option>
            <option value="viewer">Viewer</option>
            <option value="admin">Admin</option>
          </select>
        </label>
        <label className="field">
          <span>Finance clearance</span>
          <select
            value={clearance}
            onChange={(event) => setClearance(event.target.value as typeof clearance)}
          >
            <option value="standard">Standard</option>
            <option value="finance">Finance</option>
          </select>
        </label>
        <label className="field">
          <span>Project (optional)</span>
          <select
            value={projectId}
            onChange={(event) => setProjectId(event.target.value)}
          >
            <option value="">Organisation only</option>
            {organizationProjects.map((project) => (
              <option key={project.id} value={project.id}>
                {project.name}
              </option>
            ))}
          </select>
          <small>Assign a project role only when the recipient needs one.</small>
        </label>
        <label className="field">
          <span>Project role</span>
          <select
            value={projectRole}
            onChange={(event) => setProjectRole(event.target.value as ProjectRole)}
            disabled={!projectId}
          >
            <option value="incoming">Incoming owner</option>
            <option value="reviewer">Reviewer</option>
            <option value="contributor">Contributor</option>
            <option value="viewer">Viewer</option>
            <option value="departed">Departed member</option>
          </select>
        </label>
        <button className="btn btn-primary" type="submit" disabled={busy || !organizationId}>
          {busy ? "Issuing…" : "Issue invitation"}
        </button>
      </form>

      {error ? <RealError title="Invitation failed" message={error} /> : null}

      {issued ? (
        <div className="token-card">
          <strong>One-time invitation for {issued.email}</strong>
          <p>Copy this link now. The token cannot be shown again.</p>
          <code>{`${typeof window !== "undefined" ? window.location.origin : ""}${issued.path}`}</code>
          <div className="actions-row">
            <button
              className="btn"
              type="button"
              onClick={async () => {
                const link = `${window.location.origin}${issued.path}`;
                try {
                  await navigator.clipboard.writeText(link);
                  setCopied(true);
                } catch {
                  setCopied(false);
                }
              }}
            >
              {copied ? "Copied" : "Copy link"}
            </button>
          </div>
        </div>
      ) : null}

      <div className="table-wrap">
        {items.length ? (
          <table>
            <thead>
              <tr>
                <th>Email</th>
                <th>Role</th>
                <th>Clearance</th>
                <th>Project role</th>
                <th>Expires</th>
                <th>State</th>
              </tr>
            </thead>
            <tbody>
              {items.map((item) => {
                const project = projects.find((option) => option.id === item.projectId);
                return (
                  <tr key={item.id}>
                    <td>{item.email}</td>
                    <td>{item.role}</td>
                    <td>{item.clearance}</td>
                    <td>
                      {item.projectRole
                        ? `${project?.name ?? "project"} · ${item.projectRole}`
                        : "—"}
                    </td>
                    <td>{new Date(item.expiresAt).toLocaleDateString()}</td>
                    <td>{item.acceptedAt ? "Accepted" : "Pending"}</td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        ) : (
          <RealEmpty title="No invitations yet">
            Issue one invitation when the incoming owner is ready to verify their email.
          </RealEmpty>
        )}
      </div>
    </section>
  );
}
