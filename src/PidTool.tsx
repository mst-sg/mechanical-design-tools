import { useState } from "react";
import { DrawingReader, type ReadSheet } from "./DrawingReader";
import {
  compareTags,
  defaultPrefixes,
  suggestTags,
  tagList,
  type TagResult,
} from "./pid-tags";
import { downloadCsv, toCsv } from "./csv";
import { readUtf8 } from "./text-file";
const sample = {
  url: "/tools/samples/pid-tags.png",
  name: "Synthetic pump loop P&ID.png",
  crop: { left: 0, top: 0, width: 100, height: 100 },
};
export function PidTool() {
  const [prefixes, setPrefixes] = useState(defaultPrefixes),
    [sheet, setSheet] = useState<ReadSheet | null>(null);
  const [drawing, setDrawing] = useState(""),
    [reference, setReference] = useState(""),
    [reviewed, setReviewed] = useState(false);
  const [result, setResult] = useState<TagResult[] | null>(null),
    [error, setError] = useState(""),
    [note, setNote] = useState("");
  const [filter, setFilter] = useState("All"),
    [loading, setLoading] = useState(false);
  function invalidate() {
    setSheet(null);
    setDrawing("");
    setReviewed(false);
    setResult(null);
    setError("");
    setNote("");
  }
  function receive(next: ReadSheet) {
    setSheet(next);
    setResult(null);
    setReviewed(false);
    setError("");
    try {
      const tags = suggestTags(next.text, prefixes);
      setDrawing(tags.join("\n"));
      setNote(
        tags.length
          ? `${tags.length} tag occurrences suggested. Check each against the source and add any missed tags.`
          : "No matching printed tags found. Check the prefixes or crop, or enter the visible tags manually.",
      );
    } catch (e) {
      setDrawing("");
      setError(e instanceof Error ? e.message : "Check the prefixes.");
    }
  }
  function run() {
    setError("");
    setResult(null);
    if (!reviewed) {
      setError("Review the drawing tags before comparing.");
      return;
    }
    try {
      setResult(compareTags(tagList(drawing), tagList(reference)));
      setFilter("All");
    } catch (e) {
      setError(
        e instanceof Error ? e.message : "The tag lists could not be compared.",
      );
    }
  }
  const visible =
    result?.filter((r) => filter === "All" || r.status === filter) || [];
  return (
    <>
      <div className="compare-toolbar">
        <p>
          First visit? Choose <strong>Try a sample</strong>, then{" "}
          <strong>Read text</strong>. Review the tags and compare with the
          sample reference.
        </p>
        <a className="example-jump" href="#pid-example">
          See the worked example ↓
        </a>
      </div>
      <div className="workspace">
        <div className="reader-stack">
          <div className="panel">
            <label className="field-label">
              Prefixes to look for
              <input
                aria-describedby="prefix-help"
                value={prefixes}
                onChange={(e) => {
                  setPrefixes(e.target.value);
                  setDrawing("");
                  setReviewed(false);
                  setResult(null);
                  setError("");
                  setNote(
                    "Read the drawing again, or recheck the current source with these prefixes.",
                  );
                }}
              />
            </label>
            <p className="hint" id="prefix-help">
              Comma-separated letters, for example P, PT, FT, TK. Tags such as
              PT-101 or P-002A are supported.
            </p>
            {sheet && (
              <button className="text-button" onClick={() => receive(sheet)}>
                Recheck recognized text
              </button>
            )}
          </div>
          <DrawingReader
            sample={sample}
            recognitionMode="tags"
            onResult={receive}
            onInvalidate={invalidate}
          />
        </div>
        <section className="panel" aria-labelledby="tag-review">
          <h2 id="tag-review">
            <span className="step">02</span> Review and compare tags
          </h2>
          {note && (
            <p className="notice" role="status">
              {note}
            </p>
          )}
          <label className="field-label">
            Drawing tags
            <textarea
              aria-label="Drawing tags"
              rows={7}
              value={drawing}
              spellCheck={false}
              placeholder="PT-101&#10;P-002A"
              onChange={(e) => {
                setDrawing(e.target.value);
                setReviewed(false);
                setResult(null);
              }}
            />
            <span className="hint">
              One occurrence per line. Correct OCR and add missed tags. You can
              also paste a list without using OCR.
            </span>
          </label>
          <label className="review-check">
            <input
              type="checkbox"
              checked={reviewed}
              disabled={!drawing.trim()}
              onChange={(e) => {
                setReviewed(e.target.checked);
                setResult(null);
              }}
            />{" "}
            I checked the drawing tags against the source.
          </label>
          <label className="field-label">
            Reference tags
            <textarea
              aria-label="Reference tags"
              rows={7}
              value={reference}
              spellCheck={false}
              placeholder="Tag,Description&#10;PT-101,Pressure transmitter"
              disabled={loading}
              onChange={(e) => {
                setReference(e.target.value);
                setResult(null);
              }}
            />
            <span className="hint">
              One tag per line, or a UTF-8 CSV with one Tag column. Matching
              ignores letter case and spaces around hyphens; leading zeros are
              kept.
            </span>
          </label>
          <label className="file-picker compact-picker">
            Choose reference CSV
            <input
              type="file"
              accept=".csv,.tsv,.txt"
              aria-label="Reference tag file"
              disabled={loading}
              onChange={async (e) => {
                const f = e.currentTarget.files?.[0];
                e.currentTarget.value = "";
                if (!f) return;
                setLoading(true);
                setResult(null);
                setError("");
                try {
                  setReference(await readUtf8(f, 1_000_000));
                } catch (err) {
                  setError(
                    err instanceof Error
                      ? err.message
                      : "The list could not be read.",
                  );
                } finally {
                  setLoading(false);
                }
              }}
            />
            <span>Up to 1 MB</span>
          </label>
          <div className="row-actions">
            <button
              className="button primary"
              onClick={run}
              disabled={
                !reviewed || !drawing.trim() || !reference.trim() || loading
              }
            >
              Compare tags →
            </button>
            <button
              className="text-button"
              onClick={() => {
                setReference(
                  "Tag,Description\nP-101,Feed pump\nPT-101,Pressure transmitter\nFT-102,Flow transmitter\nTT-103,Temperature transmitter",
                );
                setResult(null);
              }}
              disabled={loading}
            >
              Use sample reference
            </button>
          </div>
          {error && (
            <p className="notice error" role="alert">
              {error}
            </p>
          )}
        </section>
      </div>
      {result && (
        <section className="panel register" aria-labelledby="tag-results">
          <div className="section-heading">
            <h2 id="tag-results">Tag reconciliation</h2>
            <button
              className="button secondary"
              onClick={() =>
                downloadCsv(
                  toCsv([
                    [
                      "Tag",
                      "Status",
                      "Drawing occurrences",
                      "Reference occurrences",
                    ],
                    ...result.map((r) => [
                      r.tag,
                      r.status,
                      r.drawingCount,
                      r.listCount,
                    ]),
                  ]),
                  "pid-tag-comparison.csv",
                )
              }
            >
              Export tag comparison ↓
            </button>
          </div>
          <div className="status-filters">
            {["All", "Matched", "Only in drawing", "Only in list"].map((s) => (
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
          <p className="hint" role="status">
            {result.filter((r) => r.drawingCount > 1 || r.listCount > 1).length}{" "}
            tags occur more than once. Repeated symbols may be intentional;
            occurrence counts are not equipment quantities.
          </p>
          <div
            className="table-scroll"
            role="region"
            aria-label="Tag comparison table"
            tabIndex={0}
          >
            <table>
              <thead>
                <tr>
                  <th>Tag</th>
                  <th>Result</th>
                  <th>On drawing</th>
                  <th>In reference</th>
                </tr>
              </thead>
              <tbody>
                {visible.slice(0, 500).map((r) => (
                  <tr key={r.tag}>
                    <th scope="row">{r.tag}</th>
                    <td>
                      <span
                        className={`status ${r.status === "Matched" ? "unchanged" : "changed"}`}
                      >
                        {r.status}
                      </span>
                    </td>
                    <td>{r.drawingCount}</td>
                    <td>{r.listCount}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          {visible.length > 500 && (
            <p className="hint">
              Showing the first 500 results. The export includes all{" "}
              {result.length} tags.
            </p>
          )}
        </section>
      )}
      <section
        className="guide worked-example"
        id="pid-example"
        aria-labelledby="pid-example-title"
      >
        <span className="eyebrow">SYNTHETIC WORKED EXAMPLE</span>
        <h2 id="pid-example-title">
          Does this P&ID agree with the instrument list?
        </h2>
        <div className="example-grid">
          <figure className="example-figure">
            <a href="/tools/samples/pid-tags.png">
              <img
                src="/tools/samples/pid-tags.svg"
                width="1500"
                height="850"
                loading="lazy"
                alt="Synthetic pump loop showing P-101, FT-102, XV-104 and two printed occurrences of PT-101."
              />
            </a>
            <figcaption>
              Use the actual sample drawing in the reader above. Open the image
              to inspect it at full size.
            </figcaption>
          </figure>
          <div className="example-findings">
            <h3>Expected findings after source review</h3>
            <dl>
              <div>
                <dt>Only in drawing</dt>
                <dd>
                  <strong>XV-104</strong> — check whether the reference list is
                  missing an entry.
                </dd>
              </div>
              <div>
                <dt>Only in list</dt>
                <dd>
                  <strong>TT-103</strong> — check whether it belongs on this
                  drawing or a different sheet.
                </dd>
              </div>
              <div>
                <dt>On both lists</dt>
                <dd>
                  <strong>P-101, PT-101, FT-102</strong>. PT-101 appears twice
                  on the drawing and once in the list.
                </dd>
              </div>
            </dl>
          </div>
        </div>
        <ol>
          <li>
            <strong>Read the sample.</strong> Choose Try a sample, then Read
            text. Check the suggested tags against the drawing; correct or add
            any missed occurrences.
          </li>
          <li>
            <strong>Confirm and compare.</strong> Tick the source-review
            checkbox, choose Use sample reference, then Compare tags.
          </li>
          <li>
            <strong>Review the differences.</strong> Check the two unmatched
            tags and the repeated PT-101, then export the comparison as CSV.
          </li>
        </ol>
        <div className="related-links">
          <a href="/tools/samples/pid-tags.png" download>
            Download sample P&ID ↓
          </a>
          <a href="/tools/samples/pid-reference.csv" download>
            Download reference CSV ↓
          </a>
        </div>
        <h3>What does a match tell you?</h3>
        <p>
          Matched means the identifier is present on both reviewed lists, even
          when occurrence counts differ. A repeated printed tag is not
          necessarily a duplicate piece of equipment. Unmatched tags are review
          candidates; this tool does not validate connections, process safety,
          equipment counts or physical layout.
        </p>
        <p>
          For your own drawing, set the prefixes used by your project and select
          the required page and crop. OCR can miss tags inside symbols or with
          split labels. Check every suggestion and add missing tags before
          comparing.
        </p>
        <div className="related-links">
          <a href="https://mst-us.ai/pid-understanding-is-not-ocr/">
            Why reading tags is only part of understanding a P&ID →
          </a>
          <a href="/tools/title-block-reader/">
            Read drawing numbers and revisions →
          </a>
        </div>
      </section>
    </>
  );
}
