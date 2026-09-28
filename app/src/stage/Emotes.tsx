import type { Emote } from "../lib/types";

/** Hand-drawn manga symbols for the emote balloons. */
export function EmoteIcon({ e }: { e: Emote }) {
  switch (e) {
    case "!":
      return <span className="emo-text" style={{ color: "#ff3d5a" }}>!</span>;
    case "?":
      return <span className="emo-text" style={{ color: "#2f86ff" }}>?</span>;
    case "zzz":
      return <span className="emo-text zzz" style={{ color: "#5b7cff" }}>Zz</span>;
    case "note":
      return <span className="emo-text" style={{ color: "#22b573" }}>♪</span>;
    case "anger":
      return (
        <svg viewBox="0 0 40 40" width="30" height="30">
          {[0, 90, 180, 270].map((r) => (
            <path key={r} transform={`rotate(${r} 20 20)`} d="M16 4 C16 12 12 16 4 16" fill="none" stroke="#ff2d4b" strokeWidth="4.5" strokeLinecap="round" />
          ))}
        </svg>
      );
    case "sweat":
      return (
        <svg viewBox="0 0 30 40" width="22" height="30">
          <path d="M15 3 C22 16 26 22 26 28 A11 11 0 0 1 4 28 C4 22 8 16 15 3Z" fill="#8fd3ff" stroke="#3aa0ff" strokeWidth="2.5" />
          <ellipse cx="11" cy="27" rx="3" ry="4" fill="#fff" opacity="0.8" />
        </svg>
      );
    case "heart":
      return (
        <svg viewBox="0 0 40 36" width="30" height="27">
          <path d="M20 34 C8 25 2 18 2 11 A9 9 0 0 1 20 7 A9 9 0 0 1 38 11 C38 18 32 25 20 34Z" fill="#ff5f97" stroke="#e43d7a" strokeWidth="2" />
          <ellipse cx="11" cy="11" rx="3.5" ry="2.5" fill="#fff" opacity="0.8" />
        </svg>
      );
    case "sparkle":
      return (
        <svg viewBox="0 0 44 40" width="32" height="29">
          <path d="M16 2 L19 15 L32 18 L19 21 L16 34 L13 21 L0 18 L13 15Z" fill="#ffd23d" stroke="#f0a000" strokeWidth="1.5" />
          <path d="M35 20 L36.8 26 L43 28 L36.8 30 L35 36 L33.2 30 L27 28 L33.2 26Z" fill="#fff38a" stroke="#f0a000" strokeWidth="1.2" />
        </svg>
      );
    case "idea":
      return (
        <svg viewBox="0 0 36 44" width="26" height="32">
          <path d="M18 3 A13 13 0 0 1 26 26 L25 32 L11 32 L10 26 A13 13 0 0 1 18 3Z" fill="#fff06a" stroke="#f0a000" strokeWidth="2.5" />
          <rect x="11" y="33" width="14" height="6" rx="2" fill="#9aa7b8" />
          <path d="M14 22 L18 14 L22 22" fill="none" stroke="#f0a000" strokeWidth="2" />
        </svg>
      );
    case "gloom":
      return (
        <svg viewBox="0 0 40 30" width="34" height="26">
          {[6, 14, 22, 30].map((x) => (
            <line key={x} x1={x} y1="3" x2={x} y2="27" stroke="#6a7fd6" strokeWidth="3" strokeLinecap="round" opacity="0.8" />
          ))}
        </svg>
      );
  }
}

export function Hammer() {
  return (
    <svg viewBox="0 0 80 80" width="70" height="70">
      <rect x="36" y="30" width="8" height="46" rx="3" fill="#ffd23d" stroke="#c98a00" strokeWidth="2" />
      <rect x="10" y="8" width="60" height="28" rx="12" fill="#ff4d6d" stroke="#b81f3d" strokeWidth="3" />
      <rect x="4" y="12" width="8" height="20" rx="3" fill="#ffd23d" stroke="#c98a00" strokeWidth="2" />
      <rect x="68" y="12" width="8" height="20" rx="3" fill="#ffd23d" stroke="#c98a00" strokeWidth="2" />
      <rect x="18" y="13" width="30" height="6" rx="3" fill="#fff" opacity="0.5" />
    </svg>
  );
}

export function Hand() {
  return (
    <svg viewBox="0 0 80 60" width="66" height="50">
      <path d="M8 40 C8 26 16 18 30 18 L62 18 C68 18 68 26 62 26 L48 26 L70 26 C77 26 77 34 70 34 L50 34 L68 34 C75 34 75 42 68 42 L50 42 L62 42 C68 42 68 50 62 50 L30 50 C16 50 8 48 8 40Z"
        fill="#ffe2cc" stroke="#d99a7a" strokeWidth="2.5" strokeLinejoin="round" />
    </svg>
  );
}
