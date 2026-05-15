const HTML_ESCAPE_MAP = {
  '&': '&amp;',
  '<': '&lt;',
  '>': '&gt;',
  '"': '&quot;',
  "'": '&#39;'
};

const HTML_ESCAPE_RE = /[&<>"']/g;

function normalizeHtmlValue(value) {
  return String(value ?? '');
}

export function escapeHtml(value) {
  return normalizeHtmlValue(value).replace(HTML_ESCAPE_RE, ch => HTML_ESCAPE_MAP[ch] || ch);
}

export function escapeAttr(value) {
  return normalizeHtmlValue(value)
    .replace(HTML_ESCAPE_RE, ch => HTML_ESCAPE_MAP[ch] || ch)
    .replace(/\r?\n/g, '&#10;');
}
