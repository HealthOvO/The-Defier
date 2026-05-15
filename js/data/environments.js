import { Utils } from "../core/utils.js";
/**
 * The Defier - 天域环境定义
 * 每个天域的特殊全局规则
 */
export const REALM_ENVIRONMENTS = {
  // 第4重·金丹天 (火焰)
  4: {
    id: 'scorchedEarth',
    name: '灼热地狱',
    description: '空气中弥漫着火毒。回合结束时，所有角色（敌我）受到 3 点灼烧伤害。',
    icon: '🔥',
    onTurnEnd: battle => {
      // 对玩家造成伤害
      battle.player.takeDamage(3);
      Utils.showBattleLog('灼热地狱：玩家受到3点火毒伤害');

      // 对所有敌人造成伤害
      battle.enemies.forEach((enemy, index) => {
        if (enemy.currentHp > 0) {
          enemy.currentHp -= 3;
          const el = document.querySelector(`.enemy[data-index="${index}"]`);
          if (el) Utils.showFloatingNumber(el, 3, 'damage');
        }
      });
      Utils.showBattleLog('灼热地狱：敌人受到3点火毒伤害');
    }
  },
  // 第8重·大乘天 (虚空/重力)
  8: {
    id: 'heavyGravity',
    name: '重力场',
    description: '举步维艰。所有耗能 > 1 的卡牌耗能 +1，造成伤害 -20%。',
    icon: '⚖️',
    onBattleStart: battle => {
      // 逻辑在 battle.js 或 card.js 中处理，这里只作为标记
      battle.environmentState = {
        gravity: true
      };
    },
    // 动态修改卡牌费用的逻辑需要注入到 player.playCard 或 hand 渲染中
    modifyCardCost: card => {
      if (card.cost > 1) return card.cost + 1;
      return card.cost;
    }
  },
  // 第10重·地仙界 (大地)
  10: {
    id: 'sandstorm',
    name: '狂沙领域',
    description: '视线模糊。每回合开始时，有 25% 几率获得 1 层[虚弱]。',
    icon: '🌪️',
    onTurnStart: battle => {
      if (Math.random() < 0.25) {
        battle.player.addBuff('weak', 1);
        Utils.showBattleLog('狂沙迷眼：获得 1 层虚弱');
      }
    }
  },
  // 第12重·金仙界 (金戈)
  12: {
    id: 'battlefield',
    name: '古战场',
    description: '杀伐之气。所有攻击伤害 +20%，但无法获得[护盾]。',
    icon: '⚔️',
    onBattleStart: battle => {
      battle.environmentState = {
        noBlock: true,
        damageBonus: 0.2
      };
    }
  },
  // 第16重·太乙天 (鲜血)
  16: {
    id: 'bloodMoon',
    name: '猩红之月',
    description: '吸血诅咒。每当造成伤害时，恢复 1 点生命，但每回合开始失去 2% 最大生命。',
    icon: '🩸',
    onTurnStart: battle => {
      const loss = Math.floor(battle.player.maxHp * 0.02);
      battle.player.currentHp -= loss;
      Utils.showBattleLog(`猩红之月：流失 ${loss} 点生命`);
    }
  }
};