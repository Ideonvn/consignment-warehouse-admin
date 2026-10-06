/**
 * Low-level transport. No knowledge of sessions or refresh — that lives in
 * lib/api/client.ts on top of this, so lib/auth can use the transport without
 * a circular dependency.
 */
import { anchorToServerDate } from "@/lib/format/clock";
import { ApiError } from "./errors";

export const API_BASE_URL =
  process.env.NEXT_PUBLIC_API_BASE_URL ?? "http://localhost:8400/api/v1";

export type QueryValue = string | number | boolean | null | undefined;

export interface HttpOptions {
  method?: "GET" | "POST" | "PATCH" | "PUT" | "DELETE";
  body?: unknown;
  query?: Record<string, QueryValue>;
  headers?: Record<string, string>;
  signal?: AbortSignal;
  /** Bearer token to attach. Omitted for the unauthenticated auth endpoints. */
  token?: string | null;
  /**
   * Return the raw `Blob` instead of a parsed body. For the invoice PDF, which
   * is streamed through the API rather than served from a presigned URL — a
   * presigned link is a bearer capability that survives being pasted into a
   * chat, and an invoice names a person and what they owe.
   *
   * Only the SUCCESS body is read this way. An error still comes back as JSON,
   * so `ApiError` is built from the same shapes as every other call.
   */
  blob?: boolean;
}

export interface HttpResult {
  status: number;
  headers: Headers;
  data: unknown;
}

export function buildUrl(
  path: string,
  query?: Record<string, QueryValue>,
): string {
  const url = new URL(
    path.startsWith("http")
      ? path
      : `${API_BASE_URL}${path.startsWith("/") ? path : `/${path}`}`,
  );
  if (query) {
    for (const [key, value] of Object.entries(query)) {
      if (value === undefined || value === null || value === "") continue;
      url.searchParams.set(key, String(value));
    }
  }
  return url.toString();
}

/** Performs the request and throws ApiError on any non-2xx. */
export async function httpRequest(
  path: string,
  options: HttpOptions = {},
): Promise<HttpResult> {
  const { method = "GET", body, query, headers = {}, signal, token, blob } = options;

  const requestHeaders: Record<string, string> = {
    Accept: blob ? "*/*" : "application/json",
    ...headers,
  };
  if (body !== undefined) requestHeaders["Content-Type"] = "application/json";
  if (token) requestHeaders.Authorization = `Bearer ${token}`;

  const startedAt = Date.now();
  let response: Response;
  try {
    response = await fetch(buildUrl(path, query), {
      method,
      headers: requestHeaders,
      // The refresh token is an HttpOnly cookie; it must ride along.
      credentials: "include",
      body: body === undefined ? undefined : JSON.stringify(body),
      signal,
    });
  } catch (error) {
    if (error instanceof DOMException && error.name === "AbortError") throw error;
    throw ApiError.network();
  }

  anchorToServerDate(response.headers.get("date"), Date.now() - startedAt);

  // The ok check comes FIRST when a blob was asked for: an error body is JSON
  // whatever the request wanted, and reading it as bytes would lose the detail
  // the operator needs to see.
  if (!response.ok) {
    throw ApiError.fromResponse(response.status, await readBody(response), response.headers);
  }
  const data = blob ? await response.blob() : await readBody(response);
  return { status: response.status, headers: response.headers, data };
}

async function readBody(response: Response): Promise<unknown> {
  if (response.status === 204) return null;
  const text = await response.text();
  if (!text) return null;
  try {
    return JSON.parse(text);
  } catch {
    return text;
  }
}
