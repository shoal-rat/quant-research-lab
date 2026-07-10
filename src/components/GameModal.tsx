import { X } from "lucide-react";
import { ReactNode, useCallback, useEffect, useId, useRef, useState } from "react";

interface GameModalProps {
  title: string;
  onClose: () => void;
  children: ReactNode;
  wide?: boolean;
}

const EXIT_MS = 170;

// Every secondary screen renders as an overlay above the office - the office
// itself is the only page. Closing plays a short exit animation before the
// modal unmounts (skipped when the user prefers reduced motion).
export function GameModal({ title, onClose, children, wide }: GameModalProps): JSX.Element {
  const dialogRef = useRef<HTMLDivElement>(null);
  const closeRef = useRef<HTMLButtonElement>(null);
  const onCloseRef = useRef(onClose);
  const titleId = useId();
  const [closing, setClosing] = useState(false);
  const closingRef = useRef(false);

  useEffect(() => {
    onCloseRef.current = onClose;
  }, [onClose]);

  const requestClose = useCallback(() => {
    if (closingRef.current) return;
    if (window.matchMedia?.("(prefers-reduced-motion: reduce)").matches) {
      onCloseRef.current();
      return;
    }
    closingRef.current = true;
    setClosing(true);
    window.setTimeout(() => onCloseRef.current(), EXIT_MS);
  }, []);

  useEffect(() => {
    const previousFocus = document.activeElement instanceof HTMLElement ? document.activeElement : null;
    closeRef.current?.focus();
    const handler = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        event.preventDefault();
        requestClose();
        return;
      }
      if (event.key !== "Tab" || !dialogRef.current) return;
      const focusable = Array.from(
        dialogRef.current.querySelectorAll<HTMLElement>(
          'a[href], button:not([disabled]), input:not([disabled]), select:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex="-1"])'
        )
      ).filter((element) => element.offsetParent !== null);
      if (focusable.length === 0) {
        event.preventDefault();
        dialogRef.current.focus();
        return;
      }
      const first = focusable[0];
      const last = focusable[focusable.length - 1];
      if (event.shiftKey && document.activeElement === first) {
        event.preventDefault();
        last.focus();
      } else if (!event.shiftKey && document.activeElement === last) {
        event.preventDefault();
        first.focus();
      }
    };
    document.addEventListener("keydown", handler);
    return () => {
      document.removeEventListener("keydown", handler);
      previousFocus?.focus();
    };
  }, [requestClose]);

  return (
    <div className={`game-modal-backdrop ${closing ? "closing" : ""}`} onClick={requestClose}>
      <div
        ref={dialogRef}
        className={`game-modal ${wide ? "wide" : ""}`}
        role="dialog"
        aria-modal="true"
        aria-labelledby={titleId}
        tabIndex={-1}
        onClick={(event) => event.stopPropagation()}
      >
        <header className="game-modal-head">
          <h2 id={titleId}>{title}</h2>
          <button ref={closeRef} className="icon-close" onClick={requestClose} aria-label="Close">
            <X size={18} />
          </button>
        </header>
        <div className="game-modal-body">{children}</div>
      </div>
    </div>
  );
}
