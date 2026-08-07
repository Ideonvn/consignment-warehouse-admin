/**
 * Low-level transport. No knowledge of sessions or refresh — that lives in
 * lib/api/client.ts on top of this, so lib/auth can use the transport without
 * a circular dependency.
 */
import { anchorToServerDate } from "@/lib/format/clock";
import { ApiError } from "./errors";

export const API_BASE_URL =
  process.env.NEXT_PUBLIC_API_BASE_URL ?? "http://localhost:8000/api/v1";

export type QueryValue = string | number | boolean | null | undefined;

export interface HttpOptions {
  method?: "GET" | "POST" | "PATCH" | "PUT" | "DELETE";
  body?: unknown;
  query?: Record<string, QueryValue>;
  headers?: Record<string, string>;
  signal?: AbortSignal;
  /** Bearer token to attach. Omitted for the unauthenticated auth endpoints. */
  token?: string | null;
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
  const { method = "GET", body, query, headers = {}, signal, token } = options;

  const requestHeaders: Record<string, string> = { Accept: "application/json", ...headers };
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

  const data = await readBody(response);
  if (!response.ok) {
    throw ApiError.fromResponse(response.status, data, response.headers);
  }
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
