/**
 * The Defier 2.0 - 音频管理器
 */

class AudioManager {
    constructor() {
        this.bgm = null;
        this.sfxEnabled = true;
        this.bgmEnabled = true;
        this.volume = 0.5;
        this.currentTrack = null;

        // 定义音效映射
        this.sounds = {
            click: 'audio/sfx/click.ogg',
            confirm: 'audio/sfx/confirm.ogg',
            hover: 'audio/sfx/hover.ogg'
        };

        // BGM 列表
        this.music = {
            menu: 'audio/bgm/menu.mp3',
            battle: 'audio/bgm/battle.mp3',
            boss: 'audio/bgm/boss.mp3',
            map: 'audio/bgm/map.mp3'
        };

        // 音效节流计时器
        this.lastHoverTime = 0;

        this.init();
    }

    init() {
        // 创建全局音频上下文或加载设置
        const savedSettings = localStorage.getItem('defier_audio_settings');
        if (savedSettings) {
            const settings = JSON.parse(savedSettings);
            this.sfxEnabled = settings.sfx;
            this.bgmEnabled = settings.bgm;
            this.volume = settings.volume || 0.5;
        }
    }

    // 播放背景音乐
    playBGM(trackName) {
        if (!this.bgmEnabled) return;
        if (this.currentTrack === trackName) return;

        // 实际项目中这里应该实现音频淡入淡出和切换
        console.log(`播放BGM: ${trackName}`);
        this.currentTrack = trackName;
    }

    // 播放音效
    playSFX(soundName) {
        if (!this.sfxEnabled) return;

        // 针对悬停音效的特殊处理（节流）
        if (soundName === 'hover') {
            const now = Date.now();
            if (now - this.lastHoverTime < 100) { // 100ms 冷却
                return;
            }
            this.lastHoverTime = now;
        }

        const src = this.sounds[soundName];
        if (!src) return;

        try {
            // 每次创建新的 Audio 对象以支持重叠播放
            const audio = new Audio(src);
            audio.volume = this.volume;
            // 处理 Promise rejection (比如用户未交互时)
            const playPromise = audio.play();
            if (playPromise !== undefined) {
                playPromise.catch(error => {
                    // 忽略自动播放限制错误，这是正常现象
                    // console.warn('Audio play failed:', error);
                });
            }
        } catch (e) {
            console.warn('Audio system error:', e);
        }
    }

    // 切换静音
    toggleMute() {
        this.bgmEnabled = !this.bgmEnabled;
        this.sfxEnabled = !this.sfxEnabled;
        this.saveSettings();

        if (!this.bgmEnabled && this.bgm) {
            this.bgm.pause();
        } else if (this.bgmEnabled && this.currentTrack) {
            this.playBGM(this.currentTrack);
        }
    }

    saveSettings() {
        localStorage.setItem('defier_audio_settings', JSON.stringify({
            sfx: this.sfxEnabled,
            bgm: this.bgmEnabled,
            volume: this.volume
        }));
    }
}

// 全局实例
let audioManager;

document.addEventListener('DOMContentLoaded', () => {
    audioManager = new AudioManager();
});
