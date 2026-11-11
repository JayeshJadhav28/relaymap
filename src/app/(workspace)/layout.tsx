import Link from "next/link";
import { Nav } from "@/components/Nav";
import { RoleSwitcher } from "@/components/RoleSwitcher";
import { DemoBanner } from "@/components/ui";
import { getCurrentRole } from "@/lib/demo/roles";
import { ROLE_LABEL } from "@/lib/presentation";

export const dynamic = "force-dynamic";

export default async function WorkspaceLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const role = await getCurrentRole();

  return (
    <div className="app-shell">
      <Nav roleLabel={ROLE_LABEL[role]} />
      <main className="app-main">
        <header className="app-topbar">
          <div className="breadcrumb">
            Workspace / <b>CampusConnect rider experience</b>
          </div>
          <div className="topbar-actions">
            <span className="pill">{ROLE_LABEL[role]}</span>
            <RoleSwitcher role={role} />
            <Link className="btn" href="/app">
              Real workspace
            </Link>
            <Link className="btn" href="/">
              Home
            </Link>
          </div>
        </header>
        <div className="app-content">
          <DemoBanner role={role} />
          {children}
          <div className="footer-note">
            <span>RelayMap · CampusConnect synthetic project</span>
            <span>Demo actions reset when the server restarts</span>
          </div>
        </div>
      </main>
    </div>
  );
}
