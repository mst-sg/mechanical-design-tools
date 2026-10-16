import {
  createContext,
  useContext,
  useRef,
  useState,
  type ReactNode,
} from "react";
import { newJob } from "./jobs";
import type { JobAccess } from "./job-types";
import {
  submissionLimits as limits,
  sourceLabels,
  type SubmissionManifest,
  type SubmissionTool,
} from "./submission-types";
import type { UsageMode } from "./usage";

export type Attachment = { file: File; role: string; relativePath?: string };
type Pending = {
  access: JobAccess;
  manifest: SubmissionManifest;
  files: Attachment[];
};
type Saved = { access: JobAccess; tool: SubmissionTool; createdAt: number };
const historyKey = "mst_private_submissions_v1";
function history(): Saved[] {
  try {
    const v = JSON.parse(localStorage.getItem(historyKey) || "[]");
    return Array.isArray(v)
      ? v
          .filter(
            (x) =>
              x &&
              /^[a-f0-9-]{36}$/.test(x.access?.id) &&
              /^[a-f0-9]{64}$/.test(x.access?.token) &&
              Number.isFinite(x.createdAt),
          )
          .slice(0, 100)
      : [];
  } catch {
    return [];
  }
}
function remember(value: Saved) {
  try {
    localStorage.setItem(
      historyKey,
      JSON.stringify(
        [
          value,
          ...history().filter((x) => x.access.id !== value.access.id),
        ].slice(0, 100),
      ),
    );
  } catch {
    /* The visible private receipt remains available. */
  }
}
export function submissionVisitorId() {
  try {
    const old = localStorage.getItem("mst_tools_visitor_v1");
    if (old && /^[a-f0-9-]{36}$/.test(old)) return old;
    const id = crypto.randomUUID();
    localStorage.setItem("mst_tools_visitor_v1", id);
    return id;
  } catch {
    return crypto.randomUUID();
  }
}
export function submissionSource(): SubmissionManifest["source"] {
  const query = new URL(location.href).searchParams;
  const forwarded = query.get("mst_source");
  if (sourceLabels.includes(forwarded as SubmissionManifest["source"]))
    return forwarded as SubmissionManifest["source"];
  const campaign = (query.get("utm_source") || "").toLowerCase();
  if (["google", "bing", "github"].includes(campaign))
    return campaign as SubmissionManifest["source"];
  if (["chatgpt", "chatgpt.com", "perplexity"].includes(campaign)) return "ai";
  if (campaign) return "campaign";
  let host = "";
  try {
    host = new URL(document.referrer).hostname;
  } catch {
    /* no referrer */
  }
  if (!host) return "direct";
  if (["mst-us.ai", "tools.mst-us.ai", "mst-sg.com"].includes(host))
    return "internal";
  if (/(^|\.)google\.(com|co\.uk|com\.sg|co\.jp|de|fr)$/.test(host))
    return "google";
  if (host === "bing.com" || host.endsWith(".bing.com")) return "bing";
  if (host === "github.com") return "github";
  if (
    [
      "chatgpt.com",
      "perplexity.ai",
      "claude.ai",
      "copilot.microsoft.com",
    ].includes(host)
  )
    return "ai";
  return "referral";
}
async function request(
  access: JobAccess,
  suffix: string,
  init: RequestInit = {},
) {
  const response = await fetch(
    `/tools-api/v1/submissions/${access.id}${suffix}`,
    {
      ...init,
      credentials: "omit",
      cache: "no-store",
      signal: AbortSignal.timeout(55000),
      headers: { Authorization: `Bearer ${access.token}`, ...init.headers },
    },
  );
  if (!response.ok) {
    const error = await response.json().catch(() => null);
    throw new Error(
      error?.message ||
        `The private record could not be saved (${response.status}).`,
    );
  }
  return response;
}
async function prepare(
  tool: SubmissionTool,
  inputs: unknown,
  result: unknown,
  files: Attachment[],
  mode: UsageMode,
): Promise<Pending> {
  if (
    files.length > limits.files ||
    files.some((f) => f.file.size > limits.fileBytes) ||
    files.reduce((n, f) => n + f.file.size, 0) > limits.totalBytes
  )
    throw new Error(
      "Choose at most 32 attachments, 25 MB each and 100 MB in total. No files were uploaded.",
    );
  const manifest: SubmissionManifest = {
    v: 1,
    tool,
    mode,
    traffic:
      new URL(location.href).searchParams.get("mst_analytics_test") === "1" ||
      navigator.webdriver
        ? "test"
        : "browser",
    visitorId: submissionVisitorId(),
    contactEmail: "",
    source: submissionSource(),
    inputs,
    result,
    files: [],
  };
  for (const attachment of files) {
    const digest = await crypto.subtle.digest(
      "SHA-256",
      await attachment.file.arrayBuffer(),
    );
    manifest.files.push({
      role: attachment.role,
      name: attachment.file.name,
      relativePath: attachment.relativePath || "",
      size: attachment.file.size,
      sha256: Array.from(new Uint8Array(digest), (n) =>
        n.toString(16).padStart(2, "0"),
      ).join(""),
    });
  }
  if (
    new TextEncoder().encode(JSON.stringify(manifest)).length > limits.jsonBytes
  )
    throw new Error(
      "The input and result exceed the 2 MB record limit. Reduce the data and run again. No files were uploaded.",
    );
  return { access: newJob(), manifest, files };
}
async function upload(pending: Pending) {
  const { access, manifest, files } = pending;
  remember({ access, tool: manifest.tool, createdAt: Date.now() });
  const snapshot = await (
    await request(access, "", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(manifest),
    })
  ).json();
  for (let slot = 0; slot < files.length; slot++) {
    if (
      snapshot.files?.find(
        (f: { slot: number; complete: boolean }) => f.slot === slot,
      )?.complete
    )
      continue;
    await request(access, `/files/${slot}`, {
      method: "POST",
      headers: { "Content-Type": "application/octet-stream" },
      body: files[slot].file,
    });
  }
  await request(access, "/finish", { method: "POST" });
}
function download(value: Blob, name: string) {
  const url = URL.createObjectURL(value),
    a = document.createElement("a");
  a.href = url;
  a.download = name;
  a.click();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}
type Retention = {
  run: <T>(
    inputs: unknown,
    files: Attachment[],
    mode: UsageMode,
    calculate: () => T | Promise<T>,
  ) => Promise<T>;
  busy: boolean;
};
const Context = createContext<Retention | null>(null);
export function useRetainedSubmission() {
  const value = useContext(Context);
  if (!value) throw new Error("Private submission provider missing");
  return value;
}
export function RetainedSubmission({
  tool,
  children,
}: {
  tool: SubmissionTool;
  children: ReactNode;
}) {
  const [busy, setBusy] = useState(false),
    [message, setMessage] = useState(""),
    [error, setError] = useState(""),
    [saved, setSaved] = useState<JobAccess | null>(null),
    [record, setRecord] = useState<unknown>(null);
  const pending = useRef<Pending | null>(null),
    running = useRef(false);
  async function persist(p: Pending) {
    await upload(p);
    setSaved(p.access);
    setMessage(`Saved privately with MST. Record ${p.access.id}.`);
    setError("");
  }
  async function run<T>(
    inputs: unknown,
    files: Attachment[],
    mode: UsageMode,
    calculate: () => T | Promise<T>,
  ): Promise<T> {
    if (running.current)
      throw new Error("Wait for the current save to finish.");
    running.current = true;
    setBusy(false);
    setError("");
    setSaved(null);
    setRecord(null);
    setMessage("Preparing this run…");
    pending.current = null;
    let value: T | undefined, analysisError: Error | undefined;
    try {
      try {
        value = await calculate();
      } catch (e) {
        analysisError =
          e instanceof Error ? e : new Error("The analysis could not finish.");
      }
      setBusy(true);
      setMessage("Saving inputs, original attachments and result…");
      const next = await prepare(
        tool,
        inputs,
        analysisError
          ? { status: "failed", error: analysisError.message }
          : { status: "succeeded", value },
        files,
        mode,
      );
      pending.current = next;
      await persist(next);
    } catch (e) {
      const text = e instanceof Error ? e.message : "The save did not finish.";
      setError(text);
      setMessage("Not fully saved. Keep this page open and retry the save.");
      throw new Error(text);
    } finally {
      running.current = false;
      setBusy(false);
    }
    if (analysisError) throw analysisError;
    return value as T;
  }
  async function retry() {
    if (!pending.current || running.current) return;
    running.current = true;
    setBusy(true);
    try {
      await persist(pending.current);
    } catch (e) {
      setError(e instanceof Error ? e.message : "The save did not finish.");
    } finally {
      running.current = false;
      setBusy(false);
    }
  }
  async function view(access: JobAccess) {
    try {
      const value = await (await request(access, "/record")).json();
      setRecord(value);
      setSaved(access);
      setError("");
    } catch (e) {
      setError(
        e instanceof Error ? e.message : "The private record could not load.",
      );
    }
  }
  async function importReceipt(file: File) {
    try {
      if (file.size > 4096)
        throw new Error("Choose a private MST submission receipt.");
      const value = JSON.parse(await file.text());
      if (
        value.version !== 1 ||
        value.origin !== location.origin ||
        value.tool !== tool ||
        !/^[a-f0-9]{8}-[a-f0-9]{4}-4[a-f0-9]{3}-[89ab][a-f0-9]{3}-[a-f0-9]{12}$/.test(
          value.id,
        ) ||
        !/^[a-f0-9]{64}$/.test(value.token)
      )
        throw new Error(
          "This receipt is invalid or belongs to another tool or website.",
        );
      const access = { id: value.id, token: value.token };
      remember({ access, tool, createdAt: Date.now() });
      await view(access);
    } catch (e) {
      setError(
        e instanceof Error ? e.message : "The receipt could not be read.",
      );
    }
  }
  async function original(slot: number, name: string) {
    if (!saved) return;
    try {
      download(await (await request(saved, `/files/${slot}`)).blob(), name);
    } catch (e) {
      setError(
        e instanceof Error
          ? e.message
          : "The original could not be downloaded.",
      );
    }
  }
  async function erase() {
    if (
      !saved ||
      !window.confirm(
        "Delete this private record, its inputs, results and original attachments from MST storage?",
      )
    )
      return;
    try {
      await request(saved, "", { method: "DELETE" });
      try {
        localStorage.setItem(
          historyKey,
          JSON.stringify(history().filter((x) => x.access.id !== saved.id)),
        );
      } catch {
        /* Server deletion remains authoritative. */
      }
      if (pending.current?.access.id === saved.id) pending.current = null;
      setSaved(null);
      setRecord(null);
      setMessage("The private record and its attachments were deleted.");
      setError("");
    } catch (e) {
      setError(
        e instanceof Error ? e.message : "The record could not be deleted.",
      );
    }
  }
  const savedFiles =
    record &&
    typeof record === "object" &&
    "files" in record &&
    Array.isArray(record.files)
      ? (record.files as { slot: number; complete: boolean }[])
      : [];
  const manifestFiles =
    record && typeof record === "object" && "submission" in record
      ? (record.submission as SubmissionManifest).files
      : [];
  return (
    <Context.Provider value={{ run, busy }}>
      <aside className="notice" aria-label="Private submission storage">
        <strong>Run and save with MST</strong>
        <p>
          Running a tool sends the inputs, selected original files and results
          to MST’s private storage. MST administrators can review them. Files
          stay until you or an administrator delete them and are not used for
          model training.{" "}
          {tool === "drawing-to-bom"
            ? "Drawing recognition runs on MST GPU servers. Manual edits are saved as separate browser-reported versions."
            : "Analysis for this tool runs on your device; saved results are marked as browser-reported."}{" "}
          Up to 32 attachments, 25 MB each, 100 MB total; input and result text
          up to 2 MB.
        </p>
        <p>
          Usage records include preferred browser language, page language,
          estimated network country and source labels. Anonymous identifiers and
          any supplied email do not establish your identity.
        </p>
      </aside>
      <fieldset
        disabled={busy}
        style={{ border: 0, padding: 0, margin: 0, minWidth: 0 }}
      >
        {children}
      </fieldset>
      <section className="panel" aria-label="Private saved runs">
        <h2>Private saved runs</h2>
        {message && <p aria-live="polite">{message}</p>}
        {error && (
          <p className="notice error" role="alert">
            {error}
          </p>
        )}
        {error && pending.current && (
          <button
            className="button secondary"
            disabled={busy}
            onClick={() => void retry()}
          >
            Retry saving this run
          </button>
        )}
        {saved && (
          <>
            <button
              className="button secondary"
              disabled={busy}
              onClick={() => void view(saved)}
            >
              View saved inputs and result
            </button>{" "}
            <button
              className="button secondary"
              onClick={() =>
                download(
                  new Blob(
                    [
                      JSON.stringify({
                        version: 1,
                        origin: location.origin,
                        tool,
                        ...saved,
                      }),
                    ],
                    { type: "application/json" },
                  ),
                  `mst-private-submission-${saved.id}.json`,
                )
              }
            >
              Download private receipt
            </button>
          </>
        )}
        <button
          className="button secondary"
          disabled={busy}
          onClick={() => {
            const previous = history().find((x) => x.tool === tool);
            if (previous) void view(previous.access);
            else setMessage("This browser has no saved run for this tool.");
          }}
        >
          Open latest saved run
        </button>
        <label className="file-picker compact-picker">
          Open private receipt
          <input
            type="file"
            accept=".json,application/json"
            aria-label="Private submission receipt"
            disabled={busy}
            onChange={(e) => {
              const file = e.currentTarget.files?.[0];
              e.currentTarget.value = "";
              if (file) void importReceipt(file);
            }}
          />
        </label>
        {savedFiles.length > 0 && (
          <ul>
            {savedFiles.map((file) => (
              <li key={file.slot}>
                <button
                  className="text-button"
                  disabled={!file.complete || busy}
                  onClick={() =>
                    void original(
                      file.slot,
                      manifestFiles[file.slot]?.name ||
                        `attachment-${file.slot + 1}.bin`,
                    )
                  }
                >
                  Download original:{" "}
                  {manifestFiles[file.slot]?.name ||
                    `attachment ${file.slot + 1}`}
                  {file.complete ? "" : " (upload incomplete)"}
                </button>
              </li>
            ))}
          </ul>
        )}
        {saved && (
          <button
            className="text-button"
            disabled={busy}
            onClick={() => void erase()}
          >
            Delete this private record
          </button>
        )}
        {!!record && (
          <>
            <pre
              style={{
                whiteSpace: "pre-wrap",
                overflowWrap: "anywhere",
                maxHeight: 500,
                overflow: "auto",
              }}
            >
              {JSON.stringify(record, null, 2)}
            </pre>
            <button
              className="button secondary"
              onClick={() =>
                download(
                  new Blob([JSON.stringify(record, null, 2)], {
                    type: "application/json",
                  }),
                  "mst-saved-run.json",
                )
              }
            >
              Download saved record
            </button>
          </>
        )}
        <p className="hint">
          The private receipt grants access to this record. Keep it private.
          Refreshing does not erase a saved record.
        </p>
      </section>
    </Context.Provider>
  );
}
