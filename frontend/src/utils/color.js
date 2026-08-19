/** Parses '#RRGGBB' (or '#RGB') into an [r, g, b] array. Falls back to navy on invalid input. */
export function hexToRgb(hex, fallback = [35, 58, 94]) {
  if (!hex) return fallback;
  let h = hex.trim().replace(/^#/, "");
  if (h.length === 3) {
    h = h
      .split("")
      .map((c) => c + c)
      .join("");
  }
  if (!/^[0-9a-fA-F]{6}$/.test(h)) return fallback;
  const num = parseInt(h, 16);
  return [(num >> 16) & 255, (num >> 8) & 255, num & 255];
}

/** Returns a readable rgba() string for use as an inline CSS color/background. */
export function rgba(hex, alpha = 1, fallback = [35, 58, 94]) {
  const [r, g, b] = hexToRgb(hex, fallback);
  return `rgba(${r}, ${g}, ${b}, ${alpha})`;
}

export const DEFAULT_BRAND_COLOR = "#233A5E";
