"use client";

import { useDocStore, signalDocJump, signalDocJumpTo, type IdIndexEntry } from "@/lib/doc-store";
import { cn } from "@/lib/utils";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Bug, CheckSquare, Shield, Hash, ArrowRight, ClipboardCheck } from "lucide-react";
import { useMemo } from "react";

function kindColor(kind: string): string {
  switch (kind) {
    case "finding": return "text-rose-600 dark:text-rose-400";
    case "task": return "text-emerald-700 dark:text-emerald-400";
    case "gate": return "text-violet-700 dark:text-violet-400";
    case "section": return "text-sky-700 dark:text-sky-400";
    case "legacy": return "text-amber-700 dark:text-amber-500";
    case "priority": return "text-slate-600 dark:text-slate-400";
    case "appendix-ref": return "text-teal-700 dark:text-teal-400";
    default: return "text-foreground";
  }
}

function kindDotColor(kind: string): string {
  switch (kind) {
    case "finding": return "bg-rose-500";
    case "task": return "bg-emerald-500";
    case "gate": return "bg-violet-500";
    case "section": return "bg-sky-500";
    case "legacy": return "bg-amber-500";
    case "priority": return "bg-slate-400";
    case "appendix-ref": return "bg-teal-500";
    default: return "bg-muted-foreground";
  }
}

function kindIcon(kind: string) {
  switch (kind) {
    case "finding": return <Bug className="h-3 w-3" />;
    case "task": return <CheckSquare className="h-3 w-3" />;
    case "gate": return <Shield className="h-3 w-3" />;
    case "priority": return <Hash className="h-3 w-3" />;
    default: return <Hash className="h-3 w-3" />;
  }
}

function kindLabel(kind: string): string {
  switch (kind) {
    case "finding": return "Finding";
    case "task": return "Task";
    case "gate": return "Gate";
    case "priority": return "Priority";
    case "section": return "Section";
    case "legacy": return "Legacy";
    case "appendix-ref": return "Appendix ref";
    default: return "ID";
  }
}

export function AuditChecklist() {
  const files = useDocStore((s) => s.files);
  const ids = useDocStore((s) => s.ids);
  const activeSlug = useDocStore((s) => s.activeSlug);
  const activeSectionId = useDocStore((s) => s.activeSectionId);
  const visitedSections = useDocStore((s) => s.visitedSections);
  const setActiveSlug = useDocStore((s) => s.setActiveSlug);

  // find all IDs in the current section
  const sectionIds = useMemo(() => {
    if (!activeSlug || !activeSectionId) return [];
    const found: { id: string; kind: string; entry: IdIndexEntry }[] = [];
    const seen = new Set<string>();
    for (const [id, entry] of Object.entries(ids)) {
      for (const occ of entry.occurrences) {
        if (occ.docSlug === activeSlug && occ.sectionId === activeSectionId) {
          if (!seen.has(id)) {
            seen.add(id);
            found.push({ id, kind: entry.kind, entry });
          }
          break;
        }
      }
    }
    return found.sort((a, b) => {
      // sort by kind priority then by id
      const kindOrder = ["finding", "task", "gate", "priority", "section", "legacy", "appendix-ref"];
      const ki = kindOrder.indexOf(a.kind) ?? 99;
      const kj = kindOrder.indexOf(b.kind) ?? 99;
      if (ki !== kj) return ki - kj;
      return a.id.localeCompare(b.id);
    });
  }, [activeSlug, activeSectionId, ids]);

  const handleJump = (id: string, entry: IdIndexEntry) => {
    if (entry.occurrences.length === 0) return;
    const firstOcc = entry.occurrences[0];
    signalDocJump();
    setActiveSlug(firstOcc.docSlug);
    setTimeout(() => {
      const el = document.getElementById(firstOcc.sectionId);
      if (el) el.scrollIntoView({ behavior: "smooth", block: "start" });
      signalDocJumpTo(firstOcc.sectionId);
    }, 200);
  };

  const totalIds = sectionIds.length;
  const verifiedIds = sectionIds.filter((s) => visitedSections.has(s.id)).length;

  return (
    <div className="fixed bottom-4 right-4 z-40 w-[320px] max-h-[400px] shadow-xl border rounded-lg bg-background/95 backdrop-blur-sm">
      {/* header */}
      <div className="px-3 py-2 border-b flex items-center gap-2 bg-muted/30">
        <ClipboardCheck className="h-4 w-4 text-primary shrink-0" />
        <span className="text-xs font-semibold">Audit Checklist</span>
        <span className="text-[10px] text-muted-foreground font-mono">
          {verifiedIds}/{totalIds} verified
        </span>
        <Badge variant="outline" className="text-[9px] h-4 ml-auto">
          §{activeSectionId?.slice(0, 6) ?? "—"}
        </Badge>
      </div>

      {/* progress bar */}
      {totalIds > 0 && (
        <div className="px-3 py-1.5 border-b">
          <div className="h-1.5 bg-muted rounded-full overflow-hidden">
            <div
              className={cn(
                "h-full rounded-full transition-all",
                verifiedIds === totalIds ? "bg-emerald-500" : "bg-primary/60"
              )}
              style={{ width: `${(verifiedIds / totalIds) * 100}%` }}
            />
          </div>
        </div>
      )}

      {/* list */}
      <ScrollArea className="max-h-[320px]">
        <div className="p-2 space-y-0.5">
          {sectionIds.length === 0 ? (
            <div className="py-6 text-center text-xs text-muted-foreground italic">
              No cross-reference IDs in this section.
            </div>
          ) : (
            sectionIds.map(({ id, kind, entry }) => {
              const isVisited = visitedSections.has(id);
              return (
                <div
                  key={id}
                  className={cn(
                    "flex items-center gap-2 px-2 py-1.5 rounded hover:bg-accent transition-colors group",
                    isVisited && "opacity-70"
                  )}
                >
                  <span className={cn("h-2 w-2 rounded-full shrink-0", kindDotColor(kind))} />
                  <span className={cn("text-[10px] font-mono shrink-0", kindColor(kind))}>
                    {id}
                  </span>
                  <Badge variant="outline" className="text-[9px] h-3.5 px-0.5 shrink-0">
                    {kindLabel(kind)}
                  </Badge>
                  {isVisited ? (
                    <span className="text-[9px] text-emerald-500 font-mono ml-auto shrink-0">✓</span>
                  ) : (
                    <Button
                      variant="ghost"
                      size="icon"
                      className="h-4 w-4 ml-auto shrink-0 opacity-0 group-hover:opacity-100"
                      onClick={() => handleJump(id, entry)}
                      title={`Jump to ${id}`}
                    >
                      <ArrowRight className="h-2.5 w-2.5" />
                    </Button>
                  )}
                </div>
              );
            })
          )}
        </div>
      </ScrollArea>
    </div>
  );
}
