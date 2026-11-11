import Link from "next/link";
import { ResetDemoButton } from "@/components/ResetDemoButton";
import { PageTitle } from "@/components/ui";
import { firebaseSetupStatus } from "@/lib/firebase/config";
import { supabaseConfigStatus } from "@/lib/supabase/config";

export const dynamic = "force-dynamic";

export default function SettingsPage() {
  const status = supabaseConfigStatus();
  const firebase = firebaseSetupStatus();
  const realReady =
    firebase.publicConfigured && firebase.adminConfigured && status.publicConfigured;

  return (
    <>
      <PageTitle
        title="Workspace settings"
        description="Configuration status, demo boundaries and the exact limits of this local build."
        actions={
          <Link className="btn" href="/api/health">
            Health endpoint
          </Link>
        }
      />

      <div className="detail-grid">
        <section className="panel">
          <div className="panel-head">
            <div>
              <h2>Cloud configuration</h2>
              <p>
                Firebase authenticates people. Supabase stores PostgreSQL rows and private files;
                every request carries the Firebase ID token and is subject to row-level security.
              </p>
            </div>
            <span className={realReady ? "status status-positive" : "status status-warn"}>
              {realReady ? "Real path configured" : "Real path incomplete"}
            </span>
          </div>
          <table className="table">
            <tbody>
              <tr>
                <td>Firebase browser configuration</td>
                <td>{firebase.publicConfigured ? "Configured" : "Missing"}</td>
              </tr>
              <tr>
                <td>Firebase Admin credentials</td>
                <td>{firebase.adminConfigured ? "Configured" : "Missing"}</td>
              </tr>
              <tr>
                <td>Supabase URL and publishable key</td>
                <td>{status.publicConfigured ? "Configured" : "Missing"}</td>
              </tr>
              <tr>
                <td>Supabase server key (operations only)</td>
                <td>{status.serverConfigured ? "Configured" : "Missing"}</td>
              </tr>
              <tr>
                <td>Workspace mode</td>
                <td>
                  {realReady
                    ? "Demo and real workspace available"
                    : "Labelled synthetic demo only"}
                </td>
              </tr>
            </tbody>
          </table>
          <p className="subtle" style={{ marginTop: 10 }}>
            Required names: NEXT_PUBLIC_FIREBASE_API_KEY, NEXT_PUBLIC_FIREBASE_AUTH_DOMAIN,
            NEXT_PUBLIC_FIREBASE_PROJECT_ID, NEXT_PUBLIC_FIREBASE_APP_ID,
            FIREBASE_ADMIN_PROJECT_ID, FIREBASE_ADMIN_CLIENT_EMAIL, FIREBASE_ADMIN_PRIVATE_KEY,
            NEXT_PUBLIC_SUPABASE_URL and NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY. Values are never
            displayed, logged or committed. The service key is server-only, is never sent to the
            browser, and is never used to bypass RLS for a user request.
          </p>
        </section>

        <section className="panel">
          <div className="panel-head">
            <div>
              <h2>Demo boundaries</h2>
              <p>What this build does not claim.</p>
            </div>
            <span className="panel-kicker">Important</span>
          </div>
          <ul className="trust-list">
            <li>All CampusConnect records, names, budgets and contact details are fictional.</li>
            <li>Role preview is not authentication and provides no organisation isolation.</li>
            <li>
              Demo mutations are held in server memory and reset when the server restarts. The real
              workspace never reads demo memory.
            </li>
            <li>
              Nine migrations were executed against a disposable local PostgreSQL 17 instance with
              auth stubs. No hosted Supabase project, GoTrue, PostgREST, storage policy or
              cross-organisation test has been run.
            </li>
            <li>
              TXT, Markdown, CSV and JSON uploads are parsed as text. PDF parsing uses unpdf and
              DOCX parsing uses mammoth, both with signature, size and offset checks. PDF page
              provenance is recorded per chunk.
            </li>
            <li>No AI provider is configured; extraction is deterministic.</li>
          </ul>
        </section>
      </div>

      <section className="panel" style={{ marginTop: 14 }}>
        <div className="panel-head">
          <div>
            <h2>Reset the synthetic workspace</h2>
            <p>Restores the original CampusConnect fixtures, reviews and audit events.</p>
          </div>
        </div>
        <ResetDemoButton enabled={status.demoMode} />
      </section>

      <section className="panel" style={{ marginTop: 14 }}>
        <div className="panel-head">
          <div>
            <h2>Provenance and attribution</h2>
            <p>Foundation, design direction and third-party notices.</p>
          </div>
        </div>
        <ul className="trust-list">
          <li>
            MIT foundation: relay-knowledge-continuity, Copyright (c) 2026 Relay contributors. The
            licence is preserved in the primary repository.
          </li>
          <li>
            Interface direction refined with Unslop by Damir Sokolovsky, licensed CC BY 4.0. The
            skill text is preserved verbatim under .opencode/skills/unslop.
          </li>
          <li>
            No source code was copied from the unlicensed reference repositories. Their concepts
            were independently reimplemented.
          </li>
          <li>
            Full register: documentation/ATTRIBUTION.md and the reports under
            documentation/production and documentation/design.
          </li>
        </ul>
      </section>
    </>
  );
}
