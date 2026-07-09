import { Utils } from "../core/utils.js";
import { particles } from "../core/particles.js";
import { REALM_ENVIRONMENTS } from "../data/environments.js";
import { AuthService } from "../services/authService.js";
import { CHARACTERS } from "../data/index.js";
export class SystemView {
  constructor(gameInstance) {
    this.game = gameInstance;
  }
  showLegacyScreen() {
    this.showScreen('inheritance-screen');
  }
  showFirstBattleGuide() {
    if (!this.game.guideState || this.game.guideState.firstBattleGuideSeen) return;
    this.game.markGuideSeen('firstBattleGuideSeen');
    const tips = ['新手提示：先看敌方意图，再决定是进攻还是防御。', '新手提示：打完牌后，点击“结束回合”推进战斗。', '新手提示：按 L 可以打开战斗记录，复盘每次触发。'];
    tips.forEach((msg, idx) => {
      setTimeout(() => {
        Utils.showBattleLog(msg, {
          category: 'system',
          duration: 2800
        });
      }, idx * 1700);
    });
  }
  showScreen(screenId) {
    console.log(`[Debug] showScreen called for: ${screenId}`);
    document.querySelectorAll('.screen').forEach(screen => {
      screen.classList.remove('active');
    });
    const screen = document.getElementById(screenId);
    if (screen) {
      // Safety: Ensure screen is visible before running logic that might crash
      screen.classList.add('active');
      this.game.currentScreen = screenId;
      if (document.body) {
        document.body.dataset.currentScreen = screenId;
      }
      this.game.dismissBattleOverlaysForScreen(screenId);
      this.game.resetScreenAmbientState(screenId);
      this.game.resetScreenScrollPosition(screen);
      console.log(`[Debug] Screen ${screenId} set to active class.`);
      if (screenId === 'map-screen') {
        const resetMapScroll = () => {
          const mapSurface = screen.querySelector('.map-screen-v3');
          if (mapSurface) {
            mapSurface.scrollTop = 0;
            mapSurface.scrollLeft = 0;
            if (typeof mapSurface.scrollTo === 'function') {
              mapSurface.scrollTo({
                top: 0,
                left: 0,
                behavior: 'auto'
              });
            }
          }
        };
        setTimeout(resetMapScroll, 0);
        setTimeout(resetMapScroll, 220);
      }

      // Use Try-Catch to prevent logical errors from blocking UI rendering (Black Screen Fix)
      try {
        // Particle Control
        if (typeof particles !== 'undefined') {
          if (screenId === 'main-menu') {
            particles.startMainMenuParticles();
            this.game.tryShowMainMenuGuide();
          } else {
            particles.stopMainMenuParticles();
          }
        }

        // 特殊处理
        if (screenId === 'map-screen') {
          console.log('[Debug] Initializing map-screen logic');
          if (this.game.map) {
            console.log('[Debug] Calling this.game.map.render()');
            this.game.map.render();
            if (typeof this.game.renderExpeditionMapPanels === 'function') {
              this.game.renderExpeditionMapPanels();
            }
          } else {
            console.error('[Debug] this.game.map is undefined!');
          }
          console.log('[Debug] Calling updatePlayerDisplay()');
          this.game.updatePlayerDisplay();
          this.game.refreshLegacyMissionTrackers();

          // DEBUG: Check DOM state after render
          setTimeout(() => {
            const mapScreen = document.getElementById('map-screen');
            if (mapScreen) {
              const style = window.getComputedStyle(mapScreen);
              console.log(`[Debug] #map-screen style: display=${style.display}, visibility=${style.visibility}, opacity=${style.opacity}, height=${style.height}, width=${style.width}, z-index=${style.zIndex}`);
              console.log(`[Debug] #map-screen Parent: <${mapScreen.parentNode.tagName} id="${mapScreen.parentNode.id}" class="${mapScreen.parentNode.className}">`);
              console.log(`[Debug] #map-screen innerHTML length: ${mapScreen.innerHTML.length}`);

              // Audit body children for overlays
              console.log('[Debug] Auditing Body Children for Overlays:');
              Array.from(document.body.children).forEach(child => {
                const s = window.getComputedStyle(child);
                if (s.display !== 'none' && s.visibility !== 'hidden' && parseFloat(s.opacity) > 0) {
                  console.log(`[Debug] Visible Child: <${child.tagName} id="${child.id}" class="${child.className}"> Z=${s.zIndex} Pos=${s.position} Rect=${child.getBoundingClientRect().height}x${child.getBoundingClientRect().width}`);
                }
              });
            }
          }, 500); // Delayed check
        } else if (screenId === 'battle-screen') {
          console.log('[Debug] Initializing battle-screen logic');
          this.game.updatePlayerDisplay();
          this.game.refreshLegacyMissionTrackers();
          if (!this.game.guideState.battleLogHintSeen) {
            this.game.markGuideSeen('battleLogHintSeen');
            setTimeout(() => {
              Utils.showBattleLog('提示：按 L 可查看战斗记录面板。', {
                category: 'system',
                duration: 2600
              });
            }, 350);
          }
        } else if (screenId === 'collection') {
          this.game.initCollection();
        } else if (screenId === 'achievements-screen') {
          this.game.initAchievements();
        } else if (screenId === 'inheritance-screen') {
          this.game.initInheritanceScreen();
        } else if (screenId === 'character-select') {
          this.game.updateCharacterInfo();
        } else if (screenId === 'realm-select-screen') {
          this.game.initRealmSelect();
        }
        console.log(`[Debug] showScreen logic for ${screenId} completed successfully.`);
      } catch (e) {
        console.error(`Error initializing screen ${screenId}:`, e);
        // Try to show error safely
        if (typeof Utils !== 'undefined' && Utils.showBattleLog) {
          Utils.showBattleLog('界面加载异常: ' + e.message);
        }
      }
    } else {
      console.error(`[Debug] Screen element #${screenId} NOT FOUND in DOM!`);
    }
  }
  showVictoryScreen() {
    document.getElementById('game-over-title').textContent = '逆天成功！';
    document.getElementById('game-over-title').classList.add('victory');
    document.getElementById('game-over-text').textContent = '你打破了命运的枷锁，成为了真正的逆命者！';
    document.getElementById('stat-floor').textContent = this.game.map.getRealmName(this.game.player.realm);
    document.getElementById('stat-enemies').textContent = this.game.player.enemiesDefeated;
    document.getElementById('stat-laws').textContent = this.game.player.collectedLaws.length;
    const legacyStat = document.getElementById('stat-legacy');
    if (legacyStat) {
      legacyStat.textContent = `+${this.game.lastLegacyGain || 0}（库存 ${this.game.legacyProgress.essence}）`;
    }
    this.showScreen('game-over-screen');
  }
  showCheatMonsterSelector() {
    const modalId = 'cheat-monster-selector';
    let modal = document.getElementById(modalId);
    if (!modal) {
      modal = document.createElement('div');
      modal.id = modalId;
      modal.style.cssText = `
                position: fixed; top: 0; left: 0; width: 100%; height: 100%;
                background: rgba(0,0,0,0.85); z-index: 10000; display: flex;
                flex-direction: column; padding: 20px; overflow-y: auto;
                color: #fff; font-family: sans-serif;
            `;
      document.body.appendChild(modal);
    }
    modal.innerHTML = `
            <div style="display:flex; justify-content:space-between; margin-bottom:20px; border-bottom:1px solid #444; padding-bottom:10px;">
                <h2 style="margin:0; color:gold;">⚔️ 试炼场 (Debug)</h2>
                <button type="button" data-system-action="close-cheat-monster-selector" style="padding:5px 15px;">关闭</button>
            </div>
            <div id="cheat-realm-list" style="display:grid; grid-template-columns: repeat(auto-fill, minmax(250px, 1fr)); gap:15px;"></div>
        `;
    if (!modal.__cheatMonsterDelegatesBound) {
      modal.addEventListener('click', event => {
        const target = event.target;
        if (!target || typeof target.closest !== 'function') return;
        const actionBtn = target.closest('[data-system-action]');
        if (!actionBtn || actionBtn.disabled || !modal.contains(actionBtn)) return;
        const action = String(actionBtn.dataset.systemAction || '');
        if (action === 'close-cheat-monster-selector') {
          modal.style.display = 'none';
          return;
        }
        if (action === 'start-debug-battle') {
          const realm = Number(actionBtn.dataset.realmIndex || 0);
          const battleType = String(actionBtn.dataset.battleType || 'normal');
          if (realm > 0) {
            this.game.startDebugBattle(realm, battleType);
            modal.style.display = 'none';
          }
        }
      });
      modal.__cheatMonsterDelegatesBound = true;
    }
    const list = modal.querySelector('#cheat-realm-list');

    // 遍历所有境界 (1-14)
    for (let r = 1; r <= 14; r++) {
      const realmData = REALM_ENVIRONMENTS[r] || {
        name: `第${r}重天`
      };
      const card = document.createElement('div');
      card.style.cssText = `
                background: #222; border: 1px solid #555; padding: 10px; border-radius: 4px;
            `;

      // 添加两个通用测试按钮
      const btnStyle = "display:block; width:100%; margin:5px 0; padding:8px; background:#333; color:#eee; border:none; cursor:pointer; text-align:left;";
      card.innerHTML = `<h3 style="margin-top:0; color:#ddd;">${r}. ${realmData.name}</h3>`;

      // 1. 生成普通测试怪
      const normalBtn = document.createElement('button');
      normalBtn.style.cssText = btnStyle;
      normalBtn.textContent = "👊 生成随机小怪 (Random)";
      normalBtn.type = 'button';
      normalBtn.dataset.systemAction = 'start-debug-battle';
      normalBtn.dataset.realmIndex = String(r);
      normalBtn.dataset.battleType = 'normal';
      card.appendChild(normalBtn);

      // 2. 生成 Boss
      const bossBtn = document.createElement('button');
      bossBtn.style.cssText = btnStyle;
      bossBtn.textContent = "💀 生成 Boss";
      bossBtn.type = 'button';
      bossBtn.dataset.systemAction = 'start-debug-battle';
      bossBtn.dataset.realmIndex = String(r);
      bossBtn.dataset.battleType = 'boss';
      card.appendChild(bossBtn);
      list.appendChild(card);
    }
    modal.style.display = 'flex';
  }
  showGameIntro() {
    const modal = document.getElementById('settings-modal');
    // 确保模态框存在
    if (!modal) {
      console.error('Settings modal not found!');
      return;
    }
    const settingsContainer = document.getElementById('settings-options');
    if (!settingsContainer) return;

    // Content for specific tabs
    // Tab 1: Overview
    const overviewContent = `
            <div class="intro-section">
                <h3><span style="font-size:1.5rem; margin-right:10px;">☯</span> 游戏定位</h3>
                <p class="intro-text">
                    《逆命者 The Defier》是一款东方仙侠卡牌 Roguelike。你将在随机地图中选择战斗、事件、商店、营地与工程节点，
                    通过卡牌、法宝、法则、命环、灵契和洞府议程拼出自己的逆命路线。
                </p>
                <ul class="intro-list">
                    <li><strong>主线挑战</strong>：读懂章节规则与 Boss 压力，闯过天域并完成逆天改命。</li>
                    <li><strong>局内成长</strong>：围绕 1-2 条核心主轴拿牌、拿法宝、偷法则、升命环。</li>
                    <li><strong>局外复盘</strong>：把章节答卷、构筑快照、洞府议程和赛季任务沉淀到下一轮。</li>
                    <li><strong>对抗玩法</strong>：天道榜提供 PVP DRI、焦点约战、镜像练习、实时论道赛后复盘与赛季商店。</li>
                </ul>
            </div>

            <div class="intro-section">
                <h3>🚀 60秒上手</h3>
                <ul class="intro-list">
                    <li>点击「新的轮回」进入选角，先选一个自己能理解的角色节奏。</li>
                    <li>进入地图后先读章节简报、DRI 风险和命途任务，再决定走战斗、商店、事件还是工程节点。</li>
                    <li>战斗中先看敌方意图，再决定攻、防、净化、破盾或斩杀的顺序。</li>
                    <li>奖励阶段只补主轴需要的牌、法宝或法则；弱卡过多时优先在商店精简牌组。</li>
                    <li>打完一章后看奖励页、构筑快照和归卷书架，确认下一轮要补什么。</li>
                </ul>
            </div>

            <div class="intro-section">
                <h3>👥 可选角色（6位）</h3>
                <div style="display:grid; grid-template-columns: 1fr 1fr; gap: 12px;">
                    <div class="char-highlight" style="border-color: var(--accent-gold);">
                        <strong style="color: var(--accent-gold);">🤺 林风 · 逆命者</strong>
                        <p style="font-size: 0.85rem; margin-top: 6px;">命环成长收益高，适合长期养成与后期爆发。</p>
                    </div>
                    <div class="char-highlight" style="border-color: var(--accent-green);">
                        <strong style="color: var(--accent-green);">🌿 香叶 · 被诅咒的医者</strong>
                        <p style="font-size: 0.85rem; margin-top: 6px;">治疗、持续压制与解场并重，容错高。</p>
                    </div>
                    <div class="char-highlight" style="border-color: var(--accent-red);">
                        <strong style="color: var(--accent-red);">📿 无欲 · 苦行僧</strong>
                        <p style="font-size: 0.85rem; margin-top: 6px;">功德/业力双资源，适合攻守切换。</p>
                    </div>
                    <div class="char-highlight" style="border-color: #2196F3;">
                        <strong style="color: #2196F3;">📚 严寒 · 命环学者</strong>
                        <p style="font-size: 0.85rem; margin-top: 6px;">解析、控场和技能联动突出。</p>
                    </div>
                    <div class="char-highlight" style="border-color: #8aa4ff;">
                        <strong style="color: #8aa4ff;">🌠 墨尘 · 星律巡使</strong>
                        <p style="font-size: 0.85rem; margin-top: 6px;">标记、命环节奏和星律链条构筑。</p>
                    </div>
                    <div class="char-highlight" style="border-color: #4ecdc4;">
                        <strong style="color: #4ecdc4;">🪬 宁玄 · 灵器行者</strong>
                        <p style="font-size: 0.85rem; margin-top: 6px;">法宝协同强，擅长稳中滚优势。</p>
                    </div>
                </div>
            </div>
`;

    // Tab 2: Mechanics
    const mechanicsContent = `
            <div class="intro-section">
                <h3>⚔️ 战斗：先读意图，再决定回合答案</h3>
                <ul class="intro-list">
                    <li><strong>手牌与灵力</strong>：灵力决定本回合能打多少牌，先安排费用再追求连锁。</li>
                    <li><strong>敌方意图</strong>：敌人会提前展示攻击、防御、控场或特殊动作；高压回合优先防守、净化或打断。</li>
                    <li><strong>护盾与生命</strong>：护盾多为当回合保护，生命损失会持续影响后续路线。</li>
                    <li><strong>战斗日志</strong>：按 L 打开日志，复盘伤害、法宝、法则和状态的触发顺序。</li>
                </ul>
            </div>

            <div class="intro-section">
                <h3>🎴 构筑：少而准比多而散更强</h3>
                <ul class="intro-list">
                    <li><strong>卡牌</strong>：攻击、防御、抽牌、费用、状态、持续效果和诅咒共同决定牌组质量。</li>
                    <li><strong>法宝</strong>：优先选择能服务主轴的法宝，例如补费用、补抽牌、破盾、净化、回血或斩杀。</li>
                    <li><strong>商店</strong>：移除弱卡、补关键牌、买法宝或资源；精简卡组能提高核心组件命中率。</li>
                    <li><strong>奖励选择</strong>：问自己“这张牌解决当前缺口吗”，不解决就可以跳过。</li>
                </ul>
            </div>

            <div class="intro-section">
                <h3>⭕ 命环、法则与灵契</h3>
                <ul class="intro-list">
                    <li><strong>命环</strong>：提供长期属性、槽位和路线身份，决定后续构筑的收益方向。</li>
                    <li><strong>五行法则</strong>：金→木→土→水→火→金；克制关系是稳定增伤来源。</li>
                    <li><strong>法则共鸣</strong>：同系法则、角色倾向和装备槽位会形成额外协同。</li>
                    <li><strong>灵契</strong>：提供护道方向和角色线索，适合与章节推荐和灵契窟路线一起规划。</li>
                </ul>
            </div>

            <div class="intro-section">
                <h3>🧩 章节、洞府、挑战、无尽与 PVP</h3>
                <ul class="intro-list">
                    <li><strong>章节考试</strong>：天象、地脉、生态模板、Boss 传闻和 DRI 风险会告诉你本章在考什么。</li>
                    <li><strong>洞府议程</strong>：把归卷答卷立项成研究，章中处置、锁线契约和章末结题会反哺后续路线。</li>
                    <li><strong>挑战观察站</strong>：固定命盘会沉淀成样本，可复刻、筛选和训练同类题面。</li>
                    <li><strong>无尽轮回</strong>：赛季词条、季签、崩盘账本与偏执层会折算为 DRI 主轴，强调长期止损。</li>
                    <li><strong>天道榜 PVP</strong>：先读对手档案和 PVP DRI，再用焦点约战、镜像练习、实时论道赛后复盘和商店经济沉淀强势套路。</li>
                </ul>
            </div>
`;

    // Tab 3: Controls & Tips
    const controlsContent = `
            <div class="intro-section">
                <h3>🎮 操作指南</h3>
                <ul class="intro-list">
                    <li><strong>出牌</strong>：拖拽卡牌到敌人或目标区域；部分牌可直接点击目标。</li>
                    <li><strong>结束回合</strong>：打完牌后点击右侧按钮推进回合。</li>
                    <li><strong>查看详情</strong>：悬停卡牌、图标、节点、法宝或档案标签可查看完整说明。</li>
                    <li><strong>路线判断</strong>：地图上先看节点类型，再结合章节 DRI、命途目标和当前构筑缺口取舍。</li>
                </ul>
            </div>

            <div class="intro-section">
                <h3>⌨️ 常用快捷键</h3>
                <ul class="intro-list">
                    <li><strong>L</strong>：打开/关闭战斗日志面板。</li>
                    <li><strong>F</strong>：切换全屏模式。</li>
                    <li><strong>Esc</strong>：退出全屏或关闭当前弹窗。</li>
                </ul>
            </div>

            <div class="intro-section">
                <h3>💾 存档与同步</h3>
                <ul class="intro-list">
                    <li><strong>本地存档</strong>：自动保存，离线也可继续游玩。</li>
                    <li><strong>云存档</strong>：登录后可同步账号、存档、练习快照等数据。</li>
                    <li><strong>PVP 练习快照</strong>：防守上传后，问道练习和镜像练习可以读取你的公开构筑快照，但不写正式积分。</li>
                </ul>
            </div>

            <div class="intro-section">
                <h3>💡 实战建议</h3>
                <ul class="intro-list">
                    <li><strong>前三章先求稳</strong>：优先补生存、抽牌和费用，再追求复杂连锁。</li>
                    <li><strong>高压回合留资源</strong>：灵力、奶糖、指令槽、净化和破盾不要提前花空。</li>
                    <li><strong>复盘看四处</strong>：奖励页、构筑快照、章节档案和洞府议程能告诉你下一轮该补哪里。</li>
                </ul>
            </div>
`;

    // Tab 4: Updates
    const updatesContent = `
            <div class="intro-section">
                <h3>🌌 当前版本重点（V10 真 PVP · 前端焕新）</h3>
                <p class="intro-text">
                    V10 真 PVP · 前端焕新这一版的目标是把真人论道、公平回执、赛后学习和长期复盘打通成一条玩家能读懂的成长链。
                    当前版本不只是新增功能，而是让奖励页、地图、远征、洞府、构筑快照、挑战观察站与实时论道使用同一套读题语言。
                </p>
            </div>

            <div class="intro-section">
                <h3>✅ 已上线能力</h3>
                <ul class="intro-list">
                    <li><strong>命途任务</strong>：每局有阶段目标、阶段奖励和中盘裂变，帮助你判断该继续强化、转修还是献祭换收益。</li>
                    <li><strong>章节考试</strong>：章节天象、地脉、生态模板、Boss 传闻和 DRI 风险统一提示“这一章在考什么”。</li>
                    <li><strong>赛季天道盘</strong>：训练线、远征线、验算线会整合精选命盘、章节归卷、洞府承诺、无尽轮回与 PVP 天道榜。</li>
                    <li><strong>三周一章</strong>：feedbackLine、objective、pressureWindow 分别对应章末回响、章目标板和章势压强；它们只解释当前章势，不会新增第二任务源。</li>
                    <li><strong>挑战观察站</strong>：固定命盘会沉淀成观星样本，支持复刻重点、失手剖面、训练标签、样本排序和常用训练视角。</li>
                    <li><strong>洞府议程</strong>：归卷书架、命盘研究、章中处置、锁线契约和残卷回收形成长期承诺循环。</li>
                    <li><strong>无尽轮回 DRI</strong>：赛季词条、季签、崩盘账本与偏执层会统一折算成主轴、对策和预留建议。</li>
                    <li><strong>PVP 天道榜</strong>：PVP 风险画像、对手档案、PVP DRI、焦点约战、镜像练习、实时论道赛后复盘、段位倍率、连胜奖励、商店与外观已打通。</li>
                </ul>
            </div>

            <div class="intro-section">
                <h3>🧭 推荐体验路线</h3>
                <ul class="intro-list">
                    <li>先用主线跑完一条命途，熟悉战斗、地图、章节 DRI 与奖励选择。</li>
                    <li>再进入挑战观察站，复刻一个固定命盘，练习同类章节题面。</li>
                    <li>随后查看洞府和归卷书架，把高分答卷立项成下一章研究。</li>
                    <li>最后进入天道榜，按 PVP DRI 和对手档案调整构筑，体验约战、结算和商店经济。</li>
                </ul>
            </div>

            <div class="intro-section">
                <h3>🛰 后续方向</h3>
                <ul class="intro-list">
                    <li><strong>新手引导</strong>：继续补更细的分步教学和战斗内提示。</li>
                    <li><strong>赛季闭环</strong>：继续深化跨周裁定、债账、分线结题赏和长期身份沉淀。</li>
                    <li><strong>PVP 与观察站</strong>：补更长周期的历史窗口、更细题面分层和复盘检索。</li>
                    <li><strong>洞府议程</strong>：扩展更多研究分支、契约代价和结题后续工程。</li>
                </ul>
            </div>

            <div class="intro-section">
                <h3>👨‍💻 项目与反馈</h3>
                <p class="intro-text">Designed & Developed by <strong>HealthOvO</strong> Team.</p>
                <p class="intro-text" style="font-size: 0.9rem;">若你遇到问题，或想反馈某个流派 / 章节 / Boss 的体验，欢迎在仓库提交 issue / discussion。</p>
                <div style="margin-top:20px; text-align:center;">
                    <a href="https://github.com/HealthOvO/The-Defier" target="_blank" style="color:var(--accent-cyan); text-decoration:none; border-bottom:1px dashed var(--accent-cyan);">GitHub Repository</a>
                </div>
            </div>
`;
    this.game.introTabContent = {
      overview: overviewContent,
      mechanics: mechanicsContent,
      controls: controlsContent,
      updates: updatesContent
    };
    settingsContainer.innerHTML = `
        <div class="game-intro-container">
            <div class="intro-header">
                <h2>📖 逆命者指南</h2>
                <div class="subtitle">The Defier's Handbook</div>
            </div>

            <nav class="intro-tabs">
                <button class="intro-tab-btn active" type="button" data-tab="overview" data-system-action="switch-intro-tab">综述</button>
                <button class="intro-tab-btn" type="button" data-tab="mechanics" data-system-action="switch-intro-tab">机制</button>
                <button class="intro-tab-btn" type="button" data-tab="controls" data-system-action="switch-intro-tab">操作</button>
                <button class="intro-tab-btn" type="button" data-tab="updates" data-system-action="switch-intro-tab">更新</button>
            </nav>

            <div class="intro-content-area">
                <div id="intro-tab-content" class="intro-tab-panel active" data-active-tab="overview">
                    ${overviewContent}
                </div>
            </div>

            <div style="text-align: center; margin-top: auto; font-size: 0.8rem; color: rgba(255,255,255,0.2); padding-top: 10px;">
                V10 真 PVP · 前端焕新 当前版本 | Breaking Fate since 2024
            </div>
        </div>
        `;
    this.bindSystemIntroDelegates(settingsContainer);
    modal.classList.add('active');
    if (typeof requestAnimationFrame === 'function') {
      requestAnimationFrame(() => this.game.switchIntroTab('overview'));
    } else {
      this.game.switchIntroTab('overview');
    }
  }
  showSkillConfirmModal() {
    const modal = document.getElementById('skill-confirm-modal');
    const titleEl = document.getElementById('skill-confirm-title');
    const iconEl = document.getElementById('skill-confirm-icon');
    const descEl = document.getElementById('skill-confirm-desc');
    if (this.game.player.activeSkill) {
      titleEl.textContent = `${this.game.player.activeSkill.name} `;
      iconEl.textContent = this.game.player.activeSkill.icon || '⚡';
      if (this.game.player.activeSkill.getDescription) {
        descEl.textContent = this.game.player.activeSkill.getDescription(this.game.player.skillLevel);
      } else {
        descEl.textContent = this.game.player.activeSkill.description;
      }
    }
    modal.classList.add('active');
  }
  showConfirmModal(message, onConfirm, onCancel = null) {
    let modal = document.getElementById('generic-confirm-modal');

    // 动态创建模态框
    if (!modal) {
      modal = document.createElement('div');
      modal.id = 'generic-confirm-modal';
      modal.className = 'modal';
      modal.style.zIndex = '10000'; // 确保在最上层
      modal.innerHTML = `
                <div class="modal-content" style="text-align: center; max-width: 400px; padding: 30px;">
                    <h3 id="generic-confirm-title" style="color: var(--accent-gold); margin-bottom: 20px;">提示</h3>
                    <p id="generic-confirm-message" style="color: #ccc; margin-bottom: 30px; line-height: 1.6; font-size: 1.1rem; white-space: pre-line;"></p>
                    <div style="display: flex; justify-content: center; gap: 20px;">
                        <button id="generic-confirm-btn" class="menu-btn primary small">确定</button>
                        <button id="generic-cancel-btn" class="menu-btn small">取消</button>
                    </div>
                </div>
            `;
      document.body.appendChild(modal);

      // 绑定通用关闭
      const closeBtn = document.createElement('button');
      closeBtn.className = 'modal-close';
      closeBtn.innerHTML = '×';
      const modalContent = modal.querySelector('.modal-content');
      if (!modalContent) return;
      modalContent.appendChild(closeBtn);
    }

    // 更新内容
    const msgEl = document.getElementById('generic-confirm-message');
    const confirmBtn = document.getElementById('generic-confirm-btn');
    const cancelBtn = document.getElementById('generic-cancel-btn');
    if (msgEl) msgEl.textContent = message;

    // 绑定事件 (使用 onclick 覆盖之前的绑定，防止多次触发)
    const closeBtn = modal.querySelector('.modal-close');
    if (closeBtn) {
      if (closeBtn.__systemClickHandler) {
        closeBtn.removeEventListener('click', closeBtn.__systemClickHandler);
      }
      const closeHandler = () => modal.classList.remove('active');
      closeBtn.addEventListener('click', closeHandler);
      closeBtn.__systemClickHandler = closeHandler;
    }
    if (confirmBtn) {
      if (confirmBtn.__systemClickHandler) {
        confirmBtn.removeEventListener('click', confirmBtn.__systemClickHandler);
      }
      const confirmHandler = () => {
        modal.classList.remove('active');
        if (typeof onConfirm === 'function') onConfirm();
      };
      confirmBtn.addEventListener('click', confirmHandler);
      confirmBtn.__systemClickHandler = confirmHandler;
    }
    if (cancelBtn) {
      if (cancelBtn.__systemClickHandler) {
        cancelBtn.removeEventListener('click', cancelBtn.__systemClickHandler);
      }
      const cancelHandler = () => {
        modal.classList.remove('active');
        if (typeof onCancel === 'function') onCancel();
      };
      cancelBtn.addEventListener('click', cancelHandler);
      cancelBtn.__systemClickHandler = cancelHandler;
    }

    // 显示
    modal.classList.add('active');
  }
  showAlertModal(message, title = '提示', onOk = null) {
    let modal = document.getElementById('generic-alert-modal');

    // 动态创建模态框
    if (!modal) {
      modal = document.createElement('div');
      modal.id = 'generic-alert-modal';
      modal.className = 'modal';
      modal.style.zIndex = '10001'; // 比Confirm更高
      modal.innerHTML = `
                <div class="modal-content" style="text-align: center; max-width: 400px; padding: 30px;">
                    <h3 id="generic-alert-title" style="color: var(--accent-gold); margin-bottom: 20px;">提示</h3>
                    <p id="generic-alert-message" style="color: #ccc; margin-bottom: 30px; line-height: 1.6; font-size: 1.1rem; white-space: pre-line;"></p>
                    <div style="display: flex; justify-content: center;">
                        <button id="generic-alert-btn" class="menu-btn primary small" style="min-width: 100px;">确定</button>
                    </div>
                </div>
            `;
      document.body.appendChild(modal);

      // 绑定通用关闭
      const closeBtn = document.createElement('button');
      closeBtn.className = 'modal-close';
      closeBtn.innerHTML = '×';
      const modalContent = modal.querySelector('.modal-content');
      if (!modalContent) return;
      modalContent.appendChild(closeBtn);
    }

    // 更新内容
    const msgEl = document.getElementById('generic-alert-message');
    const titleEl = document.getElementById('generic-alert-title');
    if (msgEl) msgEl.innerHTML = message.replace(/\n/g, '<br>');
    if (titleEl) titleEl.textContent = title;

    // 按钮事件
    const okBtn = document.getElementById('generic-alert-btn');
    const closeBtn = modal.querySelector('.modal-close');
    if (closeBtn) {
      if (closeBtn.__systemClickHandler) {
        closeBtn.removeEventListener('click', closeBtn.__systemClickHandler);
      }
      const closeHandler = () => modal.classList.remove('active');
      closeBtn.addEventListener('click', closeHandler);
      closeBtn.__systemClickHandler = closeHandler;
    }
    if (okBtn) {
      if (okBtn.__systemClickHandler) {
        okBtn.removeEventListener('click', okBtn.__systemClickHandler);
      }
      const okHandler = () => {
        if (onOk) onOk();
        modal.classList.remove('active');
      };
      okBtn.addEventListener('click', okHandler);
      okBtn.__systemClickHandler = okHandler;
    }
    modal.classList.add('active');
  }
  showLoginModal() {
    if (typeof AuthService !== 'undefined' && AuthService.isCloudEnabled && !AuthService.isCloudEnabled()) {
      const modalMsg = document.getElementById('auth-message');
      if (modalMsg) modalMsg.innerText = '云存档未配置，当前仅可离线游玩';
      Utils.showBattleLog('云存档未配置，已切换为离线模式');
      if (this.game) {
        this.game.guestMode = true;
        this.game.showCharacterSelection();
      }
      return;
    }
    const modal = document.getElementById('auth-modal');
    if (modal) {
      modal.classList.add('active');
      // Clear inputs
      const u = document.getElementById('auth-username');
      const p = document.getElementById('auth-password');
      const m = document.getElementById('auth-message');
      if (u) u.value = '';
      if (p) p.value = '';
      if (m) m.innerText = '';
    }
  }
  renderSaveSlots(slots) {
    const modal = document.getElementById('save-slots-modal');
    const container = document.getElementById('slots-container');
    if (!modal || !container) return;
    container.innerHTML = '';
    slots.forEach((slotData, index) => {
      const slotEl = document.createElement('div');
      const isEmpty = !slotData;
      slotEl.className = `save-slot ${isEmpty ? 'empty' : ''}`;
      const slotName = `命 牌 · ${['一', '二', '三', '四'][index] || index + 1}`;
      let contentHtml = '';
      if (isEmpty) {
        contentHtml = `
                    <div class="slot-visual" style="border-color: #555; opacity: 0.5;">?</div>
                    <div class="slot-empty-text">虚位以待</div>
                `;
      } else {
        let date = new Date(slotData.timestamp).toLocaleDateString();
        let dateLabel = "更新";
        if (slotData.player && slotData.player.registerTime) {
          date = new Date(slotData.player.registerTime).toLocaleDateString();
          dateLabel = "注册";
        }
        const realm = slotData.player && slotData.player.realm ? slotData.player.realm : 1;
        const hp = slotData.player && slotData.player.currentHp ? slotData.player.currentHp : '?';
        const roleId = slotData.player && slotData.player.characterId;
        let roleName = '未知角色';
        let roleIcon = '👤';
        if (roleId && typeof CHARACTERS !== 'undefined' && CHARACTERS[roleId]) {
          const c = CHARACTERS[roleId];
          roleName = c.name;
          // Resolve Image Path: Check .image, .portrait, or .avatar (if path)
          const imagePath = c.image || c.portrait || (c.avatar && c.avatar.includes('/') ? c.avatar : null);
          if (imagePath) {
            // Use image
            roleIcon = ''; // Clear text icon
            // We'll handle image via style in the HTML construction loop below
          } else {
            roleIcon = c.avatar || '👤';
          }

          // Store for use below
          slotData._tempImage = imagePath;
        }
        let maxRealm = 1;
        if (slotData.unlockedRealms && Array.isArray(slotData.unlockedRealms)) {
          maxRealm = Math.max(...slotData.unlockedRealms);
        } else if (slotData.player && slotData.player.realm) {
          maxRealm = slotData.player.realm;
        }
        let realmDisplay = `第${maxRealm}重天`;
        if (maxRealm > 18) {
          realmDisplay = `<span style="color:var(--accent-gold); font-weight:bold;">已通关</span>`;
        }
        contentHtml = `
                    <div class="slot-visual ${slotData._tempImage ? 'is-image' : ''}" 
                         style="${slotData._tempImage ? `background-image: url('${slotData._tempImage}');` : ''}">
                        ${slotData._tempImage ? '' : roleIcon}
                    </div>
                
                    <div class="slot-info-primary">${roleName} <span style="font-size:0.8em; opacity:0.7">| ${realmDisplay}</span></div>
                    <div class="slot-info-secondary">❤️ ${hp}  📅 ${dateLabel}: ${date}</div>
                `;
      }
      const actionsHtml = isEmpty ? `<button class="talisman-btn small" type="button" data-system-action="select-slot" data-slot-index="${index}" data-slot-mode="new">
                    <div class="talisman-paper"></div>
                    <div class="talisman-content">
                        <span class="btn-text">开启轮回</span>
                    </div>
                </button>` : `<button class="talisman-btn small primary" type="button" data-system-action="select-slot" data-slot-index="${index}" data-slot-mode="load">
                    <div class="talisman-paper"></div>
                    <div class="talisman-content">
                        <span class="btn-text">继续</span>
                    </div>
                </button>
                <button class="talisman-btn small" type="button" data-system-action="select-slot" data-slot-index="${index}" data-slot-mode="overwrite" style="margin-top:5px; transform:scale(0.9);">
                    <div class="talisman-paper" style="border-color:var(--accent-red);"></div>
                    <div class="talisman-content">
                        <span class="btn-text" style="color:var(--accent-red);">覆盖</span>
                    </div>
                </button>`;
      slotEl.innerHTML = `
                <div class="slot-header">${slotName}</div>
                <div class="slot-content">
                    ${contentHtml}
                </div>
                <div class="slot-actions">
                    ${actionsHtml}
                </div>
            `;
      container.appendChild(slotEl);
    });
    this.bindSaveSlotDelegates(container);
    modal.classList.add('active');
  }
  bindSystemIntroDelegates(settingsContainer) {
    if (!settingsContainer || settingsContainer.__systemIntroDelegatesBound) return;
    settingsContainer.addEventListener('click', event => {
      const target = event.target;
      if (!target || typeof target.closest !== 'function') return;
      const tabBtn = target.closest('[data-system-action="switch-intro-tab"]');
      if (!tabBtn || tabBtn.disabled || !settingsContainer.contains(tabBtn)) return;
      const tabId = String(tabBtn.dataset.tab || 'overview');
      this.game.switchIntroTab(tabId);
    });
    settingsContainer.__systemIntroDelegatesBound = true;
  }
  bindSaveSlotDelegates(container) {
    if (!container || container.__saveSlotDelegatesBound) return;
    container.addEventListener('click', event => {
      const target = event.target;
      if (!target || typeof target.closest !== 'function') return;
      const actionBtn = target.closest('[data-system-action="select-slot"]');
      if (!actionBtn || actionBtn.disabled || !container.contains(actionBtn)) return;
      const index = Number(actionBtn.dataset.slotIndex);
      const mode = String(actionBtn.dataset.slotMode || '');
      if (Number.isFinite(index) && mode) {
        this.game.selectSlot(index, mode);
      }
    });
    container.__saveSlotDelegatesBound = true;
  }
  showSaveConflictModal(localData, cloudData, cloudTime) {
    const modal = document.getElementById('save-conflict-modal');
    if (!modal) return;

    // Populate Info
    const localInfo = document.getElementById('local-save-info');
    const cloudInfo = document.getElementById('cloud-save-info');
    const statusInfo = document.getElementById('save-conflict-status');
    const formatInfo = (data, time) => {
      if (!data) return '无数据';
      const date = time ? new Date(time).toLocaleString() : data.timestamp ? new Date(data.timestamp).toLocaleString() : '未知时间';
      const realm = data.player && data.player.realm ? data.player.realm : '?';
      const hp = data.player && data.player.currentHp ? data.player.currentHp : '?';
      const gold = data.player && data.player.gold ? data.player.gold : '?';
      return `
                    <div style="margin-bottom:4px">📅 ${date}</div>
                <div style="margin-bottom:4px">🏔️ 第 ${realm} 重天</div>
                <div>❤️ ${hp} | 💰 ${gold}</div>
                `;
    };
    if (localInfo) localInfo.innerHTML = formatInfo(localData, localData ? localData.timestamp : null);
    if (cloudInfo) cloudInfo.innerHTML = formatInfo(cloudData, cloudTime);
    if (statusInfo) statusInfo.textContent = '';

    // Store temp data
    this.game.tempCloudData = cloudData;
    modal.classList.add('active');
  }
}
if (typeof window !== 'undefined') {}
