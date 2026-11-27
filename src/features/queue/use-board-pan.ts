"use client";
import {
  useCallback,
  useEffect,
  useRef,
  useState,
  type PointerEvent,
} from "react";

const controls =
  "a, button, input, select, textarea, label, summary, [role='button'], [contenteditable]:not([contenteditable='false']), [draggable='true']";

function verticalScrollContainer(board: HTMLElement) {
  for (let el: HTMLElement | null = board; el; el = el.parentElement) {
    if (el.scrollHeight > el.clientHeight &&
        /^(auto|scroll|overlay)$/.test(getComputedStyle(el).overflowY)) return el;
  }
  return document.scrollingElement ?? document.documentElement;
}

/** Mouse panning only: touch, wheel, keyboard and card actions keep their native behavior. */
export function useBoardPan() {
  const ref = useRef<HTMLDivElement>(null);
  const gesture = useRef<{
    pointerId: number;
    x: number;
    y: number;
    scrollLeft: number;
    vertical: Element;
    scrollTop: number;
    moved: boolean;
  } | null>(null);
  const suppressClick = useRef(false);
  const [isPanning, setIsPanning] = useState(false);
  const stop = useCallback(() => {
    const pending = gesture.current;
    gesture.current = null;
    setIsPanning(false);
    if (pending && ref.current?.hasPointerCapture(pending.pointerId))
      ref.current.releasePointerCapture(pending.pointerId);
  }, []);

  useEffect(() => {
    window.addEventListener("blur", stop);
    return () => window.removeEventListener("blur", stop);
  }, [stop]);

  function onPointerDown(e: PointerEvent<HTMLDivElement>) {
    suppressClick.current = false;
    if (
      e.pointerType !== "mouse" ||
      e.button !== 0 ||
      e.ctrlKey ||
      e.metaKey ||
      e.shiftKey ||
      e.altKey ||
      (e.target instanceof Element && e.target.closest(controls))
    )
      return;
    const board = e.currentTarget;
    const vertical = verticalScrollContainer(board);
    if (board.scrollWidth <= board.clientWidth && vertical.scrollHeight <= vertical.clientHeight) return;
    // Leave the native scrollbar/thumb available to the mouse too.
    const bounds = board.getBoundingClientRect();
    if (
      e.clientY >= bounds.top + board.clientTop + board.clientHeight ||
      e.clientX >= bounds.left + board.clientLeft + board.clientWidth
    )
      return;
    gesture.current = {
      pointerId: e.pointerId,
      x: e.clientX,
      y: e.clientY,
      scrollLeft: board.scrollLeft,
      vertical,
      scrollTop: vertical.scrollTop,
      moved: false,
    };
    board.setPointerCapture(e.pointerId);
  }

  function onPointerMove(e: PointerEvent<HTMLDivElement>) {
    const pending = gesture.current;
    if (!pending || pending.pointerId !== e.pointerId) return;
    if (!(e.buttons & 1)) return stop();
    const dx = e.clientX - pending.x;
    const dy = e.clientY - pending.y;
    if (!pending.moved) {
      if (Math.hypot(dx, dy) < 6) return;
      pending.moved = true;
      suppressClick.current = true;
      setIsPanning(true);
      const selection = window.getSelection();
      if (
        selection?.anchorNode &&
        e.currentTarget.contains(selection.anchorNode)
      )
        selection.removeAllRanges();
    }
    e.preventDefault();
    e.currentTarget.scrollLeft = pending.scrollLeft - dx;
    pending.vertical.scrollTop = pending.scrollTop - dy;
  }

  return {
    ref,
    "data-panning": isPanning || undefined,
    onPointerDown,
    onPointerMove,
    onPointerUp: stop,
    onPointerCancel: stop,
    onLostPointerCapture: stop,
    onClickCapture: (e: React.MouseEvent<HTMLDivElement>) => {
      if (!suppressClick.current || e.detail === 0) return;
      suppressClick.current = false;
      e.preventDefault();
      e.stopPropagation();
    },
    onDragStart: (e: React.DragEvent<HTMLDivElement>) => {
      if (gesture.current) e.preventDefault();
    },
  };
}
