/**
 * One error type for everything the API can return.
 *
 * The backend speaks `{"detail": "..."}` almost everywhere, but two responses
 * are structured and carry information the UI must not throw away:
 *   - `FrozenFieldOut` (409): `{"detail": {"message", "field"}}` — highlight that input
 *   - `BidTooLowOut` (422): `{"detail": {"message", "minimum_next_bid_minor"}}`
 * Both are declared in the backend's OpenAPI and parsed against those schemas.
 * FastAPI's own request validation also answers 422 with an array of issues.
 */
import { bidTooLowErrorSchema, frozenFieldErrorSchema } from "@/types/api";

export type ApiErrorKind =
  | "network"
  | "unauthorized"
  | "forbidden"
  | "not_found"
  | "conflict"
  | "frozen_field"
  | "bid_too_low"
  | "validation"
  | "rate_limited"
  | "server"
  | "unknown";

interface ApiErrorInit {
  status: number;
  detail: string;
  kind: ApiErrorKind;
  field?: string;
  minimumNextBidMinor?: number;
  retryAfterSeconds?: number;
  payload?: unknown;
}

export class ApiError extends Error {
  readonly status: number;
  readonly detail: string;
  readonly kind: ApiErrorKind;
  /** Set for the frozen-field 409 — the input that must be highlighted. */
  readonly field?: string;
  readonly minimumNextBidMinor?: number;
  readonly retryAfterSeconds?: number;
  readonly payload: unknown;

  constructor(init: ApiErrorInit) {
    super(init.detail);
    this.name = "ApiError";
    this.status = init.status;
    this.detail = init.detail;
    this.kind = init.kind;
    this.field = init.field;
    this.minimumNextBidMinor = init.minimumNextBidMinor;
    this.retryAfterSeconds = init.retryAfterSeconds;
    this.payload = init.payload;
  }

  static network(message = "Cannot reach the server"): ApiError {
    return new ApiError({ status: 0, detail: message, kind: "network" });
  }

  static fromResponse(
    status: number,
    payload: unknown,
    headers?: Headers,
  ): ApiError {
    const retryAfterRaw = headers?.get("retry-after");
    const retryAfterSeconds = retryAfterRaw
      ? Number.parseInt(retryAfterRaw, 10)
      : undefined;

    // The two structured shapes are specified in the backend's OpenAPI, so they
    // are matched against their schemas rather than sniffed field by field.
    const frozenField = frozenFieldErrorSchema.safeParse(payload);
    if (frozenField.success) {
      return new ApiError({
        status,
        detail: frozenField.data.detail.message,
        kind: "frozen_field",
        field: frozenField.data.detail.field,
        retryAfterSeconds,
        payload,
      });
    }

    const bidTooLow = bidTooLowErrorSchema.safeParse(payload);
    if (bidTooLow.success) {
      return new ApiError({
        status,
        detail: bidTooLow.data.detail.message,
        kind: "bid_too_low",
        minimumNextBidMinor: bidTooLow.data.detail.minimum_next_bid_minor,
        retryAfterSeconds,
        payload,
      });
    }

    const detailValue = isRecord(payload) ? payload.detail : undefined;

    // Any other object detail: take a message off it if there is one.
    if (isRecord(detailValue)) {
      return new ApiError({
        status,
        detail:
          asString(detailValue.message) ??
          asString(detailValue.detail) ??
          defaultMessage(status),
        kind: kindForStatus(status),
        retryAfterSeconds,
        payload,
      });
    }

    // FastAPI request-validation array.
    if (Array.isArray(detailValue)) {
      const messages = detailValue
        .map((issue) => {
          if (!isRecord(issue)) return null;
          const loc = Array.isArray(issue.loc)
            ? issue.loc.filter((p) => p !== "body").join(".")
            : undefined;
          const msg = asString(issue.msg) ?? "invalid";
          return loc ? `${loc}: ${msg}` : msg;
        })
        .filter((m): m is string => Boolean(m));
      return new ApiError({
        status,
        detail: messages.join("; ") || defaultMessage(status),
        kind: "validation",
        retryAfterSeconds,
        payload,
      });
    }

    return new ApiError({
      status,
      detail: asString(detailValue) ?? defaultMessage(status),
      kind: kindForStatus(status),
      retryAfterSeconds,
      payload,
    });
  }
}

function kindForStatus(status: number): ApiErrorKind {
  switch (status) {
    case 401:
      return "unauthorized";
    case 403:
      return "forbidden";
    case 404:
      return "not_found";
    case 409:
      return "conflict";
    case 422:
      return "validation";
    case 429:
      return "rate_limited";
    default:
      return status >= 500 ? "server" : "unknown";
  }
}

function defaultMessage(status: number): string {
  switch (status) {
    case 401:
      return "Your session has expired";
    case 403:
      return "You do not have permission to do that";
    case 404:
      return "Not found";
    case 409:
      return "That conflicts with the current state";
    case 422:
      return "Some values were rejected";
    case 429:
      return "Too many requests — slow down";
    default:
      return status >= 500 ? "The server had a problem" : "Request failed";
  }
}

function isRecord(v: unknown): v is Record<string, unknown> {
  return typeof v === "object" && v !== null && !Array.isArray(v);
}

function asString(v: unknown): string | undefined {
  return typeof v === "string" && v.length > 0 ? v : undefined;
}

/** Human-facing message for anything thrown, API error or not. */
export function errorMessage(error: unknown): string {
  if (error instanceof ApiError) return error.detail;
  if (error instanceof Error) return error.message;
  return "Something went wrong";
}

export function isApiError(error: unknown): error is ApiError {
  return error instanceof ApiError;
}
