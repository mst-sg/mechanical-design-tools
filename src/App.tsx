import { DrawingToBom } from "./DrawTool";
import { BomCompare } from "./CompareTool";
export function App({ path }: { path: string }) {
  const drawing = path.endsWith("/drawing-to-bom"),
    compare = path.endsWith("/bom-compare");
  return (
    <>
      <a className="skip-link" href="#main">
        Skip to tool
      </a>
      <header className="site-header">
        <div className="shell masthead">
          <a className="brand" href="https://mst-us.ai/" aria-label="MST home">
            MST<span>ENGINEERING INTELLIGENCE</span>
          </a>
          <nav aria-label="Site navigation">
            <a href="https://mst-us.ai/product/">Product</a>
            <a href="https://mst-us.ai/news/">News</a>
            <details>
              <summary>
                Free Tools <span aria-hidden="true">⌄</span>
              </summary>
              <div className="tool-menu">
                <a href="/tools/drawing-to-bom/">Drawing to BOM</a>
                <a href="/tools/bom-compare/">BOM Compare</a>
                <a href="/tools/">All free tools</a>
              </div>
            </details>
            <a className="support-link" href="https://mst-us.ai/research/">
              Support
            </a>
            <a
              className="github-link"
              href="https://github.com/mst-sg/mechanical-design-tools"
              target="_blank"
              rel="noopener"
            >
              GitHub ↗
            </a>
          </nav>
        </div>
      </header>
      <main id="main" className="shell">
        <div className="page-title">
          <div>
            <a className="breadcrumb" href="/tools/">
              FREE TOOLS
            </a>
            <h1>
              {drawing
                ? "Drawing to BOM"
                : compare
                  ? "BOM Compare"
                  : "Small tools. Useful engineering work."}
            </h1>
            <p>
              {drawing
                ? "Turn a drawing’s parts table into an editable spreadsheet."
                : compare
                  ? "See what changed between two bills of materials."
                  : "Extract a parts list. Check a revision. Get back to designing."}
            </p>
          </div>
          <span className="local-note">
            <span aria-hidden="true">●</span> Runs on your device
            <br />
            <small>No sign-in. No file upload.</small>
          </span>
        </div>
        {drawing ? (
          <DrawingToBom />
        ) : compare ? (
          <BomCompare />
        ) : (
          <ToolDirectory />
        )}
      </main>
      <footer className="shell footer">
        <div>
          <strong>MST Open Tools</strong>
          <p>
            Your selected files stay in browser memory. Refreshing clears them.
            Tool assets load from this website; no document content is sent to a
            server.
          </p>
        </div>
        <div>
          <a
            href="https://github.com/mst-sg/mechanical-design-tools"
            target="_blank"
            rel="noopener"
          >
            Source code & documentation ↗
          </a>
          <a href="https://mst-us.ai/contact/?intent=partner#partnerships">
            Build with MST →
          </a>
          <a href="/tools/licenses.html">Open-source licenses</a>
        </div>
      </footer>
    </>
  );
}
function ToolDirectory() {
  return (
    <>
      <div className="directory">
        <a className="tool-entry" href="/tools/drawing-to-bom/">
          <span className="tool-drawing" aria-hidden="true">
            <svg viewBox="0 0 380 170">
              <g fill="none" stroke="currentColor" strokeWidth="2">
                <path d="M35 110V45h70l35 30v65H70zM35 45l35 30h70M70 75v65" />
                <circle cx="102" cy="108" r="12" />
                <path d="M175 85h30m-9-7 9 7-9 7M235 35h120v110H235zM235 65h120M235 95h120M235 120h120M273 35v110" />
              </g>
            </svg>
          </span>
          <span className="eyebrow">DRAWING → SPREADSHEET</span>
          <h2>
            Drawing to BOM <span>↗</span>
          </h2>
          <p>
            Read a printed BOM from a PNG, JPEG or PDF. Check the rows, make
            corrections and export CSV.
          </p>
          <strong>Open tool →</strong>
        </a>
        <a className="tool-entry" href="/tools/bom-compare/">
          <span className="tool-drawing" aria-hidden="true">
            <svg viewBox="0 0 380 170">
              <g fill="none" stroke="currentColor" strokeWidth="2">
                <path d="M45 30h120v110H45zM215 30h120v110H215zM45 58h120M45 88h120M45 116h120M215 58h120M215 88h120M215 116h120M177 85h26m-8-7 8 7-8 7" />
                <path stroke="#ad4f27" d="M228 72h90M228 102h90" />
              </g>
            </svg>
          </span>
          <span className="eyebrow">REVISION A → REVISION B</span>
          <h2>
            BOM Compare <span>↗</span>
          </h2>
          <p>
            Compare two CSVs by part number. Find added and removed parts,
            quantity changes and material updates.
          </p>
          <strong>Open tool →</strong>
        </a>
      </div>
      <section className="guide">
        <h2>More drawing tools</h2>
        <div className="related-links">
          <a href="https://mst-us.ai/drawingdiff/diff">Drawing comparison ↗</a>
          <a href="https://mst-us.ai/drawingdiff/clean">Watermark remover ↗</a>
        </div>
        <p>
          These existing DrawingDiff services have separate processing and usage
          terms.
        </p>
      </section>
      <section className="guide">
        <h2>Open code, online tools</h2>
        <p>
          Use these tools here, or inspect and adapt the MIT-licensed source on
          GitHub. Examples use synthetic engineering data. Suggestions for a
          useful mechanical design tool are welcome in the repository.
        </p>
      </section>
    </>
  );
}
