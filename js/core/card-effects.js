/**
 * 卡牌3D悬浮效果管理器
 * 移植自 pokemon-cards-css 并适配"水墨金韵"修仙风格
 * 
 * 核心原理：
 * 1. 监听鼠标/触摸事件，计算相对位置 (0-100%)
 * 2. 使用 Lerp 插值实现平滑动画
 * 3. 实时注入 CSS 变量驱动 3D 变换和光效
 */
const CardEffects = {
    // 配置参数
    config: {
        rotationIntensity: 12,  // 旋转强度(度)
        lerpFactor: 0.12,       // 平滑插值因子 (越大越快)
        resetDelay: 80,         // 鼠标移出后重置延迟(ms)
        enableOnMobile: true    // 是否在移动端启用
    },

    // 状态存储 (使用 WeakMap 避免内存泄漏)
    states: new WeakMap(),

    /**
     * 初始化单个卡牌的3D效果
     * @param {HTMLElement} cardElement - 卡牌DOM元素
     */
    init(cardElement) {
        if (!cardElement || this.states.has(cardElement)) return;

        // 初始化状态
        const state = {
            current: { x: 50, y: 50, rotateX: 0, rotateY: 0 },
            target: { x: 50, y: 50, rotateX: 0, rotateY: 0 },
            rafId: null,
            isInteracting: false,
            resetTimer: null
        };
        this.states.set(cardElement, state);

        // 绑定鼠标事件
        cardElement.addEventListener('mouseenter', (e) => this.onEnter(e, cardElement));
        cardElement.addEventListener('mousemove', (e) => this.onMove(e, cardElement));
        cardElement.addEventListener('mouseleave', (e) => this.onLeave(e, cardElement));

        // 触摸事件支持
        if (this.config.enableOnMobile) {
            cardElement.addEventListener('touchstart', (e) => this.onTouchStart(e, cardElement), { passive: true });
            cardElement.addEventListener('touchmove', (e) => this.onTouchMove(e, cardElement), { passive: true });
            cardElement.addEventListener('touchend', (e) => this.onLeave(e, cardElement));
        }
    },

    /**
     * 鼠标进入卡牌
     */
    onEnter(e, card) {
        const state = this.states.get(card);
        if (!state) return;

        // 清除重置定时器
        if (state.resetTimer) {
            clearTimeout(state.resetTimer);
            state.resetTimer = null;
        }

        state.isInteracting = true;
        card.classList.add('card--interacting');
        this.startAnimation(card);
    },

    /**
     * 鼠标移动 - 核心坐标计算
     */
    onMove(e, card) {
        const state = this.states.get(card);
        if (!state || !state.isInteracting) return;

        const rect = card.getBoundingClientRect();

        // 计算鼠标相对位置 (0-100)
        const x = ((e.clientX - rect.left) / rect.width) * 100;
        const y = ((e.clientY - rect.top) / rect.height) * 100;

        // 计算旋转角度 (以中心50%为原点)
        const centerX = x - 50;
        const centerY = y - 50;
        const intensity = this.config.rotationIntensity;

        state.target = {
            x: this.clamp(x, 0, 100),
            y: this.clamp(y, 0, 100),
            // rotateX 控制左右旋转，rotateY 控制上下旋转
            rotateX: -(centerX / 50) * intensity,
            rotateY: (centerY / 50) * intensity
        };
    },

    /**
     * 鼠标离开卡牌
     */
    onLeave(e, card) {
        const state = this.states.get(card);
        if (!state) return;

        state.isInteracting = false;

        // 延迟重置，让动画有时间归位
        state.resetTimer = setTimeout(() => {
            if (!state.isInteracting) {
                card.classList.remove('card--interacting');
                state.target = { x: 50, y: 50, rotateX: 0, rotateY: 0 };
            }
        }, this.config.resetDelay);
    },

    /**
     * 触摸开始
     */
    onTouchStart(e, card) {
        if (e.touches.length === 1) {
            const touch = e.touches[0];
            this.onEnter({ clientX: touch.clientX, clientY: touch.clientY }, card);
        }
    },

    /**
     * 触摸移动
     */
    onTouchMove(e, card) {
        if (e.touches.length === 1) {
            const touch = e.touches[0];
            this.onMove({ clientX: touch.clientX, clientY: touch.clientY }, card);
        }
    },

    /**
     * 动画循环 - 使用 Lerp 平滑插值
     */
    startAnimation(card) {
        const state = this.states.get(card);
        if (!state || state.rafId) return;

        const animate = () => {
            const { current, target } = state;
            const factor = this.config.lerpFactor;

            // Lerp 线性插值：current += (target - current) * factor
            current.x += (target.x - current.x) * factor;
            current.y += (target.y - current.y) * factor;
            current.rotateX += (target.rotateX - current.rotateX) * factor;
            current.rotateY += (target.rotateY - current.rotateY) * factor;

            // 注入 CSS 变量
            card.style.setProperty('--pointer-x', `${current.x}%`);
            card.style.setProperty('--pointer-y', `${current.y}%`);
            card.style.setProperty('--rotate-x', `${current.rotateX}deg`);
            card.style.setProperty('--rotate-y', `${current.rotateY}deg`);

            // 判断是否需要继续动画
            const threshold = 0.1;
            const needsContinue = state.isInteracting ||
                Math.abs(current.x - target.x) > threshold ||
                Math.abs(current.y - target.y) > threshold ||
                Math.abs(current.rotateX - target.rotateX) > threshold ||
                Math.abs(current.rotateY - target.rotateY) > threshold;

            if (needsContinue) {
                state.rafId = requestAnimationFrame(animate);
            } else {
                state.rafId = null;
                // 完全归位时清除内联样式
                if (!state.isInteracting) {
                    card.style.removeProperty('--pointer-x');
                    card.style.removeProperty('--pointer-y');
                    card.style.removeProperty('--rotate-x');
                    card.style.removeProperty('--rotate-y');
                }
            }
        };

        state.rafId = requestAnimationFrame(animate);
    },

    /**
     * 工具函数 - 限制数值范围
     */
    clamp(value, min, max) {
        return Math.min(Math.max(value, min), max);
    },

    /**
     * 批量初始化页面上所有卡牌
     * @param {string} selector - CSS选择器
     */
    initAll(selector = '.card') {
        document.querySelectorAll(selector).forEach(card => this.init(card));
    },

    /**
     * 销毁卡牌效果 (清理事件监听)
     * @param {HTMLElement} cardElement - 卡牌DOM元素
     */
    destroy(cardElement) {
        const state = this.states.get(cardElement);
        if (state) {
            if (state.rafId) {
                cancelAnimationFrame(state.rafId);
            }
            if (state.resetTimer) {
                clearTimeout(state.resetTimer);
            }
            this.states.delete(cardElement);
            cardElement.classList.remove('card--interacting');
        }
    }
};

// 导出到全局
window.CardEffects = CardEffects;

// DOM加载完成后自动初始化已有卡牌
document.addEventListener('DOMContentLoaded', () => {
    // 使用 MutationObserver 监听动态添加的卡牌
    const observer = new MutationObserver((mutations) => {
        mutations.forEach((mutation) => {
            mutation.addedNodes.forEach((node) => {
                if (node.nodeType === 1) { // Element node
                    if (node.classList && node.classList.contains('card')) {
                        CardEffects.init(node);
                    }
                    // 也检查子节点中的卡牌
                    if (node.querySelectorAll) {
                        node.querySelectorAll('.card').forEach(card => CardEffects.init(card));
                    }
                }
            });
        });
    });

    observer.observe(document.body, {
        childList: true,
        subtree: true
    });

    // 初始化现有卡牌
    CardEffects.initAll();
});
