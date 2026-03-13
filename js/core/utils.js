/**
 * The Defier - 工具函数
 */

const Utils = {
    // 生成随机数（包含min和max）
    random(min, max) {
        return Math.floor(Math.random() * (max - min + 1)) + min;
    },

    // 五行标准化
    getCanonicalElement(element) {
        if (!element) return null;
        const map = {
            'thunder': 'metal',
            'gold': 'metal',
            'metal': 'metal',

            'wood': 'wood',
            'poison': 'wood',
            'wind': 'wood', // 风一般归木

            'water': 'water',
            'ice': 'water',

            'fire': 'fire',

            'earth': 'earth'
        };
        return map[element.toLowerCase()] || 'none';
    },

    // 获取五行图标
    getElementIcon(element) {
        const canonical = this.getCanonicalElement(element);
        const icons = {
            'metal': '⚔️',
            'wood': '🌿',
            'water': '💧',
            'fire': '🔥',
            'earth': '🪨',
            'none': ''
        };
        return icons[canonical] || '';
    },

    // 获取五行颜色
    getElementColor(element) {
        const canonical = this.getCanonicalElement(element);
        const colors = {
            'metal': '#FFD700', // Gold
            'wood': '#4CAF50',  // Green
            'water': '#2196F3', // Blue
            'fire': '#FF5722',  // Red / Orange
            'earth': '#795548', // Brown
            'none': '#ffffff'
        };
        return colors[canonical] || '#ffffff';
    },

    // 洗牌
    shuffle(array) {
        const shuffled = [...array];
        for (let i = shuffled.length - 1; i > 0; i--) {
            const j = Math.floor(Math.random() * (i + 1));
            [shuffled[i], shuffled[j]] = [shuffled[j], shuffled[i]];
        }
        return shuffled;
    },

    // 延迟
    sleep(ms) {
        return new Promise(resolve => setTimeout(resolve, ms));
    },

    // 显示浮动数字
    showFloatingNumber(element, value, type = 'damage') {
        const floater = document.createElement('div');
        floater.className = `damage-number ${type === 'heal' ? 'heal-number' : type === 'block' ? 'block-number' : ''}`;
        floater.textContent = type === 'damage' ? `-${value}` : `+${value}`;

        const rect = element.getBoundingClientRect();
        // 居中并稍微随机偏移
        const offsetX = (Math.random() - 0.5) * 20;
        floater.style.left = `${rect.left + rect.width / 2 + offsetX}px`;
        floater.style.top = `${rect.top}px`;

        document.body.appendChild(floater);

        // 简单的粒子效果 (Particles)
        if (type === 'damage' && typeof particles !== 'undefined') {
            // 使用 CSS 粒子或简单的 DOM 粒子
            for (let i = 0; i < 3; i++) {
                this.spawnParticle(rect.left + rect.width / 2, rect.top + 20, 'var(--accent-red)');
            }
        }

        setTimeout(() => floater.remove(), 1000);
    },

    // 显示浮动文本
    createFloatingText(elementOrIndex, text, color = '#fff') {
        let element = elementOrIndex;
        // 如果传入的是索引，尝试获取元素
        if (typeof elementOrIndex === 'number') {
            element = document.querySelector(`.enemy[data-index="${elementOrIndex}"]`);
        }

        if (!element) return;

        const floater = document.createElement('div');
        floater.className = 'damage-number';
        floater.style.color = color;
        floater.textContent = text;
        floater.style.fontSize = '24px';
        floater.style.fontWeight = 'bold';
        floater.style.textShadow = '0 0 5px #000';
        floater.style.zIndex = '100';

        const rect = element.getBoundingClientRect();
        // 居中并上方显示
        floater.style.left = `${rect.left + rect.width / 2}px`;
        floater.style.top = `${rect.top - 30}px`;

        document.body.appendChild(floater);

        const animation = floater.animate([
            { transform: 'translate(-50%, 0) scale(0.5)', opacity: 0 },
            { transform: 'translate(-50%, -20px) scale(1.2)', opacity: 1, offset: 0.2 },
            { transform: 'translate(-50%, -50px) scale(1)', opacity: 0 }
        ], {
            duration: 1000,
            easing: 'ease-out'
        });

        animation.onfinish = () => floater.remove();
    },

    // 生成简单粒子
    spawnParticle(x, y, color) {
        const p = document.createElement('div');
        p.className = 'vfx-particle';
        p.style.backgroundColor = color;
        p.style.left = x + 'px';
        p.style.top = y + 'px';

        // 随机方向
        const angle = Math.random() * Math.PI * 2;
        const speed = Math.random() * 30 + 20;
        const tx = Math.cos(angle) * speed;
        const ty = Math.sin(angle) * speed;

        p.style.setProperty('--tx', `${tx}px`);
        p.style.setProperty('--ty', `${ty}px`);

        document.body.appendChild(p);
        setTimeout(() => p.remove(), 600);
    },

    // 添加震动效果 (支持强度)
    addShakeEffect(element, intensity = 'medium') {
        // 移除旧震动
        element.classList.remove('shake', 'shake-light', 'shake-heavy');
        void element.offsetWidth; // 触发重绘

        let className = 'shake';
        if (intensity === 'light') className = 'shake-light';
        if (intensity === 'heavy') className = 'shake-heavy';

        element.classList.add(className);
        setTimeout(() => element.classList.remove(className), 500);
    },

    // 添加闪光效果
    addFlashEffect(element, color = '') {
        element.classList.remove('damage-flash');
        void element.offsetWidth;

        if (color) element.style.setProperty('--flash-color', color);

        element.classList.add('damage-flash');
        setTimeout(() => {
            element.classList.remove('damage-flash');
            if (color) element.style.removeProperty('--flash-color');
        }, 200);
    },

    // ---------------- UI/UX 辅助 ----------------

    // 显示工具提示
    showTooltip(text, x, y) {
        let tooltip = document.getElementById('game-tooltip');
        if (!tooltip) {
            tooltip = document.createElement('div');
            tooltip.id = 'game-tooltip';
            tooltip.className = 'game-tooltip';
            document.body.appendChild(tooltip);
        }
        tooltip.innerHTML = text;
        tooltip.style.display = 'block';
        tooltip.style.left = x + 'px';
        tooltip.style.top = y + 'px';
    },

    hideTooltip() {
        const tooltip = document.getElementById('game-tooltip');
        if (tooltip) tooltip.style.display = 'none';
    },

    // -------------------------------------------

    // 显示战斗日志
    showBattleLog(message) {
        const log = document.getElementById('battle-log');
        log.textContent = message;
        log.classList.add('show');

        // 重置动画
        log.style.animation = 'none';
        log.offsetHeight; /* trigger reflow */
        log.style.animation = null;

        setTimeout(() => log.classList.remove('show'), 2000);
    },

    // 格式化数字
    formatNumber(num) {
        if (num >= 1000000) return (num / 1000000).toFixed(1) + 'M';
        if (num >= 1000) return (num / 1000).toFixed(1) + 'K';
        return num.toString();
    },

    // 深拷贝
    deepClone(obj) {
        return JSON.parse(JSON.stringify(obj));
    },

    // 获取类型颜色
    getTypeColor(type) {
        const colors = {
            attack: 'var(--card-attack)',
            defense: 'var(--card-defense)',
            law: 'var(--card-law)',
            chance: 'var(--card-chance)',
            energy: 'var(--card-energy)'
        };
        return colors[type] || 'var(--text-primary)';
    },

    // 创建卡牌元素
    createCardElement(card, index = 0, isReward = false, options = {}) {
        const div = document.createElement('div');
        div.className = `card ${card.type} rarity-${card.rarity || 'common'}`;
        const escapeHtml = (value) => String(value || '')
            .replace(/&/g, '&amp;')
            .replace(/</g, '&lt;')
            .replace(/>/g, '&gt;')
            .replace(/"/g, '&quot;');

        // Unplayable visual state
        if (card.unplayable) {
            div.classList.add('unplayable');
            div.style.filter = 'grayscale(100%) brightness(70%)';
            div.style.cursor = 'not-allowed';
        }

        if (!isReward) {
            div.dataset.index = index;
            // 添加长按/右键查看详情支持
            div.oncontextmenu = (e) => {
                e.preventDefault();
                Utils.showCardDetail(card);
            };

            // 移动端长按模拟
            let pressTimer;
            div.addEventListener('touchstart', (e) => {
                pressTimer = setTimeout(() => {
                    Utils.showCardDetail(card);
                }, 500); // 500ms长按
            });
            div.addEventListener('touchend', () => clearTimeout(pressTimer));
            div.addEventListener('touchmove', () => clearTimeout(pressTimer));
        }

        // 检查是否消耗奶糖
        // Fix: Rely strictly on consumeCandy property to match game logic
        const isCandyCard = card.consumeCandy;

        let costHtml = '';
        const displayCost = (options && typeof options.costOverride === 'number') ? options.costOverride : card.cost;
        const battleTags = Array.isArray(options?.battleTags)
            ? options.battleTags
                .filter((tag) => tag && typeof tag === 'object' && tag.label)
                .map((tag) => ({
                    id: String(tag.id || 'hint'),
                    label: String(tag.label || ''),
                    tip: String(tag.tip || '')
                }))
                .slice(0, 2)
            : [];
        const battleTagHtml = !isReward && battleTags.length > 0
            ? `<div class="card-live-tags">${battleTags.map((tag) => `
                <span class="card-live-tag tag-${escapeHtml(tag.id)}" title="${escapeHtml(tag.tip)}">${escapeHtml(tag.label)}</span>
            `).join('')}</div>`
            : '';
        if (!isReward) {
            if (card.unplayable) {
                costHtml = `<div class="card-cost cost-unplayable" style="background:#555">X</div>`;
            } else if (isCandyCard) {
                // 抽牌卡消耗奶糖
                costHtml = `<div class="card-cost cost-candy">🍬</div>`;
            } else {
                costHtml = `<div class="card-cost">${displayCost}</div>`;
            }
        }
        const typeIcon = this.getCardTypeIcon(card.type);

        div.innerHTML = `
            ${costHtml}
            ${battleTagHtml}
            <div class="card-header">
                <div class="card-name">${card.name}</div>
            </div>
            <div class="card-image">${card.icon || '🎴'}</div>
            <div class="card-desc">${card.description}</div>
            <div class="card-type">${typeIcon} ${this.getCardTypeName(card.type)}</div>
            <!-- 3D光效层 -->
            <div class="card__shine"></div>
            <div class="card__glare"></div>
        `;

        // 初始化3D悬浮效果 (延迟到下一帧确保DOM就绪)
        if (typeof CardEffects !== 'undefined') {
            requestAnimationFrame(() => CardEffects.init(div));
        }

        return div;
    },

    // 获取卡牌类型图标
    getCardTypeIcon(type) {
        const icons = {
            attack: '⚔️',
            defense: '🛡️',
            law: '📜',
            chance: '🎲',
            energy: '⚡'
        };
        return icons[type] || '';
    },

    // 显示卡牌详情弹窗 (Refactored for Void & Ink Theme)
    showCardDetail(card, meta = {}) {
        let modal = document.getElementById('card-detail-modal');
        if (!modal) {
            modal = document.createElement('div');
            modal.id = 'card-detail-modal';
            modal.className = 'modal-overlay card-detail-overlay';
            modal.onclick = (e) => {
                if (e.target === modal) modal.style.display = 'none';
            };
            document.body.appendChild(modal);
        }

        let effectsHtml = '';
        if (card.effects) {
            effectsHtml = '<div class="cd-section"><div class="detail-panel-heading compact"><span class="detail-panel-kicker">效果拆解</span><h3>详细效果</h3></div><ul class="cd-effects-list">';
            card.effects.forEach((effect) => {
                effectsHtml += `<li>${this.getEffectDescription(effect)}</li>`;
            });
            effectsHtml += '</ul></div>';
        }

        const loreHtml = card.lore
            ? `<div class="detail-dual-panel cd-lore-card"><span class="detail-mini-label">卡牌逸闻</span><p class="cd-lore">"${card.lore}"</p></div>`
            : '';

        const rarity = card.rarity || 'common';
        const rarityClass = `rarity-${rarity}`;
        const summaryChips = [
            `<span class="detail-status-chip type-${card.type}">${this.getCardTypeName(card.type)}</span>`,
            `<span class="detail-status-chip rarity-chip ${rarityClass}">${this.getCardRarityName(rarity)}</span>`,
            card.lawType ? `<span class="detail-status-chip law">${this.getLawName(card.lawType)}</span>` : ''
        ].filter(Boolean).join('');
        const sourceLabel = meta.sectionLabel || '卡牌详解';
        const priceText = meta.priceText ? `<div class="cd-summary-row"><span>售价</span><strong>${meta.priceText}</strong></div>` : '';
        const availabilityText = meta.availabilityText ? `<div class="cd-summary-row"><span>状态</span><strong>${meta.availabilityText}</strong></div>` : '';
        const sourceText = meta.sourceLabel ? `<div class="cd-summary-row"><span>货架</span><strong>${meta.sourceLabel}</strong></div>` : '';
        const costText = typeof card.cost === 'number' ? `${card.cost} 灵力` : '变动费用';
        const effectCount = Array.isArray(card.effects) ? card.effects.length : 0;
        const usageHint = meta.usageHint || (effectCount > 0 ? `包含 ${effectCount} 条显式效果，建议先看右侧摘要再读主区说明。` : '该牌以基础描述为主，适合直接配合主区卡面阅读。');
        const extraSummaryRows = Array.isArray(meta.extraSummaryRows)
            ? meta.extraSummaryRows.map((row) => `<div class="cd-summary-row"><span>${row.label}</span><strong>${row.value}</strong></div>`).join('')
            : '';
        const closeLabel = meta.closeLabel || '关闭界面';

        modal.innerHTML = `
            <div class="card-detail-container detail-dual-layout">
                <div class="detail-dual-main card-detail-main">
                    <section class="detail-dual-panel cd-stage-panel">
                        <div class="detail-panel-heading">
                            <span class="detail-panel-kicker">${sourceLabel}</span>
                            <h3>卡面主舞台</h3>
                        </div>
                        <div class="cd-preview-pane">
                            <div class="card-preview-wrapper">
                                 <div class="card ${card.type} ${rarityClass} big-preview">
                                     <div class="card-cost">${card.cost}</div>
                                     <div class="card-header"><div class="card-name">${card.name}</div></div>
                                     <div class="card-image">${card.icon || '🎴'}</div>
                                     <div class="card-desc">${card.description}</div>
                                     <div class="card-type">${this.getCardTypeIcon(card.type)} ${this.getCardTypeName(card.type)}</div>
                                     <div class="card__shine"></div>
                                 </div>
                            </div>
                        </div>
                    </section>
                    <section class="detail-dual-panel cd-copy-panel">
                        <div class="detail-panel-heading compact">
                            <span class="detail-panel-kicker">文本说明</span>
                            <h3>卡牌摘要</h3>
                        </div>
                        <div class="cd-desc-box">${card.description}</div>
                        ${effectsHtml}
                        ${loreHtml}
                    </section>
                </div>
                <aside class="detail-dual-side card-detail-side">
                    <section class="detail-dual-panel cd-info-pane">
                        <div class="cd-header detail-header ${rarityClass}">
                            <span class="detail-kicker">${sourceLabel}</span>
                            <h2>${card.name}</h2>
                            <div class="detail-sub">${this.getCardTypeName(card.type)} ｜ ${this.getCardRarityName(rarity)}</div>
                        </div>
                        <div class="detail-status-strip cd-badges">${summaryChips}</div>
                        <div class="cd-summary-card">
                            <div class="cd-summary-row"><span>费用</span><strong>${costText}</strong></div>
                            <div class="cd-summary-row"><span>效果数</span><strong>${effectCount}</strong></div>
                            ${priceText}
                            ${availabilityText}
                            ${sourceText}
                            ${extraSummaryRows}
                        </div>
                    </section>
                    <section class="detail-dual-panel detail-tip-panel">
                        <div class="detail-panel-heading compact">
                            <span class="detail-panel-kicker">使用建议</span>
                            <h3>阅读顺序</h3>
                        </div>
                        <p class="codex-side-note">${usageHint}</p>
                        <ul class="codex-side-list compact">
                            <li>主区看卡面定位，右侧看费用、状态与商店信息。</li>
                            <li>若来自商店，可先比较售价与当前资源，再决定是否购买。</li>
                        </ul>
                    </section>
                    <div class="detail-modal-actions">
                        <button class="cd-close-btn" onclick="document.getElementById('card-detail-modal').style.display='none'">${closeLabel}</button>
                    </div>
                </aside>
            </div>
        `;

        modal.style.display = 'flex';

        const container = modal.querySelector('.card-detail-container');
        if (container) {
            container.style.animation = 'modalPopIn 0.3s cubic-bezier(0.175, 0.885, 0.32, 1.275)';
        }
    },
    getEffectDescription(effect) {
        // 简单的效果描述生成器，用于详情页
        switch (effect.type) {
            case 'damage': return `造成 ${effect.value} 点伤害`;
            case 'block': return `获得 ${effect.value} 点护盾`;
            case 'heal': return `恢复 ${effect.value} 点生命`;
            case 'draw': return `抽取 ${effect.value} 张牌`;
            case 'energy': return `回复 ${effect.value} 点灵力`;
            case 'conditionalDraw': return `条件抽牌: ${effect.condition === 'lowHp' ? '生命<20%' : '未知条件'}`;
            default: return `类型: ${effect.type}, 数值: ${effect.value || '-'}`;
        }
    },

    getLawName(type) {
        const map = {
            'fire': '火焰真意', 'ice': '冰封真意', 'thunder': '雷法残章', 'wind': '疾风之势',
            'earth': '大地护盾', 'metal': '金刚法相', 'wood': '生命汲取', 'water': '柔水之道',
            'light': '光明圣歌', 'dark': '暗影侵蚀', 'space': '空间裂隙', 'time': '时间静止',
            'chaos': '混沌法则', 'void': '虚空拥抱', 'life': '生命本源', 'death': '死亡凋零'
        };
        return map[type] || type;
    },

    getCardRarityName(rarity) {
        const map = { 'basic': '基础', 'common': '普通', 'uncommon': '优秀', 'rare': '稀有', 'epic': '史诗', 'legendary': '传说', 'mythic': '神话' };
        return map[rarity] || rarity;
    },

    // 获取卡牌类型名称
    getCardTypeName(type) {
        const names = {
            attack: '攻击',
            defense: '防御',
            law: '法则',
            chance: '机缘',
            energy: '灵力'
        };
        return names[type] || '未知';
    },

    // 渲染 Buff 列表
    renderBuffs(entity) {
        let html = '';
        if (entity.buffs) {
            for (const [buff, value] of Object.entries(entity.buffs)) {
                if (value > 0) {
                    const icon = this.getBuffIcon(buff);
                    const name = this.getBuffName(buff);
                    if (icon) {
                        html += `<div class="buff-icon" title="${name}: ${value}层">${icon}<span class="buff-val">${value}</span></div>`;
                    }
                }
            }
        }
        if (entity.stunned) {
            html += `<div class="buff-icon" title="眩晕: 无法行动">💫</div>`;
        }
        return html;
    },

    // 获取 Buff 名称
    getBuffName(type) {
        const names = {
            weak: '虚弱', // 造成伤害降低
            vulnerable: '易伤', // 受到伤害增加
            strength: '力量', // 造成伤害增加
            poison: '中毒', // 回合开始受伤害
            bleed: '流血', // 回合开始受伤害并衰减
            mark: '破绽', // 下次受击强化
            burn: '灼烧', // 受到伤害时减少层数
            paralysis: '麻痹', // 有几率跳过回合
            regeneration: '再生', // 回复生命
            reflect: '反伤', // 反弹伤害
            dodge: '闪避', // 免疫伤害
            startBlock: '坚韧', // 初始护盾
            extraTurn: '迅捷', // 额外回合
            thorns: '荆棘', // 反伤
            chaosAura: '混乱光环',
            nextTurnBlock: '固守',
            nextAttackBonus: '聚气',
            damageReduction: '减伤',
            stealth: '潜行',
            controlImmune: '控制抵抗',
            artifact: '神力'
        };
        return names[type] || type;
    },

    // 获取 Buff 图标
    getBuffIcon(type) {
        const icons = {
            weak: '🥀', // 虚弱:造成伤害降低
            vulnerable: '💔', // 易伤:受到伤害增加
            strength: '💪', // 力量:造成伤害增加
            poison: '☠️', // 中毒
            bleed: '🩸', // 流血
            mark: '🎯', // 破绽
            burn: '🔥', // 灼烧
            paralysis: '⚡', // 麻痹
            regeneration: '🌿', // 再生
            reflect: '🔮', // 反伤
            dodge: '👻', // 闪避
            startBlock: '🛡️',
            extraTurn: '⏩',
            thorns: '🌵',
            chaosAura: '🌀',
            nextTurnBlock: '🛡️',
            nextAttackBonus: '🎯',
            damageReduction: '🛡️',
            stealth: '👻',
            controlImmune: '🛡️',
            artifact: '🏺' // 神器/宝物效果
        };
        return icons[type] || '';
    },

    // 创建敌人元素
    createEnemyElement(enemy, index = 0) {
        const enemyEl = document.createElement('div');
        enemyEl.className = `enemy ${enemy.isElite ? 'elite' : ''} ${enemy.isBoss ? 'boss' : ''}`;
        enemyEl.dataset.index = index;

        let currentPattern;
        if (enemy.isGhost) {
            currentPattern = enemy.currentIntent || { type: 'unknown', value: '...' };
        } else {
            currentPattern = enemy.patterns ? enemy.patterns[enemy.currentPatternIndex || 0] : { type: 'none' };
        }

        if (!currentPattern) currentPattern = { type: 'none' };

        const intentIcon = currentPattern.intent || '❓';
        const intentValue = currentPattern.value ? (currentPattern.count ? `${currentPattern.value}x${currentPattern.count}` : currentPattern.value) : '';
        const isAttackIntent = currentPattern.type === 'attack' || currentPattern.type === 'multiAttack';
        const playerBlock = Math.max(0, Math.floor(Number(window?.game?.player?.block) || 0));
        const canBossGuardBreak = !!(enemy.isBoss && isAttackIntent && playerBlock >= 18);
        const isGuardBreaker = !!(
            isAttackIntent && (
                (enemy.isElite && enemy.eliteType === 'sunder') ||
                (enemy.buffs && enemy.buffs.guardBreak > 0) ||
                canBossGuardBreak
            )
        );

        const describePattern = (pattern) => {
            if (!pattern || typeof pattern !== 'object') return '未知行动';
            switch (pattern.type) {
                case 'attack': return `攻击 ${pattern.value} 点伤害`;
                case 'multiAttack': return `连击 ${pattern.value} x ${pattern.count} 次`;
                case 'defend': return `获得 ${pattern.value} 点护盾`;
                case 'buff': return `强化自身（${pattern.buffType || '增益'}）`;
                case 'debuff': return `施加减益（${pattern.buffType || '负面状态'}）`;
                case 'heal': return `恢复 ${pattern.value} 点生命`;
                case 'addStatus': return `塞入 ${pattern.count || 1} 张状态牌`;
                case 'summon': return `召唤 ${pattern.count || 1} 个随从`;
                case 'multiAction': return `连续执行 ${(pattern.actions || []).length} 段行动`;
                default: return pattern.intent || '未知行动';
            }
        };

        const resolveEnemyRole = (targetEnemy, activePattern) => {
            const roleLabels = {
                striker: '突袭型',
                guardian: '坚守型',
                hexer: '控场型',
                balanced: '均衡型'
            };
            const role = (targetEnemy && typeof targetEnemy.enemyVariantRole === 'string' && roleLabels[targetEnemy.enemyVariantRole])
                ? targetEnemy.enemyVariantRole
                : (() => {
                    const sourcePatterns = Array.isArray(targetEnemy?.patterns) && targetEnemy.patterns.length > 0
                        ? targetEnemy.patterns
                        : [activePattern];
                    const stat = { attack: 0, defend: 0, debuff: 0 };
                    sourcePatterns.forEach((pattern) => {
                        if (!pattern || typeof pattern !== 'object') return;
                        if (pattern.type === 'attack' || pattern.type === 'multiAttack' || pattern.type === 'executeDamage') {
                            stat.attack += 1;
                        } else if (
                            pattern.type === 'defend' ||
                            pattern.type === 'heal' ||
                            (pattern.type === 'buff' && pattern.buffType === 'block')
                        ) {
                            stat.defend += 1;
                        } else if (
                            pattern.type === 'debuff' ||
                            pattern.type === 'addStatus' ||
                            pattern.type === 'summon' ||
                            pattern.type === 'multiAction'
                        ) {
                            stat.debuff += 1;
                        }
                    });

                    if (stat.debuff >= 2 || (stat.debuff >= 1 && stat.attack <= 1)) return 'hexer';
                    if (stat.defend >= 2 || (stat.defend > stat.attack && stat.defend >= 1)) return 'guardian';
                    if (stat.attack >= 2 && stat.attack >= stat.debuff + stat.defend) return 'striker';
                    return 'balanced';
                })();

            return {
                id: role,
                label: roleLabels[role] || roleLabels.balanced
            };
        };

        const enemyRole = resolveEnemyRole(enemy, currentPattern);
        const resolvePlayerCounterTools = () => {
            const player = window?.game?.player || {};
            const hand = Array.isArray(player?.hand) ? player.hand : [];
            const tools = {
                cleanse: false,
                breakBlock: false,
                burst: false,
                defend: false,
                draw: false
            };

            const markBurstByPattern = (pattern) => {
                if (!pattern || typeof pattern !== 'object') return;
                const value = Math.max(0, Number(pattern.value) || 0);
                if (
                    (pattern.type === 'attack' || pattern.type === 'damage' || pattern.type === 'executeDamage')
                    && value >= 10
                ) {
                    tools.burst = true;
                }
                if (pattern.type === 'multiAttack') {
                    const count = Math.max(1, Math.floor(Number(pattern.count) || 1));
                    if (value * count >= 12) tools.burst = true;
                }
            };

            hand.forEach((card) => {
                if (!card || typeof card !== 'object') return;
                const effects = Array.isArray(card.effects) ? card.effects : [];
                const keywords = Array.isArray(card.keywords) ? card.keywords.map((kw) => String(kw || '')) : [];

                if (keywords.includes('cleanse')) tools.cleanse = true;
                if (keywords.includes('vulnerable') || keywords.includes('chain') || keywords.includes('burst')) {
                    tools.burst = true;
                }
                if (card.type === 'defense' || Number(card.block) >= 8) tools.defend = true;
                if (card.type === 'skill' && Number(card.draw) >= 1) tools.draw = true;
                markBurstByPattern(card);

                effects.forEach((effect) => {
                    if (!effect || typeof effect !== 'object') return;
                    if (effect.type === 'cleanse') tools.cleanse = true;
                    if (effect.type === 'draw') tools.draw = true;
                    if (effect.type === 'buff' && effect.buffType === 'nextTurnBlock') tools.defend = true;
                    if (['removeBlock', 'blockBurst', 'penetrate', 'executeDamage', 'percentDamage'].includes(effect.type)) {
                        tools.breakBlock = true;
                    }
                    markBurstByPattern(effect);
                });
            });

            if (Math.max(0, Math.floor(Number(player?.block) || 0)) >= 12) {
                tools.defend = true;
            }
            return tools;
        };
        const playerCounterTools = resolvePlayerCounterTools();
        const resolveThreatTags = (targetEnemy) => {
            const sourcePatterns = Array.isArray(targetEnemy?.patterns) ? targetEnemy.patterns : [];
            if (sourcePatterns.length === 0) return [];

            const tags = [];
            const pushTag = (id, label, desc = '', severity = 'normal') => {
                if (!id || !label) return;
                if (tags.some((tag) => tag.id === id)) return;
                tags.push({ id, label, desc, severity });
            };

            let debuffActions = 0;
            let summonActions = 0;
            let defendActions = 0;
            let healActions = 0;
            let hasMultiAction = false;
            let burstScore = 0;

            sourcePatterns.forEach((pattern) => {
                if (!pattern || typeof pattern !== 'object') return;

                if (pattern.type === 'debuff' || pattern.type === 'addStatus') debuffActions += 1;
                if (pattern.type === 'summon' || (pattern.type === 'addStatus' && Number(pattern.count) >= 2)) summonActions += 1;
                if (pattern.type === 'defend') defendActions += 1;
                if (pattern.type === 'heal') healActions += 1;
                if (pattern.type === 'multiAction') {
                    hasMultiAction = true;
                    if (Array.isArray(pattern.actions)) {
                        pattern.actions.forEach((action) => {
                            if (!action || typeof action !== 'object') return;
                            if (action.type === 'debuff' || action.type === 'addStatus') debuffActions += 1;
                            if (action.type === 'summon') summonActions += 1;
                            if (action.type === 'defend') defendActions += 1;
                            if (action.type === 'heal') healActions += 1;
                            if (action.type === 'attack') {
                                burstScore = Math.max(burstScore, Math.floor(Number(action.value) || 0));
                            } else if (action.type === 'multiAttack') {
                                burstScore = Math.max(
                                    burstScore,
                                    Math.floor((Number(action.value) || 0) * Math.max(1, Number(action.count) || 1))
                                );
                            }
                        });
                    }
                }

                if (pattern.type === 'attack') {
                    burstScore = Math.max(burstScore, Math.floor(Number(pattern.value) || 0));
                } else if (pattern.type === 'multiAttack') {
                    burstScore = Math.max(
                        burstScore,
                        Math.floor((Number(pattern.value) || 0) * Math.max(1, Number(pattern.count) || 1))
                    );
                } else if (pattern.type === 'executeDamage') {
                    burstScore = Math.max(burstScore, Math.floor(Number(pattern.value) || 0));
                }
            });

            if (burstScore >= 18) {
                pushTag('burst-kill', '爆发斩杀', '单次或连段伤害偏高，需预留护盾/减伤应对。', 'high');
            }
            if (debuffActions >= 2) {
                pushTag('status-lock', '状态压制', '连续施加减益或状态牌，建议优先净化与速攻。', 'high');
            }
            if (summonActions >= 1) {
                pushTag('summon-chain', '召唤链', '可能不断补位或注入状态单位，需尽快打断节奏。', 'normal');
            }
            if (hasMultiAction) {
                pushTag('combo-loop', '连携循环', '单回合多段行动，需保留防御应对后续段。', 'normal');
            }
            if (defendActions + healActions >= 2) {
                pushTag('sustain', '续航拖战', '具备防御/恢复循环，建议把握爆发窗口。', 'normal');
            }

            return tags.slice(0, 2);
        };
        const threatTags = resolveThreatTags(enemy);
        const resolveCounterHints = (targetEnemy, role, tags, tools) => {
            const hints = [];
            const hasTag = (id) => Array.isArray(tags) && tags.some((item) => item && item.id === id);
            const pushHint = (label, detail) => {
                if (!label || !detail) return;
                if (hints.some((item) => item.label === label)) return;
                hints.push({ label, detail });
            };

            const targetBlock = Math.max(0, Math.floor(Number(targetEnemy?.block) || 0));
            if (hasTag('status-lock') || role.id === 'hexer') {
                if (tools.cleanse) {
                    pushHint('净化优先', '你手里有净化资源，可优先解控避免减益连锁。');
                } else {
                    pushHint('先保状态', '建议先补护盾并保留解控手段，避免被状态压制滚雪球。');
                }
            }
            if (hasTag('sustain') || role.id === 'guardian' || targetBlock >= 10) {
                if (tools.breakBlock) {
                    pushHint('破盾开口', '可先打出破盾/穿透效果，再接爆发牌收割。');
                } else {
                    pushHint('先叠破绽', '缺破盾手段时先叠易伤/破绽，再用高伤牌破防。');
                }
            }
            if (hasTag('burst-kill') || isGuardBreaker) {
                if (tools.defend) {
                    pushHint('先守后攻', '本回合优先交防御牌，避免被高爆发直接压穿。');
                } else {
                    pushHint('稳血量', '当前防守资源不足，建议保留指令槽或治疗应对斩杀线。');
                }
            }
            if (hasTag('combo-loop') || role.id === 'striker') {
                if (tools.burst) {
                    pushHint('抢节奏斩杀', '你手里有爆发组件，可抢在连段前压低关键目标血线。');
                } else if (tools.draw) {
                    pushHint('先找关键牌', '优先过牌找防御或爆发组件，避免被连携压回合。');
                }
            }

            if (hints.length === 0 && tools.cleanse) {
                pushHint('净化留手', '维持净化资源，优先处理对方减益或状态牌注入。');
            }

            return hints.slice(0, 2);
        };
        const counterHints = resolveCounterHints(enemy, enemyRole, threatTags, playerCounterTools);

        // 意图详细描述
        let intentDesc = `意图：${describePattern(currentPattern)}`;
        intentDesc += `｜战术：${enemyRole.label}`;
        const tacticalPlanLabel = String(enemy.tacticalPlanLabel || '').trim();
        if (tacticalPlanLabel) {
            intentDesc += `｜节奏：${tacticalPlanLabel}`;
        }
        if (threatTags.length > 0) {
            intentDesc += `｜威胁：${threatTags.map((item) => item.label).join('、')}`;
        }
        if (counterHints.length > 0) {
            intentDesc += `｜反制：${counterHints.map((item) => item.detail).join('；')}`;
        }
        const encounterTag = String(enemy.encounterThemeTag || '').trim();
        const encounterDesc = String(enemy.encounterThemeDesc || '').trim();
        const encounterTierStage = Math.max(1, Math.min(3, Math.floor(Number(enemy.encounterThemeTier) || 1)));
        const encounterTierText = `${'I'.repeat(encounterTierStage)}阶`;
        const encounterAffixTag = String(enemy.encounterAffixTag || '').trim();
        const encounterAffixDesc = String(enemy.encounterAffixDesc || '').trim();
        const squadTag = String(enemy.enemySquadTag || '').trim();
        const squadRoleLabel = String(enemy.enemySquadRoleLabel || '').trim();
        const squadDesc = String(enemy.enemySquadDesc || '').trim();
        if (encounterTag) {
            intentDesc += `｜遭遇：${encounterTag} ${encounterTierText}`;
        }
        if (encounterAffixTag) {
            intentDesc += `｜遭遇词缀：${encounterAffixTag}`;
        }
        if (squadTag) {
            intentDesc += `｜编队：${squadTag}${squadRoleLabel ? `·${squadRoleLabel}` : ''}`;
        }
        if (currentPattern.type === 'multiAction' && Array.isArray(currentPattern.actions) && currentPattern.actions.length > 0) {
            const segments = currentPattern.actions
                .map((act, idx) => `${idx + 1}.${describePattern(act)}`)
                .join('；');
            intentDesc += `｜子行动：${segments}`;
        }
        if (isGuardBreaker) {
            const shatterCap = (enemy.isElite && enemy.eliteType === 'sunder') ? 12 : 8;
            const shatterRate = (enemy.isElite && enemy.eliteType === 'sunder') ? 0.45 : 0.3;
            const shattered = playerBlock > 0
                ? Math.min(
                    playerBlock,
                    Math.max(3, Math.min(shatterCap, Math.floor(playerBlock * shatterRate)))
                )
                : 0;
            const bonusDamage = shattered > 0
                ? Math.max(
                    1,
                    Math.floor(shattered * ((enemy.isElite && enemy.eliteType === 'sunder') ? 0.6 : 0.4))
                )
                : 0;
            if (enemy.isElite && enemy.eliteType === 'sunder') {
                intentDesc += `｜词缀：破盾（预计击碎 ${shattered} 护盾，追加 ${bonusDamage} 伤害）`;
            } else if (canBossGuardBreak) {
                intentDesc += `｜压迫破盾（35%）：击碎 ${shattered} 护盾并追加 ${bonusDamage} 伤害`;
            } else {
                intentDesc += '｜词缀：破盾（可击碎护盾并追加伤害）';
            }
        }
        const tooltipSafe = String(intentDesc)
            .replace(/\\/g, '\\\\')
            .replace(/'/g, "\\'")
            .replace(/\n/g, ' ');
        const encounterDescSafe = encounterDesc
            .replace(/&/g, '&amp;')
            .replace(/"/g, '&quot;')
            .replace(/</g, '&lt;')
            .replace(/>/g, '&gt;');
        const encounterAffixDescSafe = encounterAffixDesc
            .replace(/&/g, '&amp;')
            .replace(/"/g, '&quot;')
            .replace(/</g, '&lt;')
            .replace(/>/g, '&gt;');
        const squadDescSafe = squadDesc
            .replace(/&/g, '&amp;')
            .replace(/"/g, '&quot;')
            .replace(/</g, '&lt;')
            .replace(/>/g, '&gt;');
        const counterHintTitleSafe = counterHints
            .map((item) => String(item.detail || ''))
            .join(' | ')
            .replace(/&/g, '&amp;')
            .replace(/"/g, '&quot;')
            .replace(/</g, '&lt;')
            .replace(/>/g, '&gt;');

        // BOSS Image Support (Unified Structure)
        let avatarStyle = '';
        let hasImage = false;

        if (enemy.isBoss && enemy.logo) {
            avatarStyle = `background-image: url('${enemy.logo}'); background-size: cover; background-position: center;`;
            hasImage = true;
        }

        enemyEl.innerHTML = `
            <div class="enemy-avatar ${hasImage ? 'has-image' : ''}" style="${avatarStyle}">
                ${hasImage ? '' : enemy.icon}
                <div class="enemy-intent ${currentPattern.type} ${isGuardBreaker ? 'breaker' : ''}" 
                     onmouseenter="Utils.showTooltip('${tooltipSafe}', event.clientX, event.clientY)"
                     onmouseleave="Utils.hideTooltip()">
                    ${intentIcon}
                    ${intentValue ? `<span class="intent-value">${intentValue}</span>` : ''}
                    ${isGuardBreaker ? '<span class="intent-tag breaker">破盾</span>' : ''}
                </div>
            </div>
            <div class="enemy-name">${enemy.name}</div>
            <div class="enemy-role-tag role-${enemyRole.id}">${enemyRole.label}</div>
            ${tacticalPlanLabel
                ? `<div class="enemy-plan-tag" title="行动节奏：${tacticalPlanLabel}">节奏·${tacticalPlanLabel}</div>`
                : ''}
            ${encounterTag
                ? `<div class="enemy-encounter-tag" title="${encounterDescSafe || '本场遭遇词条生效中'}">⚔️ 遭遇·${encounterTag} ${encounterTierText}</div>`
                : ''}
            ${encounterAffixTag
                ? `<div class="enemy-encounter-affix" title="${encounterAffixDescSafe || '高阶遭遇词缀生效中'}">✦ 词缀·${encounterAffixTag}</div>`
                : ''}
            ${squadTag
                ? `<div class="enemy-squad-tag" title="${squadDescSafe || '敌方编队协同中'}">⛭ 编队·${squadTag}${squadRoleLabel ? `·${squadRoleLabel}` : ''}</div>`
                : ''}
            ${counterHints.length > 0
                ? `<div class="enemy-counter-tag" title="${counterHintTitleSafe}">反制·${counterHints[0].label}</div>`
                : ''}
            ${threatTags.length > 0
                ? `<div class="enemy-threat-tags">${threatTags
                    .map((item) => {
                        const safeDesc = String(item.desc || '')
                            .replace(/&/g, '&amp;')
                            .replace(/"/g, '&quot;')
                            .replace(/</g, '&lt;')
                            .replace(/>/g, '&gt;');
                        const riskClass = item.severity === 'high' ? 'high-risk' : '';
                        return `<span class="enemy-threat-tag tag-${item.id} ${riskClass}" title="${safeDesc}">${item.label}</span>`;
                    })
                    .join('')}</div>`
                : ''}
            <div class="enemy-hp">
                <div class="enemy-hp-preview" style="width: 0%"></div>
                <div class="enemy-hp-fill" style="width: ${(enemy.currentHp / enemy.maxHp) * 100}%"></div>
            </div>
            <div class="enemy-hp-text">${enemy.currentHp}/${enemy.maxHp}</div>
            ${enemy.block > 0 ? `<div class="enemy-block">🛡️ ${enemy.block}</div>` : ''}
        <div class="buff-list enemy-buffs">
            ${this.renderBuffs(enemy)}
        </div>
        `;

        return enemyEl;
    },

    // 保存游戏状态到本地存储
    saveGame(state) {
        try {
            localStorage.setItem('theDefierSave', JSON.stringify(state));
            // 尝试云端同步
            if (typeof AuthService !== 'undefined' && AuthService.isLoggedIn()) {
                AuthService.saveCloudData(state).then(res => {
                    if (res.success) {
                        // console.log('云存档同步成功');
                    }
                });
            }
        } catch (e) {
            console.error('保存游戏失败:', e);
        }
    },

    // 加载游戏状态
    loadGame() {
        try {
            const saved = localStorage.getItem('theDefierSave');
            return saved ? JSON.parse(saved) : null;
        } catch (e) {
            console.error('加载游戏失败:', e);
            return null;
        }
    },

    // 升级卡牌逻辑
    upgradeCard(card) {
        if (!card) return null;
        if (card.upgraded) return card; // Prevent double upgrade

        const newCard = JSON.parse(JSON.stringify(card));
        newCard.upgraded = true;
        newCard.name += '+';

        // 提升数值 (通用逻辑)
        // 伤害 / 护盾 +3 或 x1.3
        if (newCard.effects) {
            newCard.effects.forEach(e => {
                if (['damage', 'block', 'heal', 'penetrate'].includes(e.type)) {
                    if (typeof e.value === 'number') {
                        // 基础值小于10的加3，大于等于10的加30%
                        if (e.value < 10) e.value += 3;
                        else e.value = Math.floor(e.value * 1.3);
                    }
                }
                // Buffs usually +1 stack
                if (['buff', 'debuff'].includes(e.type)) {
                    if (typeof e.value === 'number') {
                        e.value += 1;
                    }
                }
            });
        }

        // 降低费用? (可选，通常Roguelike升级是数值或减费选其一，这里简单起见只做数值增强)
        // 如果费用 > 2，升级减1费?
        // if (newCard.cost > 1) newCard.cost -= 1;

        return newCard;
    },

    // 战斗日志系统（分级 + 历史面板）
    _logTimer: null,
    _battleLogHistory: [],
    _battleLogFilter: 'all',
    _battleLogPanelBound: false,

    classifyBattleLog(message = '') {
        const text = String(message).toLowerCase();
        if (!text) return 'system';

        if (
            text.includes('不足') ||
            text.includes('失败') ||
            text.includes('异常') ||
            text.includes('无法') ||
            text.includes('免疫')
        ) {
            return 'warning';
        }
        if (
            text.includes('伤害') ||
            text.includes('流血') ||
            text.includes('中毒') ||
            text.includes('灼烧') ||
            text.includes('斩杀')
        ) {
            return 'damage';
        }
        if (
            text.includes('恢复') ||
            text.includes('护盾') ||
            text.includes('获得') ||
            text.includes('减益') ||
            text.includes('强化') ||
            text.includes('虚弱') ||
            text.includes('眩晕')
        ) {
            return 'status';
        }
        if (
            text.includes('奖励') ||
            text.includes('掉落') ||
            text.includes('灵石') ||
            text.includes('卡牌') ||
            text.includes('战斗胜利')
        ) {
            return 'reward';
        }
        return 'system';
    },

    ensureBattleLogPanel() {
        let panel = document.getElementById('battle-log-panel');
        const helper = typeof DefierBattleFeedback !== 'undefined'
            && DefierBattleFeedback
            && typeof DefierBattleFeedback.buildBattleLogPanelShellMarkup === 'function';
        if (!panel) {
            panel = document.createElement('div');
            panel.id = 'battle-log-panel';
            panel.className = 'battle-log-panel';
            panel.innerHTML = helper
                ? DefierBattleFeedback.buildBattleLogPanelShellMarkup(this._battleLogFilter || 'all')
                : `
                    <div class="battle-log-panel-header">
                        <span>战斗记录</span>
                        <button type="button" id="battle-log-panel-close" aria-label="关闭战斗记录">×</button>
                    </div>
                    <div class="battle-log-panel-filters">
                        <button type="button" class="log-filter-btn active" data-filter="all" aria-pressed="true">全部</button>
                        <button type="button" class="log-filter-btn" data-filter="damage" aria-pressed="false">伤害</button>
                        <button type="button" class="log-filter-btn" data-filter="status" aria-pressed="false">状态</button>
                        <button type="button" class="log-filter-btn" data-filter="reward" aria-pressed="false">奖励</button>
                        <button type="button" class="log-filter-btn" data-filter="system" aria-pressed="false">系统</button>
                        <button type="button" class="log-filter-btn" data-filter="warning" aria-pressed="false">警告</button>
                    </div>
                    <div id="battle-log-panel-list" class="battle-log-panel-list"></div>
                `;
            document.body.appendChild(panel);
        }

        panel.setAttribute('role', 'dialog');
        panel.setAttribute('aria-label', '战斗记录');
        panel.dataset.renderer = helper ? 'battle-feedback' : 'legacy';
        panel.querySelectorAll('.log-filter-btn').forEach((btn) => {
            const active = (btn.dataset.filter || 'all') === (this._battleLogFilter || 'all');
            btn.classList.toggle('active', active);
            btn.setAttribute('aria-pressed', active ? 'true' : 'false');
        });

        if (!this._battleLogPanelBound) {
            panel.addEventListener('click', (e) => {
                const btn = e.target.closest('.log-filter-btn');
                if (btn) {
                    this._battleLogFilter = btn.dataset.filter || 'all';
                    panel.querySelectorAll('.log-filter-btn').forEach((b) => {
                        const active = b === btn;
                        b.classList.toggle('active', active);
                        b.setAttribute('aria-pressed', active ? 'true' : 'false');
                    });
                    this.renderBattleLogPanel();
                    return;
                }
                if (e.target && e.target.id === 'battle-log-panel-close') {
                    panel.classList.remove('active');
                }
            });
            this._battleLogPanelBound = true;
        }

        return panel;
    },

    renderBattleLogPanel() {
        const panel = this.ensureBattleLogPanel();
        const list = panel.querySelector('#battle-log-panel-list');
        if (!list) return;

        const filter = this._battleLogFilter || 'all';
        list.dataset.filter = filter;

        if (typeof DefierBattleFeedback !== 'undefined'
            && DefierBattleFeedback
            && typeof DefierBattleFeedback.buildBattleLogListMarkup === 'function') {
            panel.dataset.renderer = 'battle-feedback';
            list.dataset.renderer = 'battle-feedback';
            list.innerHTML = DefierBattleFeedback.buildBattleLogListMarkup(this._battleLogHistory, filter);
            return;
        }

        const records = this._battleLogHistory
            .filter(item => filter === 'all' || item.category === filter)
            .slice()
            .reverse();

        if (records.length === 0) {
            list.innerHTML = '<div class="battle-log-empty">暂无记录</div>';
            return;
        }

        list.dataset.renderer = 'legacy';
        list.innerHTML = records.map(item => {
            const time = new Date(item.ts).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', second: '2-digit' });
            return `
                <div class="battle-log-item log-${item.category}">
                    <div class="battle-log-item-time">${time}</div>
                    <div class="battle-log-item-text">${item.message}</div>
                </div>
            `;
        }).join('');
    },

    toggleBattleLogPanel(forceOpen = null) {
        const panel = this.ensureBattleLogPanel();
        const shouldOpen = forceOpen === null ? !panel.classList.contains('active') : !!forceOpen;
        if (shouldOpen) {
            panel.classList.add('active');
            this.renderBattleLogPanel();
        } else {
            panel.classList.remove('active');
        }
    },

    showBattleLog(message, options = {}) {
        const log = document.getElementById('battle-log') || document.querySelector('.battle-middle .battle-log');
        if (!log) return;

        const text = String(message || '').trim();
        if (!text) return;

        log.setAttribute('role', 'status');
        log.setAttribute('aria-live', 'polite');
        log.setAttribute('aria-atomic', 'true');

        const category = options.category || this.classifyBattleLog(text);
        const duration = Math.max(1000, Number(options.duration) || 2200);

        log.textContent = text;
        log.classList.remove('show', 'log-damage', 'log-status', 'log-system', 'log-reward', 'log-warning');
        void log.offsetWidth;
        log.classList.add(`log-${category}`, 'show');

        if (this._logTimer) clearTimeout(this._logTimer);
        this._logTimer = setTimeout(() => {
            log.classList.remove('show');
        }, duration);

        this._battleLogHistory.push({
            ts: Date.now(),
            message: text,
            category
        });
        if (this._battleLogHistory.length > 120) {
            this._battleLogHistory.shift();
        }

        const panel = document.getElementById('battle-log-panel');
        if (panel && panel.classList.contains('active')) {
            this.renderBattleLogPanel();
        }
    },

    // 清除存档
    clearSave() {
        localStorage.removeItem('the_defier_save');
        location.reload();
    },

    // 异步等待
    sleep(ms) {
        return new Promise(resolve => setTimeout(resolve, ms));
    }
};


// Expose upgradeCard globally for compatibility
// window.upgradeCard = Utils.upgradeCard.bind(Utils);
