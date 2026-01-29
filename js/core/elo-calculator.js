/**
 * The Defier - ELO Rating Calculator
 * 用于计算PVP积分变动
 */

class EloCalculatorService {
    constructor() {
        // K值配置 (波动系数)
        this.K_FACTORS = {
            DEFAULT: 32,
            PRO: 16,     // 高段位稳定
            STARTER: 40  // 新手快速定位
        };
    }

    /**
     * 计算新的积分
     * @param {number} rating1 玩家当前积分
     * @param {number} rating2 对手积分
     * @param {number} actualScore 实际结果 (1:胜, 0:负, 0.5:平)
     * @param {string} tier 玩家段位类型 (starter, pro, etc) - optional
     * @returns {Object} { newRating, delta }
     */
    calculate(rating1, rating2, actualScore, tier = 'default') {
        const expectedScore = this.getExpectedScore(rating1, rating2);
        const k = this.getKFactor(rating1, tier);

        let delta = Math.round(k * (actualScore - expectedScore));

        // 保护机制：新手保护期(1000分以下)失败扣分减半或不扣
        if (rating1 < 1000 && delta < 0) {
            delta = Math.max(delta, 0); // 不扣分
        }

        return {
            newRating: rating1 + delta,
            delta: delta,
            expected: expectedScore
        };
    }

    /**
     * 计算期望胜率 (0~1)
     * Using logistic curve: E = 1 / (1 + 10^((R2-R1)/400))
     */
    getExpectedScore(rating1, rating2) {
        return 1 / (1 + Math.pow(10, (rating2 - rating1) / 400));
    }

    /**
     * 获取K值
     */
    getKFactor(rating, tier) {
        if (rating < 2000) return 32; // 低分段波动大
        if (rating < 3000) return 24; // 中段
        return 16;                    // 高手段位稳定
    }
}

// Global Export
if (typeof module !== 'undefined' && module.exports) {
    module.exports = new EloCalculatorService();
} else {
    window.EloCalculator = new EloCalculatorService();
}
