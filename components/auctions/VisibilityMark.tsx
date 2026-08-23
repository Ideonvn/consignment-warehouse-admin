"use client";

/**
 * The public marker used in the auctions table.
 *
 * Deliberately NOT `StatusBadge`: that is the single status→colour map, and
 * visibility is not a status — it is an orthogonal property. Two meanings
 * sharing one visual language on one row reads worse than two languages.
 *
 * So this is a marker, not a badge: a globe glyph on the auction's own line,
 * inside the existing line box, adding no height to a 36–40px row. Only the
 * PUBLIC case is marked. Private is the default and the majority, and marking
 * every row would be noise that stops being read — the exception is what an
 * operator scans for.
 */
export function PublicMark({ className }: { className?: string }) {
  return (
    <span
      title="Public — anyone can browse this auction without an account"
      aria-label="Public"
      role="img"
      className={className}
    >
      <GlobeIcon />
    </span>
  );
}

export function GlobeIcon({ className = "h-3.5 w-3.5" }: { className?: string }) {
  return (
    <svg
      viewBox="0 0 16 16"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.4"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden
      className={className}
    >
      <circle cx="8" cy="8" r="6" />
      <path d="M2.2 6.5h11.6M2.2 9.5h11.6" />
      <path d="M8 2a10 10 0 0 0 0 12A10 10 0 0 0 8 2z" />
    </svg>
  );
}
