import type { BomRow, Crop } from "./types";
export type JobState =
  | "uploading"
  | "queued"
  | "processing"
  | "succeeded"
  | "empty"
  | "failed"
  | "timed_out"
  | "cancelled";
export type JobPhase =
  | "uploading"
  | "queued"
  | "rendering"
  | "loading_model"
  | "recognizing"
  | "finished";
export type JobOptions = {
  page: number;
  crop: Crop;
  language: "eng" | "chi_sim";
  mode: "sample" | "provided";
  traffic: "test" | "browser";
};
export type JobAccess = { id: string; token: string };
export type JobSnapshot = {
  id: string;
  state: JobState;
  phase: JobPhase;
  progress: number;
  createdAt: number;
  expiresAt: number;
  errorCode: string | null;
  message: string;
};
export type RecognitionEngine = {
  name: string;
  version: string;
  model: string;
  device: string;
};
export type UploadContext = {
  visitorId: string;
  filename: string;
  contactEmail: string;
  referrerHost: string;
};
export type JobResult = {
  rows: BomRow[];
  text: string;
  message: string;
  engine?: RecognitionEngine;
};
export const terminal = (state: JobState) =>
  ["succeeded", "empty", "failed", "timed_out", "cancelled"].includes(state);
