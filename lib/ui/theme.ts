/**
 * Theme is a PER-DEVICE preference, stored in localStorage only.
 *
 * Deliberately not on the user record: the same operator works from a warehouse
 * laptop in daylight and a phone at night, and syncing the setting between them
 * would carry the wrong choice to the wrong place. There is also no profile
 * screen in this app (a recorded known gap), and one should not be built for
 * this.
 */
export const THEME_STORAGE_KEY = "cw.admin.theme";

export type ThemeChoice = "light" | "dark" | "system";

export const THEME_CHOICES: ThemeChoice[] = ["light", "dark", "system"];
