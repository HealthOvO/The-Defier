import { escapeAttr, escapeHtml } from "../core/safe-html.js";
import { CHARACTERS } from "../data/index.js";
export class CharacterSelectView {
  constructor(gameInstance) {
    this.game = gameInstance;
  }
  isAvatarAssetPath(value) {
    return typeof value === 'string' && (value.includes('/') || /\.[a-z0-9]{2,5}($|\?)/i.test(value));
  }
  resolveCharacterPortrait(char = {}) {
    const candidates = [char.image, char.portrait, char.avatar];
    const imagePath = candidates.find(value => this.isAvatarAssetPath(value)) || '';
    const fallbackText = char.fallbackAvatar || (!this.isAvatarAssetPath(char.avatar) ? char.avatar : '') || '✦';
    return {
      imagePath,
      fallbackText
    };
  }
  bindCharacterSelectionEvents(container) {
    if (!container || container.dataset.selectionBound === 'true') return;
    container.addEventListener('click', event => {
      const destinyCard = event.target.closest('[data-run-destiny-id]');
      if (destinyCard && container.contains(destinyCard)) {
        this.selectRunDestiny(destinyCard.dataset.runDestinyId || '');
        return;
      }
      const spiritCard = event.target.closest('[data-spirit-id]');
      if (spiritCard && container.contains(spiritCard)) {
        this.selectSpiritCompanion(spiritCard.dataset.spiritId || '');
        return;
      }
      const runPathCard = event.target.closest('[data-run-path-id]');
      if (runPathCard && container.contains(runPathCard)) {
        this.selectRunPath(runPathCard.dataset.runPathId || '');
        return;
      }
      const characterCard = event.target.closest('.character-card[data-id]');
      if (!characterCard || !container.contains(characterCard) || characterCard.classList.contains('locked')) return;
      this.selectCharacter(characterCard.dataset.id || '');
    });
    container.addEventListener('error', event => {
      const target = event.target;
      if (typeof HTMLImageElement === 'undefined' || !(target instanceof HTMLImageElement) || !target.classList.contains('char-avatar-img')) return;
      target.style.display = 'none';
      const fallback = target.nextElementSibling;
      if (fallback && fallback.classList.contains('char-avatar-emoji')) {
        fallback.style.display = 'flex';
      }
    }, true);
    container.dataset.selectionBound = 'true';
  }
  renderRunDestinySelection(characterId) {
    const host = document.getElementById('run-destiny-selection');
    const summary = document.getElementById('run-destiny-summary');
    if (!host) return;
    const charId = typeof characterId === 'string' ? characterId : this.game.selectedCharacterId;
    if (!charId) {
      host.innerHTML = '<div class="run-destiny-empty">先选定一位角色，再感应这一局的命格。</div>';
      if (summary) summary.textContent = '命格会决定这一轮的开局气质、资源节奏与战斗风格。';
      return;
    }
    const draftIds = this.game.draftRunDestiniesForCharacter(charId);
    if (!draftIds.includes(this.game.selectedRunDestinyId)) {
      this.game.selectedRunDestinyId = draftIds[0] || null;
    }
    host.innerHTML = draftIds.map(destinyId => {
      const meta = this.game.getRunDestinyMetaById(destinyId, 1);
      if (!meta) return '';
      const selectedClass = destinyId === this.game.selectedRunDestinyId ? 'selected' : '';
      const effectTags = [];
      const effects = meta.effects || {};
      if (Number(effects.firstTurnDraw) > 0) effectTags.push(`首回合抽牌 +${Math.floor(Number(effects.firstTurnDraw) || 0)}`);
      if (Number(effects.firstTurnEnergy) > 0) effectTags.push(`首回合灵力 +${Math.floor(Number(effects.firstTurnEnergy) || 0)}`);
      if (Number(effects.openingBlock) > 0) effectTags.push(`开场护盾 +${Math.floor(Number(effects.openingBlock) || 0)}`);
      if (Number(effects.firstAttackBonusPerBattle) > 0) effectTags.push(`首击增伤 +${Math.floor(Number(effects.firstAttackBonusPerBattle) || 0)}`);
      if (Number(effects.firstSkillDrawPerTurn) > 0) effectTags.push(`首个技能抽牌 +${Math.floor(Number(effects.firstSkillDrawPerTurn) || 0)}`);
      if (Number(effects.overhealToBlockRatio) > 0) effectTags.push(`溢疗转盾 x${Number(effects.overhealToBlockRatio).toFixed(1)}`);
      return `
                <button type="button"
                        class="run-destiny-card ${selectedClass}"
                        data-run-destiny-id="${escapeAttr(meta.id)}"
                        data-destiny-id="${escapeAttr(meta.id)}">
                    <div class="run-destiny-head">
                        <span class="run-destiny-icon">${escapeHtml(meta.icon)}</span>
                        <div class="run-destiny-title-group">
                            <span class="run-destiny-name">${escapeHtml(meta.name)}</span>
                            <span class="run-destiny-tier">${escapeHtml(meta.category)} · ${escapeHtml(meta.tierLabel)}</span>
                        </div>
                    </div>
                    <div class="run-destiny-desc">${escapeHtml(meta.description)}</div>
                    <div class="run-destiny-summary">${escapeHtml(meta.summary)}</div>
                    <div class="run-destiny-tags">
                        ${effectTags.slice(0, 3).map(tag => `<span class="run-destiny-tag">${escapeHtml(tag)}</span>`).join('')}
                    </div>
                </button>
            `;
    }).join('');
    const selectedMeta = this.game.getRunDestinyMetaById(this.game.selectedRunDestinyId, 1);
    if (summary) {
      summary.textContent = selectedMeta ? `已感应命格「${selectedMeta.name}」：${selectedMeta.playstyle || selectedMeta.summary || selectedMeta.description}` : '命格会决定这一轮的开局气质、资源节奏与战斗风格。';
    }
  }
  renderSpiritCompanionSelection(characterId) {
    const host = document.getElementById('spirit-companion-selection');
    const summary = document.getElementById('spirit-companion-summary');
    if (!host) return;
    const charId = typeof characterId === 'string' ? characterId : this.game.selectedCharacterId;
    if (!charId) {
      host.innerHTML = '<div class="run-destiny-empty">先选定一位角色，再决定与你同行的灵契。</div>';
      if (summary) summary.textContent = '灵契提供常驻被动与蓄能主动，会补足这局的关键短板。';
      return;
    }
    const draftIds = this.game.draftSpiritCompanionsForCharacter(charId);
    if (!draftIds.includes(this.game.selectedSpiritCompanionId)) {
      this.game.selectedSpiritCompanionId = draftIds[0] || null;
    }
    host.innerHTML = draftIds.map(spiritId => {
      const meta = this.game.getSpiritCompanionMetaById(spiritId, 1);
      if (!meta) return '';
      const selectedClass = spiritId === this.game.selectedSpiritCompanionId ? 'selected' : '';
      const tags = [];
      if (meta.passiveLabel) tags.push(`被动·${meta.passiveLabel}`);
      if (meta.activeLabel) tags.push(`主动·${meta.activeLabel}`);
      tags.push(`蓄能 ${meta.chargeMax}`);
      return `
                <button type="button"
                        class="run-destiny-card run-spirit-card ${selectedClass}"
                        data-spirit-id="${escapeAttr(meta.id)}">
                    <div class="run-destiny-head">
                        <span class="run-destiny-icon">${escapeHtml(meta.icon)}</span>
                        <div class="run-destiny-title-group">
                            <span class="run-destiny-name">${escapeHtml(meta.name)}</span>
                            <span class="run-destiny-tier">${escapeHtml(meta.title || `${meta.category} · ${meta.tierLabel}`)}</span>
                        </div>
                    </div>
                    <div class="run-destiny-desc">${escapeHtml(meta.description)}</div>
                    <div class="run-destiny-summary">${escapeHtml(meta.passiveDesc)}<br>${escapeHtml(meta.activeDesc)}</div>
                    <div class="run-destiny-tags">
                        ${tags.map(tag => `<span class="run-destiny-tag">${escapeHtml(tag)}</span>`).join('')}
                    </div>
                </button>
            `;
    }).join('');
    const selectedMeta = this.game.getSpiritCompanionMetaById(this.game.selectedSpiritCompanionId, 1);
    if (summary) {
      summary.textContent = selectedMeta ? `已契合灵契「${selectedMeta.name}」：${selectedMeta.playstyle || selectedMeta.summary || selectedMeta.description}` : '灵契提供常驻被动与蓄能主动，会补足这局的关键短板。';
    }
  }
  updateCharacterSelectionConfirmState() {
    const confirmBtn = document.getElementById('confirm-character-btn');
    if (!confirmBtn) return;
    confirmBtn.disabled = !this.game.selectedCharacterId || !this.game.selectedRunDestinyId || !this.game.selectedSpiritCompanionId || !this.game.selectedRunPathId;
  }
  selectRunDestiny(destinyId) {
    const meta = this.game.getRunDestinyMetaById(destinyId, 1);
    if (!meta) return;
    this.game.selectedRunDestinyId = destinyId;
    this.renderRunDestinySelection(this.game.selectedCharacterId);
    this.updateCharacterSelectionConfirmState();
  }
  selectSpiritCompanion(spiritId) {
    const meta = this.game.getSpiritCompanionMetaById(spiritId, 1);
    if (!meta) return;
    this.game.selectedSpiritCompanionId = spiritId;
    this.renderSpiritCompanionSelection(this.game.selectedCharacterId);
    this.updateCharacterSelectionConfirmState();
  }
  renderRunPathSelection(characterId) {
    const host = document.getElementById('run-path-selection');
    const summary = document.getElementById('run-path-summary');
    if (!host) return;
    const charId = typeof characterId === 'string' ? characterId : this.game.selectedCharacterId;
    if (!charId) {
      host.innerHTML = '<div class="run-destiny-empty">先选定一位角色，再决定这一轮的命途主线。</div>';
      if (summary) summary.textContent = '命途会给这一轮提供清晰的阶段目标、路线倾向与战斗被动。';
      return;
    }
    const draftIds = this.game.draftRunPathsForCharacter(charId);
    if (!draftIds.includes(this.game.selectedRunPathId)) {
      this.game.selectedRunPathId = draftIds[0] || null;
    }
    host.innerHTML = draftIds.map(pathId => {
      const meta = this.game.getRunPathMetaById(pathId);
      if (!meta) return '';
      const selectedClass = pathId === this.game.selectedRunPathId ? 'selected' : '';
      const phaseTags = meta.phases.slice(0, 3).map(phase => `${phase.label}·${phase.title}`);
      return `
                <button type="button"
                        class="run-destiny-card run-path-card ${selectedClass}"
                        data-run-path-id="${escapeAttr(meta.id)}">
                    <div class="run-destiny-head">
                        <span class="run-destiny-icon">${escapeHtml(meta.icon)}</span>
                        <div class="run-destiny-title-group">
                            <span class="run-destiny-name">${escapeHtml(meta.name)}</span>
                            <span class="run-destiny-tier">${escapeHtml(meta.category)} · ${escapeHtml(meta.routeHint || '命途主线')}</span>
                        </div>
                    </div>
                    <div class="run-destiny-desc">${escapeHtml(meta.description)}</div>
                    <div class="run-destiny-summary">${escapeHtml(meta.playstyle)}</div>
                    <div class="run-destiny-tags">
                        ${phaseTags.map(tag => `<span class="run-destiny-tag">${escapeHtml(tag)}</span>`).join('')}
                    </div>
                </button>
            `;
    }).join('');
    const selectedMeta = this.game.getRunPathMetaById(this.game.selectedRunPathId);
    if (summary) {
      summary.textContent = selectedMeta ? `已选命途「${selectedMeta.name}」：${selectedMeta.playstyle || selectedMeta.description}` : '命途会给这一轮提供清晰的阶段目标、路线倾向与战斗被动。';
    }
  }
  selectRunPath(pathId) {
    const meta = this.game.getRunPathMetaById(pathId);
    if (!meta) return;
    this.game.selectedRunPathId = pathId;
    this.renderRunPathSelection(this.game.selectedCharacterId);
    this.updateCharacterSelectionConfirmState();
  }
  showCharacterSelection() {
    this.game.selectedCharacterId = null;
    this.game.selectedRunDestinyId = null;
    this.game.selectedSpiritCompanionId = null;
    this.game.selectedRunPathId = null;
    const container = document.getElementById('character-selection-container');
    if (container) {
      container.innerHTML = '';

      // 剧情背景
      const introDiv = document.createElement('div');
      introDiv.className = 'story-intro';
      introDiv.innerHTML = `
                <p><strong>背景设定：</strong></p>
                <p>“命环”，乃天道为万物众生设下的枷锁，意在限制潜力，维持统治。</p>
                <p>然而天道亦有善恶，善念留下一线生机，即为“逆命者”。</p>
                <p>恶念化身天道之主，对此大为震怒，封印善念，并派遣“天罚者”猎杀逆命之人。</p>
                <p>如今，你作为新的逆命者觉醒，需在天罚者的追猎下不断突破命环，最终斩杀恶道，解放众生。</p>
            `;
      container.appendChild(introDiv);
      const cardsContainer = document.createElement('div');
      cardsContainer.className = 'character-cards-wrapper';
      for (const charId in CHARACTERS) {
        const char = CHARACTERS[charId];
        const identityProfile = this.game.getCharacterIdentityProfile(charId);

        // Check if character is locked
        let locked = false;
        let lockReason = '';
        // Simple unlock logic (example)
        if (charId !== 'linFeng' && charId !== 'xiangYe' && charId !== 'yanHan' && charId !== 'wuYu') {
          // locked = true; // Default lock logic if needed
        }
        const card = document.createElement('div');
        card.className = `character-card ${locked ? 'locked' : ''}`;
        card.dataset.id = charId;

        const portrait = this.resolveCharacterPortrait(char);
        let avatarHtml = '';
        if (portrait.imagePath) {
          avatarHtml = `<img src="${escapeAttr(portrait.imagePath)}" class="char-avatar-img" alt="${escapeAttr(char.name)}" data-fallback-emoji="true">
                                  <span class="char-avatar-emoji" style="display:none">${escapeHtml(portrait.fallbackText)}</span>`;
        } else {
          avatarHtml = `<span class="char-avatar-emoji">${escapeHtml(portrait.fallbackText)}</span>`;
        }
        card.innerHTML = `
                    <div class="selected-mark">✔</div>
                    <div class="card-inner">
                        <div class="char-header">
                            <div class="char-ink-bg">✦</div>
                            <div class="char-avatar-wrapper">
                                ${avatarHtml}
                            </div>
                        </div>
                        <div class="char-body">
                            <div class="char-name">${escapeHtml(char.name)}</div>
                            <div class="char-title">${escapeHtml(char.title)}</div>
                            <div class="char-desc">${escapeHtml(char.description)}</div>
                            <div class="char-identity-strip">
                                <span class="char-identity-pill primary">${escapeHtml(identityProfile?.unlockLabel || '已解锁')}</span>
                                <span class="char-identity-pill">${escapeHtml(identityProfile?.recommendedDestinyText || '待推演')}</span>
                                <span class="char-identity-pill">${escapeHtml(identityProfile?.recommendedSpiritText || '待追索')}</span>
                            </div>
                            <div class="char-keyword-strip">
                                ${(identityProfile?.keywords || []).map(keyword => `<span class="char-keyword-chip">${escapeHtml(keyword)}</span>`).join('')}
                            </div>
                            <div class="char-story-panel">
                                <div class="char-story-line"><strong>剧情简介：</strong>${escapeHtml(identityProfile?.synopsis || char.description)}</div>
                                <div class="char-story-line"><strong>推荐玩法：</strong>${escapeHtml(identityProfile?.identityHook || '围绕角色专属节奏推进本局。')}</div>
                                <div class="char-story-line"><strong>角色专线：</strong>${escapeHtml(identityProfile?.exclusiveLine?.summary || '更多专属内容等待追索。')}</div>
                                <div class="char-story-line muted"><strong>解锁进度：</strong>${escapeHtml(identityProfile?.unlockHint || (locked ? lockReason : '已满足出阵条件。'))}</div>
                            </div>
                            
                            <div class="char-relic-info">
                                <div class="relic-name"><span>🔮</span> ${escapeHtml(char.relic.name)}</div>
                                <div class="relic-desc">${escapeHtml(char.relic.desc)}</div>
                            </div>
                            
                            <div class="char-stats-preview">
                                <div class="stat-item">
                                    <span class="stat-value">${escapeHtml(char.stats.maxHp)}</span>
                                    <span class="stat-label">HP</span>
                                </div>
                                <div class="stat-item">
                                    <span class="stat-value">${escapeHtml(char.stats.energy)}</span>
                                    <span class="stat-label">灵力</span>
                                </div>
                                <div class="stat-item">
                                    <span class="stat-value">${escapeHtml(char.stats.draw || 5)}</span>
                                    <span class="stat-label">抽牌</span>
                                </div>
                            </div>
                        </div>
                    </div>
                `;
        cardsContainer.appendChild(card);
      }
      container.appendChild(cardsContainer);
      const destinySection = document.createElement('section');
      destinySection.className = 'run-destiny-section';
      destinySection.innerHTML = `
                <div class="run-destiny-header">
                    <div>
                        <span class="run-destiny-kicker">开局命格</span>
                        <h3>命轮初启 · 三选其一</h3>
                    </div>
                    <p id="run-destiny-summary">命格会决定这一轮的开局气质、资源节奏与战斗风格。</p>
                </div>
                <div class="run-destiny-grid" id="run-destiny-selection">
                    <div class="run-destiny-empty">先选定一位角色，再感应这一局的命格。</div>
                </div>
            `;
      container.appendChild(destinySection);
      const spiritSection = document.createElement('section');
      spiritSection.className = 'run-destiny-section run-spirit-section';
      spiritSection.innerHTML = `
                <div class="run-destiny-header">
                    <div>
                        <span class="run-destiny-kicker">同行灵契</span>
                        <h3>护道灵契 · 三选其一</h3>
                    </div>
                    <p id="spirit-companion-summary">灵契提供常驻被动与蓄能主动，会补足这局的关键短板。</p>
                </div>
                <div class="run-destiny-grid" id="spirit-companion-selection">
                    <div class="run-destiny-empty">先选定一位角色，再决定与你同行的灵契。</div>
                </div>
            `;
      container.appendChild(spiritSection);
      const runPathSection = document.createElement('section');
      runPathSection.className = 'run-destiny-section run-path-section';
      runPathSection.innerHTML = `
                <div class="run-destiny-header">
                    <div>
                        <span class="run-destiny-kicker">本轮命途</span>
                        <h3>命途主线 · 三择其一</h3>
                    </div>
                    <p id="run-path-summary">命途会给这一轮提供清晰的阶段目标、路线倾向与战斗被动。</p>
                </div>
                <div class="run-destiny-grid" id="run-path-selection">
                    <div class="run-destiny-empty">先选定一位角色，再决定这一轮的命途主线。</div>
                </div>
            `;
      container.appendChild(runPathSection);
    }
    this.bindCharacterSelectionEvents(container);
    this.updateCharacterSelectionConfirmState();
    this.game.showScreen('character-selection-screen');
  }
  selectCharacter(charId) {
    this.game.selectedCharacterId = charId;
    const cards = document.querySelectorAll('.character-card');
    cards.forEach(c => {
      if (c.dataset.id === charId) c.classList.add('selected');else c.classList.remove('selected');
    });
    this.renderRunDestinySelection(charId);
    this.renderSpiritCompanionSelection(charId);
    this.renderRunPathSelection(charId);
    this.updateCharacterSelectionConfirmState();
  }
  confirmCharacterSelection() {
    if (!this.game.selectedCharacterId) return;

    // 云功能可用时才强制登录
    if (this.game.shouldForceCloudLogin()) {
      this.game.showLoginModal();
      return;
    }

    // 清除旧存档，开始新游戏
    this.game.clearSave({
      // Endless collapse already wrote a season verdict result; keep the meta for this session.
      preserveSeasonMeta: this.game.isEndlessActive()
    });
    this.game.startNewGame(this.game.selectedCharacterId, {
      runDestinyId: this.game.selectedRunDestinyId || this.game.resolveDefaultRunDestinyId(this.game.selectedCharacterId),
      spiritCompanionId: this.game.selectedSpiritCompanionId || this.game.resolveDefaultSpiritCompanionId(this.game.selectedCharacterId),
      runPathId: this.game.selectedRunPathId || this.game.resolveDefaultRunPathId(this.game.selectedCharacterId)
    });
  }
}
if (typeof window !== 'undefined') {}
