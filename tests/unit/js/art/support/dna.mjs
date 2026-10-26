// tests/unit/js/art/support/dna.mjs · the six presets' art DNA, support hues and tones, typed in from spec 13-visual-language.md 6.0 (tables "Style DNA at a glance",
// "Support hues", "Tones"). Test data only: the shipped values live in each preset.json (PR1-PR6). A tone is [bg, surface, ink, inkMuted, accent].
export const PRESETS = ["swiss", "creator", "notebook", "poster", "interface", "heritage"];

export const ART = {
  swiss: { stroke: 2.0, cap: "butt", join: "miter", container: "square", radius: { chip: 0, tile: 0, card: 0, panel: 0, window: 0 }, shadow: { kind: "none" }, outline: 0, wobble: 0, tilt: 0, mark: "fill", chipOffset: 0, colors: { note: "#FFE88A", support: ["#1D4ED8", "#0F766E"] } },
  creator: { stroke: 2.5, cap: "round", join: "round", container: "disc", radius: { chip: 999, tile: 28, card: 36, panel: 36, window: 36 }, shadow: { kind: "hard", dx: 6, dy: 6 }, outline: 4, wobble: 0.2, tilt: 6, mark: "outline", chipOffset: 0, colors: { note: "#FFE88A", support: ["#FF8FB1", "#6EC6FF"] } },
  notebook: { stroke: 2.0, cap: "round", join: "round", container: "hand-circle", radius: { chip: 999, tile: 14, card: 10, panel: 10, window: 10 }, shadow: { kind: "soft", dx: 0, dy: 4, blur: 14 }, outline: 3, wobble: 0.6, tilt: 3, mark: "outline", chipOffset: 0, colors: { note: "#FFE88A", support: ["#2E8B57", "#F4B63F"] } },
  poster: { stroke: 2.5, cap: "butt", join: "miter", container: "stamp", radius: { chip: 0, tile: 0, card: 4, panel: 4, window: 4 }, shadow: { kind: "none" }, outline: 0, wobble: 0, tilt: 0, mark: "fill", chipOffset: 0, colors: { note: "#FFE88A", support: ["#A8741A", "#3A6EA5"] } },
  interface: { stroke: 2.0, cap: "round", join: "round", container: "app-tile", radius: { chip: 12, tile: 16, card: 24, panel: 24, window: 28 }, shadow: { kind: "soft", dx: 0, dy: 12, blur: 32 }, outline: 0, wobble: 0, tilt: 0, mark: "fill", chipOffset: 0, colors: { note: "#FFE88A", support: ["#059669", "#B45309"] } },
  heritage: { stroke: 1.5, cap: "round", join: "round", container: "arch", radius: { chip: 12, tile: 12, card: 4, panel: 4, window: 4 }, shadow: { kind: "soft", dx: 0, dy: 10, blur: 28 }, outline: 0, wobble: 0, tilt: 0, mark: "fill", chipOffset: 0, colors: { note: "#FFE88A", support: ["#E0895F", "#7DB0DE"] } }
};

export const TONES = {
  swiss: { base: ["#F4F4F2", "#FFFFFF", "#111111", "#5A5A5A", "#E3262B"], invert: ["#111111", "#222222", "#F4F4F2", "#8D8D8C", "#E3262B"], field: ["#E3262B", "#C22125", "#FFFFFF", "#FFFFFF", "#111111"] },
  creator: { base: ["#F6F2EA", "#FFFFFF", "#14120F", "#5B554B", "#FFD23F"], invert: ["#1C1A18", "#343330", "#F6F2EA", "#A19E99", "#FFD23F"], field: ["#F6F2EA", "#FFD23F", "#14120F", "#14120F", "#FFFFFF"] },
  notebook: { base: ["#F6F0DF", "#FFFCF2", "#1D2B5A", "#56608A", "#D8382C"], invert: ["#1D2B5A", "#383F62", "#F6F0DF", "#B4B1AC", "#E6AC9F"], field: ["#CBA36B", "#FFFCF2", "#1D2B5A", "#1D2B5A", "#8E1F18"] },
  poster: { base: ["#F3EBD8", "#FBF6E9", "#1B4332", "#4A5F55", "#B04A1E"], invert: ["#1B4332", "#365040", "#F3EBD8", "#C1BEAD", "#D8B9A6"], field: ["#B04A1E", "#964825", "#F3EBD8", "#F3EBD8", "#F3EBD8"] },
  interface: { base: ["#E8ECF3", "#FFFFFF", "#0F172A", "#475569", "#4F46E5"], invert: ["#0F172A", "#2F333F", "#E8ECF3", "#9C9FA6", "#B8BAED"], field: ["#413ABE", "#4F46E5", "#FFFFFF", "#F2F2FC", "#FFFFFF"] },
  heritage: { base: ["#133B31", "#1F5A47", "#F7F1E3", "#CDDBD3", "#EEBA66"], invert: ["#F7F1E3", "#F4EEE0", "#133B31", "#606A61", "#846635"], field: ["#EEBA66", "#F1CFA1", "#133B31", "#133B31", "#133B31"] }
};

/** The page-side table: { preset: { art, tones } }. */
export function pagePresets() {
  const out = {};
  for (const p of PRESETS) out[p] = { art: ART[p], tones: TONES[p] };
  return out;
}
