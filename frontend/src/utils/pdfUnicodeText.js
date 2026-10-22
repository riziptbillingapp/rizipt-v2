/**
 * Unicode-safe text for jsPDF.
 *
 * jsPDF's built-in fonts (helvetica/times/courier) only cover WinAnsi
 * (roughly Latin-1). Anything else — Tamil, Hindi, ₹, emoji — gets mangled
 * into Latin-1 garbage (e.g. "தமிழ்" → "¾Á¢ú"). Embedding a TTF does not fix
 * Tamil either, because jsPDF does no complex-script shaping: vowel signs
 * like ெ ே ை would land on the wrong side of the consonant and the கு/டி
 * ligatures would break.
 *
 * So: plain Latin text keeps going through pdf.text() (crisp vector, selectable),
 * and any text that needs shaping is laid out and shaped by the browser on a
 * high-resolution canvas (~300 dpi), then placed into the PDF as a transparent
 * PNG. The browser's text engine handles Tamil perfectly, and at this
 * resolution print output is sharp.
 */

const SCALE = 4.5; // canvas px per PDF pt → ~324 dpi
const FONT_LINK_ID = "rizipt-pdf-unicode-fonts";
const FONT_CSS =
  "https://fonts.googleapis.com/css2?family=Noto+Sans:ital,wght@0,400;0,700;1,400&family=Noto+Sans+Tamil:wght@400;700&display=swap";

// Characters jsPDF's standard fonts can draw correctly.
const SAFE = /^[\u0000-ÿ–—‘’“”•…€]*$/;

export function needsShaping(text) {
  return !SAFE.test(String(text ?? ""));
}

const FAMILY_STACK = {
  helvetica: `"Helvetica Neue", Helvetica, Arial, "Noto Sans", "Noto Sans Tamil", "Nirmala UI", Latha, sans-serif`,
  courier: `"Courier New", Courier, "Noto Sans Tamil", "Nirmala UI", Latha, monospace`,
  times: `"Times New Roman", Times, "Noto Sans Tamil", "Nirmala UI", Latha, serif`,
};

let fontsReady = null;

/** Loads Noto Sans Tamil once (falls back to system Tamil fonts if offline). */
export function ensureUnicodeFonts() {
  if (fontsReady) return fontsReady;
  fontsReady = (async () => {
    try {
      if (!document.getElementById(FONT_LINK_ID)) {
        const link = document.createElement("link");
        link.id = FONT_LINK_ID;
        link.rel = "stylesheet";
        link.href = FONT_CSS;
        document.head.appendChild(link);
        await new Promise((resolve) => {
          link.onload = resolve;
          link.onerror = resolve;
          setTimeout(resolve, 4000);
        });
      }
      if (document.fonts?.load) {
        await Promise.race([
          Promise.all([
            document.fonts.load('400 20px "Noto Sans Tamil"', "தமிழ்"),
            document.fonts.load('700 20px "Noto Sans Tamil"', "தமிழ்"),
            document.fonts.load('400 20px "Noto Sans"', "₹"),
          ]),
          new Promise((r) => setTimeout(r, 4000)),
        ]);
      }
    } catch {
      // System fonts (Nirmala UI / Latha on Windows, Noto on Android/macOS) still work.
    }
  })();
  return fontsReady;
}

function cssFont(pdf, sizePt, scale = 1) {
  const f = pdf.getFont();
  const style = String(f.fontStyle || "normal").toLowerCase();
  const weight = style.includes("bold") ? 700 : 400;
  const italic = style.includes("italic") || style.includes("oblique") ? "italic " : "";
  const family = FAMILY_STACK[String(f.fontName).toLowerCase()] || FAMILY_STACK.helvetica;
  return `${italic}${weight} ${sizePt * scale}px ${family}`;
}

let measureCtx = null;
function measurer(pdf) {
  if (!measureCtx) measureCtx = document.createElement("canvas").getContext("2d");
  measureCtx.font = cssFont(pdf, pdf.getFontSize());
  return measureCtx;
}

/** Width in pt of `text` at the pdf's current font/size. */
export function textWidth(pdf, text) {
  const s = String(text ?? "");
  if (!needsShaping(s)) return pdf.getTextWidth(s);
  return measurer(pdf).measureText(s).width;
}

function graphemes(str) {
  if (typeof Intl !== "undefined" && Intl.Segmenter) {
    return Array.from(new Intl.Segmenter(undefined, { granularity: "grapheme" }).segment(str), (s) => s.segment);
  }
  // Fallback: keep combining marks (Tamil vowel signs, virama) with their base.
  return str.match(/\P{M}\p{M}*/gu) || [];
}

/** Like pdf.splitTextToSize, but measures with the browser for non-Latin text. */
export function splitText(pdf, text, maxWidth) {
  const s = String(text ?? "");
  if (!needsShaping(s)) return pdf.splitTextToSize(s, maxWidth);

  const ctx = measurer(pdf);
  const w = (t) => ctx.measureText(t).width;
  const out = [];

  s.replace(/\r\n?/g, "\n").split("\n").forEach((para) => {
    if (!para.trim()) {
      out.push("");
      return;
    }
    let line = "";
    para.split(/(\s+)/).forEach((tok) => {
      if (!tok) return;
      const candidate = line + tok;
      if (w(candidate) <= maxWidth || (!line && /^\s+$/.test(tok))) {
        line = candidate;
        return;
      }
      if (/^\s+$/.test(tok)) return; // drop the space at a wrap point
      if (line.trim()) out.push(line.trimEnd());
      line = "";
      if (w(tok) <= maxWidth) {
        line = tok;
        return;
      }
      // Single word longer than the line: break between grapheme clusters.
      graphemes(tok).forEach((g) => {
        if (w(line + g) > maxWidth && line) {
          out.push(line);
          line = g;
        } else {
          line += g;
        }
      });
    });
    out.push(line.trimEnd());
  });
  return out;
}

function rgbToCss(pdf) {
  // jsPDF stores the text color as a PDF operator string, e.g. "0.110 0.141 0.188 rg" or "0 g".
  const raw = String(pdf.getTextColor ? pdf.getTextColor() : "#000000");
  if (raw.startsWith("#")) return raw;
  const nums = raw.match(/-?\d*\.?\d+/g)?.map(Number) || [0];
  if (nums.length >= 3) return `rgb(${nums.slice(0, 3).map((n) => Math.round((n <= 1 ? n * 255 : n))).join(",")})`;
  const g = Math.round((nums[0] <= 1 ? nums[0] * 255 : nums[0]));
  return `rgb(${g},${g},${g})`;
}

/**
 * Drop-in for pdf.text(text, x, y, { align }) — y is the baseline, as in jsPDF.
 * Accepts a string or an array of lines (drawn at the pdf's line height).
 */
export function drawText(pdf, text, x, y, opts = {}) {
  if (Array.isArray(text)) {
    const lh = opts.lineHeight || pdf.getFontSize() * pdf.getLineHeightFactor();
    text.forEach((line, i) => drawText(pdf, line, x, y + i * lh, opts));
    return;
  }
  const s = String(text ?? "");
  if (!s) return;
  if (!needsShaping(s)) {
    pdf.text(s, x, y, opts.align ? { align: opts.align } : undefined);
    return;
  }

  const size = pdf.getFontSize();
  const font = cssFont(pdf, size, SCALE);
  const ctx0 = measurer(pdf);
  const widthPt = Math.ceil(ctx0.measureText(s).width) + 2;
  const ascentPt = size * 1.15; // Tamil stacks marks above the x-height
  const descentPt = size * 0.55;
  const heightPt = ascentPt + descentPt;

  const canvas = document.createElement("canvas");
  canvas.width = Math.ceil(widthPt * SCALE);
  canvas.height = Math.ceil(heightPt * SCALE);
  const ctx = canvas.getContext("2d");
  ctx.font = font;
  ctx.fillStyle = rgbToCss(pdf);
  ctx.textBaseline = "alphabetic";
  ctx.fillText(s, SCALE, ascentPt * SCALE);

  let left = x;
  if (opts.align === "right") left = x - widthPt + 1;
  else if (opts.align === "center") left = x - widthPt / 2;

  pdf.addImage(canvas.toDataURL("image/png"), "PNG", left - 1, y - ascentPt, widthPt, heightPt, undefined, "FAST");
}
