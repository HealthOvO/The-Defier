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
    createCardElement(card, index = 0) {
        const cardEl = document.createElement('div');
        cardEl.className = `card ${card.type}`;
        if (card.upgraded) {
            cardEl.classList.add('upgraded');
        }
        cardEl.dataset.cardId = card.id;
        cardEl.dataset.index = index;

        cardEl.innerHTML = `
            <div class="card-cost">${card.cost}</div>
            <div class="card-header">
                <div class="card-name">${card.name}</div>
                <div class="card-type">${this.getCardTypeName(card.type)}</div>
            </div>
            <div class="card-art">${card.icon}</div>
            <div class="card-desc">${card.description}</div>
        `;

        return cardEl;
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
