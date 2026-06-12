// Wallpaper mode renders the office chrome-free for Lively Wallpaper /
// Wallpaper Engine and auto-runs the research loop. The packaged wallpaper
// build sets the global flag; in a browser use ?wallpaper=1 or #/wallpaper.
export function isWallpaperMode(): boolean {
  if (typeof window === "undefined") return false;
  if ((window as Window & { __QRL_WALLPAPER__?: boolean }).__QRL_WALLPAPER__) return true;
  const haystack = `${window.location.search}${window.location.hash}`;
  return /[?&/#]wallpaper/i.test(haystack);
}
