import { escapeAttr, escapeHtml } from "./render-safe.js";
import { buildBattleLogListMarkup as buildBattleLogListMarkupRenderer, buildBattleLogPanelShellMarkup as buildBattleLogPanelShellMarkupRenderer, buildRewardBattleMetaMarkup as buildRewardBattleMetaMarkupRenderer, formatBattleLogTime as formatBattleLogTimeRenderer, getBattleLogFilters as getBattleLogFiltersRenderer } from "./renderers/battle-feedback-renderer.js";

(function (globalScope) {
  const fallbackEscapeHtml = value => String(value ?? "").replace(/[&<>"']/g, ch => ({
    "&": "&amp;",
    "<": "&lt;",
    ">": "&gt;",
    "\"": "&quot;",
    "'": "&#39;"
  }[ch] || ch));
  const fallbackEscapeAttr = value => fallbackEscapeHtml(value).replace(/\r?\n/g, "&#10;");
  const fallbackLogFilters = [{
    id: "all",
    label: "全部"
  }, {
    id: "damage",
    label: "伤害"
  }, {
    id: "status",
    label: "状态"
  }, {
    id: "reward",
    label: "奖励"
  }, {
    id: "system",
    label: "系统"
  }, {
    id: "warning",
    label: "警告"
  }];
  const fallbackFormatBattleLogTime = timestamp => {
    const time = new Date(timestamp);
    if (Number.isNaN(time.getTime())) return "--:--:--";
    return time.toLocaleTimeString([], {
      hour: "2-digit",
      minute: "2-digit",
      second: "2-digit"
    });
  };
  const fallbackGetBattleLogFilters = () => fallbackLogFilters.map(item => ({
    ...item
  }));
  const fallbackBuildBattleLogPanelShellMarkup = (activeFilter = "all") => `
            <div class="battle-log-panel-header">
                <span class="battle-log-panel-title">战斗记录</span>
                <button type="button" id="battle-log-panel-close" aria-label="关闭战斗记录">×</button>
            </div>
            <div class="battle-log-panel-filters" role="toolbar" aria-label="战斗记录筛选">
                ${fallbackLogFilters.map(item => `
                    <button type="button"
                            class="log-filter-btn ${item.id === activeFilter ? "active" : ""}"
                            data-filter="${fallbackEscapeAttr(item.id)}"
                            aria-pressed="${item.id === activeFilter ? "true" : "false"}">
                        ${fallbackEscapeHtml(item.label)}
                    </button>
                `).join("")}
            </div>
            <div id="battle-log-panel-list"
                 class="battle-log-panel-list"
                 data-renderer="battle-feedback"></div>
        `;
  const fallbackBuildBattleLogListMarkup = (records = [], activeFilter = "all") => {
    const safeRecords = Array.isArray(records) ? records : [];
    const filteredRecords = safeRecords.filter(item => activeFilter === "all" || item?.category === activeFilter).slice().reverse();
    if (filteredRecords.length === 0) {
      return '<div class="battle-log-empty">暂无记录</div>';
    }
    return filteredRecords.map(item => {
      const category = fallbackEscapeHtml(item?.category || "system");
      const time = fallbackEscapeHtml(fallbackFormatBattleLogTime(item?.ts));
      const message = fallbackEscapeHtml(item?.message || "");
      return `
                <div class="battle-log-item log-${category}">
                    <div class="battle-log-item-time">${time}</div>
                    <div class="battle-log-item-text">${message}</div>
                </div>
            `;
    }).join("");
  };
  const fallbackBuildRewardBattleMetaMarkup = (meta = {}) => {
    const chips = [];
    const toTierText = value => `${"I".repeat(Math.max(1, Math.min(3, Number(value) || 1)))}阶`;
    if (meta.encounter) {
      chips.push(`<span class="reward-meta-chip chip-encounter">遭遇战利：${fallbackEscapeHtml(meta.encounter.themeName || "未知轮段")}（${fallbackEscapeHtml(toTierText(meta.encounter.tierStage))}）</span>`, `<span class="reward-meta-chip chip-gold">遭遇灵石 +${Math.max(0, Math.floor(Number(meta.encounter.goldBonus) || 0))}</span>`, `<span class="reward-meta-chip chip-exp">遭遇命环经验 +${Math.max(0, Math.floor(Number(meta.encounter.ringExpBonus) || 0))}</span>`);
    }
    if (meta.squad) {
      chips.push(`<span class="reward-meta-chip chip-squad">敌阵战利：${fallbackEscapeHtml(meta.squad.squadName || "未知编队")}</span>`, `<span class="reward-meta-chip chip-gold">编队灵石 +${Math.max(0, Math.floor(Number(meta.squad.goldBonus) || 0))}</span>`, `<span class="reward-meta-chip chip-exp">编队命环经验 +${Math.max(0, Math.floor(Number(meta.squad.ringExpBonus) || 0))}</span>`);
      if (meta.squad.synergyThemeName) {
        chips.push(`<span class="reward-meta-chip chip-synergy">轮段协同：${fallbackEscapeHtml(meta.squad.synergyThemeName)}</span>`);
      }
    }
    if (chips.length === 0) return "";
    return `
            <div class="reward-meta-title">本场战利来源</div>
            <div class="reward-meta-chips" data-renderer="battle-feedback">${chips.join("")}</div>
        `;
  };
  const api = {
    escapeHtml: typeof escapeHtml === "function" ? escapeHtml : fallbackEscapeHtml,
    escapeAttr: typeof escapeAttr === "function" ? escapeAttr : fallbackEscapeAttr,
    formatBattleLogTime: typeof formatBattleLogTimeRenderer === "function" ? formatBattleLogTimeRenderer : fallbackFormatBattleLogTime,
    getBattleLogFilters: typeof getBattleLogFiltersRenderer === "function" ? getBattleLogFiltersRenderer : fallbackGetBattleLogFilters,
    buildBattleLogPanelShellMarkup: typeof buildBattleLogPanelShellMarkupRenderer === "function" ? buildBattleLogPanelShellMarkupRenderer : fallbackBuildBattleLogPanelShellMarkup,
    buildBattleLogListMarkup: typeof buildBattleLogListMarkupRenderer === "function" ? buildBattleLogListMarkupRenderer : fallbackBuildBattleLogListMarkup,
    buildRewardBattleMetaMarkup: typeof buildRewardBattleMetaMarkupRenderer === "function" ? buildRewardBattleMetaMarkupRenderer : fallbackBuildRewardBattleMetaMarkup
  };
  if (globalScope) {
    globalScope.DefierBattleFeedback = api;
  }
})(typeof globalThis !== 'undefined' ? globalThis : typeof window !== 'undefined' ? window : this);

export const BattleFeedback = (typeof globalThis !== 'undefined' ? globalThis : typeof window !== 'undefined' ? window : this).DefierBattleFeedback;
export const formatBattleLogTime = BattleFeedback.formatBattleLogTime;
export const buildBattleLogPanelShellMarkup = BattleFeedback.buildBattleLogPanelShellMarkup || BattleFeedback.buildBattleLogPanelMarkup;
export const buildBattleLogListMarkup = BattleFeedback.buildBattleLogListMarkup;
export const buildRewardBattleMetaMarkup = BattleFeedback.buildRewardBattleMetaMarkup;
