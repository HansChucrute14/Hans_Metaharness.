"use client";

// src/components/docs/graph/graph-legend.tsx
// T6a: Extracted from dependency-graph.tsx orchestrator.
// Store-backed (reads graphSyncStatus directly from useDocStore, NOT prop-drilled).
// Visual output is identical to the pre-extraction inline Legend.
import { useState } from "react";
import { cn } from "@/lib/utils";
import { useDocStore } from "@/lib/doc-store";
import type { Lane } from "@/lib/dependency-graph";
import {
  Collapsible,
  CollapsibleContent,
  CollapsibleTrigger,
} from "@/components/ui/collapsible";
import { HelpCircle, ChevronDown } from "lucide-react";
import {
  CV,
  KIND_ACCENT,
  SEVERITY_COLOR,
  EDGE_COLOR,
  STATUS_COLOR,
} from "./graph-constants";

function LegendSwatch({ color, stroke, label }: { color: string; stroke: string; label: string }) {
  return (
    <div className="flex items-center gap-1.5">
      <span
        className="inline-block w-3 h-3 rounded-sm border-2"
        style={{ background: color, borderColor: stroke }}
      />
      <span className="text-muted-foreground">{label}</span>
    </div>
  );
}
function LegendRing({ color, label }: { color: string; label: string }) {
  return (
    <div className="flex items-center gap-1.5">
      <span
        className="inline-block w-3 h-3 rounded-sm border-2"
        style={{ borderColor: color, background: "transparent" }}
      />
      <span className="text-muted-foreground">{label}</span>
    </div>
  );
}
function LegendLine({ color, dash, label }: { color: string; dash: string; label: string }) {
  return (
    <div className="flex items-center gap-1.5">
      <svg width={28} height={8}>
        <line x1={0} y1={4} x2={28} y2={4} stroke={color} strokeWidth={2} strokeDasharray={dash} />
      </svg>
      <span className="text-muted-foreground">{label}</span>
    </div>
  );
}
function LegendBadge({ color, label }: { color: string; label: string }) {
  return (
    <span
      className="inline-block px-1.5 py-0.5 rounded text-[9px] font-mono font-bold text-white"
      style={{ background: color }}
    >
      {label}
    </span>
  );
}

export function GraphLegend({ lanes }: { lanes: Lane[] }): JSX.Element {
  const [open, setOpen] = useState(false);
  // Store-backed: reads graphSyncStatus directly (Decision 3 Persona B Attack 3 correction).
  // Currently unused visually but establishes the store-dependency pattern for future enhancements.
  const graphSyncStatus = useDocStore((s) => s.graphSyncStatus);

  return (
    <div
      className="absolute bottom-3 left-3 z-20 max-w-[300px] rounded-lg border backdrop-blur shadow-sm"
      style={{ background: "color-mix(in oklch, var(--popover) 92%, transparent)", borderColor: CV.border }}
    >
      <Collapsible open={open} onOpenChange={setOpen}>
        <CollapsibleTrigger asChild>
          <button
            className="flex items-center gap-1.5 px-2.5 py-1.5 text-[11px] font-medium w-full hover:bg-accent/40 rounded-lg transition-colors"
            aria-expanded={open}
            aria-label="Toggle legend"
          >
            <HelpCircle className="h-3.5 w-3.5" />
            <span className="hidden sm:inline">Legend</span>
            <ChevronDown className={cn("h-3 w-3 ml-auto transition-transform", open && "rotate-180")} />
          </button>
        </CollapsibleTrigger>
        <CollapsibleContent>
          <div className="px-2.5 pb-2.5 space-y-2.5 text-[10px] border-t pt-2" style={{ borderColor: CV.border }}>
            <div>
              <div className="font-semibold text-muted-foreground mb-1">Node kind</div>
              <div className="flex flex-wrap gap-2">
                <LegendSwatch color={CV.card} stroke={KIND_ACCENT.gate} label="gate" />
                <LegendSwatch color={CV.card} stroke={KIND_ACCENT.task} label="task" />
                <LegendSwatch color={CV.card} stroke={KIND_ACCENT.priority} label="priority" />
              </div>
            </div>
            <div>
              <div className="font-semibold text-muted-foreground mb-1">Severity (left accent bar)</div>
              <div className="flex flex-wrap gap-2">
                <LegendRing color={SEVERITY_COLOR.P0} label="P0" />
                <LegendRing color={SEVERITY_COLOR.P1} label="P1" />
                <LegendRing color={SEVERITY_COLOR.P2} label="P2" />
                <LegendRing color={SEVERITY_COLOR.P3} label="P3" />
              </div>
            </div>
            <div>
              <div className="font-semibold text-muted-foreground mb-1">Edge kind</div>
              <div className="space-y-1">
                <LegendLine color={EDGE_COLOR.blocks} dash="none" label="blocks" />
                <LegendLine color={EDGE_COLOR.recommended} dash="8 4" label="recommended" />
                <LegendLine color={EDGE_COLOR.pending} dash="6 4" label="pending" />
                <LegendLine color={EDGE_COLOR.backstops} dash="3 4" label="backstops" />
              </div>
            </div>
            <div>
              <div className="font-semibold text-muted-foreground mb-1">Status badges</div>
              <div className="flex flex-wrap gap-1.5">
                <LegendBadge color={STATUS_COLOR.pending} label="PENDING" />
                <LegendBadge color={STATUS_COLOR.urgent} label="URGENT" />
                <LegendBadge color={STATUS_COLOR.independent} label="INDEP" />
              </div>
            </div>
            <div>
              <div className="font-semibold text-muted-foreground mb-1">Hub weighting</div>
              <div className="flex items-center gap-2 flex-wrap">
                <span className="inline-flex items-center gap-1">
                  <span
                    className="inline-flex items-center justify-center w-4 h-4 rounded-full text-white text-[8px] font-bold"
                    style={{ background: SEVERITY_COLOR.P0 }}
                  >N</span>
                  <span className="text-muted-foreground">degree badge (N = edges)</span>
                </span>
                <span className="inline-flex items-center gap-1">
                  <span
                    className="inline-block w-5 h-3.5 rounded border-2"
                    style={{ borderColor: SEVERITY_COLOR.P0, background: "transparent" }}
                  />
                  <span className="text-muted-foreground">mega-hub halo</span>
                </span>
              </div>
              <div className="text-muted-foreground mt-1 leading-relaxed">
                4+ connections → thicker border + degree badge. 6+ → outer halo ring.
              </div>
            </div>
            <div>
              <div className="font-semibold text-muted-foreground mb-1">Semantic zoom</div>
              <div className="text-muted-foreground leading-relaxed">
                <div>&lt; 50%: hub-only skeleton view</div>
                <div>50–80%: all nodes, edge labels on hover</div>
                <div>&gt; 80%: full detail incl. edge labels</div>
              </div>
            </div>
          </div>
        </CollapsibleContent>
      </Collapsible>
    </div>
  );
}
