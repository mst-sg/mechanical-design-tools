export function BomLabGuide() {
  return (
    <section className="guide" id="drawing-bom-lab">
      <p className="eyebrow">WORKED TASK · ABOUT 15 MINUTES</p>
      <h2>One drawing, a checked BOM, and a revision review</h2>
      <p>
        A supplier sends a drawing with a printed parts table. You need a usable
        list and an explanation of what changed in the next revision. This
        synthetic bracket exercise follows the same five parts from the drawing
        into the comparison.
      </p>
      <div className="related-links">
        <a href="/tools/labs/drawing-bom/drawing-bom-lab.zip" download>
          Download the complete practice pack ↓
        </a>
        <a href="/tools/handbook/#drawing-bom">
          Open the step-by-step handbook →
        </a>
      </div>
      <ol>
        <li>
          <strong>Read the printed list.</strong> Select <em>Try a sample</em>{" "}
          above, then <em>Extract BOM</em>. The crop includes the five-row parts
          table. Compare every row with the drawing; the line drawing itself is
          not used to infer parts.
        </li>
        <li>
          <strong>Correct the transcription.</strong> Check PIN-020 uses a zero,
          SCR-M6 quantity is 4, and the bracket material is Aluminium 6061.
          Download the intentionally faulty CSV to practice these corrections
          and remove the accidental duplicate washer row in{" "}
          <a href="/tools/bom-check/">BOM Check</a>. Do not combine that
          duplicated record into eight washers.
        </li>
        <li>
          <strong>Save the reviewed baseline.</strong> Export your five rows.
          Compare values with{" "}
          <a href="/tools/labs/drawing-bom/revision-a-reviewed.csv" download>
            revision A
          </a>
          . There are 15 total individual pieces across the five lines; that sum
          is useful only because every row in this example counts pieces.
        </li>
        <li>
          <strong>Review revision B.</strong> In{" "}
          <a href="/tools/bom-compare/">BOM Compare</a>, use your exported A and
          the pack’s revision B. Map Part number, Quantity, Description and
          Material, then compare.
        </li>
      </ol>
      <figure>
        <img
          src="/tools/labs/drawing-bom/01-reviewed-bom.png"
          alt="Actual tool screenshot showing the five extracted and reviewed bracket BOM rows"
          style={{ width: "100%", height: "auto" }}
          loading="lazy"
        />
        <figcaption>
          Actual local sample run: review the five rows before exporting.
        </figcaption>
      </figure>
      <figure>
        <img
          src="/tools/labs/drawing-bom/02-revision-differences.png"
          alt="Actual comparison showing one added part, one removed part, two changes and two unchanged parts"
          style={{ width: "100%", height: "auto" }}
          loading="lazy"
        />
        <figcaption>
          Expected revision review using this pack’s A and B files.
        </figcaption>
      </figure>
      <div
        className="table-scroll"
        tabIndex={0}
        role="region"
        aria-label="Expected bracket revision findings"
      >
        <table>
          <thead>
            <tr>
              <th scope="col">Part</th>
              <th scope="col">Expected result</th>
              <th scope="col">Review action</th>
            </tr>
          </thead>
          <tbody>
            <tr>
              <td>SPC-006</td>
              <td>Added, quantity 2</td>
              <td>Check the new spacer requirement.</td>
            </tr>
            <tr>
              <td>WSH-M6</td>
              <td>Removed, previous quantity 4</td>
              <td>Confirm the washer was intentionally removed.</td>
            </tr>
            <tr>
              <td>PIN-020</td>
              <td>Steel → Stainless steel</td>
              <td>Review material suitability and purchasing specification.</td>
            </tr>
            <tr>
              <td>SCR-M6</td>
              <td>Quantity 4 → 6, delta +2</td>
              <td>Check the fastening change against the released drawing.</td>
            </tr>
            <tr>
              <td>BRK-100 and NUT-M6</td>
              <td>Unchanged</td>
              <td>Keep their quantities at 1 and 4.</td>
            </tr>
          </tbody>
        </table>
      </div>
      <p>
        <strong>Expected summary:</strong> 1 added, 1 removed, 2 changed, 2
        unchanged. Export the differences. A correct comparison describes the
        inputs; it does not approve the engineering change.
      </p>
      <div className="related-links">
        <a href="/tools/labs/drawing-bom/transcription-errors.csv" download>
          Faulty transcription ↓
        </a>
        <a href="/tools/labs/drawing-bom/revision-b.csv" download>
          Revision B ↓
        </a>
        <a href="/tools/labs/drawing-bom/expected-differences.csv" download>
          Expected differences ↓
        </a>
      </div>
      <details>
        <summary>My result does not match: what should I check?</summary>
        <p>
          If a pin appears as both added and removed, inspect O/0 and leading
          zeros. If the material change is absent, map the Material column.
          Duplicate part numbers must be resolved first. If all parts appear
          changed, check units, configuration and export scope before comparing.
          The earlier four-row BOM Compare sample is a separate exercise; use
          this pack’s files together.
        </p>
      </details>
      <p>
        <a href="/solidworks-bom-part-numbers-configurations/">
          Understand BOM configurations and part numbers →
        </a>
      </p>
    </section>
  );
}
