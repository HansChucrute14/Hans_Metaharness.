# Adversarial Review — gsd-diet-calc Consolidated Reader

> **Document type:** Agentic-AI-optimized adversarial review
> **Target consumer:** An autonomous dev agent (GLM/claude/cursor) that will pick findings and execute fixes
> **Scope:** Full-stack Next.js 16 App Router documentation reader (~10k LOC across 11 components, 3 API routes, 4 lib modules)
> **Methodology:** OWASP Secure Code Review checklist + Microsoft code-review best practices + Next.js production guide + WCAG 2.1 AA + React/Next.js anti-pattern auditing
> **Verification:** agent-browser runtime QA + `bunx tsc --noEmit` + `bun run lint` + source audit

---

## How an agent should consume this document

Each finding is **atomic, self-contained, and ends with a verifiable DONE state**. Pick findings in priority order. Do NOT batch unrelated findings — each is a separate commit.

**Schema of a finding:**
```
### [ID] TITLE
- Severity: CRITICAL | HIGH | MEDIUM | LOW | INFO
- Effort: S (<30m) | M (1-2h) | L (half-day) | XL (1d+)
- Category: Security | Performance | A11y | UX | CodeQuality | Robustness | Architecture
- Files: exact paths + line numbers
- Problem: what's wrong (factual, no speculation)
- Impact: what breaks / could break (concrete)
- Fix: prescriptive steps (what + why, not how-line-by-line)
- Verify: the exact command or agent-browser action proving DONE
```

**Priority pick order for an agent:** CRITICAL → HIGH → MEDIUM, within each severity pick lowest-effort first (quick wins build momentum + reduce noise for harder findings).

---

## Executive Summary

**App health:** Functional, no runtime crashes, zero console errors during agent-browser QA (home, Part 1 load, scroll, graph open, search). The prior rounds (1–12 in worklog.md) shipped a genuinely SOTA feature set: 4-theme system, SOTA dependency graph (19 features), annotations CRUD, mermaid rendering, scroll-perf fix, organic mode integration.

**Real issues found:** 14 findings — 1 CRITICAL, 4 HIGH, 6 MEDIUM, 3 LOW.
**Top 3 risks:**
1. **Mermaid `securityLevel: "loose"` + `dangerouslySetInnerHTML`** = stored-XSS vector via crafted `.md` (CRITICAL)
2. **Zero error boundaries** = a single render error in any subcomponent whitescreens the entire app (HIGH)
3. **17 TypeScript errors** in project code — `tsc --noEmit` fails; type safety is partially illusory (HIGH)

**What's already excellent (do NOT regress):**
- Scroll performance fix (rAF-throttled + delta-guarded + memoized MarkdownRenderer) — keep
- Dependency graph (19 SOTA features, React.memo'd, perf-constrained) — keep
- 4-theme CSS-var system — keep
- Organic mode integration (graph:open-at-node events) — keep

---

## Findings

### [F-01] Mermaid `securityLevel: "loose"` is a stored-XSS vector
- **Severity:** CRITICAL
- **Effort:** S
- **Category:** Security
- **Files:** `src/components/docs/mermaid-diagram.tsx:64-75, 134`
- **Problem:** Mermaid is initialized with `securityLevel: "loose"`, then its SVG output is injected via `dangerouslySetInnerHTML={{ __html: svg }}`. The `loose` level disables Mermaid's HTML sanitization, allowing `<script>` tags, `on*` event handlers, and `javascript:` URLs to pass through into the DOM. The markdown source files live on disk at `consolidated-docs/*.md`; any file edit (or a future PR adding a doc) can introduce a malicious mermaid block that executes arbitrary JS in every reader's browser.
- **Impact:** Stored XSS. If the docs repo is ever collaborative or if a malicious `.md` is added, attackers get full session/script execution in the reader's origin. Even in a single-author trust model, this is a footgun — one copy-pasted mermaid sample from the web could contain `<img src=x onerror=...>`.
- **Fix:**
  1. Change `securityLevel: "loose"` → `securityLevel: "strict"` (default safe mode — strips scripts/handlers).
  2. If labels break under `strict` (the reason `loose` was likely chosen), use `securityLevel: "sandbox"` instead — renders in an iframe sandbox with no same-origin access. Test all 9 mermaid blocks in Part 1 after the change.
  3. As defense-in-depth, add a DOMPurify pass on `svg` before injecting: `import DOMPurify from 'dompurify'; const clean = DOMPurify.sanitize(svg, { USE_PROFILES: { svg: true, svgFilters: true } })`. `dompurify` is ~20kb gzipped, worth it.
  4. Document the trust boundary in a comment: "Mermaid output is sanitized; do NOT change securityLevel without re-auditing."
- **Verify:** `grep -n "securityLevel" src/components/docs/mermaid-diagram.tsx` shows `"strict"` or `"sandbox"`. Open Part 1 in agent-browser, confirm all 9 mermaid blocks still render as SVG (not raw text, not error cards). `agent-browser console --json` shows 0 errors.

### [F-02] No React Error Boundary — any render crash whitescreens the app
- **Severity:** HIGH
- **Effort:** S
- **Category:** Robustness
- **Files:** `src/app/page.tsx`, `src/app/layout.tsx` (missing boundary), `src/components/docs/doc-reader.tsx` (top-level)
- **Problem:** `grep -rn "ErrorBoundary|componentDidCatch|getDerivedStateFromError" src/` returns **zero matches**. The app has no error boundary anywhere. If any subcomponent throws during render (e.g., a mermaid block with unexpected content, a markdown edge case, a graph data malformation), React unmounts the entire tree and the user sees a blank page with no recovery path.
- **Impact:** A single malformed markdown section, an unexpected API response shape, or any future bug crashes the whole app with no user-facing error message and no way to navigate elsewhere. In a docs reader where content is the product, this is unacceptable.
- **Fix:**
  1. Create `src/components/error-boundary.tsx` — a class component with `getDerivedStateFromError` + `componentDidCatch` that renders a friendly fallback ("Something went wrong rendering this section. [Reload] [Go to Bug Map]") and logs to console.
  2. Wrap `<DocReader />` in `page.tsx` with the boundary.
  3. Add a NESTED boundary inside `doc-reader.tsx` around `<MarkdownRenderer />` so a single bad markdown block doesn't kill the sidebar + graph + search — only the prose area shows the fallback, with a "skip to next section" affordance.
  4. Add a NESTED boundary around `<DependencyGraphDialog />` content so a graph render error doesn't kill the reader.
- **Verify:** Temporarily throw inside MarkdownRenderer (`throw new Error("test")`), load page → see friendly fallback, NOT blank screen. Revert. `agent-browser console --json` shows the logged error but page stays interactive.

### [F-03] 17 TypeScript errors — `tsc --noEmit` fails
- **Severity:** HIGH
- **Effort:** M
- **Category:** CodeQuality
- **Files:** `src/components/docs/doc-reader.tsx` (5 errors), `src/components/docs/markdown-renderer.tsx` (12 errors)
- **Problem:** `bunx tsc --noEmit` reports 17 errors in project code (excluding `examples/` and `skills/`). Breakdown:
  - 5× `Conversion of type 'Window & typeof globalThis' to type 'Record<string, unknown>'` — the `(window as any)` / `(window as Record<string, unknown>)` pattern used for `__pendingHashSection`, `__currentVisibleSectionId`, `__scrollSpyObserver`, `__depGraphRetry`, `__depGraphCleanup`.
  - 6× `'fact.repairs.length' is possibly 'undefined'` etc. — `bug-facts.ts` declares `repairs?: string[]` and `blockedBy?: string[]` as optional, but `markdown-renderer.tsx:284-304` accesses them without null guards.
  - 1× `underlineOffset` should be `textUnderlineOffset` in a CSS-in-JS style object (`markdown-renderer.tsx:407`).
  - 1× `Cannot find namespace 'JSX'` (`markdown-renderer.tsx:587`) — React 19+ removed the global `JSX` namespace; use `React.JSX.IntrinsicElements`.
  - 2× `Tag cannot be used as a JSX component` (`markdown-renderer.tsx:648`) — downstream of the JSX namespace issue.
- **Impact:** Type safety is partially illusory — the build passes only because Next.js Turbopack doesn't run full type-checking by default. IDE go-to-definition and refactoring support are degraded. Future contributors will hit confusing red squiggles. A strict CI `tsc` gate would fail.
- **Fix:**
  1. **Window globals:** create a typed module `src/lib/window-globals.ts` declaring `__pendingHashSection`, `__currentVisibleSectionId`, `__scrollSpyObserver`, `__depGraphRetry`, `__depGraphCleanup` on a `Window` interface augmentation. Replace all `(window as any)` / `(window as Record<string, unknown>)` casts with typed access.
  2. **BugFact optional arrays:** either (a) make `repairs` and `blockedBy` required (`repairs: string[]` — they're always arrays in the data, the `?` is wrong), or (b) add `(fact.repairs ?? [])` guards at every access site. Option (a) is cleaner — audit the data file, every entry already has both as arrays.
  3. **`underlineOffset` → `textUnderlineOffset`** in the style object at line 407.
  4. **`JSX.IntrinsicElements` → `React.JSX.IntrinsicElements`** at line 587 (React 19+ import).
- **Verify:** `bunx tsc --noEmit 2>&1 | grep -v "examples/\|skills/" | grep "error TS" | wc -l` returns `0`. `bun run lint` still clean.

### [F-04] `force-dynamic` on API routes = zero caching, re-parses all .md on every request
- **Severity:** HIGH
- **Effort:** M
- **Category:** Performance
- **Files:** `src/app/api/docs/route.ts:6`, `src/app/api/dependency-graph/route.ts:6`, `src/lib/docs-parser.ts:259-306`
- **Problem:** Both API routes export `dynamic = "force-dynamic"`. `parseDocs()` uses React's `cache()` — but `cache()` only dedupes WITHIN a single request, not across requests. So every API call re-runs `parseDocsInternal()` which does `readdirSync` + `readFileSync` on all 10 `.md` files + runs 5 regex passes over every line of every file to build the ID registry. Part 1 alone is 1486 lines × 5 regexes = ~7400 regex.exec calls per request, plus glossary parsing.
- **Impact:** In dev this is fine (live edits). In production, every `/api/docs` list call and every `/api/docs?slug=X` single-doc call pays the full parse cost (~50-150ms of CPU + disk I/O per the dev.log timings). With 10 concurrent users browsing, that's 10× redundant parsing. The `serializeDocs()` list view also serializes the full ID registry (77 IDs × N occurrences) on every list call.
- **Fix:**
  1. Add a module-level `let cachedParsed: ParsedDocs | null = null` with a TTL (e.g., 60s in prod, 0 in dev). Check `process.env.NODE_ENV` — in dev keep `force-dynamic` + no cache (live edits); in prod use the TTL cache.
  2. Or better: use Next.js `revalidate` — export `export const revalidate = 3600` (1h) instead of `force-dynamic`, and let Next's ISR cache the response. Trigger revalidation on file change via `revalidatePath` if a CMS hook is added later.
  3. The single-doc endpoint (`?slug=X`) currently calls `parseDocs()` (parses ALL files) just to return ONE file — change it to read only the requested file when `slug` is provided.
- **Verify:** `curl -s -o /dev/null -w "%{time_total}" http://localhost:3000/api/docs` — should drop significantly after caching. In prod build, `next build` should show the route as `ƒ (Dynamic)` → `○ (Static)` or `ISR`.

### [F-05] No input validation / rate limiting on API routes
- **Severity:** HIGH
- **Effort:** M
- **Category:** Security
- **Files:** `src/app/api/docs/route.ts`, `src/app/api/dependency-graph/route.ts`
- **Problem:** The `slug` query param is taken raw from `searchParams.get("slug")` and used in `parsed.files.find(f => f.slug === slug)`. There's no allow-list validation, no length cap, no rate limiting. While `find()` prevents path traversal (slugs are matched, not used as paths), an attacker can hammer `/api/docs?slug=<random-string>` to force 404 + full-parse-cost on every request (see F-04), a cheap DoS amplifier.
- **Impact:** DoS via API amplification. Low-severity because the app is single-user local, but if ever deployed publicly, this is a trivially exploitable CPU-exhaustion vector.
- **Fix:**
  1. Add a slug allow-list check: `if (!slug || !/^[a-z0-9-]+$/.test(slug) || slug.length > 80) return 404`.
  2. Add a simple in-memory rate limiter (token bucket, 60 req/min per IP) at the top of each handler — or use `@upstash/ratelimit` if deploying to serverless.
  3. Set `Cache-Control: public, max-age=60, s-maxage=300` on successful list responses.
- **Verify:** `curl "http://localhost:3000/api/docs?slug=../../etc/passwd"` returns 404 (regex reject). `for i in $(seq 1 100); do curl -s -o /dev/null -w "%{http_code}\n" http://localhost:3000/api/docs; done` shows 429 after 60.

### [F-06] `window as any` global mutation pattern — fragile cross-component communication
- **Severity:** MEDIUM
- **Effort:** M
- **Category:** CodeQuality / Architecture
- **Files:** `src/components/docs/doc-reader.tsx:317,334,336,363,420,1469`, `src/components/docs/markdown-renderer.tsx:620,629,633,996`
- **Problem:** 10 occurrences of `(window as any).__someProperty` or `(el as any).__someProperty` are used as a cross-component event bus: `__pendingHashSection`, `__currentVisibleSectionId`, `__scrollSpyObserver`, `__depGraphRetry`, `__depGraphCleanup`, `__headingCleanup`, `__headingObserver`. These are mutable global singletons with no type safety, no lifecycle management, and no cleanup guarantees. They leak across HMR reloads in dev (stale closures) and across document navigations.
- **Impact:** Hard to trace bugs (state lives on `window`, not in React). HMR can leave stale `__scrollSpyObserver` pointing at a detached DOM node. A future feature that reuses one of these names silently breaks the existing one. TypeScript can't help (hence the `as any`).
- **Fix:**
  1. Replace `__pendingHashSection` with a `useRef<string | null>` in DocReader + pass via context or prop drilling.
  2. Replace `__currentVisibleSectionId` with the Zustand store's `activeSectionId` (it's already tracked there).
  3. Replace `__scrollSpyObserver` / `__depGraphRetry` / `__depGraphCleanup` with `useRef` inside the respective `useEffect` (closures already capture them — the window assignment is unnecessary).
  4. Replace `__headingCleanup` / `__headingObserver` on DOM elements with a `WeakMap<HTMLElement, Cleanup>` module-level map.
- **Verify:** `grep -rn "window as any\|as any).__" src/` returns 0 matches. `bunx tsc --noEmit` clean (this also resolves F-03's window-cast errors). Scroll-spy + hash-nav + graph-section-detection all still work (agent-browser test).

### [F-07] Annotation highlights mutate the DOM outside React's control
- **Severity:** MEDIUM
- **Effort:** M
- **Category:** Architecture / Robustness
- **Files:** `src/lib/annotation-highlights.ts:83-147`
- **Problem:** `highlightInNode()` uses `document.createTreeWalker` + `range.surroundContents(mark)` to wrap text nodes in `<mark>` elements directly in the prose DOM. `clearAllMarks()` unwraps them by moving children back + `parent.normalize()`. This is imperative DOM surgery on React-managed content (`#md-container` is rendered by `<MarkdownRenderer>`). If React re-renders the prose (e.g., on `jumpHighlightId` change), React's virtual DOM diff may conflict with the manually-inserted `<mark>` tags — causing hydration warnings, lost marks, or duplicated text.
- **Impact:** Annotations can silently disappear or duplicate text after a re-render. The `surroundContents` call also fails silently (caught + skipped) when a range crosses element boundaries, so multi-paragraph selections are partially highlighted with no user feedback.
- **Fix:**
  1. **Short term (defensive):** in `useAnnotationHighlights`, re-apply marks AFTER every known re-render trigger — currently only `docSlug` change + `annotations-updated` event + theme change trigger re-apply. Add a listener for `doc:jumpto` (the jump signal) so marks re-apply after jump highlights.
  2. **Medium term (correct):** instead of `surroundContents`, use CSS Custom Highlights API (`Highlight` + `CSS.highlights.set`) — non-destructive text highlighting that doesn't touch the DOM tree. Supported in all modern browsers since 2024. Falls back to `surroundContents` for older browsers.
  3. **Long term (architectural):** move annotations into the markdown render pipeline itself — `LinkifiedText` already walks text nodes; add an annotation-aware wrapper that emits `<mark>` as part of the React tree.
- **Verify:** Add an annotation, trigger a section jump (click a cross-ref) → annotation should still be visible. `agent-browser console --json` shows no hydration warnings.

### [F-08] Scroll-spy + heading-ID assignment rely on text matching — fragile
- **Severity:** MEDIUM
- **Effort:** M
- **Category:** Robustness
- **Files:** `src/components/docs/doc-reader.tsx:444-501`
- **Problem:** The `assignIds()` function builds a map of `normalizedTitle → section` and iterates rendered `h2/h3/h4` elements to assign IDs by matching `h.textContent` (lowercased, stripped of `*` and backticks). If two sections have the same title (e.g., "Summary" appears in multiple parts), the first wins and the second gets no ID — breaking its cross-ref + scroll-spy. If a heading contains nested elements (e.g., a `<code>` child), `textContent` concatenation may not match the parsed title.
- **Impact:** Duplicate titles silently lose their anchors. Cross-ref clicks to those sections fail silently (no scroll, no highlight). Scroll-spy never activates them. The `MutationObserver` + 6-retry-timer cascade (lines 487-501) papers over slow renders but can't fix the fundamental matching fragility.
- **Fix:**
  1. In `docs-parser.ts:parseSections`, generate a deterministic `id` from `docSlug + lineNumber` (already done: `s${lineNumber}-${slugify(title)}`) — but ALSO emit a `data-section-id` attribute on the heading at parse time so the renderer can use it directly.
  2. In `markdown-renderer.tsx:SectionHeading`, accept a `sectionId` prop (passed via a custom directive or via the heading's `node` from ReactMarkdown) and set it as the `id` + `data-heading-id` at render time — no post-hoc matching needed.
  3. Delete the entire `assignIds()` effect + retry cascade in `doc-reader.tsx:439-532`. This also removes ~90 lines of fragile code + 6 setTimeout retries.
- **Verify:** Open Part 1, search for a section with a duplicate-titled heading elsewhere → both should have unique IDs in `document.querySelectorAll('[data-heading-id]')`. Cross-ref clicks to either land on the correct one.

### [F-09] Mobile responsive layout untested — core layout uses `lg:` breakpoints with no fallback
- **Severity:** MEDIUM
- **Effort:** M
- **Category:** A11y / UX
- **Files:** `src/components/docs/doc-reader.tsx:1044` (ScrollArea), `1311` (footer), resizable-panels
- **Problem:** The 3-column layout (left sidebar | reader | right panel) uses `hidden lg:flex` / `lg:` breakpoints. On mobile, the left sidebar becomes a `<Sheet>` (good) but the right panel (`ResizableAside`) and the mini-TOC and the quick-jump-nav (`hidden lg:flex`) simply disappear with no mobile alternative. The dependency graph dialog is `max-w-7xl w-[95vw] h-[85vh]` — on a 375px phone, the graph is usable but the inspector panel (`w-80` = 320px) leaves only 55px for the graph canvas.
- **Impact:** Mobile users lose: right panel (backlinks, recently viewed), mini-TOC, quick-jump pills, and get a cramped graph. The app is effectively desktop-only despite "responsive design" claims.
- **Fix:**
  1. Right panel: on mobile, make it a bottom `<Sheet>` (swipe-up from a FAB) instead of `hidden`.
  2. Mini-TOC: on mobile, make it a floating action button that opens a `<Drawer>`.
  3. Quick-jump-nav: on mobile, make it a horizontal scrollable strip (already partially done — verify it doesn't `hidden` on mobile).
  4. Graph dialog: on `< sm` screens, hide the inspector by default + add a "Details" toggle button; reduce node sizes via the semantic-zoom system.
- **Verify:** `agent-browser` with viewport 375×812 — open app, verify all core features (sidebar, reader, search, graph, annotations) are reachable. No element narrower than 44×44px (WCAG touch target).

### [F-10] Keyboard shortcuts are global + undocumented — high collision risk
- **Severity:** MEDIUM
- **Effort:** S
- **Category:** UX / A11y
- **Files:** `src/components/docs/doc-reader.tsx:143-284`
- **Problem:** The app captures 11 single-letter keyboard shortcuts (`f`, `g`, `p`, `v`, `n`, `t`, `b`, `?`, `j`, `k`, plus `Cmd+K`, `Cmd+P`). They're only suppressed when an `INPUT`/`TEXTAREA` is focused — but NOT when the user is focused on a `contenteditable`, a `<button>` (via Space/Enter activation), or using a screen reader's virtual cursor. A screen-reader user navigating by heading (`h` key in NVDA/JAWS) will trigger no shortcut (good — `h` isn't mapped) but a user pressing `b` while focused on a button expecting browser back-history behavior gets a bookmark created.
- **Impact:** Unexpected actions for keyboard + screen-reader users. WCAG 2.1.1 (Keyboard) and 2.1.2 (No Keyboard Trap) are fine, but 2.1.4 (Character Key Shortcuts) is borderline violated — single-letter shortcuts without a modifier can be triggered accidentally.
- **Fix:**
  1. Single-letter shortcuts should require a modifier OR only fire when no dialog is open AND focus is in the reader body (not on a button/link). Add `if (document.activeElement?.tagName === 'BUTTON' || document.activeElement?.tagName === 'A') return;` after the INPUT/TEXTAREA check.
  2. Add a visible "Keyboard shortcuts" hint (the `?` modal exists — add a small persistent `?` button in the topbar for discoverability, not just the `?` key).
  3. Make the shortcut list in the `?` modal screen-reader accessible (it likely already is via Dialog — verify `role="dialog"` + `aria-label`).
- **Verify:** Tab to a button, press `b` → no bookmark created. Open `?` modal via clicking a `?` button in topbar.

### [F-11] `prose-thead:sticky top-0` without a scroll container — sticky doesn't work
- **Severity:** LOW
- **Effort:** S
- **Category:** UX
- **Files:** `src/components/docs/markdown-renderer.tsx:903`
- **Problem:** The markdown prose styling includes `prose-thead:sticky prose-thead:top-0`, intended to keep table headers visible when scrolling through a long table. But `position: sticky` only works relative to the nearest scrolling ancestor. The scroll container is the Radix `ScrollArea` viewport (`#main-scroll`), and the prose is nested several divs deep inside it. The `top-0` refers to the viewport top, but the table is inside a `max-w-3xl` centered container with `py-6` padding — so the sticky header sticks at the wrong offset (it sticks at `0` relative to the scroll viewport, but visually overlaps the top bar / breadcrumb).
- **Impact:** Long tables (Part 1 has several 20+ row tables) lose their header when scrolled. Users can't tell which column is what.
- **Fix:**
  1. Change `prose-thead:top-0` → `prose-thead:top-[60px]` (or whatever the top-bar height is) so it sticks below the top bar.
  2. Or wrap each table in its own `<div class="max-h-[400px] overflow-auto">` so the table scrolls independently and `top-0` works correctly within that container.
- **Verify:** Open Part 1, scroll through the master priority table (§10.1) → header row stays visible at the correct offset.

### [F-12] Search dialog results have no keyboard-selectable "open in new tab" affordance
- **Severity:** LOW
- **Effort:** S
- **Category:** UX / A11y
- **Files:** `src/components/docs/search-dialog.tsx`
- **Problem:** The search dialog (cmdk-based) lets users arrow-key through results + Enter to open. But there's no `Cmd+Enter` to open in a new tab, no "copy link" option, and no preview pane. For a docs reader where users often want to compare two sections, this is a frequent workflow dead-end.
- **Impact:** Minor friction — users must open, go back, search again, open the second result.
- **Fix:**
  1. Add `Cmd+Enter` handler on search results → opens the doc in a new browser tab via `window.open(`/api/docs?slug=${slug}#${sectionId}`, '_blank')`.
  2. Add a "recent searches" list at the top when the query is empty (cmdk supports this natively).
- **Verify:** Search, arrow to a result, press `Cmd+Enter` → new tab opens.

### [F-13] No `lang` attribute on dynamically rendered content / no `dir` support
- **Severity:** LOW
- **Effort:** S
- **Category:** A11y
- **Files:** `src/app/layout.tsx:32` (`lang="en"` is set, good), but content includes Portuguese terms
- **Problem:** The docs contain Portuguese terms (e.g., "DB_ingredientes.json", section titles in the synthesis maps). The `<html lang="en">` is correct for the app shell, but screen readers will mispronounce Portuguese words because there's no `lang="pt-BR"` wrapping them. This is minor given the content is 95% English.
- **Impact:** Screen-reader users hear Portuguese terms pronounced with English phonetics.
- **Fix:** In `markdown-renderer.tsx`, detect Portuguese spans (heuristic: words with accents like ã/õ/é/ç) and wrap them in `<span lang="pt-BR">`. This is a nice-to-have, not urgent.
- **Verify:** NVDA/VoiceOver announces "ingredientes" with Portuguese pronunciation.

### [F-14] `globals.css` is 989 lines — monolithic, no layering
- **Severity:** INFO
- **Effort:** M
- **Category:** CodeQuality
- **Files:** `src/app/globals.css`
- **Problem:** The single global stylesheet is 989 lines containing: Tailwind base + 4 theme variable sets + component styles + animation keyframes + scrollbar styles + prose overrides + print styles. There's no `@layer` usage to control specificity ordering. A prior round already removed a `::-moz-selection` block that broke compilation — the size makes such issues hard to catch.
- **Impact:** CSS specificity conflicts are hard to debug. Adding a 5th theme requires editing this monolith.
- **Fix:**
  1. Split into `globals.css` (Tailwind import + base) + `themes.css` (the 4 theme variable blocks) + `prose.css` (markdown overrides) + `animations.css` (keyframes).
  2. Use `@layer base, components, utilities;` to declare ordering explicitly.
  3. This is a refactor — do it LAST, after all functional findings are resolved.
- **Verify:** `bun run lint` clean, app renders identically, file sizes are smaller + scoped.

---

## Cross-cutting observations (not actionable findings, but context for the next agent)

1. **The `worklog.md` is 147KB+** — extremely long. Future agents should read only the last 2-3 sections (the most recent task entries) to understand current state, not the whole file. Consider archiving old sections to `worklog-archive.md` periodically.

2. **The dependency graph component is 3660 lines** — at the edge of maintainability. Any further features should be extracted into sub-modules (`graph-layout.ts`, `graph-interactions.ts`, `graph-render.tsx`, `graph-inspector.tsx`). Do NOT add more features to the single file.

3. **The `doc-reader.tsx` (1615 lines) is a "god component"** — it owns: data fetching, keyboard shortcuts, scroll-spy, hash routing, theme detection, annotation application, graph integration, search integration, ToC integration, comparison integration, command palette integration, and the entire layout. This is the single biggest architectural risk. Future work should extract a `useKeyboardShortcuts` hook, a `useScrollSpy` hook, a `useHashRouting` hook, etc.

4. **No tests exist anywhere** (`grep -rn "\.test\.\|\.spec\." src/` returns 0). The instruction "do not write any test code" was followed. This is a calculated risk — for a docs reader, manual QA via agent-browser is the primary safety net. But the scroll-perf fix (F-04's sibling) and the graph interactions would benefit from regression tests. Revisit the no-test policy if the app grows.

5. **The 4-theme system is well-architected** (CSS variables + `@custom-variant dark` for opencode) — this is a strength, do not refactor.

---

## Verification checklist for the next agent

Before claiming the review is "done," run ALL of these:

```bash
# 1. Lint clean
cd /home/z/my-project && bun run lint 2>&1 | tail -5  # must show 0 errors

# 2. TypeScript clean
bunx tsc --noEmit 2>&1 | grep -v "examples/\|skills/" | grep "error TS" | wc -l  # must be 0

# 3. Dev server healthy
tail -20 /home/z/my-project/dev.log  # no errors, all routes 200

# 4. Browser QA
agent-browser open http://localhost:3000/
agent-browser console --clear
# load Part 1, scroll, open graph, search, open annotations
agent-browser console --json | python3 -c "import json,sys; d=json.load(sys.stdin); errs=[m for m in d['data']['messages'] if m['type'] in ('error','warning')]; print(f'Errors: {len(errs)}'); [print(m['text'][:150]) for m in errs]"
# must print "Errors: 0"

# 5. Mermaid security
grep -n "securityLevel" src/components/docs/mermaid-diagram.tsx  # must show "strict" or "sandbox"

# 6. Error boundary exists
grep -rn "ErrorBoundary\|getDerivedStateFromError" src/  # must return ≥1 match
```

---

## Methodology references (for traceability)

- OWASP Secure Code Review Cheat Sheet: https://cheatsheetseries.owasp.org/cheatsheets/Secure_Code_Review_Cheat_Sheet.html
- OWASP Code Review Best Practices (Palantir): https://blog.palantir.com/code-review-best-practices-19e02780015f
- Microsoft 30 Code Review Best Practices: https://www.michaelagreiler.com/code-review-best-practices
- Next.js Production Best Practices: https://nextjs.org/docs/app/guides/production-checklist
- React Code Review Checklist 2026: https://www.codemag.com/Article/2507081/React-Code-Review-Checklist
- Anthropic "Building Effective Agents" (structured output for agents): https://www.anthropic.com/research/building-effective-agents
- "How to write a good spec for AI agents" (goal-oriented, structured): https://www.build4.ai/blog/how-to-write-a-good-spec-for-ai-agents
- WCAG 2.1.4 Character Key Shortcuts: https://www.w3.org/WAI/WCAG21/Understanding/character-key-shortcuts

---

**End of adversarial review.** Total findings: 14 (1 CRITICAL, 4 HIGH, 6 MEDIUM, 3 LOW/INFO). Estimated total effort to resolve all: ~2-3 days for a focused agent. Recommended execution order: F-01 → F-02 → F-03 → F-05 → F-04 → F-06 → F-08 → F-07 → F-10 → F-11 → F-09 → F-12 → F-13 → F-14.
