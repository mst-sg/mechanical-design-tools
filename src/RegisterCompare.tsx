import { startUsage, type UsageMode } from "./usage";
import { useRef, useState } from "react";
import { downloadCsv } from "./csv";
import { readUtf8 } from "./text-file";
import {
  compareRegisters,
  exportRegisterDiff,
  type RegisterDiff,
} from "./register-compare";

export function RegisterCompare() {
  const mode = useRef<UsageMode>("provided");
  const [inputs, setInputs] = useState(["", ""]);
  const [result, setResult] = useState<RegisterDiff[] | null>(null);
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);
  function change(i: number, text: string) {
    mode.current = "provided";
    setInputs((p) => p.map((v, n) => (n === i ? text : v)));
    setResult(null);
    setError("");
  }
  async function choose(i: number, file: File) {
    setLoading(true);
    setResult(null);
    setError("");
    try {
      change(i, await readUtf8(file));
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setLoading(false);
    }
  }
  async function sample() {
    setLoading(true);
    setResult(null);
    setError("");
    try {
      const texts = await Promise.all(
        ["a", "b"].map(async (rev) => {
          const r = await fetch(`/tools/samples/register-${rev}.csv`);
          if (!r.ok)
            throw new Error(
              "Sample unavailable. Download the template or try again.",
            );
          return r.text();
        }),
      );
      setInputs(texts);
      mode.current = "sample";
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setLoading(false);
    }
  }
  return (
    <>
      <div className="compare-toolbar">
        <p>
          Match drawing number and sheet exactly. Compare revision labels and
          titles.
        </p>
        <button
          className="button secondary"
          disabled={loading}
          onClick={sample}
        >
          Try sample registers
        </button>
      </div>
      <div className="revision-grid">
        {inputs.map((value, i) => (
          <section className="panel revision" key={i}>
            <h2>{i ? "After" : "Before"}</h2>
            <label className="file-picker">
              Choose {i ? "after" : "before"} CSV
              <input
                type="file"
                accept=".csv,.tsv,text/csv"
                disabled={loading}
                onChange={(e) => {
                  const f = e.target.files?.[0];
                  if (f) void choose(i, f);
                  e.target.value = "";
                }}
              />
            </label>
            <label>
              Paste {i ? "after" : "before"} register
              <textarea
                rows={8}
                value={value}
                disabled={loading}
                onChange={(e) => change(i, e.target.value)}
              />
            </label>
          </section>
        ))}
      </div>
      <p className="hint">
        Required headings: Drawing, Sheet, Revision, Title. Additional columns
        are not compared. Match is case-sensitive after trimming outer spaces.
        Sheet 01 and 1 remain different keys.
      </p>
      <button
        className="button primary"
        disabled={loading || inputs.some((v) => !v.trim())}
        onClick={() => {
          const usage = startUsage(mode.current);
          try {
            setResult(compareRegisters(inputs[0], inputs[1]));
            usage.complete();
            setError("");
          } catch (e) {
            setResult(null);
            setError((e as Error).message);
          }
        }}
      >
        Compare registers
      </button>
      {loading && <p role="status">Reading local inputs…</p>}
      {error && (
        <p role="alert" className="notice error">
          {error}
        </p>
      )}
      {!result && !error && (
        <p className="hint">
          Load two registers to see added, removed and changed sheets.
        </p>
      )}
      {result && (
        <section className="panel">
          <h2>Register differences</h2>
          <p role="status">
            {["Added", "Removed", "Changed", "Unchanged"]
              .map(
                (s) =>
                  `${result.filter((r) => r.status === s).length} ${s.toLowerCase()}`,
              )
              .join(" · ")}
          </p>
          <div
            className="table-scroll"
            tabIndex={0}
            role="region"
            aria-label="Drawing register comparison"
          >
            <table>
              <thead>
                <tr>
                  {[
                    "Drawing",
                    "Sheet",
                    "Status",
                    "Before revision",
                    "After revision",
                    "Before title",
                    "After title",
                  ].map((h) => (
                    <th key={h} scope="col">
                      {h}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {result.map((r) => (
                  <tr key={JSON.stringify([r.drawing, r.sheet])}>
                    <td>{r.drawing}</td>
                    <td>{r.sheet}</td>
                    <td>{r.status}</td>
                    <td>{r.before?.revision ?? "—"}</td>
                    <td>{r.after?.revision ?? "—"}</td>
                    <td>{r.before?.title ?? "—"}</td>
                    <td>{r.after?.title ?? "—"}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <button
            className="button primary"
            onClick={() =>
              downloadCsv(
                exportRegisterDiff(result),
                "drawing-register-diff.csv",
              )
            }
          >
            Export register differences
          </button>
        </section>
      )}
      <section className="guide">
        <h2>Catch a missed sheet before handoff</h2>
        <ol>
          <li>
            Export the reviewed register before and after the change. Record the
            same drawing-number and sheet conventions in both.
          </li>
          <li>
            Load the samples: expect one added sheet, one removed sheet, one
            changed revision and one unchanged sheet.
          </li>
          <li>
            Change the After revision for DRW-100 sheet 1 from B to A. Run
            again: it becomes unchanged.
          </li>
          <li>
            Duplicate a drawing/sheet row. Comparison stops until the duplicate
            is resolved.
          </li>
          <li>
            Export and review the listed changes against the released drawings.
          </li>
        </ol>
        <p>
          A revision label is compared as text. The tool cannot decide which
          revision is approved or newer, inspect geometry, or detect a changed
          drawing with an unchanged label.
        </p>
        <div className="related-links">
          <a href="/tools/samples/register-a.csv" download>
            Before template ↓
          </a>
          <a href="/tools/samples/register-b.csv" download>
            After template ↓
          </a>
          <a href="/tools/title-block-reader/">
            Build a register from drawing title blocks →
          </a>
          <a href="/tools/handbook/">Tool handbook →</a>
        </div>
      </section>
    </>
  );
}
