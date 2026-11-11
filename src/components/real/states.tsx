"use client";

import type { ReactNode } from "react";

export function RealLoading({ label = "Loading workspace…" }: { label?: string }) {
  return (
    <div className="state-panel" role="status" aria-live="polite">
      <span className="state-line" aria-hidden="true" />
      <div>
        <strong>{label}</strong>
        <p>The real workspace is being read under your Firebase identity.</p>
      </div>
    </div>
  );
}

export function RealError({
  title = "That request did not complete.",
  message,
  onRetry,
}: {
  title?: string;
  message: string;
  onRetry?: () => void;
}) {
  return (
    <div className="state-panel state-error" role="alert">
      <div>
        <strong>{title}</strong>
        <p>{message}</p>
        {onRetry ? (
          <button className="btn" type="button" onClick={onRetry}>
            Try again
          </button>
        ) : null}
      </div>
    </div>
  );
}

export function RealEmpty({
  title,
  children,
  action,
}: {
  title: string;
  children?: ReactNode;
  action?: ReactNode;
}) {
  return (
    <div className="state-panel state-empty">
      <div>
        <strong>{title}</strong>
        {children ? <p>{children}</p> : null}
        {action}
      </div>
    </div>
  );
}

export function RealConfigNotice() {
  return (
    <div className="state-panel state-error">
      <div>
        <strong>Real workspace configuration is incomplete.</strong>
        <p>
          Firebase web configuration, Firebase Admin credentials, and Supabase public
          configuration are all required. The synthetic demo still works and is clearly
          labelled.
        </p>
        <p className="subtle">
          Add the values from <code>.env.example</code>, then restart the server. No credential
          is ever read from a request body.
        </p>
        <a className="btn btn-primary" href="/dashboard">
          Open the synthetic demo
        </a>
      </div>
    </div>
  );
}
