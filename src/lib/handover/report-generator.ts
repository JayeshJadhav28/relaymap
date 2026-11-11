import type { Handover, HandoverVersion, Project } from "@/lib/demo/types";

function escapeHtml(value: string): string {
  return value
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#039;");
}

/**
 * Print-friendly HTML handover. Sections follow the KnowBridge logical report
 * structure, independently implemented for RelayMap (no Flask/Jinja reuse).
 */
export function generateHandoverHtml(input: {
  project: Project;
  handover: Handover;
  version: HandoverVersion;
  generatedAt: string;
  /** Real exports must not claim to be synthetic, and vice versa. */
  synthetic?: boolean;
}): string {
  const { project, handover, version } = input;
  const synthetic = input.synthetic !== false;
  const banner = synthetic
    ? "Synthetic demo handover. All names, records and contacts are fictional. This document is not a production security artefact."
    : "Real workspace handover. Every included fact is traceable to the cited record. Unresolved items are listed separately and are not approved facts.";

  const sections = version.sections
    .map(
      (section) => `
      <section>
        <h2>${escapeHtml(section.title)}</h2>
        <p class="muted">${escapeHtml(section.description)}</p>
        ${
          section.claims.length
            ? section.claims
                .map(
                  (claim) => `
          <article class="claim">
            <h3>${escapeHtml(claim.title)}</h3>
            <p>${escapeHtml(claim.description)}</p>
            <p class="meta">Owner: ${escapeHtml(claim.owner ?? "unresolved")} · Due: ${escapeHtml(
              claim.dueDate ?? "—",
            )}</p>
            ${claim.citations
              .map(
                (citation) => `
              <blockquote>“${escapeHtml(citation.quote)}”<br/><small>${escapeHtml(
                citation.location,
              )} · ${escapeHtml(citation.chunkId)}</small></blockquote>`,
              )
              .join("")}
          </article>`,
                )
                .join("")
            : '<p class="muted">No approved claim is currently in this section.</p>'
        }
      </section>`,
    )
    .join("");

  const openQuestions = version.openQuestions.length
    ? `<section class="open">
        <h2>Unresolved items — not approved facts</h2>
        <ul>${version.openQuestions
          .map(
            (claim) =>
              `<li><strong>${escapeHtml(claim.title)}</strong> — ${escapeHtml(
                claim.status,
              )}. ${escapeHtml(claim.description)}</li>`,
          )
          .join("")}</ul>
      </section>`
    : "";

  const readiness = version.readiness.components
    .map(
      (component) =>
        `<tr><td>${escapeHtml(component.label)}</td><td>${component.earned}/${component.max}</td><td>${escapeHtml(
          component.reason,
        )}</td></tr>`,
    )
    .join("");

  return `<!doctype html>
<html lang="en">
<head>
  <meta charset="utf-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1" />
  <title>${escapeHtml(handover.title)} — version ${version.version}</title>
  <style>
    body { font-family: Georgia, "Times New Roman", serif; margin: 36px auto; max-width: 820px; color: #211f1a; line-height: 1.55; }
    h1, h2, h3 { font-family: ui-sans-serif, system-ui, sans-serif; line-height: 1.2; }
    h1 { font-size: 2rem; margin-bottom: 4px; }
    h2 { margin-top: 30px; border-bottom: 1px solid #ddd8cb; padding-bottom: 4px; }
    .muted, .meta { color: #6b665c; font-size: .88rem; }
    .banner { border: 1px solid #d8cfb4; background: #faf6ea; padding: 10px 14px; border-radius: 6px; font-family: ui-sans-serif, system-ui, sans-serif; font-size: .85rem; }
    .claim { margin: 14px 0 18px; }
    blockquote { border-left: 3px solid #b57a12; margin: 8px 0; padding: 4px 12px; color: #4a463d; }
    .open { border: 1px dashed #b45309; background: #fffbeb; padding: 10px 16px; border-radius: 6px; }
    table { width: 100%; border-collapse: collapse; font-size: .85rem; }
    td, th { border-bottom: 1px solid #e8e3d7; padding: 6px 8px; text-align: left; vertical-align: top; }
    footer { margin-top: 36px; border-top: 1px solid #ddd8cb; padding-top: 10px; color: #6b665c; font-size: .8rem; }
  </style>
</head>
<body>
  <p class="banner">${escapeHtml(banner)}</p>
  <h1>${escapeHtml(handover.title)}</h1>
  <p class="muted">${escapeHtml(project.name)} · Audience: ${escapeHtml(
    handover.audienceRole,
  )} · Version ${version.version} · Generated ${escapeHtml(input.generatedAt)}</p>

  <section>
    <h2>Readiness snapshot</h2>
    <p><strong>${version.readiness.score}/100</strong> — ${escapeHtml(
      version.readiness.caveat ??
        "A readiness score is a signal, not a guarantee of successful knowledge transfer.",
    )}</p>
    <table><thead><tr><th>Component</th><th>Points</th><th>Reason</th></tr></thead><tbody>${readiness}</tbody></table>
  </section>

  ${sections}
  ${openQuestions}

  <footer>
    Content hash: ${escapeHtml(version.contentHash)} · ${version.claimIds.length} included claim(s) · ${version.excludedCount} excluded by recipient permissions.
    RelayMap is built on the MIT-licensed relay-knowledge-continuity foundation.
  </footer>
</body>
</html>`;
}
