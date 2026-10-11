import { startUsage, type UsageMode, type UsageRun } from "./usage";
import { BomLabGuide } from "./BomLabGuide";
import { useEffect, useRef, useState, type PointerEvent } from "react";
import type { PDFDocumentProxy } from "pdfjs-dist";
import {
  blankRow,
  fields,
  labels,
  fullCrop,
  type BomRow,
  type Crop,
} from "./types";
import { fileKind, loadImage, openPdf, pdfPage, type Drawing } from "./files";
import { downloadCsv, exportBom, numericQuantity } from "./csv";
import {
  cancelJob,
  deleteJob,
  jobEvent,
  newJob,
  rememberedJob,
  rememberJob,
  uploadJob,
  waitForJob,
} from "./jobs";
import type { JobAccess, JobSnapshot } from "./job-types";
export function DrawingToBom() {
  const [drawing, setDrawing] = useState<Drawing | null>(null),
    [rows, setRows] = useState<BomRow[]>([]),
    [crop, setCrop] = useState<Crop>(fullCrop),
    [busy, setBusy] = useState(false),
    [loading, setLoading] = useState(false),
    [error, setError] = useState(""),
    [note, setNote] = useState(""),
    [text, setText] = useState(""),
    [progress, setProgress] = useState({ message: "", value: 0 }),
    [lang, setLang] = useState("eng"),
    [page, setPage] = useState(1),
    [pages, setPages] = useState(0);
  const [managingJob, setManagingJob] = useState(false);
  const [job, setJob] = useState<JobSnapshot | null>(null);
  const [access, setAccess] = useState<JobAccess | null>(null);
  const [retentionHours, setRetentionHours] = useState(24);
  const originalFile = useRef<File | null>(null);
  const inputMode = useRef<UsageMode>("provided");
  const currentUsage = useRef<UsageRun | null>(null);
  const pdf = useRef<PDFDocumentProxy | null>(null),
    controller = useRef<AbortController | null>(null),
    generation = useRef(0),
    drag = useRef<{ x: number; y: number } | null>(null);
  useEffect(
    () => () => {
      generation.current++;
      controller.current?.abort();
      void pdf.current?.loadingTask.destroy();
    },
    [],
  );
  useEffect(
    () => () => {
      if (drawing) URL.revokeObjectURL(drawing.url);
    },
    [drawing],
  );
  useEffect(() => {
    const abort = new AbortController();
    void fetch("/tools-api/health", { signal: abort.signal, cache: "no-store" })
      .then((r) => (r.ok ? r.json() : null))
      .then((value) => {
        if (value && Number.isFinite(value.retentionHours))
          setRetentionHours(value.retentionHours);
      })
      .catch(() => {});
    const saved = rememberedJob();
    if (saved) void resume(saved);
    return () => abort.abort();
  }, []);
  const unavailable = busy || loading || managingJob;
  function resetResults() {
    currentUsage.current = null;
    setRows([]);
    setText("");
    setNote("");
    setError("");
  }
  async function choose(file: File, mode: UsageMode = "provided") {
    inputMode.current = mode;
    originalFile.current = null;
    setAccess(null);
    setJob(null);
    rememberJob(null);
    const id = ++generation.current;
    resetResults();
    setDrawing(null);
    setLoading(true);
    setPages(0);
    setPage(1);
    setCrop(fullCrop);
    try {
      await pdf.current?.loadingTask.destroy();
      pdf.current = null;
      const kind = await fileKind(file);
      let next: Drawing;
      if (kind === "pdf") {
        const doc = await openPdf(file);
        if (id !== generation.current) {
          await doc.loadingTask.destroy();
          return;
        }
        if (doc.numPages > 500) {
          await doc.loadingTask.destroy();
          throw new Error(
            "Choose a PDF with no more than 500 pages, or export the BOM sheet separately.",
          );
        }
        pdf.current = doc;
        setPages(doc.numPages);
        next = await pdfPage(doc, 1, file.name);
      } else next = await loadImage(file, file.name);
      if (id === generation.current) {
        setDrawing(next);
        originalFile.current = file;
      }
    } catch (e) {
      if (id === generation.current)
        setError(
          e instanceof Error
            ? e.message
            : "The drawing could not be opened. Try another file.",
        );
    } finally {
      if (id === generation.current) setLoading(false);
    }
  }
  async function sample() {
    setLoading(true);
    try {
      const response = await fetch("/tools/samples/bracket-bom.png");
      if (!response.ok)
        throw new Error("The sample could not load. Please try again.");
      await choose(
        new File([await response.blob()], "Sample bracket assembly.png", {
          type: "image/png",
        }),
        "sample",
      );
      setCrop({ left: 3, top: 50, width: 94, height: 42 });
    } catch (e) {
      setError(e instanceof Error ? e.message : "Sample unavailable.");
    } finally {
      setLoading(false);
    }
  }
  async function changePage(n: number) {
    if (!pdf.current || !drawing || n < 1 || n > pages) return;
    const id = ++generation.current;
    setLoading(true);
    resetResults();
    try {
      const next = await pdfPage(pdf.current, n, drawing.name);
      if (id === generation.current) {
        setDrawing(next);
        setPage(n);
        setCrop(fullCrop);
      }
    } catch {
      setError(
        "This page could not be rendered. Try another page or export it as PNG.",
      );
    } finally {
      if (id === generation.current) setLoading(false);
    }
  }
  async function receiveJob(
    next: JobAccess,
    id: number,
    control: AbortController,
    usage?: UsageRun,
  ) {
    const result = await waitForJob(next, control.signal, (snapshot) => {
      if (id !== generation.current) return;
      setJob(snapshot);
      const messages = {
        uploading: "Uploading drawing…",
        queued: "Uploaded. Waiting for recognition…",
        rendering: "Preparing the selected page…",
        loading_model: "Loading the server recognition engine…",
        recognizing: "Reading the parts table on the server…",
        finished: "Processing finished",
      };
      setProgress({
        message: messages[snapshot.phase],
        value: snapshot.progress,
      });
    });
    if (id !== generation.current) return;
    setRows(result.rows);
    setText(result.text);
    setNote(result.message);
    if (result.rows.length) usage?.complete();
    requestAnimationFrame(() => {
      if (id === generation.current) void jobEvent(next, "shown");
    });
  }
  async function resume(saved = access) {
    if (!saved) return;
    const id = ++generation.current,
      control = new AbortController();
    controller.current = control;
    setAccess(saved);
    setBusy(true);
    setError("");
    setProgress({ message: "Checking your server job…", value: 0 });
    try {
      await receiveJob(saved, id, control);
    } catch (e) {
      if (id === generation.current)
        setError(
          e instanceof Error
            ? e.message
            : "The job could not be checked. Try again.",
        );
    } finally {
      if (id === generation.current) {
        setBusy(false);
        controller.current = null;
      }
    }
  }
  async function recognize() {
    const file = originalFile.current;
    if (!drawing || !file) return;
    resetResults();
    const usage = startUsage(inputMode.current);
    currentUsage.current = usage;
    const id = ++generation.current,
      control = new AbortController(),
      next = newJob();
    controller.current = control;
    setBusy(true);
    setAccess(next);
    setJob(null);
    rememberJob(next);
    setProgress({ message: "Uploading drawing to MST…", value: 0 });
    try {
      const snapshot = await uploadJob(
        next,
        file,
        {
          page,
          crop,
          language: lang === "chi_sim" ? "chi_sim" : "eng",
          mode: inputMode.current === "sample" ? "sample" : "provided",
          traffic:
            navigator.webdriver ||
            new URLSearchParams(location.search).get("mst_analytics_test") ===
              "1"
              ? "test"
              : "browser",
        },
        control.signal,
      );
      if (id !== generation.current) return;
      setJob(snapshot);
      await receiveJob(next, id, control, usage);
    } catch (e) {
      if (id === generation.current) {
        currentUsage.current = null;
        setError(
          e instanceof Error
            ? e.message
            : "Processing failed. Please try again.",
        );
      }
    } finally {
      if (id === generation.current) {
        setBusy(false);
        controller.current = null;
      }
    }
  }
  async function cancel() {
    currentUsage.current = null;
    generation.current++;
    controller.current?.abort();
    controller.current = null;
    setBusy(false);
    setManagingJob(true);
    setError("Cancelling processing…");
    try {
      if (access) await cancelJob(access);
      setError(
        "Processing cancelled. You can start again or delete the server files.",
      );
    } catch (e) {
      setError(
        e instanceof Error
          ? e.message
          : "Cancellation could not be confirmed. Check this job again.",
      );
    } finally {
      setManagingJob(false);
    }
  }
  async function eraseServerFiles() {
    if (!access) return;
    setManagingJob(true);
    setError("");
    try {
      await deleteJob(access);
      setAccess(null);
      setJob(null);
      rememberJob(null);
      setNote(
        "Server files deleted. Any reviewed rows remain in this tab until you close it.",
      );
    } catch (e) {
      setError(
        e instanceof Error ? e.message : "Deletion failed. Please try again.",
      );
    } finally {
      setManagingJob(false);
    }
  }
  function pointer(e: PointerEvent<HTMLDivElement>) {
    const r = e.currentTarget.getBoundingClientRect();
    return {
      x: Math.max(0, Math.min(100, ((e.clientX - r.left) / r.width) * 100)),
      y: Math.max(0, Math.min(100, ((e.clientY - r.top) / r.height) * 100)),
    };
  }
  function move(e: PointerEvent<HTMLDivElement>) {
    if (!drag.current) return;
    const end = pointer(e),
      start = drag.current;
    setCrop({
      left: Math.min(start.x, end.x),
      top: Math.min(start.y, end.y),
      width: Math.max(1, Math.abs(start.x - end.x)),
      height: Math.max(1, Math.abs(start.y - end.y)),
    });
  }
  function cropValue(field: keyof Crop, value: number) {
    setCrop((prev) => {
      const next = { ...prev, [field]: Number.isFinite(value) ? value : 0 };
      next.left = Math.max(0, Math.min(99, next.left));
      next.top = Math.max(0, Math.min(99, next.top));
      next.width = Math.max(1, Math.min(100 - next.left, next.width));
      next.height = Math.max(1, Math.min(100 - next.top, next.height));
      return next;
    });
  }
  function update(id: string, field: keyof BomRow, value: string) {
    setRows((prev) =>
      prev.map((r) => (r.id === id ? { ...r, [field]: value } : r)),
    );
  }
  function exportRows() {
    const usable = rows.some(
      (row) =>
        (row.partNumber.trim() || row.description.trim()) &&
        numericQuantity(row.quantity) !== null,
    );
    downloadCsv(exportBom(rows), "bom-reviewed.csv", () => {
      if (!usable) {
        // Keep an already completed OCR result exportable without treating
        // blank or unfinished manual entries as a newly completed result.
        currentUsage.current?.export();
        return;
      }
      const usage = currentUsage.current ?? startUsage(inputMode.current);
      currentUsage.current = usage;
      usage.complete();
      usage.export();
      if (access) void jobEvent(access, "exported");
    });
  }
  return (
    <>
      <div className="workspace">
        <section className="panel source-panel" aria-labelledby="source-title">
          <div className="section-heading">
            <h2 id="source-title">
              <span className="step">01</span> Choose a drawing
            </h2>
            <button
              className="button secondary small"
              onClick={sample}
              disabled={unavailable}
            >
              Try a sample
            </button>
          </div>
          <label className="file-picker">
            PNG, JPEG or PDF
            <input
              type="file"
              aria-label="Choose a PNG, JPEG or PDF drawing"
              aria-describedby="drawing-file-policy"
              accept=".png,.jpg,.jpeg,.pdf"
              disabled={unavailable}
              onChange={(e) => {
                const f = e.currentTarget.files?.[0];
                e.currentTarget.value = "";
                if (f) void choose(f);
              }}
            />
            <span>Up to 25 MB · Uploaded when you choose Extract BOM</span>
          </label>
          <p className="upload-note" id="drawing-file-policy">
            MST processes the original file on its server. The file and result
            are deleted within {retentionHours} hours. You can delete them
            sooner below. Files are not used for model training.
          </p>
          {loading && (
            <div className="loading" role="status">
              Opening drawing…
            </div>
          )}
          {drawing && (
            <>
              <div className="file-meta">
                <strong title={drawing.name}>{drawing.name}</strong>
                {pages > 0 && (
                  <label>
                    Page{" "}
                    <select
                      aria-label="PDF page"
                      value={page}
                      disabled={unavailable}
                      onChange={(e) => void changePage(Number(e.target.value))}
                    >
                      {Array.from({ length: pages }, (_, i) => (
                        <option key={i} value={i + 1}>
                          {i + 1} of {pages}
                        </option>
                      ))}
                    </select>
                  </label>
                )}
              </div>
              <p className="hint">
                Drag a box around the parts table, including its headers.
              </p>
              <div
                className={`drawing-preview ${unavailable ? "inactive" : ""}`}
                onPointerDown={(e) => {
                  if (unavailable) return;
                  drag.current = pointer(e);
                  e.currentTarget.setPointerCapture(e.pointerId);
                }}
                onPointerMove={move}
                onPointerUp={(e) => {
                  move(e);
                  drag.current = null;
                }}
                onPointerCancel={() => {
                  drag.current = null;
                }}
              >
                <img
                  src={drawing.url}
                  alt="Selected engineering drawing; orange box marks the recognition area"
                  draggable={false}
                />
                <div
                  className="crop-box"
                  style={{
                    left: crop.left + "%",
                    top: crop.top + "%",
                    width: crop.width + "%",
                    height: crop.height + "%",
                  }}
                />
              </div>
              <div className="preview-actions">
                <button
                  className="text-button"
                  disabled={unavailable}
                  onClick={() => setCrop(fullCrop)}
                >
                  Use whole page
                </button>
                <a href={drawing.url} target="_blank" rel="noopener">
                  Open full-size drawing ↗
                </a>
              </div>
              <details>
                <summary>Adjust crop with keyboard</summary>
                <div className="crop-controls">
                  {(["left", "top", "width", "height"] as const).map(
                    (field) => (
                      <label key={field}>
                        {field} (%)
                        <input
                          type="number"
                          min={field === "left" || field === "top" ? 0 : 1}
                          max="100"
                          value={Math.round(crop[field])}
                          disabled={unavailable}
                          onChange={(e) =>
                            cropValue(field, Number(e.target.value))
                          }
                        />
                      </label>
                    ),
                  )}
                </div>
              </details>
            </>
          )}
          {!drawing && !loading && (
            <div className="drawing-placeholder" aria-hidden="true">
              <svg viewBox="0 0 460 220">
                <g fill="none" stroke="currentColor" strokeWidth="1.5">
                  <path d="M70 135V65h90l45 35v70h-90zM70 65l45 35h90M115 100v70M70 135l45 35" />
                  <circle cx="143" cy="130" r="13" />
                  <path d="M245 70h160v105H245zM245 95h160M245 122h160M245 149h160M278 70v105M363 70v105" />
                </g>
              </svg>
              <p>Start with a drawing that contains a parts table.</p>
            </div>
          )}
          <div className="recognize-bar">
            <label>
              Text language
              <select
                value={lang}
                disabled={unavailable}
                onChange={(e) => setLang(e.target.value)}
              >
                <option value="eng">English</option>
                <option value="chi_sim">English + Simplified Chinese</option>
              </select>
            </label>
            <button
              className="button primary"
              disabled={!drawing || unavailable}
              onClick={recognize}
            >
              Extract BOM <span aria-hidden="true">→</span>
            </button>
          </div>
          {busy && (
            <div className="progress-region" role="status">
              <div>
                <span>{progress.message}</span>
                <button className="text-button" onClick={cancel}>
                  Cancel
                </button>
              </div>
              <progress
                value={
                  job?.phase === "recognizing" ? progress.value : undefined
                }
                max="1"
                aria-label="Recognition progress"
              />
              <small>
                Your job continues on the server. Keep this tab to review or
                delete its result.
              </small>
            </div>
          )}
          {access && !busy && (
            <div className="server-job">
              <p>
                Server job <code>{access.id.slice(0, 8)}</code>
                {job && (
                  <>
                    {" "}
                    · Files expire {new Date(job.expiresAt).toLocaleString()}
                  </>
                )}
              </p>
              <div className="preview-actions">
                <button
                  className="text-button"
                  disabled={managingJob}
                  onClick={() => void resume()}
                >
                  Check job again
                </button>
                <button
                  className="text-button"
                  disabled={managingJob}
                  onClick={() => void eraseServerFiles()}
                >
                  Delete server files
                </button>
              </div>
            </div>
          )}
          {error && (
            <p className="notice error" role="alert">
              {error}
            </p>
          )}
        </section>
        <section className="panel result-panel" aria-labelledby="result-title">
          <div className="section-heading">
            <h2 id="result-title">
              <span className="step">02</span> Review your BOM
            </h2>
            <span className="muted">
              {rows.length ? `${rows.length} rows` : "Editable result"}
            </span>
          </div>
          {note && (
            <p className="notice" role="status">
              {note}
            </p>
          )}
          {!rows.length ? (
            <div className="empty-result">
              <span className="table-symbol" aria-hidden="true">
                ▦
              </span>
              <h3>Your parts table will appear here</h3>
              <p>
                Extract the BOM, then check part numbers and quantities against
                the drawing. Every cell can be edited.
              </p>
            </div>
          ) : (
            <div
              className="table-scroll"
              tabIndex={0}
              role="region"
              aria-label="Editable BOM table"
            >
              <table className="editable-table">
                <thead>
                  <tr>
                    {fields.map((f) => (
                      <th scope="col" key={f}>
                        {labels[f]}
                      </th>
                    ))}
                    <th scope="col">Review</th>
                    <th scope="col">
                      <span className="sr-only">Delete</span>
                    </th>
                  </tr>
                </thead>
                <tbody>
                  {rows.map((row, index) => (
                    <tr key={row.id}>
                      {fields.map((f) => (
                        <td key={f}>
                          <input
                            aria-label={`Row ${index + 1} ${labels[f]}`}
                            className={
                              f === "quantity" &&
                              numericQuantity(row.quantity) === null
                                ? "invalid"
                                : ""
                            }
                            value={row[f]}
                            onChange={(e) => update(row.id, f, e.target.value)}
                          />
                        </td>
                      ))}
                      <td>
                        <span className="review-label">
                          {numericQuantity(row.quantity) === null
                            ? "Check quantity"
                            : row.confidence !== undefined &&
                                row.confidence < 75
                              ? "Check text"
                              : "Review"}
                        </span>
                      </td>
                      <td>
                        <button
                          className="icon-button"
                          aria-label={`Delete row ${index + 1}`}
                          onClick={() =>
                            setRows((r) => r.filter((x) => x.id !== row.id))
                          }
                        >
                          ×
                        </button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
          <div className="result-actions">
            <button
              className="button secondary"
              disabled={unavailable || rows.length >= 500}
              onClick={() => setRows((r) => [...r, blankRow()])}
            >
              + Add row
            </button>
            <button
              className="button primary"
              disabled={!rows.length || unavailable}
              onClick={exportRows}
            >
              Export CSV ↓
            </button>
          </div>
          <p className="hint">
            UTF-8 CSV opens in Excel, Google Sheets and most PDM tools. Review
            before ordering or changing an assembly.
          </p>
          {text && (
            <details className="source-text">
              <summary>View recognized source text</summary>
              <pre>{text}</pre>
            </details>
          )}
        </section>
      </div>
      <BomLabGuide />
    </>
  );
}
