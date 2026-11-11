"use client";

import Link from "next/link";
import { useCallback, useEffect, useState } from "react";
import { useRealApi } from "@/components/real/RealApiProvider";
import { RealEmpty, RealError, RealLoading } from "@/components/real/states";
import {
  BootstrapForm,
  CreateOrganizationForm,
  CreateProjectForm,
} from "@/components/real/SetupForms";
import { InvitationsPanel } from "@/components/real/InvitationsPanel";
import type { RealContextResponse } from "@/lib/real/client";

export default function RealHomePage() {
  const { call } = useRealApi();
  const [data, setData] = useState<RealContextResponse | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [showProjectForm, setShowProjectForm] = useState(false);
  const [showOrgForm, setShowOrgForm] = useState(false);

  const load = useCallback(async () => {
    const result = await call<RealContextResponse>("/api/app/context");
    if (!result.ok) {
      setLoading(false);
      setError(result.message);
      return;
    }
    setData(result.data);
    setLoading(false);
  }, [call]);

  useEffect(() => {
    let cancelled = false;
    void call<RealContextResponse>("/api/app/context").then((result) => {
      if (cancelled) return;
      if (!result.ok) {
        setLoading(false);
        setError(result.message);
        return;
      }
      setData(result.data);
      setLoading(false);
    });
    return () => {
      cancelled = true;
    };
  }, [call]);

  const retry = useCallback(() => {
    setLoading(true);
    setError(null);
    void load();
  }, [load]);

  if (loading && !data) return <RealLoading label="Loading your workspace context…" />;
  if (error) {
    return (
      <div className="real-page">
        <RealError title="Workspace context unavailable" message={error} onRetry={retry} />
      </div>
    );
  }
  if (!data) return null;

  const canCreateProject = data.organizations.some((organization) =>
    ["admin", "manager", "member"].includes(organization.role),
  );

  return (
    <div className="real-page">
      <header className="real-page-head">
        <div>
          <p className="eyebrow">Real workspace</p>
          <h1>{data.user.displayName}</h1>
          <p>
            {data.organizations.length
              ? `${data.organizations.length} organisation membership(s), ${data.projects.length} visible project(s).`
              : "No organisation membership exists yet."}
          </p>
        </div>
        <div className="head-actions">
          {data.organizations.length ? (
            <button
              className="btn btn-primary"
              type="button"
              onClick={() => setShowProjectForm((value) => !value)}
            >
              {showProjectForm ? "Close project form" : "New project"}
            </button>
          ) : null}
          <button
            className="btn"
            type="button"
            onClick={() => setShowOrgForm((value) => !value)}
          >
            {showOrgForm ? "Close organisation form" : "New organisation"}
          </button>
        </div>
      </header>

      {data.needsSetup ? (
        <BootstrapForm onDone={load} />
      ) : null}

      {showOrgForm ? <CreateOrganizationForm onDone={load} /> : null}
      {showProjectForm && canCreateProject ? (
        <CreateProjectForm organizations={data.organizations} onDone={load} />
      ) : null}

      <section>
        <div className="section-head">
          <h2>Projects</h2>
          <span className="muted">Only projects your membership can read are listed.</span>
        </div>
        {data.projects.length ? (
          <div className="project-grid">
            {data.projects.map((project) => (
              <Link
                key={project.id}
                href={`/app/projects/${project.id}`}
                className="panel project-card"
              >
                <div className="project-card-top">
                  <span className="context-chip">{project.organizationName}</span>
                  <span className="badge">{project.role}</span>
                </div>
                <h3>{project.name}</h3>
                <p>{project.description || "No description yet."}</p>
                <span className="text-link">Open workspace →</span>
              </Link>
            ))}
          </div>
        ) : (
          <RealEmpty title="No projects yet">
            Create the first project inside an organisation you belong to.
          </RealEmpty>
        )}
      </section>

      <section>
        <div className="section-head">
          <h2>Organisations</h2>
          <span className="muted">Roles are assigned by the database.</span>
        </div>
        {data.organizations.length ? (
          <div className="org-grid">
            {data.organizations.map((organization) => (
              <div className="panel org-card" key={organization.id}>
                <strong>{organization.name}</strong>
                <p>
                  Organisation role: <b>{organization.role}</b> · Finance clearance:{" "}
                  <b>{organization.clearance}</b>
                </p>
              </div>
            ))}
          </div>
        ) : null}
      </section>

      <InvitationsPanel organizations={data.organizations} projects={data.projects} />

      <p className="subtle">
        Accepting an invitation? <Link className="text-link" href="/app/invitations/accept">Open the acceptance page</Link>.
      </p>
    </div>
  );
}
