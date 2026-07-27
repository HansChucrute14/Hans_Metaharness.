"use client";

import { useEffect, useId, useRef, useState } from "react";
import mermaid from "mermaid";
import DOMPurify from "dompurify";
import { AlertTriangle } from "lucide-react";
import { cn } from "@/lib/utils";

interface MermaidDiagramProps {
  chart: string;
}

/** Global counter so each diagram gets a unique id even across re-renders. */
let diagramCounter = 0;

/**
 * Renders a Mermaid diagram from a fenced `mermaid` code block.
 *
 * - Initializes mermaid once per theme change.
 * - Uses `mermaid.render(id, chart)` to produce SVG.
 * - Shows a loading state, an error fallback (raw code + note), and re-renders
 *   when the active theme (light / dark / opencode / ergonomic) changes.
 */
export function MermaidDiagram({ chart }: MermaidDiagramProps) {
  const rawId = useId();
  // Lazily compute a stable unique id once per component instance.
  // (Mermaid IDs must be valid SVG ids — strip the colons React inserts.)
  const idRef = useRef<string>("");
  if (!idRef.current) {
    idRef.current = `mermaid-${rawId.replace(/[:]/g, "")}-${diagramCounter++}`;
  }
  const [svg, setSvg] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [themeKey, setThemeKey] = useState<"dark" | "default">("default");

  // Sync active theme with <html>'s class list (light / dark / opencode / ergonomic)
  useEffect(() => {
    const readTheme = (): "dark" | "default" => {
      const cls = document.documentElement.classList;
      // OpenCode uses .dark under the hood too (see theme-provider.tsx).
      // Ergonomic is light-based.
      if (cls.contains("dark") || cls.contains("opencode")) return "dark";
      return "default";
    };
    setThemeKey(readTheme());
    const observer = new MutationObserver(() => {
      setThemeKey(readTheme());
    });
    observer.observe(document.documentElement, {
      attributes: true,
      attributeFilter: ["class"],
    });
    return () => observer.disconnect();
  }, []);

  // Render the chart whenever the chart text or theme changes
  useEffect(() => {
    let cancelled = false;
    const render = async () => {
      setLoading(true);
      setError(null);
      try {
        const trimmed = chart.replace(/^\n+|\n+$/g, "");
        // SECURITY: `strict` strips <script>, on* handlers, and javascript: URLs
        // from mermaid's SVG output. Do NOT change to "loose" without re-auditing
        // — the SVG is injected via dangerouslySetInnerHTML below.
        // If labels break under strict (e.g. complex HTML labels), switch to
        // "sandbox" (renders in a same-origin iframe) instead.
        mermaid.initialize({
          startOnLoad: false,
          theme: themeKey,
          securityLevel: "strict",
          fontFamily: "inherit",
          flowchart: { useMaxWidth: true, htmlLabels: true },
          sequence: { useMaxWidth: true },
          gantt: { useMaxWidth: true },
        });
        // Use a unique id per render to avoid DOM collisions when re-rendering
        const renderId = `${idRef.current}-${Date.now()}`;
        const { svg: rendered } = await mermaid.render(renderId, trimmed);
        // Defense-in-depth: even though securityLevel:"strict" sanitizes, run
        // DOMPurify with the SVG profile to strip anything that slips through
        // (e.g. future mermaid regressions, exotic payload shapes).
        const clean = DOMPurify.sanitize(rendered, {
          USE_PROFILES: { svg: true, svgFilters: true },
          ADD_ATTR: ["target", "viewbox"],
        });
        if (!cancelled) {
          setSvg(clean);
          setLoading(false);
        }
      } catch (e: unknown) {
        if (!cancelled) {
          const msg = e instanceof Error ? e.message : String(e);
          setError(msg);
          setLoading(false);
        }
        // Mermaid sometimes leaves stray error nodes in the DOM; clean them up
        const stray = document.querySelectorAll(`[id^="${idRef.current}"]`);
        stray.forEach((n) => n.remove());
      }
    };
    void render();
    return () => {
      cancelled = true;
    };
  }, [chart, themeKey]);

  if (loading) {
    return (
      <div
        className="my-4 flex items-center justify-center gap-2 p-8 border rounded-lg bg-muted/30 text-sm text-muted-foreground"
        role="status"
        aria-live="polite"
      >
        <span className="inline-block h-3 w-3 rounded-full border-2 border-muted-foreground/40 border-t-muted-foreground animate-spin" />
        Rendering diagram…
      </div>
    );
  }

  if (error) {
    return (
      <div className="my-4 border border-rose-300/70 dark:border-rose-800/60 rounded-lg bg-rose-50/60 dark:bg-rose-950/20 p-4">
        <div className="flex items-center gap-2 text-rose-700 dark:text-rose-300 text-sm font-medium mb-2">
          <AlertTriangle className="h-4 w-4 shrink-0" />
          <span>Mermaid diagram failed to render</span>
        </div>
        <pre className="text-xs bg-muted/60 dark:bg-black/30 p-2 rounded overflow-x-auto font-mono whitespace-pre-wrap break-words border border-border/60">
          {chart}
        </pre>
        <p className="text-[11px] text-muted-foreground mt-2 font-mono">{error}</p>
      </div>
    );
  }

  return (
    <div
      className={cn(
        "my-4 p-4 border rounded-lg bg-background overflow-x-auto flex justify-center items-center",
        "prose-code:before:hidden prose-code:after:hidden"
      )}
      // Mermaid SVG output is sanitized via securityLevel:"strict" + DOMPurify
      // (see render effect above). The dangerouslySetInnerHTML is safe under
      // that contract; do NOT change securityLevel without re-auditing.
      dangerouslySetInnerHTML={{ __html: svg || "" }}
    />
  );
}

export default MermaidDiagram;
