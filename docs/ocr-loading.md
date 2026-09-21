# Issue 11 — recover a stalled OCR component download

## Evidence and scope

Two public browser runs of 0.2.2 each passed 25 cases and timed out once in mobile Chromium. The cases differed (P&ID sample and title-block reading), but both traces stopped on the same core JavaScript request before OCR produced any result. Local and Linux CI recognition passed. No conclusion about the origin/CDN/client connection is established by this alone.

The installed Tesseract browser loader selects a supported core and loads it with synchronous `importScripts`, which gives our caller no download progress or per-request cancellation. Preload the same selected, same-origin core through a cancellable fetch before starting the worker. Bound inactive downloads, retry once, and retain the existing review/cancellation UI. Keep default HTTP cache semantics; do not persist documents or add external services. An explicit core URL ensures the worker uses the component that was checked. The worker can still revalidate that URL under normal HTTP caching rules, so preloading is bounded recovery for the initial download, not a guarantee that every subsequent network operation is instantaneous.

This adds recovery around network loading, not a recognition algorithm or accuracy change. Core selection follows the installed library's relaxed-SIMD/SIMD/baseline LSTM support checks. Pin the existing feature-detection dependency directly and include its license. Do not change CSP, CDN security or network settings.

## Verification contract

- Existing real image/PDF OCR, changed-input examples, review gates, cancellation, CSV outputs and no-upload checks remain mandatory across all three browser projects.
- Inject one stalled core request: show retry feedback, recover from the next response and produce actual expected tags within the existing 60-second result budget.
- Inject repeated network failure: stop after two attempts, retain the drawing and offer a usable retry through Read text.
- Cancel an in-progress preload: abort without starting a retry; the source remains and a later recognition succeeds.
- Unit tests cover retry bounds, cancellation and body-read inactivity, using short test-specific durations. The application uses a 12-second inactivity limit; this resets while bytes arrive. Existing outer recognition and E2E budgets are unchanged.
- Preserve all original public failures. Publish from exact successful main CI and rerun public flows; report any residual latency rather than treating a retry as proof of universal speed.

Main-agent review; private assembly technology is outside this open utility's scope.
