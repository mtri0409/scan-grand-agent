// DS01 v6.0 brand palette — shared across helpers, charts, and mermaid renderer.
export const NAVY_HEX = "21439A";
/** @ts-ignore */
export const GOLD_HEX = "C5940A";
export const DARK_HEX = "1B2A4A";
export const BODY_HEX = "2C2C2C";
export const LIGHT_HEX = "4A6FA5";
export const GREY_HEX = "888888";
export const WHITE_HEX = "FFFFFF";
export const RED_HEX = "CC0000";
export const TABLE_ALT_HEX = "F5F5FF";
export const INFO_BOX_BG_HEX = "EEF2FF";
export const BORDER_GREY_HEX = "CCCCCC";
export const NAVY = `#${NAVY_HEX}`;
export const GOLD = `#${GOLD_HEX}`;
export const DARK = `#${DARK_HEX}`;
export const BODY = `#${BODY_HEX}`;
export const LIGHT = `#${LIGHT_HEX}`;
export const GREY = `#${GREY_HEX}`;
export const WHITE = `#${WHITE_HEX}`;
export const RED = `#${RED_HEX}`;
export const GREEN = "#3C8A4E";
export const AMBER = "#D9932A";
export const BG = `#${TABLE_ALT_HEX}`;
export const FONT_NAME = "Calibri";
export const DEFAULT_HEADLINE = "VNF Documentation System";
export const DEFAULT_FOOTER_TEXT = "Confidential";
export const DEFAULT_WIDTH_LEVEL = "wider";
export const LANDSCAPE_SIDE_MARGIN = {
    wide: 1.0,
    wider: 0.6,
    widest: 0.4,
};
const WIDTH_ALIASES: Record<string, string> = {
    wide: "wide", w: "wide", current: "wide", "default-wide": "wide",
    wider: "wider", medium: "wider", half: "wider",
    widest: "widest", max: "widest", maximum: "widest", full: "widest",
    fullwidth: "widest", "full-width": "widest", "rong nhat": "widest",
};
export function normalizeWidthLevel(width?: string): string {
    const w = (width ?? DEFAULT_WIDTH_LEVEL).trim().toLowerCase();
    return WIDTH_ALIASES[w] ?? DEFAULT_WIDTH_LEVEL;
}
