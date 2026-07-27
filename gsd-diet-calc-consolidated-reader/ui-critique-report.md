# Dependency Graph UI/UX Audit — Task 6-b

**Auditor**: general-purpose sub-agent (Task ID 6-b)
**Subject**: `src/components/docs/dependency-graph.tsx` (1,002 lines) + `src/lib/dependency-graph.ts` (NODE_TABLE / EDGE_TABLE)
**Method**: Static code review + 12 browser screenshots via `agent-browser` against `http://localhost:3000` (Bug Map doc, §D interactive graph opened with `g`)
**Verdict**: User's complaint ("extremely disproportionate", "way too ugly") is **substantiated on every axis** — layout, node rendering, edge rendering, color, interactivity, and information density all have measurable problems. Concrete rebuild recommendations in §G.

---

## 0. Screenshots captured

All screenshots saved to `/home/z/my-project/qa-graph-audit-*.png`. The browser viewport was 1280 × 577 (a common laptop window size with browser chrome).

| File | State captured | Key observation |
|---|---|---|
| `qa-graph-audit-00-initial.png` | App home, no dialog | Top bar has graph button (verified present) |
| `qa-graph-audit-01-initial-open.png` | Dialog just opened, default transform `{x:40, y:20, scale:0.85}` | Right ~330 px of world is **clipped off-screen** (C6/C13/C15/C16 column invisible) |
| `qa-graph-audit-01b-reopen-fit.png` | Dialog re-opened (2nd time) | `fitToView` effect does **not** re-fire (cached `data`) — stuck at scale 0.85 |
| `qa-graph-audit-02-zoom-in-twice.png` | After 2× zoom-in button | Scale 0.41 — still not enough to read labels |
| `qa-graph-audit-03-fit-to-view.png` | After clicking **Fit** button | Scale 0.32 — graph shrunk to ~482 px wide in 966 px container, **484 px of dead horizontal whitespace** |
| `qa-graph-audit-04-node-selected.png` | B7 clicked, inspector open | Inspector (288 px) shows B7 details; status badge overlaps label in node box (visible) |
| `qa-graph-audit-05-search-filter.png` | Search "B5" | Non-matches dimmed to 22 % opacity (only B5 visible); dimmed nodes still clutter |
| `qa-graph-audit-06-dark-mode.png` | Dark mode toggle | Fills flip to `*-950/80`; rings/arrows switch hue; **P2 yellow ring invisible on dark emerald fill** |
| `qa-graph-audit-07-panned.png` | Pan drag (transform → 904, 340) | Pan works; cursor stays "grab" even during drag (no "grabbing" feedback) |
| `qa-graph-audit-08-panned-zoomed.png` | Pan + wheel zoom combined | Scale 1.50 — labels readable, but only ~3 nodes visible at once (no minimap to navigate) |
| `qa-graph-audit-09-dark-mode-fit.png` | Dark mode + Fit (clean) | Cleanest dark-mode shot — graph centered with same horizontal whitespace problem |
| `qa-graph-audit-10-dark-panned.png` | Dark mode, attempted pan | (Pan delta didn't register in this run — same as 09; documents the **inconsistent pan behavior under synthetic events**.) |

---

## A. Layout proportionality issues

### A.1 The world aspect ratio is wrong for the container

| Quantity | Value |
|---|---|
| `WORLD.minX..maxX` | -40..1480 → **1 520 px wide** |
| `WORLD.minY..maxY` | 0..980 → **980 px tall** |
| World aspect | **1.55 : 1** |
| Dialog at 1280×577 viewport | 1 256 × 553 px |
| Header bar (logo+search+toolbar) | 1 254 × **160 px** (measured) — much taller than the ~50 px expected because the search input + 6 toolbar buttons wrap onto multiple rows when the viewport is narrow |
| Body (graph container + aside) | 1 254 × 391 px |
| Aside (inspector) | 288 × 391 px |
| **Graph container (SVG)** | **966 × 391 px** |
| **Container aspect** | **2.47 : 1** (very wide/short) |

`fitToView()` computes `scaleX = (966-80)/1520 = 0.582` and `scaleY = (391-80)/980 = 0.317`, then picks `min = 0.317`. So fit-to-view is **height-constrained**, and the world occupies only `1520 × 0.317 = 482 px` of the 966 px-wide container — leaving **484 px (50 %) of dead horizontal whitespace**. This is the single biggest reason the user perceives the graph as "disproportionate": at fit, the graph is a tiny horizontal strip floating in a wide empty canvas. (Confirmed in screenshots 03 and 09.)

At the default scale of 0.85, the world is `1520 × 0.85 = 1292 px` wide in a 966 px container — overflowing by 326 px and clipping the entire right-side "independents column" (C6, C13, C15, C16, B9, B10, B11, B2a, C1, C2). Confirmed in screenshot 01.

### A.2 Reopen bug: `fitToView` doesn't fire on second open

In `dependency-graph.tsx` line 611-616:

```tsx
useEffect(() => {
  if (data && open) {
    requestAnimationFrame(() => fitToView());
  }
}, [data, open, fitToView]);
```

This effect runs only when `data` *changes*. The fetch effect (line 378-401) bails with `if (!open || data) return;` so on a second open, `data` is unchanged → the fit effect doesn't fire → the dialog opens at the default `{x:40, y:20, scale:0.85}` and stays there. The reset effect (line 404-412) only restores `transform`, `search`, and `selectedId` — it does **not** call `fitToView`. Verified in screenshot 01b.

### A.3 Node positions: uneven spacing within rows

Manual review of `NODE_TABLE` in `src/lib/dependency-graph.ts` (line 55-176). All x values are absolute; horizontal gaps per row:

| Row | y | Nodes (x) | Gaps (px) | Notes |
|---|---|---|---|---|
| 0 | 70 | B0(90), G3(700), B9(1310) | 610 / 610 | Even but huge — visually disconnected |
| 1 | 190 | B3(480), B4(700), B2b(920), B2a(1140), B10(1310) | 220 / 220 / 220 / 170 | Mostly even |
| 2 | 310 | B7(480), B11(1310) | **830** | Single huge gap |
| 3 | 430 | B1(200), B5(380), B6(560), B8(740), C1(1140), C2(1310) | 180 / 180 / 180 / **400** / 170 | **400 px gap** between B8 and C1 |
| 4 | 550 | C7(60), C8(170), C9(280), C10(390), C11(500), C12(610), C14(720), B12(920), C6(1310) | 110×6 / 200 / **390** | **390 px gap** between B12 and C6 — the most visually jarring row |
| 5 | 670 | C5(560), C4(1140), C13(1310) | **580** / 170 | **580 px gap** between C5 and C4 |
| 6 | 790 | R1(280), R2(450), R3(620), R4(790), C15(1310) | 170×3 / **520** | **520 px gap** between R4 and C15 |
| 7 | 900 | R5(540), C16(1310) | **770** | Single huge gap |

**Root cause**: the layout tries to do two things at once — (1) lay out the main DAG, and (2) park independent nodes in an implicit "independents column" at x ≈ 1140 or 1310. The two intents are not visually separated; the independents column is invisible (no vertical separator, no header), so it just reads as inconsistent spacing. Rows 2-7 all suffer from this.

### A.4 Node overlap / collision

No nodes overlap (the smallest x-gap in any row is 110 px and `NODE_WIDTH=168`, so nodes are at minimum 110 px center-to-center and 168 px edge-to-edge — they would overlap if at x=60 and x=170 like C7/C8 — wait, x=60 → right edge 228, x=170 → left edge 170 → **C7 and C8 overlap by 58 px**!). Let me re-check: C7 at x=60, NODE_WIDTH=168 → C7 right edge = 60+168 = 228. C8 at x=170 → C8 left edge = 170. So C7's right edge is at 228, C8's left edge is at 170 — **C7 and C8 overlap by 58 px**. Same for C8/C9, C9/C10, C10/C11, C11/C12, C12/C14, C14/B12. Row 4 has 7 overlapping pairs. This is visible in screenshot 03 — the C7-C12 cluster looks like a single smeared bar, not 6 distinct nodes.

### A.5 Vertical row spacing

Row gap is ~120 px (y=70, 190, 310, 430, 550, 670, 790, 900 — but last gap is only 110). `NODE_HEIGHT=48`, so vertical node-to-node gap = 120-48 = 72 px — adequate for edges between rows. No vertical overlap.

### A.6 SVG aspect ratio vs. dialog aspect ratio — does fit actually fit?

No. See A.1. The fit-to-view leaves ~50 % horizontal whitespace at desktop sizes. On a wider monitor (1920 px viewport) the container would be ~1608×391 px (aspect 4.1:1) and the whitespace problem gets **worse**, not better. On a portrait/mobile viewport the problem inverts (graph overflows vertically). The fixed `WORLD` bounds (1520×980) and the fixed aside width (288 px) together guarantee the mismatch on every viewport.

---

## B. Node rendering issues

### B.1 Constants in use

```ts
NODE_WIDTH  = 168
NODE_HEIGHT = 48
fontSize    = 11            // monospace, fontWeight 600
label       = node.label.length > 26 ? node.label.slice(0, 24) + "…" : node.label
kind icon   = circle cx=12 cy=NODE_HEIGHT/2 r=5  // 10 px diameter
severity ring = rect at (-3, -3), w=NODE_WIDTH+6, h=NODE_HEIGHT+6, rx=10, strokeWidth=3, opacity=0.7
status badge = at (NODE_WIDTH-50, 4), w=46, h=13, rx=3, fontSize=8
```

### B.2 Status badge overlaps label text (high-severity bug)

Status badge is positioned at `(NODE_WIDTH-50, 4) = (118, 4)` and is 46 px wide → extends to x=164. Label text starts at x=26 with monospace 11 px font (≈ 6.6 px/char). Labels longer than `(118-26)/6.6 ≈ 14 chars` will be **overlapped by the badge**. Inventory of affected nodes (every node with a status flag):

| Node | Label (truncated) | Char count | Status | Overlap? |
|---|---|---|---|---|
| B0 | "B0 · safety freeze" | 18 | INDEP | ✗ yes |
| G3 | "G3 · vet sign-off" | 17 | PENDING | ✗ yes |
| B5 | "B5 · restore _shared.py [URGE…" (truncated) | 26 | URGENT | ✗ yes |
| B9 | "B9 · delete obj_weights" | 23 | INDEP | ✗ yes |
| B2a | "B2a · harden antagonism…" (truncated) | 25 | INDEP | ✗ yes |
| B10 | "B10 · fix stage order" | 21 | INDEP | ✗ yes |
| B11 | "B11 · diagnose L1" | 17 | INDEP | ✗ yes |
| C2 | "C2 · status branching" | 21 | INDEP | ✗ yes |
| C6 | "C6 · FDC key in header" | 22 | INDEP | ✗ yes |
| C13 | "C13 · runtime validation" | 24 | INDEP | ✗ yes |
| C15 | "C15 · bug-numbering" | 19 | INDEP | ✗ yes |
| C16 | "C16 · dead floor-relax…" (truncated) | 25 | INDEP | ✗ yes |

**Every single status-bearing node has overlap.** Confirmed visually in screenshot 04 (B7's neighbors).

### B.3 Truncation breaks meaning

Labels are sliced at 24 chars + "…". Three labels suffer:

- `B5 · restore _shared.py [URGENT]` (31 chars) → `B5 · restore _shared.py [URGE…` — the **URGENT suffix is cut off** in the label, leaving the meaning unclear (the status badge says URGENT but the label no longer does)
- `B2a · harden antagonisms L1` (27 chars) → `B2a · harden antagonism…` — the "L1" qualifier is gone, which is the whole point (Level-1 antagonisms)
- `C16 · dead floor-relaxation` (27 chars) → `C16 · dead floor-relaxat…` — truncated mid-word

### B.4 Severity rings invisible at fit-to-view

At fit (scale 0.32), the severity ring's `strokeWidth=3` becomes `3 × 0.32 = 0.96 px` on screen — below the 1-px visibility threshold for most displays. The ring's `opacity=0.7` further reduces it. At default scale 0.85, ring is `2.55 px` — visible. So severity rings are **only visible when the user has manually zoomed in**. Confirmed in screenshot 03 — P0/P1 rings around B0, B7, B5 are not perceptible at fit.

### B.5 Status badges illegible at fit

At fit (scale 0.32), `fontSize=8` becomes `2.6 px` on screen. The text "PENDING" (7 chars × 5 px = 35 px wide originally) shrinks to ~11 px — readable as a colored blob but not as text. The badge background color is the only signal.

### B.6 Kind fills too pale (light mode)

Light-mode fills are `violet-50 / emerald-50 / slate-50` (RGB ~245,243,255 / 236,253,245 / 248,250,252). All three are within ΔE < 3 of white (255,255,255). The kind cannot be determined from fill alone — the user must look at the kind dot (5 px circle) or the stroke color. This is especially bad for users with color-vision deficiencies.

### B.7 Node kind dot too small

`circle cx=12 cy=NODE_HEIGHT/2 r=5` is a 10 px-diameter dot. At fit (scale 0.32) it's 3.2 px — barely perceptible. At default 0.85 it's 8.5 px — OK.

### B.8 Priority kind never used

`NodeKind = "task" | "gate" | "priority"` — but **no node in `NODE_TABLE` has `kind: "priority"`**. The slate palette (`kindFill` default case, `kindStroke` slate-500) is dead code. Either remove it or actually use it (e.g., for P0-critical nodes B0, B5).

---

## C. Edge rendering issues

### C.1 Constants in use

```ts
curvePath: cubic bezier, control points at (x1, y1+dy/2) and (x2, y2-dy/2) — vertical-leaning
edgeEndpoints: anchors top/bottom for vertical flow (dy≥dx), left/right for horizontal flow
arrow marker: viewBox 0 0 10 10, refX=9, refY=5, markerWidth=7, markerHeight=7, orient=auto-start-reverse
strokeWidth: highlighted=2.4, default=1.4
dasharray: pending="6 4", recommended="2 3", backstops="1 3", blocks="none"
edge label: at midpoint (x1+x2)/2, (y1+y2)/2 - 4, fontSize=9, monospace
opacity: dimmed=0.12, highlighted=1, default=0.7
```

### C.2 Backstops pattern "1 3" is invisible

`strokeDasharray="1 3"` means 1 px dot, 3 px gap → 25 % ink. At default scale 0.85, that's a 0.85 px dot every 3.4 px — at the limit of visibility. At fit (0.32), it's 0.32 px dots every 1.3 px — **a uniform faint line**, indistinguishable from a solid 0.12-opacity edge. The B0→G3, B0→B7, B0→B2a backstops edges (the most important safety-net edges in the graph) are effectively invisible. This is the single worst edge-rendering bug.

### C.3 Recommended pattern "2 3" nearly invisible

Same problem, less severe. `2 3` at fit = 0.64 px dots — visible as a faint dotted line but not distinguishable from "backstops" without comparing carefully.

### C.4 Pending vs recommended vs backstops are hard to distinguish

All three are dashed/dotted. The dash ratios are 6:4 (1.5), 2:3 (0.67), 1:3 (0.33) — varying enough in principle, but at fit (0.32) all three shrink below the visibility threshold. The legend swatches use `4 2` for *all* dashed lines — so the legend doesn't actually represent the rendered patterns.

### C.5 Arrowheads too small

`markerWidth=7, markerHeight=7` → 7 × 7 px arrowheads. At fit (0.32) they're 2.2 × 2.2 px — invisible. At default 0.85 they're 6 × 6 px — adequate. The arrow path `M 0 0 L 10 5 L 0 10 z` is a solid triangle; on a colored dashed line the arrowhead color (matching the edge color via `fill={edgeColor(k, isDark)}`) is OK but small.

### C.6 Edge labels on only 2 of 30 edges

Only `G3 → B2b` ("G3 thresholds") and `B7 → B5` ("recommended") have labels. The other 28 edges are unlabeled. The label `fontSize=9` at fit (0.32) becomes 2.9 px — illegible.

### C.7 Edge label placement math is wrong for curves

```tsx
<text x={(x1 + x2) / 2} y={(y1 + y2) / 2 - 4} ...>{label}</text>
```

This places the label at the **linear midpoint of the endpoints**, but the actual curve midpoint (per `curvePath`'s cubic bezier) is elsewhere. For a near-vertical edge the error is small; for diagonal edges (e.g., B7→C5 from (564,334) to (644,694)) the bezier midpoint is at (604, 514) but the label is placed at (604, 512) — close enough in this case, but for long horizontal-ish curves the label can land off the curve entirely.

### C.8 Edge labels have no background

`fontSize=9` text drawn directly on the canvas / over the dotted grid / over other edges — no `paint-order: stroke` or background rect. Low contrast, frequently unreadable.

### C.9 Fan-out from high-fanout nodes collapses into a single thick line

B5 has 7 outgoing edges (to C7, C8, C9, C10, C11, C12, C14). All 7 originate from B5's bottom-center anchor `(f.cx, from.y + NODE_HEIGHT) = (464, 478)` and fan out to children at y=550. Near B5 the 7 lines overlap into a single thick line, only separating as they approach the children. Same issue at B7 (6 outgoing edges from one anchor). Confirmed in screenshot 03.

### C.10 Edges drawn before nodes — arrowheads visible, but curve under nodes

Edges are rendered first (line 754), then nodes (line 776). This means edge curves pass *under* nodes, which is correct — but the arrowhead (`markerEnd`) is at the edge endpoint, which is anchored at the node border via `edgeEndpoints`. So arrowheads sit just outside the node — visible. No issue here.

### C.11 No edge selection / inspection

Edges are not interactive. You cannot click an edge to see its label, kind, or endpoints in the inspector. The 28 unlabeled edges have no discoverable semantics.

---

## D. Color system issues

### D.1 Current palette (from source)

**Light mode**
| Role | Color | RGB | Notes |
|---|---|---|---|
| gate fill | `violet-50` | 245 243 255 | ΔE < 3 from white |
| task fill | `emerald-50` | 236 253 245 | ΔE < 3 from white |
| priority fill | `slate-50` | 248 250 252 | ΔE < 2 from white (dead code) |
| gate stroke | `violet-500` | 139 92 246 | OK |
| task stroke | `emerald-500` | 16 185 129 | OK |
| priority stroke | `slate-500` | 100 116 139 | OK |
| P0 ring | `rose-500` | 244 63 94 | OK |
| P1 ring | `orange-500` | 249 115 22 | OK |
| P2 ring | `yellow-500` | 234 179 8 | **Low contrast on pale fills** |
| P3 ring | `gray-400` | 156 163 175 | **Low contrast on pale fills** |
| edge blocks | `emerald-600` | 5 150 105 | OK |
| edge pending | `rose-600` | 225 29 72 | OK |
| edge recommended | `orange-600` | 234 88 12 | OK |
| edge backstops | `slate-500` | 100 116 139 | OK |

**Dark mode**
| Role | Color | RGB | Notes |
|---|---|---|---|
| gate fill | `violet-950/80` | 46 16 101 @ 80 % | Muddy |
| task fill | `emerald-950/80` | 6 46 32 @ 80 % | Muddy |
| priority fill | `slate-950` | 15 23 42 | Pure dark |
| edge blocks | `teal-300` | 94 234 212 | **Inconsistent — was emerald, switched to teal** |
| edge pending | `rose-400` | 251 113 133 | OK |
| edge recommended | `orange-300` | 253 186 116 | OK |
| edge backstops | `slate-400` | 148 163 184 | OK |

### D.2 Specific contrast problems

1. **P2 yellow ring on emerald-50 task fill**: both are light pastels — the yellow ring is hard to see against the green-tinted fill. WCAG contrast ratio ≈ 1.4:1 (fails).
2. **P3 gray ring on slate-50 priority fill**: both near-white — invisible. Ratio ≈ 1.2:1.
3. **Light-mode fills indistinguishable from each other**: violet-50 vs emerald-50 vs slate-50 all read as "off-white" — kind cannot be determined from fill alone.
4. **Dark-mode fills use 80 % opacity**: causes muddy appearance against the `slate-950/40` background (line 700: `bg-background dark:bg-slate-950/40`). The 20 % bleed-through of the background darkens the fills unevenly.
5. **Dark-mode `blocks` edge color switched from emerald to teal** (line 121: comment says "was emerald-400") — inconsistent with light mode (which uses emerald-600) and with the kind fill (emerald). Why? Probably because `emerald-400` on `emerald-950` fill was deemed too close in hue — but the fix introduces a hue inconsistency between light/dark.
6. **Legend swatches use hardcoded RGB** (line 803-818) that match the *light-mode* colors regardless of theme — the `LegendLine` helper (line 979-1000) manually re-maps dark-mode colors but the logic is brittle and incomplete (it doesn't handle the P2 yellow → dark-mode shift, for instance).

### D.3 Semantic color mapping is unclear

- `blocks` edges are **emerald** (green = "go"?) — but a blocking edge means "A must finish before B can start", which is more like a "barrier" than a "go" signal. Conventional Gantt/dependency tools use neutral gray or blue for blocking edges.
- `pending` edges are **rose** (red = "stopped") — semantically aligned (G3 is the bottleneck).
- `recommended` edges are **orange** — arbitrary.
- `backstops` edges are **slate** — neutral, OK.
- Status badges: PENDING=rose, URGENT=orange, INDEP=emerald, DONE=sky — these double up with edge colors (PENDING rose = pending edge rose; URGENT orange = recommended edge orange). When a node has an URGENT badge and is connected by a recommended edge, the colors collide.

### D.4 Dark mode polish

Screenshot 09 shows dark mode. Specific issues:
- The dark background uses `bg-slate-950/40` (40 % opacity slate-950) — but the parent `bg-background` resolves to `lab(2.75 % 0 0)` (near-black). The 40 % overlay barely changes the color, making the dark-mode canvas look identical to the surrounding chrome (no visual separation).
- Node fills at 80 % opacity over the canvas produce a faint muddy halo around each node.
- The dotted grid (`circle r=1 fill=slate-700 opacity=0.5`) becomes `slate-700` at 50 % opacity over near-black — barely visible (intentional? but inconsistent with the visible grid in light mode).
- The header bar `bg-muted/30` becomes `slate-800/30` — barely different from the canvas.

---

## E. Interactivity issues

### E.1 Pan

- **Implementation**: pointer-events on background SVG, `setPointerCapture` on `e.target`, 3 px `moved` threshold to distinguish drag from click. (line 462-527)
- **Feel**: pan uses screen-space delta directly (`transform.x += dxScreen`), which is correct for pan (the world should follow the cursor 1:1 regardless of zoom).
- **Issue 1**: cursor stays `cursor: "grab"` during drag (line 721) — should switch to `cursor: "grabbing"` for visual feedback.
- **Issue 2**: no touch support — `touchAction: "none"` is set (line 701) but the pointer events use `button: 0` filter (line 463) which excludes touch contacts in some browsers. Untested on touch.
- **Issue 3**: pan is disabled when a node is being dragged (correct), but there's no visual cue that the drag is happening (no cursor change, no node highlight, no shadow).

### E.2 Zoom

- **Wheel zoom**: `delta * 0.0015` sensitivity (line 537) — feels sluggish (need 5+ wheel ticks for noticeable zoom). Compare to Figma/Miro which use ~0.005.
- **Zoom-to-cursor**: implemented correctly (line 540-548). World point under cursor is preserved.
- **Button zoom**: zooms to **viewport center** (line 553-578), not to cursor. Inconsistent with wheel. If user wheels into a corner, then clicks zoom-in, the view jumps to center — disorienting.
- **ZOOM_STEP = 0.15** (15 % per click) — reasonable.
- **MIN_ZOOM = 0.2, MAX_ZOOM = 3**: at fit (0.32), the user can zoom out to 0.2 (62 % of fit) — but there's nothing to see at 0.2 (everything smaller). MIN_ZOOM should be the fit scale, not a hardcoded 0.2.

### E.3 Node drag

- **Implementation**: pointerdown on node `<g>` (line 209), `stopPropagation` so background pan doesn't fire, screen-delta divided by scale to get world-delta (line 509-510). Correct.
- **Issue 1**: dragged node has no visual feedback (no shadow, no opacity change, no z-order bump). The node just moves silently.
- **Issue 2**: dragged node doesn't bring its connected edges with it visually during the drag — edges re-render on every `setNodePositions` call (line 511), which is correct, but the React.memo on `EdgeView` doesn't know that the `from`/`to` props changed unless the position object identity changed. Since `effectiveNodes` is rebuilt via `useMemo` (line 422-428), the position update propagates — but every edge re-renders, defeating the memo. On 30 edges this is fine; on 300 it would lag.
- **Issue 3**: no undo. If you accidentally drag a node off-screen, you have to click "Reset" (which resets *all* node positions, losing intentional repositioning).
- **Issue 4**: drag threshold is 3 px (line 499) — too low. A 3 px movement on a 5 px node-label character is enough to register as a drag instead of a click. Should be 5 px.

### E.4 Click selection

- **Click**: `handleNodeClick` toggles `selectedId` (line 620-625), unless `dragState.current.moved` is true (drag detection).
- **Background click**: deselects (`onClick={() => setSelectedId(null)}` line 727). **Aggressive** — clicking the background by accident (e.g., during a pan) loses the selection. Should require an explicit Esc press or click on empty space with no drag.
- **No multi-select**: shift-click doesn't add to selection. Cmd-click doesn't either. Only single-node selection is possible.
- **No keyboard navigation**: no arrow-key movement between connected nodes, no Tab-through-nodes. Accessibility issue.

### E.5 Inspector panel

- **Layout**: `hidden md:flex w-72` (line 834) — 288 px wide, hidden on mobile. Always visible on desktop, even when no node is selected.
- **When no selection**: shows "Click a node to inspect" + Graph stats panel (35 nodes / 30 edges / 1 pending / 13 independent / 1 urgent). Useful but feels like a placeholder.
- **When selected**: shows node ID (font-mono bold), kind badge, severity badge, status badge, label, description, "Blocked by (N)" chips, "Blocks (N)" chips, "Jump to first occurrence" button.
- **Issue 1**: inspector always takes 288 px even when empty — wastes screen real estate that the graph needs.
- **Issue 2**: no collapse button — can't hide the inspector to give the graph full width.
- **Issue 3**: "Blocked by" and "Blocks" chips are buttons that change selection — but there's no breadcrumb / back button to return to the previously-selected node.
- **Issue 4**: description text is `text-xs leading-relaxed` (line 880) — readable but doesn't scroll if it overflows the panel. Long descriptions (e.g., B5's 286-char description) require scrolling the whole panel.
- **Issue 5**: "Jump to first occurrence" button (line 920-927) is full-width at the bottom — easy to misclick when scrolling.

### E.6 Search filter

- **Implementation**: input in header bar (line 660-668), `matchSet` computed via `useMemo` (line 437-447), non-matches dimmed to 22 % opacity (line 197).
- **Issue 1**: dimmed nodes are still in the DOM and still receive pointer events — clicking a dimmed node still selects it. Should be `pointer-events: none` when dimmed.
- **Issue 2**: search matches against `id`, `label`, `description` — but the placeholder says "Filter nodes…", not "Search ID/label/description". Mismatched expectations.
- **Issue 3**: no result count shown — user doesn't know how many nodes matched.
- **Issue 4**: no clear button — user must manually delete the query.
- **Issue 5**: search doesn't highlight *which part* of the label matched (no `<mark>` or bold).
- **Issue 6**: search input is in the header bar (away from the graph) — feels disconnected. Should be a floating search box over the graph.

### E.7 Tooltip

- **Implementation**: shadcn `Tooltip` wrapping each `NodeView`'s `<g>` (line 203-288), `delayDuration=300`, content shows id + description + kind/severity/status badges.
- **Issue 1**: tooltip is HTML (Radix), positioned in screen space — does **not** scale with SVG zoom. Tooltip text is always 11 px CSS regardless of graph zoom level.
- **Issue 2**: tooltip blocks pointer events on the node (Radix default) — can't hover one node and click another.
- **Issue 3**: tooltip content max-width 320 px — long descriptions (B0: 296 chars, B5: 286 chars, G3: 287 chars) wrap to many lines. Tooltip grows tall, can extend below the viewport.
- **Issue 4**: tooltip doesn't show "Blocked by / Blocks" counts — user must click the node to see connectivity.

---

## F. Information density issues

### F.1 Legend

- **Position**: bottom-left overlay, `max-w-[260px]`, `text-[10px]`, `bg-background/95 backdrop-blur` (line 798).
- **Content**: 3 sections — Node kind (2 entries: task, gate), Severity ring (4 entries: P0/P1/P2/P3), Edge kind (4 entries: blocks, pending (G3), recommended, backstops). 10 entries total.
- **Issue 1**: legend **overlaps the bottom-left nodes** at any zoom level. C7 (x=60, y=550), C8 (x=170, y=550) sit *under* the legend (legend starts at bottom-3, left-3, extends up ~120 px and right ~260 px). At fit, the legend covers ~25 % of the visible graph area. Confirmed in screenshot 03.
- **Issue 2**: legend swatches are tiny — `LegendDot` is `w-3 h-3` (12 px), `LegendRing` is `w-3 h-3 border-2` (12 px with 2 px border), `LegendLine` SVG is `28×8` px. At a glance, P2 yellow ring and P3 gray ring are hard to distinguish.
- **Issue 3**: legend edge-line dash patterns don't match the actual rendered dash patterns. `LegendLine` always uses `4 2` for dashed (line 995), regardless of edge kind. So the legend's "pending" swatch looks the same as the "recommended" swatch looks the same as the "backstops" swatch — only color differs.
- **Issue 4**: "priority" node kind is in the source code but not in the legend (only task + gate are shown).
- **Issue 5**: legend is always visible — no toggle, no collapse. Clutters the canvas.

### F.2 Toolbar (header bar)

- **Layout**: 1 row, 9 elements — logo+title, search input (w-48), spacer, zoom out, % indicator (w-10), zoom in, fit, reset, close X.
- **Issue 1**: at the test viewport (1280×577), the header bar measured **160 px tall** (expected ~50 px). The buttons wrap onto multiple rows. At narrower viewports this gets worse.
- **Issue 2**: % indicator `w-10` (40 px) shows "100%" fine, but "32%" has trailing whitespace and "150%" overflows. Should use `tabular-nums` (it does, line 675) but the width is too tight.
- **Issue 3**: "Out" and "In" labels are hidden on small screens (`hidden sm:inline`) but the icons are tiny (`h-3.5 w-3.5` = 14 px). On mobile, the toolbar is just a row of inscrutable 14 px icons.
- **Issue 4**: no keyboard shortcut hints in the toolbar (e.g., "Fit = F", "Reset = R", "Zoom in = +"). The hint overlay (top-left) mentions pan/zoom/click but not these shortcuts (and they don't exist anyway).
- **Issue 5**: search input is `w-48` (192 px) — takes ~15 % of header width on a 1254 px dialog. Should be `flex-1` to grow with available space, or moved to a floating search box.

### F.3 Hint overlay

- **Content**: "Drag bg to pan · Wheel to zoom · Drag node to move · Click to select" (line 827)
- **Issue 1**: always visible, `pointer-events-none`. Clutters top-left, overlapping B0 (x=90, y=70) and B3 (x=480, y=190) at fit.
- **Issue 2**: no dismiss button. User can't make it go away after they've learned the controls.
- **Issue 3**: should be a one-time onboarding tooltip, not a permanent overlay.

### F.4 Stats panel (inspector when no selection)

- 5 stats: nodes, edges, pending, independent, urgent.
- Adequate, but missing useful stats: P0 count, gate count, critical-path length, max fan-in/fan-out.

### F.5 General density assessment

The graph has **35 nodes and 30 edges in 1 520 × 980 = 1.49 M px²** = 1 node per 42 K px². At fit (scale 0.32), that's 1 node per 4.3 K screen px² — visually sparse. But the **horizontal whitespace problem** (A.1) means the perceived density is uneven — dense cluster in the center, empty columns on either side.

The legend + hint overlay + inspector + header bar consume **~45 % of the screen** at fit, leaving only 55 % for the actual graph. The graph needs that real estate back.

---

## G. Specific rebuild recommendations

### G.1 Replace custom SVG with `@xyflow/react` (recommended) or `dagre` (minimal)

**Recommendation: use `@xyflow/react` (formerly `react-flow`)**, version 12+, which is React 19 / Next 16 compatible.

Rationale:
- 35 nodes / 30 edges is well within react-flow's comfort zone (handles 1000s of nodes).
- Provides **out of the box**: pan, zoom (to cursor), drag (with visual feedback), minimap, controls (zoom in/out/fit/lock), background patterns (dots/grid/cross), edge routing (bezier/straight/smoothstep), edge labels, custom node/edge renderers, keyboard navigation, multi-select.
- ~150 KB gzipped including default styles — acceptable for a documentation feature.
- Custom node renderer keeps our kind/severity/status design.
- Custom edge renderer keeps our dashed-pattern logic.
- **Eliminates ~600 lines of custom pan/zoom/drag code** in `dependency-graph.tsx`.

**Alternative (lower risk)**: keep custom SVG, use **`@dagrejs/dagre`** (or `dagre-compound`) just for layout. dagre computes positions automatically given edges + ranks. ~50 KB gzipped, no UI. Replaces the brittle hand-maintained `NODE_TABLE` positions with auto-layout. Trade-off: still need to maintain all the pan/zoom/drag/inspector code.

**Not recommended**:
- `d3-hierarchy` — for trees only (single-parent); our graph has multiple parents (B12 ← B7 + B1, C14 ← B5 + B6, C5 ← B7 + B8 + B6, R5 ← R1-R4).
- `elk-js` — overkill (2 MB) for 35 nodes. ELK is designed for much larger graphs with port-based routing.
- `cytoscape.js` — full canvas-based renderer, would replace the SVG approach entirely. Heavier, less React-idiomatic.

**Concrete plan if react-flow is approved**:
1. `bun add @xyflow/react`
2. Wrap graph in `<ReactFlow>` with `fitView` prop (solves A.2 reopen bug automatically).
3. Define custom `NodeType` renderer that wraps the existing `NodeView` body (kind fill, severity ring, status badge, two-line label).
4. Define custom `EdgeType` renderer that wraps the existing `EdgeView` (dashed patterns, arrow markers).
5. Add `<MiniMap>` (bottom-right, 120×80 px, pannable) — solves "where am I?" problem.
6. Add `<Controls>` (bottom-left, vertical button stack) — replaces current toolbar zoom/fit/reset buttons.
7. Add `<Background variant="dots" gap={20} />` — replaces current `<pattern id="grid">`.
8. Use `dagre` as the layout engine (via `getLayoutedElements` helper from react-flow docs) — replaces `NODE_TABLE` positions.
9. Keep the header bar (logo, title, search, layout-mode switcher, kind/severity filters, edge-label toggle, critical-path button, close).
10. Keep the inspector panel (right side), but make it collapsible.

### G.2 New node positions (if keeping manual layout)

If react-flow is rejected and manual positions are kept, propose this revised layout with **even 220 px horizontal spacing per row** and **a dedicated independents sidebar** at x=1300:

```
Row 0 (y=80):   B0(120)   G3(360)   B9(600)                                   [3 nodes, main]
Row 1 (y=200):  B3(120)   B4(360)   B2b(600)   B2a(840)                        [4 nodes, main]
Row 2 (y=320):  B7(360)   B11(600)  B10(840)                                   [3 nodes, main]
Row 3 (y=440):  B1(120)   B5(360)   B6(600)   B8(840)   C1(1080)               [5 nodes, main + 1]
Row 4 (y=560):  C7(60)  C8(180)  C9(300)  C10(420)  C11(540)  C12(660)  C14(780)  B12(960)   [8 nodes, dense]
Row 5 (y=680):  C5(420)   C4(720)                                              [2 nodes, main]
Row 6 (y=800):  R1(180)   R2(360)   R3(540)   R4(720)                          [4 nodes, regression]
Row 7 (y=920):  R5(540)                                                     [1 node, terminal]

Independents sidebar (x=1280, vertical stack, y=80→880, 100 px spacing):
  B9 → y=80     (moved from Row 0 main)
  B10 → y=180   (moved from Row 2 main)
  B11 → y=280   (moved from Row 2 main)
  C2 → y=380
  C6 → y=480
  C13 → y=580
  C15 → y=680
  C16 → y=780
```

World bounds become: main area `x ∈ [60, 1080]`, sidebar `x = 1280`, total width 1360; height 980. Aspect **1.39 : 1** — closer to typical container aspect (1.75-2.5:1) and reducing the horizontal-whitespace problem.

Even better: separate the sidebar with a **dashed vertical divider line** at x=1180 and a "INDEPENDENT — can start now" header above it.

Row 4 still has 8 nodes in 960 px → 120 px spacing. With `NODE_WIDTH=180`, edge-to-edge gap = 120-180 = **-60 px overlap**. So Row 4 needs either (a) wider canvas (1300 px for 8 nodes at 180 wide + 60 px gaps), (b) smaller nodes (NODE_WIDTH=100), or (c) two sub-rows. Recommend (a): make Row 4 span x=60 to x=1300 with 180 px spacing — C7(60), C8(240), C9(420), C10(600), C11(780), C12(960), C14(1140), B12(1300). Then independents sidebar moves to x=1500.

### G.3 New node rendering spec

```ts
NODE_WIDTH          = 180   // was 168 — more label room
NODE_HEIGHT         = 56    // was 48 — supports 2-line label
PADDING_X           = 12
PADDING_Y           = 8
CORNER_RADIUS       = 10    // was 8

// Label: split at "·" into 2 lines
LABEL_FONT_SIZE     = 12    // was 11
LABEL_FONT_FAMILY   = "ui-monospace, SFMono-Regular, Menlo, monospace"
LABEL_LINE_HEIGHT   = 14
LABEL_ID_WEIGHT     = 700   // bold for "B5"
LABEL_DESC_WEIGHT   = 500   // medium for "restore _shared.py [URGENT]"
LABEL_TRUNCATE      = 28    // was 24 — leaves room since label is now 2 lines

// Kind icon: replace 10 px circle with 16 px square icon (Shield/CheckSquare/Hash)
KIND_ICON_SIZE      = 16
KIND_ICON_X         = 10
KIND_ICON_Y         = NODE_HEIGHT/2 - 8  // centered

// Severity ring: thicker, more inset, full opacity
SEVERITY_RING_THICKNESS = 4   // was 3
SEVERITY_RING_INSET     = 4   // was 3
SEVERITY_RING_OPACITY   = 1   // was 0.7
SEVERITY_RING_CORNER    = 12  // match NODE corner + 2

// Status badge: moved OUTSIDE node, top-right, no overlap
STATUS_BADGE_WIDTH     = 52   // was 46
STATUS_BADGE_HEIGHT    = 16   // was 13
STATUS_BADGE_FONT      = 9    // was 8
STATUS_BADGE_POSITION  = { x: NODE_WIDTH - 4, y: -STATUS_BADGE_HEIGHT/2 }  // straddles top-right corner
STATUS_BADGE_ANCHOR    = "end"  // right-aligned, half above node
```

Two-line label format:
- Line 1 (y=20, bold, 12 px): "B5"
- Line 2 (y=36, medium, 11 px): "restore _shared.py [URGENT]"
- Truncation only on line 2, at 28 chars + "…"

This eliminates the status-badge overlap (B.2) for 100 % of nodes, eliminates truncation for ~95 % of labels (B.3), and makes labels readable at fit (12 px × 0.32 = 3.8 px — still small but legible at 16-bit color).

### G.4 New edge rendering spec

```ts
DEFAULT_STROKE_WIDTH   = 1.8   // was 1.4
HIGHLIGHT_STROKE_WIDTH = 3.0   // was 2.4
DIMMED_OPACITY         = 0.15  // was 0.12
DEFAULT_OPACITY        = 0.75  // was 0.7

// Arrow markers: bigger, with stroke for definition
ARROW_VIEWBOX          = "0 0 12 12"
ARROW_REF_X            = 11    // was 9
ARROW_REF_Y            = 6
ARROW_MARKER_WIDTH     = 10    // was 7
ARROW_MARKER_HEIGHT    = 10
ARROW_PATH             = "M 0 0 L 12 6 L 0 12 L 3 6 z"  // chevron, not solid triangle

// Dash patterns: more visible
DASH_PATTERNS = {
  blocks:      "none",
  pending:     "10 5",     // was "6 4"  — longer dashes
  recommended: "5 5",      // was "2 3"  — clearly dotted
  backstops:   "3 5",      // was "1 3"  — visible sparse dots
}

// Edge labels: bigger, with background, accurate midpoint
EDGE_LABEL_FONT_SIZE    = 10    // was 9
EDGE_LABEL_PADDING      = 3
EDGE_LABEL_BG_FILL      = "var(--background)"  // theme-aware
EDGE_LABEL_BG_OPACITY   = 0.85
EDGE_LABEL_PLACEMENT    = "bezier-midpoint"  // use path.getPointAtLength(len/2)
EDGE_LABEL_DEFAULT_SHOW = false
EDGE_LABEL_TOGGLE       = true   // toolbar button
```

Edge label placement should use the actual bezier midpoint, not the linear midpoint:

```ts
const pathEl = document.createElementNS("http://www.w3.org/2000/svg", "path");
pathEl.setAttribute("d", path);
const mid = pathEl.getPointAtLength(pathEl.getTotalLength() / 2);
// use mid.x, mid.y for label position
```

Or in react-flow, use the `EdgeLabelRenderer` component which handles this automatically.

### G.5 New color palette

**Light mode**
```css
--node-gate-fill:       hsl(263 70% 96%);   /* violet-100 — was violet-50 */
--node-gate-stroke:     hsl(263 70% 50%);   /* violet-600 — was violet-500 */
--node-task-fill:       hsl(152 60% 94%);   /* emerald-100 — was emerald-50 */
--node-task-stroke:     hsl(152 60% 38%);   /* emerald-600 — was emerald-500 */
--node-priority-fill:   hsl(215 25% 94%);   /* slate-100 */
--node-priority-stroke: hsl(215 25% 40%);   /* slate-600 */

--ring-p0: hsl(348 80% 50%);   /* rose-500 — kept */
--ring-p1: hsl(28 90% 50%);    /* orange-500 — kept */
--ring-p2: hsl(45 95% 45%);    /* amber-600 — was yellow-500, better contrast */
--ring-p3: hsl(220 10% 55%);   /* gray-500 — was gray-400, better contrast */

--edge-blocks:      hsl(152 60% 38%);   /* emerald-600 — kept */
--edge-pending:     hsl(348 80% 50%);   /* rose-500 — was rose-600, match ring */
--edge-recommended: hsl(28 90% 50%);    /* orange-500 — was orange-600 */
--edge-backstops:   hsl(215 25% 45%);   /* slate-600 — was slate-500 */
```

**Dark mode**
```css
--node-gate-fill:       hsl(263 50% 20%);   /* violet-900 — was violet-950/80, no opacity */
--node-gate-stroke:     hsl(263 70% 70%);   /* violet-300 */
--node-task-fill:       hsl(152 45% 18%);   /* emerald-900 — was emerald-950/80 */
--node-task-stroke:     hsl(152 60% 60%);   /* emerald-300 — was teal-300, restore consistency */
--node-priority-fill:   hsl(215 30% 18%);   /* slate-800 */
--node-priority-stroke: hsl(215 25% 65%);   /* slate-300 */

--ring-p0: hsl(348 80% 65%);   /* rose-400 */
--ring-p1: hsl(28 90% 65%);    /* orange-400 */
--ring-p2: hsl(45 95% 60%);    /* amber-400 */
--ring-p3: hsl(220 10% 70%);   /* gray-400 */

--edge-blocks:      hsl(152 60% 60%);   /* emerald-300 — match stroke, restore consistency */
--edge-pending:     hsl(348 80% 70%);   /* rose-300 */
--edge-recommended: hsl(28 90% 65%);    /* orange-300 — kept */
--edge-backstops:   hsl(215 25% 65%);   /* slate-300 */
```

Key changes:
1. Fills use `*-100` (light) / `*-900` (dark) instead of `*-50` / `*-950` — 1 step more saturated, distinguishable from white/black.
2. No opacity multipliers — colors are solid, no muddy bleed.
3. P2 ring switches from `yellow-500` to `amber-600` (light) / `amber-400` (dark) — better contrast against pale fills.
4. Dark-mode `edge-blocks` switches back from `teal-300` to `emerald-300` to match light mode and node stroke.
5. Edge colors match severity ring colors (pending edge = rose = P0 ring; recommended edge = orange = P1 ring) for cognitive consistency.

**Status badges (both modes)** — kept:
- PENDING = `bg-rose-500 text-white`
- URGENT = `bg-orange-500 text-white`
- INDEP = `bg-emerald-500 text-white`
- DONE = `bg-sky-500 text-white`

### G.6 New toolbar / legend / inspector layout

**Toolbar (top, single row, never wraps):**
```
┌──────────────────────────────────────────────────────────────────────────────────┐
│ [Logo] Dep Graph · §D   [🔍 Search...          ]   [Layout▾] [Kind▾] [Sev▾] [Abc]│
│                                                       [Edges: labels] [Critical]   │
│                                              [-] [32%] [+] [Fit] [Reset] [X]      │
└──────────────────────────────────────────────────┴──────────────────────────────┘
```

Group with `flex-wrap` only between major groups (logo+search vs filters vs zoom), never within a group. Use `flex-nowrap` + `overflow-x: auto` if needed.

**Legend (collapsible popover, top-right):**
- Replace always-visible bottom-left overlay with a "?" button in the toolbar that opens a popover.
- Popover content: same 3 sections (node kind, severity ring, edge kind) but uses **accurate** dash patterns matching the rendered edges.
- Add "priority" to node-kind section.
- Add status badges section (PENDING/URGENT/INDEP/DONE).
- Frees the entire canvas for the graph.

**Inspector (right, collapsible):**
- Width 320 px (was 288).
- Collapse button (chevron) in top-right of inspector — when collapsed, inspector becomes a 32-px strip with just the currently-selected node ID, expand on click.
- When no node selected: show stats panel (kept) + "Click a node" hint (kept).
- When node selected: keep current content + add:
  - "Highlighted neighbors: N" count
  - "Critical path from B0: B0 → G3 → B4 → B7 → B5 → C14" (computed)
  - Breadcrumb of recently-selected nodes (last 5) with back button
  - "Lock selection" toggle (prevents background-click deselect)
- "Jump to first occurrence" button stays full-width at bottom but gets a confirmation tooltip on hover.

**Hint overlay (top-left):**
- Convert to a one-time onboarding tooltip that auto-dismisses after 5 seconds or first interaction.
- Add a "Show hints again" item in the legend popover for users who want to revisit.

### G.7 New features to add

| Priority | Feature | Rationale |
|---|---|---|
| P0 | **Minimap** (corner overlay, 120×80 px, pannable) | At high zoom, no way to see where you are. Screenshot 08 shows the problem. |
| P0 | **Fix reopen-fit bug** (A.2) | User opening the dialog a 2nd time gets a clipped view. |
| P0 | **Move status badge outside node** (B.2) | 100 % of status-bearing nodes have overlap. |
| P1 | **Layout-mode switcher**: DAG (dagre TB) / Tree (B7 root) / Radial (G3 center) | Different layouts reveal different structures. The current single layout obscures the B7-centric tree. |
| P1 | **Edge-label toggle** | Currently only 2/30 edges have labels. Toggle to show all. |
| P1 | **Kind filter** (checkboxes: task/gate/priority) | 35 nodes is borderline-overwhelming; filtering helps focus. |
| P1 | **Severity filter** (checkboxes: P0/P1/P2/P3) | Same. |
| P1 | **Status filter** (checkboxes: pending/urgent/independent) | Same. |
| P1 | **Highlight critical path** button | Traces `B0 → G3 → B4 → B7 → B5 → C14` (per §D ASCII art) with thicker strokes + animated dash flow. |
| P2 | **Multi-select** (shift-click) + "Fit to selection" | Power-user feature for comparing nodes. |
| P2 | **Keyboard navigation** (arrows between connected nodes, Enter to jump) | Accessibility. |
| P2 | **Edge inspector** (click an edge → see kind/label/from/to) | 28/30 edges are unlabeled and unclickable. |
| P2 | **Undo/redo** for node drag (Cmd+Z / Cmd+Shift+Z) | Currently dragging a node off-screen requires full Reset. |
| P3 | **Export PNG/SVG** button | For sharing in issues / docs. |
| P3 | **Show §D ASCII art side-by-side** toggle | Original ASCII graph next to interactive graph for cross-reference. |
| P3 | **Animated edge flow** on critical path | Subtle moving dashes to indicate "active" path. |

### G.8 Initial state fix (independent of G.1)

If react-flow is rejected, the minimal fix for the reopen-fit bug (A.2) is to change the fit useEffect's deps:

```tsx
// BEFORE (line 611-616):
useEffect(() => {
  if (data && open) {
    requestAnimationFrame(() => fitToView());
  }
}, [data, open, fitToView]);

// AFTER:
useEffect(() => {
  if (data && open) {
    requestAnimationFrame(() => fitToView());
  }
}, [open]);  // fire on every open, not just when data changes
```

(`data` and `fitToView` are stable across opens — `data` is cached after first fetch, `fitToView` is `useCallback` with empty deps.)

---

## H. Summary of severity ratings

| Issue | Severity | Section |
|---|---|---|
| Reopen-fit bug (dialog opens clipped on 2nd open) | **Critical** | A.2, G.8 |
| World aspect ratio mismatch → 50 % horizontal whitespace at fit | **Critical** | A.1 |
| Row 4 node overlap (C7-C12 cluster overlaps by 58 px) | **Critical** | A.4 |
| Status badge overlaps label text on 100 % of status-bearing nodes | **Critical** | B.2 |
| Backstops edge pattern "1 3" invisible at any zoom | **High** | C.2 |
| Severity rings invisible at fit-to-view (0.96 px stroke) | **High** | B.4 |
| Light-mode fills indistinguishable from white | **High** | D.1, D.2 |
| Legend overlaps bottom-left nodes | **High** | F.1 |
| Header bar wraps to 160 px tall at 1280 px viewport | **High** | F.2 |
| Edge labels on only 2/30 edges, fontSize 9 at fit = 2.9 px | **High** | C.6 |
| No minimap (lost at high zoom) | **Medium** | E.2, G.7 |
| Fan-out from B5/B7 collapses into single thick line | **Medium** | C.9 |
| P2 yellow ring on emerald-50 fill fails WCAG contrast | **Medium** | D.2 |
| Dark-mode `blocks` edge color inconsistent (teal vs emerald) | **Medium** | D.2 |
| Search dimmed nodes still receive pointer events | **Medium** | E.6 |
| Background click deselects (aggressive) | **Medium** | E.4 |
| No edge selection / inspection | **Medium** | C.11, E.4 |
| Truncation breaks meaning on B5/B2a/C16 labels | **Medium** | B.3 |
| Hint overlay always visible, no dismiss | **Low** | F.3 |
| No keyboard navigation | **Low** | E.4 |
| Priority kind defined but unused (dead code) | **Low** | B.8, D.1 |
| Legend swatches use inaccurate dash patterns | **Low** | F.1 |
| 3 px drag threshold too low | **Low** | E.3 |
| Wheel zoom sensitivity (0.0015) sluggish | **Low** | E.2 |

**Total**: 4 Critical, 7 High, 11 Medium, 7 Low issues identified.

---

## I. Recommended next actions (for Task 6-c)

1. **Decide on approach**: react-flow (G.1) vs. dagre + custom SVG (G.1 alternative). Recommend react-flow.
2. **If react-flow**: scaffold the new component in parallel (e.g., `dependency-graph-v2.tsx`), wire it behind a feature flag, A/B test against the current component, then replace.
3. **If dagre + custom SVG**: apply G.2 positions, G.3 node spec, G.4 edge spec, G.5 colors, G.6 toolbar/legend/inspector layout — these are all drop-in replacements for existing constants and JSX.
4. **Either way**: fix the reopen-fit bug (G.8) and the status-badge-overlap bug (G.3) first as standalone PRs — they're cheap and high-impact.
5. **Add P0/P1 features from G.7**: minimap, edge-label toggle, kind/severity/status filters, critical-path button.
6. **Defer P2/P3 features** (multi-select, keyboard nav, edge inspector, undo/redo, export, side-by-side ASCII) to Task 6-d.

---

**End of report.** Screenshots referenced above are saved as `/home/z/my-project/qa-graph-audit-{00..10}.png`. Source files audited: `src/components/docs/dependency-graph.tsx` (1,002 lines) and `src/lib/dependency-graph.ts` (291 lines). No source code was modified.
