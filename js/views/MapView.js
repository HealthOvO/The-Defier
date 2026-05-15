/**
 * MapView
 * Handles rendering and interaction for the Map screen.
 */

export class MapView {
  constructor(gameInstance, mapInstance) {
    this.game = gameInstance;
    this.map = mapInstance;
  }
  render() {
    console.log('[Debug] MapView.render called');
    const container = document.getElementById('map-screen');
    if (!container) {
      console.error('[Debug] #map-screen container missing!');
      return;
    }
    const currentRealm = this.game.player.realm;
    const mapKey = this.game && typeof this.game.getMapCacheKey === 'function' ? this.game.getMapCacheKey(currentRealm) : String(currentRealm);
    const nodeLayoutSignature = this.map.getNodeLayoutSignature();
    const existingMap = container.querySelector('.map-screen-v3');

    // Smart Render Check: If map exists and the node layout is unchanged, update in-place.
    if (existingMap && existingMap.dataset.mapKey === mapKey && existingMap.dataset.nodeSignature === nodeLayoutSignature) {
      console.log('[Debug] Updating existing map in-place');
      this.map.updateMapState();
      return;
    }
    console.log('[Debug] Full map rebuild for realm:', currentRealm);
    container.innerHTML = `
            <div class="map-screen-v3" data-realm="${currentRealm}" data-map-key="${mapKey}" data-node-signature="${nodeLayoutSignature}">
                <div class="map-bg-layer map-bg-stars"></div>
                <div class="map-bg-layer map-bg-mist"></div>
                
                <div class="map-v3-header">
                    <button class="back-btn" type="button" data-map-action="show-screen" data-screen-id="realm-select-screen">← 返回关卡</button>
                    <div class="map-header-right">
                        <div class="player-status-bar">
                            <div class="status-item hp">
                                <span class="icon">❤️</span>
                                <span id="map-hp">${this.game.player.currentHp}/${this.game.player.maxHp}</span>
                            </div>
                            <div class="status-item gold">
                                <span class="icon">💰</span>
                                <span id="map-gold">${this.game.player.gold}</span>
                            </div>
                            <div class="status-item floor">
                                <span class="icon">🏔️</span>
                                <span id="map-floor">${this.map.getRealmName(this.game.player.realm)}</span>
                            </div>
                        </div>
                        <div id="map-situation-overview" class="map-situation-overview" style="display:none;"></div>
                        <div id="map-chapter-risk-card" class="map-chapter-risk-card" style="display:none;"></div>
                        <div id="map-chapter-brief" class="map-chapter-brief" style="display:none;"></div>
                        <div id="map-adventure-buffs" class="map-adventure-buffs" style="display:none;"></div>
                        <div id="map-route-hints" class="map-route-hints" style="display:none;"></div>
                        <div id="map-endless-panel" class="map-endless-panel" style="display:none;"></div>
                        <div id="map-legacy-mission" class="map-legacy-mission" style="display:none;">
                            <div class="mission-title">传承试炼</div>
                            <div class="mission-desc">暂无进行中的试炼</div>
                            <div class="mission-track">
                                <div class="mission-fill"></div>
                            </div>
                            <div class="mission-progress">0/0</div>
                        </div>
                        <div id="map-run-path-mission" class="map-legacy-mission" style="display:none;">
                            <div class="mission-title">命途主线</div>
                            <div class="mission-desc">暂无进行中的命途</div>
                            <div class="mission-track">
                                <div class="mission-fill"></div>
                            </div>
                            <div class="mission-progress">0/0</div>
                        </div>
                        <div id="map-run-path-flash" class="map-run-path-flash" style="display:none;"></div>
                    </div>
                </div>

                <div class="map-scroll-container" id="map-scroll-container">
                    <div class="map-content-wrapper" id="map-content-wrapper">
                        <!-- SVG Layer -->
                        <svg class="map-connections-svg" id="map-svg-layer"></svg>
                    </div>
                </div>

                <div class="map-footer">
                    <button class="menu-btn small" type="button" data-map-action="show-deck">查看牌组</button>
                    <button class="menu-btn small" type="button" data-map-action="show-treasure-bag">法宝囊</button>
                    <button class="menu-btn small" type="button" data-map-action="show-fate-ring">命环</button>
                </div>
            </div>
        `;
    this.bindMapDelegates(container);
    this.renderV3Nodes();
    this.map.updateStatusBar();

    // Auto-scroll to current row
    setTimeout(() => {
      const wrapper = document.getElementById('map-scroll-container');
      const currentRow = document.querySelector('.node-row-v3:has(.map-node-v3.current)');
      if (wrapper && currentRow) {
        const scrollPos = currentRow.offsetTop - wrapper.clientHeight / 2 + currentRow.clientHeight / 2;
        wrapper.scrollTo({
          top: Math.max(0, scrollPos),
          behavior: 'smooth'
        });
      }
    }, 100);
  }
  updateMapState() {
    this.map.updateStatusBar();
    this.map.nodes.forEach(row => {
      row.forEach(node => {
        const el = document.querySelector(`.map-node-v3[data-node-id="${node.id}"]`);
        if (el) {
          el.classList.remove('completed', 'locked', 'current', 'accessible');
          if (node.completed) el.classList.add('completed');
          else if (!node.accessible) el.classList.add('locked');
          else el.classList.add('current');
        }
      });
    });
    this.map.drawConnections();
  }
  bindMapDelegates(container) {
    if (!container || container.__mapDelegatesBound) return;
    container.addEventListener('click', event => {
      const target = event.target;
      if (!target || typeof target.closest !== 'function') return;
      const actionBtn = target.closest('[data-map-action]');
      if (!actionBtn || actionBtn.disabled || !container.contains(actionBtn)) return;
      const action = String(actionBtn.dataset.mapAction || '');
      if (action === 'show-screen') {
        const screenId = String(actionBtn.dataset.screenId || '');
        if (screenId) {
          this.game.showScreen(screenId);
        }
        return;
      }
      if (action === 'show-deck') {
        this.game.showDeck();
        return;
      }
      if (action === 'show-treasure-bag') {
        this.game.showTreasureBag();
        return;
      }
      if (action === 'show-fate-ring') {
        this.game.showFateRing();
      }
    });
    container.__mapDelegatesBound = true;
  }

  renderV3Nodes() {
    const wrapper = document.getElementById('map-content-wrapper');
    const svgLayer = document.getElementById('map-svg-layer');
    if (!wrapper || !svgLayer) return;
    const chapter = this.game && typeof this.game.getChapterDisplaySnapshot === 'function' ? this.game.getChapterDisplaySnapshot(this.game.player?.realm || 1) : null;

    // V3 Flexbox Layout System (Centered & Robust)
    this.map.nodes.forEach((rowNodes, rowIndex) => {
      const rowEl = document.createElement('div');
      rowEl.className = 'node-row-v3';
      rowEl.dataset.rowIndex = rowIndex;
      // Flex layout handles positioning automatically via justify-content: center

      rowNodes.forEach((node, i) => {
        const nodeEl = document.createElement('div');
        const riskProfile = this.map.resolveNodeRiskProfile(node, chapter);
        node.riskProfile = riskProfile;
        nodeEl.className = `map-node-v3 ${node.type}`;
        nodeEl.dataset.nodeId = node.id;
        nodeEl.dataset.riskTier = riskProfile?.tierId || 'none';
        nodeEl.innerHTML = `
                    <div class="node-icon">${node.icon}</div>
                    ${node.polluted ? '<div class="pollution-mark">☠️</div>' : ''}
                    ${riskProfile && ['high', 'extreme'].includes(riskProfile.tierId) && node.accessible && !node.completed ? `<div class="node-risk-badge tier-${riskProfile.tierId}">DRI ${riskProfile.index}</div>` : ''}
                    <div class="node-tooltip">${this.map.buildNodeTooltipHtml(node, chapter)}</div>
                `;
        nodeEl.addEventListener('click', () => this.map.onNodeClick(node));
        if (node.completed) nodeEl.classList.add('completed');else if (!node.accessible) nodeEl.classList.add('locked');else {
          nodeEl.classList.add('current');
        }

        // Just append, no manual positioning
        rowEl.appendChild(nodeEl);
      });
      wrapper.appendChild(rowEl);
    });

    // Draw Lines after DOM update and potential reflow
    // Use timeout to ensure geometry is final
    setTimeout(() => this.map.drawConnections(), 50);
    // Also redraw on resize
    if (!this.map._resizeObserver) {
      this.map._resizeObserver = new ResizeObserver(() => {
        // Throttle drawing
        if (this.map._resizeTimeout) clearTimeout(this.map._resizeTimeout);
        this.map._resizeTimeout = setTimeout(() => this.map.drawConnections(), 50);
      });
      this.map._resizeObserver.observe(wrapper);
    }
  }
}
if (typeof window !== 'undefined') {}
