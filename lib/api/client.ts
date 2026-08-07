/**
 * Authenticated API client: injects the bearer token, transparently refreshes
 * once on a 401, and validates every response against a zod schema.
 */
import type { ZodType } from "zod";
import { getAccessToken, refreshSession } from "@/lib/auth";
import { ApiError } from "./errors";
import { httpRequest, type HttpOptions } from "./http";

export interface RequestOptions<T> extends Omit<HttpOptions, "token"> {
  schema: ZodType<T>;
}

async function send(path: string, options: HttpOptions, allowRetry: boolean) {
  let token = getAccessToken();
  if (!token) {
    // No access token in memory (fresh tab, or it expired): the refresh cookie
    // is the only way back. Single-flight, so parallel calls share one refresh.
    token = (await refreshSession()).accessToken;
  }

  try {
    return await httpRequest(path, { ...options, token });
  } catch (error) {
    if (allowRetry && error instanceof ApiError && error.status === 401) {
      const refreshed = await refreshSession();
      return await httpRequest(path, { ...options, token: refreshed.accessToken });
    }
    throw error;
  }
}

/** Parsed body only. */
export async function apiRequest<T>(
  path: string,
  { schema, ...options }: RequestOptions<T>,
): Promise<T> {
  const { data } = await send(path, options, true);
  return parse(schema, data, path);
}

export interface PagedResult<T> {
  data: T;
  nextCursor: string | null;
  hasMore: boolean;
}

/** Body plus the cursor-pagination headers the backend exposes via CORS. */
export async function apiRequestPaged<T>(
  path: string,
  { schema, ...options }: RequestOptions<T>,
): Promise<PagedResult<T>> {
  const { data, headers } = await send(path, options, true);
  const cursor = headers.get("x-next-cursor");
  return {
    data: parse(schema, data, path),
    nextCursor: cursor && cursor.length > 0 ? cursor : null,
    hasMore: headers.get("x-has-more") === "true",
  };
}

/** For 204 responses. */
export async function apiRequestVoid(
  path: string,
  options: Omit<HttpOptions, "token"> = {},
): Promise<void> {
  await send(path, options, true);
}

function parse<T>(schema: ZodType<T>, data: unknown, path: string): T {
  const result = schema.safeParse(data);
  if (!result.success) {
    // A shape mismatch is a bug or a backend change, not an operator error —
    // make it loud in the console but keep the message human on screen.
    console.error(`Unexpected response shape from ${path}`, result.error.issues);
    throw new ApiError({
      status: 0,
      detail: "The server sent something this portal did not understand",
      kind: "unknown",
      payload: data,
    });
  }
  return result.data;
}
