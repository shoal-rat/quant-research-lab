import { X } from "lucide-react";
import { ReactNode, useEffect } from "react";

interface GameModalProps {
  title: string;
  onClose: () => void;
  children: ReactNode;
  wide?: boolean;
}

// Every secondary screen renders as an overlay above the office - the office
// itself is the only page.
export function GameModal({ title, onClose, children, wide }: GameModalProps): JSX.Element {
  useEffect(() => {
    const handler = (event: KeyboardEvent) => {
      if (event.key === "Escape") onClose();
    };
    window.addEventListener("keydown", handler);
    return () => window.removeEventListener("keydown", handler);
  }, [onClose]);

  return (
    <div className="game-modal-backdrop" onClick={onClose}>
      <div className={`game-modal ${wide ? "wide" : ""}`} onClick={(event) => event.stopPropagation()}>
        <header className="game-modal-head">
          <h2>{title}</h2>
          <button className="icon-close" onClick={onClose} aria-label="Close">
            <X size={18} />
          </button>
        </header>
        <div className="game-modal-body">{children}</div>
      </div>
    </div>
  );
}
