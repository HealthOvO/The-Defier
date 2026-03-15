(function (globalScope) {
    const api = {};

    api.escapeHtml = function escapeHtml(value) {
        return String(value ?? '')
            .replace(/&/g, '&amp;')
            .replace(/</g, '&lt;')
            .replace(/>/g, '&gt;')
            .replace(/"/g, '&quot;');
    };

    api.shouldUseCompactBattleHud = function shouldUseCompactBattleHud(viewportWidth) {
        const width = Number(viewportWidth)
            || (typeof window !== 'undefined' ? Number(window.innerWidth) || 0 : 0);
        return width > 0 && width <= 768;
    };

    api.clampFloatingPanelPosition = function clampFloatingPanelPosition(options = {}) {
        const viewportWidth = Math.max(0, Number(options.viewportWidth) || 0);
        const viewportHeight = Math.max(0, Number(options.viewportHeight) || 0);
        const width = Math.max(0, Number(options.width) || 0);
        const height = Math.max(0, Number(options.height) || 0);
        const gutter = Math.max(0, Number(options.gutter) || 8);
        const maxLeft = Math.max(gutter, viewportWidth - width - gutter);
        const maxTop = Math.max(gutter, viewportHeight - height - gutter);
        return {
            left: Math.min(Math.max(gutter, Math.round(Number(options.left) || 0)), maxLeft),
            top: Math.min(Math.max(gutter, Math.round(Number(options.top) || 0)), maxTop)
        };
    };

    api.truncateBattleLabel = function truncateBattleLabel(value, maxLength = 6) {
        const safeValue = String(value || '').trim();
        if (!safeValue) return '';
        const glyphs = Array.from(safeValue);
        if (glyphs.length <= maxLength) return safeValue;
        return `${glyphs.slice(0, maxLength).join('')}…`;
    };

    api.resolveEnemyIntentDisplay = function resolveEnemyIntentDisplay(pattern = {}) {
        const fallbackIcons = {
            attack: '⚔️',
            multiAttack: '⚔️',
            defend: '🛡️',
            buff: '✨',
            debuff: '🌀',
            heal: '💚',
            addStatus: '🕳️',
            summon: '👥',
            multiAction: '✦',
            executeDamage: '💥'
        };

        const rawIntent = String(pattern.intent || '').trim();
        const labelStart = rawIntent.search(/[A-Za-z0-9\u3400-\u9FFF]/);
        const explicitIcon = labelStart > 0
            ? rawIntent.slice(0, labelStart).trim()
            : labelStart === -1
                ? rawIntent
                : '';
        const explicitLabel = labelStart >= 0
            ? rawIntent.slice(Math.max(0, labelStart)).trim()
            : '';
        const fallbackIcon = fallbackIcons[pattern.type] || '❓';
        const icon = explicitIcon || fallbackIcon;
        const label = api.truncateBattleLabel(explicitLabel);

        return {
            icon,
            label,
            hasLabel: !!label,
            rawIntent,
            type: String(pattern.type || 'unknown')
        };
    };

    api.buildEnemyIntentMarkup = function buildEnemyIntentMarkup(input = {}) {
        const escapeHtml = api.escapeHtml;
        const typeClass = escapeHtml(input.type || 'unknown');
        const icon = escapeHtml(input.icon || '❓');
        const label = escapeHtml(input.label || '');
        const value = escapeHtml(input.value || '');
        const tooltipSafe = escapeHtml(input.tooltipSafe || '');
        const ariaLabel = escapeHtml(input.ariaLabel || input.label || input.type || '敌方意图');
        const hasLabel = !!String(input.label || '').trim();
        const breakerClass = input.isGuardBreaker ? 'breaker' : '';
        const densityClass = hasLabel ? 'has-label' : 'icon-only';

        return `
            <div class="enemy-intent ${typeClass} ${breakerClass} ${densityClass}"
                 role="img"
                 aria-label="${ariaLabel}"
                 onmouseenter="Utils.showTooltip('${tooltipSafe}', event.clientX, event.clientY)"
                 onmouseleave="Utils.hideTooltip()">
                <span class="enemy-intent-core">
                    <span class="enemy-intent-icon">${icon}</span>
                    ${hasLabel ? `<span class="enemy-intent-label">${label}</span>` : ''}
                </span>
                ${value ? `<span class="intent-value">${value}</span>` : ''}
                ${input.isGuardBreaker ? '<span class="intent-tag breaker">破盾</span>' : ''}
            </div>
        `;
    };

    api.buildEnemyMetaStripMarkup = function buildEnemyMetaStripMarkup(input = {}) {
        const escapeHtml = api.escapeHtml;
        const stripClass = escapeHtml(input.stripClass || 'enemy-meta-strip');
        const items = Array.isArray(input.items)
            ? input.items.filter((item) => item && String(item.text || '').trim())
            : [];

        if (items.length === 0) return '';

        return `
            <div class="${stripClass}">
                ${items.map((item) => `
                    <span class="${escapeHtml(item.className || 'enemy-meta-chip')}"
                          ${item.title ? `title="${escapeHtml(item.title)}"` : ''}>
                        ${escapeHtml(item.text)}
                    </span>
                `).join('')}
            </div>
        `;
    };

    api.buildBossActPanelMarkup = function buildBossActPanelMarkup(input = {}) {
        const escapeHtml = api.escapeHtml;
        const bossName = escapeHtml(input.bossName || 'Boss');
        const hpPercent = Math.max(0, Math.min(100, Number(input.hpPercent) || 0));
        const currentActName = escapeHtml(input.currentActName || '当前幕');
        const acts = Array.isArray(input.acts) ? input.acts : [];
        const currentIndex = Math.max(0, Math.floor(Number(input.currentIndex) || 0));
        const counterChips = Array.isArray(input.counterChips) ? input.counterChips : [];
        const lines = Array.isArray(input.lines) ? input.lines : [];

        return `
            <div class="boss-act-header">
                <div>
                    <div class="boss-act-title">${bossName} · 三幕式</div>
                    <div class="boss-act-subtitle">当前：${currentActName}</div>
                </div>
                <div class="boss-act-hp">血线 ${hpPercent.toFixed(0)}%</div>
            </div>
            <div class="boss-act-track">
                ${acts.map((item, itemIndex) => `
                    <div class="boss-act-chip ${itemIndex === currentIndex ? 'active' : ''} ${itemIndex < currentIndex ? 'cleared' : ''}">
                        <span class="boss-act-chip-index">${itemIndex + 1}</span>
                        <span class="boss-act-chip-label">${escapeHtml(item.name || `第 ${itemIndex + 1} 幕`)}</span>
                    </div>
                `).join('')}
            </div>
            ${counterChips.length > 0 ? `
                <div class="boss-act-counter-chips">
                    ${counterChips.map((chip) => `
                        <span class="boss-act-counter-chip chip-${escapeHtml(chip.id || 'hint')}"
                              title="${escapeHtml(chip.tip || '')}">${escapeHtml(chip.label || '')}</span>
                    `).join('')}
                </div>
            ` : ''}
            <div class="boss-act-body">
                ${lines.map((line) => `
                    <div class="boss-act-line ${escapeHtml(line.id || 'note')}">
                        <span class="label">${escapeHtml(line.label || '')}</span>
                        <span class="value">${escapeHtml(line.value || '')}</span>
                    </div>
                `).join('')}
            </div>
        `;
    };

    api.buildBattleSystemsStripMarkup = function buildBattleSystemsStripMarkup(input = {}) {
        const escapeHtml = api.escapeHtml;
        const items = Array.isArray(input.items)
            ? input.items.filter((item) => item && String(item.label || '').trim())
            : [];

        if (items.length === 0) return '';

        return `
            <section class="battle-system-strip" aria-label="战斗系统状态带">
                ${items.map((item) => `
                    <article class="battle-system-chip tone-${escapeHtml(item.tone || item.id || 'state')}"
                             data-system-id="${escapeHtml(item.id || '')}"
                             ${item.detail ? `title="${escapeHtml(item.detail)}"` : ''}>
                        <div class="battle-system-chip-head">
                            <span class="battle-system-chip-label">
                                <span class="battle-system-chip-icon">${escapeHtml(item.icon || '✦')}</span>
                                <span>${escapeHtml(item.label || '')}</span>
                            </span>
                        </div>
                        <div class="battle-system-chip-value">${escapeHtml(item.value || '')}</div>
                        ${item.meta ? `<div class="battle-system-chip-meta">${escapeHtml(item.meta)}</div>` : ''}
                    </article>
                `).join('')}
            </section>
        `;
    };

    api.buildBattleSystemsDetailMarkup = function buildBattleSystemsDetailMarkup(input = {}) {
        const escapeHtml = api.escapeHtml;
        const items = Array.isArray(input.items)
            ? input.items.filter((item) => item && String(item.label || '').trim())
            : [];

        if (items.length === 0) return '';

        return `
            <div class="battle-advisor-block battle-system-block">
                <div class="battle-advisor-section-head">
                    <span class="battle-advisor-section-title">中层系统状态</span>
                    <span class="battle-advisor-section-note">把命格、誓约、灵契、章节、法则与法宝放进同一层观察。</span>
                </div>
                <div class="battle-system-grid">
                    ${items.map((item) => `
                        <article class="battle-system-card tone-${escapeHtml(item.tone || item.id || 'state')}"
                                 data-system-id="${escapeHtml(item.id || '')}">
                            <div class="battle-system-card-head">
                                <span class="battle-system-card-label">
                                    <span class="battle-system-card-icon">${escapeHtml(item.icon || '✦')}</span>
                                    <span>${escapeHtml(item.label || '')}</span>
                                </span>
                                ${item.meta ? `<span class="battle-system-card-meta">${escapeHtml(item.meta)}</span>` : ''}
                            </div>
                            <div class="battle-system-card-value">${escapeHtml(item.value || '')}</div>
                            ${item.detail ? `<div class="battle-system-card-detail">${escapeHtml(item.detail)}</div>` : ''}
                        </article>
                    `).join('')}
                </div>
            </div>
        `;
    };

    api.buildBattleCommandPanelMarkup = function buildBattleCommandPanelMarkup(input = {}) {
        const escapeHtml = api.escapeHtml;
        const points = Math.max(0, Math.floor(Number(input.points) || 0));
        const maxPoints = Math.max(1, Math.floor(Number(input.maxPoints) || 12));
        const progress = Math.max(0, Math.min(100, Math.round(Number(input.progress) || 0)));
        const commands = Array.isArray(input.commands) ? input.commands : [];
        const systems = input.systems && typeof input.systems === 'object' ? input.systems : {};
        const advisor = input.advisor && typeof input.advisor === 'object' ? input.advisor : {};
        const advisorExpanded = !!input.advisorExpanded;
        const spirit = advisor.spirit && typeof advisor.spirit === 'object' ? advisor.spirit : null;
        const systemStripMarkup = api.buildBattleSystemsStripMarkup({
            items: Array.isArray(systems.stripItems) ? systems.stripItems : []
        });
        const systemDetailMarkup = api.buildBattleSystemsDetailMarkup({
            items: Array.isArray(systems.stripItems) ? systems.stripItems : []
        });

        const commandButtons = commands.map((command) => `
            <button class="${escapeHtml(command.classes || 'battle-command-btn')}" ${command.disabled ? 'disabled' : ''}
                    onclick="window.game && game.battle && game.battle.activateBattleCommand('${escapeHtml(command.id)}')"
                    title="${escapeHtml(command.desc)}">
                <span class="battle-command-head">
                    <span class="battle-command-icon">${escapeHtml(command.icon)}</span>
                    <span class="battle-command-name">${escapeHtml(command.name)}</span>
                </span>
                <span class="battle-command-meta">消耗 ${Math.max(0, Math.floor(Number(command.cost) || 0))} ｜ ${escapeHtml(command.statusText)}</span>
            </button>
        `).join('');

        const threatChips = Array.isArray(advisor.threatChips)
            ? advisor.threatChips.map((chip) => `
                <span class="battle-advisor-threat-chip chip-${escapeHtml(chip.id)}"
                      title="${escapeHtml(chip.tip)}">${escapeHtml(chip.label)}</span>
            `).join('')
            : '';

        const matrixControls = Array.isArray(advisor.matrixControls)
            ? advisor.matrixControls.map((mode) => `
                <button type="button"
                        class="battle-advisor-matrix-btn ${mode.active ? 'active' : ''}"
                        data-mode="${escapeHtml(mode.id)}"
                        onclick="window.game && game.battle && game.battle.setResonanceMatrixSignalMode('${escapeHtml(mode.id)}')">
                    ${escapeHtml(mode.label)}
                </button>
            `).join('')
            : '';

        const cardPlanSteps = Array.isArray(advisor.cardPlanSteps)
            ? advisor.cardPlanSteps.map((step, idx) => `
                <button type="button"
                        class="battle-advisor-cardstep-btn"
                        data-card-index="${Math.max(0, Math.floor(Number(step.index) || 0))}"
                        onclick="window.game && game.battle && game.battle.previewAdvisorCard(${Math.max(0, Math.floor(Number(step.index) || 0))})"
                        title="${escapeHtml(step.reason || '')}">
                    ${idx === 0 ? '①' : '②'} ${escapeHtml(step.name || `手牌${idx + 1}`)}
                </button>
            `).join('')
            : '';

        const tempoRail = advisor.tempoRail && Array.isArray(advisor.tempoRail.segments)
            ? advisor.tempoRail.segments.map((segment) => `
                <div class="battle-advisor-tempo-segment ${segment.active ? 'active' : ''} tone-${escapeHtml(segment.id)}"
                     title="${escapeHtml(segment.tip || '')}">
                    <div class="battle-advisor-tempo-row">
                        <span class="battle-advisor-tempo-label">${escapeHtml(segment.label)}</span>
                        <span class="battle-advisor-tempo-score">${Math.max(0, Math.floor(Number(segment.score) || 0))}%</span>
                    </div>
                    <div class="battle-advisor-tempo-track">
                        <span class="battle-advisor-tempo-fill" style="width:${Math.max(0, Math.min(100, Math.floor(Number(segment.score) || 0)))}%"></span>
                    </div>
                </div>
            `).join('')
            : '';

        const statusIslands = Array.isArray(advisor.statusIslands)
            ? advisor.statusIslands.map((item) => `
                <span class="battle-advisor-status-chip tone-${escapeHtml(item.tone || item.id || 'state')}"
                      title="${escapeHtml(item.label)}">
                    <span class="battle-advisor-status-label">${escapeHtml(item.label)}</span>
                    <span class="battle-advisor-status-value">${escapeHtml(item.value)}</span>
                </span>
            `).join('')
            : '';

        const spiritHeaderChip = spirit ? `
            <span class="battle-command-spirit-chip ${spirit.ready ? 'ready' : ''}"
                  title="${escapeHtml(`${spirit.name || '灵契'} ${spirit.chargeText || ''}`)}">
                <span class="battle-command-spirit-icon">${escapeHtml(spirit.icon || '✦')}</span>
                <span class="battle-command-spirit-name">${escapeHtml(spirit.name || '灵契')}</span>
                <span class="battle-command-spirit-charge">${escapeHtml(spirit.chargeText || '')}</span>
            </span>
        ` : '';

        const spiritPanel = spirit ? `
            <div class="battle-advisor-block battle-advisor-spirit-block">
                <div class="battle-advisor-section-head">
                    <span class="battle-advisor-section-title">灵契护道</span>
                    <span class="battle-advisor-section-note">${escapeHtml(spirit.chargeText || '')}</span>
                </div>
                <div class="battle-advisor-spirit-card ${spirit.ready ? 'ready' : ''}">
                    <div class="battle-advisor-spirit-head">
                        <span class="battle-advisor-spirit-icon">${escapeHtml(spirit.icon || '✦')}</span>
                        <div class="battle-advisor-spirit-copy">
                            <div class="battle-advisor-spirit-name-line">${escapeHtml(spirit.name || '灵契')}</div>
                            <div class="battle-advisor-spirit-summary">${escapeHtml(spirit.summary || spirit.title || '')}</div>
                        </div>
                    </div>
                    <div class="battle-advisor-spirit-passive"><strong>${escapeHtml(spirit.passiveLabel || '被动')}</strong>：${escapeHtml(spirit.passiveDesc || '')}</div>
                    <div class="battle-advisor-spirit-active"><strong>${escapeHtml(spirit.activeLabel || '主动')}</strong>：${escapeHtml(spirit.activeDesc || '')}</div>
                    <div class="battle-advisor-spirit-track">
                        <span class="battle-advisor-spirit-fill" style="width:${Math.max(0, Math.min(100, Math.floor(Number(spirit.progress) || 0)))}%"></span>
                    </div>
                    <button type="button"
                            class="battle-advisor-spirit-btn ${spirit.ready ? 'ready' : ''}"
                            ${spirit.ready ? '' : 'disabled'}
                            onclick="window.game && game.battle && game.battle.activateSpiritCompanion()">
                        ${spirit.ready ? `释放 ${escapeHtml(spirit.activeLabel || '灵契主动')}` : `蓄能中 ${escapeHtml(spirit.chargeText || '')}`}
                    </button>
                </div>
            </div>
        ` : '';

        const executionChainItems = Array.isArray(advisor.executionChain?.items)
            ? advisor.executionChain.items.map((item) => `
                <span class="battle-advisor-chain-step">${escapeHtml(item)}</span>
            `).join('<span class="battle-advisor-chain-arrow">→</span>')
            : '';

        const executionChainTags = Array.isArray(advisor.executionChain?.tags)
            ? advisor.executionChain.tags.map((tag) => `
                <span class="battle-advisor-chain-tag tone-${escapeHtml(tag.id || 'tag')}"
                      title="${escapeHtml(tag.tip || '')}">${escapeHtml(tag.label || '')}</span>
            `).join('')
            : '';

        const executionChainIndex = advisor.executionChain && advisor.executionChain.index != null && Number.isFinite(Number(advisor.executionChain.index))
            ? Math.floor(Number(advisor.executionChain.index))
            : -1;

        const advisorBody = `
            ${tempoRail ? `
                <div class="battle-advisor-block battle-advisor-tempo-block">
                    <div class="battle-advisor-section-head">
                        <span class="battle-advisor-section-title">回合节奏条</span>
                        <span class="battle-advisor-section-note">${escapeHtml(advisor.tempoRail?.summary || '')}</span>
                    </div>
                    <div class="battle-advisor-tempo-grid">${tempoRail}</div>
                </div>
            ` : ''}
            ${statusIslands ? `
                <div class="battle-advisor-block battle-advisor-status-block">
                    <div class="battle-advisor-section-head">
                        <span class="battle-advisor-section-title">关键状态岛</span>
                        <span class="battle-advisor-section-note">把资源、共鸣与 Boss 节奏聚合查看。</span>
                    </div>
                    <div class="battle-advisor-status-strip">${statusIslands}</div>
                </div>
            ` : ''}
            ${systemDetailMarkup}
            ${spiritPanel}
            <div class="battle-advisor-threat-list">${threatChips}</div>
            <p class="battle-advisor-line battle-advisor-recommend">建议回路：${escapeHtml(advisor.recommendation?.label || '')} · ${escapeHtml(advisor.recommendation?.desc || '')}</p>
            <p class="battle-advisor-line battle-advisor-readiness">${escapeHtml(advisor.readiness || '')}</p>
            ${advisor.formationHint ? `<p class="battle-advisor-line battle-advisor-formation">${escapeHtml(advisor.formationHint)}</p>` : ''}
            ${advisor.cardPlanHint ? `<p class="battle-advisor-line battle-advisor-cardplan">${escapeHtml(advisor.cardPlanHint)}</p>` : ''}
            ${cardPlanSteps ? `<div class="battle-advisor-cardplan-steps">${cardPlanSteps}</div>` : ''}
            ${executionChainItems ? `
                <div class="battle-advisor-block battle-advisor-chain"
                     data-card-index="${executionChainIndex}">
                    <div class="battle-advisor-section-head">
                        <span class="battle-advisor-section-title">${escapeHtml(advisor.executionChain?.kicker || '执行链')}</span>
                        <span class="battle-advisor-section-note">${escapeHtml(advisor.executionChain?.summary || '')}</span>
                    </div>
                    <div class="battle-advisor-chain-title">${escapeHtml(advisor.executionChain?.title || '')}</div>
                    ${executionChainTags ? `<div class="battle-advisor-chain-tags">${executionChainTags}</div>` : ''}
                    <div class="battle-advisor-chain-steps">${executionChainItems}</div>
                </div>
            ` : ''}
            ${advisor.matrixHint ? `<p class="battle-advisor-line battle-advisor-matrix">${escapeHtml(advisor.matrixHint)}</p>` : ''}
            ${advisor.pendingModeLabel ? `<p class="battle-advisor-line battle-advisor-pending-mode">模式预设：${escapeHtml(advisor.pendingModeLabel)}</p>` : ''}
            ${matrixControls ? `<div class="battle-advisor-matrix-controls">${matrixControls}</div>` : ''}
            ${matrixControls ? '<p class="battle-advisor-line battle-advisor-hotkey">快捷预设：H开关助手 · 1自适应 2守势 3破阵 4净域 5歼灭</p>' : '<p class="battle-advisor-line battle-advisor-hotkey">快捷预设：H 开关助手</p>'}
            ${advisor.lastModeLabel ? `<p class="battle-advisor-line battle-advisor-last">上次命环模式：${escapeHtml(advisor.lastModeLabel)}</p>` : ''}
        `;

        return `
            <div class="battle-command-header">
                <span class="battle-command-title-group">
                    <span class="battle-command-title">战场指令</span>
                    ${spiritHeaderChip}
                </span>
                <span class="battle-command-right">
                    <span class="battle-command-points">${points}/${maxPoints}</span>
                    <button type="button" class="battle-advisor-toggle"
                            onclick="window.game && game.battle && game.battle.toggleTacticalAdvisor()">
                        ${advisorExpanded ? '收起助手' : '展开助手'}
                    </button>
                </span>
            </div>
            <div class="battle-command-track">
                <div class="battle-command-fill" style="width:${progress}%"></div>
            </div>
            <div class="battle-command-list">${commandButtons}</div>
            ${systemStripMarkup}
            <section id="battle-tactical-advisor"
                     class="battle-tactical-advisor ${advisorExpanded ? '' : 'collapsed'}">
                <div class="battle-advisor-header">
                    <button type="button"
                            class="battle-advisor-drag-handle"
                            aria-label="拖动战术助手"
                            title="拖动战术助手">⠿</button>
                    <span class="battle-advisor-title">战术助手</span>
                </div>
                <div class="battle-advisor-body" ${advisorExpanded ? '' : 'hidden'}>
                    ${advisorBody}
                </div>
            </section>
        `;
    };

    if (typeof module !== 'undefined' && module.exports) {
        module.exports = api;
    }

    if (globalScope) {
        globalScope.DefierBattleHud = api;
    }
})(typeof globalThis !== 'undefined' ? globalThis : this);
