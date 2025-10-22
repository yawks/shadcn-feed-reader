# Drag & Drop behavior for sidebar (feeds / folders)

This document describes the exact UX and data behavior for drag & drop in the sidebar.

## Summary

- Items in the sidebar are either `folder` (NavCollapsible) or `feed` (NavLink / non-collapsible).
- Folders can be opened/closed only via their chevron button on the right.
- Clicking a folder navigates to `/folder/{folderId}`.
- Clicking a feed navigates to `/feed/{feedId}`. Clicking a feed must NOT expand/collapse folders; it only affects unread counts in the tree (see details).
- Drag & drop is only supported for `feed` items. Folders cannot be dragged.

## High-level goals

- When a user presses and holds a feed (or drags after a gesture), the feed becomes draggable. A visible ghost follows the pointer.
- During a drag, folders that the pointer hovers over should be visually highlighted.
- There is a special ephemeral "Root" folder that appears during a drag when the dragged feed currently belongs to a folder. "Root" represents dropping the feed out of any folder (i.e., move to top level). The Root folder is only shown during a drag of a feed that *is currently inside a folder*.
- When a feed is dropped onto a folder (or the ephemeral Root), the app performs an optimistic update to the folder tree (remove from previous folder; add to target). Then the backend `moveFeed(feedId, targetFolderId|null)` is called to persist it. On error, the UI must revert to the previous state.

## Interaction details

1. Activation
   - Activation can occur via two patterns:
     - Long-press: Holding mouse/touch on a feed for a configured threshold (e.g., 200-300ms) starts manual drag.
     - Drag threshold: If mouse moves beyond a small threshold (e.g., 6px) after mousedown, start manual drag immediately.
   - When the manual drag starts, disable pointer interaction on the feed link (so browser navigation is prevented) and visually show a ghost element that follows the pointer. Also set an internal `isDragging` flag and call any `onDragStateChange(true)` callback so the tree can show the root drop target.

2. Ghost and movement
   - The ghost is a DOM clone (or minimal representation) of the feed row appended to `document.body` with `position: fixed` and `pointer-events: none`.
   - Use `pointer` or `mousemove` events attached to `document` (prefer `pointer` with `setPointerCapture` on the originating element if available) to update the ghost's `transform: translate3d(x, y, 0)` on every move. The ghost must follow the pointer smoothly and be above all UI.

3. Drop target detection & highlighting
   - On every pointer/mousemove, compute the element under the pointer using `document.elementFromPoint(clientX, clientY)`.
   - If the element (or one of its ancestors) has a `data-folder-id` attribute, treat that folder as the current hover target and highlight it (e.g., add `.drag-over` class or toggle local state to render a highlight). If the hovered target is the special Root placeholder, highlight it too.
   - Only one folder at a time should be highlighted. When pointer leaves a folder, remove that highlight.

4. Root placeholder
   - When starting a drag for a feed that currently belongs to a folder (i.e., it is inside a folder's items), add a temporary UI entry `Root` at the bottom (or at the correct visual location) of the folders list. The Root entry should have `data-folder-id="ROOT"` or similar sentinel and appears only during drag.
   - If the feed is not inside a folder already, do not show the Root placeholder.
   - Root placeholder should be highlighted on hover like a real folder, and if dropped onto Root, the feed is moved to the top-level (no folder). After drop completes (or drag cancels), remove the Root placeholder.

5. Performing the move
   - On pointerup / mouseup (end of drag):
     - Determine the target folderId (null for Root). If no folder target was detected, cancel the move and simply remove the ghost.
     - If target is same as the feed's current folder, do nothing (just remove ghost and re-enable interactions).
     - Otherwise perform an *optimistic update* of the local cache / tree:
       - Remove the feed from its previous folder (if present) and add it to the target folder's items (append at end).
       - Update unread counts for both source and target folders and the overall total accordingly.
     - Then call the backend method `moveFeed(feedId, targetFolderId|null)`. If the call fails, revert the optimistic update and show a non-blocking error toast.
     - Remove the Root placeholder and clear `isDragging` / highlights.

6. Click / navigation behavior constraints
   - Clicking on a folder row (not the chevron) navigates to `/folder/{folderId}` and does not expand/collapse.
   - Clicking on a feed navigates to `/feed/{feedId}` and update the unread counts appropriately. It must NOT expand/collapse folders.
   - Clicking the chevron toggles open/close for that folder only.
   - Because pointer interactions may be used to start drag, ensure the implementation suppresses link navigation only while dragging or in the short window between drag start and drag end.

## Data & events

- Data transfer key when using native DnD: `application/x-feed-id` with value set to the feed id string. For manual drag we don't need `dataTransfer` but we should set the same data into internal state.
- Backend API to call: `moveFeed(feedId: string, targetFolderId: string | null)` — `null` when moving to Root.
- UI hooks: use `onDragStateChange(true|false)` to inform upper components (NavGroup) so it can show the Root placeholder and other global UI changes.

## Edge cases and notes

- If the user cancels the drag (Escape key or pointer leaves the window), remove the ghost and revert any temporary state (Root placeholder, highlights).
- Ensure keyboard accessibility is considered in a follow-up (not implemented in this spec): provide a way to move feeds via keyboard and announce changes to screen readers.
- Avoid toggling `pointer-events` on link elements before the drag actually begins; doing so during mousedown can cancel native browser drag fire sequence.
- Prefer Pointer Events (pointerdown/pointermove/pointerup + setPointerCapture) over raw mouse events to support touch and pen devices reliably.

## Minimal implementation steps

1. Add a `dragState` hook at the NavGroup level to show Root placeholder while any feed is being dragged.
2. For top-level feeds and sub-row feeds, implement a pointer-capture based manual drag (long-press + movement threshold to start).
3. Add ghost creation + movement using pointer events.
4. Add folder highlight logic and Root placeholder rendering.
5. On drop, run optimistic update + backend call.
6. Clean up debug logs and run linter/TypeScript fixes.

---

Created for: shadcn-feed-reader. Follow the above and we should get a consistent DnD that works on desktop and touch devices.
