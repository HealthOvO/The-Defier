const TECHNICAL_MESSAGE_PATTERN = /(?:\b(?:HTTP|GET|POST|PUT|PATCH|DELETE|API|JSON|fetch|network|timeout|ECONN|ENOTFOUND|socket|websocket|endpoint|payload|stack|token)\b|\/api\/|https?:\/\/|[A-Za-z]+Error\b|status\s*[:=]?\s*\d{3}|(?:^|\s)at\s+[A-Za-z_$]|[A-Za-z0-9]+_[A-Za-z0-9_]+)/i;
const SESSION_EXPIRED_PATTERN = /(?:unauthorized|auth[\s_-]*expired|session[\s_-]*expired|登录(?:状态)?(?:已)?(?:失效|过期)|未登录)/i;

function extractMessage(source) {
  if (source && typeof source === 'object') {
    return source.message
      || source.error?.message
      || source.reason
      || source.error?.reason
      || '';
  }
  return source || '';
}

export function safePlayerMessage(source, fallback = '操作未完成，请稍后再试', options = {}) {
  const maxLength = Math.max(32, Number(options.maxLength) || 120);
  const sessionExpiredMessage = String(options.sessionExpiredMessage || '登录状态已过期，请重新登录');
  const message = String(extractMessage(source))
    .replace(/\s+/g, ' ')
    .trim();

  if (SESSION_EXPIRED_PATTERN.test(message)) return sessionExpiredMessage;
  if (!message || message.length > maxLength || TECHNICAL_MESSAGE_PATTERN.test(message)) return fallback;
  return message;
}
