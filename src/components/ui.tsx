import Link from "next/link";
import type { Project, Role } from "@/lib/demo/types";
import { ROLE_CAPTION, ROLE_LABEL } from "@/lib/presentation";

export function DemoBanner({ role, demoMode = true }: { role: Role; demoMode?: boolean }) {
  return (
    <div className="demo-banner">
      <span className="demo-dot" />
      <span>
        {demoMode ? (
          <>
            <strong>Synthetic demo environment.</strong> All CampusConnect records and contacts are
            fictional. Role preview demonstrates filtering; it is not account authentication.
          </>
        ) : (
          <>
            <strong>This is still the synthetic CampusConnect workspace.</strong> Cloud credentials
            are present, but these screens read the in-memory demo store and never touch real
            rows. Signed-in data lives in the{" "}
            <Link className="text-link" href="/app">
              real workspace
            </Link>
            .
          </>
        )}
      </span>
      <span className="pill">Role: {ROLE_LABEL[role]}</span>
    </div>
  );
}

export function PageTitle({
  title,
  description,
  actions,
}: {
  title: string;
  description: string;
  actions?: React.ReactNode;
}) {
  return (
    <div className="page-title">
      <div>
        <h1>{title}</h1>
        <p>{description}</p>
      </div>
      {actions ? <div className="page-title-actions">{actions}</div> : null}
    </div>
  );
}

export function Metric({
  label,
  value,
  note,
}: {
  label: string;
  value: number | string;
  note: string;
}) {
  return (
    <div className="panel metric">
      <div className="metric-head">
        <span>{label}</span>
      </div>
      <strong>{value}</strong>
      <small>{note}</small>
    </div>
  );
}

export function ProjectFacts({ project }: { project: Project }) {
  return (
    <dl className="project-facts">
      <div>
        <dt>Organisation</dt>
        <dd>{project.organisation}</dd>
      </div>
      <div>
        <dt>Status</dt>
        <dd>{project.status}</dd>
      </div>
      <div>
        <dt>Departing</dt>
        <dd>{project.departingMember}</dd>
      </div>
      <div>
        <dt>Incoming</dt>
        <dd>{project.incomingMember}</dd>
      </div>
    </dl>
  );
}

export function RoleGuide({ current }: { current: Role }) {
  const roles: Role[] = ["lead", "reviewer", "treasurer", "incoming"];
  return (
    <div className="role-guide">
      {roles.map((role) => (
        <div className={`role-row ${role === current ? "role-current" : ""}`} key={role}>
          <strong>{ROLE_LABEL[role]}</strong>
          <p>{ROLE_CAPTION[role]}</p>
          {role === current ? <span className="pill">Current preview</span> : null}
        </div>
      ))}
    </div>
  );
}

export function EmptyState({ children }: { children: React.ReactNode }) {
  return <div className="panel empty-state">{children}</div>;
}

export function InlineLink({ href, children }: { href: string; children: React.ReactNode }) {
  return (
    <Link className="text-link" href={href}>
      {children}
    </Link>
  );
}
