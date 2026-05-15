import { FATE_RING } from "../data/fate_ring.js";
import { getAvailablePaths, getLawPassiveDescription, LAW_RESONANCES } from "../data/laws.js";
import { Utils } from "../core/utils.js";
export class FateRingView {
  constructor(gameInstance) {
    this.game = gameInstance;
  }
  showFateRing() {
    const modal = document.getElementById('ring-modal');
    const ring = this.game.player.fateRing;
    const ringSystem = document.getElementById('ring-system-3d');

    // Data Initialization
    if (!ring.slots || ring.slots.length === 0) {
      if (ring.initSlots) ring.initSlots();
    }
    if (!ring.unlockedPaths) ring.unlockedPaths = ['awakened'];
    if (!ring.path) ring.path = 'awakened';

    // --- Render 3D Scene (Initialize Only Once) ---
    if (ringSystem.children.length === 0) {
      ringSystem.innerHTML = ''; // Clear comments/whitespace
      // 1. Add Decorative Rings with Ink & Gold Styles
      const layers = ['core', 'inner', 'middle', 'outer'];
      layers.forEach(layer => {
        const el = document.createElement('div');
        el.className = `fate-ring-layer ring-layer-${layer}`;
        // Add runes
        if (layer !== 'core') {
          for (let i = 0; i < 8; i++) {
            const rune = document.createElement('div');
            rune.className = 'ring-rune';
            rune.innerText = this.game.getRandomRune();
            rune.style.transform = `rotate(${i * 45}deg) translateY(-${layer === 'inner' ? 120 : layer === 'middle' ? 200 : 280}px)`;
            el.appendChild(rune);
          }
        }
        ringSystem.appendChild(el);
      });

      // 2. Add Slots (3D Positioned)
      const radius = 220;
      const slotsCount = ring.slots.length;
      ring.slots.forEach((slot, index) => {
        const angleDeg = index / slotsCount * 360 - 90;
        const angleRad = angleDeg * (Math.PI / 180);
        const x = Math.cos(angleRad) * radius;
        const y = Math.sin(angleRad) * radius;
        const slotEl = document.createElement('div');
        slotEl.className = `ring-slot-3d`;
        slotEl.id = `ring-slot-${index}`; // Add ID for easier updates

        // Drag & Drop Attributes
        slotEl.classList.add('droppable');
        slotEl.setAttribute('data-slot-index', index);
        slotEl.style.transform = `translate(${x}px, ${y}px)`;

        // Content Placeholder
        slotEl.innerHTML = '';

        // Force high z-index interaction
        slotEl.style.zIndex = '2000';

        // Click Interaction
        slotEl.addEventListener('click', e => this.game.handleSlotClick(index, e));
        ringSystem.appendChild(slotEl);
      });

      // Bind Drag Events (Removed)
    }

    // --- Update Dynamic Content ---
    this.game.updateUIState(ring);

    // --- Render 2D UI Overlay ---

    // 1. Basic Info
    document.getElementById('modal-ring-name').innerText = ring.name;
    document.getElementById('modal-ring-level').innerText = `等级 ${ring.level}`;

    // EXP (Polished)
    const nextLevelExp = FATE_RING.levels[ring.level + 1]?.exp || 9999;
    const expPercent = Math.min(100, ring.exp / nextLevelExp * 100);
    const isMax = ring.level >= 10;
    const expBar = document.getElementById('modal-ring-exp-bar');
    expBar.style.width = `${expPercent}%`;
    if (isMax) expBar.classList.add('max');else expBar.classList.remove('max');
    const expText = document.getElementById('modal-ring-exp-text');
    expText.innerHTML = isMax ? '<span class="value max">MAX</span>' : `<span class="value">${ring.exp}</span> / ${nextLevelExp}`;

    // 2. Bonus Info
    const statsList = document.getElementById('modal-ring-stats');
    statsList.innerHTML = '';
    const bonus = ring.getStatsBonus();
    if (bonus.maxHp) statsList.innerHTML += this.game.createStatRow('生命上限', `+${bonus.maxHp}`, '❤️');
    if (bonus.energy) statsList.innerHTML += this.game.createStatRow('基础灵力', `+${bonus.energy}`, '⚡');
    if (bonus.draw) statsList.innerHTML += this.game.createStatRow('每回合抽牌', `+${bonus.draw}`, '🎴');

    // Character Specifics
    document.getElementById('modal-ring-path').innerHTML = this.renderCurrentPathInfo(ring) + this.renderCharacterSpecifics(ring);

    // 3. Right Panel (Tabbed Refactor)
    const rightPanel = document.querySelector('.ring-ui-panel.right');
    // Check if structure exists, if not recreate (safe to overwrite)
    rightPanel.innerHTML = `
            <div class="panel-tabs">
                <div class="tab active" data-ring-action="switch-tab" data-ring-tab="library">法则库 (${this.game.player.collectedLaws.length})</div>
                <div class="tab" data-ring-action="switch-tab" data-ring-tab="resonance">法则共鸣</div>
            </div>
            <div class="panel-content-area">
                <div id="tab-content-library" class="tab-content active">
                     ${this.renderLawLibrary(ring)}
                </div>
                <div id="tab-content-resonance" class="tab-content">
                     ${this.renderResonances(ring)}
                </div>
            </div>
            <div class="ring-ui-footer" id="ring-ui-footer">
                <p class="instruction-text">点击空槽位，再选择法则库中的法则进行装配</p>
            </div>
        `;
    this.bindFateRingDelegates(rightPanel);

    // Bind Events (Library needs re-binding on update, Drag only on init - handled above)
    this.game.bindLibraryEvents();
    modal.classList.add('active');
  }
  renderCurrentPathInfo(ring) {
    if (!ring.path) return '';
    const path = FATE_RING.paths[ring.path];
    if (!path) return ''; // Guard against invalid path keys (e.g. 'undefined' string)
    return `
            <div class="ring-path-info">
                <div style="font-weight: bold; color: var(--accent-purple); margin-bottom: 5px;">
                    ${path.icon || '✨'} ${path.name}
                </div>
                <div style="font-size: 0.8rem; line-height: 1.4;">
                    ${path.description}
                </div>
                ${this.renderEvolveButton(ring)}
            </div>
        `;
  }
  renderCharacterSpecifics(ring) {
    if (ring.type === 'karma' && ring.getKarmaStatus) {
      const status = ring.getKarmaStatus();
      const meritPercent = status.merit / status.max * 100;
      const sinPercent = status.sin / status.max * 100;
      return `
                <div class="ring-specifics-panel" style="margin-top: 15px; border-top: 1px solid rgba(255,255,255,0.1); padding-top: 10px;">
                    <h4 style="color: var(--accent-gold); margin: 0 0 10px 0;">功德金轮</h4>
                    
                    <div style="margin-bottom: 8px;">
                        <div style="font-size: 0.8rem; display: flex; justify-content: space-between;">
                            <span>功德 (防御)</span>
                            <span>${status.merit}/${status.max}</span>
                        </div>
                        <div style="background: rgba(0,0,0,0.3); height: 6px; border-radius: 3px; overflow: hidden;">
                            <div style="width: ${meritPercent}%; background: #ffd700; height: 100%;"></div>
                        </div>
                    </div>
                    
                    <div>
                        <div style="font-size: 0.8rem; display: flex; justify-content: space-between;">
                            <span>业力 (攻击)</span>
                            <span>${status.sin}/${status.max}</span>
                        </div>
                        <div style="background: rgba(0,0,0,0.3); height: 6px; border-radius: 3px; overflow: hidden;">
                            <div style="width: ${sinPercent}%; background: #ff4d4d; height: 100%;"></div>
                        </div>
                    </div>
                    <div style="font-size: 0.7rem; color: #888; margin-top: 5px;">
                        满值触发【金刚法相】或【明王之怒】
                    </div>
                </div>
            `;
    }
    if (ring.type === 'analysis' && ring.analyzedTypes) {
      return `
                <div class="ring-specifics-panel" style="margin-top: 15px; border-top: 1px solid rgba(255,255,255,0.1); padding-top: 10px;">
                    <h4 style="color: var(--accent-blue); margin: 0 0 10px 0;">真理解析</h4>
                    <div style="font-size: 0.8rem; color: #ddd;">
                        已解析物种: <span style="color: var(--accent-gold);">${ring.analyzedTypes.length}</span>
                    </div>
                    <div style="display: flex; flex-wrap: wrap; gap: 4px; margin-top: 5px;">
                        ${ring.analyzedTypes.map(t => `<span style="background: rgba(255,255,255,0.1); padding: 2px 4px; border-radius: 2px; font-size: 0.7rem;">${t}</span>`).join('')}
                    </div>
                    ${ring.tacticalConfig && ring.tacticalConfig.damageVsType ? `
                        <div style="margin-top: 8px; font-size: 0.8rem; color: var(--accent-green);">
                            当前针对: <strong>${ring.tacticalConfig.damageVsType}</strong>
                            <br>(伤害 +${(ring.tacticalConfig.damageBonus * 100).toFixed(0)}%)
                        </div>
                    ` : '<div style="margin-top: 5px; font-size: 0.7rem; color: #666;">暂无针对目标</div>'}
                </div>
            `;
    }
    if (ring.type === 'sealed') {
      // 简单的状态提示
      const unlockedCount = ring.slots.filter(s => s.unlocked).length;
      return `
                <div class="ring-specifics-panel" style="margin-top: 15px; border-top: 1px solid rgba(255,255,255,0.1); padding-top: 10px;">
                    <h4 style="color: var(--accent-purple); margin: 0 0 5px 0;">逆生咒印</h4>
                    <div style="font-size: 0.8rem;">
                        解封进度: <span style="color: ${unlockedCount > 1 ? 'var(--accent-red)' : '#888'}">${unlockedCount}/12</span>
                    </div>
                    <div style="font-size: 0.7rem; color: #888; margin-top: 5px;">
                        点击锁定槽位以解除封印（需付出代价）
                    </div>
                </div>
             `;
    }
    return '';
  }
  renderEvolveButton(ring) {
    const available = getAvailablePaths(ring);
    if (available.length > 0 && ring.level > 0) {
      return `
                <button type="button" data-ring-action="show-evolve-options" 
                    style="width: 100%; margin-top: 10px; padding: 5px; background: rgba(255,215,0,0.2); border: 1px solid var(--accent-gold); color: var(--accent-gold); border-radius: 4px; cursor: pointer;">
                    🌟 命环进化
                </button>
            `;
    }
    return '';
  }
  renderLawLibrary(ring) {
    if (this.game.player.collectedLaws.length === 0) {
      return '<div style="padding: 20px; text-align: center; color: #666;">暂无法则</div>';
    }
    return `
            <div class="library-list-container">
            ${this.game.player.collectedLaws.map(law => {
      const isEquipped = ring.getSocketedLaws().includes(law.id);
      return `
                    <div class="law-item-row ${isEquipped ? 'equipped' : ''}" data-id="${law.id}">
                        <div class="law-icon-box">${law.icon}</div>
                        <div class="law-info">
                            <div class="law-name">${law.name}</div>
                            <div class="law-desc-mini">${(typeof getLawPassiveDescription === 'function' ? getLawPassiveDescription(law) : '') || law.description || '效果未知'}</div>
                        </div>
                        <div class="law-status-icon"></div>
                    </div>
                `;
    }).join('')}
            </div>
        `;
  }
  renderResonances(ring) {
    if (!LAW_RESONANCES || typeof LAW_RESONANCES !== 'object') return '';
    let activeResonances = [];
    let html = '';
    html += `<div class="section-label">共鸣检测</div>`;
    for (const key in LAW_RESONANCES) {
      const resonance = LAW_RESONANCES[key];
      const equippedLaws = ring.getSocketedLaws();
      const hasAllLaws = resonance.laws.every(lawId => equippedLaws.includes(lawId));

      // Calculate progress
      const matchCount = resonance.laws.filter(lawId => equippedLaws.includes(lawId)).length;
      const totalCount = resonance.laws.length;
      const progress = matchCount / totalCount * 100;
      if (matchCount > 0) {
        // Only show relevant ones
        html += `
                    <div class="resonance-card ${hasAllLaws ? 'active' : ''}" data-resonance-id="${resonance.id}">
                        <div class="resonance-header">
                            <span class="resonance-name">${resonance.name}</span>
                            <span style="font-size:0.8rem; color:${hasAllLaws ? 'var(--accent-gold)' : '#666'}">${matchCount}/${totalCount}</span>
                        </div>
                        <div style="font-size:0.8rem; color:#ccc; margin-bottom:5px;">${resonance.description}</div>
                        <div class="resonance-bar">
                            <div class="resonance-progress" style="width: ${progress}%"></div>
                        </div>
                    </div>
                `;
      }
    }
    if (html === `<div class="section-label">共鸣检测</div>`) {
      return `<div class="section-label">共鸣检测</div><div style="text-align:center; color:#666; font-size:0.8rem; padding:10px;">暂无共鸣迹象</div>`;
    }
    return html;
  }
  showEvolveOptions() {
    const modal = document.getElementById('ring-modal'); // 复用同一个modal，或者创建一个临时的覆盖层
    // 这里简单起见，我们直接在模态框里替换内容显示进化选项，或者弹出一个 alert/confirm 风格的选择

    const ring = this.game.player.fateRing;
    const availablePaths = getAvailablePaths(ring);
    if (availablePaths.length === 0) return;
    const slotsContainer = document.querySelector('.fate-ring-body');
    slotsContainer.innerHTML = `
            <div class="evolution-view">
                <h2 class="evolution-title">选择进化路径</h2>
                <div class="evolution-options-container">
                    ${availablePaths.map(path => `
                        <div class="evolution-path-card" data-ring-action="evolve-path" data-ring-path-id="${path.id}">
                            <div class="path-icon">${path.icon}</div>
                            <h3 class="path-name">${path.name}</h3>
                            <p class="path-desc">${path.description}</p>
                            <div class="path-select-hint">点击选择</div>
                        </div>
                    `).join('')}
                </div>
                <button class="evolution-back-btn" type="button" data-ring-action="show-ring-home">返回</button>
            </div>
         `;
    this.bindEvolutionDelegates(slotsContainer);
  }
  showEvolutionSelection(targetTier) {
    const modal = document.getElementById('event-modal');
    const titleEl = document.getElementById('event-title');
    const iconEl = document.getElementById('event-icon');
    const descEl = document.getElementById('event-desc');
    const choicesEl = document.getElementById('event-choices');
    if (!modal || !titleEl || !iconEl || !descEl || !choicesEl) return;
    titleEl.textContent = '命环进化';
    iconEl.textContent = '🧬';
    descEl.textContent = '你的命环因力量满盈而震颤，显化出数条进化的可能...';
    choicesEl.innerHTML = '';

    // 筛选可用路径
    const availablePaths = Object.values(FATE_RING.paths).filter(path => path.tier === targetTier && (!path.requires || path.requires.includes(this.game.player.fateRing.path)));

    // 如果是 Tier 3 (逆天之环)，特殊处理 requiresAny
    if (targetTier === 3) {
      const ultimatePath = FATE_RING.paths['defiance'];
      if (ultimatePath) availablePaths.push(ultimatePath);
    }
    availablePaths.forEach(path => {
      const btn = document.createElement('button');
      btn.className = 'event-choice';
      btn.innerHTML = `
    <div class="choice-icon">${path.icon || '✨'}</div>
        <div class="choice-content">
            <div class="choice-text">进化：${path.name}</div>
            <div class="choice-result">${path.description}</div>
        </div>
`;
      btn.addEventListener('click', () => {
        this.game.player.evolveFateRing(path.id);
        Utils.showBattleLog(`命环进化为：${path.name} `);
        modal.classList.remove('active');

        // 刷新UI
        if (document.getElementById('ring-modal').classList.contains('active')) {
          this.showFateRing();
        }
      });
      choicesEl.appendChild(btn);
    });
    modal.classList.add('active');
  }
  bindFateRingDelegates(rightPanel) {
    if (!rightPanel || rightPanel.__fateRingDelegatesBound) return;
    rightPanel.addEventListener('click', event => {
      const target = event.target;
      if (!target || typeof target.closest !== 'function') return;
      const actionNode = target.closest('[data-ring-action]');
      if (!actionNode || actionNode.disabled || !rightPanel.contains(actionNode)) return;
      const action = String(actionNode.dataset.ringAction || '');
      if (action === 'switch-tab') {
        const tabName = String(actionNode.dataset.ringTab || 'library');
        this.game.switchRingTab(actionNode, tabName);
        return;
      }
      if (action === 'show-evolve-options') {
        this.game.showEvolveOptions();
      }
    });
    rightPanel.__fateRingDelegatesBound = true;
  }
  bindEvolutionDelegates(slotsContainer) {
    if (!slotsContainer || slotsContainer.__fateRingEvolutionDelegatesBound) return;
    slotsContainer.addEventListener('click', event => {
      const target = event.target;
      if (!target || typeof target.closest !== 'function') return;
      const actionNode = target.closest('[data-ring-action]');
      if (!actionNode || actionNode.disabled || !slotsContainer.contains(actionNode)) return;
      const action = String(actionNode.dataset.ringAction || '');
      if (action === 'evolve-path') {
        const pathId = String(actionNode.dataset.ringPathId || '');
        if (pathId) {
          this.game.evolveFateRing(pathId);
        }
        return;
      }
      if (action === 'show-ring-home') {
        this.game.showFateRing();
      }
    });
    slotsContainer.__fateRingEvolutionDelegatesBound = true;
  }
}
if (typeof window !== 'undefined') {}
