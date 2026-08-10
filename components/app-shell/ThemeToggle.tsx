"use client";

import { useTheme } from "next-themes";
import { useIsClient } from "@/lib/ui/hooks";
import { THEME_CHOICES, type ThemeChoice } from "@/lib/ui/theme";
import { cn } from "@/lib/utils";
import { MoonIcon, SunIcon, SystemIcon } from "./icons";

const META: Record<
  ThemeChoice,
  { label: string; Icon: (props: { className?: string }) => React.ReactNode }
> = {
  light: { label: "Light", Icon: SunIcon },
  dark: { label: "Dark", Icon: MoonIcon },
  system: { label: "System", Icon: SystemIcon },
};

/**
 * Three-option theme control, in the top bar next to the connection indicator.
 *
 * It lives here rather than behind a settings screen because the moment an
 * operator wants it is dusk, mid-task — one click, no navigation. (There is no
 * profile screen in this app, and one should not be added for this.)
 */
export function ThemeToggle() {
  const { theme, setTheme, resolvedTheme } = useTheme();
  // Rendered only after hydration: the stored choice is not knowable on the
  // server, and guessing would light up the wrong segment for a frame.
  const mounted = useIsClient();

  const active = (mounted ? theme : undefined) as ThemeChoice | undefined;

  return (
    <div
      role="group"
      aria-label="Colour theme"
      className="flex items-center rounded border border-border p-0.5"
    >
      {THEME_CHOICES.map((choice) => {
        const { label, Icon } = META[choice];
        const selected = active === choice;
        const title =
          choice === "system"
            ? `Follow the operating system${
                mounted && resolvedTheme
                  ? ` (currently ${resolvedTheme})`
                  : ""
              }`
            : `${label} theme`;
        return (
          <button
            key={choice}
            type="button"
            title={title}
            aria-label={title}
            aria-pressed={selected}
            onClick={() => setTheme(choice)}
            className={cn(
              "flex h-6 w-6 items-center justify-center rounded-sm transition-colors",
              selected
                ? "bg-info-tint text-accent-strong"
                : "text-text-muted hover:bg-surface-sunken hover:text-text",
            )}
          >
            <Icon className="h-3.5 w-3.5" />
          </button>
        );
      })}
    </div>
  );
}
