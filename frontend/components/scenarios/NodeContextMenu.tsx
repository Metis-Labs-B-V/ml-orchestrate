import { useEffect, useLayoutEffect, useMemo, useRef, useState } from "react";
import { createPortal } from "react-dom";

export type ContextMenuState =
  | { open: false }
  | { open: true; kind: "node"; nodeId: string; x: number; y: number };

export type ContextMenuEntry =
  | { type: "header"; label: string }
  | { type: "divider" }
  | {
      type: "item";
      id: string;
      label: string;
      disabled?: boolean;
      danger?: boolean;
    };

type NodeContextMenuProps = {
  state: ContextMenuState;
  entries: ContextMenuEntry[];
  onClose: () => void;
  onSelect: (itemId: string) => void;
};

const VIEWPORT_PADDING = 8;

const NodeContextMenu = ({ state, entries, onClose, onSelect }: NodeContextMenuProps) => {
  const [isMounted, setIsMounted] = useState(false);
  const [position, setPosition] = useState({ left: 0, top: 0 });
  const menuRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    setIsMounted(true);
  }, []);

  useLayoutEffect(() => {
    if (!state.open || !menuRef.current) {
      return;
    }
    const menuWidth = menuRef.current.offsetWidth || 240;
    const menuHeight = menuRef.current.offsetHeight || 320;
    const viewportWidth = window.innerWidth;
    const viewportHeight = window.innerHeight;

    let nextLeft = state.x;
    let nextTop = state.y;

    if (nextLeft + menuWidth > viewportWidth - VIEWPORT_PADDING) {
      nextLeft = Math.max(VIEWPORT_PADDING, viewportWidth - menuWidth - VIEWPORT_PADDING);
    }
    if (nextTop + menuHeight > viewportHeight - VIEWPORT_PADDING) {
      nextTop = Math.max(VIEWPORT_PADDING, viewportHeight - menuHeight - VIEWPORT_PADDING);
    }

    setPosition({ left: nextLeft, top: nextTop });
  }, [entries, state]);

  useEffect(() => {
    if (!state.open) {
      return;
    }

    const handleOutsidePointerDown = (event: PointerEvent) => {
      const target = event.target as Node | null;
      if (!target || !menuRef.current) {
        return;
      }
      if (!menuRef.current.contains(target)) {
        onClose();
      }
    };

    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        onClose();
      }
    };

    const closeOnViewportChange = () => onClose();

    document.addEventListener("pointerdown", handleOutsidePointerDown, true);
    document.addEventListener("keydown", handleKeyDown);
    window.addEventListener("wheel", closeOnViewportChange, {
      capture: true,
      passive: true,
    });
    window.addEventListener("scroll", closeOnViewportChange, {
      capture: true,
      passive: true,
    });
    window.addEventListener("resize", closeOnViewportChange);

    return () => {
      document.removeEventListener("pointerdown", handleOutsidePointerDown, true);
      document.removeEventListener("keydown", handleKeyDown);
      window.removeEventListener("wheel", closeOnViewportChange, true);
      window.removeEventListener("scroll", closeOnViewportChange, true);
      window.removeEventListener("resize", closeOnViewportChange);
    };
  }, [onClose, state.open]);

  const content = useMemo(() => {
    if (!state.open) {
      return null;
    }

    return (
      <div
        ref={menuRef}
        className="scenario-context-menu"
        style={{
          left: `${position.left}px`,
          top: `${position.top}px`,
        }}
        role="menu"
        onContextMenu={(event) => {
          event.preventDefault();
          event.stopPropagation();
        }}
      >
        {entries.map((entry, index) => {
          if (entry.type === "divider") {
            return <div key={`divider-${index}`} className="scenario-context-menu-divider" />;
          }
          if (entry.type === "header") {
            return (
              <div key={`header-${index}`} className="scenario-context-menu-header">
                {entry.label}
              </div>
            );
          }
          return (
            <button
              key={entry.id}
              type="button"
              role="menuitem"
              className={`scenario-context-menu-item ${entry.danger ? "scenario-context-menu-item--danger" : ""}`}
              disabled={entry.disabled}
              onClick={() => {
                if (entry.disabled) {
                  return;
                }
                onSelect(entry.id);
                onClose();
              }}
            >
              {entry.label}
            </button>
          );
        })}
      </div>
    );
  }, [entries, onClose, onSelect, position.left, position.top, state.open]);

  if (!isMounted || !state.open || !content) {
    return null;
  }

  return createPortal(content, document.body);
};

export default NodeContextMenu;
