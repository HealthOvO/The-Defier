/**
 * InventoryView
 * Handles rendering and interaction for the Treasure Bag and Deck screens.
 */

export class InventoryView {
    constructor(gameInstance) {
        this.game = gameInstance;
    }

    // --------------------------------------------------------
    // Deck / Card Management UI
    // --------------------------------------------------------

    showDeck() {
        this.showDeckModal('deck');
    }

    showDeckModal(type) {
        const modal = document.getElementById('deck-modal');
        const modalContent = modal.querySelector('.modal-content');

        // Ensure Header Structure
        let header = modalContent.querySelector('.deck-view-header');
        let contentContainer = modalContent.querySelector('.deck-view-content');

        if (!header || !contentContainer) {
            const closeBtn = modalContent.querySelector('.modal-close');
            const oldCloseBtnHtml = closeBtn ? closeBtn.outerHTML : '<button class="modal-close" onclick="game.closeModal()">×</button>';

            modalContent.innerHTML = `
                ${oldCloseBtnHtml}
                <div class="deck-view-header">
                    <h2>当前牌组</h2>
                </div>
                <div class="deck-view-content" id="deck-view-cards"></div>
            `;
            header = modalContent.querySelector('.deck-view-header');
            contentContainer = document.getElementById('deck-view-cards');
        }

        const title = header.querySelector('h2');
        contentContainer.innerHTML = '';

        let cards = [];
        let deckName = '';

        switch (type) {
            case 'deck': cards = this.game.player.deck; deckName = '当前牌组'; break;
            case 'draw': cards = this.game.player.drawPile; deckName = '识海'; break;
            case 'discard': cards = this.game.player.discardPile; deckName = '轮回'; break;
        }

        title.textContent = `${deckName} · ${cards.length}`;

        // === Group by Rarity (High -> Low) ===
        const rarityOrder = ['legendary', 'epic', 'rare', 'uncommon', 'common', 'basic'];
        const groups = {
            'legendary': { name: '传说 · Legendary', cards: [], color: '#ffeb3b', icon: '👑' },
            'epic': { name: '史诗 · Epic', cards: [], color: '#d500f9', icon: '🔮' },
            'rare': { name: '稀有 · Rare', cards: [], color: '#00e5ff', icon: '💎' },
            'uncommon': { name: '优秀 · Uncommon', cards: [], color: '#76ff03', icon: '🌿' },
            'common': { name: '普通 · Common', cards: [], color: '#bdbdbd', icon: '📄' },
            'basic': { name: '基础 · Basic', cards: [], color: '#795548', icon: '🪵' }
        };

        const cardCounts = {};

        cards.forEach(card => {
            if (!card || !card.id) return;
            const key = card.upgraded ? `${card.id}_upgraded` : card.id;
            if (!cardCounts[key]) cardCounts[key] = 0;
            cardCounts[key]++;
        });

        const processedKeys = new Set();

        cards.forEach(card => {
            if (!card || !card.id) return;
            const key = card.upgraded ? `${card.id}_upgraded` : card.id;

            if (processedKeys.has(key)) return;
            processedKeys.add(key);

            let rarity = (card.rarity || 'common').toLowerCase();
            if (!groups[rarity]) rarity = 'common';

            card._tempCount = cardCounts[key];
            groups[rarity].cards.push(card);
        });

        rarityOrder.forEach((rarityKey, groupIndex) => {
            const group = groups[rarityKey];
            if (group.cards.length === 0) return;

            group.cards.sort((a, b) => {
                const typeOrder = { attack: 1, skill: 2, power: 3, defense: 4 }; 
                const tA = typeOrder[a.type] || 99;
                const tB = typeOrder[b.type] || 99;
                if (tA !== tB) return tA - tB;
                return a.id.localeCompare(b.id);
            });

            const groupEl = document.createElement('div');
            groupEl.className = `deck-category rarity-${rarityKey}`;
            groupEl.style.animationDelay = `${groupIndex * 0.15}s`;

            groupEl.innerHTML = `
                <div class="category-header" style="border-bottom-color: ${group.color}">
                    <span class="category-title" style="color: ${group.color}">
                        ${group.icon} ${group.name} 
                    </span>
                    <span class="category-count">${group.cards.length} 种 / ${group.cards.reduce((sum, c) => sum + c._tempCount, 0)} 张</span>
                </div>
                <div class="category-cards"></div>
            `;

            const cardsContainer = groupEl.querySelector('.category-cards');

            group.cards.forEach((card, idx) => {
                const wrapper = document.createElement('div');
                wrapper.className = 'deck-card-wrapper';
                wrapper.style.animationDelay = `${(groupIndex * 0.1) + (idx * 0.05)}s`;

                const cardEl = Utils.createCardElement(card, idx);
                cardEl.style.cursor = 'zoom-in';

                if (card._tempCount > 1) {
                    const badge = document.createElement('div');
                    badge.className = 'card-count-badge';
                    badge.textContent = `x${card._tempCount}`;
                    wrapper.appendChild(badge);
                }

                cardEl.addEventListener('click', () => {
                    Utils.showCardDetail(card, {
                        sectionLabel: deckName,
                        sourceLabel: group.name,
                        closeLabel: '关闭'
                    });
                });

                wrapper.appendChild(cardEl);
                cardsContainer.appendChild(wrapper);
            });

            contentContainer.appendChild(groupEl);
        });

        modal.classList.add('active');
    }

    // --------------------------------------------------------
    // Treasure Bag UI
    // --------------------------------------------------------

    showTreasureBag() {
        let modal = document.getElementById('treasure-bag-modal');
        if (!modal) {
            modal = document.createElement('div');
            modal.id = 'treasure-bag-modal';
            modal.className = 'modal treasure-bag-modal';
            modal.innerHTML = `
            <div class="modal-content large-modal">
                    <span class="close-btn">&times;</span>
                    <h2>🎒 法宝囊</h2>
                    
                    <div class="treasure-bag-layout">
                        <!-- 左侧：已装备 -->
                        <div class="equipped-section">
                            <h3>已装备法宝 <span id="equipped-count">0/2</span></h3>
                            <div class="equipped-grid" id="equipped-grid"></div>
                            <div class="slot-info">突破境界可解锁更多槽位</div>
                        </div>

                        <!-- 右侧：仓库 -->
                        <div class="inventory-section">
                            <h3>法宝仓库</h3>
                            <div class="inventory-grid" id="inventory-grid"></div>
                        </div>
                    </div>
                </div>
            `;
            document.body.appendChild(modal);

            const closeBtn = modal.querySelector('.close-btn');
            closeBtn.onclick = () => {
                modal.style.display = 'none';
                if (this.game.currentScreen === 'map-screen' && typeof this.game.updateMapUI === 'function') {
                    this.game.updateMapUI(); 
                }
            };

            modal.onclick = (e) => {
                if (e.target === modal) modal.style.display = 'none';
            };
        }

        modal.style.display = 'flex';
        this.updateTreasureBagUI();
    }

    updateTreasureBagUI() {
        const modal = document.getElementById('treasure-bag-modal');
        if (!modal || modal.style.display === 'none') return;

        const maxSlots = this.game.player.getMaxTreasureSlots();
        const equippedCountObj = document.getElementById('equipped-count');
        if (equippedCountObj) {
            equippedCountObj.innerText = `${this.game.player.equippedTreasures.length}/${maxSlots}`;
        }

        const equippedGrid = document.getElementById('equipped-grid');
        const inventoryGrid = document.getElementById('inventory-grid');

        equippedGrid.innerHTML = '';
        inventoryGrid.innerHTML = '';

        for (let i = 0; i < maxSlots; i++) {
            const treasure = this.game.player.equippedTreasures[i];
            const slot = document.createElement('div');
            slot.className = 'treasure-slot';

            if (treasure) {
                const icon = treasure.icon || '📦';
                const name = treasure.name || treasure.id;
                const desc = treasure.description || (treasure.getDesc ? treasure.getDesc(this.game.player) : '');
                const shortDesc = desc.length > 25 ? desc.substring(0, 25) + '...' : desc;
                const rarityLabel = this.game.getRarityLabel(treasure.rarity || 'common');

                slot.className += ' filled rarity-' + (treasure.rarity || 'common');
                slot.innerHTML = `
                    <div class="t-icon">${icon}</div>
                    <div class="t-name">${name}</div>
                    <div class="t-rarity" style="font-size:0.7rem; margin-bottom:2px;">${rarityLabel}</div>
                    <div class="t-effect">${shortDesc}</div>
                    <button class="unequip-btn">卸下</button>
                `;

                slot.onclick = (e) => {
                    if (e.target.className === 'unequip-btn') {
                        e.stopPropagation();
                        this.game.player.unequipTreasure(treasure.id);
                        if (typeof audioManager !== 'undefined') audioManager.playSFX('click');
                        this.updateTreasureBagUI();
                    } else {
                        this.game.showAlertModal(desc, name);
                    }
                };

                slot.oncontextmenu = (e) => {
                    e.preventDefault();
                    this.game.showAlertModal(desc, name);
                };
            } else {
                slot.className += ' empty';
                slot.innerHTML = '<div class="empty-text">空闲槽位</div>';
            }
            equippedGrid.appendChild(slot);
        }

        let inventory = this.game.player.collectedTreasures.filter(t => !this.game.player.isTreasureEquipped(t.id));

        const rarityWeights = { 'mythic': 4, 'legendary': 3, 'rare': 2, 'common': 1 };
        inventory.sort((a, b) => {
            const wA = rarityWeights[a.rarity || 'common'] || 1;
            const wB = rarityWeights[b.rarity || 'common'] || 1;
            return wB - wA;
        });

        if (inventory.length === 0) {
            inventoryGrid.innerHTML = '<div class="empty-inventory">暂无闲置法宝</div>';
        } else {
            inventory.forEach(t => {
                const icon = t.icon || '📦';
                const name = t.name || t.id;
                const desc = t.description || (t.getDesc ? t.getDesc(this.game.player) : '未知效果');
                const rarityLabel = this.game.getRarityLabel(t.rarity || 'common');

                const el = document.createElement('div');
                el.className = `inventory-item rarity-${t.rarity || 'common'}`;
                el.innerHTML = `
                    <div class="t-icon">${icon}</div>
                    <div class="t-name">${name}</div>
                    <div class="t-rarity" style="font-size:0.7rem; margin-bottom:2px;">${rarityLabel}</div>
                    <div class="t-effect">${desc}</div>
                `;
                el.title = `${name}: ${desc}`;

                el.onclick = (e) => {
                    if (this.game.player.equipTreasure(t.id)) {
                        if (typeof audioManager !== 'undefined') audioManager.playSFX('equip');
                        this.updateTreasureBagUI();
                    } else {
                        if (this.game.player.equippedTreasures.length >= maxSlots) {
                            this.game.showAlertModal(`⚠️ 法宝槽位已满！请先卸下其他法宝。`, '无法装备');
                        }
                    }
                };

                el.addEventListener('contextmenu', (e) => {
                    e.preventDefault();
                    e.stopPropagation(); 
                    this.game.showAlertModal(desc, name);
                    return false;
                });

                inventoryGrid.appendChild(el);
            });
        }
    }

    // --- Extracted Codex and Compendium Methods ---

    showCollection() {
        this.game.showScreen('collection');
        this.initCollection();
    }

    normalizeLawCodexFilterState(rawState = null) {
        const source = rawState && typeof rawState === 'object' ? rawState : {};
        const normalizeQuery = (value) => String(value || '').trim().slice(0, 60);
        const allowedElements = [
            'all', 'thunder', 'fire', 'ice', 'sword', 'void', 'chaos', 'blood',
            'life', 'earth', 'wind', 'time', 'space', 'karma', 'reversal', 'metal', 'wood'
        ];
        const allowedResonanceStates = ['all', 'active', 'ready', 'near', 'locked'];
        return {
            query: normalizeQuery(source.query),
            status: ['all', 'owned', 'unowned'].includes(source.status) ? source.status : 'all',
            element: allowedElements.includes(source.element) ? source.element : 'all',
            resonance: allowedResonanceStates.includes(source.resonance) ? source.resonance : 'all'
        };
    }

    getLawCodexFilterState() {
        this.lawCodexFilterState = this.normalizeLawCodexFilterState(this.lawCodexFilterState);
        return this.lawCodexFilterState;
    }

    getLawCodexFilterLabels(state = null) {
        const currentState = this.normalizeLawCodexFilterState(state || this.getLawCodexFilterState());
        const labels = [];
        if (currentState.query) labels.push(`关键词「${currentState.query}」`);
        if (currentState.status === 'owned') labels.push('仅已掌握');
        if (currentState.status === 'unowned') labels.push('仅未掌握');
        if (currentState.element !== 'all') labels.push(`${this.game.getLawElementLabel(currentState.element)}属性`);
        const resonanceLabelMap = {
            active: '已激活共鸣',
            ready: '待装配共鸣',
            near: '差 1 枚共鸣',
            locked: '未成型共鸣'
        };
        if (currentState.resonance !== 'all') labels.push(resonanceLabelMap[currentState.resonance] || currentState.resonance);
        return labels;
    }

    setLawCodexSearchQuery(query = '') {
        this.lawCodexFilterState = this.normalizeLawCodexFilterState({
            ...this.getLawCodexFilterState(),
            query
        });
        this.initCollection();
    }

    setLawCodexStatusFilter(value = 'all') {
        this.lawCodexFilterState = this.normalizeLawCodexFilterState({
            ...this.getLawCodexFilterState(),
            status: value
        });
        this.initCollection();
    }

    setLawCodexElementFilter(value = 'all') {
        this.lawCodexFilterState = this.normalizeLawCodexFilterState({
            ...this.getLawCodexFilterState(),
            element: value
        });
        this.initCollection();
    }

    setLawCodexResonanceFilter(value = 'all') {
        this.lawCodexFilterState = this.normalizeLawCodexFilterState({
            ...this.getLawCodexFilterState(),
            resonance: value
        });
        this.initCollection();
    }

    clearLawCodexFilters() {
        this.lawCodexFilterState = this.normalizeLawCodexFilterState();
        this.initCollection();
    }

    initCollection() {
        const lawGrid = document.getElementById('law-archive-grid');
        const resonanceList = document.getElementById('resonance-manual-list');
        const summaryEl = document.getElementById('law-codex-summary');
        const resonanceSummaryEl = document.getElementById('law-codex-resonance-summary');
        const searchInput = document.getElementById('law-codex-search');
        const statusSelect = document.getElementById('law-codex-status-filter');
        const elementSelect = document.getElementById('law-codex-element-filter');
        const resonanceSelect = document.getElementById('law-codex-resonance-filter');

        // 确保容器存在
        if (!lawGrid || !resonanceList) {
            console.warn('New Codex UI structure not found.');
            return;
        }

        const filterState = this.getLawCodexFilterState();
        if (searchInput && searchInput.value !== filterState.query) searchInput.value = filterState.query;
        if (statusSelect && statusSelect.value !== filterState.status) statusSelect.value = filterState.status;
        if (elementSelect && elementSelect.value !== filterState.element) elementSelect.value = filterState.element;
        if (resonanceSelect && resonanceSelect.value !== filterState.resonance) resonanceSelect.value = filterState.resonance;

        const allLawIds = Object.keys(LAWS || {});
        const totalLawCount = allLawIds.length;
        const collectedLawCount = allLawIds.filter((lawId) => this.game.player.collectedLaws.some((law) => law.id === lawId)).length;
        const totalResonanceCount = (typeof LAW_RESONANCES !== 'undefined' && LAW_RESONANCES)
            ? Object.keys(LAW_RESONANCES).length
            : 0;
        const activeResonanceCount = Array.isArray(this.game.player.activeResonances) ? this.game.player.activeResonances.length : 0;
        const lawProgress = totalLawCount > 0 ? Math.round((collectedLawCount / totalLawCount) * 100) : 0;
        const lawFilterLabels = this.getLawCodexFilterLabels(filterState);

        const lawEntries = allLawIds.map((lawId) => {
            const law = LAWS[lawId];
            const collected = this.game.player.collectedLaws.some((entry) => entry.id === lawId);
            const readinessList = this.game.getLawResonanceAvailability(law);
            const resonanceState = this.resolveLawCodexResonanceState(readinessList);
            return {
                lawId,
                law,
                collected,
                readinessList,
                resonanceState
            };
        });
        const filteredLawEntries = lawEntries.filter((entry) => this.passesLawCodexLawFilter(entry));

        const resonanceEntries = (typeof LAW_RESONANCES !== 'undefined' && LAW_RESONANCES)
            ? Object.values(LAW_RESONANCES).map((resonance) => ({
                resonance,
                state: this.resolveLawCodexResonanceRecordState(resonance)
            }))
            : [];
        const filteredResonanceEntries = resonanceEntries.filter((entry) => this.passesLawCodexResonanceFilter(entry));

        if (summaryEl) {
            summaryEl.innerHTML = [
                '<span class="codex-side-kicker">收集总览</span>',
                '<h3>法则收藏进度</h3>',
                `<div class="codex-summary-metric"><strong>${collectedLawCount}</strong><span>/ ${totalLawCount} 已收录</span></div>`,
                `<div class="codex-progress-track"><div class="codex-progress-fill" style="width:${lawProgress}%"></div></div>`,
                '<ul class="codex-side-list compact">',
                `<li>完成度 ${lawProgress}% · 越接近满库，共鸣路线越完整。</li>`,
                `<li>当前检索结果 ${filteredLawEntries.length} 条${lawFilterLabels.length > 0 ? ` · 条件 ${lawFilterLabels.join(' / ')}` : ' · 条件 全部法则'}。</li>`,
                '<li>未收录法则会保留在主区，便于直观看到缺口。</li>',
                '</ul>'
            ].join('');
        }

        if (resonanceSummaryEl) {
            const visibleActiveResonances = filteredResonanceEntries.filter((entry) => entry.state === 'active').length;
            resonanceSummaryEl.innerHTML = [
                '<span class="codex-side-kicker">当前共鸣</span>',
                '<h3>羁绊装配</h3>',
                '<div class="codex-summary-grid two-cols">',
                `<div class="codex-summary-chip"><strong>${visibleActiveResonances}</strong><span>激活中</span></div>`,
                `<div class="codex-summary-chip"><strong>${filteredResonanceEntries.length}</strong><span>当前结果 / ${totalResonanceCount}</span></div>`,
                '</div>',
                `<p class="codex-side-note">${lawFilterLabels.length > 0 ? `当前已按 ${lawFilterLabels.join(' / ')} 检索。` : '优先补齐同元素法则，可更快点亮主力共鸣链。'}</p>`
            ].join('');
        }

        // --- 1. 渲染法则库 (Jade Slips) ---
        lawGrid.innerHTML = '';

        if (filteredLawEntries.length === 0) {
            lawGrid.innerHTML = '<div class="codex-empty-state">当前检索条件下没有匹配的法则，试试清空关键词或放宽元素 / 共鸣条件。</div>';
        }

        for (const entry of filteredLawEntries) {
            const { lawId, law, collected } = entry;

            const item = document.createElement('div');
            item.className = `law-item ${collected ? '' : 'locked'}`;

            // 构建内容
            let contentHtml = '';

            // Dao Type Mapping based on Rarity
            let daoType = '小道';
            if (law.rarity === 'legendary') daoType = '无上大道';
            else if (law.rarity === 'epic') daoType = '三千大道';
            else daoType = '旁门小道';

            // 密封层 (Locked)
            if (!collected) {
                contentHtml += `<div class="law-seal-overlay">封</div>`;
            }

            contentHtml += `
                <div class="law-icon-wrapper">${collected ? law.icon : '?'}</div>
                <div class="law-name">${collected ? law.name : '？？？'}</div>
                <div class="law-type-tag ${law.rarity}">${daoType}</div>
            `;

            item.innerHTML = contentHtml;

            if (collected) {
                // 点击查看详情
                item.addEventListener('click', () => {
                    // 尝试获取被动效果描述
                    let passiveText = '';
                    if (typeof getLawPassiveDescription === 'function') {
                        passiveText = getLawPassiveDescription(law);
                    } else if (law.passive) {
                        passiveText = `被动: ${law.passive.type} ${law.passive.value}`;
                    }

                    let detailMsg = `${law.description}`;
                    if (passiveText) {
                        detailMsg += `\n\n🔎 被动效果:\n${passiveText}`;
                    }
                    this.game.showLawDetail(law, true);
                });
            } else {
                item.addEventListener('click', () => {
                    this.game.showLawDetail(law, false);
                });
            }

            lawGrid.appendChild(item);
        }

        // --- 2. 渲染共鸣手册 (Bamboo Scrolls) ---
        resonanceList.innerHTML = '';

        if (typeof LAW_RESONANCES === 'undefined') {
            resonanceList.innerHTML = '<div style="padding:20px; color:#666;">暂无记载</div>';
            return;
        }

        if (filteredResonanceEntries.length === 0) {
            resonanceList.innerHTML = '<div class="codex-empty-state">当前检索条件下没有匹配的共鸣链路，可尝试切换关键词或共鸣进度。</div>';
        }

        for (const entry of filteredResonanceEntries) {
            const res = entry.resonance;

            const isActive = entry.state === 'active';

            const resScroll = document.createElement('div');
            resScroll.className = `resonance-item ${isActive ? 'active' : ''}`;

            // 构建法则组件图标 + 名称列表
            let componentsHtml = '';
            let reqNames = [];

            if (res.laws) {
                componentsHtml = res.laws.map(lawId => {
                    const l = LAWS[lawId];
                    // 在图鉴中，如果玩家收集过该法则，则点亮该组件
                    const hasLaw = this.game.player.collectedLaws.some(cl => cl.id === lawId);

                    if (l) reqNames.push(l.name);

                    return `
                        <div class="res-component-icon ${hasLaw ? 'has-law' : ''}" title="${l ? l.name : lawId}">
                            ${l ? l.icon : '?'}
                        </div>
                    `;
                }).join('');
            }

            resScroll.innerHTML = `
                <div class="resonance-info">
                    <div class="resonance-title">
                        ${res.name}
                        ${isActive ? '<span style="color:var(--accent-gold); font-size:1rem; margin-left:10px;">(当前激活)</span>' : ''}
                    </div>
                    <div class="resonance-reqs">
                        <span style="color:#666; font-size:0.9rem;">所需法则: </span>
                        <span style="color:var(--accent-gold); font-size:0.9rem;">${reqNames.join(' + ')}</span>
                    </div>
                    <div class="resonance-desc">${res.description}</div>
                    <div class="resonance-effect">📜 效果: ${this.game.formattingResonanceEffect(res.effect)}</div>
                </div>
                <div class="resonance-components">
                    ${componentsHtml}
                </div>
            `;

            resonanceList.appendChild(resScroll);
        }
    }

    resolveLawCodexResonanceState(readinessList = []) {
        if (!Array.isArray(readinessList) || readinessList.length <= 0) return 'locked';
        if (readinessList.some((entry) => entry?.state === 'active')) return 'active';
        if (readinessList.some((entry) => entry?.state === 'ready')) return 'ready';
        if (readinessList.some((entry) => entry?.state === 'near')) return 'near';
        return 'locked';
    }

    resolveLawCodexResonanceRecordState(resonance) {
        if (!resonance) return 'locked';
        const requiredLaws = Array.isArray(resonance.laws) ? resonance.laws.filter(Boolean) : [];
        const collectedIds = new Set(
            Array.isArray(this.game.player?.collectedLaws)
                ? this.game.player.collectedLaws.map((entry) => entry?.id).filter(Boolean)
                : []
        );
        const socketedIds = new Set(
            this.game.player?.fateRing && typeof this.game.player.fateRing.getSocketedLaws === 'function'
                ? this.game.player.fateRing.getSocketedLaws().filter(Boolean)
                : []
        );
        const missingCollected = requiredLaws.filter((lawId) => !collectedIds.has(lawId));
        const missingSocketed = requiredLaws.filter((lawId) => !socketedIds.has(lawId));
        if (requiredLaws.length > 0 && missingSocketed.length === 0) return 'active';
        if (requiredLaws.length > 0 && missingCollected.length === 0) return 'ready';
        if (missingCollected.length === 1) return 'near';
        return 'locked';
    }

    passesLawCodexLawFilter(entry) {
        const filterState = this.getLawCodexFilterState();
        if (!entry || !entry.law) return false;
        if (filterState.status === 'owned' && !entry.collected) return false;
        if (filterState.status === 'unowned' && entry.collected) return false;
        if (filterState.element !== 'all' && entry.law.element !== filterState.element) return false;
        if (filterState.resonance !== 'all' && entry.resonanceState !== filterState.resonance) return false;
        if (!filterState.query) return true;

        const relatedResonanceNames = this.game.getLawRelatedResonances(entry.law).map((resonance) => resonance?.name || '');
        const haystack = [
            entry.law.id,
            entry.law.name,
            entry.law.description,
            this.game.getLawElementLabel(entry.law.element),
            this.game.getLawRarityText(entry.law.rarity),
            ...relatedResonanceNames,
            ...(Array.isArray(entry.law.unlockCards) ? entry.law.unlockCards : [])
        ].join(' ').toLowerCase();

        return haystack.includes(filterState.query.toLowerCase());
    }

    passesLawCodexResonanceFilter(entry) {
        const filterState = this.getLawCodexFilterState();
        if (!entry || !entry.resonance) return false;
        if (filterState.resonance !== 'all' && entry.state !== filterState.resonance) return false;
        if (filterState.element !== 'all') {
            const hasElement = (entry.resonance.laws || []).some((lawId) => LAWS?.[lawId]?.element === filterState.element);
            if (!hasElement) return false;
        }
        if (!filterState.query) return true;

        const lawNames = (entry.resonance.laws || []).map((lawId) => LAWS?.[lawId]?.name || lawId);
        const haystack = [
            entry.resonance.id,
            entry.resonance.name,
            entry.resonance.description,
            ...lawNames
        ].join(' ').toLowerCase();

        return haystack.includes(filterState.query.toLowerCase());
    }

    setTreasureCompendiumFilter(value = 'all') {
        const nextValue = String(value || 'all');
        const state = this.getTreasureCompendiumFilterState();
        if (nextValue === 'custom') {
            this.treasureCompendiumFilter = this.getTreasureCompendiumQuickFilterValue();
            this.showTreasureCompendium();
            return;
        }
        state.status = 'all';
        state.rarities = [];
        state.sources = [];

        if (['owned', 'unowned'].includes(nextValue)) {
            state.status = nextValue;
        } else if (['common', 'rare', 'legendary', 'mythic'].includes(nextValue)) {
            state.rarities = [nextValue];
        } else if (['shop', 'elite', 'boss', 'event', 'camp', 'challenge'].includes(nextValue)) {
            state.sources = [nextValue];
        }

        this.treasureCompendiumFilterState = state;
        this.treasureCompendiumFilter = nextValue;
        this.showTreasureCompendium();
    }

    setTreasureCompendiumSort(value = 'rarity_desc') {
        this.treasureCompendiumSort = String(value || 'rarity_desc');
        this.showTreasureCompendium();
    }

    setTreasureCompendiumSearchQuery(query = '') {
        this.treasureCompendiumSearchQuery = String(query || '').trim().slice(0, 80);
        this.showTreasureCompendium();
    }

    getTreasureCompendiumSearchQuery() {
        return String(this.treasureCompendiumSearchQuery || '').trim();
    }

    getTreasureCompendiumPresetStorageKey() {
        return this.treasureCompendiumPresetStorageKey || 'theDefierTreasureCompendiumPresetsV1';
    }

    serializeTreasureCompendiumFilterState(state = null, sort = null) {
        return JSON.stringify({
            state: this.normalizeTreasureCompendiumFilterState(state || this.getTreasureCompendiumFilterState()),
            sort: String(sort || this.treasureCompendiumSort || 'rarity_desc'),
            query: this.getTreasureCompendiumSearchQuery()
        });
    }

    getTreasureCompendiumPresets() {
        if (Array.isArray(this.treasureCompendiumPresetCache)) return this.treasureCompendiumPresetCache;
        const fallback = [null, null, null];
        try {
            const raw = localStorage.getItem(this.getTreasureCompendiumPresetStorageKey());
            const parsed = raw ? JSON.parse(raw) : fallback;
            this.treasureCompendiumPresetCache = Array.isArray(parsed)
                ? parsed.slice(0, 3).map((entry) => entry && typeof entry === 'object'
                    ? {
                        state: this.normalizeTreasureCompendiumFilterState(entry.state),
                        sort: String(entry.sort || 'rarity_desc'),
                        query: String(entry.query || ''),
                        savedAt: Number(entry.savedAt) || 0
                    }
                    : null)
                : fallback;
        } catch (error) {
            this.treasureCompendiumPresetCache = fallback;
        }
        while (this.treasureCompendiumPresetCache.length < 3) this.treasureCompendiumPresetCache.push(null);
        return this.treasureCompendiumPresetCache;
    }

    persistTreasureCompendiumPresets() {
        try {
            localStorage.setItem(this.getTreasureCompendiumPresetStorageKey(), JSON.stringify(this.getTreasureCompendiumPresets()));
        } catch (error) {
            console.warn('Persist treasure compendium presets failed:', error);
        }
    }

    getTreasureCompendiumPresetSummary(state = null, query = '') {
        const labels = this.getTreasureCompendiumFilterLabels(state || this.getTreasureCompendiumFilterState());
        if (query) labels.unshift(`搜「${query}」`);
        return labels.length > 0 ? labels.join(' / ') : '全部法宝';
    }

    saveTreasureCompendiumPreset(slot = 0) {
        const index = Math.max(0, Math.min(2, Number(slot) || 0));
        const presets = this.getTreasureCompendiumPresets();
        presets[index] = {
            state: this.normalizeTreasureCompendiumFilterState(this.getTreasureCompendiumFilterState()),
            sort: String(this.treasureCompendiumSort || 'rarity_desc'),
            query: this.getTreasureCompendiumSearchQuery(),
            savedAt: Date.now()
        };
        this.persistTreasureCompendiumPresets();
        if (typeof Utils !== 'undefined' && typeof Utils.showBattleLog === 'function') {
            Utils.showBattleLog(`已保存图鉴筛选预设 ${index + 1}`);
        }
        this.showTreasureCompendium();
    }

    applyTreasureCompendiumPreset(slot = 0) {
        const index = Math.max(0, Math.min(2, Number(slot) || 0));
        const preset = this.getTreasureCompendiumPresets()[index];
        if (!preset?.state) {
            if (typeof Utils !== 'undefined' && typeof Utils.showBattleLog === 'function') {
                Utils.showBattleLog(`预设 ${index + 1} 为空`);
            }
            return false;
        }
        this.treasureCompendiumFilterState = this.normalizeTreasureCompendiumFilterState(preset.state);
        this.treasureCompendiumSort = String(preset.sort || 'rarity_desc');
        this.treasureCompendiumSearchQuery = String(preset.query || '');
        this.treasureCompendiumFilter = this.getTreasureCompendiumQuickFilterValue();
        this.showTreasureCompendium();
        return true;
    }

    clearTreasureCompendiumFilters() {
        this.treasureCompendiumFilterState = this.normalizeTreasureCompendiumFilterState();
        this.treasureCompendiumFilter = 'all';
        this.treasureCompendiumSort = 'rarity_desc';
        this.treasureCompendiumSearchQuery = '';
        this.showTreasureCompendium();
    }

    isTreasureCompendiumPresetActive(slot = 0) {
        const preset = this.getTreasureCompendiumPresets()[slot];
        if (!preset?.state) return false;
        return this.serializeTreasureCompendiumFilterState(preset.state, preset.sort) === this.serializeTreasureCompendiumFilterState();
    }

    getTreasureCompendiumPresetLabel(slot = 0) {
        const preset = this.getTreasureCompendiumPresets()[slot];
        if (!preset?.state) return `预设 ${slot + 1}（空）`;
        return `预设 ${slot + 1} · ${this.getTreasureCompendiumPresetSummary(preset.state, preset.query || '')}`;
    }

    normalizeTreasureCompendiumFilterState(rawState = null) {
        const source = rawState && typeof rawState === 'object' ? rawState : {};
        const normalizeList = (value, allowed) => {
            const items = Array.isArray(value) ? value.map((entry) => String(entry || '')).filter(Boolean) : [];
            return [...new Set(items)].filter((entry) => allowed.includes(entry));
        };

        return {
            status: ['all', 'owned', 'unowned'].includes(source.status) ? source.status : 'all',
            rarities: normalizeList(source.rarities, ['common', 'rare', 'legendary', 'mythic']),
            sources: normalizeList(source.sources, ['shop', 'elite', 'boss', 'event', 'camp', 'challenge'])
        };
    }

    getTreasureCompendiumFilterState() {
        this.treasureCompendiumFilterState = this.normalizeTreasureCompendiumFilterState(this.treasureCompendiumFilterState);
        return this.treasureCompendiumFilterState;
    }

    getTreasureSourceTags(treasure) {
        const sourceText = this.game.getTreasureSource(treasure || {});
        const tags = new Set();
        if (/商店/.test(sourceText)) tags.add('shop');
        if (/精英/.test(sourceText)) tags.add('elite');
        if (/Boss|首杀|裁决者|天道终焉|丹尊|三首金龙|虚空吞噬者|合体天尊|大乘至尊|飞升主宰|混沌之眼|五行长老|上古遗灵|仙门长老|妖狼王|山寨头目/.test(sourceText)) tags.add('boss');
        if (/奇遇|事件|雷劫|剑冢/.test(sourceText)) tags.add('event');
        if (/营地|供奉|锻炉/.test(sourceText)) tags.add('camp');
        if (/挑战|试炼|成就/.test(sourceText)) tags.add('challenge');
        return Array.from(tags);
    }

    getTreasureResearchData(treasure) {
        const safeTreasure = treasure && typeof treasure === 'object' ? treasure : {};
        const playerResearch = this.game.player && typeof this.game.player.getTreasureResearchEntry === 'function'
            ? this.game.player.getTreasureResearchEntry(safeTreasure.id)
            : null;
        const runPathMeta = this.game.player && typeof this.game.player.getRunPathMeta === 'function'
            ? this.game.player.getRunPathMeta()
            : null;
        const role = playerResearch?.role || {
            tier: 'base',
            label: '基础件',
            summary: '更适合作为前期稳定补强，再决定是否继续投入研究。'
        };
        const setMeta = playerResearch?.setMeta || null;
        const focusTags = Array.isArray(playerResearch?.focusTags) ? playerResearch.focusTags : [];
        const favoredSets = Array.isArray(runPathMeta?.treasureSynergy?.favoredSets)
            ? runPathMeta.treasureSynergy.favoredSets
            : [];
        const favoredLabels = favoredSets.map((setId) => this.game.player?.getTreasureSetLabel?.(setId) || setId);
        const runPathSynergyActive = !!(setMeta && favoredSets.includes(setMeta.id));
        const runPathSynergyText = runPathMeta?.treasureSynergy
            ? (runPathSynergyActive
                ? `命途协同：当前【${runPathMeta.name}】推荐 ${setMeta?.icon || '✦'}${setMeta?.label || '该套装'}，${runPathMeta.treasureSynergy.bonusDesc || runPathMeta.treasureSynergy.summary || '能进一步放大当前构筑。'}`
                : `当前命途推荐：${runPathMeta.name} 更偏向 ${favoredLabels.join(' / ')}，若要走长线可优先补这些套装。`)
            : '';
        const setText = setMeta
            ? [
                `${setMeta.icon || '✦'} ${setMeta.label} · ${setMeta.theme}`,
                `2件：${setMeta.twoPiece}`,
                `3件：${setMeta.threePiece}`,
                playerResearch?.setPieces > 0
                    ? `当前已装备视作 ${playerResearch.setPieces} 件。`
                    : '当前尚未把该套装正式带入战斗。'
            ].join('<br>')
            : '暂无套装归属，更多承担单卡对策或前期过渡补强。';
        const buildFitText = [
            focusTags.length > 0 ? `适配方向：${focusTags.join(' / ')}` : '适配方向：偏泛用补件',
            role.summary,
            runPathSynergyText
        ].join('<br>');
        const forgeLines = Array.isArray(playerResearch?.workshopLines) && playerResearch.workshopLines.length > 0
            ? playerResearch.workshopLines.slice()
            : ['尚未进行炼器改造，可先在炼器坊确认是走重铸、器灵还是套装修正。'];
        forgeLines.push(playerResearch?.infusionNote || '当前暂无器灵灌注建议。');
        if (runPathSynergyActive) {
            forgeLines.push(`命途联动：${runPathMeta?.treasureSynergy?.bonusLabel || runPathMeta?.name || '当前命途'} · ${runPathMeta?.treasureSynergy?.summary || '当前套装与本轮节奏高度契合。'}`);
        } else if (runPathSynergyText) {
            forgeLines.push(runPathSynergyText.replace(/^命途协同：/, '命途提示：'));
        }
        return {
            ...(playerResearch || {}),
            role,
            setMeta,
            focusTags,
            sourceText: this.game.getTreasureSource(safeTreasure),
            setText,
            buildFitText,
            forgeText: forgeLines.join('<br>'),
            runPathSynergy: runPathMeta?.treasureSynergy
                ? {
                    pathId: runPathMeta.id,
                    pathName: runPathMeta.name,
                    active: runPathSynergyActive,
                    favoredSets: favoredSets.slice(),
                    summary: runPathMeta.treasureSynergy.summary || '',
                    bonusLabel: runPathMeta.treasureSynergy.bonusLabel || '',
                    bonusDesc: runPathMeta.treasureSynergy.bonusDesc || ''
                }
                : null
        };
    }

    getTreasureResearchOverviewData() {
        const fallbackOverview = {
            setProgress: [],
            coreOwned: 0,
            coreTotal: 0,
            formOwned: 0,
            formTotal: 0,
            activeReforges: 0,
            activeInfusions: 0,
            activeSetEchoes: 0,
            activeWorkshops: 0,
            resonantSets: 0,
            fullSets: 0,
            readyInfusions: []
        };
        const overview = this.game.player && typeof this.game.player.getTreasureWorkshopResearchOverview === 'function'
            ? this.game.player.getTreasureWorkshopResearchOverview()
            : fallbackOverview;
        const runPathMeta = this.game.player && typeof this.game.player.getRunPathMeta === 'function'
            ? this.game.player.getRunPathMeta()
            : null;
        const favoredSets = Array.isArray(runPathMeta?.treasureSynergy?.favoredSets)
            ? runPathMeta.treasureSynergy.favoredSets
            : [];
        const favoredLabels = favoredSets.map((setId) => this.game.player?.getTreasureSetLabel?.(setId) || setId);
        const favoredProgress = favoredSets
            .map((setId) => overview.setProgress?.find((entry) => entry && entry.id === setId))
            .filter(Boolean)
            .map((entry) => `${entry.icon || '✦'} ${entry.label} ${entry.owned}/${entry.total}（视作 ${entry.pieces} 件）`);
        return {
            ...overview,
            spotlight: [
                ...(runPathMeta?.treasureSynergy ? [
                    `当前命途推荐：${runPathMeta.icon || '🧭'} ${runPathMeta.name} · ${favoredLabels.join(' / ')} · ${runPathMeta.treasureSynergy.summary || '优先围绕推荐套装补件。'}`,
                    favoredProgress.length > 0
                        ? `当前命途协同进度：${favoredProgress.join(' / ')}`
                        : `当前命途协同仍未成型，可优先补 ${favoredLabels.join(' / ')}。`
                ] : []),
                `核心件 ${overview.coreOwned || 0}/${overview.coreTotal || 0} · 形态件 ${overview.formOwned || 0}/${overview.formTotal || 0}`,
                `已激活铭刻 ${overview.activeWorkshops || 0} 条：重铸 ${overview.activeReforges || 0} / 器灵 ${overview.activeInfusions || 0} / 套装修正 ${overview.activeSetEchoes || 0}`,
                overview.readyInfusions && overview.readyInfusions.length > 0
                    ? `当前可灌注：${overview.readyInfusions.join('、')}`
                    : '当前没有已装备核心件待灌注，可继续先收集或装备核心法宝。'
            ]
        };
    }

    getTreasureCompendiumQuickFilterValue() {
        const state = this.getTreasureCompendiumFilterState();
        if (state.status !== 'all' && state.rarities.length === 0 && state.sources.length === 0) return state.status;
        if (state.status === 'all' && state.rarities.length === 1 && state.sources.length === 0) return state.rarities[0];
        if (state.status === 'all' && state.rarities.length === 0 && state.sources.length === 1) return state.sources[0];
        if (state.status === 'all' && state.rarities.length === 0 && state.sources.length === 0) return 'all';
        return 'custom';
    }

    getTreasureCompendiumFilterLabels(state = null) {
        state = this.normalizeTreasureCompendiumFilterState(state || this.getTreasureCompendiumFilterState());
        const labels = [];
        const statusMap = { owned: '已收录', unowned: '未收录' };
        const rarityMap = { common: '凡品', rare: '灵品', legendary: '神品', mythic: '仙品' };
        const sourceMap = { shop: '商店', elite: '精英', boss: '首领', event: '事件', camp: '营地', challenge: '挑战' };
        if (state.status !== 'all') labels.push(statusMap[state.status] || state.status);
        state.rarities.forEach((value) => labels.push(rarityMap[value] || value));
        state.sources.forEach((value) => labels.push(sourceMap[value] || value));
        return labels;
    }

    toggleTreasureCompendiumFilterChip(group, value) {
        const state = this.getTreasureCompendiumFilterState();
        if (group === 'status') {
            state.status = state.status === value ? 'all' : value;
        } else if (group === 'rarity' || group === 'source') {
            const key = group === 'rarity' ? 'rarities' : 'sources';
            const next = new Set(Array.isArray(state[key]) ? state[key] : []);
            if (next.has(value)) next.delete(value);
            else next.add(value);
            state[key] = Array.from(next);
        }
        this.treasureCompendiumFilterState = this.normalizeTreasureCompendiumFilterState(state);
        this.treasureCompendiumFilter = this.getTreasureCompendiumQuickFilterValue();
        this.showTreasureCompendium();
    }

    passesTreasureCompendiumFilter(item) {
        const state = this.getTreasureCompendiumFilterState();
        const rarity = item?.data?.rarity || 'common';
        const sourceTags = this.getTreasureSourceTags(item?.data || {});
        const research = typeof this.getTreasureResearchData === 'function'
            ? this.getTreasureResearchData(item?.data || {})
            : { role: { label: '' }, setLabel: '', setMeta: { theme: '' }, focusTags: [] };
        const query = this.getTreasureCompendiumSearchQuery().toLowerCase();
        if (state.status === 'owned' && !item?.isOwned) return false;
        if (state.status === 'unowned' && item?.isOwned) return false;
        if (state.rarities.length > 0 && !state.rarities.includes(rarity)) return false;
        if (state.sources.length > 0 && !state.sources.some((tag) => sourceTags.includes(tag))) return false;
        if (query) {
            const haystack = [
                item?.id,
                item?.data?.name,
                item?.data?.description,
                item?.data?.lore,
                this.game.getTreasureSource(item?.data || {}),
                ...sourceTags,
                research?.role?.label || '',
                research?.setLabel || '',
                research?.setMeta?.theme || '',
                ...(research?.focusTags || []),
                this.game.getRarityLabel(rarity).replace(/<[^>]+>/g, '')
            ].join(' ').toLowerCase();
            if (!haystack.includes(query)) return false;
        }
        return true;
    }

    sortTreasureCompendiumItems(items) {
        const list = Array.isArray(items) ? [...items] : [];
        const sortMode = this.treasureCompendiumSort || 'rarity_desc';
        const rarityScore = { mythic: 4, legendary: 3, rare: 2, common: 1 };
        return list.sort((a, b) => {
            const realmA = TREASURE_CONFIG?.unlockRealm?.[a.id] || 1;
            const realmB = TREASURE_CONFIG?.unlockRealm?.[b.id] || 1;
            if (sortMode === 'name_asc') return String(a.data?.name || '').localeCompare(String(b.data?.name || ''));
            if (sortMode === 'owned_first' && a.isOwned !== b.isOwned) return Number(b.isOwned) - Number(a.isOwned);
            if (sortMode === 'realm_asc' && realmA !== realmB) return realmA - realmB;
            const rarityA = rarityScore[a.data?.rarity || 'common'] || 1;
            const rarityB = rarityScore[b.data?.rarity || 'common'] || 1;
            if (rarityA !== rarityB) return rarityB - rarityA;
            if (sortMode === 'owned_first' && realmA !== realmB) return realmA - realmB;
            return String(a.id || '').localeCompare(String(b.id || ''));
        });
    }

    showTreasureCompendium() {
        this.game.showScreen('treasure-compendium');

        const grid = document.getElementById('treasure-compendium-grid');
        const statsEl = document.getElementById('treasure-compendium-stats');
        const filterSelect = document.getElementById('treasure-filter-select');
        const sortSelect = document.getElementById('treasure-sort-select');
        const searchInput = document.getElementById('treasure-search-input');
        const researchEl = document.getElementById('treasure-compendium-research');
        if (!grid) return;

        const filterState = this.getTreasureCompendiumFilterState();
        this.treasureCompendiumFilter = this.getTreasureCompendiumQuickFilterValue();
        this.treasureCompendiumSort = this.treasureCompendiumSort || 'rarity_desc';
        const searchQuery = this.getTreasureCompendiumSearchQuery();
        if (filterSelect) filterSelect.value = this.treasureCompendiumFilter;
        if (sortSelect) sortSelect.value = this.treasureCompendiumSort;
        if (searchInput && searchInput.value !== searchQuery) searchInput.value = searchQuery;
        [0, 1, 2].forEach((slot) => {
            const applyBtn = document.getElementById(`treasure-preset-slot-${slot}`);
            const saveBtn = document.getElementById(`treasure-preset-save-${slot}`);
            if (applyBtn) {
                applyBtn.textContent = this.getTreasureCompendiumPresetLabel(slot);
                applyBtn.classList.toggle('active', this.isTreasureCompendiumPresetActive(slot));
                applyBtn.title = this.getTreasureCompendiumPresetLabel(slot);
            }
            if (saveBtn) saveBtn.title = `保存到${slot + 1}号预设`;
        });

        document.querySelectorAll('#treasure-compendium [data-filter-chip-group]').forEach((chip) => {
            const group = chip.dataset.filterChipGroup;
            const value = chip.dataset.filterChipValue;
            const active = group === 'status'
                ? filterState.status === value
                : (group === 'rarity'
                    ? filterState.rarities.includes(value)
                    : filterState.sources.includes(value));
            chip.classList.toggle('active', active);
        });

        grid.innerHTML = '';
        if (statsEl) statsEl.innerHTML = '';

        let allTreasures = [];
        let ownedCount = 0;

        for (const tid in TREASURES) {
            const t = TREASURES[tid];
            const isOwned = this.game.player.hasTreasure(tid);
            if (isOwned) ownedCount++;
            allTreasures.push({ id: tid, data: t, isOwned });
        }

        const filteredTreasures = this.sortTreasureCompendiumItems(allTreasures.filter((item) => this.passesTreasureCompendiumFilter(item)));

        if (filteredTreasures.length === 0) {
            grid.innerHTML = '<div class="codex-empty-state">当前检索条件下没有匹配的法宝，试试清空关键词或切换来源 / 品质筛选。</div>';
        }

        filteredTreasures.forEach((item) => {
            const t = item.data;
            const isOwned = item.isOwned;
            const rarity = t.rarity || 'common';
            const research = this.getTreasureResearchData(t);
            const el = document.createElement('div');
            el.className = `compendium-item rarity-${rarity} ${isOwned ? 'unlocked' : 'locked'}`;
            const icon = t.icon || '📦';
            const name = t.name;
            el.innerHTML = `
                <div class="compendium-item-inner">
                    <div class="compendium-icon ${isOwned ? '' : 'locked'}">${icon}</div>
                    <div class="compendium-name ${isOwned ? '' : 'locked'}">${name}</div>
                    <div class="compendium-item-sub">
                        <span class="compendium-mini-badge ${research?.role?.tier || 'base'}">${research?.role?.label || '基础件'}</span>
                        <span class="compendium-mini-text">${research?.setMeta ? `${research.setMeta.icon || '✦'} ${research.setLabel}` : '散修 / 单卡件'}</span>
                    </div>
                </div>
            `;
            el.onclick = () => { this.showTreasureDetail(t, isOwned); };
            grid.appendChild(el);
        });

        if (statsEl) {
            statsEl.innerHTML = `
                <span class="stat-icon">🎒</span>
                <span class="stat-text">法宝收藏进度: <span style="color:var(--accent-gold); font-weight:bold;">${ownedCount}</span> / ${allTreasures.length}</span>
            `;
        }

        const summaryEl = document.getElementById('treasure-compendium-summary');
        const rarityEl = document.getElementById('treasure-compendium-rarity');
        const progress = allTreasures.length > 0 ? Math.round((ownedCount / allTreasures.length) * 100) : 0;
        const rarityOrder = ['common', 'rare', 'legendary', 'mythic'];
        const rarityNameMap = { common: '凡品', rare: '灵品', legendary: '神品', mythic: '仙品' };
        const sortLabelMap = { rarity_desc: '品质优先', owned_first: '已收录优先', realm_asc: '解锁层数优先', name_asc: '名称排序' };
        const researchOverview = this.getTreasureResearchOverviewData();
        const activeFilterLabels = this.getTreasureCompendiumFilterLabels();
        if (searchQuery) activeFilterLabels.unshift(`关键词「${searchQuery}」`);
        const rarityCounts = rarityOrder.map((rarity) => {
            const total = allTreasures.filter((item) => (item.data.rarity || 'common') === rarity).length;
            const owned = allTreasures.filter((item) => (item.data.rarity || 'common') === rarity && item.isOwned).length;
            return { rarity, total, owned };
        });

        if (summaryEl) {
            summaryEl.innerHTML = [
                '<span class="codex-side-kicker">藏品总览</span>',
                '<h3>法宝收藏进度</h3>',
                `<div class="codex-summary-metric"><strong>${ownedCount}</strong><span>/ ${allTreasures.length} 已收录</span></div>`,
                `<div class="codex-progress-track"><div class="codex-progress-fill" style="width:${progress}%"></div></div>`,
                '<ul class="codex-side-list compact">',
                `<li>当前筛选结果 ${filteredTreasures.length} 件 · 条件 ${activeFilterLabels.length > 0 ? activeFilterLabels.join(' / ') : '全部法宝'} / 排序 ${sortLabelMap[this.treasureCompendiumSort] || this.treasureCompendiumSort}。</li>`,
                '<li>点击主区任意法宝即可查看来源、套装关系、适配流派与当前铭刻状态。</li>',
                '</ul>'
            ].join('');
        }

        if (rarityEl) {
            rarityEl.innerHTML = [
                '<span class="codex-side-kicker">稀有度分布</span>',
                '<h3>稀有度概览</h3>',
                '<div class="codex-summary-grid">',
                ...rarityCounts.map((entry) => `<div class="codex-summary-chip rarity-${entry.rarity}"><strong>${entry.owned}/${entry.total}</strong><span>${rarityNameMap[entry.rarity]}</span></div>`),
                '</div>',
                '<p class="codex-side-note">顶部 quick filter 可快速切换，下面多选 chip 可叠加来源与稀有度条件。</p>'
            ].join('');
        }

        if (researchEl) {
            researchEl.innerHTML = [
                '<span class="codex-side-kicker">炼器研究</span>',
                '<h3>套装 / 核心件</h3>',
                '<div class="treasure-research-grid">',
                ...researchOverview.setProgress.map((entry) => `
                    <div class="treasure-research-chip ${entry.resonanceStage}">
                        <strong>${entry.icon || '✦'} ${entry.label}</strong>
                        <span>${entry.owned}/${entry.total} 收录 · 视作 ${entry.pieces} 件</span>
                        <em>${entry.resonanceLabel}</em>
                    </div>
                `),
                '</div>',
                '<ul class="codex-side-list compact">',
                ...researchOverview.spotlight.map((line) => `<li>${line}</li>`),
                '</ul>'
            ].join('');
        }
    }

    showTreasureDetail(treasure, isUnlocked) {
        const modal = document.getElementById('treasure-detail-modal');
        if (!modal) return;

        const elIcon = document.getElementById('detail-icon');
        const elName = document.getElementById('detail-name');
        const elRarity = document.getElementById('detail-rarity');
        const elDesc = document.getElementById('detail-desc');
        const elLore = document.getElementById('detail-lore');
        const elSource = document.getElementById('detail-source');
        const elOwnedState = document.getElementById('detail-owned-state');
        const elRoleState = document.getElementById('detail-role-state');
        const elSetState = document.getElementById('detail-set-state');
        const elInfusionState = document.getElementById('detail-infusion-state');
        const elSet = document.getElementById('detail-set');
        const elBuildFit = document.getElementById('detail-build-fit');
        const elForgeStatus = document.getElementById('detail-forge-status');
        const header = modal.querySelector('.detail-header');

        if (!elIcon || !elName) return;

        header.className = 'detail-header';
        if (elOwnedState) elOwnedState.className = 'detail-status-chip';
        if (elRoleState) elRoleState.className = 'detail-status-chip';
        if (elSetState) elSetState.className = 'detail-status-chip';
        if (elInfusionState) elInfusionState.className = 'detail-status-chip';

        const rarity = treasure.rarity || 'common';
        const rarityLabel = this.game.getRarityLabel(rarity);
        const research = this.getTreasureResearchData(treasure);

        header.classList.add(`rarity-${rarity}`);
        elIcon.textContent = treasure.icon || '📦';
        elName.textContent = treasure.name;
        elRarity.innerHTML = rarityLabel;

        let desc = treasure.description;
        try {
            if (treasure.getDesc) desc = treasure.getDesc(this.game.player);
        } catch (e) {
            console.warn('Desc gen failed', e);
        }
        desc = desc.replace(/([\d.]+|[+\-]\d+%?)/g, '<span style="color:#ffb74d;">$1</span>');
        elDesc.innerHTML = desc;

        elLore.textContent = treasure.lore || '（此物似乎蕴含着某种未知的力量...）';
        elLore.style.visibility = 'visible';

        elSource.innerHTML = research.sourceText || this.game.getTreasureSource(treasure);
        if (elSet) elSet.innerHTML = research.setText || '暂无套装研究记录。';
        if (elBuildFit) elBuildFit.innerHTML = research.buildFitText || '暂无适配建议。';
        if (elForgeStatus) elForgeStatus.innerHTML = research.forgeText || '尚未进行炼器改造。';
        if (elRoleState) {
            elRoleState.textContent = research?.role?.label || '基础件';
            elRoleState.classList.add('research');
            if (research?.role?.tier === 'core') elRoleState.classList.add('eligible');
            if (research?.role?.tier === 'base') elRoleState.classList.add('muted');
        }
        if (elSetState) {
            elSetState.textContent = research?.setMeta ? `${research.setMeta.icon || '✦'} ${research.setLabel}` : '散修 / 单卡件';
            elSetState.classList.add('research');
        }
        if (elInfusionState) {
            elInfusionState.textContent = research?.infusionEligible ? '可器灵灌注' : '暂不开放灌注';
            if (research?.infusionEligible) elInfusionState.classList.add('eligible');
            else elInfusionState.classList.add('muted');
        }

        if (!isUnlocked) {
            elIcon.style.filter = 'grayscale(1) brightness(0.7)';
            elName.style.color = '#888';
            elRarity.innerHTML += ' <span style="font-size:0.8em; color:#666">(未获取)</span>';
            if (elOwnedState) {
                elOwnedState.textContent = '未收录';
                elOwnedState.classList.add('locked');
            }
        } else {
            elIcon.style.filter = '';
            elName.style.color = '';
            if (elOwnedState) {
                elOwnedState.textContent = '已收录';
                elOwnedState.classList.add('owned');
            }
        }

        modal.classList.add('active');

        if (typeof audioManager !== 'undefined') {
            audioManager.playSFX('click');
        }
    }

}

// Temporary export mechanism
if (typeof window !== 'undefined') {
    window.InventoryView = InventoryView;
}
