/**
 * Direct-to-storage upload: presign → POST the bytes straight at the object
 * store → confirm with the API. The API never sees the file.
 */
import {
  ALLOWED_IMAGE_TYPES,
  MAX_IMAGE_BYTES,
  type PresignResult,
} from "@/types/api";

/** The storage service rejected the object — distinct from an API validation error. */
export class StorageUploadError extends Error {
  readonly status: number;
  readonly body: string;

  constructor(status: number, body: string) {
    super(describeStorageError(status, body));
    this.name = "StorageUploadError";
    this.status = status;
    this.body = body;
  }
}

function describeStorageError(status: number, body: string): string {
  if (/EntityTooLarge/i.test(body) || status === 413) {
    return "Storage rejected the file for being too large. The size limit is enforced by the upload policy itself, not just this form.";
  }
  if (/ExpiredToken|Policy expired|AccessDenied/i.test(body)) {
    return "The upload authorisation expired before the file finished. Try again.";
  }
  return `Storage refused the upload (HTTP ${status}).`;
}

export function validateImageFile(file: File): string | null {
  if (!(ALLOWED_IMAGE_TYPES as readonly string[]).includes(file.type)) {
    return `${file.name}: only JPEG, PNG and WebP are accepted`;
  }
  if (file.size > MAX_IMAGE_BYTES) {
    return `${file.name}: ${(file.size / 1024 / 1024).toFixed(1)} MB is over the 10 MB limit`;
  }
  if (file.size === 0) return `${file.name}: the file is empty`;
  return null;
}

/** The server does not decode the file, so the browser reports the dimensions. */
export async function readImageDimensions(
  file: File,
): Promise<{ width: number; height: number } | null> {
  try {
    const bitmap = await createImageBitmap(file);
    const size = { width: bitmap.width, height: bitmap.height };
    bitmap.close();
    return size;
  } catch {
    return null;
  }
}

/**
 * POSTs to the presigned URL. XMLHttpRequest rather than fetch because only it
 * reports upload progress, which a warehouse operator on a phone needs.
 *
 * S3 POST policies require every policy field first, in order, and the file
 * last. No Authorization header, and no Content-Type — the browser must set
 * the multipart boundary itself.
 */
export function postToStorage(
  presign: PresignResult,
  file: File,
  onProgress?: (fraction: number) => void,
): Promise<void> {
  return new Promise((resolve, reject) => {
    const form = new FormData();
    for (const [key, value] of Object.entries(presign.fields)) {
      form.append(key, value);
    }
    form.append("file", file);

    const xhr = new XMLHttpRequest();
    xhr.open("POST", presign.url, true);

    xhr.upload.onprogress = (event) => {
      if (event.lengthComputable && onProgress) {
        onProgress(event.loaded / event.total);
      }
    };
    xhr.onload = () => {
      if (xhr.status >= 200 && xhr.status < 300) {
        onProgress?.(1);
        resolve();
      } else {
        reject(new StorageUploadError(xhr.status, xhr.responseText ?? ""));
      }
    };
    xhr.onerror = () =>
      reject(
        new StorageUploadError(
          0,
          "The browser could not reach the storage service.",
        ),
      );
    xhr.onabort = () => reject(new StorageUploadError(0, "Upload cancelled."));

    xhr.send(form);
  });
}
