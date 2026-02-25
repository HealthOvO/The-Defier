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
    showCardDetail(card) {
        // 创建或获取详情遮罩层
        let modal = document.getElementById('card-detail-modal');
        if (!modal) {
            modal = document.createElement('div');
            modal.id = 'card-detail-modal';
            modal.className = 'modal-overlay card-detail-overlay';
            // Click outside to close
            modal.onclick = (e) => {
                if (e.target === modal) modal.style.display = 'none';
            };
            document.body.appendChild(modal);
        }

        // 解析详细效果数值
        let effectsHtml = '';
        if (card.effects) {
            effectsHtml = '<div class="cd-section"><h3><span class="cd-icon">⚡</span> 效果解析</h3><ul class="cd-effects-list">';
            card.effects.forEach(e => {
                effectsHtml += `<li>${this.getEffectDescription(e)}</li>`;
            });
            effectsHtml += '</ul></div>';
        }

        // Keywords / Lore (Placeholder)
        const loreHtml = card.lore ? `<div class="cd-section cd-lore">"${card.lore}"</div>` : '';

        // Rarity Color
        const rarityClass = `rarity-${card.rarity || 'common'}`;

        modal.innerHTML = `
            <div class="card-detail-container">
                <!-- Left: 3D Card Preview -->
                <div class="cd-preview-pane">
                    <div class="card-preview-wrapper">
                         <!-- Re-use createCardElement logic but purely visual -->
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

                <!-- Right: Information -->
                <div class="cd-info-pane">
                    <div class="cd-header">
                        <h2>${card.name}</h2>
                        <div class="cd-badges">
                            <span class="cd-badge type-${card.type}">${this.getCardTypeName(card.type)}</span>
                            <span class="cd-badge rarity-${card.rarity}">${this.getCardRarityName(card.rarity)}</span>
                            ${card.lawType ? `<span class="cd-badge law">${this.getLawName(card.lawType)}</span>` : ''}
                        </div>
                    </div>
                    
                    <div class="cd-body">
                        <div class="cd-desc-box">
                            ${card.description}
                        </div>
                        ${effectsHtml}
                        ${loreHtml}
                    </div>

                    <button class="cd-close-btn" onclick="document.getElementById('card-detail-modal').style.display='none'">关闭界面</button>
                </div>
            </div>
        `;

        modal.style.display = 'flex';

        // Add minimal animation
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
        const map = { 'basic': '基础', 'common': '普通', 'uncommon': '优秀', 'rare': '稀有', 'legendary': '传说' };
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

        // 意图详细描述
        let intentDesc = '';
        switch (currentPattern.type) {
            case 'attack': intentDesc = `意图：攻击 ${currentPattern.value} 点伤害`; break;
            case 'multiAttack': intentDesc = `意图：连击 ${currentPattern.value} x ${currentPattern.count} 次`; break;
            case 'defend': intentDesc = `意图：获得 ${currentPattern.value} 点护盾`; break;
            case 'buff': intentDesc = `意图：强化自身`; break;
            case 'debuff': intentDesc = `意图：削弱玩家`; break;
            case 'heal': intentDesc = `意图：恢复 ${currentPattern.value} 点生命`; break;
            default: intentDesc = '意图：未知';
        }

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
                <div class="enemy-intent ${currentPattern.type}" 
                     onmouseenter="Utils.showTooltip('${intentDesc}', event.clientX, event.clientY)"
                     onmouseleave="Utils.hideTooltip()">
                    ${intentIcon}
                    ${intentValue ? `<span class="intent-value">${intentValue}</span>` : ''}
                </div>
            </div>
            <div class="enemy-name">${enemy.name}</div>
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
        if (!panel) {
            panel = document.createElement('div');
            panel.id = 'battle-log-panel';
            panel.className = 'battle-log-panel';
            panel.innerHTML = `
                <div class="battle-log-panel-header">
                    <span>战斗记录</span>
                    <button type="button" id="battle-log-panel-close">×</button>
                </div>
                <div class="battle-log-panel-filters">
                    <button type="button" class="log-filter-btn active" data-filter="all">全部</button>
                    <button type="button" class="log-filter-btn" data-filter="damage">伤害</button>
                    <button type="button" class="log-filter-btn" data-filter="status">状态</button>
                    <button type="button" class="log-filter-btn" data-filter="system">系统</button>
                    <button type="button" class="log-filter-btn" data-filter="warning">警告</button>
                </div>
                <div id="battle-log-panel-list" class="battle-log-panel-list"></div>
            `;
            document.body.appendChild(panel);
        }

        if (!this._battleLogPanelBound) {
            panel.addEventListener('click', (e) => {
                const btn = e.target.closest('.log-filter-btn');
                if (btn) {
                    this._battleLogFilter = btn.dataset.filter || 'all';
                    panel.querySelectorAll('.log-filter-btn').forEach(b => b.classList.remove('active'));
                    btn.classList.add('active');
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
        const records = this._battleLogHistory
            .filter(item => filter === 'all' || item.category === filter)
            .slice()
            .reverse();

        if (records.length === 0) {
            list.innerHTML = '<div class="battle-log-empty">暂无记录</div>';
            return;
        }

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
