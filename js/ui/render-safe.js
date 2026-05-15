import { escapeAttr, escapeHtml } from "../core/safe-html.js";

export { escapeAttr, escapeHtml };

export function normalizeRenderText(value) {
  return String(value ?? '');
}

export function joinRenderSegments(values = [], separator = " · ") {
  return (Array.isArray(values) ? values : [values]).map(item => normalizeRenderText(item).trim()).filter(Boolean).join(separator);
}

export function buildDataAttributes(entries = {}) {
  return Object.entries(entries).filter(([, value]) => value !== undefined && value !== null && value !== "").map(([key, value]) => ` ${key}="${escapeAttr(value)}"`).join("");
}
