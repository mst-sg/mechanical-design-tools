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
import { recognizeDrawing } from "./recognize";
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
  const unavailable = busy || loading;
  function resetResults() {
    setRows([]);
    setText("");
    setNote("");
    setError("");
  }
  async function choose(file: File) {
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
      if (id === generation.current) setDrawing(next);
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
  async function recognize() {
    if (!drawing) return;
    resetResults();
    setBusy(true);
    const id = ++generation.current;
    const control = new AbortController();
    controller.current = control;
    const timeout = window.setTimeout(() => control.abort(), 120000);
    try {
      const result = await recognizeDrawing(
        drawing.url,
        crop,
        lang,
        control.signal,
        (message, value) => {
          if (id === generation.current) setProgress({ message, value });
        },
      );
      if (id === generation.current) {
        setRows(result.rows);
        setText(result.text);
        setNote(result.message);
      }
    } catch (e) {
      if (id === generation.current)
        setError(
          control.signal.aborted
            ? "Recognition stopped. Try a smaller crop or a sharper image."
            : e instanceof Error
              ? e.message
              : "Recognition failed. Try again with a smaller image.",
        );
    } finally {
      clearTimeout(timeout);
      if (id === generation.current) {
        setBusy(false);
        controller.current = null;
      }
    }
  }
  function cancel() {
    generation.current++;
    controller.current?.abort();
    controller.current = null;
    setBusy(false);
    setNote("Recognition cancelled. Your drawing is still here.");
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
              accept=".png,.jpg,.jpeg,.pdf"
              disabled={unavailable}
              onChange={(e) => {
                const f = e.currentTarget.files?.[0];
                e.currentTarget.value = "";
                if (f) void choose(f);
              }}
            />
            <span>Up to 25 MB · Files stay on this device</span>
          </label>
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
                value={progress.value}
                max="1"
                aria-label="Recognition progress"
              />
              <small>
                The first run loads the recognition engine. Large pages take
                longer.
              </small>
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
              onClick={() => downloadCsv(exportBom(rows), "bom-reviewed.csv")}
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
      <section className="guide">
        <h2>From drawing table to a usable spreadsheet</h2>
        <ol>
          <li>
            <strong>Choose the page.</strong> Use a clear, upright image or the
            correct PDF sheet.
          </li>
          <li>
            <strong>Crop the table.</strong> Include headers such as Part
            number, Description and Qty; leave drawing notes outside.
          </li>
          <li>
            <strong>Check and export.</strong> Correct misread characters and
            blank quantities before downloading.
          </li>
        </ol>
        <p>
          This tool extracts an existing printed BOM or parts list. It does not
          infer hidden parts, quantities or assembly structure from geometry.
          Wrapped text, merged cells, rotated tables and poor scans may need
          manual correction.
        </p>
        <a href="/tools/bom-compare/">
          Already have two BOM revisions? Compare them →
        </a>
        <a href="/tools/bom-check/">
          Check missing values and repeated parts →
        </a>
      </section>
    </>
  );
}
