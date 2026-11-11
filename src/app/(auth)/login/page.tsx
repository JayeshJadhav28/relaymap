import Link from "next/link";
import { AuthForm } from "@/components/AuthForm";

export const dynamic = "force-dynamic";

export default function LoginPage() {
  return (
    <div className="auth-page">
      <div className="auth-card">
        <Link href="/" className="brand">
          <span className="brandmark">RM</span>
          relaymap
        </Link>
        <p className="eyebrow">Real workspace</p>
        <h1>Sign in with Firebase</h1>
        <p>
          Firebase verifies the identity. Supabase then applies your organisation and project
          permissions through row-level security.
        </p>
        <AuthForm mode="login" />
      </div>
      <aside className="auth-aside">
        <p className="eyebrow">Synthetic demo</p>
        <h2>Just want to see the product?</h2>
        <p>
          The CampusConnect demo is fully labelled, works without cloud credentials, and never
          writes to the real database.
        </p>
        <Link className="btn" href="/dashboard">
          Open the synthetic demo
        </Link>
      </aside>
    </div>
  );
}
