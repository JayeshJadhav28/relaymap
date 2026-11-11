"use client";

import { useRouter } from "next/navigation";
import { useRef, useState, type FormEvent } from "react";
import { postJson } from "@/lib/client/api";

function toBase64(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => {
      const result = typeof reader.result === "string" ? reader.result : "";
      resolve(result.slice(result.indexOf(",") + 1));
    };
    reader.onerror = () => reject(reader.error ?? new Error("The file could not be read."));
    reader.readAsDataURL(file);
  });
}

export function SourceUploader() {  const router = useRouter();
  const fileRef = useRef<HTMLInputElement>(null);
  const [access, setAccess] = useState("project");
  const [pastedName, setPastedName] = useState("pasted-note.md");
  const [pasted, setPasted] = useState("");
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState<{ ok: boolean; text: string } | null>(null);

  async function onSubmit(event: FormEvent) {
    event.preventDefault();
    setMessage(null);
    const file = fileRef.current?.files?.[0];
    let filename = pastedName.trim();
    let content = pasted;
    let contentBase64: string | undefined;

    if (file) {
      if (file.size > 2 * 1024 * 1024) {
        setMessage({ ok: false, text: "The demo accepts sources up to 2 MB." });
        return;
      }
      filename = file.name;
      const binary = /\.(pdf|docx)$/i.test(file.name);
      if (binary) {
        content = "";
        contentBase64 = await toBase64(file);
      } else {
        content = await file.text();
      }
    }

    if (!filename || (!content.trim() && !contentBase64)) {
      setMessage({ ok: false, text: "Choose a file or paste some content first." });
      return;
    }

    setBusy(true);
    const result = await postJson<{ message?: string }>("/api/sources", {
      filename,
      ...(contentBase64 ? { contentBase64 } : { content }),
      access,
    });
    setBusy(false);
    setMessage({ ok: result.ok, text: result.message });
    if (result.ok) {
      setPasted("");
      if (fileRef.current) fileRef.current.value = "";
      router.refresh();
    }
  }

  return (
    <form className="panel uploader" onSubmit={onSubmit}>
      <div className="panel-head">
        <div>
          <h2>Add a source</h2>
          <p>
            TXT, Markdown, CSV, JSON, PDF or DOCX up to 2 MB. Binary formats are checked against
            their file signature before parsing. Extraction runs immediately and every emitted
            claim stays unapproved until a human reviews it.
          </p>
        </div>
        <span className="panel-kicker">Synthetic only</span>
      </div>

      <div className="upload-grid">
        <label className="field">
          <span>Choose a file</span>
          <input
            ref={fileRef}
            type="file"
            accept=".txt,.md,.markdown,.csv,.json,.pdf,.docx,text/plain,text/markdown,text/csv,application/json,application/pdf,application/vnd.openxmlformats-officedocument.wordprocessingml.document"
          />
        </label>

        <label className="field">
          <span>Access scope</span>
          <select value={access} onChange={(event) => setAccess(event.target.value)}>
            <option value="project">Project</option>
            <option value="finance">Finance only (lead / treasurer)</option>
          </select>
        </label>
      </div>

      <details className="paste-box">
        <summary>Or paste text instead</summary>
        <label className="field">
          <span>Filename</span>
          <input value={pastedName} onChange={(event) => setPastedName(event.target.value)} />
        </label>
        <label className="field">
          <span>Content</span>
          <textarea
            value={pasted}
            onChange={(event) => setPasted(event.target.value)}
            rows={4}
            placeholder="Deployment target: Vercel.&#10;Owner: Unassigned."
          />
        </label>
      </details>

      <div className="actions-row">
        <button className="btn btn-primary" type="submit" disabled={busy}>
          {busy ? "Ingesting…" : "Ingest and extract"}
        </button>
        <span className="subtle">
          Do not upload real or confidential data. Files are held in server memory only.
        </span>
      </div>

      {message ? (
        <p className={message.ok ? "action-message ok" : "action-message error"} role="status">
          {message.text}
        </p>
      ) : null}
    </form>
  );
}
