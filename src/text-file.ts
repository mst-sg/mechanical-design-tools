export async function readUtf8(file: File, limit = 4_000_000) {
  if (file.size > limit)
    throw new Error(
      `Choose a UTF-8 text file smaller than ${limit / 1_000_000} MB.`,
    );
  try {
    return new TextDecoder("utf-8", { fatal: true }).decode(
      await file.arrayBuffer(),
    );
  } catch {
    throw new Error(
      "This file is not UTF-8. Save it as CSV UTF-8 and try again.",
    );
  }
}
