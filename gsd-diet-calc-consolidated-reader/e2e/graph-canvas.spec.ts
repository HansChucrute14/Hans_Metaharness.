/**
 * e2e/graph-canvas.spec.ts — T6c §12.6 MANDATED-2 regression gate.
 *
 * Blueprint: docs/architecture-review/04-document3-implementation-blueprint.md
 * §12.6 (lines 1204-1215).
 *
 * PURPOSE
 * -------
 * A repeatable regression gate for the split-canvas path (GraphCanvas +
 * useGraphViewport). The blueprint's one-time manual/agent-browser screenshot
 * diff (§T6c verification STEP 1-3) is NOT a durable gate — once
 * LegacyCanvas is deleted (T6c STEP 5 follow-up), nothing catches a future
 * stale-closure regression in `useGraphViewport`. This Playwright spec is the
 * durable replacement.
 *
 * GATES
 * -----
 *   1. Snapshot the canvas → baseline (committed). Future runs pixel-diff.
 *   2. Pan (pointer down/move/up) + wheel-zoom → assert the SVG <g>
 *      transform attribute CHANGED (viewport is not frozen — the
 *      stale-closure fix is wired).
 *   3. Click node B7 → assert the detail popover (Inspector) opens AND
 *      STAYS open (not instantly closed by the click-outside handler —
 *      the §12.6 target-check fix is wired).
 *   4. Click "Sync graph" → assert the `graph:synced` window event fires
 *      (via a window event spy injected before the click) AND the canvas
 *      re-renders with fresh nodes.
 *
 * RUNTIME
 * -------
 * This test requires `NEXT_PUBLIC_GRAPH_SPLIT=v1` to be set in the
 * environment when the dev server starts. The test does NOT set the flag
 * itself — it assumes the server under test was launched with it.
 *
 * Install Playwright first (`bun add -d @playwright/test && bunx playwright
 * install chromium`), then run: `bunx playwright test e2e/graph-canvas.spec.ts`.
 *
 * Until Playwright is installed, this file is a SPEC ARTIFACT — it documents
 * the regression gate but does not execute. ESLint ignores the e2e/ folder
 * (see eslint.config.mjs) so `bun run lint` is unaffected.
 */

import { test, expect, type Page } from "@playwright/test";

// The graph dialog is opened from the Top Bar's dependency-graph button.
// Adjust the selector if the trigger moves — this is the current aria-label.
const OPEN_GRAPH_DIALOG_BUTTON = 'button[aria-label*="dependency"]';
const GRAPH_DIALOG_SVG = "svg";
const NODE_B7_SELECTOR = '[data-graph-node="B7"]';
const INSPECTOR_ASIDE = '[data-graph-inspector]';
const SYNC_GRAPH_BUTTON = 'button[aria-label*="Sync graph"]';

/**
 * Step 1: open the dialog and wait for the canvas to render.
 * The split-canvas path is active because the dev server was started with
 * NEXT_PUBLIC_GRAPH_SPLIT=v1.
 */
async function openGraphDialog(page: Page) {
  await page.goto("/");
  // Wait for the Top Bar to mount, then click the graph trigger.
  await page.locator(OPEN_GRAPH_DIALOG_BUTTON).first().waitFor({ state: "visible" });
  await page.locator(OPEN_GRAPH_DIALOG_BUTTON).first().click();
  // Wait for the SVG canvas to appear inside the dialog.
  await page.locator(GRAPH_DIALOG_SVG).first().waitFor({ state: "visible" });
  // Wait for at least one graph node to be stamped with data-graph-node
  // (confirms the split-canvas path is active, not the LegacyCanvas).
  await page.locator(NODE_B7_SELECTOR).waitFor({ state: "visible" });
}

test.describe("GraphCanvas (split-canvas, NEXT_PUBLIC_GRAPH_SPLIT=v1)", () => {
  test("STEP 1-2: canvas renders + baseline snapshot", async ({ page }) => {
    await openGraphDialog(page);
    // Snapshot the canvas container for future pixel-diff regression.
    // The dialog content is the snapshot target.
    const dialog = page.locator('[role="dialog"]').first();
    await expect(dialog).toBeVisible();
    await expect(page.locator(NODE_B7_SELECTOR)).toBeVisible();
    // Baseline snapshot — committed; future runs diff against it.
    await expect(dialog).toHaveScreenshot("graph-canvas-baseline.png", {
      maxDiffPixelRatio: 0.01,
    });
  });

  test("STEP 3: pan + wheel-zoom changes the viewport transform (stale-closure gate)", async ({ page }) => {
    await openGraphDialog(page);

    // Read the initial transform on the pan/zoom <g> (the second <g> inside
    // the SVG — the first <g> is the grid background in the LegacyCanvas;
    // in GraphCanvas it's the pan/zoom group directly).
    const panZoomGroup = page.locator("svg g").first();
    const initialTransform = await panZoomGroup.getAttribute("transform");
    expect(initialTransform).toBeTruthy();

    // Pan: pointer down on the SVG background, move, up.
    const svg = page.locator(GRAPH_DIALOG_SVG).first();
    const svgBox = await svg.boundingBox();
    expect(svgBox).not.toBeNull();
    if (!svgBox) return;
    const centerX = svgBox.x + svgBox.width / 2;
    const centerY = svgBox.y + svgBox.height / 2;
    await page.mouse.move(centerX, centerY);
    await page.mouse.down();
    await page.mouse.move(centerX + 80, centerY + 60, { steps: 8 });
    await page.mouse.up();

    // Assert the transform changed (translate is no longer 0,0 or the
    // pre-pan value).
    const afterPanTransform = await panZoomGroup.getAttribute("transform");
    expect(afterPanTransform).toBeTruthy();
    expect(afterPanTransform).not.toEqual(initialTransform);

    // Wheel-zoom: dispatch a wheel event over the canvas center.
    await page.mouse.move(centerX, centerY);
    await page.mouse.wheel(0, -120); // zoom in (deltaY < 0)

    // Assert the transform changed again (scale increased).
    const afterZoomTransform = await panZoomGroup.getAttribute("transform");
    expect(afterZoomTransform).toBeTruthy();
    expect(afterZoomTransform).not.toEqual(afterPanTransform);

    // Stale-closure gate: nodes are still rendered after pan/zoom (the
    // wheel handler read nodesRef.current, not a frozen closure — if it
    // had, the SVG would be empty after the first zoom).
    await expect(page.locator(NODE_B7_SELECTOR)).toBeVisible();
  });

  test("STEP 4: click node B7 opens the popover AND it stays open (§12.6 target-check gate)", async ({ page }) => {
    await openGraphDialog(page);

    // Click node B7. In the split-canvas path, GraphCanvas does NOT call
    // stopPropagation — the click bubbles to the window. The orchestrator's
    // onClickAway handler (capture phase) checks target.closest("[data-graph-node]")
    // and returns early, so selectedId is NOT cleared. The Inspector opens.
    await page.locator(NODE_B7_SELECTOR).click();

    // The Inspector <aside data-graph-inspector> should now show B7's details.
    const inspector = page.locator(INSPECTOR_ASIDE);
    await expect(inspector).toBeVisible();
    // The Inspector should contain the node id "B7".
    await expect(inspector).toContainText("B7");

    // CRITICAL: the popover must STAY open. Wait 500ms and re-check — if the
    // click-outside handler had a stale-closure or ordering bug, the popover
    // would have closed by now (the same click that opened it would have
    // also triggered the document-level onClickAway).
    await page.waitForTimeout(500);
    await expect(inspector).toBeVisible();
    await expect(inspector).toContainText("B7");
  });

  test("STEP 5: click Sync graph fires graph:synced + canvas re-renders", async ({ page }) => {
    await openGraphDialog(page);

    // Inject a window event spy BEFORE clicking sync. The spy records
    // whether `graph:synced` fired (the orchestrator's listener clears the
    // module cache and re-fetches on this event).
    await page.evaluate(() => {
      (window as unknown as { __graphSyncedFired?: boolean }).__graphSyncedFired = false;
      window.addEventListener("graph:synced", () => {
        (window as unknown as { __graphSyncedFired?: boolean }).__graphSyncedFired = true;
      }, { once: true });
    });

    // Snapshot the current node count (canvas re-render gate).
    const nodeCountBefore = await page.locator("[data-graph-node]").count();

    // Click the Sync graph button (rendered by GraphToolbar).
    const syncButton = page.locator(SYNC_GRAPH_BUTTON).first();
    await syncButton.waitFor({ state: "visible" });
    await syncButton.click();

    // Assert the window event fired (within 10s — the sync endpoint + cache
    // invalidation + re-fetch round-trip).
    await expect.poll(async () => {
      return page.evaluate(() => {
        return (window as unknown as { __graphSyncedFired?: boolean }).__graphSyncedFired ?? false;
      });
    }, { timeout: 10000 }).toBe(true);

    // Assert the canvas re-rendered (nodes are still present — the
    // graph:synced listener cleared the cache and re-fetched, which
    // re-rendered GraphCanvas with fresh nodes).
    await expect(page.locator(NODE_B7_SELECTOR)).toBeVisible();
    const nodeCountAfter = await page.locator("[data-graph-node]").count();
    // The node count should be the same (sync re-fetches the same data);
    // the point is that nodes are STILL rendered (not blanked by a
    // stale-closure freeze).
    expect(nodeCountAfter).toBeGreaterThan(0);
    expect(nodeCountAfter).toEqual(nodeCountBefore);
  });
});
