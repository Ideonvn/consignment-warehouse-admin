"use client";

import { useState } from "react";
import { errorMessage } from "./errors";
import {
  postToStorage,
  readImageDimensions,
  StorageUploadError,
  validateImageFile,
} from "./upload";
import type { PresignResult } from "@/types/api";
import { randomUuid } from "@/lib/utils";

export interface UploadItem {
  id: string;
  name: string;
  /** 0..1 */
  progress: number;
  status: "validating" | "uploading" | "confirming" | "done" | "failed";
  error?: string;
}

export interface ConfirmArgs {
  presign: PresignResult;
  file: File;
  /** Read client-side because the server does not decode the file. */
  dimensions: { width: number; height: number } | null;
  /** Position within this batch, for callers that number their images. */
  index: number;
}

/**
 * What happened to one file, returned from `upload` so a caller can act on the
 * failures rather than scrape them out of `uploads` state — the progress rows
 * are for the operator to read, and a caller awaiting the batch has a stale
 * closure over them anyway.
 */
export interface UploadOutcome<TResult> {
  file: File;
  ok: boolean;
  result?: TResult;
  error?: string;
}

export interface DirectUploadOptions<TResult> {
  presign: (file: File) => Promise<PresignResult>;
  confirm: (args: ConfirmArgs) => Promise<TResult>;
  onUploaded?: (result: TResult) => void;
  /** How long a finished row stays visible. 0 keeps it until cleared. */
  clearDoneAfterMs?: number;
}

/**
 * The presign → direct-to-storage → confirm dance, with per-file progress.
 *
 * Shared by the lot gallery and the auction cover image: the mechanics are
 * identical and fiddly enough that a second copy would drift. The transport
 * rules live in ./upload.ts (policy fields first, file last, no Authorization,
 * no Content-Type); this owns the state machine around them.
 */
export function useDirectUpload<TResult>({
  presign,
  confirm,
  onUploaded,
  clearDoneAfterMs = 1500,
}: DirectUploadOptions<TResult>) {
  const [uploads, setUploads] = useState<UploadItem[]>([]);

  function patch(id: string, next: Partial<UploadItem>) {
    setUploads((prev) =>
      prev.map((item) => (item.id === id ? { ...item, ...next } : item)),
    );
  }

  async function uploadOne(
    file: File,
    index: number,
  ): Promise<UploadOutcome<TResult>> {
    const id = randomUuid();
    setUploads((prev) => [
      ...prev,
      { id, name: file.name, progress: 0, status: "validating" },
    ]);

    // Checked here so the operator gets an inline message instead of a 422 —
    // the storage policy enforces the cap again on its own side.
    const invalid = validateImageFile(file);
    if (invalid) {
      patch(id, { status: "failed", error: invalid });
      return { file, ok: false, error: invalid };
    }

    try {
      const dimensions = await readImageDimensions(file);
      const presigned = await presign(file);

      patch(id, { status: "uploading" });
      await postToStorage(presigned, file, (fraction) =>
        patch(id, { progress: fraction }),
      );

      patch(id, { status: "confirming", progress: 1 });
      const result = await confirm({
        presign: presigned,
        file,
        dimensions,
        index,
      });

      patch(id, { status: "done" });
      if (clearDoneAfterMs > 0) {
        setTimeout(
          () => setUploads((prev) => prev.filter((item) => item.id !== id)),
          clearDoneAfterMs,
        );
      }
      onUploaded?.(result);
      return { file, ok: true, result };
    } catch (error) {
      // A storage rejection and an API rejection need different words: the
      // first means the bytes never landed, the second means they did but the
      // API would not record them. Same-looking failure, different next step.
      const message =
        error instanceof StorageUploadError
          ? error.message
          : `The API rejected the upload: ${errorMessage(error)}`;
      patch(id, { status: "failed", error: message });
      return { file, ok: false, error: message };
    }
  }

  /** Uploads sequentially so progress rows stay readable and ordering holds. */
  async function upload(
    files: FileList | File[],
    startIndex = 0,
  ): Promise<UploadOutcome<TResult>[]> {
    const list = Array.from(files);
    const outcomes: UploadOutcome<TResult>[] = [];
    for (let i = 0; i < list.length; i += 1) {
      outcomes.push(await uploadOne(list[i], startIndex + i));
    }
    return outcomes;
  }

  return {
    uploads,
    upload,
    busy: uploads.some(
      (item) => item.status !== "done" && item.status !== "failed",
    ),
    clear: () => setUploads([]),
  };
}
