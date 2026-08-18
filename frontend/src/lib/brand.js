/**
 * Applies brand palette from company_settings to CSS variables globally.
 */
function hexToHSL(hex) {
  if (!hex || !/^#([0-9a-f]{3}){1,2}$/i.test(hex)) return null;
  let h = hex.replace("#", "");
  if (h.length === 3) h = h.split("").map(c => c + c).join("");
  const r = parseInt(h.slice(0, 2), 16) / 255;
  const g = parseInt(h.slice(2, 4), 16) / 255;
  const b = parseInt(h.slice(4, 6), 16) / 255;
  const max = Math.max(r, g, b), min = Math.min(r, g, b);
  let hue = 0, s = 0;
  const l = (max + min) / 2;
  if (max !== min) {
    const d = max - min;
    s = l > 0.5 ? d / (2 - max - min) : d / (max + min);
    switch (max) {
      case r: hue = ((g - b) / d + (g < b ? 6 : 0)) * 60; break;
      case g: hue = ((b - r) / d + 2) * 60; break;
      case b: hue = ((r - g) / d + 4) * 60; break;
    }
  }
  return `${Math.round(hue)} ${Math.round(s * 100)}% ${Math.round(l * 100)}%`;
}

export function applyBrandColor(hex) {
  const hsl = hexToHSL(hex);
  if (!hsl) return;
  document.documentElement.style.setProperty("--accent", hsl);
  document.documentElement.style.setProperty("--ring", hsl);
  document.documentElement.style.setProperty("--brand", hex);
}

export function applyBrandPalette({ primary, warning, success } = {}) {
  if (primary) applyBrandColor(primary);
  const w = hexToHSL(warning);
  if (w) {
    document.documentElement.style.setProperty("--brand-warning", warning);
    document.documentElement.style.setProperty("--brand-warning-hsl", w);
  }
  const s = hexToHSL(success);
  if (s) {
    document.documentElement.style.setProperty("--brand-success", success);
    document.documentElement.style.setProperty("--brand-success-hsl", s);
  }
}
