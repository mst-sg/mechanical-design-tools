import { useRef, useState } from "react";
import { downloadCsv, parseCsv } from "./csv";
import { readUtf8 } from "./text-file";
import { csvRecordRange } from "./model-check";
import { startUsage, type UsageRun } from "./usage";
import {
  checkPackage,
  guessPackageColumn,
  packageReportCsv,
  packageSample,
  type PackageFile,
  type PackageReport,
} from "./delivery-package";

export function DeliveryPackageTool() {
  const [text, setText] = useState(""),
    [column, setColumn] = useState(-1),
    [files, setFiles] = useState<PackageFile[]>([]);
  const [mode, setMode] = useState<PackageReport["mode"]>("filename");
  const [result, setResult] = useState<{
    report: PackageReport;
    usage: UsageRun;
  } | null>(null);
  const [error, setError] = useState(""),
    [busy, setBusy] = useState(false),
    [sample, setSample] = useState(false),
    [reviewed, setReviewed] = useState(false);
  const ref = useRef<HTMLTextAreaElement>(null);
  function invalidate() {
    setResult(null);
    setError("");
    setReviewed(false);
  }
  function change(value: string) {
    setText(value);
    setColumn(guessPackageColumn(value));
    invalidate();
    setSample(false);
  }
  function loadSample(corrected = false) {
    setText(packageSample.manifest);
    setColumn(0);
    setFiles(corrected ? packageSample.corrected : packageSample.files);
    setMode("filename");
    invalidate();
    setSample(true);
  }
  async function chooseManifest(file: File) {
    setBusy(true);
    change("");
    try {
      change(await readUtf8(file));
    } catch (e) {
      setError(
        e instanceof Error ? e.message : "The manifest could not be read.",
      );
    } finally {
      setBusy(false);
    }
  }
  function chooseFiles(selection: FileList, folder: boolean) {
    invalidate();
    setSample(false);
    setFiles([]);
    setMode(folder ? "relative-path" : "filename");
    if (selection.length > 10000) {
      setError("Select at most 10,000 files.");
      return;
    }
    setFiles(
      Array.from(selection, (f) => ({
        name: f.name,
        size: f.size,
        relativePath: folder
          ? f.webkitRelativePath.split("/").slice(1).join("/")
          : undefined,
      })),
    );
  }
  function run() {
    invalidate();
    const usage = startUsage(sample ? "sample" : "provided");
    try {
      setResult({ report: checkPackage(text, column, files, mode), usage });
      usage.complete();
    } catch (e) {
      setError(e instanceof Error ? e.message : "The check could not finish.");
    }
  }
  function locate(record: number) {
    const el = ref.current;
    if (!el) return;
    el.focus();
    const range = csvRecordRange(el.value, record);
    if (range) el.setSelectionRange(...range);
    el.scrollIntoView({ block: "center", behavior: "smooth" });
  }
  let headers: string[] = [],
    parseError = "";
  try {
    headers = parseCsv(text)[0] ?? [];
  } catch (e) {
    parseError = e instanceof Error ? e.message : "Invalid CSV";
  }
  const report = result?.report;
  return (
    <>
      <div className="compare-toolbar">
        <p>
          Check the required PDF, STEP and other deliverables against files
          selected on your device. Find missing, empty or ambiguous files before
          sending a package.
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
        <section className="panel revision" aria-labelledby="manifest-title">
          <h2 id="manifest-title">
            <span className="step">01</span> Required-file manifest
          </h2>
          <label className="file-picker compact-picker">
            Choose CSV
            <input
              type="file"
              accept=".csv,.tsv,.txt"
              aria-label="Manifest CSV file"
              disabled={busy}
              onChange={(e) => {
                const f = e.currentTarget.files?.[0];
                e.currentTarget.value = "";
                if (f) void chooseManifest(f);
              }}
            />
            <span>UTF-8 · up to 4 MB</span>
          </label>
          <label className="paste-label">
            Or paste CSV
            <textarea
              ref={ref}
              aria-label="Manifest CSV text"
              value={text}
              rows={8}
              spellCheck={false}
              disabled={busy}
              onChange={(e) => change(e.target.value)}
            />
          </label>
          {parseError && (
            <p role="alert" className="notice error">
              {parseError}
            </p>
          )}
          {!!headers.length && (
            <label className="paste-label">
              Required filename/path column
              <select
                aria-label="Required filename/path column"
                value={column}
                disabled={busy}
                onChange={(e) => {
                  setColumn(Number(e.target.value));
                  invalidate();
                  setSample(false);
                }}
              >
                <option value={-1}>Choose column</option>
                {headers.map((h, i) => (
                  <option key={i} value={i}>
                    {i + 1}. {h || "(blank header)"}
                  </option>
                ))}
              </select>
            </label>
          )}
        </section>
        <section className="panel revision" aria-labelledby="package-title">
          <h2 id="package-title">
            <span className="step">02</span> Package files
          </h2>
          <label className="file-picker compact-picker">
            Choose files
            <input
              type="file"
              multiple
              aria-label="Package files"
              disabled={busy}
              onChange={(e) => {
                if (e.currentTarget.files?.length)
                  chooseFiles(e.currentTarget.files, false);
                e.currentTarget.value = "";
              }}
            />
            <span>Filenames and sizes only · up to 10,000 files</span>
          </label>
          <label className="file-picker compact-picker">
            Choose folder
            <input
              type="file"
              multiple
              {...{ webkitdirectory: "" }}
              aria-label="Package folder"
              disabled={busy}
              onChange={(e) => {
                if (e.currentTarget.files?.length)
                  chooseFiles(e.currentTarget.files, true);
                e.currentTarget.value = "";
              }}
            />
            <span>Paths are relative to the selected folder</span>
          </label>
          <p className="hint">
            {sample
              ? "Synthetic example file list; no files have been selected from your device."
              : `${files.length} selected files. Contents are not read or uploaded.`}{" "}
            {mode === "relative-path"
              ? "Matching relative paths."
              : "Matching filenames exactly, including case."}
          </p>
          {!!files.length && (
            <details>
              <summary>View {files.length} file names and sizes</summary>
              <ul className="package-files">
                {files.slice(0, 30).map((f, i) => (
                  <li key={i}>
                    {mode === "relative-path" ? f.relativePath : f.name} ·{" "}
                    {f.size.toLocaleString("en-US")} bytes
                  </li>
                ))}
              </ul>
              {files.length > 30 && (
                <p className="hint">
                  First 30 shown; every selected file is checked.
                </p>
              )}
            </details>
          )}
        </section>
      </div>
      <div className="compare-action">
        <p className="hint">
          List every required deliverable separately. A filename ending in “B”
          does not prove revision B is inside the file.
        </p>
        <button
          className="text-button"
          disabled={busy}
          onClick={() => {
            change("");
            setFiles([]);
            setMode("filename");
          }}
        >
          Clear inputs
        </button>
        <button
          className="button primary"
          disabled={busy || !text.trim() || !files.length}
          onClick={run}
        >
          {busy ? "Reading CSV…" : "Check delivery package →"}
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
          aria-labelledby="package-results-title"
        >
          <h2 id="package-results-title">Delivery package review</h2>
          <p role="status">
            {report.required} required records · {report.selected} selected
            files · {report.found} uniquely matched non-empty files ·{" "}
            {report.findings.length} review items.
          </p>
          {report.findings.length ? (
            <>
              <p className="hint">
                Manifest records include the header as 1. Selected-file
                positions follow the file list above.
                {report.findings.length > 500 &&
                  " Showing the first 500 findings; the export includes all findings."}
              </p>
              <div
                className="table-scroll"
                role="region"
                aria-label="Delivery package review table"
                tabIndex={0}
              >
                <table>
                  <thead>
                    <tr>
                      <th>Manifest record</th>
                      <th>File / path</th>
                      <th>Selected positions</th>
                      <th>Finding</th>
                    </tr>
                  </thead>
                  <tbody>
                    {report.findings.slice(0, 500).map((r, i) => (
                      <tr key={i}>
                        <td>
                          {r.record === null ? (
                            "—"
                          ) : (
                            <button
                              className="text-button"
                              onClick={() => locate(r.record!)}
                            >
                              Manifest record {r.record}
                            </button>
                          )}
                        </td>
                        <td>{r.path || "(blank)"}</td>
                        <td>{r.selected || "—"}</td>
                        <td>{r.detail}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </>
          ) : (
            <p>Every required identity has one non-empty selected file.</p>
          )}
          <p className="hint">
            This is a manifest check. File contents, native CAD references,
            actual revisions, signatures and completeness of your manifest still
            require review.
          </p>
          <label className="review-check">
            <input
              type="checkbox"
              checked={reviewed}
              onChange={(e) => setReviewed(e.target.checked)}
            />{" "}
            I have reviewed the manifest, selected files and findings.
          </label>
          <button
            className="button secondary"
            disabled={!reviewed}
            onClick={() =>
              downloadCsv(
                packageReportCsv(report),
                "delivery-package-review.csv",
                result.usage.export,
              )
            }
          >
            Export package review ↓
          </button>
        </section>
      )}
      <section className="guide">
        <h2>Build the manifest from the agreed delivery scope</h2>
        <p>
          Confirm which drawings, models and supporting documents the recipient
          needs. Export them in your CAD system, then check the resulting folder
          here.
        </p>
        <div className="related-links">
          <a href="/tools/handbook/#delivery-package">
            Worked exercise and sample files →
          </a>
          <a href="/tools/bom-model-check/">Check BOM-to-model assignments</a>
          <a href="/tools/drawing-register-compare/">
            Compare drawing-register revisions
          </a>
        </div>
      </section>
    </>
  );
}
