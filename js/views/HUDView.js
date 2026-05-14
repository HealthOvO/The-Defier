export class HUDView {
    constructor(gameInstance) {
        this.game = gameInstance;
    }

    renderTreasures(containerId = 'map-treasures') {
        const container = document.getElementById(containerId);
        if (!container) return;

        container.innerHTML = '';

        if (this.game.player.treasures) {
            this.game.player.treasures.forEach(t => {
                const el = document.createElement('div');
                el.className = `treasure-item rarity-${t.rarity || 'common'}`;
                el.innerHTML = t.icon || '📦';

                // 获取动态描述
                const desc = (t.getDesc && this.game.player) ? t.getDesc(this.game.player) : t.description;

                el.title = `${t.name}\n${desc}`;

                // 点击查看详情
                el.addEventListener('click', () => {
                    this.game.showAlertModal(desc, t.name);
                });

                container.appendChild(el);
            });
        }
    }

    showPlayerInfo() {
        // 优先显示当前玩家对象的角色，没有则默认为林风
        const charId = (this.game.player && this.game.player.characterId) ? this.game.player.characterId : 'linFeng';

        const char = CHARACTERS[charId];
        if (!char) return;

        // 更新界面
        const avatarEl = document.getElementById('info-char-avatar');
        const nameEl = document.getElementById('info-char-name');
        const titleEl = document.getElementById('info-char-title');
        const descEl = document.getElementById('info-char-desc');
        const hpEl = document.getElementById('char-hp');
        const energyEl = document.getElementById('char-energy');
        const cosmetic = this.game.getEquippedCosmeticsProfile();
        const equippedTitle = cosmetic && cosmetic.title ? cosmetic.title.name : null;
        const equippedSkin = cosmetic && cosmetic.skin ? cosmetic.skin : null;

        if (avatarEl) {
            avatarEl.textContent = equippedSkin ? (equippedSkin.icon || '👘') : char.avatar;
            avatarEl.classList.toggle('pvp-skin-avatar', !!equippedSkin);
        }
        if (nameEl) nameEl.textContent = `${char.name} · ${char.title}`;
        if (titleEl) {
            if (equippedTitle) {
                const titleName = String(equippedTitle).replace(/^称号·/, '');
                titleEl.textContent = `称号·${titleName}`;
            } else {
                titleEl.textContent = '逆命印记';
            }
            titleEl.className = 'imprint-badge';
        }
        if (descEl) descEl.textContent = char.description;
        if (hpEl) hpEl.textContent = char.stats.maxHp;
        if (energyEl) energyEl.textContent = char.stats.energy;

        this.game.showScreen('character-select');
    }

    updatePlayerDisplay() {
        if (!this.game.player) return;

        const charId = this.game.player.characterId || 'linFeng';
        // Add Fallback for missing character data
        const char = (typeof CHARACTERS !== 'undefined' && CHARACTERS[charId]) ? CHARACTERS[charId] : { name: '未知修士' };
        const cosmetic = this.game.getEquippedCosmeticsProfile();
        const equippedSkin = cosmetic && cosmetic.skin ? cosmetic.skin : null;

        const battleNameEl = document.getElementById('player-name-display');
        if (battleNameEl) {
            battleNameEl.textContent = char.name;
        }

        // Update Avatar (Image or Emoji)
        const faceEl = document.getElementById('player-face-display');
        if (faceEl) {
            // Reset styles
            faceEl.style.backgroundImage = '';
            faceEl.textContent = '';
            faceEl.className = 'player-face-visual';
            faceEl.removeAttribute('title');

            // Resolve Image Path: Check .image, .portrait (WuYu), or .avatar (Yan Han if path)
            const imagePath = char.image || char.portrait || (char.avatar && char.avatar.includes('/') ? char.avatar : null);

            if (imagePath) {
                faceEl.style.backgroundImage = `url('${imagePath}')`;
                faceEl.classList.add('is-image');
                if (equippedSkin) {
                    faceEl.classList.add('skin-equipped');
                    faceEl.title = `已激活法相：${equippedSkin.name || '未知法相'}`;
                }
            } else {
                faceEl.textContent = equippedSkin ? (equippedSkin.icon || '👘') : (char.avatar || '👤');
                if (equippedSkin) {
                    faceEl.classList.add('skin-equipped');
                    faceEl.title = `已激活法相：${equippedSkin.name || '未知法相'}`;
                }
            }

            const avatarWrap = faceEl.closest('.player-avatar');
            if (avatarWrap) {
                avatarWrap.classList.toggle('skin-equipped', !!equippedSkin);
                let badge = avatarWrap.querySelector('.player-skin-badge');
                if (equippedSkin) {
                    if (!badge) {
                        badge = document.createElement('div');
                        badge.className = 'player-skin-badge';
                        avatarWrap.appendChild(badge);
                    }
                    const skinName = String(equippedSkin.name || '法相').replace(/^法相·/, '');
                    badge.textContent = `${equippedSkin.icon || '👘'} ${skinName}`;
                } else if (badge) {
                    badge.remove();
                }
            }
        }

        // 更新属性显示
        const strengthEl = document.getElementById('char-strength');
        // 检查永久Buff中的力量
        let strength = 0;
        if (this.game.player.permaBuffs && this.game.player.permaBuffs.strength) {
            strength = this.game.player.permaBuffs.strength;
        }
        // 如果在战斗中，加上临时Buff
        if (this.game.player.buffs && this.game.player.buffs.strength) {
            strength = this.game.player.buffs.strength; // buffs usually formatted as total value? check addBuff
            // addBuff accumulates: this.game.buffs[type] += value
            // Since prepareBattle calls addBuff for permBuffs, this.game.buffs.strength ALREADY includes permBuffs during battle.
            // But checking this.game.player.buffs.strength is safer if we are in battle.
            // If NOT in battle, use permBuffs.
        }

        // Better logic:
        let displayStrength = 0;
        if (this.game.battle && !this.game.battle.battleEnded && this.game.player.buffs.strength) {
            displayStrength = this.game.player.buffs.strength;
        } else if (this.game.player.permaBuffs && this.game.player.permaBuffs.strength) {
            displayStrength = this.game.player.permaBuffs.strength;
        }

        if (strengthEl) {
            strengthEl.textContent = displayStrength > 0 ? displayStrength : '-';
            strengthEl.parentElement.style.display = displayStrength > 0 ? 'flex' : 'none';
        }
    }

    showCombo() {
        if (this.game.comboCount < 2) return;

        const display = document.getElementById('combo-display');
        const countEl = document.getElementById('combo-count');
        const bonusEl = document.getElementById('combo-bonus');

        if (display && countEl && bonusEl) {
            countEl.textContent = this.game.comboCount;
            const bonus = Math.floor(this.game.getComboBonus() * 100);
            bonusEl.textContent = `伤害+${bonus}%`;

            // 设置等级
            display.className = 'combo-display show';
            if (this.game.comboCount >= 4) display.classList.add('level-4');
            else if (this.game.comboCount >= 3) display.classList.add('level-3');
            else display.classList.add('level-2');
        }
    }

    renderTreasures() {
        if (!this.game.player || !this.game.player.treasures) return;

        const containers = [
            document.getElementById('map-treasures'),
            document.getElementById('battle-treasures'),
            document.getElementById('treasures-container') // 顶部栏 (如有)
        ];

        // 构建 HTML
        const html = this.game.player.treasures.map(treasure => {
            const rarityClass = treasure.rarity || 'common';
            return `
                <div class="treasure-icon ${rarityClass}">
                    ${treasure.icon}
                    <div class="treasure-tooltip">
                        <h4>${treasure.name}</h4>
                        <p>${treasure.description}</p>
                    </div>
                </div>
            `;
        }).join('');

        // 更新所有容器
        containers.forEach(container => {
            if (container) {
                container.innerHTML = html;
            }
        });
    }


}

if (typeof window !== 'undefined') {
    window.HUDView = HUDView;
}
