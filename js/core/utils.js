/**
 * The Defier - 工具函数
 */

const Utils = {
    // 生成随机数（包含min和max）
    random(min, max) {
        return Math.floor(Math.random() * (max - min + 1)) + min;
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
        floater.style.left = `${rect.left + rect.width / 2}px`;
        floater.style.top = `${rect.top}px`;

        document.body.appendChild(floater);

        setTimeout(() => floater.remove(), 1000);
    },

    // 添加震动效果
    addShakeEffect(element) {
        element.classList.add('shake');
        setTimeout(() => element.classList.remove('shake'), 300);
    },

    // 添加闪光效果
    addFlashEffect(element) {
        element.classList.add('damage-flash');
        setTimeout(() => element.classList.remove('damage-flash'), 200);
    },

    // 显示战斗日志
    showBattleLog(message) {
        const log = document.getElementById('battle-log');
        log.textContent = message;
        log.classList.add('show');
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
    createCardElement(card, index = 0, isReward = false) {
        const div = document.createElement('div');
        div.className = `card ${card.type} rarity-${card.rarity || 'common'}`;
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

        const costHtml = isReward ? '' : `<div class="card-cost">${card.cost}</div>`;
        const typeIcon = this.getCardTypeIcon(card.type);

        div.innerHTML = `
            ${costHtml}
            <div class="card-header">
                <div class="card-name">${card.name}</div>
            </div>
            <div class="card-image">${card.icon || '🎴'}</div>
            <div class="card-desc">${card.description}</div>
            <div class="card-type">${typeIcon} ${this.getCardTypeName(card.type)}</div>
        `;

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

    // 显示卡牌详情弹窗
    showCardDetail(card) {
        // 创建或获取详情遮罩层
        let modal = document.getElementById('card-detail-modal');
        if (!modal) {
            modal = document.createElement('div');
            modal.id = 'card-detail-modal';
            modal.className = 'modal-overlay';
            modal.style.display = 'none';
            modal.onclick = () => modal.style.display = 'none';
            document.body.appendChild(modal);

            // 添加样式（如果CSS中没有）
            const style = document.createElement('style');
            style.textContent = `
                .modal-overlay {
                    position: fixed; top: 0; left: 0; width: 100%; height: 100%;
                    background: rgba(0,0,0,0.8); z-index: 2000;
                    display: flex; justify-content: center; align-items: center;
                }
                .card-detail-view {
                    background: #2a2a2a; border: 2px solid #d4af37; padding: 20px;
                    border-radius: 10px; max-width: 400px; color: #fff;
                    box-shadow: 0 0 20px rgba(212, 175, 55, 0.3);
                }
                .detail-header { display: flex; justify-content: space-between; align-items: center; margin-bottom: 15px; border-bottom: 1px solid #444; padding-bottom: 10px; }
                .big-card-icon { font-size: 64px; text-align: center; margin: 20px 0; }
                .detail-type { color: #aaa; font-size: 0.9em; text-align: center; }
                .detail-desc { font-size: 1.1em; line-height: 1.5; margin: 15px 0; text-align: center; color: #e0e0e0; }
                .detail-section { background: #333; padding: 10px; border-radius: 5px; margin-top: 15px; }
                .detail-section ul { padding-left: 20px; margin: 5px 0; }
                .detail-law { margin-top: 10px; color: #a0c0ff; text-align: right; font-style: italic; }
                .close-btn { font-size: 24px; cursor: pointer; color: #888; }
                .close-btn:hover { color: #fff; }
            `;
            document.head.appendChild(style);
        }

        // 构建详情内容
        // 解析详细效果数值
        let effectsHtml = '';
        if (card.effects) {
            effectsHtml = '<div class="detail-section"><strong>效果解析:</strong><ul>';
            card.effects.forEach(e => {
                effectsHtml += `<li>${this.getEffectDescription(e)}</li>`;
            });
            effectsHtml += '</ul></div>';
        }

        modal.innerHTML = `
            <div class="modal-content card-detail-view" onclick="event.stopPropagation()">
                <div class="detail-header">
                    <h2>${card.name}</h2>
                    <span class="close-btn" onclick="document.getElementById('card-detail-modal').style.display='none'">&times;</span>
                </div>
                <div class="detail-body">
                    <div class="big-card-icon">${card.icon || '🎴'}</div>
                    <p class="detail-type">类型: ${this.getCardTypeName(card.type)} | 品质: ${this.getCardRarityName(card.rarity)} | 消耗: ${card.cost}</p>
                    <p class="detail-desc">${card.description}</p>
                    ${effectsHtml}
                    ${card.lawType ? `<p class="detail-law">所属法则: ${this.getLawName(card.lawType)}</p>` : ''}
                </div>
            </div>
        `;
        modal.style.display = 'flex';
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
                    if (icon) {
                        html += `<div class="buff-icon" title="${buff}">${icon}<span class="buff-val">${value}</span></div>`;
                    }
                }
            }
        }
        if (entity.stunned) {
            html += `<div class="buff-icon" title="眩晕: 无法行动">💫</div>`;
        }
        return html;
    },

    // 获取 Buff 图标
    getBuffIcon(type) {
        const icons = {
            weak: '🥀', // 虚弱:造成伤害降低
            vulnerable: '💔', // 易伤:受到伤害增加
            strength: '💪', // 力量:造成伤害增加
            poison: '☠️', // 中毒
            burn: '🔥', // 灼烧
            paralysis: '⚡', // 麻痹
            regeneration: '🌿', // 再生
            reflect: '🔮', // 反伤
            dodge: '👻', // 闪避
            artifact: '🏺' // 神器/宝物效果
        };
        return icons[type] || '';
    },

    // 创建敌人元素
    createEnemyElement(enemy, index = 0) {
        const enemyEl = document.createElement('div');
        enemyEl.className = `enemy ${enemy.isElite ? 'elite' : ''} ${enemy.isBoss ? 'boss' : ''}`;
        enemyEl.dataset.index = index;

        const currentPattern = enemy.patterns[enemy.currentPatternIndex || 0];
        const intentIcon = currentPattern.intent || '❓';
        const intentValue = currentPattern.value || '';

        enemyEl.innerHTML = `
            <div class="enemy-avatar">
                ${enemy.icon}
                <div class="enemy-intent ${currentPattern.type}">
                    ${intentIcon}
                    ${intentValue ? `<span class="intent-value">${intentValue}</span>` : ''}
                </div>
            </div>
            <div class="enemy-name">${enemy.name}</div>
            <div class="enemy-hp">
                <div class="enemy-hp-fill" style="width: ${(enemy.currentHp / enemy.hp) * 100}%"></div>
            </div>
            <div class="enemy-hp-text">${enemy.currentHp}/${enemy.hp}</div>
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

    // 清除存档
    clearSave() {
        localStorage.removeItem('theDefierSave');
    }
};
