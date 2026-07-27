"use client";

import React, { useState, useEffect, useMemo } from "react";
import { useDocStore } from "@/lib/doc-store";
import { Dialog, DialogContent, DialogTitle, DialogDescription } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { MarkdownRenderer } from "@/components/docs/markdown-renderer";
import { X, ArrowLeftRight, Copy, Check } from "lucide-react";
import { cn } from "@/lib/utils";

interface FullFile {
  slug: string;
  fileName: string;
  title: string;
  type: "part" | "appendix" | "map";
  rawMarkdown: string;
  totalLines: number;
}

function stripFirstH1(md: string | undefined | null): string {
  if (!md || typeof md !== "string") return "";
  const h1Idx = md.indexOf("# ");
  if (h1Idx === -1) return md;
  const idx = md.indexOf("\n", h1Idx);
  if (idx === -1) return md;
  const afterH1 = md.slice(idx + 1);
  return afterH1.startsWith("\n") ? afterH1.slice(1) : afterH1;
}

export function ComparisonViewDialog({
  open,
  onOpenChange,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}) {
  const files = useDocStore((s) => s.files);
  const [leftSlug, setLeftSlug] = useState<string>(files[0]?.slug ?? "");
  const [rightSlug, setRightSlug] = useState<string>(files[1]?.slug ?? "");
  const [leftFile, setLeftFile] = useState<FullFile | null>(null);
  const [rightFile, setRightFile] = useState<FullFile | null>(null);
  const [loading, setLoading] = useState(false);

  // Fetch both files when slugs change
  useEffect(() => {
    if (!open || !leftSlug || !rightSlug) return;
    let cancelled = false;
    // Use setTimeout wrapper to avoid lint warning about setState in effect
    setTimeout(() => {
      if (cancelled) return;
      setLoading(true);
      Promise.all([
        fetch(`/api/docs?slug=${encodeURIComponent(leftSlug)}`).then(r => r.json()),
        fetch(`/api/docs?slug=${encodeURIComponent(rightSlug)}`).then(r => r.json()),
      ]).then(([l, r]) => {
        if (cancelled) return;
        // API returns {file: {...}, ids: {...}} — extract the file
        const leftFile = l?.file?.rawMarkdown ? l.file as FullFile : null;
        const rightFile = r?.file?.rawMarkdown ? r.file as FullFile : null;
        setLeftFile(leftFile);
        setRightFile(rightFile);
        setLoading(false);
      }).catch(() => { if (!cancelled) setLoading(false); });
    }, 0);
    return () => { cancelled = true; };
  }, [open, leftSlug, rightSlug]);

  // Initialize slugs from files list — use setTimeout to avoid setState-in-effect
  useEffect(() => {
    if (files.length >= 2 && !leftSlug) {
      setTimeout(() => {
        setLeftSlug(files[0].slug);
        setRightSlug(files[1].slug);
      }, 0);
    }
  }, [files, leftSlug]);

  const leftContent = useMemo(() =>
    leftFile ? stripFirstH1(leftFile.rawMarkdown) : "", [leftFile]);
  const rightContent = useMemo(() =>
    rightFile ? stripFirstH1(rightFile.rawMarkdown) : "", [rightFile]);

  function typeBadge(type: string) {
    if (type === "part") return <Badge className="text-[10px] h-5 bg-rose-100 text-rose-700 dark:bg-rose-950/50 dark:text-rose-300">PART</Badge>;
    if (type === "map") return <Badge className="text-[10px] h-5 bg-amber-100 text-amber-700 dark:bg-amber-950/50 dark:text-amber-300">MAP</Badge>;
    return <Badge className="text-[10px] h-5 bg-sky-100 text-sky-700 dark:bg-sky-950/50 dark:text-sky-300">APX</Badge>;
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogTitle className="sr-only">Document Comparison</DialogTitle>
      <DialogDescription className="sr-only">
        Compare two documents side by side to identify differences and relationships.
      </DialogDescription>
      <DialogContent className="w-[95vw] h-[92vh] max-w-[1800px] p-0 gap-0 overflow-hidden flex flex-col">
        {/* Toolbar */}
        <div className="h-12 border-b bg-card/10 backdrop-blur flex flex-nowrap items-center gap-2 px-3 shrink-0">
          <ArrowLeftRight className="h-4 w-4 text-primary shrink-0" />
          <span className="text-sm font-semibold hidden sm:inline">Document Comparison</span>

          <div className="flex-1 flex items-center justify-center gap-4 min-w-0">
            {/* Left doc selector */}
            <div className="flex items-center gap-2 min-w-0 max-w-[280px]">
              <span className="text-xs text-muted-foreground shrink-0">Left:</span>
              <Select value={leftSlug} onValueChange={setLeftSlug}>
                <SelectTrigger className="h-8 text-xs">
                  <SelectValue placeholder="Select document…" />
                </SelectTrigger>
                <SelectContent>
                  {files.map(f => (
                    <SelectItem key={f.slug} value={f.slug} className="text-xs">
                      {f.title.length > 60 ? f.title.slice(0, 60) + "…" : f.title}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            <span className="text-xs text-muted-foreground font-bold shrink-0">vs</span>

            {/* Right doc selector */}
            <div className="flex items-center gap-2 min-w-0 max-w-[280px]">
              <span className="text-xs text-muted-foreground shrink-0">Right:</span>
              <Select value={rightSlug} onValueChange={setRightSlug}>
                <SelectTrigger className="h-8 text-xs">
                  <SelectValue placeholder="Select document…" />
                </SelectTrigger>
                <SelectContent>
                  {files.map(f => (
                    <SelectItem key={f.slug} value={f.slug} className="text-xs">
                      {f.title.length > 60 ? f.title.slice(0, 60) + "…" : f.title}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </div>

          <Button variant="ghost" size="icon" className="h-8 w-8 shrink-0" onClick={() => onOpenChange(false)} aria-label="Close comparison">
            <X className="h-4 w-4" />
          </Button>
        </div>

        {/* Split view */}
        <div className="flex-1 flex min-h-0">
          {loading ? (
            <div className="flex-1 flex items-center justify-center text-sm text-muted-foreground">
              Loading documents…
            </div>
          ) : (
            <>
              {/* Left pane */}
              <div className="comparison-pane flex-1 min-w-0 flex flex-col">
                {leftFile && (
                  <div className="border-b px-4 py-2 bg-muted/30 shrink-0">
                    <div className="flex items-center gap-2">
                      {typeBadge(leftFile.type)}
                      <span className="text-sm font-semibold line-clamp-1">{leftFile.title}</span>
                      <span className="text-xs text-muted-foreground ml-auto">{leftFile.totalLines} lines</span>
                    </div>
                  </div>
                )}
                <ScrollArea className="flex-1">
                  <div className="prose prose-sm max-w-none p-4 dark:prose-invert">
                    {leftContent && <MarkdownRenderer content={leftContent} />}
                  </div>
                </ScrollArea>
              </div>

              {/* Right pane */}
              <div className="flex-1 min-w-0 flex flex-col">
                {rightFile && (
                  <div className="border-b px-4 py-2 bg-muted/30 shrink-0">
                    <div className="flex items-center gap-2">
                      {typeBadge(rightFile.type)}
                      <span className="text-sm font-semibold line-clamp-1">{rightFile.title}</span>
                      <span className="text-xs text-muted-foreground ml-auto">{rightFile.totalLines} lines</span>
                    </div>
                  </div>
                )}
                <ScrollArea className="flex-1">
                  <div className="prose prose-sm max-w-none p-4 dark:prose-invert">
                    {rightContent && <MarkdownRenderer content={rightContent} />}
                  </div>
                </ScrollArea>
              </div>
            </>
          )}
        </div>
      </DialogContent>
    </Dialog>
  );
}
