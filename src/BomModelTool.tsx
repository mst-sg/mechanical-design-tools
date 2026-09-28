import { useRef, useState } from "react";
import { parseCsv, downloadCsv } from "./csv";
import { readUtf8 } from "./text-file";
import { startUsage } from "./usage";
import {
  checkModels,
  csvRecordRange,
  guessModelMap,
  modelReportCsv,
  modelSamples,
  type ModelField,
  type ModelFinding,
  type ModelInput,
  type SelectedModel,
} from "./model-check";

const empty = (): ModelInput => ({
  text: "",
  map: { part: -1, revision: -1, file: -1 },
});
const labels: Record<ModelField, string> = {
  part: "Part number",
  revision: "Revision",
  file: "Model file",
};
function parse(text: string) {
  try {
    return { rows: parseCsv(text), error: "" };
  } catch (e) {
    return {
      rows: [] as string[][],
      error: e instanceof Error ? e.message : "The CSV could not be read.",
    };
  }
}
export function BomModelTool() {
  const [bom, setBom] = useState<ModelInput>(empty),
    [models, setModels] = useState<ModelInput>(empty);
  const [files, setFiles] = useState<SelectedModel[] | null>(null),
    [result, setResult] = useState<ModelFinding[] | null>(null);
  const [error, setError] = useState(""),
    [loading, setLoading] = useState(false),
    [sampleMode, setSampleMode] = useState(false);
  const [filter, setFilter] = useState("All");
  const bomRef = useRef<HTMLTextAreaElement>(null),
    modelRef = useRef<HTMLTextAreaElement>(null);
  function invalidate() {
    setResult(null);
    setError("");
  }
  function change(side: "bom" | "models", text: string) {
    (side === "bom" ? setBom : setModels)({
      text,
      map: guessModelMap(parse(text).rows[0] ?? []),
    });
    invalidate();
  }
  function sample() {
    change("bom", modelSamples.bom);
    change("models", modelSamples.models);
    setFiles(null);
    setSampleMode(true);
  }
  async function choose(side: "bom" | "models", file: File) {
    setLoading(true);
    invalidate();
    setSampleMode(false);
    try {
      change(side, await readUtf8(file));
    } catch (e) {
      setError(e instanceof Error ? e.message : "The CSV could not be read.");
    } finally {
      setLoading(false);
    }
  }
  function run() {
    const usage = startUsage(sampleMode ? "sample" : "provided");
    invalidate();
    try {
      setResult(checkModels(bom, models, files));
      setFilter("All");
      usage.complete();
    } catch (e) {
      setError(e instanceof Error ? e.message : "The check could not finish.");
    }
  }
  function locate(side: "bom" | "models", row: number) {
    const el = (side === "bom" ? bomRef : modelRef).current;
    if (!el) return;
    const range = csvRecordRange(el.value, row);
    el.focus();
    if (range) {
      el.setSelectionRange(...range);
      el.scrollTop = el.value.slice(0, range[0]).split("\n").length * 22 - 44;
    }
    el.scrollIntoView({ behavior: "smooth", block: "center" });
  }
  const visible =
    result?.filter((r) => filter === "All" || r.status === filter) ?? [];
  return (
    <>
      <div className="compare-toolbar">
        <p>
          Check a BOM against an explicit model index. Download the missing-file
          and revision review list.
        </p>
        <button
          className="button secondary"
          onClick={sample}
          disabled={loading}
        >
          Try handoff sample
        </button>
      </div>
      <div className="revision-grid">
        {(["bom", "models"] as const).map((side, i) => {
          const input = side === "bom" ? bom : models,
            parsed = parse(input.text),
            title = side === "bom" ? "BOM" : "Model index";
          const fields: ModelField[] =
            side === "bom"
              ? ["part", "revision"]
              : ["part", "file", "revision"];
          return (
            <section
              className="panel revision"
              key={side}
              aria-labelledby={`${side}-model-title`}
            >
              <h2 id={`${side}-model-title`}>
                <span className="step">0{i + 1}</span> {title}
              </h2>
              <label className="file-picker compact-picker">
                Choose {title} CSV
                <input
                  type="file"
                  accept=".csv,.tsv,.txt"
                  aria-label={`${title} CSV file`}
                  disabled={loading}
                  onChange={(e) => {
                    const f = e.currentTarget.files?.[0];
                    e.currentTarget.value = "";
                    if (f) void choose(side, f);
                  }}
                />
                <span>UTF-8 · up to 4 MB</span>
              </label>
              <label className="paste-label">
                Or paste {title} CSV
                <textarea
                  ref={side === "bom" ? bomRef : modelRef}
                  aria-label={`${title} CSV text`}
                  rows={8}
                  value={input.text}
                  spellCheck={false}
                  disabled={loading}
                  onChange={(e) => {
                    change(side, e.target.value);
                    setSampleMode(false);
                  }}
                />
              </label>
              {parsed.error && (
                <p className="notice error" role="alert">
                  {parsed.error}
                </p>
              )}
              {parsed.rows.length > 0 && (
                <details open>
                  <summary>Map {title} columns</summary>
                  <div className="column-mapping">
                    {fields.map((field) => (
                      <label key={field}>
                        {labels[field]}
                        {field !== "revision" ? " *" : " (optional)"}
                        <select
                          aria-label={`${title} ${labels[field]} column`}
                          disabled={loading}
                          value={input.map[field]}
                          onChange={(e) => {
                            (side === "bom" ? setBom : setModels)((p) => ({
                              ...p,
                              map: {
                                ...p.map,
                                [field]: Number(e.target.value),
                              },
                            }));
                            invalidate();
                            setSampleMode(false);
                          }}
                        >
                          <option value={-1}>
                            {field === "revision"
                              ? "Not supplied"
                              : "Choose a column"}
                          </option>
                          {parsed.rows[0].map((h, n) => (
                            <option value={n} key={n}>
                              {n + 1}. {h || "(blank header)"}
                            </option>
                          ))}
                        </select>
                      </label>
                    ))}
                  </div>
                </details>
              )}
            </section>
          );
        })}
      </div>
      <section
        className="panel model-files"
        aria-labelledby="model-files-title"
      >
        <h2 id="model-files-title">
          Verify file presence <span className="hint">optional</span>
        </h2>
        <p className="hint">
          Select the model files named in the index. Filenames are matched
          exactly, including case. Only names and sizes are read; model contents
          and native CAD revisions are not inspected.
        </p>
        <label className="file-picker compact-picker">
          Select model files
          <input
            type="file"
            multiple
            aria-label="Model files"
            disabled={loading}
            onChange={(e) => {
              const next = Array.from(e.currentTarget.files ?? []);
              e.currentTarget.value = "";
              if (!next.length) return;
              invalidate();
              setSampleMode(false);
              if (next.length > 10000) {
                setFiles(null);
                setError("Select at most 10,000 model files.");
                return;
              }
              setFiles(next.map((f) => ({ name: f.name, size: f.size })));
            }}
          />
          <span>
            {files === null
              ? "No files selected — metadata check only"
              : `${files.length} files selected`}
          </span>
        </label>
        {files !== null && (
          <button
            className="text-button"
            onClick={() => {
              setFiles(null);
              invalidate();
            }}
          >
            Clear selected files
          </button>
        )}
      </section>
      <div className="compare-action">
        <p className="hint">
          Part numbers and declared revisions are case-sensitive. Missing
          revisions remain review items.
        </p>
        <button
          className="button primary"
          disabled={loading || !bom.text.trim() || !models.text.trim()}
          onClick={run}
        >
          {loading ? "Reading CSV…" : "Check model handoff →"}
        </button>
      </div>
      {error && (
        <p className="notice error" role="alert">
          {error}
        </p>
      )}
      {result && (
        <section
          className="panel diff-results"
          aria-labelledby="model-result-title"
        >
          <div className="section-heading">
            <h2 id="model-result-title">Model handoff review</h2>
            <button
              className="button secondary"
              onClick={() =>
                downloadCsv(modelReportCsv(result), "bom-model-review.csv")
              }
            >
              Export model review ↓
            </button>
          </div>
          <p className="hint" role="status">
            {result.length} records checked.{" "}
            {files === null
              ? "File presence was not checked. Metadata matches do not prove that files exist."
              : "File presence checked against your selection. File contents and geometry were not checked."}
          </p>
          <div className="status-filters" aria-label="Filter model review">
            {[
              "All",
              "Needs review",
              "Metadata match",
              "Files matched",
              "Not in BOM",
            ].map((s) => (
              <button
                key={s}
                aria-pressed={filter === s}
                className={filter === s ? "selected" : ""}
                onClick={() => setFilter(s)}
              >
                {s}{" "}
                <strong>
                  {s === "All"
                    ? result.length
                    : result.filter((r) => r.status === s).length}
                </strong>
              </button>
            ))}
          </div>
          {visible.length ? (
            <div
              className="table-scroll"
              role="region"
              aria-label="Model review table"
              tabIndex={0}
            >
              <table>
                <thead>
                  <tr>
                    <th>Part / source</th>
                    <th>Result</th>
                    <th>Model files</th>
                    <th>Declared revisions</th>
                    <th>Review findings</th>
                  </tr>
                </thead>
                <tbody>
                  {visible.slice(0, 500).map((r, i) => (
                    <tr key={i}>
                      <th scope="row">
                        {r.part || "(no part number)"}
                        <div className="source-actions">
                          {r.bomRow !== null && (
                            <button
                              className="text-button"
                              onClick={() => locate("bom", r.bomRow!)}
                            >
                              BOM row {r.bomRow}
                            </button>
                          )}
                          {r.modelRows.map((row) => (
                            <button
                              key={row}
                              className="text-button"
                              onClick={() => locate("models", row)}
                            >
                              Model row {row}
                            </button>
                          ))}
                        </div>
                      </th>
                      <td>
                        <span
                          className={`status ${r.status === "Needs review" ? "changed" : "unchanged"}`}
                        >
                          {r.status}
                        </span>
                      </td>
                      <td>{r.files.join("; ") || "—"}</td>
                      <td>
                        BOM: {r.requiredRevision || "not supplied"}
                        <br />
                        Model:{" "}
                        {r.modelRevisions
                          .map((v) => v || "not supplied")
                          .join("; ") || "—"}
                      </td>
                      <td>
                        {r.findings.join("; ") ||
                          "Listed part and revision agree"}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          ) : (
            <p className="notice">
              No records in this filter. Choose All to review the complete
              handoff.
            </p>
          )}
          {visible.length > 500 && (
            <p className="hint">
              Showing 500 records. Export includes all {result.length} records.
            </p>
          )}
        </section>
      )}
      <section className="guide">
        <p>
          Multiple formats or configurations for one part need an explicit
          choice. This check compares your records and file selection; it does
          not approve geometry or assembly compatibility.
        </p>
        <div className="related-links">
          <a href="/tools/handbook/#models">
            Sample findings and model handoff guide →
          </a>
          <a href="/tools/samples/model-bom.csv" download>
            Sample BOM ↓
          </a>
          <a href="/tools/samples/model-index.csv" download>
            Sample model index ↓
          </a>
          <a href="/tools/bom-compare/">Compare BOM revisions →</a>
        </div>
      </section>
    </>
  );
}
