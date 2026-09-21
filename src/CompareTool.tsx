import { useMemo, useState } from "react";
import { fields, labels, type BomField } from "./types";
import {
  downloadCsv,
  guessColumns,
  mappedRows,
  parseCsv,
  toCsv,
  type ColumnMap,
} from "./csv";
import { compareBoms, type DiffRow, type DiffStatus } from "./compare";
const samples = {
  before:
    "Item,Part number,Description,Quantity,Material\n1,BRK-100,Mounting bracket,1,Aluminium 6061\n2,PIN-020,Locating pin,2,Steel\n3,SCR-M6,Socket head screw,4,Steel\n4,WSH-M6,Plain washer,4,Steel",
  after:
    "Item,Part number,Description,Quantity,Material\n1,BRK-100,Mounting bracket,1,Aluminium 6061\n2,PIN-020,Locating pin,2,Stainless steel\n3,SCR-M6,Socket head screw,6,Steel\n4,NUT-M6,Hex nut,6,Steel",
};
type Revision = { text: string; name: string; map: ColumnMap };
const empty = (): Revision => ({ text: "", name: "", map: guessColumns([]) });
function parsed(text: string): { data: string[][]; error: string } {
  try {
    return { data: parseCsv(text), error: "" };
  } catch (e) {
    return {
      data: [],
      error: e instanceof Error ? e.message : "CSV could not be read.",
    };
  }
}
export function BomCompare() {
  const [before, setBefore] = useState<Revision>(empty),
    [after, setAfter] = useState<Revision>(empty),
    [result, setResult] = useState<DiffRow[] | null>(null),
    [error, setError] = useState(""),
    [filter, setFilter] = useState<"All" | DiffStatus>("All"),
    [loading, setLoading] = useState(false);
  const b = useMemo(() => parsed(before.text), [before.text]),
    a = useMemo(() => parsed(after.text), [after.text]);
  function change(side: "before" | "after", text: string, name = "") {
    const value = { text, name, map: guessColumns(parsed(text).data[0] ?? []) };
    (side === "before" ? setBefore : setAfter)(value);
    setResult(null);
    setError("");
  }
  async function choose(side: "before" | "after", file: File) {
    setError("");
    setResult(null);
    setLoading(true);
    try {
      if (file.size > 4_000_000)
        throw new Error("Choose a CSV smaller than 4 MB.");
      const buffer = await file.arrayBuffer();
      let text: string;
      try {
        text = new TextDecoder("utf-8", { fatal: true }).decode(buffer);
      } catch {
        throw new Error(
          "This file is not UTF-8. In Excel, save as CSV UTF-8 and try again.",
        );
      }
      change(side, text, file.name);
    } catch (e) {
      setError(e instanceof Error ? e.message : "The CSV could not be opened.");
    } finally {
      setLoading(false);
    }
  }
  function run() {
    try {
      if (b.error || a.error) throw new Error(b.error || a.error);
      setResult(
        compareBoms(
          mappedRows(b.data, before.map),
          mappedRows(a.data, after.map),
        ),
      );
      setFilter("All");
      setError("");
    } catch (e) {
      setResult(null);
      setError(e instanceof Error ? e.message : "Comparison could not finish.");
    }
  }
  function sample() {
    change("before", samples.before, "Sample · revision A");
    change("after", samples.after, "Sample · revision B");
  }
  function mapping(side: "before" | "after", field: BomField, column: number) {
    (side === "before" ? setBefore : setAfter)((prev) => ({
      ...prev,
      map: { ...prev.map, [field]: column },
    }));
    setResult(null);
    setError("");
  }
  const visible =
    result?.filter((r) => filter === "All" || r.status === filter) ?? [];
  return (
    <>
      <div className="compare-toolbar">
        <p>
          Match revisions by part number. See what changed before updating an
          assembly.
        </p>
        <div className="row-actions">
          <a className="example-jump" href="#bom-example">
            See the worked example ↓
          </a>
          <button
            className="button secondary"
            onClick={sample}
            disabled={loading}
          >
            Try sample revisions
          </button>
        </div>
      </div>
      <div className="revision-grid">
        {(["before", "after"] as const).map((side, i) => {
          const value = side === "before" ? before : after,
            view = side === "before" ? b : a;
          return (
            <section
              className="panel revision"
              key={side}
              aria-labelledby={`${side}-title`}
            >
              <h2 id={`${side}-title`}>
                <span className="step">0{i + 1}</span>{" "}
                {side === "before" ? "Before" : "After"}
              </h2>
              <label className="file-picker">
                Choose CSV
                <input
                  type="file"
                  accept=".csv,.tsv,text/csv,text/tab-separated-values"
                  disabled={loading}
                  aria-label={`${side === "before" ? "Before" : "After"} CSV file`}
                  onChange={(e) => {
                    const f = e.currentTarget.files?.[0];
                    e.currentTarget.value = "";
                    if (f) void choose(side, f);
                  }}
                />
                <span>{value.name || "UTF-8 CSV or TSV · up to 4 MB"}</span>
              </label>
              <label className="paste-label">
                Or paste CSV
                <textarea
                  aria-label={`${side === "before" ? "Before" : "After"} CSV text`}
                  value={value.text}
                  spellCheck={false}
                  disabled={loading}
                  placeholder="Part number,Description,Quantity,Material"
                  onChange={(e) => change(side, e.target.value)}
                />
              </label>
              {view.error && (
                <p className="notice error" role="alert">
                  {view.error}
                </p>
              )}
              {view.data.length > 0 && (
                <>
                  <p className="hint">
                    {view.data.length - 1} data rows · first row is the header
                  </p>
                  <details open>
                    <summary>Map columns</summary>
                    <div className="column-mapping">
                      {fields.map((field) => (
                        <label key={field}>
                          {labels[field]}
                          {(field === "partNumber" || field === "quantity") &&
                            " *"}
                          <select
                            aria-label={`${side} ${labels[field]} column`}
                            value={value.map[field]}
                            onChange={(e) =>
                              mapping(side, field, Number(e.target.value))
                            }
                          >
                            <option value="-1">
                              {field === "partNumber" || field === "quantity"
                                ? "Choose a column"
                                : "Not included"}
                            </option>
                            {view.data[0].map((h, j) => (
                              <option key={j} value={j}>
                                {j + 1}. {h || "(blank header)"}
                              </option>
                            ))}
                          </select>
                        </label>
                      ))}
                    </div>
                  </details>
                </>
              )}
            </section>
          );
        })}
      </div>
      <div className="compare-action">
        <span className="hint">
          Part numbers are case-sensitive. Duplicate part numbers must be
          resolved first.
        </span>
        <button
          className="button primary"
          disabled={loading || !before.text.trim() || !after.text.trim()}
          onClick={run}
        >
          Compare BOMs →
        </button>
      </div>
      {error && (
        <p className="notice error" role="alert">
          {error}
        </p>
      )}
      {result && (
        <section className="panel diff-results" aria-labelledby="diff-title">
          <div className="section-heading">
            <h2 id="diff-title">Revision changes</h2>
            <button
              className="button secondary"
              onClick={() =>
                downloadCsv(
                  toCsv([
                    [
                      "Status",
                      "Part number",
                      "Before quantity",
                      "After quantity",
                      "Quantity change",
                      "Before description",
                      "After description",
                      "Before material",
                      "After material",
                      "Changed fields",
                    ],
                    ...result.map((r) => [
                      r.status,
                      r.key,
                      r.before?.quantity ?? "",
                      r.after?.quantity ?? "",
                      r.delta,
                      r.before?.description ?? "",
                      r.after?.description ?? "",
                      r.before?.material ?? "",
                      r.after?.material ?? "",
                      r.changes.join("; "),
                    ]),
                  ]),
                  "bom-comparison.csv",
                )
              }
            >
              Export comparison ↓
            </button>
          </div>
          <div className="status-filters" aria-label="Filter comparison">
            {(["All", "Added", "Removed", "Changed", "Unchanged"] as const).map(
              (s) => (
                <button
                  key={s}
                  className={filter === s ? "selected" : ""}
                  aria-pressed={filter === s}
                  onClick={() => setFilter(s)}
                >
                  {s}{" "}
                  <strong>
                    {s === "All"
                      ? result.length
                      : result.filter((r) => r.status === s).length}
                  </strong>
                </button>
              ),
            )}
          </div>
          <div role="status" className="sr-only">
            Comparison complete.{" "}
            {result.filter((r) => r.status === "Added").length} added,{" "}
            {result.filter((r) => r.status === "Removed").length} removed,{" "}
            {result.filter((r) => r.status === "Changed").length} changed.
          </div>
          {visible.length ? (
            <div
              className="table-scroll"
              tabIndex={0}
              role="region"
              aria-label="BOM comparison table"
            >
              <table>
                <thead>
                  <tr>
                    <th scope="col">Status</th>
                    <th scope="col">Part number</th>
                    <th scope="col">Description</th>
                    <th scope="col">Quantity</th>
                    <th scope="col">Material</th>
                  </tr>
                </thead>
                <tbody>
                  {visible.map((r) => (
                    <tr key={r.key}>
                      <td>
                        <span className={`status ${r.status.toLowerCase()}`}>
                          {r.status}
                        </span>
                      </td>
                      <th scope="row" className="part-number">
                        {r.key}
                      </th>
                      <td>
                        <Change
                          before={r.before?.description}
                          after={r.after?.description}
                        />
                      </td>
                      <td className="quantity">
                        <Change
                          before={r.before?.quantity}
                          after={r.after?.quantity}
                        />
                      </td>
                      <td>
                        <Change
                          before={r.before?.material}
                          after={r.after?.material}
                        />
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          ) : (
            <p className="empty-small">
              No {filter.toLowerCase()} parts in this comparison.
            </p>
          )}
        </section>
      )}
      <section
        className="guide worked-example"
        id="bom-example"
        aria-labelledby="bom-example-title"
      >
        <span className="eyebrow">SYNTHETIC WORKED EXAMPLE</span>
        <h2 id="bom-example-title">
          What changed in this bracket assembly’s parts list?
        </h2>
        <p>
          Two flat BOM revisions, four rows each. These are the expected
          findings from the sample, not results from your files.
        </p>
        <div
          className="table-scroll example-table"
          role="region"
          aria-label="Sample BOM revision guide"
          tabIndex={0}
        >
          <table>
            <caption>Revision A → Revision B · expected comparison</caption>
            <thead>
              <tr>
                <th scope="col">Part number</th>
                <th scope="col">Revision A</th>
                <th scope="col">Revision B</th>
                <th scope="col">Finding</th>
              </tr>
            </thead>
            <tbody>
              <tr>
                <th scope="row">BRK-100</th>
                <td>1 · Aluminium 6061</td>
                <td>1 · Aluminium 6061</td>
                <td>
                  <span className="status unchanged">Unchanged</span>
                </td>
              </tr>
              <tr>
                <th scope="row">PIN-020</th>
                <td>2 · Steel</td>
                <td>2 · Stainless steel</td>
                <td>
                  <span className="status changed">Material changed</span>
                </td>
              </tr>
              <tr>
                <th scope="row">SCR-M6</th>
                <td>4 · Steel</td>
                <td>6 · Steel</td>
                <td>
                  <span className="status changed">Quantity +2</span>
                </td>
              </tr>
              <tr>
                <th scope="row">WSH-M6</th>
                <td>4 · Steel</td>
                <td>Not present</td>
                <td>
                  <span className="status removed">Removed</span>
                </td>
              </tr>
              <tr>
                <th scope="row">NUT-M6</th>
                <td>Not present</td>
                <td>6 · Steel</td>
                <td>
                  <span className="status added">Added</span>
                </td>
              </tr>
            </tbody>
          </table>
        </div>
        <ol>
          <li>
            <strong>Load both revisions.</strong> Choose Try sample revisions
            above, or download the two CSVs and open them with Choose CSV.
          </li>
          <li>
            <strong>Check the column mapping.</strong> Confirm part number,
            quantity, description and material. Select Compare BOMs.
          </li>
          <li>
            <strong>Review and export.</strong> Expect 1 added, 1 removed, 2
            changed and 1 unchanged part. Export the full comparison as CSV.
          </li>
        </ol>
        <div className="related-links">
          <a href="/tools/samples/bom-revision-a.csv" download>
            Download revision A CSV ↓
          </a>
          <a href="/tools/samples/bom-revision-b.csv" download>
            Download revision B CSV ↓
          </a>
        </div>
        <h3>Check a revision before replacing parts</h3>
        <p>
          Export each BOM as CSV UTF-8 from your spreadsheet or CAD/PDM system.
          Map the part number and quantity columns, then compare. Description
          and material changes appear when those columns are included.
        </p>
        <p>
          Rows match by the exact, trimmed part number. A changed part number
          appears as a removal and an addition. Item order is ignored.
          Quantities must use decimal numbers with a dot, without units or
          thousands separators; this tool does not convert units or reconcile
          assembly hierarchies.
        </p>
        <a href="/tools/drawing-to-bom/">
          BOM still in a drawing? Extract the table first →
        </a>
        <a href="/tools/bom-check/">
          Review repeated parts and missing quantities →
        </a>
        <a href="https://mst-us.ai/pid-bom-pdm-handoff-to-solidworks/">
          Preparing P&ID, BOM and model data for an assembly workflow →
        </a>
      </section>
    </>
  );
}
function Change({ before, after }: { before?: string; after?: string }) {
  if (before === after) return <>{after || "—"}</>;
  if (before === undefined) return <>{after || "—"}</>;
  if (after === undefined) return <>{before || "—"}</>;
  return (
    <span className="changed-value">
      <del>{before || "—"}</del>
      <span aria-hidden="true"> → </span>
      <ins>{after || "—"}</ins>
    </span>
  );
}
