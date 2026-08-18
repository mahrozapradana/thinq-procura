/**
 * Applies brand color from company_settings to CSS variables globally.
 * Called on Layout mount so entire UI reflects tenant brand.
 */
export function applyBrandColor(hex) {
  if (!hex || !/^#([0-9a-f]{3}){1,2}$/i.test(hex)) return;
  // Convert hex → HSL for shadcn CSS var format "H S% L%"
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
  const H = Math.round(hue);
  const S = Math.round(s * 100);
  const L = Math.round(l * 100);
  document.documentElement.style.setProperty("--accent", `${H} ${S}% ${L}%`);
  document.documentElement.style.setProperty("--ring", `${H} ${S}% ${L}%`);
  document.documentElement.style.setProperty("--brand", hex);
}
