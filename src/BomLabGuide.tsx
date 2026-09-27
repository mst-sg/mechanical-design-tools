export function BomLabGuide() {
  return (
    <section className="guide" id="drawing-bom-lab">
      <h2>Read a printed parts table</h2>
      <p>
        Choose a page, crop the table with its headers, then extract, check and
        export the rows. This tool reads an existing parts list; it does not
        infer parts from drawing geometry.
      </p>
      <div className="related-links">
        <a href="/tools/handbook/#drawing-bom">
          Step-by-step guide and sample files →
        </a>
        <a href="/tools/bom-compare/">Compare two BOM revisions →</a>
      </div>
    </section>
  );
}
