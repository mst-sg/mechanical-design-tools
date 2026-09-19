import { useEffect, useRef, useState, type PointerEvent } from "react";
import type { PDFDocumentProxy } from "pdfjs-dist";
import { fileKind, loadImage, openPdf, pdfPage, type Drawing } from "./files";
import { fullCrop, type Crop } from "./types";
import { recognizeText } from "./recognize";
export type ReadSheet = {
  sourceId: string;
  file: string;
  page: number;
  text: string;
};
type SourceFile = { id: string; file: File };
type Props = {
  sample: { url: string; name: string; crop: Crop };
  onResult: (sheet: ReadSheet) => void;
  onInvalidate: () => void;
  queue?: boolean;
  recognitionMode?: "text" | "tags";
};
export function DrawingReader({
  sample,
  onResult,
  onInvalidate,
  queue = false,
  recognitionMode = "text",
}: Props) {
  const [files, setFiles] = useState<SourceFile[]>([]),
    [selected, setSelected] = useState(0);
  const [drawing, setDrawing] = useState<Drawing | null>(null),
    [crop, setCrop] = useState<Crop>(fullCrop);
  const [page, setPage] = useState(1),
    [pages, setPages] = useState(0),
    [language, setLanguage] = useState("eng");
  const [loading, setLoading] = useState(false),
    [busy, setBusy] = useState(false),
    [error, setError] = useState("");
  const [text, setText] = useState(""),
    [progress, setProgress] = useState({ message: "", value: 0 });
  const document = useRef<PDFDocumentProxy | null>(null),
    control = useRef<AbortController | null>(null),
    generation = useRef(0);
  const source = useRef<SourceFile | null>(null),
    drag = useRef<{ x: number; y: number } | null>(null);
  const resultCallback = useRef(onResult);
  resultCallback.current = onResult;
  const disabled = loading || busy;
  useEffect(
    () => () => {
      generation.current++;
      control.current?.abort();
      void document.current?.loadingTask.destroy();
    },
    [],
  );
  useEffect(
    () => () => {
      if (drawing) URL.revokeObjectURL(drawing.url);
    },
    [drawing],
  );
  function invalidate() {
    setText("");
    setError("");
    onInvalidate();
  }
  async function open(file: SourceFile, initialCrop = fullCrop) {
    const id = ++generation.current;
    invalidate();
    setLoading(true);
    setDrawing(null);
    setPage(1);
    setPages(0);
    setCrop(initialCrop);
    source.current = file;
    try {
      await document.current?.loadingTask.destroy();
      document.current = null;
      const kind = await fileKind(file.file);
      let next: Drawing;
      if (kind === "pdf") {
        const doc = await openPdf(file.file);
        if (id !== generation.current) {
          await doc.loadingTask.destroy();
          return;
        }
        if (doc.numPages > 500) {
          await doc.loadingTask.destroy();
          throw new Error(
            "Choose a PDF with at most 500 pages, or export the required sheet separately.",
          );
        }
        document.current = doc;
        setPages(doc.numPages);
        next = await pdfPage(doc, 1, file.file.name);
      } else next = await loadImage(file.file, file.file.name);
      if (id === generation.current) setDrawing(next);
      else URL.revokeObjectURL(next.url);
    } catch (e) {
      if (id === generation.current)
        setError(
          e instanceof Error ? e.message : "The drawing could not be opened.",
        );
    } finally {
      if (id === generation.current) setLoading(false);
    }
  }
  async function choose(list: File[]) {
    if (!list.length) return;
    if (
      list.length > 10 ||
      list.reduce((n, f) => n + f.size, 0) > 100 * 1024 * 1024
    ) {
      setError("Choose up to 10 files, totalling no more than 100 MB.");
      return;
    }
    const next = list.map((file) => ({ id: crypto.randomUUID(), file }));
    setFiles(next);
    setSelected(0);
    await open(next[0]);
  }
  async function useSample() {
    setLoading(true);
    setError("");
    try {
      const response = await fetch(sample.url);
      if (!response.ok)
        throw new Error("The sample could not load. Please try again.");
      const file = {
        id: crypto.randomUUID(),
        file: new File([await response.blob()], sample.name, {
          type: "image/png",
        }),
      };
      setFiles([file]);
      setSelected(0);
      await open(file, sample.crop);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Sample unavailable.");
    } finally {
      setLoading(false);
    }
  }
  async function changePage(n: number) {
    if (!document.current || !drawing || n < 1 || n > pages) return;
    const id = ++generation.current;
    setLoading(true);
    invalidate();
    try {
      const next = await pdfPage(document.current, n, drawing.name);
      if (id === generation.current) {
        setDrawing(next);
        setPage(n);
        setCrop(fullCrop);
      } else URL.revokeObjectURL(next.url);
    } catch {
      setError(
        "This page could not be rendered. Try another page or export it as PNG.",
      );
    } finally {
      if (id === generation.current) setLoading(false);
    }
  }
  async function read() {
    if (!drawing || !source.current) return;
    const id = ++generation.current,
      c = new AbortController();
    control.current = c;
    const selectedSource = source.current;
    invalidate();
    setBusy(true);
    setProgress({ message: "Loading recognition engine…", value: 0 });
    const timer = window.setTimeout(() => c.abort(), 120000);
    try {
      const result = await recognizeText(
        drawing.url,
        crop,
        language,
        c.signal,
        (message, value) => {
          if (id === generation.current) setProgress({ message, value });
        },
        recognitionMode,
      );
      if (id === generation.current) {
        const arranged = result.layoutText || result.text;
        setText(arranged);
        resultCallback.current({
          sourceId: `${selectedSource.id}:${page}`,
          file: drawing.name,
          page,
          text: arranged,
        });
      }
    } catch (e) {
      if (id === generation.current)
        setError(
          c.signal.aborted
            ? "Recognition stopped. Try a smaller crop or a clearer image."
            : e instanceof Error
              ? e.message
              : "Recognition failed. Please retry.",
        );
    } finally {
      clearTimeout(timer);
      if (id === generation.current) {
        setBusy(false);
        control.current = null;
      }
    }
  }
  function cancel() {
    generation.current++;
    control.current?.abort();
    control.current = null;
    setBusy(false);
    setError("Recognition cancelled. Your drawing is still here.");
  }
  function position(e: PointerEvent<HTMLDivElement>) {
    const r = e.currentTarget.getBoundingClientRect();
    return {
      x: Math.max(0, Math.min(100, ((e.clientX - r.left) / r.width) * 100)),
      y: Math.max(0, Math.min(100, ((e.clientY - r.top) / r.height) * 100)),
    };
  }
  function move(e: PointerEvent<HTMLDivElement>) {
    if (!drag.current) return;
    const end = position(e),
      start = drag.current;
    setCrop({
      left: Math.min(start.x, end.x),
      top: Math.min(start.y, end.y),
      width: Math.max(1, Math.abs(end.x - start.x)),
      height: Math.max(1, Math.abs(end.y - start.y)),
    });
  }
  function updateCrop(field: keyof Crop, value: number) {
    invalidate();
    setCrop((prev) => {
      const n = { ...prev, [field]: Number.isFinite(value) ? value : 0 };
      n.left = Math.max(0, Math.min(99, n.left));
      n.top = Math.max(0, Math.min(99, n.top));
      n.width = Math.max(1, Math.min(100 - n.left, n.width));
      n.height = Math.max(1, Math.min(100 - n.top, n.height));
      return n;
    });
  }
  return (
    <section className="panel source-panel" aria-labelledby="reader-title">
      <div className="section-heading">
        <h2 id="reader-title">
          <span className="step">01</span> Read a drawing
        </h2>
        <button
          className="button secondary small"
          disabled={disabled}
          onClick={useSample}
        >
          Try a sample
        </button>
      </div>
      <label className="file-picker">
        PNG, JPEG or PDF
        <input
          type="file"
          accept=".png,.jpg,.jpeg,.pdf"
          multiple={queue}
          disabled={disabled}
          aria-label="Drawing files"
          onChange={(e) => {
            const selectedFiles = [...(e.currentTarget.files || [])];
            e.currentTarget.value = "";
            void choose(selectedFiles);
          }}
        />
        <span>
          25 MB per file
          {queue
            ? " · up to 10 files; review one sheet at a time"
            : " · Files stay on this device"}
        </span>
      </label>
      {files.length > 1 && (
        <label className="field-label">
          Selected drawing
          <select
            aria-label="Selected drawing"
            value={selected}
            disabled={disabled}
            onChange={(e) => {
              const n = Number(e.target.value);
              setSelected(n);
              void open(files[n]);
            }}
          >
            {files.map((f, i) => (
              <option key={f.id} value={i}>
                {i + 1}. {f.file.name}
              </option>
            ))}
          </select>
        </label>
      )}
      {loading && (
        <p className="loading" role="status">
          Opening drawing…
        </p>
      )}
      {drawing ? (
        <>
          <div className="file-meta">
            <strong>{drawing.name}</strong>
            {pages > 0 && (
              <label>
                Page{" "}
                <select
                  aria-label="PDF page"
                  value={page}
                  disabled={disabled}
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
            Drag a box around the text to read. Include its labels.
          </p>
          <div
            className={`drawing-preview ${disabled ? "inactive" : ""}`}
            onPointerDown={(e) => {
              if (disabled) return;
              invalidate();
              drag.current = position(e);
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
              alt="Selected drawing; orange box marks the recognition area"
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
              disabled={disabled}
              onClick={() => {
                invalidate();
                setCrop(fullCrop);
              }}
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
              {(["left", "top", "width", "height"] as const).map((field) => (
                <label key={field}>
                  {field} (%)
                  <input
                    type="number"
                    min={field === "left" || field === "top" ? 0 : 1}
                    max="100"
                    disabled={disabled}
                    value={Math.round(crop[field])}
                    onChange={(e) => updateCrop(field, Number(e.target.value))}
                  />
                </label>
              ))}
            </div>
          </details>
        </>
      ) : (
        !loading && (
          <div className="reader-empty">
            <svg viewBox="0 0 300 120" aria-hidden="true">
              <g fill="none" stroke="currentColor" strokeWidth="1.5">
                <path d="M50 15h200v90H50zM50 75h200M170 75v30M210 75v30M75 40h70M75 50h110" />
              </g>
            </svg>
            <p>Choose a clear drawing, or try the synthetic sample.</p>
          </div>
        )
      )}
      <div className="recognize-bar">
        <label>
          Text language
          <select
            disabled={disabled}
            value={language}
            onChange={(e) => {
              invalidate();
              setLanguage(e.target.value);
            }}
          >
            <option value="eng">English</option>
            <option value="chi_sim">English + Simplified Chinese</option>
          </select>
        </label>
        <button
          className="button primary"
          disabled={!drawing || disabled}
          onClick={read}
        >
          Read text →
        </button>
      </div>
      {busy && (
        <div className="reader-progress" role="status">
          <span>{progress.message}</span>
          <progress
            aria-label="Recognition progress"
            value={progress.value}
            max={1}
          />
          <button className="text-button" onClick={cancel}>
            Cancel
          </button>
        </div>
      )}
      {error && (
        <p className="notice error" role="alert">
          {error}
        </p>
      )}
      {text && (
        <details className="source-text" open>
          <summary>Recognized source text</summary>
          <pre>{text}</pre>
        </details>
      )}
      <p className="hint reader-tip">
        Recognition reads this crop on this page. Other PDF sheets are not
        included automatically.
      </p>
    </section>
  );
}
