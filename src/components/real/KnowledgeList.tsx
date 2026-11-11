"use client";

import { useMemo, useState } from "react";
import type { Claim, Source } from "@/lib/demo/types";
import { CLAIM_TYPE_LABEL, formatDay, shortHash, STATUS_LABEL } from "@/lib/presentation";
import { RealEmpty } from "@/components/real/states";

/**
 * Read-only knowledge register for the real workspace. Every row exposes the
 * exact citation that supports it; a claim without a resolvable chunk is shown
 * as an explicit gap rather than being silently hidden.
 */
export function KnowledgeList({
  claims,
  sources,
  excludedCount,
}: {
  claims: Claim[];
  sources: Source[];
  excludedCount: number;
}) {
  const [query, setQuery] = useState("");
  const [typeFilter, setTypeFilter] = useState<"all" | Claim["type"]>("all");

  const sourceById = useMemo(
    () => new Map(sources.map((source) => [source.id, source])),
    [sources],
  );

  const filtered = useMemo(() => {
    const needle = query.trim().toLowerCase();
    return claims.filter((claim) => {
      if (typeFilter !== "all" && claim.type !== typeFilter) return false;
      if (!needle) return true;
      return (
        claim.title.toLowerCase().includes(needle) ||
        claim.description.toLowerCase().includes(needle) ||
        (claim.owner ?? "").toLowerCase().includes(needle)
      );
    });
  }, [claims, query, typeFilter]);

  const types = useMemo(
    () => Array.from(new Set(claims.map((claim) => claim.type))).sort(),
    [claims],
  );

  if (!claims.length) {
    return (
      <RealEmpty title="No accessible knowledge yet">
        Add a source to extract claims. Every extracted claim starts unapproved and waits for a
        human decision.
      </RealEmpty>
    );
  }

  return (
    <div className="stack">
      <div className="filter-bar">
        <label className="field">
          <span>Search knowledge</span>
          <input
            className="search-input"
            value={query}
            onChange={(event) => setQuery(event.target.value)}
            placeholder="Title, description or owner"
          />
        </label>
        <label className="field">
          <span>Claim type</span>
          <select
            value={typeFilter}
            onChange={(event) => setTypeFilter(event.target.value as typeof typeFilter)}
          >
            <option value="all">All types</option>
            {types.map((type) => (
              <option key={type} value={type}>
                {CLAIM_TYPE_LABEL[type]}
              </option>
            ))}
          </select>
        </label>
        <p className="subtle filter-note">
          {filtered.length} of {claims.length} accessible claims shown
          {excludedCount ? ` · ${excludedCount} excluded by access level` : ""}
        </p>
      </div>

      {filtered.length ? (
        filtered.map((claim) => (
          <article className="panel evidence-row" id={`claim-${claim.id}`} key={claim.id}>
            <div className="evidence-main">
              <div className="row-meta">
                <span className={`badge badge-${claim.status.toLowerCase()}`}>
                  {STATUS_LABEL[claim.status]}
                </span>
                <span className="badge badge-quiet">{CLAIM_TYPE_LABEL[claim.type]}</span>
                <span className="mono subtle">
                  {Math.round(claim.confidence * 100)}% confidence
                </span>
                {claim.subjectKey ? (
                  <span className="mono subtle">subject {claim.subjectKey}</span>
                ) : null}
              </div>
              <h3>{claim.title}</h3>
              <p>{claim.description}</p>

              {claim.rationale ? (
                <div className="rationale">
                  <strong>Recorded rationale</strong>
                  <p>{claim.rationale}</p>
                </div>
              ) : null}

              <div className="claim-meta">
                <span>Owner: {claim.owner ?? "unresolved"}</span>
                <span>Due: {claim.dueDate ? formatDay(claim.dueDate) : "not set"}</span>
                <span>Updated: {formatDay(claim.updatedAt)}</span>
              </div>

              {claim.citations.length ? (
                <div className="evidence-list">
                  {claim.citations.map((citation) => {
                    const source = sourceById.get(citation.sourceId);
                    return (
                      <figure className="evidence-card" key={citation.id}>
                        <blockquote>{citation.quote}</blockquote>
                        <figcaption>
                          <span>{source?.title ?? "Source not accessible to this role"}</span>
                          <span>{citation.location}</span>
                          <span className="mono">chunk {citation.chunkId.slice(0, 8)}</span>
                          <span
                            className={`mini-state mini-${citation.verification.toLowerCase()}`}
                          >
                            {citation.verification === "VERIFIED"
                              ? "Exact match verified"
                              : citation.verification === "FAILED"
                                ? "Verification failed"
                                : "Pending verification"}
                          </span>
                          <span className="mono subtle">{shortHash(citation.quoteHash)}</span>
                        </figcaption>
                      </figure>
                    );
                  })}
                </div>
              ) : (
                <div className="evidence-empty">
                  No citation is attached. This claim cannot be approved until evidence is
                  recorded.
                </div>
              )}
            </div>
          </article>
        ))
      ) : (
        <RealEmpty title="No claims match this filter">
          Clear the search or choose a different claim type.
        </RealEmpty>
      )}
    </div>
  );
}
