import { motion } from "framer-motion";
import type { ReactNode } from "react";
import { t } from "../lib/i18n";
import { useStore } from "../lib/store";

export function Sheet({ title, sub, onClose, children, wide = false }: { title: string; sub?: string; onClose: () => void; children: ReactNode; wide?: boolean }) {
  const lang = useStore((s) => s.lang);
  return (
    <motion.div className="sheet-wrap" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} onClick={onClose}>
      <motion.div className={`sheet panel ${wide ? "wide" : ""}`} onClick={(e) => e.stopPropagation()}
        initial={{ y: 40, opacity: 0, scale: 0.98 }} animate={{ y: 0, opacity: 1, scale: 1 }} exit={{ y: 30, opacity: 0 }}
        transition={{ type: "spring", stiffness: 260, damping: 26 }}>
        <div className="sheet-head halftone">
          <span className="stripe-title big">{title}</span>
          {sub && <span className="sheet-sub">{sub}</span>}
          <button className="btn ghost sheet-x" onClick={onClose} aria-label={t("close", lang)}>✕</button>
        </div>
        <div className="sheet-body scroll">{children}</div>
      </motion.div>
    </motion.div>
  );
}
