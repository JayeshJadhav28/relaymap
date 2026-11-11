import { ExtractionButton } from "@/components/ExtractionButton";
import { SourceUploader } from "@/components/SourceUploader";
import { EmptyState, PageTitle } from "@/components/ui";
import { getWorkspaceData } from "@/lib/demo/view";
import { formatDate, shortHash } from "@/lib/presentation";

export const dynamic = "force-dynamic";

export default async function SourcesPage() {
  const data = await getWorkspaceData();
  const canUpload = data.capabilities.canUpload;

  return (
    <>
      <PageTitle
        title="Sources"
        description="Every claim must be traceable to one of these records. The server returns only sources permitted for the current role."
      />

      {canUpload ? (
        <SourceUploader />
      ) : (
        <div className="demo-banner">
          <span className="demo-dot" />
          <span>
            This role can read permitted sources but cannot add new material. Switch to the project
            lead or reviewer to run ingestion.
          </span>
        </div>
      )}

      {data.sources.length ? (
        <div className="source-grid">
          {data.sources.map((source) => {
            const preview = source.chunks[0]?.content ?? "";
            return (
              <article className="source-card" key={source.id}>
                <div className="source-top">
                  <span className="pill">{source.kind}</span>
                  <span className="panel-kicker">
                    {source.access === "finance" ? (
                      <span className="restricted">Restricted · finance</span>
                    ) : (
                      "Project access"
                    )}
                  </span>
                </div>
                <h3>{source.title}</h3>
                <div className="source-meta">
                  <span>{formatDate(source.createdAt)}</span>
                  <span>Added by {source.createdBy}</span>
                  <span>{source.chunks.length} chunks</span>
                  <span className="mono">hash {shortHash(source.hash)}</span>
                </div>
                <div className="source-preview">{preview.slice(0, 420)}</div>
                <div className="source-meta">
                  <span>{source.synthetic ? "Synthetic fixture" : "Imported"}</span>
                  <span>{source.extracted ? "Extraction complete" : "Extraction not run"}</span>
                  <span className="mono">{source.id}</span>
                </div>
                {!source.extracted ? <ExtractionButton sourceId={source.id} /> : null}
              </article>
            );
          })}
        </div>
      ) : (
        <EmptyState>No source is accessible to this role.</EmptyState>
      )}

      <section className="panel" style={{ marginTop: 14 }}>
        <div className="panel-head">
          <div>
            <h2>Ingestion boundaries</h2>
            <p>What this build accepts and what it deliberately refuses.</p>
          </div>
        </div>
        <ul className="trust-list">
          <li>
            TXT, Markdown, CSV and JSON are parsed with exact character offsets, content hashes and
            chunk-level section labels.
          </li>
          <li>
            PDF is parsed page by page with <code>unpdf</code>; DOCX is parsed as paragraphs
            with <code>mammoth</code>. Both require a matching file signature before parsing,
            and DOCX page numbers are never invented.
          </li>
          <li>
            Empty, binary, oversized, signature-mismatched, malformed JSON and duplicate sources are
            rejected. Scanned PDFs without a text layer are rejected rather than OCR-guessed.
          </li>
          <li>Uploaded files are synthetic demo data held in server memory only.</li>
        </ul>
      </section>
    </>
  );
}
