"use client";

import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { FolderOpen, LayoutGrid, LogOut, UserRound } from "lucide-react";
import { useFirebaseAuth } from "@/lib/firebase/auth-provider";
import { LogoMark } from "@/components/LogoMark";

const LINKS = [
  { href: "/app", label: "Projects", icon: FolderOpen },
  { href: "/app/profile", label: "Profile", icon: UserRound },
];

export function RealFrame({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();
  const router = useRouter();
  const { user, signOut } = useFirebaseAuth();

  return (
    <div className="real-shell">
      <header className="real-topbar">
        <Link href="/app" className="brand">
          <span className="brandmark">
            <LogoMark size={20} />
          </span>
          relaymap
        </Link>
        <span className="context-chip">Real workspace</span>
        <nav className="real-links" aria-label="Real workspace">
          {LINKS.map((link) => {
            const Icon = link.icon;
            return (
              <Link
                key={link.href}
                href={link.href}
                className={pathname === link.href ? "active" : ""}
                aria-current={pathname === link.href ? "page" : undefined}
              >
                <Icon size={15} strokeWidth={1.5} aria-hidden="true" />
                {link.label}
              </Link>
            );
          })}
          <Link href="/dashboard">
            <LayoutGrid size={15} strokeWidth={1.5} aria-hidden="true" />
            Synthetic demo
          </Link>
        </nav>
        <div className="real-account">
          <span className="account-email" title={user?.email ?? ""}>
            {user?.email ?? "Not signed in"}
          </span>
          {user ? (
            <button
              className="btn btn-quiet"
              type="button"
              onClick={async () => {
                await signOut();
                router.replace("/login");
              }}
            >
              <LogOut size={15} strokeWidth={1.5} aria-hidden="true" />
              Sign out
            </button>
          ) : (
            <Link className="btn btn-quiet" href="/login">
              Sign in
            </Link>
          )}
        </div>
      </header>
      <main className="real-main">{children}</main>
      <footer className="real-footer">
        <span>Firebase identity · Supabase row-level security · private storage</span>
        <span>No demo data is used on this path.</span>
      </footer>
    </div>
  );
}
