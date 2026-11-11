"use client";

import { useRef, useState, type FormEvent } from "react";
import { useRealApi } from "@/components/real/RealApiProvider";
import { RealError } from "@/components/real/states";

const BINARY = [".pdf", ".docx"];

function isBinary(filename: string): boolean {
  return BINARY.some((extension) => filename.toLowerCase().endsWith(extension));
}

function readAsText(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result ?? ""));
    reader.onerror = () => reject(reader.error ?? new Error("File could not be read."));
    reader.readAsText(file);
  });
}

function readAsBase64(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => {
      const value = String(reader.result ?? "");
      resolve(value.slice(value.indexOf(",") + 1));
    };
    reader.onerror = () => reject(reader.error ?? new Error("File could not be read."));
    reader.readAsDataURL(file);
  });
}

export function SourceIntakeForm({
  projectId,
  canUseFinance,
  onDone,
}: {
  projectId: string;
  canUseFinance: boolean;
  onDone: () => void;
}) {
  const { call } = useRealApi();
  const inputRef = useRef<HTMLInputElement>(null);
  const [file, setFile] = useState<File | null>(null);
  const [access, setAccess] = useState<"project" | "finance">("project");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [message, setMessage] = useState<string | null>(null);

  async function onSubmit(event: FormEvent) {
    event.preventDefault();
    if (!file) return;
    setBusy(true);
    setError(null);
    setMessage(null);
    try {
      if (file.size > 2 * 1024 * 1024) {
        throw new Error("The source exceeds the 2 MB limit.");
      }
      const payload = isBinary(file.name)
        ? { filename: file.name, contentBase64: await readAsBase64(file), access }
        : { filename: file.name, content: await readAsText(file), access };

      const result = await call<{
        filename: string;
        chunks: number;
        claimIds: string[];
        conflicts: number;
        hash: string;
      }>(`/api/app/projects/${projectId}/sources`, {
        method: "POST",
        body: JSON.stringify(payload),
      });
      if (!result.ok) {
        setError(result.message);
        return;
      }
      setMessage(
        `${result.data.filename}: ${result.data.chunks} immutable chunk(s), ${result.data.claimIds.length} claim(s) extracted, ${result.data.conflicts} conflict group(s). Nothing was auto-approved.`,
      );
      setFile(null);
      if (inputRef.current) inputRef.current.value = "";
      onDone();
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "The file could not be read.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <form className="panel form-panel" onSubmit={onSubmit}>
      <div className="panel-head">
        <h2>Add a source</h2>
        <p>
          Files go to the private <code>relaymap-sources</code> bucket. The exact text is chunked
          and hashed; every citation must resolve to one chunk.
        </p>
      </div>
      <div className="form-grid">
        <label className="field">
          <span>File</span>
          <input
            ref={inputRef}
            type="file"
            accept=".txt,.text,.md,.markdown,.csv,.json,.pdf,.docx"
            onChange={(event) => setFile(event.target.files?.[0] ?? null)}
            required
          />
          <small>.txt, .md, .csv, .json, .pdf, .docx · 2 MB limit</small>
        </label>
        <label className="field">
          <span>Access level</span>
          <select
            value={access}
            onChange={(event) => setAccess(event.target.value as typeof access)}
            disabled={!canUseFinance}
          >
            <option value="project">Project members</option>
            <option value="finance">Finance only</option>
          </select>
          <small>
            {canUseFinance
              ? "Finance sources are visible to the lead and finance-cleared members."
              : "Finance sources require the project lead or finance clearance."}
          </small>
        </label>
      </div>
      {error ? <RealError title="Source not ingested" message={error} /> : null}
      {message ? <p className="action-message ok">{message}</p> : null}
      <button className="btn btn-primary" type="submit" disabled={busy || !file}>
        {busy ? "Parsing and extracting…" : "Ingest and extract"}
      </button>
    </form>
  );
}
