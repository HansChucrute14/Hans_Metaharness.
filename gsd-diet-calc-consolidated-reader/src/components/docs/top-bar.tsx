"use client";

import { useDocStore, type DocFileMeta, type ReadingMode } from "@/lib/doc-store";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Menu, Search, Moon, Sun, Bug, AlertTriangle, CheckSquare, Network, ListOrdered, Star, BookOpen, Eye, Columns2, Maximize, ClipboardCheck, Trophy, Check, ArrowLeftRight, Highlighter, Type, Palette, Monitor, Terminal, Sprout, Keyboard } from "lucide-react";
import { useAnnotationCount } from "@/lib/annotation-highlights";
import { useTheme } from "next-themes";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
  DropdownMenuLabel,
  DropdownMenuSeparator,
} from "@/components/ui/dropdown-menu";
import { ChevronDown } from "lucide-react";

function typeBadge(type: DocFileMeta["type"]) {
  if (type === "part") return <span className="text-[10px] px-1.5 py-0.5 rounded border border-rose-300 dark:border-rose-800 text-rose-700 dark:text-rose-300 font-mono">PART</span>;
  if (type === "map") return <span className="text-[10px] px-1.5 py-0.5 rounded border border-amber-300 dark:border-amber-800 text-amber-700 dark:text-amber-300 font-mono">MAP</span>;
  return <span className="text-[10px] px-1.5 py-0.5 rounded border border-sky-300 dark:border-sky-800 text-sky-700 dark:text-sky-300 font-mono">APX</span>;
}

const MODE_ITEMS: { mode: ReadingMode; icon: React.ReactNode; label: string; desc: string }[] = [
  { mode: "linear", icon: <BookOpen className="h-3.5 w-3.5" />, label: "Linear", desc: "Normal scrolling, all content visible" },
  { mode: "xref", icon: <Columns2 className="h-3.5 w-3.5" />, label: "Cross-reference", desc: "Split view when clicking ID links" },
  { mode: "focus", icon: <Maximize className="h-3.5 w-3.5" />, label: "Focus", desc: "Minimal chrome for deep reading (f)" },
  { mode: "audit", icon: <ClipboardCheck className="h-3.5 w-3.5" />, label: "Audit", desc: "ID checklist with colored underlines" },
];

function modeIcon(mode: ReadingMode) {
  switch (mode) {
    case "linear": return <BookOpen className="h-3.5 w-3.5" />;
    case "xref": return <Columns2 className="h-3.5 w-3.5" />;
    case "focus": return <Maximize className="h-3.5 w-3.5" />;
    case "audit": return <ClipboardCheck className="h-3.5 w-3.5" />;
  }
}

function modeLabel(mode: ReadingMode) {
  switch (mode) {
    case "linear": return "Linear";
    case "xref": return "Xref";
    case "focus": return "Focus";
    case "audit": return "Audit";
  }
}

export function TopBar({ onOpenSearch, onOpenGraph, onOpenToc, onOpenProgress, onOpenComparison, onOpenAnnotations, onOpenShortcuts }: {
  onOpenSearch: () => void;
  onOpenGraph: () => void;
  onOpenToc: () => void;
  onOpenProgress: () => void;
  onOpenComparison: () => void;
  onOpenAnnotations: () => void;
  onOpenShortcuts: () => void;
}) {
  const files = useDocStore((s) => s.files);
  const ids = useDocStore((s) => s.ids);
  const activeSlug = useDocStore((s) => s.activeSlug);
  const setActiveSlug = useDocStore((s) => s.setActiveSlug);
  const toggleSidebar = useDocStore((s) => s.toggleSidebar);
  const bookmarks = useDocStore((s) => s.bookmarks);
  const readingMode = useDocStore((s) => s.readingMode);
  const setReadingMode = useDocStore((s) => s.setReadingMode);
  const fontSize = useDocStore((s) => s.fontSize);
  const setFontSize = useDocStore((s) => s.setFontSize);
  const { theme, setTheme } = useTheme();
  const annotationCount = useAnnotationCount();

  const themeOptions = [
    { value: "light", label: "Light", desc: "Bright, high-contrast", icon: Sun },
    { value: "dark", label: "Dark", desc: "Low-glare dark", icon: Moon },
    { value: "opencode", label: "OpenCode", desc: "Terminal · Claude-Code style", icon: Terminal },
    { value: "ergonomic", label: "Ergonomic", desc: "Warm sepia · science-tuned", icon: Sprout },
    { value: "system", label: "System", desc: "Follow OS preference", icon: Monitor },
  ] as const;

  const parts = files.filter((f) => f.type === "part");
  const map = files.filter((f) => f.type === "map");
  const appendices = files.filter((f) => f.type === "appendix");

  // compute stats — findingsCount is the actual number of distinct finding IDs;
  // p0Mentions counts textual "P0" occurrences across docs (references, not bugs).
  // The doc catalog states there are 10 P0 bugs total; "P0 refs" makes the meaning clear.
  const findingsCount = Object.values(ids).filter(e => e.kind === "finding").length;
  const tasksCount = Object.values(ids).filter(e => e.kind === "task").length;
  const p0Mentions = ids["P0"]?.occurrences.length ?? 0;

  return (
    <header className="sticky top-0 z-40 border-b bg-gradient-to-b from-background to-muted/30 backdrop-blur supports-[backdrop-filter]:bg-background/70">
      <div className="flex items-center gap-2 px-3 h-14">
        {/* mobile menu */}
        <Button
          variant="ghost"
          size="icon"
          className="md:hidden h-9 w-9"
          onClick={toggleSidebar}
          aria-label="Toggle sidebar"
        >
          <Menu className="h-4 w-4" />
        </Button>

        {/* logo + title */}
        <div className="flex items-center gap-2 shrink-0">
          <div className="h-7 w-7 rounded-md bg-gradient-to-br from-rose-500 to-amber-500 flex items-center justify-center text-white text-xs font-bold shadow-sm">
            GSD
          </div>
          <div className="hidden sm:block">
            <div className="text-sm font-semibold leading-tight">gsd-diet-calc</div>
            <div className="text-[10px] text-muted-foreground leading-tight">Consolidated Reader · v10.4.0</div>
          </div>
        </div>

        {/* vertical divider between brand and document tabs */}
        <div className="hidden md:block h-6 w-px bg-border mx-1" aria-hidden />

        {/* document tabs */}
        <div className="flex items-center gap-1">
          {parts.map((p) => (
            <Button
              key={p.slug}
              variant="ghost"
              size="sm"
              onClick={() => setActiveSlug(p.slug)}
              title={`Phase ${p.order} · ${p.blurb || p.title}`}
              className={cn(
                "h-8 text-xs relative",
                activeSlug === p.slug
                  ? "text-foreground font-medium"
                  : "text-muted-foreground"
              )}
            >
              Part {p.order}
              {activeSlug === p.slug && (
                <span className="absolute bottom-0 left-2 right-2 h-0.5 bg-rose-500 rounded-full" />
              )}
            </Button>
          ))}

          {map.map((m) => (
            <Button
              key={m.slug}
              variant="ghost"
              size="sm"
              onClick={() => setActiveSlug(m.slug)}
              title={`Bug Map · the master catalog of all findings (bugs), P0 priorities, fix tasks, and how they depend on each other. ${m.blurb || ""}`}
              className={cn(
                "h-8 text-xs relative",
                activeSlug === m.slug
                  ? "text-foreground font-medium"
                  : "text-muted-foreground"
              )}
            >
              Bug Map
              {activeSlug === m.slug && (
                <span className="absolute bottom-0 left-2 right-2 h-0.5 bg-amber-500 rounded-full" />
              )}
            </Button>
          ))}

          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button variant="ghost" size="sm" className="h-8 text-xs">
                Appendices
                <ChevronDown className="ml-1 h-3 w-3" />
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="start" className="w-72">
              <DropdownMenuLabel className="text-xs">Reference Appendices</DropdownMenuLabel>
              <DropdownMenuSeparator />
              {appendices.map((a) => (
                <DropdownMenuItem
                  key={a.slug}
                  onClick={() => setActiveSlug(a.slug)}
                  className="flex items-start gap-2 py-2"
                >
                  {typeBadge(a.type)}
                  <div className="flex-1 min-w-0">
                    <div className="text-xs font-medium line-clamp-1">{a.title}</div>
                    <div className="text-[10px] text-muted-foreground line-clamp-1">{a.blurb}</div>
                  </div>
                </DropdownMenuItem>
              ))}
            </DropdownMenuContent>
          </DropdownMenu>
        </div>

        {/* vertical divider between tabs and reading controls */}
        <div className="hidden md:block h-6 w-px bg-border mx-1" aria-hidden />

        {/* reading mode switcher */}
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <Button variant="outline" size="sm" className="h-8 text-xs gap-1.5 border-dashed">
              {modeIcon(readingMode)}
              <span className="hidden sm:inline">{modeLabel(readingMode)}</span>
              <ChevronDown className="h-3 w-3 opacity-50" />
            </Button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="start" className="w-64">
            <DropdownMenuLabel className="text-xs">Reading Mode</DropdownMenuLabel>
            <DropdownMenuSeparator />
            {MODE_ITEMS.map((item) => (
              <DropdownMenuItem
                key={item.mode}
                onClick={() => setReadingMode(item.mode)}
                className={cn(
                  "flex items-center gap-2 py-2.5",
                  readingMode === item.mode && "bg-accent"
                )}
              >
                <span className="shrink-0">{item.icon}</span>
                <div className="flex-1 min-w-0">
                  <div className="text-xs font-medium flex items-center gap-1.5">
                    {item.label}
                    {readingMode === item.mode && <Check className="h-3 w-3 text-primary" />}
                  </div>
                  <div className="text-[10px] text-muted-foreground">{item.desc}</div>
                </div>
              </DropdownMenuItem>
            ))}
          </DropdownMenuContent>
        </DropdownMenu>

        {/* font size control */}
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <Button variant="outline" size="sm" className="h-8 text-xs gap-1.5 border-dashed">
              <Type className="h-3.5 w-3.5" />
              <span className="hidden sm:inline">{fontSize}px</span>
              <ChevronDown className="h-3 w-3 opacity-50" />
            </Button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="start" className="w-48">
            <DropdownMenuLabel className="text-xs">Font Size</DropdownMenuLabel>
            <DropdownMenuSeparator />
            {[
              { size: 13, label: "Small", preview: "text-[11px]" },
              { size: 14, label: "Default", preview: "text-xs" },
              { size: 16, label: "Large", preview: "text-sm" },
              { size: 18, label: "XL", preview: "text-base" },
            ].map((item) => (
              <DropdownMenuItem
                key={item.size}
                onClick={() => setFontSize(item.size)}
                className={cn(
                  "flex items-center justify-between py-2",
                  fontSize === item.size && "bg-accent"
                )}
              >
                <div className="flex items-center gap-2">
                  <span className={cn("font-medium", item.preview)}>{item.label}</span>
                </div>
                <div className="flex items-center gap-2 text-muted-foreground">
                  <span className="text-[10px] font-mono">{item.size}px</span>
                  {fontSize === item.size && <Check className="h-3 w-3 text-primary" />}
                </div>
              </DropdownMenuItem>
            ))}
          </DropdownMenuContent>
        </DropdownMenu>

        {/* stats badges — newcomer-friendly, clickable to jump to catalog */}
        {readingMode !== "focus" && findingsCount > 0 && (
          <>
            <div className="hidden md:block h-6 w-px bg-border mx-1" aria-hidden />
            <div className="hidden sm:flex items-center gap-1.5">
              <Badge
                variant="outline"
                className="text-[10px] h-5 gap-0.5 bg-muted/50 cursor-pointer hover:bg-muted transition-colors"
                title={`Findings = distinct bugs diagnosed in the codebase. Each gets a short ID (A1, B2…). Cataloged in the Bug Map. Click to open it.`}
                onClick={() => map[0] && setActiveSlug(map[0].slug)}
              >
                <Bug className="h-3 w-3 text-rose-500" />
                {findingsCount} findings
              </Badge>
              {p0Mentions > 0 && (
                <Badge
                  variant="outline"
                  className="text-[10px] h-5 gap-0.5 text-rose-700 dark:text-rose-300 border-rose-300 dark:border-rose-800 cursor-pointer hover:bg-rose-50 dark:hover:bg-rose-950/30 transition-colors"
                  title={`P0 = "Priority 0" = must-fix-before-release critical bugs. There are 10 real P0 bugs; this number counts every mention across all docs.`}
                  onClick={() => map[0] && setActiveSlug(map[0].slug)}
                >
                  <AlertTriangle className="h-3 w-3" />
                  {p0Mentions} P0 refs
                </Badge>
              )}
              {tasksCount > 0 && (
                <Badge
                  variant="outline"
                  className="text-[10px] h-5 gap-0.5 text-emerald-700 dark:text-emerald-300 border-emerald-300 dark:border-emerald-800 cursor-pointer hover:bg-emerald-50 dark:hover:bg-emerald-950/30 transition-colors"
                  title={`Tasks = concrete fix steps proposed to resolve the findings. Cataloged in the Bug Map. Click to open it.`}
                  onClick={() => map[0] && setActiveSlug(map[0].slug)}
                >
                  <CheckSquare className="h-3 w-3" />
                  {tasksCount} tasks
                </Badge>
              )}
            </div>
          </>
        )}

        {/* right side: tools, search, theme */}
        <div className="ml-auto flex items-center gap-1.5">
          {/* tool cluster — generous gap prevents any badge overlap */}
          <div className="hidden md:flex items-center gap-1 pr-1">
            {readingMode !== "focus" && (
              <Button variant="ghost" size="icon" className="h-8 w-8" onClick={onOpenProgress} title="Reading progress (p)" aria-label="Reading progress">
                <Trophy className="h-4 w-4" />
              </Button>
            )}
            <Button variant="ghost" size="icon" className="h-8 w-8" onClick={onOpenToc} title="Table of contents (t)" aria-label="Table of contents">
              <ListOrdered className="h-4 w-4" />
            </Button>
            <Button variant="ghost" size="icon" className="h-8 w-8" onClick={onOpenGraph} title="Dependency graph (g)" aria-label="Dependency graph">
              <Network className="h-4 w-4" />
            </Button>
            <Button variant="ghost" size="icon" className="h-8 w-8" onClick={onOpenComparison} title="Compare documents (v)" aria-label="Compare documents">
              <ArrowLeftRight className="h-4 w-4" />
            </Button>
            <Button variant="ghost" size="icon" className="h-8 w-8 relative" onClick={onOpenAnnotations} title="My annotations (n)" aria-label="My annotations">
              <Highlighter className="h-4 w-4" />
              {annotationCount > 0 && (
                <span className="absolute -top-0.5 -right-0.5 min-w-[15px] h-[15px] px-1 rounded-full bg-amber-500 text-white text-[9px] font-bold flex items-center justify-center ring-2 ring-background z-10">
                  {annotationCount > 99 ? "99+" : annotationCount}
                </span>
              )}
            </Button>
          </div>

          {/* divider between tool cluster and search */}
          <div className="hidden md:block h-6 w-px bg-border" aria-hidden />

          <Button variant="ghost" size="sm" className="h-8 gap-1.5 text-xs" onClick={onOpenSearch}>
            <Search className="h-3.5 w-3.5" />
            <span className="hidden md:inline">Search</span>
            <kbd className="hidden md:inline-flex h-4 items-center gap-0.5 rounded border bg-muted px-1 text-[10px] font-mono">⌘K</kbd>
          </Button>
          {/* F-10: visible ? button for keyboard-shortcut discoverability (the
              `?` key alone was non-discoverable for mouse-only / new users). */}
          <Button
            variant="ghost"
            size="icon"
            className="h-8 w-8"
            onClick={onOpenShortcuts}
            aria-label="Show keyboard shortcuts"
            title="Keyboard shortcuts (?)"
          >
            <Keyboard className="h-4 w-4" />
          </Button>
          {/* bookmarks count badge — hidden in focus mode */}
          {readingMode !== "focus" && bookmarks.length > 0 && (
            <Badge variant="outline" className="hidden md:inline-flex text-[10px] h-5 gap-0.5 text-amber-700 dark:text-amber-300 border-amber-300 dark:border-amber-800">
              <Star className="h-3 w-3 fill-current" />
              {bookmarks.length}
            </Badge>
          )}

          {/* divider between search and theme */}
          <div className="hidden md:block h-6 w-px bg-border" aria-hidden />

          {/* 4-tier theme switcher */}
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button variant="ghost" size="icon" className="h-8 w-8" aria-label="Change theme">
                <Palette className="h-4 w-4" />
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end" className="w-56">
              <DropdownMenuLabel className="text-xs">Appearance</DropdownMenuLabel>
              <DropdownMenuSeparator />
              {themeOptions.map((t) => {
                const Icon = t.icon;
                const active = theme === t.value;
                return (
                  <DropdownMenuItem
                    key={t.value}
                    onClick={() => setTheme(t.value)}
                    className={cn("flex items-center gap-2.5 py-2", active && "bg-accent")}
                  >
                    <Icon className="h-3.5 w-3.5 shrink-0 text-muted-foreground" />
                    <div className="flex-1 min-w-0">
                      <div className="text-xs font-medium flex items-center gap-1.5">
                        {t.label}
                        {active && <Check className="h-3 w-3 text-primary" />}
                      </div>
                      <div className="text-[10px] text-muted-foreground">{t.desc}</div>
                    </div>
                  </DropdownMenuItem>
                );
              })}
            </DropdownMenuContent>
          </DropdownMenu>
        </div>
      </div>
    </header>
  );
}
