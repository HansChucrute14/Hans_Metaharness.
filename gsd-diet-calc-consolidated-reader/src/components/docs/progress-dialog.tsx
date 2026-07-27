"use client";

import React, { useMemo } from "react";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from "@/components/ui/dialog";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import { Progress } from "@/components/ui/progress";
import { Badge } from "@/components/ui/badge";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Button } from "@/components/ui/button";
import { useDocStore, type DocFileMeta, type IdIndexEntry } from "@/lib/doc-store";
import { cn } from "@/lib/utils";
import {
  Trophy, BookOpen, FileText, Map, Bug, CheckSquare, Shield,
  BarChart3, ArrowRight, Clock, Star,
} from "lucide-react";

// circular progress ring SVG component
function ProgressRing({ percent, size = 80, strokeWidth = 6 }: { percent: number; size?: number; strokeWidth?: number }) {
  const radius = (size - strokeWidth) / 2;
  const circumference = 2 * Math.PI * radius;
  const offset = circumference - (percent / 100) * circumference;

  return (
    <svg width={size} height={size} className="shrink-0">
      <circle
        cx={size / 2}
        cy={size / 2}
        r={radius}
        fill="none"
        className="stroke-muted"
        strokeWidth={strokeWidth}
      />
      <circle
        cx={size / 2}
        cy={size / 2}
        r={radius}
        fill="none"
        className="stroke-primary"
        strokeWidth={strokeWidth}
        strokeLinecap="round"
        strokeDasharray={circumference}
        strokeDashoffset={offset}
        transform={`rotate(-90 ${size / 2} ${size / 2})`}
        style={{ transition: "stroke-dashoffset 0.5s ease" }}
      />
      <text
        x={size / 2}
        y={size / 2}
        textAnchor="middle"
        dominantBaseline="central"
        className="fill-foreground text-sm font-semibold"
      >
        {Math.round(percent)}%
      </text>
    </svg>
  );
}

function typeIcon(type: DocFileMeta["type"]) {
  switch (type) {
    case "part": return <BookOpen className="h-3.5 w-3.5 text-rose-500" />;
    case "map": return <Map className="h-3.5 w-3.5 text-amber-500" />;
    default: return <FileText className="h-3.5 w-3.5 text-sky-500" />;
  }
}

function typeBadgeStyle(type: DocFileMeta["type"]) {
  switch (type) {
    case "part": return "border-rose-300 dark:border-rose-800 text-rose-700 dark:text-rose-300";
    case "map": return "border-amber-300 dark:border-amber-800 text-amber-700 dark:text-amber-300";
    default: return "border-sky-300 dark:border-sky-800 text-sky-700 dark:text-sky-300";
  }
}

function typeBadgeLabel(type: DocFileMeta["type"]) {
  switch (type) {
    case "part": return "PART";
    case "map": return "MAP";
    default: return "APX";
  }
}

// critical path IDs per the project plan
const CRITICAL_PATH_IDS = ["B0", "B7", "B1", "B5", "B6", "B8", "C5", "C7", "C8", "C9", "C10", "C11", "C12", "C14"];

export function ProgressDialog({ open, onOpenChange }: { open: boolean; onOpenChange: (open: boolean) => void }) {
  const files = useDocStore((s) => s.files);
  const ids = useDocStore((s) => s.ids);
  const visitedDocs = useDocStore((s) => s.visitedDocs);
  const visitedSections = useDocStore((s) => s.visitedSections);
  const setActiveSlug = useDocStore((s) => s.setActiveSlug);

  // overall progress
  const overallProgress = useMemo(() => {
    if (files.length === 0) return 0;
    return (visitedDocs.size / files.length) * 100;
  }, [visitedDocs, files]);

  // findings coverage: how many unique finding IDs have been viewed
  const findingsCoverage = useMemo(() => {
    const allFindings = Object.entries(ids).filter(([, e]) => e.kind === "finding");
    const totalFindings = allFindings.length;
    if (totalFindings === 0) return { viewed: 0, total: 0, percent: 0 };
    // a finding is "viewed" if any section containing that ID has been visited
    const viewed = allFindings.filter(([, e]) =>
      e.occurrences.some(occ => visitedSections.has(occ.sectionId))
    ).length;
    return {
      viewed,
      total: totalFindings,
      percent: (viewed / totalFindings) * 100,
    };
  }, [ids, visitedSections]);

  // critical path coverage
  const criticalPathCoverage = useMemo(() => {
    const total = CRITICAL_PATH_IDS.length;
    if (total === 0) return { viewed: 0, total: 0, percent: 0 };
    const viewed = CRITICAL_PATH_IDS.filter((id) => {
      const entry = ids[id];
      if (!entry) return false;
      return entry.occurrences.some(occ => visitedSections.has(occ.sectionId));
    }).length;
    return { viewed, total, percent: (viewed / total) * 100 };
  }, [ids, visitedSections]);

  // per-document progress
  const perDocProgress = useMemo(() => {
    return files.map((f) => {
      const sectionsVisited = f.sections.filter((s) => visitedSections.has(s.id)).length;
      const totalSections = f.sections.length;
      const percent = totalSections > 0 ? (sectionsVisited / totalSections) * 100 : 0;
      // estimate reading time
      const readingTimeMin = Math.max(1, Math.round(f.totalLines / 12)); // rough: ~12 lines/min
      return {
        ...f,
        sectionsVisited,
        totalSections,
        percent,
        readingTimeMin,
        isVisited: visitedDocs.has(f.slug),
      };
    });
  }, [files, visitedSections, visitedDocs]);

  // unread recommendations
  const unreadRecommendation = useMemo(() => {
    // priority order: part 1 first, then part 2, bug map, part 3, appendices
    const priorityOrder: Record<string, number> = {};
    files.forEach((f) => {
      if (f.type === "part" && f.order === 1) priorityOrder[f.slug] = 1;
      else if (f.type === "part" && f.order === 2) priorityOrder[f.slug] = 2;
      else if (f.type === "map") priorityOrder[f.slug] = 3;
      else if (f.type === "part" && f.order === 3) priorityOrder[f.slug] = 4;
      else if (f.type === "appendix") priorityOrder[f.slug] = 5 + f.order;
    });

    const unread = files
      .filter((f) => !visitedDocs.has(f.slug))
      .sort((a, b) => (priorityOrder[a.slug] ?? 99) - (priorityOrder[b.slug] ?? 99));

    return unread[0] ?? null;
  }, [files, visitedDocs]);

  const handleJumpToRecommendation = () => {
    if (unreadRecommendation) {
      setActiveSlug(unreadRecommendation.slug);
      onOpenChange(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-2xl max-h-[80vh] overflow-hidden flex flex-col">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Trophy className="h-5 w-5 text-primary" />
            Reading Progress Dashboard
          </DialogTitle>
          <DialogDescription className="text-sm text-muted-foreground">
            Track your reading progress, findings coverage, and critical path completion.
          </DialogDescription>
        </DialogHeader>

        <Tabs defaultValue="overview" className="flex-1 flex flex-col min-h-0">
          <TabsList className="grid grid-cols-3 h-9 shrink-0">
            <TabsTrigger value="overview" className="text-xs gap-1">
              <BarChart3 className="h-3 w-3" />
              Overview
            </TabsTrigger>
            <TabsTrigger value="documents" className="text-xs gap-1">
              <BookOpen className="h-3 w-3" />
              By Document
            </TabsTrigger>
            <TabsTrigger value="findings" className="text-xs gap-1">
              <Bug className="h-3 w-3" />
              Findings
            </TabsTrigger>
          </TabsList>

          {/* Overview tab */}
          <TabsContent value="overview" className="flex-1 overflow-y-auto mt-0">
            <div className="p-4 space-y-6">
              {/* overall progress ring */}
              <div className="flex items-center gap-6">
                <ProgressRing percent={overallProgress} size={100} strokeWidth={8} />
                <div>
                  <div className="text-sm font-semibold">Overall Progress</div>
                  <div className="text-xs text-muted-foreground mt-1">
                    {visitedDocs.size} of {files.length} documents visited
                  </div>
                  <div className="text-xs text-muted-foreground mt-0.5">
                    {visitedSections.size} sections viewed across all docs
                  </div>
                </div>
              </div>

              {/* findings coverage */}
              <div className="border rounded-lg p-4">
                <div className="flex items-center justify-between mb-2">
                  <div className="text-sm font-semibold flex items-center gap-2">
                    <Bug className="h-4 w-4 text-rose-500" />
                    Findings Coverage
                  </div>
                  <Badge variant="outline" className="text-[10px]">
                    {findingsCoverage.viewed}/{findingsCoverage.total}
                  </Badge>
                </div>
                <Progress value={findingsCoverage.percent} className="h-2" />
                <div className="text-xs text-muted-foreground mt-1.5">
                  {Math.round(findingsCoverage.percent)}% of findings have been encountered in your reading
                </div>
              </div>

              {/* critical path */}
              <div className="border rounded-lg p-4">
                <div className="flex items-center justify-between mb-2">
                  <div className="text-sm font-semibold flex items-center gap-2">
                    <Shield className="h-4 w-4 text-violet-500" />
                    Critical Path
                  </div>
                  <Badge variant="outline" className="text-[10px]">
                    {criticalPathCoverage.viewed}/{criticalPathCoverage.total}
                  </Badge>
                </div>
                <Progress value={criticalPathCoverage.percent} className="h-2" />
                <div className="text-xs text-muted-foreground mt-1.5">
                  {Math.round(criticalPathCoverage.percent)}% of critical-path tasks ({CRITICAL_PATH_IDS.join(", ")}) have been viewed
                </div>
                {/* list critical path IDs with status */}
                <div className="flex flex-wrap gap-1 mt-2">
                  {CRITICAL_PATH_IDS.map((id) => {
                    const entry = ids[id];
                    const isViewed = entry?.occurrences.some(occ => visitedSections.has(occ.sectionId)) ?? false;
                    return (
                      <Badge
                        key={id}
                        variant="outline"
                        className={cn(
                          "text-[9px] font-mono h-4",
                          isViewed
                            ? "text-emerald-700 dark:text-emerald-400 border-emerald-300 dark:border-emerald-800 bg-emerald-50 dark:bg-emerald-950/30"
                            : "text-muted-foreground border-border"
                        )}
                      >
                        {isViewed ? "✓" : "○"} {id}
                      </Badge>
                    );
                  })}
                </div>
              </div>

              {/* next unread recommendation */}
              {unreadRecommendation && (
                <div className="border rounded-lg p-4 bg-muted/20">
                  <div className="text-sm font-semibold mb-2 flex items-center gap-2">
                    <Star className="h-4 w-4 text-amber-500" />
                    Recommended Next Read
                  </div>
                  <div className="flex items-center gap-3">
                    {typeIcon(unreadRecommendation.type)}
                    <div className="flex-1 min-w-0">
                      <div className="text-xs font-medium line-clamp-1">{unreadRecommendation.title}</div>
                      <div className="text-[10px] text-muted-foreground flex items-center gap-1.5 mt-0.5">
                        <Badge variant="outline" className={cn("text-[9px] h-3.5 px-0.5", typeBadgeStyle(unreadRecommendation.type))}>
                          {typeBadgeLabel(unreadRecommendation.type)}
                        </Badge>
                        <span>{unreadRecommendation.totalLines} lines</span>
                        <span>·</span>
                        <Clock className="h-2.5 w-2.5" />
                        <span>{unreadRecommendation.sections.length} §</span>
                      </div>
                    </div>
                    <Button variant="outline" size="sm" className="h-7 text-xs gap-1" onClick={handleJumpToRecommendation}>
                      <ArrowRight className="h-3 w-3" />
                      Read now
                    </Button>
                  </div>
                </div>
              )}
            </div>
          </TabsContent>

          {/* By Document tab */}
          <TabsContent value="documents" className="flex-1 overflow-y-auto mt-0">
            <ScrollArea className="h-full">
              <div className="p-4 space-y-2">
                {perDocProgress.map((doc) => (
                  <div
                    key={doc.slug}
                    className={cn(
                      "border rounded-lg p-3 flex items-center gap-3",
                      doc.isVisited ? "bg-background" : "bg-muted/30"
                    )}
                  >
                    {typeIcon(doc.type)}
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-1.5">
                        <span className="text-xs font-medium line-clamp-1">{doc.title}</span>
                        <Badge variant="outline" className={cn("text-[9px] h-3.5 px-0.5 shrink-0", typeBadgeStyle(doc.type))}>
                          {typeBadgeLabel(doc.type)}
                        </Badge>
                      </div>
                      <div className="flex items-center gap-1.5 text-[10px] text-muted-foreground mt-1">
                        <span className="font-mono">{doc.sectionsVisited}/{doc.totalSections} §</span>
                        <span>·</span>
                        <Clock className="h-2.5 w-2.5" />
                        <span>{doc.readingTimeMin} min</span>
                        <span>·</span>
                        <span className="font-mono">{doc.totalLines} lines</span>
                      </div>
                      <Progress value={doc.percent} className="h-1.5 mt-1.5" />
                    </div>
                    <div className="text-xs font-mono tabular-nums text-muted-foreground shrink-0">
                      {Math.round(doc.percent)}%
                    </div>
                  </div>
                ))}
              </div>
            </ScrollArea>
          </TabsContent>

          {/* Findings Coverage tab */}
          <TabsContent value="findings" className="flex-1 overflow-y-auto mt-0">
            <ScrollArea className="h-full">
              <div className="p-4">
                <div className="flex items-center justify-between mb-3">
                  <div className="text-sm font-semibold">
                    {findingsCoverage.viewed} of {findingsCoverage.total} findings viewed
                  </div>
                  <Badge variant="outline" className="text-[10px]">
                    {Math.round(findingsCoverage.percent)}%
                  </Badge>
                </div>
                <div className="space-y-0.5">
                  {Object.entries(ids)
                    .filter(([, e]) => e.kind === "finding")
                    .sort(([a], [b]) => a.localeCompare(b))
                    .map(([id, entry]) => {
                      const isViewed = entry.occurrences.some(occ => visitedSections.has(occ.sectionId));
                      return (
                        <div
                          key={id}
                          className={cn(
                            "flex items-center gap-2 px-2 py-1.5 rounded text-xs",
                            isViewed ? "bg-emerald-50/50 dark:bg-emerald-950/20" : "bg-muted/20"
                          )}
                        >
                          <span className={cn(
                            "h-2 w-2 rounded-full shrink-0",
                            isViewed ? "bg-emerald-500" : "bg-muted-foreground/40"
                          )} />
                          <span className="font-mono">{id}</span>
                          <span className="text-[10px] text-muted-foreground flex-1">
                            {entry.occurrences[0]?.context.slice(0, 50) ?? ""}
                          </span>
                          <Badge variant="outline" className="text-[9px] h-3.5 shrink-0">
                            {entry.occurrences.length}×
                          </Badge>
                          <span className={cn(
                            "text-[9px] font-mono shrink-0",
                            isViewed ? "text-emerald-600 dark:text-emerald-400" : "text-muted-foreground"
                          )}>
                            {isViewed ? "✓ viewed" : "○ unread"}
                          </span>
                        </div>
                      );
                    })}
                </div>
              </div>
            </ScrollArea>
          </TabsContent>
        </Tabs>
      </DialogContent>
    </Dialog>
  );
}
