/**
 * MapView
 * Handles rendering and interaction for the Map screen.
 */

export class MapView {
  constructor(gameInstance, mapInstance) {
    this.game = gameInstance;
    this.map = mapInstance;
  }
  escapeMapBriefText(value) {
    return String(value ?? '').replace(/[&<>"']/g, ch => ({
      '&': '&amp;',
      '<': '&lt;',
      '>': '&gt;',
      '"': '&quot;',
      "'": '&#39;'
    }[ch] || ch));
  }
  getMapCoreLoopBrief(displayRealmName = '') {
    const rows = Array.isArray(this.map?.nodes) ? this.map.nodes : [];
    const accessibleCount = rows.flat().filter(node => node && node.accessible && !node.completed).length;
    const runPathMeta = this.game?.player && typeof this.game.player.getRunPathMeta === 'function'
      ? this.game.player.getRunPathMeta()
      : null;
    const runPathProgress = this.game?.player?.runPathProgress || null;
    const phase = runPathMeta && Array.isArray(runPathMeta.phases)
      ? runPathMeta.phases[Math.max(0, Math.floor(Number(runPathProgress?.currentPhaseIndex) || 0))]
      : null;
    const flash = this.game?.lastRunPathMapFeedback && typeof this.game.lastRunPathMapFeedback === 'object'
      ? this.game.lastRunPathMapFeedback
      : null;
    const focusLine = flash?.summary
      || flash?.rewardText
      || (runPathMeta?.name ? `${runPathMeta.name}${phase?.label ? ` · ${phase.label}` : ''}${phase?.title ? ` · ${phase.title}` : ''}` : '')
      || '选择高亮节点继续推进';
    return {
      current: displayRealmName || '当前章节',
      next: accessibleCount > 0 ? `${accessibleCount} 处可进入节点` : '暂无可进入节点',
      focus: focusLine
    };
  }
  renderMapCoreLoopBrief(displayRealmName = '') {
    const brief = this.getMapCoreLoopBrief(displayRealmName);
    const escape = value => this.escapeMapBriefText(value);
    return `
                            <div class="map-core-loop-brief" data-core-loop-rail="map" aria-label="地图主循环提示">
                                <span class="map-core-loop-chip">
                                    <span class="map-core-loop-label">当前</span>
                                    <span class="map-core-loop-value">${escape(brief.current)}</span>
                                </span>
                                <span class="map-core-loop-chip">
                                    <span class="map-core-loop-label">可进入</span>
                                    <span class="map-core-loop-value">${escape(brief.next)}</span>
                                </span>
                                <span class="map-core-loop-chip map-core-loop-focus">
                                    <span class="map-core-loop-label">路线</span>
                                    <span class="map-core-loop-value">${escape(brief.focus)}</span>
                                </span>
                            </div>
        `;
  }
  render() {
    console.log('[Debug] MapView.render called');
    const container = document.getElementById('map-screen');
    if (!container) {
      console.error('[Debug] #map-screen container missing!');
      return;
    }
    const currentRealm = this.game.player.realm;
    const displayRealmName = this.game && typeof this.game.getDisplayRealmName === 'function'
      ? this.game.getDisplayRealmName(currentRealm)
      : this.map.getRealmName(currentRealm);
    const chapterSnapshot = this.game && typeof this.game.getChapterDisplaySnapshot === 'function'
      ? this.game.getChapterDisplaySnapshot(currentRealm)
      : null;
    const mapHeadline = chapterSnapshot
      ? `${chapterSnapshot.fullName || chapterSnapshot.name || displayRealmName}${chapterSnapshot.stageLabel ? ` · ${chapterSnapshot.stageLabel}` : ''}`
      : displayRealmName;
    const mapSubline = chapterSnapshot
      ? [chapterSnapshot.skyOmen?.name, chapterSnapshot.leyline?.name, chapterSnapshot.routePrompt].filter(Boolean).join(' · ')
      : '沿当前节点路线推进，优先处理高亮可进入节点。';
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
                        <div class="map-header-toolbar">
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
                                    <span id="map-floor">${displayRealmName}</span>
                                </div>
                            </div>
                            <div class="map-header-actions">
                                <button class="menu-btn small map-header-toggle" type="button" data-map-action="toggle-map-intel" aria-expanded="false" aria-controls="map-intel-drawer">关卡情报</button>
                                <button class="menu-btn small map-header-toggle" type="button" data-map-action="toggle-map-tools" aria-expanded="false" aria-controls="map-footer">工具</button>
                            </div>
                        </div>
                    </div>
                </div>

                <aside id="map-intel-drawer" class="map-intel-drawer" aria-hidden="true">
                    <div id="map-detail-panels" class="map-detail-panels" aria-hidden="true">
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
                    <div id="map-expedition-panels" class="map-expedition-panels" aria-hidden="true"></div>
                </aside>

                <div class="map-scroll-container" id="map-scroll-container">
                    <aside class="map-canvas-header" data-map-chapter-summary="true" aria-label="当前关卡">
                        <div class="map-canvas-kicker">当前关卡</div>
                        <div class="map-canvas-title-row">
                            <div class="map-canvas-title">${mapHeadline}</div>
                            <div class="map-canvas-stage">${displayRealmName}</div>
                        </div>
                        <div class="map-canvas-subtitle">${mapSubline}</div>
                        ${this.renderMapCoreLoopBrief(displayRealmName)}
                        <div class="map-canvas-legend" aria-hidden="true">
                            <span class="map-legend-chip current">当前可进入</span>
                            <span class="map-legend-chip completed">已完成</span>
                            <span class="map-legend-chip locked">未解锁</span>
                        </div>
                    </aside>
                    <div class="map-content-wrapper" id="map-content-wrapper">
                        <!-- SVG Layer -->
                        <svg class="map-connections-svg" id="map-svg-layer"></svg>
                    </div>
                </div>

                <div class="map-footer" id="map-footer" aria-hidden="true">
                    <button class="menu-btn small" type="button" data-map-action="show-deck">查看牌组</button>
                    <button class="menu-btn small" type="button" data-map-action="show-treasure-bag">法宝囊</button>
                    <button class="menu-btn small" type="button" data-map-action="show-fate-ring">命环</button>
                </div>
            </div>
        `;
    this.bindMapDelegates(container);
    this.renderV3Nodes();
    this.map.updateStatusBar();
    this.syncMapChrome(container);

    setTimeout(() => {
      this.scrollCurrentMapRowIntoView({ behavior: 'auto' });
    }, 100);
  }

  getCurrentMapRowElement() {
    let currentRow = null;
    try {
      currentRow = document.querySelector('.node-row-v3:has(.map-node-v3.current)');
    } catch (error) {
      const currentNode = document.querySelector('.map-node-v3.current');
      currentRow = currentNode && typeof currentNode.closest === 'function'
        ? currentNode.closest('.node-row-v3')
        : null;
    }
    if (!currentRow) {
      const currentNode = document.querySelector('.map-node-v3.current');
      currentRow = currentNode && typeof currentNode.closest === 'function'
        ? currentNode.closest('.node-row-v3')
        : null;
    }
    return currentRow;
  }

  scrollCurrentMapRowIntoView(options = {}) {
    const wrapper = document.getElementById('map-scroll-container');
    const currentRow = this.getCurrentMapRowElement();
    if (!wrapper || !currentRow) return;
    const scrollPos = currentRow.offsetTop - wrapper.clientHeight / 2 + currentRow.clientHeight / 2;
    wrapper.scrollTo({
      top: Math.max(0, scrollPos),
      behavior: options.behavior || 'auto'
    });
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
        return;
      }
      if (action === 'toggle-map-intel') {
        const shell = container.querySelector('.map-screen-v3');
        if (!shell) return;
        shell.dataset.mapIntelUserToggled = 'true';
        shell.classList.toggle('show-map-intel');
        if (shell.classList.contains('show-map-intel')) {
          shell.classList.remove('show-map-tools');
        }
        this.syncMapChrome(container);
        if (shell.classList.contains('show-map-intel')) {
          requestAnimationFrame(() => this.scrollCurrentMapRowIntoView({ behavior: 'auto' }));
          setTimeout(() => this.scrollCurrentMapRowIntoView({ behavior: 'auto' }), 220);
        }
        return;
      }
      if (action === 'toggle-map-tools') {
        const shell = container.querySelector('.map-screen-v3');
        if (!shell) return;
        shell.classList.toggle('show-map-tools');
        if (shell.classList.contains('show-map-tools')) {
          shell.dataset.mapIntelUserToggled = 'true';
          shell.classList.remove('show-map-intel');
        }
        this.syncMapChrome(container);
      }
    });
    container.__mapDelegatesBound = true;
  }

  syncMapChrome(container) {
    if (!container) return;
    const shell = container.querySelector('.map-screen-v3');
    if (!shell) return;
    const intelOpen = shell.classList.contains('show-map-intel');
    const toolsOpen = shell.classList.contains('show-map-tools');
    const intelBtn = container.querySelector('[data-map-action="toggle-map-intel"]');
    const toolsBtn = container.querySelector('[data-map-action="toggle-map-tools"]');
    const intelDrawer = container.querySelector('#map-intel-drawer');
    const detailPanels = container.querySelector('#map-detail-panels');
    const expeditionPanels = container.querySelector('#map-expedition-panels');
    const footer = container.querySelector('#map-footer');
    if (intelBtn) {
      intelBtn.textContent = intelOpen ? '收起情报' : '关卡情报';
      intelBtn.setAttribute('aria-expanded', intelOpen ? 'true' : 'false');
    }
    if (toolsBtn) {
      toolsBtn.textContent = toolsOpen ? '收起工具' : '工具';
      toolsBtn.setAttribute('aria-expanded', toolsOpen ? 'true' : 'false');
    }
    if (detailPanels) {
      detailPanels.setAttribute('aria-hidden', intelOpen ? 'false' : 'true');
    }
    if (intelDrawer) {
      intelDrawer.setAttribute('aria-hidden', intelOpen ? 'false' : 'true');
    }
    if (expeditionPanels) {
      expeditionPanels.setAttribute('aria-hidden', intelOpen ? 'false' : 'true');
    }
    if (footer) {
      footer.setAttribute('aria-hidden', toolsOpen ? 'false' : 'true');
      footer.style.opacity = toolsOpen ? '1' : '';
      footer.style.pointerEvents = toolsOpen ? 'auto' : '';
      footer.style.transform = toolsOpen ? 'translateY(0)' : '';
    }
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
