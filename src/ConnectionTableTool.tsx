import { useRef, useState } from "react";
import { downloadCsv, parseCsv } from "./csv";
import { readUtf8 } from "./text-file";
import { csvRecordRange } from "./model-check";
import { startUsage } from "./usage";
import { checkConnections, connectionInput, connectionFields, connectionReportCsv, connectionSamples, fieldLabels, sourceLabels, type ConnectionInput, type ConnectionReport, type ConnectionSource } from "./connection-check";

const sides: ConnectionSource[] = ["connections", "tags", "bom"];
const empty = () => ({ connections: connectionInput(), tags: connectionInput(), bom: connectionInput() });
export function ConnectionTableTool() {
  const [inputs, setInputs] = useState<Record<ConnectionSource, ConnectionInput>>(empty);
  const [result, setResult] = useState<ConnectionReport | null>(null), [error, setError] = useState("");
  const [busy, setBusy] = useState(false), [sample, setSample] = useState(false);
  const refs = useRef<Partial<Record<ConnectionSource, HTMLTextAreaElement | null>>>({});
  function invalidate() { setResult(null); setError(""); }
  function change(side: ConnectionSource, text: string) {
    setInputs((p) => ({ ...p, [side]: connectionInput(text) })); invalidate(); setSample(false);
  }
  function loadSample(corrected = false) {
    setInputs({ connections: connectionInput(corrected ? connectionSamples.corrected : connectionSamples.connections), tags: connectionInput(connectionSamples.tags), bom: connectionInput(corrected ? connectionSamples.correctedBom : connectionSamples.bom) });
    invalidate(); setSample(true);
  }
  async function choose(side: ConnectionSource, file: File) {
    setBusy(true); invalidate();
    // Remove the replaced input immediately so a rejected file cannot leave a stale value behind.
    change(side, "");
    try { change(side, await readUtf8(file)); }
    catch (e) { setError(e instanceof Error ? e.message : "The CSV could not be read."); }
    finally { setBusy(false); }
  }
  function run() {
    const usage = startUsage(sample ? "sample" : "provided"); invalidate();
    try { setResult(checkConnections(inputs)); usage.complete(); }
    catch (e) { setError(e instanceof Error ? e.message : "The check could not finish."); }
  }
  function locate(side: ConnectionSource, record: number) {
    const el = refs.current[side]; if (!el) return;
    const range = csvRecordRange(el.value, record); el.focus();
    if (range) { el.setSelectionRange(...range); el.scrollTop = el.value.slice(0, range[0]).split("\n").length * 22 - 44; }
    el.scrollIntoView({ block: "center", behavior: "smooth" });
  }
  return <>
    <div className="compare-toolbar"><p>Reconcile a from/to table with reviewed P&amp;ID tags and optional BOM assignments. Export the records that need attention.</p><div className="related-links"><button className="button secondary" onClick={() => loadSample()} disabled={busy}>Try faulty sample</button><button className="text-button" onClick={() => loadSample(true)} disabled={busy}>Load corrected sample</button></div></div>
    <div className="revision-grid connection-inputs">{sides.map((side, i) => {
      const input = inputs[side]; let headers: string[] = []; let parseError = "";
      try { headers = parseCsv(input.text)[0] ?? []; } catch (e) { parseError = e instanceof Error ? e.message : "Invalid CSV"; }
      return <section className="panel revision" key={side} aria-labelledby={`${side}-connection-title`}>
        <h2 id={`${side}-connection-title`}><span className="step">0{i + 1}</span> {sourceLabels[side]}{side === "bom" && <small className="hint"> optional</small>}</h2>
        <label className="file-picker compact-picker">Choose CSV<input type="file" accept=".csv,.tsv,.txt" aria-label={`${sourceLabels[side]} CSV file`} disabled={busy} onChange={(e) => { const f = e.currentTarget.files?.[0]; e.currentTarget.value = ""; if (f) void choose(side, f); }} /><span>UTF-8 · up to 4 MB</span></label>
        <label className="paste-label">Or paste CSV<textarea ref={(el) => { refs.current[side] = el; }} aria-label={`${sourceLabels[side]} CSV text`} value={input.text} rows={7} spellCheck={false} disabled={busy} onChange={(e) => change(side, e.target.value)} /></label>
        {side === "tags" && <p className="hint">One reviewed row per tag. Repeated printed occurrences must be resolved before building this registry.</p>}
        {side === "bom" && <p className="hint">Use explicit Tag → Part number assignments. Boundaries or instruments outside the BOM need a scope decision.</p>}
        {parseError && <p role="alert" className="notice error">{parseError}</p>}
        {headers.length > 0 && <details open><summary>Map {sourceLabels[side]} columns</summary><div className="column-mapping">{connectionFields[side].map((field) => <label key={field}>{fieldLabels[field]}{field === "id" ? " (optional)" : " *"}<select aria-label={`${sourceLabels[side]} ${fieldLabels[field]} column`} value={input.map[field]} disabled={busy} onChange={(e) => { const n = Number(e.target.value); setInputs((p) => ({ ...p, [side]: { ...p[side], map: { ...p[side].map, [field]: n } } })); invalidate(); setSample(false); }}><option value={-1}>{field === "id" ? "Not supplied" : "Choose column"}</option>{headers.map((h, n) => <option key={n} value={n}>{n + 1}. {h || "(blank header)"}</option>)}</select></label>)}</div></details>}
      </section>;
    })}</div>
    <div className="compare-action"><p className="hint">Exact tags after trimming outer spaces. Case and leading zeros are preserved. Endpoint order is retained; flow direction is not inferred.</p><button className="text-button" disabled={busy} onClick={() => { setInputs(empty()); invalidate(); setSample(false); }}>Clear inputs</button><button className="button primary" disabled={busy || !inputs.connections.text.trim() || !inputs.tags.text.trim()} onClick={run}>{busy ? "Reading CSV…" : "Check connection table →"}</button></div>
    {error && <p role="alert" className="notice error">{error}</p>}
    {result && <section className="panel diff-results connection-results" aria-labelledby="connection-results-title"><div className="section-heading"><h2 id="connection-results-title">Connection review</h2><button className="button secondary" onClick={() => downloadCsv(connectionReportCsv(result), "connection-review.csv")}>Export connection review ↓</button></div>
      <p role="status">{result.connections} connection records · {result.tags} reviewed tags · {result.findings.length} review items. {result.bomChecked ? "BOM assignments checked." : "BOM assignments not checked."}</p>
      {result.findings.length ? <><p className="hint">Record numbers count parsed CSV records, with the header as 1. {result.findings.length > 500 ? "Showing the first 500 findings; export includes every finding." : "Select a record to inspect its input."}</p><div className="table-scroll" role="region" aria-label="Connection review table" tabIndex={0}><table><thead><tr><th>Source record</th><th>Connection / tag</th><th>Check</th><th>Finding</th></tr></thead><tbody>{result.findings.slice(0, 500).map((r, i) => <tr key={i}><td><button className="text-button" onClick={() => locate(r.source, r.row)}>{sourceLabels[r.source]} record {r.row}</button></td><td>{r.id && <strong>{r.id}<br /></strong>}{r.from || r.to ? `${r.from || "(missing)"} → ${r.to || "(missing)"}` : r.tag || "(missing tag)"}</td><td>{r.code}</td><td>{r.detail}</td></tr>)}</tbody></table></div></> : <p>No discrepancies found in the supplied lists.</p>}
      <p className="hint">These are list-consistency checks. They do not verify the drawing’s actual connectivity, physical ports, component suitability or engineering approval.</p>
    </section>}
    <section className="guide"><h2>Check the records, then resolve the engineering meaning</h2><p>Repeated tag pairs may describe parallel lines. An unused tag may be intentionally outside the table. Review each finding against the approved drawing and scope.</p><div className="related-links"><a href="/tools/handbook/#connections">Worked exercise and sample files →</a><a href="/how-to-read-a-pid/#connection-table-check">How to prepare a P&amp;ID connection table</a><a href="/tools/bom-model-check/">Next: check BOM model files</a></div></section>
  </>;
}
