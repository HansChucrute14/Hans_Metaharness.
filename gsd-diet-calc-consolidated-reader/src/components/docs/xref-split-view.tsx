"use client";

import React, { useEffect, useState } from "react";
import { useDocStore, signalDocJumpTo } from "@/lib/doc-store";
import { MarkdownRenderer } from "@/components/docs/markdown-renderer";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { X, ArrowRight, Columns2 } from "lucide-react";

interface FullFile {
  slug: string;
  fileName: string;
  title: string;
  type: "part" | "appendix" | "map";
  order: number;
  totalLines: number;
  blurb: string;
  sections: {
    id: string;
    level: number;
    title: string;
    lineNumber: number;
    endLine: number;
    children: string[];
  }[];
  rawMarkdown: string;
}

function stripFirstH1(md: string): string {
  const lines = md.split("\n");
  let h1Idx = -1;
  for (let i = 0; i < lines.length; i++) {
    if (/^#\s+/.test(lines[i])) { h1Idx = i; break; }
  }
  if (h1Idx === -1) return md;
  let end = h1Idx + 1;
  while (end < lines.length && lines[end].trim() === "") end++;
  return lines.slice(end).join("\n");
}

export function XrefSplitView() {
  const xrefDestination = useDocStore((s) => s.xrefDestination);
  const setXrefDestination = useDocStore((s) => s.setXrefDestination);
  const setActiveSlug = useDocStore((s) => s.setActiveSlug);
  const setActiveSectionId = useDocStore((s) => s.setActiveSectionId);
  const files = useDocStore((s) => s.files);

  const [destFile, setDestFile] = useState<FullFile | null>(null);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    if (!xrefDestination) { setDestFile(null); return; }
    setLoading(true);
    (async () => {
      try {
        const res = await fetch(`/api/docs?slug=${encodeURIComponent(xrefDestination.docSlug)}`);
        if (!res.ok) throw new Error(`HTTP ${res.status}`);
        const data = await res.json();
        setDestFile(data.file);
      } catch (e) {
        console.error(e);
      } finally {
        setLoading(false);
      }
    })();
  }, [xrefDestination]);

  // scroll to the destination section once the file loads
  useEffect(() => {
    if (!destFile || !xrefDestination) return;
    const tryScroll = (attempt: number) => {
      if (attempt > 20) return;
      setTimeout(() => {
        // headings in the xref pane get their ids assigned via the same mechanism
        // (normalized title → section id). The xref container has its own #md-container
        // which doesn't exist here — instead headings will get their IDs from the
        // MarkdownRenderer's own ID assignment. We look for [data-heading-id].
        const el = document.querySelector(`[data-heading-id="${xrefDestination.sectionId}"]`);
        if (el) {
          (el as HTMLElement).scrollIntoView({ behavior: "smooth", block: "start" });
          signalDocJumpTo(xrefDestination.sectionId);
        } else {
          tryScroll(attempt + 1);
        }
      }, 250);
    };
    tryScroll(0);
  }, [destFile, xrefDestination]);

  if (!xrefDestination) return null;

  const destFileMeta = files.find((f) => f.slug === xrefDestination.docSlug);
  const destSection = destFileMeta?.sections.find((s) => s.id === xrefDestination.sectionId);

  const handleClose = () => {
    setXrefDestination(null);
  };

  const handleSwap = () => {
    if (!xrefDestination) return;
    // swap: current becomes destination, destination becomes current
    setActiveSlug(xrefDestination.docSlug);
    setActiveSectionId(xrefDestination.sectionId);
    setXrefDestination(null);
  };

  return (
    <div className="w-[40%] border-l bg-background flex flex-col min-h-0">
      {/* header bar */}
      <div className="border-b px-3 py-2 bg-muted/30 flex items-center gap-2 shrink-0">
        <Columns2 className="h-3.5 w-3.5 text-muted-foreground" />
        <div className="flex-1 min-w-0">
          <div className="text-xs font-medium line-clamp-1">
            {destFileMeta?.title ?? "Loading..."}
          </div>
          {destSection && (
            <div className="text-[10px] text-muted-foreground font-mono line-clamp-1">
              → {destSection.title.replace(/^[#*\s]+/, "").slice(0, 40)}
            </div>
          )}
        </div>
        <Button variant="ghost" size="sm" className="h-6 text-[10px] gap-1" onClick={handleSwap}>
          <ArrowRight className="h-3 w-3" />
          Swap
        </Button>
        <Button variant="ghost" size="icon" className="h-6 w-6" onClick={handleClose}>
          <X className="h-3 w-3" />
        </Button>
      </div>

      {/* content */}
      <ScrollArea className="flex-1">
        <div className="px-4 py-6">
          {loading ? (
            <div className="flex items-center justify-center py-12">
              <div className="animate-shimmer h-4 w-32 rounded bg-muted" />
            </div>
          ) : destFile ? (
            <>
              <div className="mb-4">
                <div className="flex items-center gap-2 mb-1">
                  <Badge variant="outline" className="text-[10px]">
                    {destFile.type === "part" ? "PART" : destFile.type === "map" ? "MAP" : "APX"}
                  </Badge>
                  <h2 className="text-lg font-semibold line-clamp-1">{destFile.title}</h2>
                </div>
              </div>
              <MarkdownRenderer
                content={stripFirstH1(destFile.rawMarkdown)}
                highlightId={xrefDestination.sectionId}
              />
            </>
          ) : (
            <div className="py-12 text-center text-sm text-muted-foreground">
              No document loaded.
            </div>
          )}
        </div>
      </ScrollArea>
    </div>
  );
}
