export const submissionTools = [
  "drawing-to-bom",
  "bom-compare",
  "bom-check",
  "drawing-register-compare",
  "connection-table-check",
  "line-list-check",
  "bom-model-check",
  "delivery-package-check",
  "pid-tag-check",
  "title-block-reader",
] as const;
export type SubmissionTool = (typeof submissionTools)[number];
export const submissionLimits = {
  files: 32,
  fileBytes: 25 * 1024 * 1024,
  totalBytes: 100 * 1024 * 1024,
  jsonBytes: 2 * 1024 * 1024,
};
export const sourceLabels = [
  "direct",
  "internal",
  "google",
  "bing",
  "github",
  "ai",
  "social",
  "email",
  "campaign",
  "referral",
] as const;
export type SubmissionManifest = {
  v: 1;
  tool: SubmissionTool;
  mode: "sample" | "provided" | "default";
  traffic: "test" | "browser";
  visitorId: string;
  contactEmail: string;
  source: (typeof sourceLabels)[number];
  inputs: unknown;
  result: unknown;
  files: {
    role: string;
    name: string;
    relativePath: string;
    size: number;
    sha256: string;
  }[];
};
