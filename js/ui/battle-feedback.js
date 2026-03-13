(function (globalScope) {
    const api = {};

    const LOG_FILTERS = [
        { id: 'all', label: '全部' },
        { id: 'damage', label: '伤害' },
        { id: 'status', label: '状态' },
        { id: 'reward', label: '奖励' },
        { id: 'system', label: '系统' },
        { id: 'warning', label: '警告' }
    ];

    api.escapeHtml = function escapeHtml(value) {
        if (
            typeof globalScope !== 'undefined'
            && globalScope.DefierBattleHud
            && typeof globalScope.DefierBattleHud.escapeHtml === 'function'
        ) {
            return globalScope.DefierBattleHud.escapeHtml(value);
        }

        return String(value ?? '')
            .replace(/&/g, '&amp;')
            .replace(/</g, '&lt;')
            .replace(/>/g, '&gt;')
            .replace(/"/g, '&quot;');
    };

    api.formatBattleLogTime = function formatBattleLogTime(timestamp) {
        const time = new Date(timestamp);
        if (Number.isNaN(time.getTime())) return '--:--:--';
        return time.toLocaleTimeString([], {
            hour: '2-digit',
            minute: '2-digit',
            second: '2-digit'
        });
    };

    api.getBattleLogFilters = function getBattleLogFilters() {
        return LOG_FILTERS.map((item) => ({ ...item }));
    };

    api.buildBattleLogPanelShellMarkup = function buildBattleLogPanelShellMarkup(activeFilter = 'all') {
        const escapeHtml = api.escapeHtml;

        return `
            <div class="battle-log-panel-header">
                <span class="battle-log-panel-title">战斗记录</span>
                <button type="button" id="battle-log-panel-close" aria-label="关闭战斗记录">×</button>
            </div>
            <div class="battle-log-panel-filters" role="toolbar" aria-label="战斗记录筛选">
                ${LOG_FILTERS.map((item) => `
                    <button type="button"
                            class="log-filter-btn ${item.id === activeFilter ? 'active' : ''}"
                            data-filter="${escapeHtml(item.id)}"
                            aria-pressed="${item.id === activeFilter ? 'true' : 'false'}">
                        ${escapeHtml(item.label)}
                    </button>
                `).join('')}
            </div>
            <div id="battle-log-panel-list"
                 class="battle-log-panel-list"
                 data-renderer="battle-feedback"></div>
        `;
    };

    api.buildBattleLogListMarkup = function buildBattleLogListMarkup(records = [], activeFilter = 'all') {
        const escapeHtml = api.escapeHtml;
        const safeRecords = Array.isArray(records) ? records : [];
        const filteredRecords = safeRecords
            .filter((item) => activeFilter === 'all' || item?.category === activeFilter)
            .slice()
            .reverse();

        if (filteredRecords.length === 0) {
            return '<div class="battle-log-empty">暂无记录</div>';
        }

        return filteredRecords.map((item) => {
            const category = escapeHtml(item?.category || 'system');
            const time = escapeHtml(api.formatBattleLogTime(item?.ts));
            const message = escapeHtml(item?.message || '');
            return `
                <div class="battle-log-item log-${category}">
                    <div class="battle-log-item-time">${time}</div>
                    <div class="battle-log-item-text">${message}</div>
                </div>
            `;
        }).join('');
    };

    api.buildRewardBattleMetaMarkup = function buildRewardBattleMetaMarkup(meta = {}) {
        const escapeHtml = api.escapeHtml;
        const chips = [];

        const toTierText = (value) => `${'I'.repeat(Math.max(1, Math.min(3, Number(value) || 1)))}阶`;

        if (meta.encounter) {
            chips.push(
                `<span class="reward-meta-chip chip-encounter">遭遇战利：${escapeHtml(meta.encounter.themeName || '未知轮段')}（${escapeHtml(toTierText(meta.encounter.tierStage))}）</span>`,
                `<span class="reward-meta-chip chip-gold">遭遇灵石 +${Math.max(0, Math.floor(Number(meta.encounter.goldBonus) || 0))}</span>`,
                `<span class="reward-meta-chip chip-exp">遭遇命环经验 +${Math.max(0, Math.floor(Number(meta.encounter.ringExpBonus) || 0))}</span>`
            );
        }

        if (meta.squad) {
            chips.push(
                `<span class="reward-meta-chip chip-squad">敌阵战利：${escapeHtml(meta.squad.squadName || '未知编队')}</span>`,
                `<span class="reward-meta-chip chip-gold">编队灵石 +${Math.max(0, Math.floor(Number(meta.squad.goldBonus) || 0))}</span>`,
                `<span class="reward-meta-chip chip-exp">编队命环经验 +${Math.max(0, Math.floor(Number(meta.squad.ringExpBonus) || 0))}</span>`
            );

            if (meta.squad.synergyThemeName) {
                chips.push(`<span class="reward-meta-chip chip-synergy">轮段协同：${escapeHtml(meta.squad.synergyThemeName)}</span>`);
            }
        }

        if (chips.length === 0) return '';

        return `
            <div class="reward-meta-title">本场战利来源</div>
            <div class="reward-meta-chips" data-renderer="battle-feedback">${chips.join('')}</div>
        `;
    };

    if (typeof module !== 'undefined' && module.exports) {
        module.exports = api;
    }

    if (globalScope) {
        globalScope.DefierBattleFeedback = api;
    }
})(typeof globalThis !== 'undefined' ? globalThis : this);
