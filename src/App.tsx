import { DrawingToBom } from "./DrawTool";
import { BomCompare } from "./CompareTool";
import { BomCheckTool } from "./BomCheckTool";
import { TitleTool } from "./TitleTool";
import { PidTool } from "./PidTool";
import { tools } from "./catalog";
import { useEffect, useState } from "react";
export function App({ path }: { path: string }) {
  const [ready, setReady] = useState(false);
  useEffect(() => setReady(true), []);
  const drawing = path.endsWith("/drawing-to-bom"),
    compare = path.endsWith("/bom-compare");
  const active = tools.find((t) => path.endsWith("/" + t.slug));
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
            <h1>{active?.name || "Small tools. Useful engineering work."}</h1>
            <p>
              {active?.subtitle ||
                "Extract a parts list. Review drawing data. Get back to designing."}
            </p>
          </div>
          <span className="local-note">
            <span aria-hidden="true">●</span> Runs on your device
            <br />
            <small>No sign-in. No file upload.</small>
          </span>
        </div>
        {active ? (
          <fieldset
            className="tool-body"
            disabled={!ready}
            aria-busy={!ready}
            aria-label={`${active.name} controls`}
          >
            {drawing ? (
              <DrawingToBom />
            ) : compare ? (
              <BomCompare />
            ) : active.slug === "bom-check" ? (
              <BomCheckTool />
            ) : active.slug === "title-block-reader" ? (
              <TitleTool />
            ) : (
              <PidTool />
            )}
          </fieldset>
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
        {tools.map((tool, index) => (
          <a
            className="tool-entry"
            href={`/tools/${tool.slug}/`}
            key={tool.slug}
          >
            <span className="tool-drawing" aria-hidden="true">
              <ToolSketch index={index} />
            </span>
            <span className="eyebrow">{tool.eyebrow}</span>
            <h2>
              {tool.name} <span>↗</span>
            </h2>
            <p>{tool.description}</p>
            <strong>Open tool →</strong>
          </a>
        ))}
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

function ToolSketch({ index }: { index: number }) {
  const paths = [
    "M35 110V45h70l35 30v65H70zM35 45l35 30h70M70 75v65M175 85h30m-9-7 9 7-9 7M235 35h120v110H235zM235 65h120M235 95h120M235 120h120M273 35v110",
    "M45 25h210v120H45zM45 58h210M45 88h210M45 118h210M88 25v120M172 25v120M278 77l19 19 42-46",
    "M45 30h120v110H45zM215 30h120v110H215zM45 58h120M45 88h120M45 116h120M215 58h120M215 88h120M215 116h120M177 85h26m-8-7 8 7-8 7",
    "M35 20h210v130H35zM35 105h210M118 105v45M180 105v45M60 45h90M60 58h120M266 55h80M266 77h80M266 99h80M266 121h50",
    "M30 85h70M140 85h85M275 85h70M120 65v-30M250 65v-30M90 115h60M220 115h60",
  ];
  return (
    <svg viewBox="0 0 380 170">
      <g fill="none" stroke="currentColor" strokeWidth="2">
        <path d={paths[index]} />
        {index === 4 && (
          <>
            <circle cx="120" cy="85" r="22" />
            <circle cx="250" cy="85" r="22" />
            <path stroke="#a63d1b" d="M305 127l12 12 27-27" />
          </>
        )}
      </g>
    </svg>
  );
}
