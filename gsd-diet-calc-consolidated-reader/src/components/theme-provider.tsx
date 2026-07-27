"use client";

import { ThemeProvider as NextThemesProvider } from "next-themes";
import type { ComponentProps } from "react";

/**
 * Theme provider wrapper.
 *
 * Four themes are registered (light, dark, opencode, ergonomic) plus `system`.
 * - `dark:` Tailwind variants activate for BOTH `.dark` and `.opencode` via the
 *   `@custom-variant dark` rule in globals.css (OpenCode is dark-based).
 * - `.opencode` and `.ergonomic` classes override the CSS variables directly.
 * - `system` resolves to `light`/`dark` class automatically (next-themes).
 */
export function ThemeProvider({
  children,
  ...props
}: ComponentProps<typeof NextThemesProvider>) {
  return <NextThemesProvider {...props}>{children}</NextThemesProvider>;
}
