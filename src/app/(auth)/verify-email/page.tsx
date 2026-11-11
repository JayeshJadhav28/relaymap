"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import { ensureSupabaseRole, firebaseErrorMessage } from "@/lib/firebase/auth";
import { useFirebaseAuth } from "@/lib/firebase/auth-provider";

export default function VerifyEmailPage() {
  const router = useRouter();
  const { configured, loading, user, emailVerified, refreshUser, resendVerification, signOut } =
    useFirebaseAuth();
  const [busy, setBusy] = useState(false);
  const [sent, setSent] = useState(false);
  const [message, setMessage] = useState<{ ok: boolean; text: string } | null>(null);

  useEffect(() => {
    if (configured && user) void refreshUser();
  }, [configured, user, refreshUser]);

  async function check() {
    setBusy(true);
    setMessage(null);
    try {
      const next = await refreshUser();
      if (!next?.emailVerified) {
        setMessage({
          ok: false,
          text: "Firebase still reports this email as unverified. Open the link in the email, then try again.",
        });
        return;
      }
      await ensureSupabaseRole();
      router.push("/app");
      router.refresh();
    } catch (error) {
      setMessage({
        ok: false,
        text:
          error instanceof Error
            ? error.message
            : "Verification status could not be refreshed.",
      });
    } finally {
      setBusy(false);
    }
  }

  async function resend() {
    setBusy(true);
    setMessage(null);
    try {
      await resendVerification();
      setSent(true);
      setMessage({ ok: true, text: "A new verification email was sent." });
    } catch (error) {
      setMessage({ ok: false, text: firebaseErrorMessage(error) });
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="auth-page">
      <div className="auth-card">
        <Link href="/" className="brand">
          <span className="brandmark">RM</span>
          relaymap
        </Link>
        <p className="eyebrow">Email verification</p>
        <h1>{emailVerified ? "Email verified" : "Check your inbox"}</h1>

        {!configured ? (
          <p>
            Firebase is not configured in this build. The synthetic demo is the available path.
          </p>
        ) : loading ? (
          <p>Checking the current Firebase session…</p>
        ) : !user ? (
          <>
            <p>No Firebase session is active. Sign in to continue.</p>
            <Link className="btn btn-primary" href="/login">
              Sign in
            </Link>
          </>
        ) : (
          <>
            <p>
              Firebase sent a verification link to <strong>{user.email}</strong>. The real
              workspace stays locked until that address is verified. Verification is enforced by
              both the API and PostgreSQL.
            </p>
            {emailVerified ? (
              <p className="action-message ok">
                The address is verified. Continue to workspace setup.
              </p>
            ) : null}
            <div className="actions-row">
              <button className="btn btn-primary" onClick={check} disabled={busy} type="button">
                {busy ? "Checking…" : "I have verified my email"}
              </button>
              <button className="btn" onClick={resend} disabled={busy || sent} type="button">
                {sent ? "Email sent" : "Resend verification"}
              </button>
            </div>
            {message ? (
              <p
                className={message.ok ? "action-message ok" : "action-message error"}
                role="status"
              >
                {message.text}
              </p>
            ) : null}
            <p className="subtle">
              Wrong account?{" "}
              <button
                className="link-button"
                type="button"
                onClick={() => {
                  void signOut();
                  router.push("/login");
                }}
              >
                Sign out
              </button>
            </p>
          </>
        )}
      </div>
    </div>
  );
}
