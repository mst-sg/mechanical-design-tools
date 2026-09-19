import { useState } from "react";
import { DrawingReader, type ReadSheet } from "./DrawingReader";
import {
  blankTitle,
  extractTitle,
  titleFields,
  titleLabels,
  type TitleValues,
} from "./title-block";
import { downloadCsv, toCsv } from "./csv";
type Entry = ReadSheet & { values: TitleValues };
const sample = {
  url: "/tools/samples/title-block.png",
  name: "Synthetic pump base drawing.png",
  crop: { left: 3, top: 38, width: 94, height: 59 },
};
export function TitleTool() {
  const [sheet, setSheet] = useState<ReadSheet | null>(null),
    [values, setValues] = useState(blankTitle),
    [entries, setEntries] = useState<Entry[]>([]);
  const [reviewed, setReviewed] = useState(false),
    [note, setNote] = useState("");
  function invalidate() {
    setSheet(null);
    setValues(blankTitle());
    setReviewed(false);
    setNote("");
  }
  function receive(next: ReadSheet) {
    const parsed = extractTitle(next.text);
    setSheet(next);
    setValues(parsed.values);
    setReviewed(false);
    const found = Object.values(parsed.values).filter(Boolean).length;
    setNote(
      found
        ? `${found} labelled fields found. Check the values against the drawing.${parsed.ambiguous.length ? " Repeated labels were left blank: " + parsed.ambiguous.map((f) => titleLabels[f]).join(", ") + "." : ""}`
        : "No recognizable title-block labels found. Try a closer crop, or enter values from the drawing.",
    );
  }
  function add() {
    if (!sheet || !reviewed || !values.drawingNumber.trim()) return;
    const entry = { ...sheet, values: { ...values } };
    setEntries((prev) =>
      prev.some((e) => e.sourceId === sheet.sourceId)
        ? prev.map((e) => (e.sourceId === sheet.sourceId ? entry : e))
        : [...prev, entry],
    );
    setNote(
      "Reviewed sheet saved in this browser session. Choose another file or PDF page to continue.",
    );
  }
  return (
    <>
      <div className="workspace">
        <DrawingReader
          sample={sample}
          queue
          onResult={receive}
          onInvalidate={invalidate}
        />
        <section className="panel" aria-labelledby="title-review">
          <h2 id="title-review">
            <span className="step">02</span> Review title-block fields
          </h2>
          <p className="hint section-intro">
            Read the source, check each value, then add this sheet to your
            register.
          </p>
          {note && (
            <p className="notice" role="status">
              {note}
            </p>
          )}
          <div className="field-grid">
            {titleFields.map((field) => (
              <label key={field}>
                {titleLabels[field]}
                {field === "drawingNumber" ? " *" : ""}
                <input
                  value={values[field]}
                  disabled={!sheet}
                  onChange={(e) => {
                    setValues((prev) => ({ ...prev, [field]: e.target.value }));
                    setReviewed(false);
                  }}
                />
              </label>
            ))}
          </div>
          <label className="review-check">
            <input
              type="checkbox"
              checked={reviewed}
              disabled={!sheet}
              onChange={(e) => setReviewed(e.target.checked)}
            />{" "}
            I checked these fields against the drawing.
          </label>
          <button
            className="button primary"
            disabled={!sheet || !reviewed || !values.drawingNumber.trim()}
            onClick={add}
          >
            {entries.some((e) => e.sourceId === sheet?.sourceId)
              ? "Update reviewed sheet"
              : "Add reviewed sheet"}{" "}
            →
          </button>
          <p className="hint reader-tip">
            Suggestions need visible labels such as Drawing No, Title and Rev
            with their values on the same line. Blank fields stay blank; other
            layouts can be entered manually.
          </p>
        </section>
      </div>
      <section className="panel register" aria-labelledby="register-title">
        <div className="section-heading">
          <h2 id="register-title">
            <span className="step">03</span> Drawing register{" "}
            <small>· {entries.length} sheets</small>
          </h2>
          <button
            className="button primary"
            disabled={!entries.length}
            onClick={() =>
              downloadCsv(
                toCsv([
                  [
                    "Source file",
                    "PDF page",
                    ...titleFields.map((f) => titleLabels[f]),
                  ],
                  ...entries.map((e) => [
                    e.file,
                    e.page,
                    ...titleFields.map((f) => e.values[f]),
                  ]),
                ]),
                "drawing-register.csv",
              )
            }
          >
            Export register ↓
          </button>
        </div>
        {entries.length ? (
          <div
            className="table-scroll"
            role="region"
            aria-label="Reviewed drawing register"
            tabIndex={0}
          >
            <table>
              <thead>
                <tr>
                  <th>Source</th>
                  {titleFields.map((f) => (
                    <th key={f}>{titleLabels[f]}</th>
                  ))}
                  <th>Action</th>
                </tr>
              </thead>
              <tbody>
                {entries.map((e) => (
                  <tr key={e.sourceId}>
                    <th scope="row">
                      {e.file}
                      <small className="source-page">Page {e.page}</small>
                    </th>
                    {titleFields.map((f) => (
                      <td key={f}>{e.values[f] || "—"}</td>
                    ))}
                    <td>
                      <button
                        className="text-button"
                        aria-label={`Remove ${e.values.drawingNumber}`}
                        onClick={() =>
                          setEntries((prev) =>
                            prev.filter((r) => r.sourceId !== e.sourceId),
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
        ) : (
          <p className="empty-small">
            Your reviewed sheets will appear here. Read a drawing to get
            started.
          </p>
        )}
        <p className="hint">
          Same filename can occur in different uploads. Source and PDF page are
          kept so you can review duplicate drawing numbers. Refreshing clears
          this register; export it before leaving.
        </p>
      </section>
      <section className="guide">
        <h2>Build a register from the drawings you have</h2>
        <ol>
          <li>
            <strong>Choose the sheet.</strong> Select up to 10 files and choose
            the required PDF page.
          </li>
          <li>
            <strong>Read and review.</strong> Crop around its title block, check
            source text and correct the fields.
          </li>
          <li>
            <strong>Add and export.</strong> Add each reviewed sheet, then
            download one CSV with its source filenames.
          </li>
        </ol>
        <div className="related-links">
          <a href="/tools/samples/title-block.png" download>
            Download sample drawing ↓
          </a>
          <a href="/tools/drawing-to-bom/">Extract a parts table →</a>
        </div>
        <p>
          Only printed title-block information is collected. A material in the
          title block does not describe every part in an assembly. OCR can
          misread revisions and drawing numbers; this register is not a document
          approval system.
        </p>
      </section>
    </>
  );
}
