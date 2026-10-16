import type { SubmissionManifest } from "./submission-types";
import { submissionLimits } from "./submission-types";

export const sgSubmissionTools = [
  "ai-pid-feasibility-checker",
  "bom-rfq-normalizer",
  "gds-handoff-manifest",
  "mpw-alternative-route-finder",
  "mpw-node-selection-advisor",
  "mpw-procurement-timeline",
  "mpw-shuttle-finder",
  "obsolete-parts-rfq-cleaner",
  "package-selector",
  "pdk-checklist",
  "pid-bom-checker",
  "pid-tag-parser",
  "uhp-gas-stick-checklist",
  "mpw-estimator",
  "mpw-planner",
  "mpw-readiness-checker",
  "mpw-rfq-pack",
  "pid-assembly-intake",
  "report-revision-check",
  "mpw-quote-compare",
  "pdk-environment-check",
  "verification-log-review",
] as const;
export const sgPageLanguages = ["en", "zh-CN", "es", "ar", "ja"] as const;
export type SgSubmissionManifest = Omit<SubmissionManifest, "v" | "tool"> & {
  v: 2;
  tool: (typeof sgSubmissionTools)[number];
  pageLanguage: (typeof sgPageLanguages)[number];
};
export type RetainedManifest = SubmissionManifest | SgSubmissionManifest;
export function sgSubmissionLimits(tool: SgSubmissionManifest["tool"]) {
  return {
    ...submissionLimits,
    files: 3,
    // Existing log inputs allow one million characters; keep full UTF-8 text
    // and findings rather than silently dropping their content.
    jsonBytes: 16 * 1024 * 1024,
    // Preserve the existing report checker: one layout plus two 128 KB records.
    ...(tool === "report-revision-check"
      ? { fileBytes: 100_000_000, totalBytes: 100_256_000 }
      : {}),
  };
}
