export class CampfireView {
    constructor(gameInstance) {
        this.game = gameInstance;
    }

    showCampfire(node) {
        this.game.campfireNode = node;

        // 使用事件弹窗显示营地选项
        const modal = document.getElementById('event-modal');
        const iconEl = document.getElementById('event-icon');
        const titleEl = document.getElementById('event-title');
        const descEl = document.getElementById('event-desc');
        const choicesEl = document.getElementById('event-choices');
        if (!modal || !iconEl || !titleEl || !descEl || !choicesEl) return;
        iconEl.textContent = '🏕️';
        titleEl.textContent = '野外营地';
        descEl.textContent = '你找到了一个安全的休息地点，可以在这里恢复精力或磨练技艺...';
        choicesEl.innerHTML = '';

        // 选项1: 休息恢复HP
        const healAmount = Math.floor(this.game.player.maxHp * 0.2);
        const restBtn = document.createElement('button');
        restBtn.className = 'event-choice';
        restBtn.innerHTML = `
            <div>💤 休息(恢复 ${healAmount} HP)</div>
            <div class="choice-effect">当前HP: ${this.game.player.currentHp}/${this.game.player.maxHp}</div>
        `;
        restBtn.onclick = () => this.campfireRest();
        choicesEl.appendChild(restBtn);

        // 选项2: 升级卡牌
        const upgradableCount = this.game.player.deck.filter(c => canUpgradeCard(c)).length;
        const upgradeBtn = document.createElement('button');
        upgradeBtn.className = 'event-choice';
        upgradeBtn.innerHTML = `
            <div>⬆️ 升级卡牌</div>
            <div class="choice-effect">可升级: ${upgradableCount} 张</div>
        `;
        if (upgradableCount > 0) {
            upgradeBtn.onclick = () => this.showCampfireUpgrade();
        } else {
            upgradeBtn.classList.add('disabled');
            upgradeBtn.style.opacity = '0.5';
            upgradeBtn.style.cursor = 'not-allowed';
        }
        choicesEl.appendChild(upgradeBtn);

        // 选项3: 战术演练（未来两战首回合额外抽牌）
        const drillBtn = document.createElement('button');
        drillBtn.className = 'event-choice';
        drillBtn.innerHTML = `
            <div>📘 战术演练</div>
            <div class="choice-effect">接下来 2 场战斗：首回合额外抽 1 张牌，并获得命环经验</div>
        `;
        drillBtn.onclick = () => this.campfireDrill();
        choicesEl.appendChild(drillBtn);

        // 选项4: 布设结界（未来两战开场护盾）
        const wardBtn = document.createElement('button');
        wardBtn.className = 'event-choice';
        wardBtn.innerHTML = `
            <div>🧿 布设结界</div>
            <div class="choice-effect">接下来 2 场战斗：开场获得 10 护盾</div>
        `;
        wardBtn.onclick = () => this.campfireWard();
        choicesEl.appendChild(wardBtn);

        const bountyBtn = document.createElement('button');
        bountyBtn.className = 'event-choice';
        bountyBtn.innerHTML = `
            <div>📜 悬赏部署</div>
            <div class="choice-effect">接下来 2 场战斗：胜利额外获得灵石</div>
        `;
        bountyBtn.onclick = () => this.campfireBounty();
        choicesEl.appendChild(bountyBtn);

        const pulseBtn = document.createElement('button');
        pulseBtn.className = 'event-choice';
        pulseBtn.innerHTML = `
            <div>⚡ 灵息调和</div>
            <div class="choice-effect">接下来 2 场战斗：首回合灵力 +1</div>
        `;
        pulseBtn.onclick = () => this.campfirePulse();
        choicesEl.appendChild(pulseBtn);

        const medicBtn = document.createElement('button');
        medicBtn.className = 'event-choice';
        medicBtn.innerHTML = `
            <div>🩹 战地整备</div>
            <div class="choice-effect">接下来 2 场战斗：胜利后恢复生命</div>
        `;
        medicBtn.onclick = () => this.campfireMedic();
        choicesEl.appendChild(medicBtn);

        const insightCostHp = Math.max(6, Math.floor(this.game.player.maxHp * 0.1));
        const insightBtn = document.createElement('button');
        insightBtn.className = 'event-choice';
        insightBtn.innerHTML = `
            <div>🕯️ 逆炼冥想（-${insightCostHp} HP）</div>
            <div class="choice-effect">接下来 3 场战斗：命环经验额外 +30%</div>
        `;
        if (this.game.player.currentHp > insightCostHp + 1) {
            insightBtn.onclick = () => this.campfireInsight(insightCostHp);
        } else {
            insightBtn.classList.add('disabled');
            insightBtn.style.opacity = '0.5';
            insightBtn.style.cursor = 'not-allowed';
        }
        choicesEl.appendChild(insightBtn);

        // 选项5: 移除卡牌（如果牌组足够大）
        if (this.game.player.deck.length > 5) {
            const removeBtn = document.createElement('button');
            removeBtn.className = 'event-choice';
            removeBtn.innerHTML = `
                <div>🗑️ 净化(移除一张牌)</div>
                <div class="choice-effect">精简牌组，提升效率</div>
            `;
            removeBtn.onclick = () => this.showCampfireRemove();
            choicesEl.appendChild(removeBtn);
        }

        modal.classList.add('active');
    }

    campfireRest() {
        const healAmount = Math.max(1, Math.floor(this.game.player.maxHp * 0.2 * this.game.getEndlessHealingMultiplier()));
        this.game.player.heal(healAmount);
        Utils.showBattleLog(`休息恢复 ${healAmount} 点生命！`);

        this.game.closeModal();
        this.completeCampfire();
    }

    campfireDrill() {
        if (typeof this.game.player.grantAdventureBuff === 'function') {
            this.game.player.grantAdventureBuff('firstTurnDrawBoostBattles', 2);
        }
        this.game.player.fateRing.exp += 20;
        this.game.player.checkFateRingLevelUp();
        Utils.showBattleLog('营地演练完成：接下来 2 场战斗首回合额外抽牌，命环经验 +20');
        this.game.closeModal();
        this.completeCampfire();
    }

    campfireWard() {
        if (typeof this.game.player.grantAdventureBuff === 'function') {
            this.game.player.grantAdventureBuff('openingBlockBoostBattles', 2);
        }
        Utils.showBattleLog('营地结界生效：接下来 2 场战斗开场护盾 +10');
        this.game.closeModal();
        this.completeCampfire();
    }

    campfireBounty() {
        if (typeof this.game.player.grantAdventureBuff === 'function') {
            this.game.player.grantAdventureBuff('victoryGoldBoostBattles', 2);
        }
        this.game.player.fateRing.exp += 12;
        this.game.player.checkFateRingLevelUp();
        Utils.showBattleLog('悬赏部署完成：接下来 2 场战斗胜利额外灵石，命环经验 +12');
        this.game.closeModal();
        this.completeCampfire();
    }

    campfirePulse() {
        if (typeof this.game.player.grantAdventureBuff === 'function') {
            this.game.player.grantAdventureBuff('firstTurnEnergyBoostBattles', 2);
        }
        Utils.showBattleLog('灵息调和完成：接下来 2 场战斗首回合灵力 +1');
        this.game.closeModal();
        this.completeCampfire();
    }

    campfireMedic() {
        if (typeof this.game.player.grantAdventureBuff === 'function') {
            this.game.player.grantAdventureBuff('victoryHealBoostBattles', 2);
        }
        this.game.player.fateRing.exp += 10;
        this.game.player.checkFateRingLevelUp();
        Utils.showBattleLog('战地整备完成：接下来 2 场战斗胜利后恢复生命，命环经验 +10');
        this.game.closeModal();
        this.completeCampfire();
    }

    campfireInsight(costHp = 8) {
        const hpCost = Math.max(1, Math.floor(Number(costHp) || 8));
        this.game.player.currentHp = Math.max(1, this.game.player.currentHp - hpCost);
        if (typeof this.game.player.grantAdventureBuff === 'function') {
            this.game.player.grantAdventureBuff('ringExpBoostBattles', 3);
        }
        Utils.showBattleLog(`逆炼冥想成功：失去 ${hpCost} 生命，接下来 3 场战斗命环经验额外提升`);
        this.game.closeModal();
        this.completeCampfire();
    }

    showCampfireUpgrade() {
        this.game.closeModal();

        const modal = document.getElementById('deck-modal');
        // Add specific class for styling override (no scroll on parent)
        modal.classList.add('upgrade-mode');

        // Ensure we remove this class when modal closes (simple patch: override the close button or handle in general close)
        // For now, let's attach a one-time listener to the close button to remove the class
        const closeBtn = modal.querySelector('.close-btn');
        if (closeBtn) {
            closeBtn.onclick = () => {
                modal.classList.remove('upgrade-mode');
                this.game.closeModal();
            };
        }
        const container = document.getElementById('deck-view-cards');

        // Reset Modal State
        container.innerHTML = '';
        container.style.display = 'block'; // Reset flex styles from previous usage

        // --- 1. Main Layout Container ---
        const layout = document.createElement('div');
        layout.className = 'upgrade-modal-layout';

        // --- 2. Left: Card Grid ---
        const cardGrid = document.createElement('div');
        cardGrid.className = 'upgrade-card-grid';

        // --- 3. Right: Preview Panel ---
        const previewPanel = document.createElement('div');
        previewPanel.className = 'upgrade-preview-panel';
        previewPanel.innerHTML = `
            <div class="preview-title">悟道演练</div>
            <div class="preview-placeholder" id="ug-preview-placeholder">
                <span style="font-size:3rem; display:block; margin-bottom:20px; opacity:0.3">👆</span>
                点击左侧卡牌<br>推演进阶效果
            </div>
            
            <div id="ug-preview-content" style="display:none; width:100%; flex-direction:column; align-items:center;">
                <div class="preview-card-container" id="ug-preview-card"></div>
                
                <div class="preview-diff-box" id="ug-diff-box">
                    <!-- Dynamic Rows -->
                </div>

                <button class="confirm-upgrade-btn" id="ug-confirm-btn" disabled>
                    <span class="btn-text">注灵进阶</span>
                </button>
            </div>
        `;

        layout.appendChild(cardGrid);
        layout.appendChild(previewPanel);
        container.appendChild(layout);

        // --- 4. Logic & Interaction ---
        const placeholder = previewPanel.querySelector('#ug-preview-placeholder');
        const contentArea = previewPanel.querySelector('#ug-preview-content');
        const cardContainer = previewPanel.querySelector('#ug-preview-card');
        const diffBox = previewPanel.querySelector('#ug-diff-box');
        const confirmBtn = previewPanel.querySelector('#ug-confirm-btn');

        let selectedIndex = -1;
        let selectedCard = null;

        // Render Cards
        this.game.player.deck.forEach((card, index) => {
            if (!canUpgradeCard(card)) return; // Only show upgradable

            // Create standard card
            const cardEl = Utils.createCardElement(card, index);

            // Interaction
            cardEl.addEventListener('click', () => {
                // Audio
                if (typeof audioManager !== 'undefined') audioManager.playSFX('click');

                // Highlight Selection
                cardGrid.querySelectorAll('.card').forEach(c => c.classList.remove('selected'));
                cardEl.classList.add('selected');

                selectedIndex = index;
                selectedCard = card;

                // Show Preview
                this.updateUpgradePreview(card, placeholder, contentArea, cardContainer, diffBox, confirmBtn);
            });

            cardGrid.appendChild(cardEl);
        });

        // Bind Confirm
        confirmBtn.onclick = () => {
            if (selectedIndex === -1) return;

            // Audio
            if (typeof audioManager !== 'undefined') audioManager.playSFX('powerup'); // Or 'upgrade'

            // Visual Effect
            const overlay = document.createElement('div');
            overlay.className = 'upgrade-flash-overlay';
            container.appendChild(overlay);

            // Execute Logic
            setTimeout(() => {
                const upgradedCard = upgradeCard(selectedCard);
                // Replace in deck (must handle reference carefully or splice)
                // Assuming deck is array of objects
                this.game.player.deck[selectedIndex] = upgradedCard;

                this.game.closeModal();
                this.completeCampfire();
            }, 500);
        };

        modal.classList.add('active');

        // Update Title (Optional override)
        const title = modal.querySelector('h2');
        if (title) title.textContent = '🔥 营地 | 悟道进阶';
    }

    updateUpgradePreview(card, placeholder, contentArea, cardContainer, diffBox, confirmBtn) {
        placeholder.style.display = 'none';
        contentArea.style.display = 'flex';
        confirmBtn.disabled = false;

        // Generate Upgraded Version
        const upgraded = upgradeCard(card);

        // 1. Render Card Visual
        cardContainer.innerHTML = '';
        const upgradedEl = Utils.createCardElement(upgraded, 999);
        // Remove hover effects on preview card to keep it static
        upgradedEl.style.transform = 'none';
        upgradedEl.style.pointerEvents = 'none';
        cardContainer.appendChild(upgradedEl);

        // 2. Diff Logic
        let diffHtml = '';

        // Name Diff (if changed)
        if (card.name !== upgraded.name) {
            diffHtml += `
                <div class="diff-row">
                    <span class="diff-label">名讳</span>
                    <div>
                        <span class="diff-val-old">${card.name}</span>
                        <span class="diff-val-new"> ➤ ${upgraded.name}</span>
                    </div>
                </div>`;
        }

        // Damage Diff
        if (card.damage !== upgraded.damage && upgraded.damage) {
            diffHtml += `
                <div class="diff-row">
                    <span class="diff-label">威力</span>
                    <div>
                        <span class="diff-val-old">${card.damage || 0}</span>
                        <span class="diff-val-new"> ➤ ${upgraded.damage}</span>
                    </div>
                </div>`;
        }

        // Block Diff
        if (card.block !== upgraded.block && upgraded.block) {
            diffHtml += `
                <div class="diff-row">
                    <span class="diff-label">护盾</span>
                    <div>
                        <span class="diff-val-old">${card.block || 0}</span>
                        <span class="diff-val-new"> ➤ ${upgraded.block}</span>
                    </div>
                </div>`;
        }

        // Cost Diff
        if (card.cost !== upgraded.cost) {
            diffHtml += `
                <div class="diff-row">
                    <span class="diff-label">消耗</span>
                    <div>
                        <span class="diff-val-old">${card.cost}</span>
                        <span class="diff-val-new"> ➤ ${upgraded.cost}</span>
                    </div>
                </div>`;
        }

        // Description Diff (Always show as summary)
        diffHtml += `
            <div class="diff-row" style="flex-direction:column; border:none; margin-top:5px;">
                <span class="diff-label" style="margin-bottom:2px;">效果演变</span>
                <span class="diff-val-new" style="font-size:0.85rem; line-height:1.4">${upgraded.description}</span>
            </div>
        `;

        diffBox.innerHTML = diffHtml;
    }

    campfireUpgradeCard(index) {
        const card = this.game.player.deck[index];
        if (!canUpgradeCard(card)) return;

        const upgraded = upgradeCard(card);
        this.game.player.deck[index] = upgraded;

        Utils.showBattleLog(`${card.name} 升级为 ${upgraded.name}！`);

        this.game.closeModal();
        this.completeCampfire();
    }

    showCampfireRemove() {
        this.game.closeModal();

        const modal = document.getElementById('purification-modal');
        const grid = document.getElementById('purification-grid');
        const costDisplay = document.getElementById('purification-cost-display');
        const confirmBtn = document.getElementById('purification-confirm-btn');

        if (!modal || !grid) {
            console.error('Purification UI elements missing!');
            return;
        }

        // Reset State
        grid.innerHTML = '';
        modal.classList.add('active');

        // Campfire specific adjustments
        costDisplay.innerHTML = '<span style="color: var(--accent-green); font-size: 1.1em;">✨ 净化心灵</span>';

        confirmBtn.disabled = true;
        confirmBtn.onclick = null; // Clear listeners

        let selectedIndex = -1;

        // Render Cards
        this.game.player.deck.forEach((card, index) => {
            const wrapper = document.createElement('div');
            wrapper.className = 'purification-card-wrapper';

            // Create standard card element
            const cardEl = Utils.createCardElement(card, index);
            wrapper.appendChild(cardEl);

            // Delete Intent Overlay (Visual)
            const overlay = document.createElement('div');
            overlay.className = 'delete-intent-overlay';
            overlay.innerHTML = '<span class="delete-icon">🔥</span>';
            wrapper.appendChild(overlay);

            // Selection Logic
            wrapper.addEventListener('click', () => {
                // Deselect others
                document.querySelectorAll('.purification-card-wrapper').forEach(el => el.classList.remove('selected'));

                if (selectedIndex === index) {
                    // Deselect
                    selectedIndex = -1;
                    confirmBtn.disabled = true;
                    confirmBtn.textContent = '选择移除对象';
                } else {
                    // Select
                    selectedIndex = index;
                    wrapper.classList.add('selected');
                    confirmBtn.disabled = false;
                    confirmBtn.textContent = `确认焚毁 (Burn)`;

                    if (typeof audioManager !== 'undefined') audioManager.playSFX('click');
                }
            });

            grid.appendChild(wrapper);
        });

        // Confirm Action
        confirmBtn.onclick = () => {
            if (selectedIndex === -1) return;

            const cardName = this.game.player.deck[selectedIndex].name;
            const targetWrapper = grid.children[selectedIndex];

            // Visual Burn Effect
            const burn = document.createElement('div');
            burn.className = 'card-burn-effect';
            targetWrapper.appendChild(burn);

            if (typeof audioManager !== 'undefined') audioManager.playSFX('fire');

            // Delay actual removal
            setTimeout(() => {
                this.campfireRemoveCard(selectedIndex);

                // Close UI manually here since campfireRemoveCard might need to handle logic differently if we didn't pass params
                // Actually campfireRemoveCard calls closeModal/completeCampfire, so we are good.
            }, 800);
        };
    }

    campfireRemoveCard(index) {
        const card = this.game.player.deck[index];
        this.game.player.deck.splice(index, 1);

        // Removed tracking count logic if specific to shop, or keep it if global? 
        // Let's increment global remove count just in case
        this.game.player.removeCount = (this.game.player.removeCount || 0) + 1;

        Utils.showBattleLog(`【${card.name}】已化为灰烬...`);
        this.game.closeModal();
        this.completeCampfire();
    }

    completeCampfire() {
        if (this.game.campfireNode) {
            this.game.map.completeNode(this.game.campfireNode);
            this.game.campfireNode = null;
        }
        this.game.autoSave();
        this.game.showScreen('map-screen');
    }


}

if (typeof window !== 'undefined') {
    window.CampfireView = CampfireView;
}
