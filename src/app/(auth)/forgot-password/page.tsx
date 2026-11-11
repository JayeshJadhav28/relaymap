"use client";

import Link from "next/link";
import { useState, type FormEvent } from "react";
import { firebaseErrorMessage } from "@/lib/firebase/auth";
import { sendPasswordReset } from "@/lib/firebase/auth";
import { useFirebaseAuth } from "@/lib/firebase/auth-provider";

export default function ForgotPasswordPage() {
  const { configured } = useFirebaseAuth();
  const [email, setEmail] = useState("");
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState<{ ok: boolean; text: string } | null>(null);

  async function onSubmit(event: FormEvent) {
    event.preventDefault();
    setBusy(true);
    setMessage(null);
    try {
      await sendPasswordReset(email);
      setMessage({
        ok: true,
        text: "If an account exists for that address, Firebase sent a password-reset email.",
      });
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
        <p className="eyebrow">Account recovery</p>
        <h1>Reset your password</h1>
        {!configured ? (
          <p>Firebase is not configured in this build.</p>
        ) : (
          <form className="auth-form" onSubmit={onSubmit}>
            <label className="field">
              <span>Email</span>
              <input
                type="email"
                value={email}
                onChange={(event) => setEmail(event.target.value)}
                required
                autoComplete="email"
              />
            </label>
            <button className="btn btn-primary" disabled={busy} type="submit">
              {busy ? "Sending…" : "Send reset email"}
            </button>
            {message ? (
              <p
                className={message.ok ? "action-message ok" : "action-message error"}
                role="status"
              >
                {message.text}
              </p>
            ) : null}
          </form>
        )}
        <p className="subtle">
          <Link className="text-link" href="/login">
            Back to sign in
          </Link>
        </p>
      </div>
    </div>
  );
}
