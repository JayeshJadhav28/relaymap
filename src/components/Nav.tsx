"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useState } from "react";
import {
  FileText,
  FolderOpen,
  History,
  Layers,
  LayoutGrid,
  Menu,
  Send,
  Settings,
  ShieldCheck,
  X,
  type LucideIcon,
} from "lucide-react";
import { LogoMark } from "@/components/LogoMark";

const GROUPS: {
  label: string;
  items: { href: string; label: string; hint: string; icon: LucideIcon }[];
}[] = [
  {
    label: "Workspace",
    items: [
      {
        href: "/dashboard",
        label: "Dashboard",
        hint: "Knowledge command centre",
        icon: LayoutGrid,
      },
      { href: "/projects", label: "Projects", hint: "Project continuity", icon: FolderOpen },
      { href: "/sources", label: "Sources", hint: "Ingestion and evidence roots", icon: FileText },
      { href: "/knowledge", label: "Knowledge", hint: "Claims and citations", icon: Layers },
    ],
  },
  {
    label: "Continuity",
    items: [
      { href: "/review", label: "Review", hint: "Human approval queue", icon: ShieldCheck },
      { href: "/timeline", label: "Timeline", hint: "Audit and impact", icon: History },
      { href: "/handovers", label: "Handovers", hint: "Role-aware transition", icon: Send },
    ],
  },
  {
    label: "System",
    items: [
      { href: "/settings", label: "Settings", hint: "Configuration status", icon: Settings },
    ],
  },
];

export function Nav({ roleLabel }: { roleLabel: string }) {
  const pathname = usePathname();
  const [open, setOpen] = useState(false);

  return (
    <>
      <button
        className="nav-toggle"
        onClick={() => setOpen((value) => !value)}
        aria-expanded={open}
      >
        {open ? <X size={16} aria-hidden="true" /> : <Menu size={16} aria-hidden="true" />}
        {open ? "Close" : "Navigate"}
      </button>
      <aside className={`sidebar ${open ? "sidebar-open" : ""}`}>
        <div className="sidebar-brand">
          <Link href="/" className="brand" onClick={() => setOpen(false)}>
            <span className="brandmark">
              <LogoMark size={20} />
            </span>
            relaymap
          </Link>
          <span className="demo-chip">Synthetic demo</span>
        </div>

        <div className="workspace-switch">
          <span className="workspace-dot" />
          <div>
            <small>Demo workspace</small>
            <strong>CampusConnect</strong>
          </div>
        </div>

        {GROUPS.map((group) => (
          <div className="nav-group" key={group.label}>
            <div className="side-section">{group.label}</div>
            <nav className="side-nav">
              {group.items.map((item) => {
                const active =
                  pathname === item.href || pathname.startsWith(`${item.href}/`);
                const Icon = item.icon;
                return (
                  <Link
                    key={item.href}
                    href={item.href}
                    className={active ? "active" : ""}
                    aria-current={active ? "page" : undefined}
                    onClick={() => setOpen(false)}
                  >
                    <span className="nav-icon">
                      <Icon size={16} strokeWidth={1.5} aria-hidden="true" />
                    </span>
                    <div>
                      <span>{item.label}</span>
                      <small>{item.hint}</small>
                    </div>
                  </Link>
                );
              })}
            </nav>
          </div>
        ))}

        <div className="sidebar-bottom">
          <div className="profile-chip">
            <span className="avatar">HR</span>
            <div>
              <strong>Hemant Rai</strong>
              <small>{roleLabel} preview</small>
            </div>
          </div>
          <p className="sidebar-note">
            CampusConnect is fictional and resets when the server restarts. The role selector
            previews filtering; it is not sign-in. Real accounts live in the{" "}
            <Link className="text-link" href="/app">
              real workspace
            </Link>
            .
          </p>
        </div>
      </aside>
    </>
  );
}
