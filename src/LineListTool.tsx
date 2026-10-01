import { useRef, useState } from "react";
import { downloadCsv, parseCsv } from "./csv";
import { readUtf8 } from "./text-file";
import { csvRecordRange } from "./model-check";
import { startUsage, type UsageRun } from "./usage";
import {
  checkLineLists,
  lineFields,
  lineInput,
  lineLabels,
  lineReportCsv,
  lineSamples,
  lineSources,
  type LineInput,
  type LineReport,
  type LineSide,
} from "./line-list";

const sides: LineSide[] = ["register", "drawing"];
const empty = () => ({ register: lineInput(""), drawing: lineInput("") });
export function LineListTool() {
  const [inputs, setInputs] = useState<Record<LineSide, LineInput>>(empty);
  const [result, setResult] = useState<{
    report: LineReport;
    usage: UsageRun;
  } | null>(null);
  const [error, setError] = useState(""),
    [busy, setBusy] = useState(false),
    [sample, setSample] = useState(false),
    [reviewed, setReviewed] = useState(false);
  const refs = useRef<Partial<Record<LineSide, HTMLTextAreaElement | null>>>(
    {},
  );
  function invalidate() {
    setResult(null);
    setError("");
    setReviewed(false);
  }
  function change(side: LineSide, text: string) {
    setInputs((p) => ({ ...p, [side]: lineInput(text) }));
    invalidate();
    setSample(false);
  }
  function loadSample(corrected = false) {
    setInputs({
      register: lineInput(lineSamples.register),
      drawing: lineInput(
        corrected ? lineSamples.register : lineSamples.drawing,
      ),
    });
    invalidate();
    setSample(true);
  }
  async function choose(side: LineSide, file: File) {
    setBusy(true);
    change(side, "");
    try {
      change(side, await readUtf8(file));
    } catch (e) {
      setError(e instanceof Error ? e.message : "The CSV could not be read.");
    } finally {
      setBusy(false);
    }
  }
  function run() {
    invalidate();
    const usage = startUsage(sample ? "sample" : "provided");
    try {
      setResult({ report: checkLineLists(inputs), usage });
      usage.complete();
    } catch (e) {
      setError(
        e instanceof Error ? e.message : "The comparison could not finish.",
      );
    }
  }
  function locate(side: LineSide, record: number) {
    const el = refs.current[side];
    if (!el) return;
    el.focus();
    const range = csvRecordRange(el.value, record);
    if (range) el.setSelectionRange(...range);
    el.scrollIntoView({ block: "center", behavior: "smooth" });
  }
  const report = result?.report;
  return (
    <>
      <div className="compare-toolbar">
        <p>
          Compare your line list with records you have checked against the
          P&amp;ID. Identify missing lines and disagreements before handoff.
        </p>
        <div className="related-links">
          <button
            className="button secondary"
            disabled={busy}
            onClick={() => loadSample()}
          >
            Try faulty sample
          </button>
          <button
            className="text-button"
            disabled={busy}
            onClick={() => loadSample(true)}
          >
            Load corrected sample
          </button>
        </div>
      </div>
      <div className="revision-grid">
        {sides.map((side, i) => {
          const input = inputs[side];
          let headers: string[] = [],
            parseError = "";
          try {
            headers = parseCsv(input.text)[0] ?? [];
          } catch (e) {
            parseError = e instanceof Error ? e.message : "Invalid CSV";
          }
          return (
            <section
              className="panel revision"
              key={side}
              aria-labelledby={`${side}-line-title`}
            >
              <h2 id={`${side}-line-title`}>
                <span className="step">0{i + 1}</span> {lineSources[side]}
              </h2>
              <label className="file-picker compact-picker">
                Choose CSV
                <input
                  type="file"
                  accept=".csv,.tsv,.txt"
                  aria-label={`${lineSources[side]} CSV file`}
                  disabled={busy}
                  onChange={(e) => {
                    const file = e.currentTarget.files?.[0];
                    e.currentTarget.value = "";
                    if (file) void choose(side, file);
                  }}
                />
                <span>UTF-8 · up to 4 MB</span>
              </label>
              <label className="paste-label">
                Or paste CSV
                <textarea
                  ref={(el) => {
                    refs.current[side] = el;
                  }}
                  aria-label={`${lineSources[side]} CSV text`}
                  value={input.text}
                  rows={7}
                  spellCheck={false}
                  disabled={busy}
                  onChange={(e) => change(side, e.target.value)}
                />
              </label>
              {parseError && (
                <p role="alert" className="notice error">
                  {parseError}
                </p>
              )}
              {!!headers.length && (
                <details open>
                  <summary>Map {lineSources[side]} columns</summary>
                  <div className="column-mapping">
                    {lineFields.map((field) => (
                      <label key={field}>
                        {lineLabels[field]}
                        {field === "line" ? " *" : " (optional)"}
                        <select
                          aria-label={`${lineSources[side]} ${lineLabels[field]} column`}
                          value={input.map[field]}
                          disabled={busy}
                          onChange={(e) => {
                            const value = Number(e.target.value);
                            setInputs((p) => ({
                              ...p,
                              [side]: {
                                ...p[side],
                                map: { ...p[side].map, [field]: value },
                              },
                            }));
                            invalidate();
                            setSample(false);
                          }}
                        >
                          <option value={-1}>
                            {field === "line"
                              ? "Choose column"
                              : "Not compared"}
                          </option>
                          {headers.map((h, n) => (
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
      <div className="compare-action">
        <p className="hint">
          One row per line identity. Match case and leading zeros exactly. Size
          labels are compared as text; units and flow direction are not
          inferred.
        </p>
        <button
          className="text-button"
          disabled={busy}
          onClick={() => {
            setInputs(empty());
            invalidate();
            setSample(false);
          }}
        >
          Clear inputs
        </button>
        <button
          className="button primary"
          disabled={busy || sides.some((s) => !inputs[s].text.trim())}
          onClick={run}
        >
          {busy ? "Reading CSV…" : "Check line lists →"}
        </button>
      </div>
      {error && (
        <p role="alert" className="notice error">
          {error}
        </p>
      )}
      {report && result && (
        <section
          className="panel diff-results"
          aria-labelledby="line-results-title"
        >
          <h2 id="line-results-title">Line list review</h2>
          <p role="status">
            {report.counts.register} line list records · {report.counts.drawing}{" "}
            drawing records · {report.findings.length} review items.
          </p>
          <p className="hint">
            Compared attributes:{" "}
            {report.comparedFields.map((f) => lineLabels[f]).join(", ") ||
              "none (identity only)"}
            . {report.comparedLines} unique shared line identities. Duplicate
            identities are excluded from attribute comparison.
          </p>
          {report.findings.length ? (
            <>
              <p className="hint">
                Select a source record to review its input. Record numbers
                include the header as 1.
                {report.findings.length > 500 &&
                  " Showing the first 500 findings; the export includes all findings."}
              </p>
              <div
                className="table-scroll"
                role="region"
                aria-label="Line list review table"
                tabIndex={0}
              >
                <table>
                  <thead>
                    <tr>
                      <th>Source records</th>
                      <th>Line / field</th>
                      <th>Values</th>
                      <th>Finding</th>
                    </tr>
                  </thead>
                  <tbody>
                    {report.findings.slice(0, 500).map((r, i) => (
                      <tr key={i}>
                        <td>
                          <button
                            className="text-button"
                            onClick={() => locate(r.source, r.row)}
                          >
                            {lineSources[r.source]} record {r.row}
                          </button>
                          {r.otherRow !== null && (
                            <>
                              <br />
                              <button
                                className="text-button"
                                onClick={() => locate("drawing", r.otherRow!)}
                              >
                                Drawing record {r.otherRow}
                              </button>
                            </>
                          )}
                        </td>
                        <td>
                          <strong>{r.line || "(missing line number)"}</strong>
                          <br />
                          {r.field}
                        </td>
                        <td>
                          {r.field ? (
                            <>
                              {r.listed || "(blank)"}
                              <br />↔ {r.observed || "(blank)"}
                            </>
                          ) : (
                            "—"
                          )}
                        </td>
                        <td>{r.detail}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </>
          ) : (
            <p>No discrepancies in the supplied records and mapped fields.</p>
          )}
          <p className="hint">
            This comparison does not read a P&amp;ID image or verify actual
            connectivity, line sizing, design pressure, material suitability or
            engineering approval.
          </p>
          <label className="review-check">
            <input
              type="checkbox"
              checked={reviewed}
              onChange={(e) => setReviewed(e.target.checked)}
            />{" "}
            I have reviewed the inputs, mapped fields and findings.
          </label>
          <button
            className="button secondary"
            disabled={!reviewed}
            onClick={() =>
              downloadCsv(
                lineReportCsv(report),
                "line-list-review.csv",
                result.usage.export,
              )
            }
          >
            Export line list review ↓
          </button>
        </section>
      )}
      <section className="guide">
        <h2>Reconcile the lists before changing the design</h2>
        <p>
          Prepare reviewed drawing records first. A missing line can indicate a
          scope difference; a repeated line number may need separate segment
          identities. Resolve each finding against the controlled drawing.
        </p>
        <div className="related-links">
          <a href="/tools/handbook/#line-lists">
            Worked exercise and sample files →
          </a>
          <a href="/tools/connection-table-check/">
            Check connection endpoints
          </a>
          <a href="/tools/pid-tag-check/">
            Prepare a reviewed P&amp;ID tag list
          </a>
        </div>
      </section>
    </>
  );
}
