/**
 * The Defier 2.0 - 粒子系统
 */

class ParticleSystem {
    constructor() {
        this.container = null;
        this.init();
    }

    init() {
        // 创建粒子容器
        this.container = document.createElement('div');
        this.container.className = 'particles-container';
        this.container.id = 'particles-container';
        document.body.appendChild(this.container);
    }

    // 创建单个粒子
    createParticle(x, y, type, options = {}) {
        const particle = document.createElement('div');
        particle.className = `particle particle-${type}`;

        const size = options.size || Utils.random(5, 15);
        const duration = options.duration || Utils.random(500, 1500);
        const offsetX = options.offsetX || Utils.random(-30, 30);
        const offsetY = options.offsetY || Utils.random(-50, 10);

        particle.style.cssText = `
            left: ${x}px;
            top: ${y}px;
            width: ${size}px;
            height: ${size}px;
            animation-duration: ${duration}ms;
            --offset-x: ${offsetX}px;
            --offset-y: ${offsetY}px;
        `;

        this.container.appendChild(particle);

        // 自动移除
        setTimeout(() => particle.remove(), duration);

        return particle;
    }

    // 攻击粒子效果
    attackEffect(targetEl, count = 8) {
        const rect = targetEl.getBoundingClientRect();
        const centerX = rect.left + rect.width / 2;
        const centerY = rect.top + rect.height / 2;

        for (let i = 0; i < count; i++) {
            setTimeout(() => {
                this.createParticle(
                    centerX + Utils.random(-20, 20),
                    centerY + Utils.random(-20, 20),
                    'attack',
                    { size: Utils.random(8, 16) }
                );
            }, i * 30);
        }
    }

    // 雷电效果
    thunderEffect(targetEl, count = 12) {
        const rect = targetEl.getBoundingClientRect();
        const centerX = rect.left + rect.width / 2;
        const centerY = rect.top + rect.height / 2;

        // 闪电主体
        for (let i = 0; i < count; i++) {
            const angle = (Math.PI * 2 / count) * i;
            const distance = Utils.random(30, 60);

            this.createParticle(
                centerX + Math.cos(angle) * distance,
                centerY + Math.sin(angle) * distance,
                'thunder',
                { size: Utils.random(4, 10), duration: 300 }
            );
        }

        // 闪光效果
        this.flashScreen('rgba(116, 185, 255, 0.3)', 100);
    }

    // 火焰效果
    fireEffect(targetEl, count = 15) {
        const rect = targetEl.getBoundingClientRect();
        const centerX = rect.left + rect.width / 2;
        const bottom = rect.bottom;

        for (let i = 0; i < count; i++) {
            setTimeout(() => {
                this.createParticle(
                    centerX + Utils.random(-25, 25),
                    bottom - Utils.random(0, 30),
                    'fire',
                    { size: Utils.random(8, 18), duration: Utils.random(800, 1200) }
                );
            }, i * 50);
        }
    }

    // 治疗效果
    healEffect(targetEl, count = 10) {
        const rect = targetEl.getBoundingClientRect();
        const centerX = rect.left + rect.width / 2;
        const centerY = rect.top + rect.height / 2;

        for (let i = 0; i < count; i++) {
            setTimeout(() => {
                this.createParticle(
                    centerX + Utils.random(-40, 40),
                    centerY + Utils.random(20, 50),
                    'heal',
                    { size: Utils.random(6, 12), duration: 1500 }
                );
            }, i * 80);
        }
    }

    // 护盾效果
    shieldEffect(targetEl, count = 8) {
        const rect = targetEl.getBoundingClientRect();
        const centerX = rect.left + rect.width / 2;
        const centerY = rect.top + rect.height / 2;

        for (let i = 0; i < count; i++) {
            const angle = (Math.PI * 2 / count) * i;
            const distance = 40;

            this.createParticle(
                centerX + Math.cos(angle) * distance,
                centerY + Math.sin(angle) * distance,
                'shield',
                { size: 15, duration: 800 }
            );
        }
    }

    // 寒冰效果
    iceEffect(targetEl, count = 12) {
        const rect = targetEl.getBoundingClientRect();
        const centerX = rect.left + rect.width / 2;
        const centerY = rect.top + rect.height / 2;

        for (let i = 0; i < count; i++) {
            setTimeout(() => {
                const angle = Utils.random(0, Math.PI * 2);
                const distance = Utils.random(10, 40);

                this.createParticle(
                    centerX + Math.cos(angle) * distance,
                    centerY + Math.sin(angle) * distance,
                    'ice',
                    { size: Utils.random(6, 12), duration: 800 }
                );
            }, i * 20);
        }
        this.flashScreen('rgba(116, 185, 255, 0.2)', 150);
    }

    // 暗影/虚空效果
    darkEffect(targetEl, count = 15) {
        const rect = targetEl.getBoundingClientRect();
        const centerX = rect.left + rect.width / 2;
        const centerY = rect.top + rect.height / 2;

        for (let i = 0; i < count; i++) {
            setTimeout(() => {
                this.createParticle(
                    centerX + Utils.random(-30, 30),
                    centerY + Utils.random(-30, 30),
                    'dark',
                    { size: Utils.random(8, 20), duration: 1200 }
                );
            }, i * 30);
        }
        this.shakeScreen('normal');
    }

    // Boss出场效果
    bossSpawnEffect() {
        this.shakeScreen('heavy');
        this.flashScreen('rgba(255, 0, 0, 0.3)', 500);

        // 全屏暗影粒子
        const width = window.innerWidth;
        const height = window.innerHeight;

        for (let i = 0; i < 30; i++) {
            setTimeout(() => {
                this.createParticle(
                    Utils.random(0, width),
                    Utils.random(height / 2 - 100, height / 2 + 100),
                    'dark',
                    { size: Utils.random(15, 30), duration: 1500 }
                );
            }, i * 20);
        }
    }

    // 法则效果
    lawEffect(targetEl, count = 20) {
        const rect = targetEl.getBoundingClientRect();
        const centerX = rect.left + rect.width / 2;
        const centerY = rect.top + rect.height / 2;

        for (let i = 0; i < count; i++) {
            setTimeout(() => {
                const angle = Utils.random(0, Math.PI * 2);
                const distance = Utils.random(20, 60);

                this.createParticle(
                    centerX + Math.cos(angle) * distance,
                    centerY + Math.sin(angle) * distance,
                    'law',
                    { size: Utils.random(4, 10), duration: 1500 }
                );
            }, i * 40);
        }

        // 紫色闪光
        this.flashScreen('rgba(108, 92, 231, 0.2)', 200);
    }

    // 卡牌使用效果
    playCardEffect(targetEl, cardType) {
        if (!targetEl) targetEl = document.querySelector('.player-avatar'); // 默认目标为玩家

        switch (cardType) {
            case 'attack':
                this.attackEffect(targetEl);
                break;
            case 'defense':
                this.shieldEffect(document.querySelector('.player-avatar'));
                break;
            case 'heal':
                this.healEffect(document.querySelector('.player-avatar'));
                break;
            case 'law':
                this.lawEffect(targetEl);
                break;
            case 'fire':
                this.fireEffect(targetEl);
                break;
            case 'thunder':
                this.thunderEffect(targetEl);
                break;
            case 'ice':
                this.iceEffect(targetEl);
                break;
            case 'dark':
            case 'void':
                this.darkEffect(targetEl);
                break;
            default:
                // 通用效果
                if (targetEl) {
                    const rect = targetEl.getBoundingClientRect();
                    this.createParticle(
                        rect.left + rect.width / 2,
                        rect.top + rect.height / 2,
                        'magic',
                        { size: 10 }
                    );
                }
        }
    }

    // 暴击效果
    criticalEffect(targetEl) {
        const rect = targetEl.getBoundingClientRect();
        const centerX = rect.left + rect.width / 2;
        const centerY = rect.top + rect.height / 2;

        // 大量攻击粒子
        this.attackEffect(targetEl, 20);

        // 屏幕震动
        this.shakeScreen();

        // 显示暴击文字
        const critText = document.createElement('div');
        critText.className = 'critical-text';
        critText.textContent = '暴击!';
        critText.style.left = `${centerX}px`;
        critText.style.top = `${centerY - 30}px`;
        document.body.appendChild(critText);

        setTimeout(() => critText.remove(), 1000);
    }

    // 盗取成功效果
    stealSuccessEffect(targetEl) {
        const rect = targetEl.getBoundingClientRect();
        const centerX = rect.left + rect.width / 2;
        const centerY = rect.top + rect.height / 2;

        // 紫色法则粒子螺旋上升
        for (let i = 0; i < 30; i++) {
            setTimeout(() => {
                const angle = (i / 30) * Math.PI * 4;
                const radius = 10 + i * 2;

                this.createParticle(
                    centerX + Math.cos(angle) * radius,
                    centerY - i * 3,
                    'law',
                    { size: Utils.random(6, 12), duration: 2000 }
                );
            }, i * 30);
        }

        this.flashScreen('rgba(255, 215, 0, 0.3)', 300);
    }

    // 屏幕闪光
    flashScreen(color, duration = 100) {
        const flash = document.createElement('div');
        flash.style.cssText = `
            position: fixed;
            top: 0;
            left: 0;
            width: 100%;
            height: 100%;
            background: ${color};
            pointer-events: none;
            z-index: 9999;
            animation: fadeOut ${duration}ms ease forwards;
        `;

        document.body.appendChild(flash);
        setTimeout(() => flash.remove(), duration);
    }

    // 屏幕震动
    shakeScreen(intensity = 'normal') {
        const battle = document.getElementById('battle-screen');
        if (battle) {
            battle.classList.add('screen-shake');
            setTimeout(() => battle.classList.remove('screen-shake'), 500);
        }
    }

    // 清除所有粒子
    clear() {
        if (this.container) {
            this.container.innerHTML = '';
        }
    }
}

// 全局粒子系统实例
let particles;

document.addEventListener('DOMContentLoaded', () => {
    particles = new ParticleSystem();
});
