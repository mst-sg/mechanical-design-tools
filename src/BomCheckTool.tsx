import { useMemo, useState } from "react";
import { auditBom, combinePart, sourceRows, type SourceRow } from "./bom-check";
import {
  downloadCsv,
  guessColumns,
  parseCsv,
  toCsv,
  type ColumnMap,
} from "./csv";
import { fields, labels } from "./types";
import { readUtf8 } from "./text-file";
const sample =
  "Item,Part number,Description,Quantity,Material,Unit,Revision\n1,000417,Spacer,0.1,Steel,ea,B\n2,000417,Spacer,0.2,Steel,ea,B\n3,BRK-22,Bracket,2,Steel,ea,A\n4,BRK-22,Bracket,2,Aluminium,ea,A\n5,,Seal,3,Rubber,ea,A\n6,PIN-8,Pin,,Steel,ea,A\n7, CAP-6 ,Cap,1,,ea,A";
const PAGE_SIZE = 25;
export function BomCheckTool() {
  const [input, setInput] = useState(""),
    [name, setName] = useState("");
  const [header, setHeader] = useState<string[]>([]),
    [rows, setRows] = useState<SourceRow[]>([]),
    [map, setMap] = useState<ColumnMap>(() => guessColumns([]));
  const [history, setHistory] = useState<SourceRow[][]>([]),
    [reviewed, setReviewed] = useState(false),
    [page, setPage] = useState(0);
  const [error, setError] = useState(""),
    [loading, setLoading] = useState(false),
    [merge, setMerge] = useState<string | null>(null),
    [notice, setNotice] = useState("");
  const analysis = useMemo(() => {
    try {
      return { ...auditBom(header, rows, map), error: "" };
    } catch (e) {
      return {
        issues: [],
        groups: [],
        error: e instanceof Error ? e.message : "Check the column mapping.",
      };
    }
  }, [header, rows, map]);
  function changeInput(text: string, filename = "") {
    setInput(text);
    setName(filename);
    setHeader([]);
    setRows([]);
    setHistory([]);
    setReviewed(false);
    setError("");
    setNotice("");
    setMerge(null);
    setPage(0);
  }
  function check() {
    setError("");
    setNotice("");
    try {
      const data = parseCsv(input);
      if (data.length < 2)
        throw new Error("Include a header and at least one data row.");
      setHeader(data[0]);
      setRows(sourceRows(data));
      setMap(guessColumns(data[0]));
      setHistory([]);
      setReviewed(false);
      setMerge(null);
      setPage(0);
    } catch (e) {
      setError(e instanceof Error ? e.message : "The CSV could not be read.");
    }
  }
  function commit(next: SourceRow[], message: string) {
    setHistory((prev) => [...prev.slice(-9), rows]);
    setRows(next);
    setReviewed(false);
    setMerge(null);
    setNotice(message);
    setPage((p) =>
      Math.min(p, Math.max(0, Math.ceil(next.length / PAGE_SIZE) - 1)),
    );
  }
  function edit(id: string, col: number, value: string) {
    commit(
      rows.map((r) =>
        r.id === id
          ? { ...r, cells: r.cells.map((c, i) => (i === col ? value : c)) }
          : r,
      ),
      "Checks update as you edit. Original source row numbers are retained.",
    );
  }
  function exportCurrent() {
    if (!reviewed || !rows.length || analysis.error) return;
    downloadCsv(
      toCsv([header, ...rows.map((r) => r.cells)]),
      "bom-reviewed.csv",
    );
  }
  const issueRows = new Set(analysis.issues.map((i) => i.row)),
    candidate = analysis.groups.find((g) => g.part === merge);
  const pages = Math.max(1, Math.ceil(rows.length / PAGE_SIZE));
  return (
    <>
      <section className="panel" aria-labelledby="bom-source">
        <div className="section-heading">
          <h2 id="bom-source">
            <span className="step">01</span> Load a BOM
          </h2>
          <button
            className="button secondary small"
            disabled={loading}
            onClick={() => changeInput(sample, "Synthetic review example")}
          >
            Try a sample
          </button>
        </div>
        <div className="csv-intake">
          <label className="file-picker">
            Choose CSV or TSV
            <input
              type="file"
              accept=".csv,.tsv,text/csv,text/tab-separated-values"
              disabled={loading}
              aria-label="BOM CSV file"
              onChange={async (e) => {
                const file = e.currentTarget.files?.[0];
                e.currentTarget.value = "";
                if (!file) return;
                setLoading(true);
                setError("");
                try {
                  changeInput(await readUtf8(file), file.name);
                } catch (err) {
                  setError(
                    err instanceof Error
                      ? err.message
                      : "The CSV could not be read.",
                  );
                } finally {
                  setLoading(false);
                }
              }}
            />
            <span>
              {name || "UTF-8 · up to 4 MB / 10,000 rows / 100 columns"}
            </span>
          </label>
          <label className="field-label">
            Or paste CSV
            <textarea
              aria-label="BOM CSV text"
              rows={5}
              value={input}
              disabled={loading}
              spellCheck={false}
              placeholder="Part number,Description,Quantity,Material"
              onChange={(e) => changeInput(e.target.value)}
            />
          </label>
        </div>
        <div className="row-actions">
          <button
            className="button primary"
            disabled={loading || !input.trim()}
            onClick={check}
          >
            Check BOM →
          </button>
          <p className="hint">
            All original columns are kept, including custom fields and units.
          </p>
        </div>
        {loading && <p role="status">Opening CSV…</p>}
        {error && (
          <p className="notice error" role="alert">
            {error}
          </p>
        )}
      </section>
      {header.length > 0 && (
        <>
          <section className="panel register" aria-labelledby="mapping-title">
            <h2 id="mapping-title">
              <span className="step">02</span> Confirm columns
            </h2>
            <div className="column-mapping">
              {fields.map((f) => (
                <label key={f}>
                  {labels[f]}
                  {["partNumber", "quantity"].includes(f) ? " *" : ""}
                  <select
                    aria-label={`${labels[f]} column`}
                    value={map[f]}
                    onChange={(e) => {
                      setMap((prev) => ({
                        ...prev,
                        [f]: Number(e.target.value),
                      }));
                      setReviewed(false);
                      setMerge(null);
                    }}
                  >
                    <option value={-1}>
                      {["partNumber", "quantity"].includes(f)
                        ? "Choose a column"
                        : "Not checked"}
                    </option>
                    {header.map((h, i) => (
                      <option key={i} value={i}>
                        {i + 1}. {h || "(blank header)"}
                      </option>
                    ))}
                  </select>
                </label>
              ))}
            </div>
            {analysis.error && (
              <p className="notice error" role="alert">
                {analysis.error}
              </p>
            )}
            <p className="hint">
              Part numbers are case-sensitive. A repeated number can be
              intentional, for example when finishes or units differ.
            </p>
          </section>
          {!analysis.error && (
            <section className="panel register" aria-labelledby="checks-title">
              <div className="section-heading">
                <h2 id="checks-title">
                  {issueRows.size
                    ? `${issueRows.size} rows to review`
                    : "No listed issues found"}
                </h2>
                <button
                  className="button secondary small"
                  disabled={!analysis.issues.length}
                  onClick={() =>
                    downloadCsv(
                      toCsv([
                        [
                          "Original data rows",
                          "Part number",
                          "Check",
                          "Detail",
                        ],
                        ...analysis.issues.map((i) => [
                          i.source.join("; "),
                          i.part,
                          i.kind,
                          i.detail,
                        ]),
                      ]),
                      "bom-check-report.csv",
                    )
                  }
                >
                  Export check report ↓
                </button>
              </div>
              <p className="hint" role="status">
                {rows.length} rows · {analysis.issues.length} checks to review ·{" "}
                {analysis.groups.length} repeated part numbers. Original data
                row 1 is the first row after the header.
              </p>
              <details
                className="check-details"
                open={analysis.issues.length <= 12}
              >
                <summary>Review checks</summary>
                {analysis.issues.length ? (
                  <ul className="issue-list">
                    {analysis.issues.slice(0, 100).map((i, n) => (
                      <li key={`${i.row}-${n}`}>
                        <button
                          className="text-button"
                          onClick={() => {
                            setPage(
                              Math.floor(
                                rows.findIndex((r) => r.id === i.row) /
                                  PAGE_SIZE,
                              ),
                            );
                            document
                              .getElementById("bom-editor")
                              ?.scrollIntoView({
                                block: "start",
                                behavior: "smooth",
                              });
                          }}
                        >
                          Row {i.source.join(", ")}
                          {i.part ? ` · ${i.part}` : ""}
                        </button>
                        <strong>{i.kind}</strong>
                        <span>{i.detail}</span>
                      </li>
                    ))}
                  </ul>
                ) : (
                  <p className="empty-small">
                    These data checks found no listed issues. Confirm the
                    engineering content separately.
                  </p>
                )}
                {analysis.issues.length > 100 && (
                  <p className="hint">
                    First 100 checks shown; the report includes all checks.
                  </p>
                )}
              </details>
              {!!analysis.groups.length && (
                <details className="check-details">
                  <summary>Review repeated part numbers</summary>
                  <p className="hint">
                    Combining adds quantities and keeps the first item label. If
                    a row is an accidental duplicate, remove it instead.
                  </p>
                  {analysis.groups.slice(0, 50).map((g) => (
                    <div className="merge-row" key={g.part}>
                      <div>
                        <strong>{g.part}</strong>
                        <p>Original rows {g.source.join(", ")}</p>
                        <p className="hint">{g.reason}</p>
                      </div>
                      <button
                        className="button secondary small"
                        disabled={g.total === null}
                        onClick={() => setMerge(g.part)}
                      >
                        Review combine {g.part}
                      </button>
                    </div>
                  ))}
                  {analysis.groups.length > 50 && (
                    <p className="hint">
                      Showing 50 groups. Edit or filter your source CSV to
                      review the remaining groups.
                    </p>
                  )}
                </details>
              )}
              {candidate && (
                <div
                  className="merge-preview"
                  role="region"
                  aria-label="Combine preview"
                >
                  <h3>Combine {candidate.part}</h3>
                  <p>
                    {candidate.ids.length} rows become one row with quantity{" "}
                    <strong>{candidate.total}</strong>. Other columns use the
                    first row. Your next Undo restores these rows.
                  </p>
                  <div className="row-actions">
                    <button
                      className="button primary"
                      onClick={() => {
                        try {
                          commit(
                            combinePart(header, rows, map, candidate.part),
                            `Combined ${candidate.part}; source rows retained.`,
                          );
                        } catch (e) {
                          setError(
                            e instanceof Error
                              ? e.message
                              : "Could not combine rows.",
                          );
                        }
                      }}
                    >
                      Confirm combine
                    </button>
                    <button
                      className="button secondary"
                      onClick={() => setMerge(null)}
                    >
                      Cancel combine
                    </button>
                  </div>
                </div>
              )}
            </section>
          )}
          <section
            className="panel register"
            id="bom-editor"
            aria-labelledby="editor-title"
          >
            <div className="section-heading">
              <h2 id="editor-title">
                <span className="step">03</span> Edit and export
              </h2>
              <div className="row-actions">
                <button
                  className="button secondary small"
                  disabled={!history.length}
                  onClick={() => {
                    const previous = history.at(-1);
                    if (previous) {
                      setRows(previous);
                      setHistory(history.slice(0, -1));
                      setReviewed(false);
                      setMerge(null);
                      setNotice("Last edit undone.");
                    }
                  }}
                >
                  Undo
                </button>
                <button
                  className="button secondary small"
                  disabled={
                    !rows.some((r) => r.cells.some((c) => c !== c.trim()))
                  }
                  onClick={() =>
                    commit(
                      rows.map((r) => ({
                        ...r,
                        cells: r.cells.map((c) => c.trim()),
                      })),
                      "Trimmed outer whitespace. Leading zeros and internal spacing were kept.",
                    )
                  }
                >
                  Trim outer whitespace
                </button>
              </div>
            </div>
            {notice && (
              <p className="hint" role="status">
                {notice}
              </p>
            )}
            <p className="hint">
              Scroll sideways for all columns. Keep units and revisions when
              checking whether rows can be combined.
            </p>
            <div
              className="table-scroll"
              tabIndex={0}
              role="region"
              aria-label="Editable source BOM"
            >
              <table className="editable-source">
                <thead>
                  <tr>
                    <th>Source rows</th>
                    {header.map((h, i) => (
                      <th key={i}>{h || `Column ${i + 1}`}</th>
                    ))}
                    <th>Action</th>
                  </tr>
                </thead>
                <tbody>
                  {rows
                    .slice(page * PAGE_SIZE, (page + 1) * PAGE_SIZE)
                    .map((r) => (
                      <tr
                        key={r.id}
                        className={issueRows.has(r.id) ? "needs-review" : ""}
                      >
                        <th scope="row">{r.source.join(", ")}</th>
                        {r.cells.map((c, i) => (
                          <td key={i}>
                            <input
                              aria-label={`Source row ${r.source[0]} ${header[i] || `Column ${i + 1}`}`}
                              value={c}
                              onChange={(e) => edit(r.id, i, e.target.value)}
                            />
                          </td>
                        ))}
                        <td>
                          <button
                            className="text-button"
                            aria-label={`Remove source row ${r.source[0]}`}
                            onClick={() =>
                              commit(
                                rows.filter((row) => row.id !== r.id),
                                `Removed source row ${r.source.join(", ")}. Undo restores it.`,
                              )
                            }
                          >
                            Remove
                          </button>
                        </td>
                      </tr>
                    ))}
                </tbody>
              </table>
            </div>
            <div className="pagination">
              <button
                className="button secondary small"
                disabled={page === 0}
                onClick={() => setPage(page - 1)}
              >
                Previous
              </button>
              <span>
                Page {page + 1} of {pages} · {rows.length} rows
              </span>
              <button
                className="button secondary small"
                disabled={page + 1 >= pages}
                onClick={() => setPage(page + 1)}
              >
                Next
              </button>
            </div>
            <label className="review-check">
              <input
                type="checkbox"
                checked={reviewed}
                disabled={!rows.length || !!analysis.error}
                onChange={(e) => setReviewed(e.target.checked)}
              />{" "}
              I reviewed the current rows and any highlighted checks.
            </label>
            <div className="row-actions">
              <button
                className="button primary"
                disabled={!reviewed || !rows.length || !!analysis.error}
                onClick={exportCurrent}
              >
                Export reviewed CSV ↓
              </button>
              <span className="hint">
                Unresolved values stay exactly as shown. Formula-like text is
                escaped for spreadsheet safety.
              </span>
            </div>
          </section>
        </>
      )}
      <section className="guide">
        <h2>A review step between extraction and revision comparison</h2>
        <ol>
          <li>
            <strong>Load and map.</strong> Use your exported CSV and confirm
            which columns to check.
          </li>
          <li>
            <strong>Review the findings.</strong> Correct missing values,
            inspect conflicts, and choose whether repeated rows should stay
            separate.
          </li>
          <li>
            <strong>Keep the result.</strong> Export every original column, or
            download the check report for follow-up.
          </li>
        </ol>
        <div className="related-links">
          <a href="/tools/samples/bom-check.csv" download>
            Download example CSV ↓
          </a>
          <a href="/tools/drawing-to-bom/">Extract from a drawing →</a>
          <a href="/tools/bom-compare/">Compare two revisions →</a>
        </div>
        <p>
          This is a data check for flat BOMs. It does not convert units, resolve
          assembly hierarchies, select replacement parts or certify a BOM for
          purchasing. Quantities use a dot as decimal separator with up to 6
          decimal places.
        </p>
      </section>
    </>
  );
}
