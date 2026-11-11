import Link from "next/link";
import { AuthForm } from "@/components/AuthForm";
import { LogoMark } from "@/components/LogoMark";

export const dynamic = "force-dynamic";

export default function RegisterPage() {
  return (
    <div className="auth-page">
      <div className="auth-card">
        <Link href="/" className="brand">
          <span className="brandmark">
            <LogoMark size={20} />
          </span>
          relaymap
        </Link>
        <p className="eyebrow">Real workspace</p>
        <h1>Create an account</h1>
        <p>
          Registration creates a Firebase identity. After you verify your email, the first
          workspace setup creates your organisation and project with database-assigned roles.
        </p>
        <AuthForm mode="register" />
      </div>
      <aside className="auth-aside">
        <p className="eyebrow">What happens next</p>
        <ol className="auth-steps">
          <li>Verify your email address in Firebase.</li>
          <li>Name your organisation and first project.</li>
          <li>Upload a source and review the extracted claims.</li>
          <li>Invite the incoming owner and publish a handover.</li>
        </ol>
      </aside>
    </div>
  );
}
