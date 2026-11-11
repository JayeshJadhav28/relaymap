"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState, type FormEvent } from "react";
import {
  ensureSupabaseRole,
  firebaseErrorMessage,
  registerWithEmail,
  signInWithEmail,
} from "@/lib/firebase/auth";
import { useFirebaseAuth } from "@/lib/firebase/auth-provider";

export function AuthForm({ mode }: { mode: "login" | "register" }) {
  const router = useRouter();
  const { configured } = useFirebaseAuth();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [fullName, setFullName] = useState("");
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState<{ ok: boolean; text: string } | null>(null);

  async function onSubmit(event: FormEvent) {
    event.preventDefault();
    setMessage(null);
    setBusy(true);
    try {
      if (mode === "login") {
        await signInWithEmail(email, password);
        try {
          await ensureSupabaseRole();
        } catch (error) {
          setMessage({
            ok: false,
            text: `Signed in, but the real workspace API is not ready: ${
              error instanceof Error ? error.message : "claim provisioning failed"
            }`,
          });
          return;
        }
        router.push("/app");
        router.refresh();
        return;
      }

      await registerWithEmail({ fullName, email, password });
      try {
        await ensureSupabaseRole();
      } catch (error) {
        setMessage({
          ok: false,
          text: `Account created, but the real workspace API is not ready: ${
            error instanceof Error ? error.message : "claim provisioning failed"
          }`,
        });
        return;
      }
      router.push("/app");
      router.refresh();
    } catch (error) {
      setMessage({ ok: false, text: firebaseErrorMessage(error) });
    } finally {
      setBusy(false);
    }
  }

  if (!configured) {
    return (
      <div className="auth-note">
        <strong>Real authentication is not configured in this build.</strong>
        <p>
          Add the Firebase web-app variables to <code>.env.local</code>. The labelled synthetic
          demo remains fully available and never pretends to be a signed-in workspace.
        </p>
        <div className="actions-row">
          <Link className="btn btn-primary" href="/dashboard">
            Open synthetic demo
          </Link>
          <Link className="btn" href="/">
            Back to landing
          </Link>
        </div>
      </div>
    );
  }

  return (
    <form className="auth-form" onSubmit={onSubmit}>
      {mode === "register" ? (
        <label className="field">
          <span>Full name</span>
          <input
            value={fullName}
            onChange={(event) => setFullName(event.target.value)}
            required
            minLength={2}
            maxLength={100}
            autoComplete="name"
          />
        </label>
      ) : null}

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
      <label className="field">
        <span>Password</span>
        <input
          type="password"
          value={password}
          onChange={(event) => setPassword(event.target.value)}
          required
          minLength={8}
          autoComplete={mode === "login" ? "current-password" : "new-password"}
        />
        <small>At least 8 characters. Firebase enforces its own policy.</small>
      </label>

      <button className="btn btn-primary" disabled={busy} type="submit">
        {busy ? "Working…" : mode === "login" ? "Sign in" : "Create account"}
      </button>

      {message ? (
        <p className={message.ok ? "action-message ok" : "action-message error"} role="status">
          {message.text}
        </p>
      ) : null}

      <p className="subtle">
        {mode === "login" ? (
          <>
            No account? <Link className="text-link" href="/register">Create one</Link>
            {" · "}
            <Link className="text-link" href="/forgot-password">Forgot password</Link>
          </>
        ) : (
          <>
            Already registered? <Link className="text-link" href="/login">Sign in</Link>
          </>
        )}
      </p>
    </form>
  );
}
