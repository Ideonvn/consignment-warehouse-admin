"use client";

/** Hand-rolled 16px icons — a whole icon package for four glyphs is not worth it. */
type IconProps = { className?: string };

function Svg({
  children,
  className,
}: IconProps & { children: React.ReactNode }) {
  return (
    <svg
      viewBox="0 0 16 16"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.4"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden
      className={className ?? "h-4 w-4 shrink-0"}
    >
      {children}
    </svg>
  );
}

export function AuctionIcon(props: IconProps) {
  return (
    <Svg {...props}>
      <path d="M2 13.5h7" />
      <path d="M4.5 8.5 9 4l3 3-4.5 4.5z" />
      <path d="M9.5 2.5 13.5 6.5" />
    </Svg>
  );
}

export function LotIcon(props: IconProps) {
  return (
    <Svg {...props}>
      <path d="M2.5 5.5 8 2.5l5.5 3v5L8 13.5l-5.5-3z" />
      <path d="M2.5 5.5 8 8.5l5.5-3" />
      <path d="M8 8.5v5" />
    </Svg>
  );
}

export function DecisionIcon(props: IconProps) {
  return (
    <Svg {...props}>
      <path d="M8 2.5 14 12.5H2z" />
      <path d="M8 6.5v3" />
      <path d="M8 11.2v.3" />
    </Svg>
  );
}

export function UsersIcon(props: IconProps) {
  return (
    <Svg {...props}>
      <circle cx="6" cy="5.5" r="2.5" />
      <path d="M1.5 13.5c0-2.2 2-4 4.5-4s4.5 1.8 4.5 4" />
      <path d="M11 3.4a2.5 2.5 0 0 1 0 4.7" />
      <path d="M12.5 9.9c1.3.6 2 1.9 2 3.6" />
    </Svg>
  );
}

export function MenuIcon(props: IconProps) {
  return (
    <Svg {...props}>
      <path d="M2.5 4.5h11" />
      <path d="M2.5 8h11" />
      <path d="M2.5 11.5h11" />
    </Svg>
  );
}

export function SunIcon(props: IconProps) {
  return (
    <Svg {...props}>
      <circle cx="8" cy="8" r="3" />
      <path d="M8 1.5v1.5M8 13v1.5M1.5 8h1.5M13 8h1.5" />
      <path d="M3.4 3.4l1 1M11.6 11.6l1 1M12.6 3.4l-1 1M4.4 11.6l-1 1" />
    </Svg>
  );
}

export function MoonIcon(props: IconProps) {
  return (
    <Svg {...props}>
      <path d="M13 9.4A5.5 5.5 0 0 1 6.6 3a5.5 5.5 0 1 0 6.4 6.4z" />
    </Svg>
  );
}

export function SystemIcon(props: IconProps) {
  return (
    <Svg {...props}>
      <rect x="1.5" y="3" width="13" height="8" rx="1" />
      <path d="M6 13.5h4" />
    </Svg>
  );
}

export function MonitorIcon(props: IconProps) {
  return (
    <Svg {...props}>
      <rect x="1.5" y="2.5" width="13" height="9" rx="1" />
      <path d="M5.5 13.5h5" />
      <path d="M4 8l2-2 2 2 2-3 2 3" />
    </Svg>
  );
}
