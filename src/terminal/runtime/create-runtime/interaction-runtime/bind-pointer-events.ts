import { createPointerAuxHandlers } from "./bind-pointer-aux-handlers";
import { createPointerUpHandler } from "./bind-pointer-up-handler";
import type {
  BindCanvasEventsOptions,
  RuntimeCell,
  RuntimeDesktopSelectionState,
  RuntimeGridState,
  RuntimeLinkState,
  RuntimeSelectionState,
  RuntimeTouchSelectionState,
} from "./types";

export type BindPointerEventsOptions = {
  canvas: HTMLCanvasElement;
  bindOptions: BindCanvasEventsOptions;
  touchSelectionMode: "off" | "drag" | "long-press";
  touchSelectionLongPressMs: number;
  touchSelectionMoveThresholdPx: number;
  selectionState: RuntimeSelectionState;
  touchSelectionState: RuntimeTouchSelectionState;
  desktopSelectionState: RuntimeDesktopSelectionState;
  linkState: RuntimeLinkState;
  cleanupCanvasFns: Array<() => void>;
  isTouchPointer: (event: PointerEvent) => boolean;
  clearPendingTouchSelection: () => void;
  clearPendingDesktopSelection: () => void;
  tryActivatePendingTouchSelection: (pointerId: number) => boolean;
  beginSelectionDrag: (cell: RuntimeCell, pointerId: number) => void;
  selectWordAtCell?: (cell: RuntimeCell) => boolean;
  selectLineAtCell?: (cell: RuntimeCell) => boolean;
  scrollViewportByWheel?: (event: WheelEvent) => void;
  normalizeSelectionCell: (cell: RuntimeCell) => RuntimeCell;
  positionToCell: (event: { clientX: number; clientY: number }) => RuntimeCell;
  scrollViewportByLines: (lines: number) => void;
  clearSelection: () => void;
  updateCanvasCursor: () => void;
  markNeedsRender: () => void;
  updateLinkHover: (cell: RuntimeCell | null) => void;
  getGridState: () => RuntimeGridState;
  getWasmReady: () => boolean;
  getWasmHandle: () => number;
};

export function bindPointerEvents(options: BindPointerEventsOptions) {
  const {
    canvas,
    bindOptions,
    touchSelectionMode,
    touchSelectionLongPressMs,
    touchSelectionMoveThresholdPx,
    selectionState,
    touchSelectionState,
    desktopSelectionState,
    linkState,
    cleanupCanvasFns,
    isTouchPointer,
    clearPendingTouchSelection,
    clearPendingDesktopSelection,
    tryActivatePendingTouchSelection,
    beginSelectionDrag,
    selectWordAtCell = () => false,
    selectLineAtCell = () => false,
    scrollViewportByWheel = () => {},
    normalizeSelectionCell,
    positionToCell,
    scrollViewportByLines,
    clearSelection,
    updateCanvasCursor,
    markNeedsRender,
    updateLinkHover,
    getGridState,
    getWasmReady,
    getWasmHandle,
  } = options;

  const { inputHandler, sendKeyInput, openLink } = bindOptions;

  const shouldRoutePointerToAppMouse = (shiftKey: boolean) => {
    if (shiftKey) return false;
    return inputHandler.isMouseActive();
  };

  canvas.style.touchAction =
    touchSelectionMode === "long-press" || touchSelectionMode === "drag"
      ? "none"
      : "pan-y pinch-zoom";

  // --- selection auto-scroll (drag beyond canvas edge) ---
  let selectionScrollTimer: ReturnType<typeof setInterval> | null = null;
  let selectionScrollTargetY = 0;

  const clearSelectionScrollTimer = () => {
    if (selectionScrollTimer !== null) {
      clearInterval(selectionScrollTimer);
      selectionScrollTimer = null;
    }
  };

  const updateSelectionScroll = (clientY: number) => {
    const { cellH } = getGridState();
    if (!cellH) {
      clearSelectionScrollTimer();
      return;
    }
    const rect = canvas.getBoundingClientRect();
    const aboveDist = rect.top - clientY;
    const belowDist = clientY - rect.bottom;

    if (aboveDist > 0) {
      selectionScrollTargetY = clientY;
      if (selectionScrollTimer === null) {
        selectionScrollTimer = setInterval(() => {
          const r = canvas.getBoundingClientRect();
          const dist = r.top - selectionScrollTargetY;
          if (dist <= 0) {
            clearSelectionScrollTimer();
            return;
          }
          const lines = Math.max(1, Math.ceil(dist / getGridState().cellH));
          scrollViewportByLines(-lines);
        }, 15);
      }
    } else if (belowDist > 0) {
      selectionScrollTargetY = clientY;
      if (selectionScrollTimer === null) {
        selectionScrollTimer = setInterval(() => {
          const r = canvas.getBoundingClientRect();
          const dist = selectionScrollTargetY - r.bottom;
          if (dist <= 0) {
            clearSelectionScrollTimer();
            return;
          }
          const lines = Math.max(1, Math.ceil(dist / getGridState().cellH));
          scrollViewportByLines(lines);
        }, 15);
      }
    } else {
      clearSelectionScrollTimer();
    }
  };

  const onPointerDown = (event: PointerEvent) => {
    if (
      shouldRoutePointerToAppMouse(event.shiftKey) &&
      inputHandler.sendMouseEvent("down", event)
    ) {
      clearPendingDesktopSelection();
      event.preventDefault();
      canvas.setPointerCapture?.(event.pointerId);
      return;
    }

    if (isTouchPointer(event)) {
      if (event.button !== 0) return;
      const cell = normalizeSelectionCell(positionToCell(event));
      touchSelectionState.activePointerId = null;
      touchSelectionState.panPointerId = null;

      if (touchSelectionMode === "off") return;
      if (touchSelectionMode === "drag") {
        event.preventDefault();
        beginSelectionDrag(cell, event.pointerId);
        return;
      }

      clearPendingTouchSelection();
      touchSelectionState.pendingPointerId = event.pointerId;
      touchSelectionState.pendingCell = cell;
      touchSelectionState.pendingStartedAt = performance.now();
      touchSelectionState.pendingStartX = event.clientX;
      touchSelectionState.pendingStartY = event.clientY;
      touchSelectionState.panPointerId = event.pointerId;
      touchSelectionState.panLastY = event.clientY;
      touchSelectionState.pendingTimer = setTimeout(() => {
        tryActivatePendingTouchSelection(event.pointerId);
      }, touchSelectionLongPressMs);
      return;
    }

    if (event.button !== 0) return;
    event.preventDefault();
    const cell = normalizeSelectionCell(positionToCell(event));
    updateLinkHover(cell);
    desktopSelectionState.pendingPointerId = event.pointerId;
    desktopSelectionState.pendingCell = cell;
    desktopSelectionState.startedWithActiveSelection = selectionState.active;
  };

  const onPointerMove = (event: PointerEvent) => {
    if (isTouchPointer(event)) {
      if (touchSelectionState.pendingPointerId === event.pointerId) {
        const dx = event.clientX - touchSelectionState.pendingStartX;
        const dy = event.clientY - touchSelectionState.pendingStartY;
        if (dx * dx + dy * dy >= touchSelectionMoveThresholdPx * touchSelectionMoveThresholdPx) {
          clearPendingTouchSelection();
        } else {
          tryActivatePendingTouchSelection(event.pointerId);
        }
        if (touchSelectionState.pendingPointerId === event.pointerId) {
          if (
            touchSelectionMode === "long-press" &&
            touchSelectionState.panPointerId === event.pointerId
          ) {
            const deltaPx = touchSelectionState.panLastY - event.clientY;
            touchSelectionState.panLastY = event.clientY;
            scrollViewportByLines((deltaPx / Math.max(1, getGridState().cellH)) * 1.5);
            event.preventDefault();
          }
          return;
        }
      }
      if (selectionState.dragging && touchSelectionState.activePointerId === event.pointerId) {
        const cell = normalizeSelectionCell(positionToCell(event));
        event.preventDefault();
        selectionState.focus = cell;
        updateLinkHover(null);
        updateCanvasCursor();
        markNeedsRender();
        updateSelectionScroll(event.clientY);
        return;
      }
      if (
        touchSelectionMode === "long-press" &&
        touchSelectionState.panPointerId === event.pointerId
      ) {
        const deltaPx = touchSelectionState.panLastY - event.clientY;
        touchSelectionState.panLastY = event.clientY;
        scrollViewportByLines((deltaPx / Math.max(1, getGridState().cellH)) * 1.5);
        event.preventDefault();
      }
      return;
    }

    const cell = normalizeSelectionCell(positionToCell(event));
    if (
      desktopSelectionState.pendingPointerId === event.pointerId &&
      desktopSelectionState.pendingCell
    ) {
      const anchor = desktopSelectionState.pendingCell;
      if (anchor.row !== cell.row || anchor.col !== cell.col) {
        beginSelectionDrag(anchor, event.pointerId);
        selectionState.focus = cell;
        updateLinkHover(null);
        updateCanvasCursor();
        markNeedsRender();
        return;
      }
      updateLinkHover(cell);
      return;
    }

    if (selectionState.dragging) {
      event.preventDefault();
      selectionState.focus = cell;
      updateLinkHover(null);
      updateCanvasCursor();
      markNeedsRender();
      updateSelectionScroll(event.clientY);
      return;
    }

    if (
      shouldRoutePointerToAppMouse(event.shiftKey) &&
      inputHandler.sendMouseEvent("move", event)
    ) {
      event.preventDefault();
      return;
    }

    updateLinkHover(cell);
  };

  const onPointerUp = createPointerUpHandler({
    inputHandler,
    sendKeyInput,
    openLink,
    isTouchPointer,
    touchSelectionState,
    selectionState,
    normalizeSelectionCell,
    positionToCell,
    clearPendingTouchSelection,
    clearPendingDesktopSelection,
    desktopSelectionState,
    clearSelection,
    selectWordAtCell,
    selectLineAtCell,
    updateCanvasCursor,
    markNeedsRender,
    shouldRoutePointerToAppMouse,
    linkState,
    updateLinkHover,
    clearSelectionScrollTimer,
  });

  const { onPointerCancel, onWheel, onPointerLeave } = createPointerAuxHandlers({
    inputHandler,
    shouldRoutePointerToAppMouse,
    scrollViewportByWheel,
    getWasmReady,
    getWasmHandle,
    getGridState,
    updateLinkHover,
    clearPendingDesktopSelection,
    clearPendingTouchSelection,
    isTouchPointer,
    selectionState,
    touchSelectionState,
    desktopSelectionState,
    updateCanvasCursor,
    markNeedsRender,
    clearSelectionScrollTimer,
  });

  canvas.addEventListener("pointerdown", onPointerDown);
  canvas.addEventListener("pointermove", onPointerMove);
  canvas.addEventListener("pointerup", onPointerUp);
  canvas.addEventListener("pointercancel", onPointerCancel);
  canvas.addEventListener("pointerleave", onPointerLeave);
  canvas.addEventListener("wheel", onWheel, { passive: false });

  cleanupCanvasFns.push(() => {
    canvas.removeEventListener("pointerdown", onPointerDown);
    canvas.removeEventListener("pointermove", onPointerMove);
    canvas.removeEventListener("pointerup", onPointerUp);
    canvas.removeEventListener("pointercancel", onPointerCancel);
    canvas.removeEventListener("pointerleave", onPointerLeave);
    canvas.removeEventListener("wheel", onWheel);
    clearPendingTouchSelection();
    clearSelectionScrollTimer();
  });
}
