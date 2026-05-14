//#region \0vite/modulepreload-polyfill.js
(function polyfill() {
	const relList = document.createElement("link").relList;
	if (relList && relList.supports && relList.supports("modulepreload")) return;
	for (const link of document.querySelectorAll("link[rel=\"modulepreload\"]")) processPreload(link);
	new MutationObserver((mutations) => {
		for (const mutation of mutations) {
			if (mutation.type !== "childList") continue;
			for (const node of mutation.addedNodes) if (node.tagName === "LINK" && node.rel === "modulepreload") processPreload(node);
		}
	}).observe(document, {
		childList: true,
		subtree: true
	});
	function getFetchOpts(link) {
		const fetchOpts = {};
		if (link.integrity) fetchOpts.integrity = link.integrity;
		if (link.referrerPolicy) fetchOpts.referrerPolicy = link.referrerPolicy;
		if (link.crossOrigin === "use-credentials") fetchOpts.credentials = "include";
		else if (link.crossOrigin === "anonymous") fetchOpts.credentials = "omit";
		else fetchOpts.credentials = "same-origin";
		return fetchOpts;
	}
	function processPreload(link) {
		if (link.ep) return;
		link.ep = true;
		const fetchOpts = getFetchOpts(link);
		fetch(link.href, fetchOpts);
	}
})();
//#endregion
//#region js/data/enemies.js
/**
* The Defier - 敌人数据
* 所有敌人的定义
*/
var ENEMIES = {
	bandit: {
		id: "bandit",
		name: "山贼",
		icon: "🗡️",
		realm: 1,
		hp: 30,
		patterns: [
			{
				type: "attack",
				value: 6,
				intent: "⚔️"
			},
			{
				type: "attack",
				value: 8,
				intent: "⚔️"
			},
			{
				type: "defend",
				value: 5,
				intent: "🛡️"
			}
		],
		stealChance: .1,
		stealLaw: null,
		element: "metal",
		gold: {
			min: 10,
			max: 20
		}
	},
	wildBoar: {
		id: "wildBoar",
		name: "野猪",
		icon: "🐗",
		realm: 1,
		hp: 25,
		patterns: [
			{
				type: "attack",
				value: 7,
				intent: "⚔️"
			},
			{
				type: "attack",
				value: 5,
				intent: "⚔️"
			},
			{
				type: "attack",
				value: 10,
				intent: "⚔️"
			}
		],
		stealChance: .05,
		stealLaw: null,
		gold: {
			min: 8,
			max: 15
		}
	},
	graveRaven: {
		id: "graveRaven",
		name: "墓羽鸦",
		icon: "🐦‍⬛",
		realm: 1,
		hp: 28,
		patterns: [
			{
				type: "debuff",
				buffType: "weak",
				value: 1,
				intent: "🪶噪鸣"
			},
			{
				type: "attack",
				value: 7,
				intent: "⚔️啄击"
			},
			{
				type: "multiAttack",
				value: 4,
				count: 2,
				intent: "🪶连啄"
			}
		],
		stealChance: .08,
		stealLaw: null,
		gold: {
			min: 9,
			max: 16
		}
	},
	banditLeader: {
		id: "banditLeader",
		name: "山寨头目",
		icon: "👹",
		realm: 1,
		isBoss: true,
		logo: "assets/images/enemies/boss_banditLeader.webp",
		hp: 80,
		patterns: [
			{
				type: "attack",
				value: 10,
				intent: "⚔️"
			},
			{
				type: "attack",
				value: 12,
				intent: "⚔️"
			},
			{
				type: "defend",
				value: 8,
				intent: "🛡️"
			},
			{
				type: "buff",
				buffType: "strength",
				value: 2,
				intent: "💪"
			},
			{
				type: "attack",
				value: 15,
				intent: "⚔️"
			}
		],
		stealChance: .3,
		stealLaw: "swordIntent",
		gold: {
			min: 50,
			max: 80
		}
	},
	spiritWolf: {
		id: "spiritWolf",
		name: "灵狼",
		icon: "🐺",
		realm: 2,
		hp: 35,
		patterns: [
			{
				type: "attack",
				value: 8,
				intent: "⚔️"
			},
			{
				type: "attack",
				value: 6,
				intent: "⚔️"
			},
			{
				type: "attack",
				value: 10,
				intent: "⚔️"
			}
		],
		stealChance: .15,
		stealLaw: null,
		gold: {
			min: 15,
			max: 25
		}
	},
	venomSnake: {
		id: "venomSnake",
		name: "毒灵蛇",
		icon: "🐍",
		realm: 2,
		hp: 30,
		patterns: [
			{
				type: "debuff",
				buffType: "poison",
				value: 3,
				intent: "☠️"
			},
			{
				type: "attack",
				value: 6,
				intent: "⚔️"
			},
			{
				type: "defend",
				value: 5,
				intent: "🛡️"
			}
		],
		stealChance: .2,
		stealLaw: "woodLaw",
		element: "wood",
		resistances: {
			fire: -.3,
			wood: .5
		},
		gold: {
			min: 18,
			max: 28
		}
	},
	thunderBeast: {
		id: "thunderBeast",
		name: "雷兽",
		icon: "⚡",
		realm: 2,
		hp: 40,
		patterns: [
			{
				type: "attack",
				value: 9,
				intent: "⚔️"
			},
			{
				type: "debuff",
				buffType: "vulnerable",
				value: 2,
				intent: "✨"
			},
			{
				type: "attack",
				value: 12,
				intent: "⚔️"
			}
		],
		stealChance: .25,
		stealLaw: "thunderLaw",
		element: "thunder",
		resistances: {
			fire: -.2,
			thunder: .5
		},
		gold: {
			min: 20,
			max: 30
		}
	},
	demonWolf: {
		id: "demonWolf",
		name: "妖狼王",
		icon: "🐾",
		realm: 2,
		isBoss: true,
		logo: "assets/images/enemies/boss_demonWolf.webp",
		hp: 100,
		patterns: [
			{
				type: "attack",
				value: 12,
				intent: "⚔️"
			},
			{
				type: "attack",
				value: 8,
				intent: "⚔️"
			},
			{
				type: "buff",
				buffType: "strength",
				value: 3,
				intent: "💪"
			},
			{
				type: "multiAttack",
				value: 5,
				count: 3,
				intent: "🔥"
			},
			{
				type: "defend",
				value: 12,
				intent: "🛡️"
			}
		],
		stealChance: .4,
		stealLaw: "thunderLaw",
		gold: {
			min: 80,
			max: 120
		}
	},
	swordDisciple: {
		id: "swordDisciple",
		name: "剑修弟子",
		icon: "🗡️",
		realm: 3,
		hp: 45,
		patterns: [
			{
				type: "attack",
				value: 10,
				intent: "⚔️"
			},
			{
				type: "attack",
				value: 8,
				intent: "⚔️"
			},
			{
				type: "defend",
				value: 8,
				intent: "🛡️"
			},
			{
				type: "attack",
				value: 14,
				intent: "⚔️"
			}
		],
		stealChance: .2,
		stealLaw: "swordIntent",
		gold: {
			min: 25,
			max: 40
		}
	},
	crystalGolem: {
		id: "crystalGolem",
		name: "晶岩傀儡",
		icon: "💎",
		realm: 3,
		hp: 60,
		patterns: [
			{
				type: "defend",
				value: 15,
				intent: "🛡️"
			},
			{
				type: "attack",
				value: 8,
				intent: "⚔️"
			},
			{
				type: "buff",
				buffType: "thorns",
				value: 2,
				intent: "🌵"
			}
		],
		stealChance: .1,
		stealLaw: "earthShield",
		element: "earth",
		resistances: {
			wood: -.3,
			earth: .5
		},
		gold: {
			min: 30,
			max: 50
		}
	},
	talismanMaster: {
		id: "talismanMaster",
		name: "符修",
		icon: "📜",
		realm: 3,
		hp: 38,
		patterns: [
			{
				type: "debuff",
				buffType: "weak",
				value: 2,
				intent: "✨"
			},
			{
				type: "attack",
				value: 12,
				intent: "⚔️"
			},
			{
				type: "defend",
				value: 10,
				intent: "🛡️"
			},
			{
				type: "buff",
				buffType: "strength",
				value: 2,
				intent: "💪"
			}
		],
		stealChance: .2,
		stealLaw: "spaceRift",
		gold: {
			min: 25,
			max: 40
		}
	},
	swordElder: {
		id: "swordElder",
		name: "仙门长老",
		icon: "👴",
		realm: 3,
		isBoss: true,
		logo: "assets/images/enemies/boss_swordElder.webp",
		hp: 130,
		patterns: [
			{
				type: "attack",
				value: 14,
				intent: "⚔️"
			},
			{
				type: "attack",
				value: 10,
				intent: "⚔️"
			},
			{
				type: "buff",
				buffType: "strength",
				value: 2,
				intent: "💪"
			},
			{
				type: "defend",
				value: 15,
				intent: "🛡️"
			},
			{
				type: "attack",
				value: 20,
				intent: "⚔️"
			},
			{
				type: "multiAttack",
				value: 6,
				count: 4,
				intent: "🔥"
			}
		],
		stealChance: .5,
		stealLaw: "swordIntent",
		gold: {
			min: 120,
			max: 180
		}
	},
	flameCultist: {
		id: "flameCultist",
		name: "火修",
		icon: "🔥",
		realm: 4,
		hp: 50,
		patterns: [
			{
				type: "attack",
				value: 11,
				intent: "⚔️"
			},
			{
				type: "debuff",
				buffType: "burn",
				value: 3,
				intent: "🔥"
			},
			{
				type: "attack",
				value: 8,
				intent: "⚔️"
			},
			{
				type: "attack",
				value: 15,
				intent: "⚔️"
			}
		],
		stealChance: .25,
		stealLaw: "flameTruth",
		element: "fire",
		resistances: {
			water: -.5,
			fire: .5
		},
		gold: {
			min: 35,
			max: 55
		}
	},
	alchemyGolem: {
		id: "alchemyGolem",
		name: "丹傀儡",
		icon: "🤖",
		realm: 4,
		hp: 70,
		patterns: [
			{
				type: "defend",
				value: 12,
				intent: "🛡️"
			},
			{
				type: "attack",
				value: 16,
				intent: "⚔️"
			},
			{
				type: "defend",
				value: 15,
				intent: "🛡️"
			},
			{
				type: "attack",
				value: 20,
				intent: "⚔️"
			}
		],
		stealChance: .15,
		stealLaw: null,
		gold: {
			min: 40,
			max: 60
		}
	},
	emberPhysician: {
		id: "emberPhysician",
		name: "焰脉医修",
		icon: "🧪",
		realm: 4,
		hp: 58,
		patterns: [
			{
				type: "multiAction",
				intent: "🔥焰脉诊断",
				actions: [{
					type: "debuff",
					buffType: "burn",
					value: 2,
					intent: "🔥灼印"
				}, {
					type: "attack",
					value: 9,
					intent: "⚔️灼切"
				}]
			},
			{
				type: "heal",
				value: 12,
				intent: "💚回元"
			},
			{
				type: "attack",
				value: 16,
				intent: "⚔️"
			},
			{
				type: "defend",
				value: 10,
				intent: "🛡️"
			}
		],
		stealChance: .22,
		stealLaw: "flameTruth",
		gold: {
			min: 38,
			max: 58
		}
	},
	danZun: {
		id: "danZun",
		name: "丹尊",
		icon: "🧙",
		realm: 4,
		isBoss: true,
		logo: "assets/images/enemies/boss_danZun.webp",
		hp: 170,
		patterns: [
			{
				type: "buff",
				buffType: "strength",
				value: 3,
				intent: "💪"
			},
			{
				type: "attack",
				value: 18,
				intent: "⚔️"
			},
			{
				type: "heal",
				value: 40,
				intent: "💚"
			},
			{
				type: "debuff",
				buffType: "burn",
				value: 5,
				intent: "🔥"
			},
			{
				type: "attack",
				value: 22,
				intent: "⚔️"
			},
			{
				type: "multiAttack",
				value: 8,
				count: 4,
				intent: "🔥"
			}
		],
		stealChance: 1,
		stealLaw: "reversalLaw",
		element: "fire",
		resistances: {
			water: -.3,
			fire: .3
		},
		gold: {
			min: 800,
			max: 1200
		},
		description: "天道意志的具象化身"
	},
	ancientGhost: {
		id: "ancientGhost",
		name: "元婴老怪",
		icon: "👻",
		realm: 5,
		hp: 80,
		patterns: [
			{
				type: "attack",
				value: 15,
				intent: "⚔️"
			},
			{
				type: "debuff",
				buffType: "weak",
				value: 3,
				intent: "✨"
			},
			{
				type: "attack",
				value: 18,
				intent: "⚔️"
			},
			{
				type: "heal",
				value: 10,
				intent: "💚"
			}
		],
		stealChance: .3,
		stealLaw: "timeStop",
		gold: {
			min: 50,
			max: 80
		}
	},
	shadowAssassin: {
		id: "shadowAssassin",
		name: "影杀者",
		icon: "🥷",
		realm: 5,
		hp: 70,
		patterns: [
			{
				type: "buff",
				buffType: "dodge",
				value: 1,
				intent: "💨"
			},
			{
				type: "attack",
				value: 25,
				intent: "⚔️"
			},
			{
				type: "debuff",
				buffType: "weak",
				value: 2,
				intent: "✨"
			}
		],
		stealChance: .3,
		stealLaw: "windSpeed",
		gold: {
			min: 60,
			max: 90
		}
	},
	soulLanternMonk: {
		id: "soulLanternMonk",
		name: "引魂灯僧",
		icon: "🏮",
		realm: 5,
		hp: 76,
		patterns: [
			{
				type: "addStatus",
				cardId: "heartDemon",
				count: 1,
				intent: "🕳️引魂"
			},
			{
				type: "debuff",
				buffType: "vulnerable",
				value: 2,
				intent: "✨摄念"
			},
			{
				type: "attack",
				value: 19,
				intent: "⚔️灯焰击"
			},
			{
				type: "heal",
				value: 8,
				intent: "💚回灯"
			}
		],
		stealChance: .32,
		stealLaw: "timeStop",
		gold: {
			min: 58,
			max: 92
		}
	},
	ancientSpirit: {
		id: "ancientSpirit",
		name: "上古遗灵",
		icon: "💀",
		realm: 5,
		isBoss: true,
		logo: "assets/images/enemies/boss_ancientSpirit.webp",
		hp: 220,
		patterns: [
			{
				type: "attack",
				value: 20,
				intent: "⚔️"
			},
			{
				type: "debuff",
				buffType: "vulnerable",
				value: 3,
				intent: "✨"
			},
			{
				type: "defend",
				value: 20,
				intent: "🛡️"
			},
			{
				type: "buff",
				buffType: "strength",
				value: 4,
				intent: "💪"
			},
			{
				type: "attack",
				value: 25,
				intent: "⚔️"
			},
			{
				type: "multiAttack",
				value: 10,
				count: 5,
				intent: "🔥"
			}
		],
		stealChance: .6,
		stealLaw: "timeStop",
		gold: {
			min: 250,
			max: 350
		}
	},
	divineSwordsman: {
		id: "divineSwordsman",
		name: "化神剑修",
		icon: "⚔️",
		realm: 6,
		hp: 100,
		patterns: [
			{
				type: "attack",
				value: 18,
				intent: "⚔️"
			},
			{
				type: "attack",
				value: 22,
				intent: "⚔️"
			},
			{
				type: "defend",
				value: 15,
				intent: "🛡️"
			},
			{
				type: "multiAttack",
				value: 8,
				count: 3,
				intent: "🔥"
			}
		],
		stealChance: .35,
		stealLaw: "swordIntent",
		gold: {
			min: 70,
			max: 110
		}
	},
	thunderTribulation: {
		id: "thunderTribulation",
		name: "天劫雷灵",
		icon: "⛈️",
		realm: 6,
		hp: 90,
		patterns: [
			{
				type: "attack",
				value: 20,
				intent: "⚔️"
			},
			{
				type: "debuff",
				buffType: "paralysis",
				value: 2,
				intent: "⚡"
			},
			{
				type: "attack",
				value: 25,
				intent: "⚔️"
			},
			{
				type: "debuff",
				buffType: "burn",
				value: 4,
				intent: "🔥"
			}
		],
		stealChance: .4,
		stealLaw: "thunderLaw",
		gold: {
			min: 65,
			max: 100
		}
	},
	runeSentinel: {
		id: "runeSentinel",
		name: "符阵守卫",
		icon: "🧿",
		realm: 6,
		hp: 96,
		patterns: [
			{
				type: "defend",
				value: 20,
				intent: "🛡️"
			},
			{
				type: "debuff",
				buffType: "weak",
				value: 2,
				intent: "🌀"
			},
			{
				type: "attack",
				value: 24,
				intent: "⚔️"
			},
			{
				type: "multiAttack",
				value: 10,
				count: 2,
				intent: "✴️连刺"
			}
		],
		stealChance: .34,
		stealLaw: "spaceRift",
		gold: {
			min: 72,
			max: 108
		}
	},
	divineLord: {
		id: "divineLord",
		name: "化神大能",
		icon: "🧙‍♂️",
		realm: 6,
		isBoss: true,
		logo: "assets/images/boss_logo_6.webp",
		hp: 280,
		patterns: [
			{
				type: "buff",
				buffType: "strength",
				value: 4,
				intent: "💪"
			},
			{
				type: "attack",
				value: 25,
				intent: "⚔️"
			},
			{
				type: "heal",
				value: 20,
				intent: "💚"
			},
			{
				type: "debuff",
				buffType: "vulnerable",
				value: 3,
				intent: "✨"
			},
			{
				type: "attack",
				value: 30,
				intent: "⚔️"
			},
			{
				type: "multiAttack",
				value: 12,
				count: 4,
				intent: "🔥"
			},
			{
				type: "defend",
				value: 25,
				intent: "🛡️"
			}
		],
		stealChance: .65,
		stealLaw: "voidEmbrace",
		gold: {
			min: 320,
			max: 450
		}
	},
	fusionAncestor: {
		id: "fusionAncestor",
		name: "合体老祖",
		icon: "👴",
		realm: 7,
		hp: 130,
		patterns: [
			{
				type: "attack",
				value: 22,
				intent: "⚔️"
			},
			{
				type: "buff",
				buffType: "strength",
				value: 3,
				intent: "💪"
			},
			{
				type: "attack",
				value: 28,
				intent: "⚔️"
			},
			{
				type: "defend",
				value: 20,
				intent: "🛡️"
			}
		],
		stealChance: .4,
		stealLaw: "timeStop",
		gold: {
			min: 90,
			max: 140
		}
	},
	starBeast: {
		id: "starBeast",
		name: "星辰巨兽",
		icon: "🌟",
		realm: 7,
		hp: 150,
		patterns: [
			{
				type: "attack",
				value: 25,
				intent: "⚔️"
			},
			{
				type: "attack",
				value: 20,
				intent: "⚔️"
			},
			{
				type: "multiAttack",
				value: 10,
				count: 4,
				intent: "🔥"
			},
			{
				type: "defend",
				value: 25,
				intent: "🛡️"
			}
		],
		stealChance: .35,
		stealLaw: "spaceRift",
		gold: {
			min: 100,
			max: 160
		}
	},
	starChainWarden: {
		id: "starChainWarden",
		name: "锁星卫",
		icon: "⛓️",
		realm: 7,
		hp: 142,
		patterns: [
			{
				type: "defend",
				value: 22,
				intent: "🛡️锁界"
			},
			{
				type: "addStatus",
				cardId: "heartDemon",
				count: 1,
				intent: "🕳️缚念"
			},
			{
				type: "multiAttack",
				value: 11,
				count: 3,
				intent: "⚔️星链连击"
			},
			{
				type: "attack",
				value: 26,
				intent: "💥星坠"
			}
		],
		stealChance: .37,
		stealLaw: "spaceRift",
		gold: {
			min: 102,
			max: 162
		}
	},
	fusionSovereign: {
		id: "fusionSovereign",
		name: "合体天尊",
		icon: "👑",
		logo: "assets/images/boss_logo_7.webp",
		realm: 7,
		isBoss: true,
		hp: 350,
		patterns: [
			{
				type: "attack",
				value: 30,
				intent: "⚔️"
			},
			{
				type: "debuff",
				buffType: "weak",
				value: 4,
				intent: "✨"
			},
			{
				type: "buff",
				buffType: "strength",
				value: 5,
				intent: "💪"
			},
			{
				type: "defend",
				value: 30,
				intent: "🛡️"
			},
			{
				type: "attack",
				value: 35,
				intent: "⚔️"
			},
			{
				type: "multiAttack",
				value: 14,
				count: 5,
				intent: "🔥"
			},
			{
				type: "heal",
				value: 25,
				intent: "💚"
			}
		],
		stealChance: .7,
		stealLaw: "timeStop",
		gold: {
			min: 400,
			max: 550
		}
	},
	mahayanaShadow: {
		id: "mahayanaShadow",
		name: "大乘虚影",
		icon: "👤",
		realm: 8,
		hp: 180,
		patterns: [
			{
				type: "attack",
				value: 28,
				intent: "⚔️"
			},
			{
				type: "debuff",
				buffType: "vulnerable",
				value: 4,
				intent: "✨"
			},
			{
				type: "attack",
				value: 32,
				intent: "⚔️"
			},
			{
				type: "buff",
				buffType: "strength",
				value: 4,
				intent: "💪"
			}
		],
		stealChance: .45,
		stealLaw: "voidEmbrace",
		gold: {
			min: 130,
			max: 200
		}
	},
	riftGuardian: {
		id: "riftGuardian",
		name: "时空裂隙守卫",
		icon: "🌀",
		realm: 8,
		hp: 200,
		patterns: [
			{
				type: "defend",
				value: 30,
				intent: "🛡️"
			},
			{
				type: "attack",
				value: 30,
				intent: "⚔️"
			},
			{
				type: "debuff",
				buffType: "stun",
				value: 1,
				intent: "💫"
			},
			{
				type: "multiAttack",
				value: 12,
				count: 4,
				intent: "🔥"
			}
		],
		stealChance: .4,
		stealLaw: "timeRewindLaw",
		gold: {
			min: 150,
			max: 220
		}
	},
	frostArrowHerald: {
		id: "frostArrowHerald",
		name: "霜翎信使",
		icon: "🏹",
		realm: 8,
		hp: 188,
		patterns: [
			{
				type: "attack",
				value: 26,
				intent: "❄️霜箭"
			},
			{
				type: "multiAttack",
				value: 9,
				count: 3,
				intent: "🏹连射"
			},
			{
				type: "debuff",
				buffType: "vulnerable",
				value: 3,
				intent: "🎯破绽"
			},
			{
				type: "defend",
				value: 22,
				intent: "🛡️"
			}
		],
		stealChance: .46,
		stealLaw: "windSpeed",
		gold: {
			min: 142,
			max: 215
		}
	},
	mahayanaSupreme: {
		id: "mahayanaSupreme",
		name: "大乘至尊",
		icon: "🔱",
		logo: "assets/images/boss_logo_8.webp",
		realm: 8,
		isBoss: true,
		hp: 450,
		patterns: [
			{
				type: "buff",
				buffType: "strength",
				value: 5,
				intent: "💪"
			},
			{
				type: "attack",
				value: 35,
				intent: "⚔️"
			},
			{
				type: "debuff",
				buffType: "burn",
				value: 5,
				intent: "🔥"
			},
			{
				type: "defend",
				value: 35,
				intent: "🛡️"
			},
			{
				type: "attack",
				value: 40,
				intent: "⚔️"
			},
			{
				type: "multiAttack",
				value: 16,
				count: 5,
				intent: "🔥"
			},
			{
				type: "heal",
				value: 30,
				intent: "💚"
			},
			{
				type: "debuff",
				buffType: "vulnerable",
				value: 4,
				intent: "✨"
			}
		],
		stealChance: .75,
		stealLaw: "karmaLaw",
		gold: {
			min: 500,
			max: 700
		}
	},
	ascensionMessenger: {
		id: "ascensionMessenger",
		name: "飞升使者",
		icon: "👼",
		realm: 9,
		hp: 250,
		patterns: [
			{
				type: "attack",
				value: 35,
				intent: "⚔️"
			},
			{
				type: "buff",
				buffType: "strength",
				value: 5,
				intent: "💪"
			},
			{
				type: "attack",
				value: 40,
				intent: "⚔️"
			},
			{
				type: "heal",
				value: 20,
				intent: "💚"
			}
		],
		stealChance: .5,
		stealLaw: "timeStop",
		gold: {
			min: 180,
			max: 280
		}
	},
	heavenlyEnforcer: {
		id: "heavenlyEnforcer",
		name: "天道执法者",
		icon: "⚖️",
		realm: 9,
		hp: 280,
		patterns: [
			{
				type: "attack",
				value: 38,
				intent: "⚔️"
			},
			{
				type: "debuff",
				buffType: "stun",
				value: 1,
				intent: "💫"
			},
			{
				type: "multiAttack",
				value: 15,
				count: 5,
				intent: "🔥"
			},
			{
				type: "defend",
				value: 40,
				intent: "🛡️"
			}
		],
		stealChance: .45,
		stealLaw: "karmaLaw",
		gold: {
			min: 200,
			max: 320
		}
	},
	verdictPriest: {
		id: "verdictPriest",
		name: "裁令祭司",
		icon: "📘",
		realm: 9,
		hp: 266,
		patterns: [
			{
				type: "debuff",
				buffType: "weak",
				value: 2,
				intent: "📜裁令"
			},
			{
				type: "multiAction",
				intent: "⚖️裁决链",
				actions: [{
					type: "attack",
					value: 24,
					intent: "⚔️判斩"
				}, {
					type: "defend",
					value: 18,
					intent: "🛡️护典"
				}]
			},
			{
				type: "multiAttack",
				value: 11,
				count: 3,
				intent: "🔥律火连击"
			}
		],
		stealChance: .47,
		stealLaw: "karmaLaw",
		gold: {
			min: 192,
			max: 314
		}
	},
	ascensionSovereign: {
		id: "ascensionSovereign",
		name: "飞升主宰",
		icon: "👑",
		logo: "assets/images/boss_logo_9.webp",
		realm: 9,
		isBoss: true,
		hp: 600,
		patterns: [
			{
				type: "buff",
				buffType: "strength",
				value: 5,
				intent: "💪"
			},
			{
				type: "attack",
				value: 45,
				intent: "⚔️"
			},
			{
				type: "debuff",
				buffType: "vulnerable",
				value: 3,
				intent: "✨"
			},
			{
				type: "multiAttack",
				value: 20,
				count: 4,
				intent: "🔥"
			},
			{
				type: "heal",
				value: 50,
				intent: "💚"
			},
			{
				type: "defend",
				value: 50,
				intent: "🛡️"
			}
		],
		stealChance: .8,
		stealLaw: "timeRewindLaw",
		gold: {
			min: 400,
			max: 600
		},
		description: "掌控飞升之力的主宰"
	},
	magmaSentinel: {
		id: "magmaSentinel",
		name: "岩浆哨兵",
		icon: "🗿",
		realm: 10,
		hp: 300,
		patterns: [
			{
				type: "defend",
				value: 40,
				intent: "🛡️"
			},
			{
				type: "attack",
				value: 35,
				intent: "⚔️"
			},
			{
				type: "buff",
				buffType: "thorns",
				value: 3,
				intent: "🌵"
			}
		],
		stealChance: .3,
		stealLaw: "earthShield",
		gold: {
			min: 220,
			max: 300
		}
	},
	lavaLizard: {
		id: "lavaLizard",
		name: "熔岩巨蜥",
		icon: "🦎",
		realm: 10,
		hp: 280,
		patterns: [
			{
				type: "attack",
				value: 30,
				intent: "⚔️"
			},
			{
				type: "debuff",
				buffType: "burn",
				value: 3,
				intent: "🔥"
			},
			{
				type: "multiAttack",
				value: 10,
				count: 3,
				intent: "🔥"
			}
		],
		stealChance: .3,
		stealLaw: "flameTruth",
		gold: {
			min: 200,
			max: 280
		}
	},
	basaltArcanist: {
		id: "basaltArcanist",
		name: "玄武岩术士",
		icon: "🪨",
		realm: 10,
		hp: 292,
		patterns: [
			{
				type: "defend",
				value: 36,
				intent: "🛡️岩护"
			},
			{
				type: "buff",
				buffType: "thorns",
				value: 2,
				intent: "🌵岩刺"
			},
			{
				type: "multiAction",
				intent: "🌋岩火共振",
				actions: [{
					type: "debuff",
					buffType: "burn",
					value: 2,
					intent: "🔥焚蚀"
				}, {
					type: "attack",
					value: 28,
					intent: "⚔️砾爆"
				}]
			},
			{
				type: "attack",
				value: 34,
				intent: "⚔️"
			}
		],
		stealChance: .31,
		stealLaw: "earthShield",
		gold: {
			min: 210,
			max: 292
		}
	},
	dualMagmaGuardians: {
		id: "dualMagmaGuardians",
		name: "双子熔岩守卫",
		icon: "🌋",
		logo: "assets/images/boss_logo_10.webp",
		realm: 10,
		isBoss: true,
		hp: 350,
		patterns: [
			{
				type: "attack",
				value: 30,
				intent: "⚔️"
			},
			{
				type: "buff",
				buffType: "thorns",
				value: 5,
				intent: "🌵"
			},
			{
				type: "multiAttack",
				value: 15,
				count: 2,
				intent: "🔥"
			},
			{
				type: "defend",
				value: 30,
				intent: "🛡️"
			}
		],
		stealChance: .5,
		stealLaw: "flameTruth",
		element: "fire",
		resistances: {
			water: -.5,
			fire: .8
		},
		gold: {
			min: 300,
			max: 400
		},
		description: "双生一体，火焰共鸣"
	},
	windSpirit: {
		id: "windSpirit",
		name: "风之精灵",
		icon: "💨",
		realm: 11,
		hp: 50,
		patterns: [{
			type: "attack",
			value: 15,
			intent: "⚔️"
		}, {
			type: "debuff",
			buffType: "vulnerable",
			value: 1,
			intent: "✨"
		}],
		stealChance: .1,
		stealLaw: null,
		gold: {
			min: 10,
			max: 20
		},
		isMinion: true
	},
	galeSpirit: {
		id: "galeSpirit",
		name: "狂风之灵",
		icon: "🌪️",
		realm: 11,
		hp: 320,
		patterns: [
			{
				type: "buff",
				buffType: "dodge",
				value: 1,
				intent: "💨"
			},
			{
				type: "attack",
				value: 35,
				intent: "⚔️"
			},
			{
				type: "multiAttack",
				value: 12,
				count: 3,
				intent: "⚔️"
			}
		],
		stealChance: .3,
		stealLaw: "windSpeed",
		gold: {
			min: 250,
			max: 350
		}
	},
	thunderHawk: {
		id: "thunderHawk",
		name: "雷鹰",
		icon: "🦅",
		realm: 11,
		hp: 300,
		patterns: [
			{
				type: "attack",
				value: 40,
				intent: "⚔️"
			},
			{
				type: "debuff",
				buffType: "vulnerable",
				value: 2,
				intent: "✨"
			},
			{
				type: "attack",
				value: 45,
				intent: "⚔️"
			}
		],
		stealChance: .3,
		stealLaw: "thunderLaw",
		gold: {
			min: 250,
			max: 350
		}
	},
	stormScribe: {
		id: "stormScribe",
		name: "风暴抄录者",
		icon: "📚",
		realm: 11,
		hp: 312,
		patterns: [
			{
				type: "summon",
				value: "windSpirit",
				count: 1,
				intent: "👻引灵"
			},
			{
				type: "debuff",
				buffType: "vulnerable",
				value: 2,
				intent: "✨裂风注"
			},
			{
				type: "attack",
				value: 39,
				intent: "⚔️风压斩"
			},
			{
				type: "defend",
				value: 28,
				intent: "🛡️风幕"
			}
		],
		stealChance: .31,
		stealLaw: "windSpeed",
		gold: {
			min: 248,
			max: 346
		}
	},
	stormSummoner: {
		id: "stormSummoner",
		name: "风暴唤灵者",
		element: "wood",
		resistances: {
			metal: -.3,
			wood: .5
		},
		icon: "🌪️",
		logo: "assets/images/boss_logo_11.webp",
		realm: 11,
		isBoss: true,
		hp: 400,
		patterns: [
			{
				type: "summon",
				value: "windSpirit",
				count: 1,
				intent: "👻"
			},
			{
				type: "attack",
				value: 35,
				intent: "⚔️"
			},
			{
				type: "debuff",
				buffType: "vulnerable",
				value: 3,
				intent: "✨"
			},
			{
				type: "multiAttack",
				value: 10,
				count: 4,
				intent: "💨"
			}
		],
		stealChance: .5,
		stealLaw: "windSpeed",
		gold: {
			min: 350,
			max: 450
		},
		description: "掌控风暴，召唤元灵"
	},
	goldenGuard: {
		id: "goldenGuard",
		name: "金甲卫士",
		icon: "💂",
		realm: 12,
		hp: 400,
		patterns: [
			{
				type: "defend",
				value: 50,
				intent: "🛡️"
			},
			{
				type: "attack",
				value: 30,
				intent: "⚔️"
			},
			{
				type: "buff",
				buffType: "thorns",
				value: 5,
				intent: "🌵"
			}
		],
		stealChance: .3,
		stealLaw: "metalBody",
		gold: {
			min: 300,
			max: 400
		}
	},
	swordPuppet: {
		id: "swordPuppet",
		name: "剑傀儡",
		icon: "🎎",
		realm: 12,
		hp: 350,
		patterns: [
			{
				type: "attack",
				value: 50,
				intent: "⚔️"
			},
			{
				type: "buff",
				buffType: "strength",
				value: 3,
				intent: "💪"
			},
			{
				type: "multiAttack",
				value: 15,
				count: 3,
				intent: "⚔️"
			}
		],
		stealChance: .3,
		stealLaw: "swordIntent",
		gold: {
			min: 300,
			max: 400
		}
	},
	abyssCantor: {
		id: "abyssCantor",
		name: "渊咏祭司",
		icon: "🕯️",
		realm: 12,
		hp: 372,
		patterns: [
			{
				type: "debuff",
				buffType: "weak",
				value: 3,
				intent: "📿咏诵"
			},
			{
				type: "heal",
				value: 24,
				intent: "💚修复"
			},
			{
				type: "attack",
				value: 42,
				intent: "⚔️"
			},
			{
				type: "addStatus",
				cardId: "heartDemon",
				count: 1,
				intent: "🕳️侵染"
			}
		],
		stealChance: .33,
		stealLaw: "voidEmbrace",
		gold: {
			min: 308,
			max: 418
		}
	},
	triheadGoldDragon: {
		id: "triheadGoldDragon",
		name: "三首金龙",
		icon: "🐲",
		logo: "assets/images/boss_logo_12.webp",
		realm: 12,
		isBoss: true,
		hp: 600,
		patterns: [
			{
				type: "multiAction",
				actions: [
					{
						type: "attack",
						value: 25
					},
					{
						type: "buff",
						buffType: "strength",
						value: 2
					},
					{
						type: "debuff",
						buffType: "weak",
						value: 2
					}
				],
				intent: "⚡"
			},
			{
				type: "attack",
				value: 45,
				intent: "⚔️"
			},
			{
				type: "defend",
				value: 50,
				intent: "🛡️"
			}
		],
		stealChance: .6,
		stealLaw: "metalBody",
		element: "metal",
		resistances: {
			fire: -.3,
			metal: .5
		},
		gold: {
			min: 450,
			max: 550
		},
		description: "三首齐动，攻守兼备"
	},
	mirrorReplicant: {
		id: "mirrorReplicant",
		name: "镜中倒影",
		icon: "👤",
		realm: 13,
		hp: 420,
		patterns: [
			{
				type: "attack",
				value: 40,
				intent: "⚔️"
			},
			{
				type: "buff",
				buffType: "reflect",
				value: .5,
				intent: "🔮"
			},
			{
				type: "attack",
				value: 40,
				intent: "⚔️"
			}
		],
		stealChance: .3,
		stealLaw: "reversal",
		gold: {
			min: 350,
			max: 450
		}
	},
	mindEater: {
		id: "mindEater",
		name: "噬心魔",
		icon: "🧠",
		realm: 13,
		hp: 400,
		patterns: [
			{
				type: "debuff",
				buffType: "weak",
				value: 3,
				intent: "✨"
			},
			{
				type: "attack",
				value: 45,
				intent: "⚔️"
			},
			{
				type: "debuff",
				buffType: "vulnerable",
				value: 3,
				intent: "✨"
			}
		],
		stealChance: .3,
		stealLaw: "chaosLaw",
		gold: {
			min: 350,
			max: 450
		}
	},
	oracleSilencer: {
		id: "oracleSilencer",
		name: "缄言卜者",
		icon: "📴",
		realm: 13,
		hp: 408,
		patterns: [
			{
				type: "debuff",
				buffType: "random",
				value: 2,
				intent: "🎲噪讯"
			},
			{
				type: "addStatus",
				cardId: "heartDemon",
				count: 1,
				intent: "🕳️噤声印"
			},
			{
				type: "attack",
				value: 44,
				intent: "⚔️默裁"
			},
			{
				type: "defend",
				value: 28,
				intent: "🛡️静域"
			}
		],
		stealChance: .31,
		stealLaw: "chaosLaw",
		gold: {
			min: 352,
			max: 458
		}
	},
	mirrorDemon: {
		id: "mirrorDemon",
		name: "心魔镜像",
		icon: "🪞",
		logo: "assets/images/boss_logo_13.webp",
		realm: 13,
		isBoss: true,
		hp: 500,
		patterns: [
			{
				type: "attack",
				value: 40,
				intent: "⚔️"
			},
			{
				type: "buff",
				buffType: "reflect",
				value: 1,
				intent: "🔮"
			},
			{
				type: "debuff",
				buffType: "stun",
				value: 1,
				intent: "💫"
			},
			{
				type: "multiAttack",
				value: 20,
				count: 3,
				intent: "🔥"
			}
		],
		stealChance: .6,
		stealLaw: "chaosLaw",
		gold: {
			min: 500,
			max: 650
		},
		description: "映照人心，反弹伤害"
	},
	chaosBeast: {
		id: "chaosBeast",
		name: "混沌巨兽",
		icon: "🐘",
		realm: 14,
		hp: 500,
		patterns: [
			{
				type: "attack",
				value: 50,
				intent: "⚔️"
			},
			{
				type: "debuff",
				buffType: "random",
				value: 2,
				intent: "🎲"
			},
			{
				type: "attack",
				value: 60,
				intent: "⚔️"
			}
		],
		stealChance: .3,
		stealLaw: "chaosLaw",
		gold: {
			min: 400,
			max: 550
		}
	},
	entropyWorm: {
		id: "entropyWorm",
		name: "熵增蠕虫",
		icon: "🐛",
		realm: 14,
		hp: 450,
		patterns: [
			{
				type: "attack",
				value: 40,
				intent: "⚔️"
			},
			{
				type: "debuff",
				buffType: "vulnerable",
				value: 5,
				intent: "✨"
			},
			{
				type: "multiAttack",
				value: 10,
				count: 5,
				intent: "🔥"
			}
		],
		stealChance: .3,
		stealLaw: "timeStop",
		gold: {
			min: 400,
			max: 550
		}
	},
	warDrummer: {
		id: "warDrummer",
		name: "裂阵战鼓手",
		icon: "🥁",
		realm: 14,
		hp: 462,
		patterns: [
			{
				type: "buff",
				buffType: "strength",
				value: 3,
				intent: "🥁鼓舞"
			},
			{
				type: "multiAttack",
				value: 12,
				count: 3,
				intent: "⚔️疾击"
			},
			{
				type: "debuff",
				buffType: "vulnerable",
				value: 2,
				intent: "🎯破防"
			},
			{
				type: "attack",
				value: 52,
				intent: "💥重锤"
			}
		],
		stealChance: .31,
		stealLaw: "swordIntent",
		gold: {
			min: 410,
			max: 560
		}
	},
	chaosEye: {
		id: "chaosEye",
		name: "混沌之眼",
		icon: "👁️",
		logo: "assets/images/boss_logo_14.webp",
		realm: 14,
		isBoss: true,
		hp: 750,
		patterns: [
			{
				type: "debuff",
				buffType: "random",
				value: 3,
				intent: "🎲"
			},
			{
				type: "attack",
				value: 50,
				intent: "⚔️"
			},
			{
				type: "debuff",
				buffType: "confuse",
				value: 1,
				intent: "😵"
			},
			{
				type: "multiAttack",
				value: 15,
				count: 5,
				intent: "🌀"
			}
		],
		stealChance: .7,
		stealLaw: "chaosLaw",
		gold: {
			min: 600,
			max: 800
		},
		description: "混沌无序，扰乱神智"
	},
	voidStalker: {
		id: "voidStalker",
		name: "虚空潜行者",
		icon: "🕶️",
		realm: 15,
		hp: 550,
		patterns: [
			{
				type: "buff",
				buffType: "dodge",
				value: 2,
				intent: "💨"
			},
			{
				type: "attack",
				value: 60,
				intent: "⚔️"
			},
			{
				type: "attack",
				value: 80,
				intent: "⚔️"
			}
		],
		stealChance: .3,
		stealLaw: "voidEmbrace",
		gold: {
			min: 450,
			max: 600
		}
	},
	abyssHulk: {
		id: "abyssHulk",
		name: "深渊巨尸",
		icon: "🧟",
		realm: 15,
		hp: 700,
		patterns: [
			{
				type: "attack",
				value: 50,
				intent: "⚔️"
			},
			{
				type: "heal",
				value: 30,
				intent: "💚"
			},
			{
				type: "attack",
				value: 60,
				intent: "⚔️"
			},
			{
				type: "defend",
				value: 40,
				intent: "🛡️"
			}
		],
		stealChance: .3,
		stealLaw: "lifeDrain",
		gold: {
			min: 450,
			max: 600
		}
	},
	voidTaxCollector: {
		id: "voidTaxCollector",
		name: "虚空征税使",
		icon: "🧾",
		realm: 15,
		hp: 620,
		patterns: [
			{
				type: "multiAction",
				intent: "🌀征收判令",
				actions: [{
					type: "debuff",
					buffType: "weak",
					value: 2,
					intent: "🌀税压"
				}, {
					type: "attack",
					value: 36,
					intent: "⚔️催缴"
				}]
			},
			{
				type: "attack",
				value: 58,
				effect: "devour",
				intent: "🍽️吞缴"
			},
			{
				type: "heal",
				value: 24,
				intent: "💚回收"
			},
			{
				type: "multiAttack",
				value: 15,
				count: 3,
				intent: "⚔️清算连斩"
			}
		],
		stealChance: .34,
		stealLaw: "voidEmbrace",
		gold: {
			min: 462,
			max: 622
		}
	},
	voidDevourer: {
		id: "voidDevourer",
		name: "虚空吞噬者",
		icon: "🕳️",
		logo: "assets/images/boss_logo_15.webp",
		realm: 15,
		isBoss: true,
		hp: 900,
		patterns: [
			{
				type: "attack",
				value: 60,
				intent: "⚔️"
			},
			{
				type: "attack",
				value: 40,
				effect: "devour",
				intent: "🍽️"
			},
			{
				type: "heal",
				value: 50,
				intent: "💚"
			},
			{
				type: "buff",
				buffType: "strength",
				value: 5,
				intent: "💪"
			}
		],
		stealChance: .7,
		stealLaw: "voidEmbrace",
		gold: {
			min: 700,
			max: 900
		},
		description: "吞噬万物，甚至你的记忆(卡牌)"
	},
	elementalConstruct: {
		id: "elementalConstruct",
		name: "五行构造体",
		icon: "🤖",
		realm: 16,
		hp: 650,
		patterns: [
			{
				type: "attack",
				value: 50,
				element: "fire",
				intent: "🔥"
			},
			{
				type: "attack",
				value: 50,
				element: "ice",
				intent: "❄️"
			},
			{
				type: "defend",
				value: 50,
				element: "earth",
				intent: "🛡️"
			}
		],
		stealChance: .3,
		stealLaw: "metalBody",
		gold: {
			min: 500,
			max: 700
		}
	},
	fiveColorPeacock: {
		id: "fiveColorPeacock",
		name: "五色孔雀",
		icon: "🦚",
		realm: 16,
		hp: 600,
		patterns: [
			{
				type: "multiAttack",
				value: 15,
				count: 5,
				intent: "🔥"
			},
			{
				type: "debuff",
				buffType: "random",
				value: 2,
				intent: "🎲"
			},
			{
				type: "attack",
				value: 60,
				intent: "⚔️"
			}
		],
		stealChance: .3,
		stealLaw: "flameTruth",
		gold: {
			min: 500,
			max: 700
		}
	},
	prismLocust: {
		id: "prismLocust",
		name: "棱镜蚀蝗",
		icon: "🦗",
		realm: 16,
		hp: 632,
		patterns: [
			{
				type: "multiAttack",
				value: 14,
				count: 4,
				intent: "⚔️棱芒群袭"
			},
			{
				type: "debuff",
				buffType: "random",
				value: 2,
				intent: "🎲棱蚀"
			},
			{
				type: "attack",
				value: 58,
				intent: "💥折光重击"
			},
			{
				type: "defend",
				value: 34,
				intent: "🛡️折反甲壳"
			}
		],
		stealChance: .32,
		stealLaw: "chaosLaw",
		gold: {
			min: 512,
			max: 712
		}
	},
	elementalElder: {
		id: "elementalElder",
		name: "五行长老",
		icon: "🧙‍♂️",
		logo: "assets/images/boss_logo_16.webp",
		realm: 16,
		isBoss: true,
		hp: 1e3,
		patterns: [
			{
				type: "attack",
				value: 50,
				element: "fire",
				intent: "🔥"
			},
			{
				type: "attack",
				value: 50,
				element: "ice",
				intent: "❄️"
			},
			{
				type: "attack",
				value: 50,
				element: "thunder",
				intent: "⚡"
			},
			{
				type: "defend",
				value: 60,
				element: "earth",
				intent: "🛡️"
			},
			{
				type: "heal",
				value: 60,
				element: "wood",
				intent: "🌿"
			}
		],
		stealChance: .8,
		stealLaw: "flameTruth",
		gold: {
			min: 800,
			max: 1e3
		},
		description: "五行轮转，生生不息"
	},
	karmaSpirit: {
		id: "karmaSpirit",
		name: "业力之灵",
		icon: "👻",
		realm: 17,
		hp: 750,
		patterns: [
			{
				type: "buff",
				buffType: "thorns",
				value: 10,
				intent: "🌵"
			},
			{
				type: "attack",
				value: 60,
				intent: "⚔️"
			},
			{
				type: "attack",
				value: 70,
				intent: "⚔️"
			}
		],
		stealChance: .3,
		stealLaw: "karmaLaw",
		gold: {
			min: 600,
			max: 800
		}
	},
	causeEffectMonk: {
		id: "causeEffectMonk",
		name: "苦行僧",
		icon: "🙏",
		realm: 17,
		hp: 800,
		patterns: [
			{
				type: "defend",
				value: 60,
				intent: "🛡️"
			},
			{
				type: "heal",
				value: 40,
				intent: "💚"
			},
			{
				type: "attack",
				value: 50,
				intent: "⚔️"
			}
		],
		stealChance: .3,
		stealLaw: "reversalLaw",
		gold: {
			min: 600,
			max: 800
		}
	},
	ashenArchivist: {
		id: "ashenArchivist",
		name: "灰烬档案官",
		icon: "📚",
		realm: 17,
		hp: 770,
		patterns: [
			{
				type: "debuff",
				buffType: "vulnerable",
				value: 3,
				intent: "📎裁定注记"
			},
			{
				type: "heal",
				value: 35,
				intent: "💚修典"
			},
			{
				type: "multiAttack",
				value: 16,
				count: 3,
				intent: "⚔️卷页切割"
			},
			{
				type: "attack",
				value: 64,
				intent: "💥裁断"
			}
		],
		stealChance: .33,
		stealLaw: "karmaLaw",
		gold: {
			min: 620,
			max: 820
		}
	},
	karmaArbiter: {
		id: "karmaArbiter",
		name: "因果裁决者",
		icon: "⚖️",
		logo: "assets/images/boss_logo_17.webp",
		realm: 17,
		isBoss: true,
		hp: 1200,
		patterns: [
			{
				type: "attack",
				value: 60,
				intent: "⚔️"
			},
			{
				type: "buff",
				buffType: "thorns",
				value: 20,
				intent: "🌵"
			},
			{
				type: "attack",
				value: 80,
				intent: "⚖️"
			},
			{
				type: "debuff",
				buffType: "weak",
				value: 5,
				intent: "✨"
			}
		],
		stealChance: .9,
		stealLaw: "karmaLaw",
		gold: {
			min: 900,
			max: 1200
		},
		description: "因果循环，报应不爽"
	},
	doomShadow: {
		id: "doomShadow",
		name: "末日之影",
		icon: "🌑",
		realm: 18,
		hp: 900,
		patterns: [
			{
				type: "attack",
				value: 80,
				intent: "⚔️"
			},
			{
				type: "debuff",
				buffType: "vulnerable",
				value: 5,
				intent: "✨"
			},
			{
				type: "attack",
				value: 100,
				intent: "💀"
			}
		],
		stealChance: .3,
		stealLaw: "voidEmbrace",
		gold: {
			min: 700,
			max: 900
		}
	},
	entropyKing: {
		id: "entropyKing",
		name: "熵之君王",
		icon: "👑",
		realm: 18,
		hp: 1e3,
		patterns: [
			{
				type: "multiAttack",
				value: 20,
				count: 5,
				intent: "🔥"
			},
			{
				type: "debuff",
				buffType: "weak",
				value: 5,
				intent: "✨"
			},
			{
				type: "attack",
				value: 90,
				intent: "⚔️"
			}
		],
		stealChance: .3,
		stealLaw: "chaosLaw",
		gold: {
			min: 700,
			max: 900
		}
	},
	doomsdayHerald: {
		id: "doomsdayHerald",
		name: "终焉司兆",
		icon: "🕯️",
		realm: 18,
		hp: 920,
		patterns: [
			{
				type: "addStatus",
				cardId: "heartDemon",
				count: 1,
				intent: "🕳️终兆侵染"
			},
			{
				type: "debuff",
				buffType: "vulnerable",
				value: 4,
				intent: "✨衰灭宣告"
			},
			{
				type: "multiAttack",
				value: 18,
				count: 3,
				intent: "⚔️终祷连斩"
			},
			{
				type: "attack",
				value: 96,
				intent: "💀末兆裁决"
			}
		],
		stealChance: .34,
		stealLaw: "voidEmbrace",
		gold: {
			min: 710,
			max: 910
		}
	},
	heavenlyDao: {
		id: "heavenlyDao",
		name: "天道终焉",
		icon: "☀️",
		logo: "assets/images/boss_logo_18.webp",
		realm: 18,
		isBoss: true,
		hp: 2e3,
		patterns: [
			{
				type: "buff",
				buffType: "shield",
				value: 999,
				intent: "🛡️"
			},
			{
				type: "attack",
				value: 100,
				intent: "⚔️"
			},
			{
				type: "multiAttack",
				value: 30,
				count: 5,
				intent: "🔥"
			},
			{
				type: "debuff",
				buffType: "stun",
				value: 1,
				intent: "💫"
			},
			{
				type: "attack",
				value: 999,
				intent: "💀"
			}
		],
		stealChance: 1,
		stealLaw: "reversalLaw",
		gold: {
			min: 1e3,
			max: 2e3
		},
		description: "一切的终结与开始"
	},
	tribulationCloud5: {
		id: "tribulationCloud5",
		name: "五行劫云",
		icon: "☁️",
		realm: 5,
		isBoss: true,
		hp: 250,
		patterns: [
			{
				type: "attack",
				value: 20,
				intent: "⚡"
			},
			{
				type: "debuff",
				buffType: "vulnerable",
				value: 2,
				intent: "✨"
			},
			{
				type: "addStatus",
				cardId: "heartDemon",
				count: 1,
				intent: "👿"
			},
			{
				type: "multiAttack",
				value: 8,
				count: 3,
				intent: "⛈️"
			}
		],
		stealChance: .5,
		stealLaw: "thunderLaw",
		gold: {
			min: 300,
			max: 400
		}
	},
	tribulationCloud10: {
		id: "tribulationCloud10",
		name: "十方劫云",
		icon: "🌩️",
		realm: 10,
		isBoss: true,
		hp: 400,
		patterns: [
			{
				type: "attack",
				value: 35,
				intent: "⚡"
			},
			{
				type: "addStatus",
				cardId: "heartDemon",
				count: 2,
				intent: "👿"
			},
			{
				type: "debuff",
				buffType: "paralysis",
				value: 2,
				intent: "⚡"
			},
			{
				type: "multiAttack",
				value: 15,
				count: 4,
				intent: "⛈️"
			}
		],
		stealChance: .6,
		stealLaw: "thunderLaw",
		gold: {
			min: 500,
			max: 700
		}
	},
	tribulationCloud15: {
		id: "tribulationCloud15",
		name: "灭世劫云",
		icon: "🌨️",
		realm: 15,
		isBoss: true,
		hp: 800,
		patterns: [
			{
				type: "attack",
				value: 50,
				intent: "⚡"
			},
			{
				type: "debuff",
				buffType: "vulnerable",
				value: 5,
				intent: "✨"
			},
			{
				type: "addStatus",
				cardId: "heartDemon",
				count: 3,
				intent: "👿"
			},
			{
				type: "multiAttack",
				value: 20,
				count: 5,
				intent: "⛈️"
			},
			{
				type: "debuff",
				buffType: "stun",
				value: 1,
				intent: "💫"
			}
		],
		stealChance: .8,
		stealLaw: "thunderLaw",
		gold: {
			min: 800,
			max: 1e3
		}
	}
};
var V6_ENEMY_PACK = {
	oathHound: {
		id: "oathHound",
		name: "誓痕猎犬",
		icon: "🐕",
		realm: 1,
		hp: 32,
		patterns: [
			{
				type: "attack",
				value: 8,
				intent: "⚔️誓痕扑袭"
			},
			{
				type: "debuff",
				buffType: "mark",
				value: 2,
				intent: "🎯裂誓追痕"
			},
			{
				type: "multiAttack",
				value: 4,
				count: 2,
				intent: "⚔️噬誓连咬"
			}
		],
		aiProfile: "aggressive",
		ecologyLabel: "裂誓猎群",
		ecologyGroup: "fractured_hunt",
		elitePartnerIds: ["graveRaven", "bandit"],
		gold: {
			min: 11,
			max: 18
		}
	},
	oathbreakerScout: {
		id: "oathbreakerScout",
		name: "裂誓斥候",
		icon: "🏹",
		realm: 2,
		hp: 36,
		patterns: [
			{
				type: "debuff",
				buffType: "weak",
				value: 1,
				intent: "🪶扰誓沙"
			},
			{
				type: "attack",
				value: 9,
				intent: "⚔️裂羽暗矢"
			},
			{
				type: "multiAction",
				intent: "🜂试锋校准",
				actions: [{
					type: "defend",
					value: 7,
					intent: "🛡️避矢"
				}, {
					type: "attack",
					value: 6,
					intent: "⚔️补射"
				}]
			}
		],
		aiProfile: "control",
		ecologyLabel: "誓裂游击",
		ecologyGroup: "fractured_hunt",
		elitePartnerIds: ["thunderBeast", "venomSnake"],
		gold: {
			min: 18,
			max: 27
		}
	},
	executionBanner: {
		id: "executionBanner",
		name: "问罪旗使",
		icon: "🚩",
		realm: 3,
		hp: 52,
		patterns: [
			{
				type: "buff",
				buffType: "strength",
				value: 2,
				intent: "🚩悬旗督战"
			},
			{
				type: "attack",
				value: 13,
				intent: "⚔️执旗斩"
			},
			{
				type: "debuff",
				buffType: "vulnerable",
				value: 1,
				intent: "✨问罪宣判"
			}
		],
		aiProfile: "balanced",
		ecologyLabel: "试罪刑阵",
		ecologyGroup: "fractured_hunt",
		elitePartnerIds: ["swordDisciple", "talismanMaster"],
		stealLaw: "swordIntent",
		gold: {
			min: 30,
			max: 46
		}
	},
	slagChanneler: {
		id: "slagChanneler",
		name: "熔渣导术师",
		icon: "🫗",
		realm: 4,
		hp: 60,
		patterns: [
			{
				type: "debuff",
				buffType: "burn",
				value: 2,
				intent: "🔥灼渣泼洒"
			},
			{
				type: "attack",
				value: 14,
				intent: "⚔️熔流切割"
			},
			{
				type: "defend",
				value: 10,
				intent: "🛡️炉灰护幕"
			}
		],
		aiProfile: "control",
		ecologyLabel: "熔渣工潮",
		ecologyGroup: "forge_tide",
		elitePartnerIds: ["emberPhysician", "alchemyGolem"],
		stealLaw: "flameTruth",
		element: "fire",
		gold: {
			min: 40,
			max: 58
		}
	},
	emberHomunculus: {
		id: "emberHomunculus",
		name: "火傀药童",
		icon: "🧫",
		realm: 5,
		hp: 74,
		patterns: [
			{
				type: "multiAction",
				intent: "🧪回炉配方",
				actions: [{
					type: "heal",
					value: 10,
					intent: "💚回火缝合"
				}, {
					type: "debuff",
					buffType: "burn",
					value: 2,
					intent: "🔥残焰附着"
				}]
			},
			{
				type: "attack",
				value: 17,
				intent: "⚔️药焰突刺"
			},
			{
				type: "defend",
				value: 12,
				intent: "🛡️丹壁回缩"
			}
		],
		aiProfile: "sustain",
		ecologyLabel: "回炉药潮",
		ecologyGroup: "forge_tide",
		elitePartnerIds: ["ancientGhost", "spiritBlade"],
		gold: {
			min: 55,
			max: 76
		}
	},
	furnaceTribune: {
		id: "furnaceTribune",
		name: "炉海监军",
		icon: "⚒️",
		realm: 6,
		hp: 92,
		patterns: [
			{
				type: "defend",
				value: 16,
				intent: "🛡️火脉督阵"
			},
			{
				type: "attack",
				value: 20,
				intent: "⚔️淬锋裁断"
			},
			{
				type: "buff",
				buffType: "strength",
				value: 2,
				intent: "💪熔潮鼓舞"
			}
		],
		aiProfile: "sustain",
		ecologyLabel: "炉监钳阵",
		ecologyGroup: "forge_tide",
		elitePartnerIds: ["divineGuard", "voidMonk"],
		stealLaw: "earthShield",
		gold: {
			min: 70,
			max: 95
		}
	},
	starScribe: {
		id: "starScribe",
		name: "沉星书记",
		icon: "📘",
		realm: 7,
		hp: 96,
		patterns: [
			{
				type: "debuff",
				buffType: "weak",
				value: 2,
				intent: "🌠迟滞批注"
			},
			{
				type: "attack",
				value: 21,
				intent: "⚔️陨墨斩"
			},
			{
				type: "heal",
				value: 12,
				intent: "💚星页回溯"
			}
		],
		aiProfile: "control",
		ecologyLabel: "沉星文阵",
		ecologyGroup: "star_archive",
		elitePartnerIds: ["icePhoenix", "timeKeeper"],
		stealLaw: "spaceRift",
		gold: {
			min: 78,
			max: 106
		}
	},
	orbitSentinel: {
		id: "orbitSentinel",
		name: "环轨守御",
		icon: "🛰️",
		realm: 8,
		hp: 116,
		patterns: [
			{
				type: "defend",
				value: 18,
				intent: "🛡️环轨偏移"
			},
			{
				type: "attack",
				value: 22,
				intent: "⚔️轨刺投落"
			},
			{
				type: "multiAction",
				intent: "🌌星链联锁",
				actions: [{
					type: "buff",
					buffType: "strength",
					value: 1,
					intent: "💪联锁增幅"
				}, {
					type: "attack",
					value: 8,
					intent: "⚔️补击"
				}]
			}
		],
		aiProfile: "balanced",
		ecologyLabel: "环轨锁阵",
		ecologyGroup: "star_archive",
		elitePartnerIds: ["mahayanaDisciple", "timeKeeper"],
		gold: {
			min: 95,
			max: 124
		}
	},
	chronologyMoth: {
		id: "chronologyMoth",
		name: "时序蛾灵",
		icon: "🦋",
		realm: 9,
		hp: 130,
		patterns: [
			{
				type: "debuff",
				buffType: "vulnerable",
				value: 2,
				intent: "✨回响蚀刻"
			},
			{
				type: "multiAttack",
				value: 10,
				count: 3,
				intent: "⚔️时针扑翼"
			},
			{
				type: "defend",
				value: 14,
				intent: "🛡️时砂护翅"
			}
		],
		aiProfile: "control",
		ecologyLabel: "时序织翼",
		ecologyGroup: "star_archive",
		elitePartnerIds: ["ascensionHerald", "goldenDragonkin"],
		element: "wind",
		gold: {
			min: 108,
			max: 138
		}
	},
	mirrorServitor: {
		id: "mirrorServitor",
		name: "照骨镜役",
		icon: "🪞",
		realm: 10,
		hp: 138,
		patterns: [
			{
				type: "debuff",
				buffType: "weak",
				value: 2,
				intent: "🪞折影映身"
			},
			{
				type: "attack",
				value: 26,
				intent: "⚔️镜刃反折"
			},
			{
				type: "defend",
				value: 16,
				intent: "🛡️照骨镜壳"
			}
		],
		aiProfile: "control",
		ecologyLabel: "照影反军",
		ecologyGroup: "mirror_curse",
		elitePartnerIds: ["mirrorWarden", "cursePriest"],
		gold: {
			min: 122,
			max: 156
		}
	},
	curseLacquerer: {
		id: "curseLacquerer",
		name: "黯漆咒匠",
		icon: "🖌️",
		realm: 11,
		hp: 150,
		patterns: [
			{
				type: "addStatus",
				cardId: "heartDemon",
				count: 1,
				intent: "🕳️黯漆附契"
			},
			{
				type: "attack",
				value: 27,
				intent: "⚔️诅墨横切"
			},
			{
				type: "debuff",
				buffType: "vulnerable",
				value: 2,
				intent: "✨镜咒放大"
			}
		],
		aiProfile: "control",
		ecologyLabel: "镜咒工坊",
		ecologyGroup: "mirror_curse",
		elitePartnerIds: ["stormSummoner", "mirrorDemon"],
		gold: {
			min: 132,
			max: 168
		}
	},
	reflectedPenitent: {
		id: "reflectedPenitent",
		name: "折光罪徒",
		icon: "🕯️",
		realm: 12,
		hp: 164,
		patterns: [
			{
				type: "defend",
				value: 18,
				intent: "🛡️折光赎壁"
			},
			{
				type: "multiAction",
				intent: "🪞罪映双身",
				actions: [{
					type: "attack",
					value: 16,
					intent: "⚔️镜返"
				}, {
					type: "debuff",
					buffType: "weak",
					value: 1,
					intent: "🌀失真"
				}]
			},
			{
				type: "heal",
				value: 14,
				intent: "💚赎烬重缝"
			}
		],
		aiProfile: "sustain",
		ecologyLabel: "赎镜压场",
		ecologyGroup: "mirror_curse",
		elitePartnerIds: ["triheadAcolyte", "mirrorDemon"],
		gold: {
			min: 145,
			max: 182
		}
	},
	bloodDebtKeeper: {
		id: "bloodDebtKeeper",
		name: "血契典吏",
		icon: "📕",
		realm: 13,
		hp: 176,
		patterns: [
			{
				type: "debuff",
				buffType: "bleed",
				value: 3,
				intent: "🩸血账追偿"
			},
			{
				type: "attack",
				value: 31,
				intent: "⚔️契书裁切"
			},
			{
				type: "buff",
				buffType: "strength",
				value: 2,
				intent: "💪债印催逼"
			}
		],
		aiProfile: "aggressive",
		ecologyLabel: "血账收庭",
		ecologyGroup: "bloodmoon_hunt",
		elitePartnerIds: ["bloodbat", "mirrorDemon"],
		gold: {
			min: 158,
			max: 196
		}
	},
	moonHowler: {
		id: "moonHowler",
		name: "噬月嚎兽",
		icon: "🌕",
		realm: 14,
		hp: 188,
		patterns: [
			{
				type: "multiAttack",
				value: 14,
				count: 3,
				intent: "⚔️血月连扑"
			},
			{
				type: "debuff",
				buffType: "mark",
				value: 3,
				intent: "🎯猎月锁喉"
			},
			{
				type: "attack",
				value: 36,
				intent: "⚔️月陨扑杀"
			}
		],
		aiProfile: "aggressive",
		ecologyLabel: "逐月猎潮",
		ecologyGroup: "bloodmoon_hunt",
		elitePartnerIds: ["chaosEye", "voidDevourer"],
		gold: {
			min: 170,
			max: 210
		}
	},
	sacramentButcher: {
		id: "sacramentButcher",
		name: "祭锋屠者",
		icon: "🪓",
		realm: 15,
		hp: 205,
		patterns: [
			{
				type: "multiAction",
				intent: "🩸献祭剜取",
				actions: [{
					type: "attack",
					value: 24,
					intent: "⚔️剜取"
				}, {
					type: "heal",
					value: 14,
					intent: "💚啖血回生"
				}]
			},
			{
				type: "debuff",
				buffType: "vulnerable",
				value: 2,
				intent: "✨祭锋开膛"
			},
			{
				type: "attack",
				value: 40,
				intent: "⚔️血断斩"
			}
		],
		aiProfile: "balanced",
		ecologyLabel: "献锋收割",
		ecologyGroup: "bloodmoon_hunt",
		elitePartnerIds: ["voidDevourer", "karmaSpirit"],
		gold: {
			min: 182,
			max: 226
		}
	},
	lawWeaver: {
		id: "lawWeaver",
		name: "法织执简",
		icon: "📜",
		realm: 16,
		hp: 220,
		patterns: [
			{
				type: "debuff",
				buffType: "weak",
				value: 2,
				intent: "📜法禁停笔"
			},
			{
				type: "defend",
				value: 20,
				intent: "🛡️文脉封层"
			},
			{
				type: "attack",
				value: 42,
				intent: "⚔️律线断裁"
			}
		],
		aiProfile: "sustain",
		ecologyLabel: "法庭织阵",
		ecologyGroup: "final_verdict",
		elitePartnerIds: ["elementalElder", "karmaArbiter"],
		stealLaw: "reversalLaw",
		gold: {
			min: 194,
			max: 238
		}
	},
	verdictEnvoy: {
		id: "verdictEnvoy",
		name: "审命谕使",
		icon: "⚖️",
		realm: 17,
		hp: 236,
		patterns: [
			{
				type: "debuff",
				buffType: "vulnerable",
				value: 2,
				intent: "⚖️裁命宣示"
			},
			{
				type: "multiAction",
				intent: "☯️双判同降",
				actions: [{
					type: "defend",
					value: 16,
					intent: "🛡️天衡自护"
				}, {
					type: "attack",
					value: 22,
					intent: "⚔️谕令追击"
				}]
			},
			{
				type: "attack",
				value: 45,
				intent: "⚔️终审重斩"
			}
		],
		aiProfile: "balanced",
		ecologyLabel: "天衡裁阵",
		ecologyGroup: "final_verdict",
		elitePartnerIds: ["karmaArbiter", "heavenlyDao"],
		gold: {
			min: 206,
			max: 252
		}
	},
	fateShackle: {
		id: "fateShackle",
		name: "命锁缚灵",
		icon: "⛓️",
		realm: 18,
		hp: 250,
		patterns: [
			{
				type: "addStatus",
				cardId: "heartDemon",
				count: 1,
				intent: "🕳️命锁烙印"
			},
			{
				type: "debuff",
				buffType: "mark",
				value: 3,
				intent: "🎯终命悬决"
			},
			{
				type: "multiAttack",
				value: 16,
				count: 3,
				intent: "⚔️断命缠剿"
			}
		],
		aiProfile: "control",
		ecologyLabel: "终庭锁命",
		ecologyGroup: "final_verdict",
		elitePartnerIds: ["heavenlyDao", "karmaArbiter"],
		stealLaw: "voidEmbrace",
		gold: {
			min: 220,
			max: 270
		}
	}
};
var ENEMY_ECOLOGY_TEMPLATES = {
	1: {
		chapterIndex: 1,
		formation: {
			id: "chapter1_fracture_hunt",
			name: "裂誓围猎",
			tag: "裂誓",
			desc: "前锋以标记和先手压血追猎，适合在你未稳血线前抢拍。",
			behavior: "pincer",
			preferred: ["striker", "hexer"],
			attackMul: 1.08,
			openingBlock: 2
		},
		elite: {
			id: "chapter1_oathbreak_exile",
			name: "问罪流放阵",
			tag: "问罪",
			desc: "精英战会以追痕、压血和问罪宣判连续逼你交资源。",
			behavior: "hex",
			preferred: ["hexer", "striker"],
			attackMul: 1.07,
			openingBlock: 4
		}
	},
	2: {
		chapterIndex: 2,
		formation: {
			id: "chapter2_forge_tide",
			name: "炉潮钳阵",
			tag: "炉潮",
			desc: "厚盾、灼烧与修补并进，会把战斗拖成资源锻打战。",
			behavior: "bulwark",
			preferred: ["guardian", "balanced"],
			attackMul: 1.03,
			openingBlock: 6
		},
		elite: {
			id: "chapter2_anvil_chain",
			name: "淬炉锁链阵",
			tag: "淬炉",
			desc: "精英会轮番上盾、回火与加压，逼你优先拆阵核。",
			behavior: "relay",
			preferred: ["guardian", "balanced"],
			attackMul: 1.06,
			openingBlock: 8
		}
	},
	3: {
		chapterIndex: 3,
		formation: {
			id: "chapter3_star_lattice",
			name: "沉星链阵",
			tag: "沉星",
			desc: "控场、回合预埋和连锁补刀会交替出现，错误收尾会被放大。",
			behavior: "hex",
			preferred: ["hexer", "balanced"],
			attackMul: 1.04,
			openingBlock: 4
		},
		elite: {
			id: "chapter3_chronicle_spiral",
			name: "时序回旋阵",
			tag: "时序",
			desc: "精英更偏向控手与补刀轮转，拖长后会不断吃到次回合税。",
			behavior: "relay",
			preferred: ["hexer", "guardian"],
			attackMul: 1.07,
			openingBlock: 5
		}
	},
	4: {
		chapterIndex: 4,
		formation: {
			id: "chapter4_mirror_curse",
			name: "悬镜咒潮",
			tag: "悬镜",
			desc: "镜返、诅咒与减益会层层叠起，让防错价值明显提高。",
			behavior: "hex",
			preferred: ["hexer", "balanced"],
			attackMul: 1.03,
			openingBlock: 5
		},
		elite: {
			id: "chapter4_reflection_chain",
			name: "折镜连忏",
			tag: "折镜",
			desc: "精英会在反照与续航间切换，要求你找准净化和爆发窗口。",
			behavior: "bulwark",
			preferred: ["hexer", "guardian"],
			attackMul: 1.05,
			openingBlock: 7
		}
	},
	5: {
		chapterIndex: 5,
		formation: {
			id: "chapter5_bloodmoon_hunt",
			name: "血月逐猎",
			tag: "血月",
			desc: "压血、收割与狂化阈值一起推进，越拖越容易被斩线。",
			behavior: "pincer",
			preferred: ["striker", "balanced"],
			attackMul: 1.09,
			openingBlock: 3
		},
		elite: {
			id: "chapter5_sacrifice_feast",
			name: "祭锋盛猎",
			tag: "祭锋",
			desc: "精英会用献祭回生和高压收割把战斗推向赌命节奏。",
			behavior: "relay",
			preferred: ["striker", "hexer"],
			attackMul: 1.1,
			openingBlock: 4
		}
	},
	6: {
		chapterIndex: 6,
		formation: {
			id: "chapter6_final_verdict",
			name: "终庭法裁",
			tag: "终庭",
			desc: "法则压制、标记审判与多轴检定同时存在，要求构筑完整应答。",
			behavior: "bulwark",
			preferred: [
				"guardian",
				"hexer",
				"balanced"
			],
			attackMul: 1.05,
			openingBlock: 6
		},
		elite: {
			id: "chapter6_heavenly_adjudication",
			name: "命衡审列",
			tag: "命衡",
			desc: "精英会以终局审判姿态拆你的容错，逼你尽快打穿阵眼。",
			behavior: "hex",
			preferred: ["hexer", "guardian"],
			attackMul: 1.08,
			openingBlock: 8
		}
	}
};
var CHAPTER_ELITE_COMBOS = {
	1: {
		chapterIndex: 1,
		name: "问罪猎杀",
		anchorEnemyIds: ["executionBanner", "oathHound"],
		summary: "先挂追痕再逼出易伤，让前段章节形成强烈的抢拍压血感。"
	},
	2: {
		chapterIndex: 2,
		name: "炉潮锁链",
		anchorEnemyIds: ["furnaceTribune", "slagChanneler"],
		summary: "前排稳压、后排灼烧回火，逼你在资源被烧干前强拆阵核。"
	},
	3: {
		chapterIndex: 3,
		name: "时序追算",
		anchorEnemyIds: ["orbitSentinel", "chronologyMoth"],
		summary: "通过连锁补刀与时序控手，让错误牌序不断被追罚。"
	},
	4: {
		chapterIndex: 4,
		name: "镜咒双映",
		anchorEnemyIds: ["mirrorServitor", "curseLacquerer"],
		summary: "镜返与心魔污染共同压场，需要净化与快攻并用。"
	},
	5: {
		chapterIndex: 5,
		name: "血契盛猎",
		anchorEnemyIds: ["bloodDebtKeeper", "sacramentButcher"],
		summary: "围绕低血收益与回生收割持续加压，逼你主动抢收头。"
	},
	6: {
		chapterIndex: 6,
		name: "终庭审列",
		anchorEnemyIds: ["lawWeaver", "verdictEnvoy"],
		summary: "用法则压制与终局裁断构成复合资源税，是终章精英的典型考题。"
	}
};
var BOSS_PHASE_BLUEPRINTS = {
	swordElder: {
		actTwo: {
			threshold: .72,
			name: "剑阵封域",
			heal: .05,
			attackMul: 1.14,
			appendPatterns: [{
				type: "debuff",
				buffType: "mark",
				value: 2,
				intent: "🎯封域剑印"
			}]
		},
		actThree: {
			threshold: .34,
			name: "万刃问锋",
			heal: .1,
			attackMul: 1.24,
			defendMul: .85,
			appendPatterns: [{
				type: "multiAttack",
				value: 8,
				count: 3,
				intent: "⚔️万刃断空"
			}]
		},
		setpiece: {
			openingStance: "开场以剑印封诀锁你的关键牌序，逼你先交冗余牌。",
			counterWindow: "拆掉剑阵护势、逼它提前交出封域回合，就是主要输出窗口。",
			finisher: "万刃问锋",
			visualCue: "大片断空剑符与环形剑阵会成为最醒目的战场记忆点。"
		}
	},
	divineLord: {
		actTwo: {
			threshold: .7,
			name: "神念锁界",
			heal: .06,
			attackMul: 1.12,
			appendPatterns: [{
				type: "debuff",
				buffType: "weak",
				value: 2,
				intent: "🌀神念压境"
			}]
		},
		actThree: {
			threshold: .32,
			name: "敕令天坠",
			heal: .11,
			attackMul: 1.26,
			defendMul: .8,
			appendPatterns: [{
				type: "attack",
				value: 44,
				intent: "☄️敕令坠界"
			}]
		},
		setpiece: {
			openingStance: "以神念贡税压你的手牌厚度，越怕丢关键牌越会被拖慢。",
			counterWindow: "保住低价值牌吃税，并在它切入敕令前用爆发压低血线。",
			finisher: "敕令天坠",
			visualCue: "天幕敕符与高空坠落的法印会强化“被审判”的压迫感。"
		}
	},
	ascensionSovereign: {
		actTwo: {
			threshold: .72,
			name: "雷诰巡天",
			heal: .05,
			attackMul: 1.15,
			appendPatterns: [{
				type: "debuff",
				buffType: "vulnerable",
				value: 2,
				intent: "⚡雷诰锁命"
			}]
		},
		actThree: {
			threshold: .35,
			name: "升霄天罚",
			heal: .1,
			attackMul: 1.22,
			defendMul: .82,
			appendPatterns: [{
				type: "multiAttack",
				value: 12,
				count: 3,
				intent: "⚡升霄天罚"
			}]
		},
		setpiece: {
			openingStance: "先以封符和高压雷击迫使你缩短回合价值。",
			counterWindow: "雷诰预备回合护盾较薄，是抢节奏与斩线的关键两拍。",
			finisher: "升霄天罚",
			visualCue: "整幕雷环收束到 Boss 身周，再炸成三段天罚落雷。"
		}
	},
	triheadGoldDragon: {
		actTwo: {
			threshold: .7,
			name: "三首轮甲",
			heal: .06,
			attackMul: 1.1,
			appendPatterns: [{
				type: "defend",
				value: 26,
				intent: "🛡️龙鳞轮甲"
			}]
		},
		actThree: {
			threshold: .33,
			name: "鎏金噬界",
			heal: .12,
			attackMul: 1.25,
			defendMul: .9,
			appendPatterns: [{
				type: "attack",
				value: 56,
				intent: "💥鎏金龙噬"
			}]
		},
		setpiece: {
			openingStance: "三首会轮替夺壁、反伤与高抗，逼你先决定用什么属性拆甲。",
			counterWindow: "破掉大额护盾后的空档极短，需提前预留穿甲与爆发段。",
			finisher: "鎏金噬界",
			visualCue: "三枚龙首轮流点亮，最后会在中央叠成一道鎏金龙噬。"
		}
	},
	voidDevourer: {
		actTwo: {
			threshold: .71,
			name: "渊腹翻潮",
			heal: .05,
			attackMul: 1.13,
			appendPatterns: [{
				type: "addStatus",
				cardId: "heartDemon",
				count: 1,
				intent: "🕳️渊潮蚀心"
			}]
		},
		actThree: {
			threshold: .3,
			name: "终渊咀灭",
			heal: .11,
			attackMul: 1.24,
			defendMul: .82,
			appendPatterns: [{
				type: "multiAttack",
				value: 16,
				count: 3,
				intent: "🌑终渊咀灭"
			}]
		},
		setpiece: {
			openingStance: "以吞噬和禁疗慢慢磨空你的恢复路线，再逼你赌爆发收尾。",
			counterWindow: "它每次翻潮前会略微降速，正是清状态并转攻的窗口。",
			finisher: "终渊咀灭",
			visualCue: "虚空裂口逐层扩张，压轴时会像黑潮一样吞没战场。"
		}
	},
	heavenlyDao: {
		actTwo: {
			threshold: .74,
			name: "善律改卷",
			heal: .08,
			attackMul: 1.12,
			appendPatterns: [{
				type: "defend",
				value: 80,
				intent: "🛡️善律改卷"
			}]
		},
		actThree: {
			threshold: .36,
			name: "终焉裁问",
			heal: .15,
			attackMul: 1.28,
			defendMul: .7,
			appendPatterns: [{
				type: "attack",
				value: 188,
				intent: "☯️终焉裁问"
			}]
		},
		setpiece: {
			openingStance: "先以天道映照审问你的构筑，再逐步把多轴联动拉上台面。",
			counterWindow: "映照回合结束后它会短暂暴露，必须趁那几拍完成关键转轴。",
			finisher: "终焉裁问",
			visualCue: "善恶双轮与太极法庭同时落下，形成终章最强视觉断章。"
		}
	}
};
Object.values(V6_ENEMY_PACK).forEach((enemy) => {
	if (!enemy || !enemy.id || ENEMIES[enemy.id]) return;
	ENEMIES[enemy.id] = enemy;
});
function enrichEnemyMetadata() {
	const createScaledPhasePatterns = (basePatterns = [], config = {}) => {
		const attackMul = Math.max(1, Number(config.attackMul) || 1);
		const defendMul = Math.max(.5, Number(config.defendMul) || 1);
		const patterns = (Array.isArray(basePatterns) ? basePatterns : []).map((pattern) => {
			if (!pattern || typeof pattern !== "object") return pattern;
			const next = { ...pattern };
			if ((next.type === "attack" || next.type === "multiAttack" || next.type === "executeDamage") && Number.isFinite(Number(next.value))) next.value = Math.max(1, Math.floor(Number(next.value) * attackMul));
			if ((next.type === "defend" || next.type === "heal") && Number.isFinite(Number(next.value))) next.value = Math.max(1, Math.floor(Number(next.value) * defendMul));
			return next;
		});
		(config.appendPatterns || []).forEach((pattern) => {
			if (pattern && typeof pattern === "object") patterns.push({ ...pattern });
		});
		return patterns;
	};
	Object.entries(BOSS_PHASE_BLUEPRINTS).forEach(([bossId, blueprint]) => {
		const boss = ENEMIES[bossId];
		if (!boss || boss.phaseConfig) return;
		const basePatterns = Array.isArray(boss.patterns) ? boss.patterns : [];
		boss.phaseConfig = [{
			threshold: Number.isFinite(Number(blueprint.actTwo?.threshold)) ? Number(blueprint.actTwo.threshold) : .68,
			name: blueprint.actTwo?.name || "怒相",
			heal: Number.isFinite(Number(blueprint.actTwo?.heal)) ? Number(blueprint.actTwo.heal) : .06,
			patterns: createScaledPhasePatterns(basePatterns, blueprint.actTwo || {})
		}, {
			threshold: Number.isFinite(Number(blueprint.actThree?.threshold)) ? Number(blueprint.actThree.threshold) : .34,
			name: blueprint.actThree?.name || "狂相",
			heal: Number.isFinite(Number(blueprint.actThree?.heal)) ? Number(blueprint.actThree.heal) : .1,
			patterns: createScaledPhasePatterns(basePatterns, blueprint.actThree || {})
		}];
		if (blueprint.setpiece && typeof blueprint.setpiece === "object") boss.bossSetpiece = {
			openingStance: String(blueprint.setpiece.openingStance || ""),
			counterWindow: String(blueprint.setpiece.counterWindow || ""),
			finisher: String(blueprint.setpiece.finisher || ""),
			visualCue: String(blueprint.setpiece.visualCue || "")
		};
	});
	const chapterEcologyDefaults = {
		1: {
			group: "fractured_hunt",
			label: "裂誓试锋"
		},
		2: {
			group: "forge_tide",
			label: "炉潮淬阵"
		},
		3: {
			group: "star_archive",
			label: "沉星筹算"
		},
		4: {
			group: "mirror_curse",
			label: "悬镜反照"
		},
		5: {
			group: "bloodmoon_hunt",
			label: "血月收割"
		},
		6: {
			group: "final_verdict",
			label: "终庭裁命"
		}
	};
	Object.values(ENEMIES).forEach((enemy) => {
		if (!enemy.aiProfile) if (enemy.isBoss) enemy.aiProfile = "boss_adaptive";
		else if ((enemy.patterns || []).some((p) => p.type === "debuff")) enemy.aiProfile = "control";
		else if ((enemy.patterns || []).some((p) => p.type === "defend" || p.type === "heal")) enemy.aiProfile = "sustain";
		else enemy.aiProfile = "aggressive";
		if (!enemy.resistTags) enemy.resistTags = enemy.resistances ? Object.entries(enemy.resistances).filter(([, v]) => v > 0).map(([k]) => `resist_${k}`) : [];
		const ecologyDefault = chapterEcologyDefaults[Math.max(1, Math.min(6, Math.floor((Math.max(1, Number(enemy.realm) || 1) - 1) / 3) + 1))] || chapterEcologyDefaults[1];
		if (!enemy.ecologyGroup) enemy.ecologyGroup = ecologyDefault.group;
		if (!enemy.ecologyLabel) enemy.ecologyLabel = ecologyDefault.label;
	});
	const injectPattern = (enemyId, pattern) => {
		const enemy = ENEMIES[enemyId];
		if (!enemy || !Array.isArray(enemy.patterns)) return;
		if (!enemy.patterns.some((p) => p.type === pattern.type && p.buffType === pattern.buffType && p.intent === pattern.intent)) enemy.patterns.push(pattern);
	};
	injectPattern("bandit", {
		type: "debuff",
		buffType: "mark",
		value: 2,
		intent: "🎯"
	});
	injectPattern("venomSnake", {
		type: "debuff",
		buffType: "bleed",
		value: 2,
		intent: "🩸"
	});
	injectPattern("thunderBeast", {
		type: "debuff",
		buffType: "mark",
		value: 3,
		intent: "🎯"
	});
	injectPattern("talismanMaster", {
		type: "debuff",
		buffType: "mark",
		value: 2,
		intent: "🎯"
	});
	injectPattern("flameCultist", {
		type: "debuff",
		buffType: "bleed",
		value: 2,
		intent: "🩸"
	});
	injectPattern("crystalGolem", {
		type: "debuff",
		buffType: "mark",
		value: 2,
		intent: "🎯"
	});
	injectPattern("demonWolf", {
		type: "debuff",
		buffType: "bleed",
		value: 3,
		intent: "🩸"
	});
	injectPattern("swordElder", {
		type: "debuff",
		buffType: "mark",
		value: 4,
		intent: "🎯"
	});
	[
		"swordElder",
		"danZun",
		"heavenlyDao",
		"karmaArbiter",
		"ancientSpirit",
		"swordSaint",
		"tribulationCloud10",
		"tribulationCloud15"
	].forEach((id) => {
		const boss = ENEMIES[id];
		if (!boss || boss.phaseConfig) return;
		const basePatterns = boss.patterns || [];
		boss.phaseConfig = [{
			threshold: .65,
			name: "怒相",
			heal: .08,
			patterns: basePatterns.map((p) => {
				if (p.type === "attack" || p.type === "multiAttack") return {
					...p,
					value: Math.floor((p.value || 0) * 1.15)
				};
				return { ...p };
			})
		}, {
			threshold: .3,
			name: "狂相",
			heal: .12,
			patterns: basePatterns.map((p) => {
				if (p.type === "attack" || p.type === "multiAttack") return {
					...p,
					value: Math.floor((p.value || 0) * 1.3)
				};
				if (p.type === "defend") return {
					...p,
					value: Math.floor((p.value || 0) * .8)
				};
				return { ...p };
			})
		}];
	});
}
enrichEnemyMetadata();
if (typeof window !== "undefined") {
	window.ENEMIES = ENEMIES;
	window.ENEMY_ECOLOGY_TEMPLATES = ENEMY_ECOLOGY_TEMPLATES;
	window.CHAPTER_ELITE_COMBOS = CHAPTER_ELITE_COMBOS;
}
//#endregion
//#region js/data/cards.js
/**
* The Defier - 卡牌数据
* 所有游戏卡牌的定义
*/
var CARDS = {
	strike: {
		id: "strike",
		name: "斩击",
		type: "attack",
		cost: 1,
		icon: "⚔️",
		description: "造成 6 点伤害",
		rarity: "basic",
		effects: [{
			type: "damage",
			value: 6,
			target: "enemy"
		}]
	},
	heavyStrike: {
		id: "heavyStrike",
		name: "重斩",
		type: "attack",
		cost: 2,
		icon: "🗡️",
		description: "造成 12 点伤害",
		rarity: "common",
		effects: [{
			type: "damage",
			value: 12,
			target: "enemy"
		}]
	},
	quickSlash: {
		id: "quickSlash",
		name: "疾斩",
		type: "attack",
		cost: 1,
		icon: "💨",
		description: "造成 4 点伤害",
		rarity: "common",
		effects: [{
			type: "damage",
			value: 4,
			target: "enemy"
		}]
	},
	doubleStrike: {
		id: "doubleStrike",
		name: "双重斩击",
		type: "attack",
		cost: 1,
		icon: "⚔️",
		description: "造成 4 点伤害两次",
		rarity: "common",
		effects: [{
			type: "damage",
			value: 4,
			target: "enemy"
		}, {
			type: "damage",
			value: 4,
			target: "enemy"
		}]
	},
	ragingBlow: {
		id: "ragingBlow",
		name: "狂暴一击",
		type: "attack",
		cost: 3,
		icon: "💥",
		description: "造成 20 点伤害",
		rarity: "uncommon",
		element: "fire",
		effects: [{
			type: "damage",
			value: 20,
			target: "enemy"
		}]
	},
	defend: {
		id: "defend",
		name: "防御",
		type: "defense",
		cost: 1,
		icon: "🛡️",
		description: "获得 5 点护盾",
		rarity: "basic",
		effects: [{
			type: "block",
			value: 5,
			target: "self"
		}]
	},
	ironWill: {
		id: "ironWill",
		name: "铁壁",
		type: "defense",
		cost: 2,
		icon: "🏰",
		description: "获得 12 点护盾",
		rarity: "common",
		effects: [{
			type: "block",
			value: 12,
			target: "self"
		}]
	},
	shieldBash: {
		id: "shieldBash",
		name: "盾击",
		type: "attack",
		cost: 1,
		icon: "🛡️",
		description: "造成 4 点伤害，获得 4 点护盾",
		rarity: "common",
		effects: [{
			type: "damage",
			value: 4,
			target: "enemy"
		}, {
			type: "block",
			value: 4,
			target: "self"
		}]
	},
	counterStance: {
		id: "counterStance",
		name: "反击架势",
		type: "defense",
		cost: 1,
		icon: "⚡",
		description: "获得 3 点护盾，下次受到攻击时反弹 5 点伤害",
		rarity: "uncommon",
		effects: [{
			type: "block",
			value: 3,
			target: "self"
		}, {
			type: "buff",
			buffType: "thorns",
			value: 5,
			target: "self"
		}]
	},
	spiritBoost: {
		id: "spiritBoost",
		name: "灵力激涌",
		type: "energy",
		cost: 0,
		icon: "✨",
		description: "获得 2 点灵力",
		rarity: "common",
		effects: [{
			type: "energy",
			value: 2,
			target: "self"
		}]
	},
	meditation: {
		id: "meditation",
		name: "冥想",
		type: "energy",
		cost: 0,
		consumeCandy: true,
		icon: "🧘",
		description: "消耗1奶糖。抽 2 张牌",
		rarity: "common",
		effects: [{
			type: "draw",
			value: 2,
			target: "self"
		}]
	},
	heartDemon: {
		id: "heartDemon",
		name: "心魔",
		type: "status",
		cost: 0,
		unplayable: true,
		retain: true,
		occupiesDrawSlot: true,
		icon: "👿",
		description: "无法打出。保留在手中。占据抽卡位。回合结束时，受到 Max(10%当前生命, 10) 点真实伤害。效果可叠加。",
		rarity: "special",
		effects: [{
			type: "selfDamage",
			value: .1,
			isPercent: true,
			trigger: "endTurn",
			minValue: 10
		}]
	},
	innerPeace: {
		id: "innerPeace",
		name: "内心平和",
		type: "defense",
		cost: 1,
		icon: "☯️",
		description: "获得 4 点护盾，回复 3 点生命",
		rarity: "uncommon",
		effects: [{
			type: "block",
			value: 4,
			target: "self"
		}, {
			type: "heal",
			value: 3,
			target: "self"
		}]
	},
	battleCry: {
		id: "battleCry",
		name: "战吼",
		type: "attack",
		cost: 1,
		icon: "📢",
		description: "造成 5 点伤害，本回合攻击力+2",
		rarity: "uncommon",
		effects: [{
			type: "damage",
			value: 5,
			target: "enemy"
		}, {
			type: "buff",
			buffType: "strength",
			value: 2,
			target: "self"
		}]
	},
	bloodlettingSlash: {
		id: "bloodlettingSlash",
		name: "裂脉斩",
		type: "attack",
		cost: 1,
		icon: "🩸",
		description: "造成 6 点伤害并施加 2 层流血",
		rarity: "common",
		keywords: ["bleed"],
		comboTag: "bleed",
		synergyGroup: "hemorrhage",
		effects: [{
			type: "damage",
			value: 6,
			target: "enemy"
		}, {
			type: "applyBleed",
			value: 2,
			target: "enemy"
		}]
	},
	punctureMark: {
		id: "punctureMark",
		name: "破绽刺",
		type: "attack",
		cost: 1,
		icon: "🎯",
		description: "造成 4 点伤害并施加 4 层破绽",
		rarity: "common",
		keywords: ["mark"],
		comboTag: "mark",
		synergyGroup: "precision",
		effects: [{
			type: "damage",
			value: 4,
			target: "enemy"
		}, {
			type: "applyMark",
			value: 4,
			target: "enemy"
		}]
	},
	tacticalExpose: {
		id: "tacticalExpose",
		name: "战术破析",
		type: "skill",
		cost: 1,
		icon: "🧭",
		description: "施加 6 层破绽并抽 1 张牌",
		rarity: "uncommon",
		keywords: ["mark"],
		comboTag: "mark",
		synergyGroup: "precision",
		effects: [{
			type: "applyMark",
			value: 6,
			target: "enemy"
		}, {
			type: "draw",
			value: 1,
			target: "self"
		}]
	},
	crimsonCascade: {
		id: "crimsonCascade",
		name: "赤瀑连断",
		type: "attack",
		cost: 2,
		icon: "🌊",
		description: "造成 9 点伤害并施加 3 层流血",
		rarity: "uncommon",
		keywords: ["bleed"],
		comboTag: "bleed",
		synergyGroup: "hemorrhage",
		effects: [{
			type: "damage",
			value: 9,
			target: "enemy"
		}, {
			type: "applyBleed",
			value: 3,
			target: "enemy"
		}]
	},
	hunterSeal: {
		id: "hunterSeal",
		name: "猎印",
		type: "skill",
		cost: 0,
		icon: "🪶",
		description: "施加 3 层破绽，获得 1 点灵力",
		rarity: "common",
		keywords: ["mark", "tempo"],
		comboTag: "mark",
		synergyGroup: "precision",
		effects: [{
			type: "applyMark",
			value: 3,
			target: "enemy"
		}, {
			type: "energy",
			value: 1,
			target: "self"
		}]
	},
	stanceAggressive: {
		id: "stanceAggressive",
		name: "攻势架势",
		type: "power",
		cost: 1,
		icon: "🔥",
		description: "切换到攻势：造成伤害提高，承伤增加",
		rarity: "uncommon",
		keywords: ["stance"],
		comboTag: "stance",
		synergyGroup: "stance",
		effects: [{
			type: "setStance",
			stance: "aggressive",
			target: "self"
		}]
	},
	stanceDefensive: {
		id: "stanceDefensive",
		name: "守势架势",
		type: "power",
		cost: 1,
		icon: "🛡️",
		description: "切换到守势：承伤降低，输出略降",
		rarity: "uncommon",
		keywords: ["stance"],
		comboTag: "stance",
		synergyGroup: "stance",
		effects: [{
			type: "setStance",
			stance: "defensive",
			target: "self"
		}]
	},
	stanceFlow: {
		id: "stanceFlow",
		name: "归一心流",
		type: "skill",
		cost: 0,
		icon: "☯️",
		description: "切回中和架势并抽 1 张牌",
		rarity: "common",
		keywords: ["stance"],
		comboTag: "stance",
		synergyGroup: "stance",
		effects: [{
			type: "setStance",
			stance: "neutral",
			target: "self"
		}, {
			type: "draw",
			value: 1,
			target: "self"
		}]
	},
	guardedRiposte: {
		id: "guardedRiposte",
		name: "守中反击",
		type: "defense",
		cost: 1,
		icon: "🗡️",
		description: "获得 8 护盾并施加 2 层破绽",
		rarity: "common",
		keywords: ["stance", "mark"],
		comboTag: "stance",
		synergyGroup: "stance",
		effects: [{
			type: "block",
			value: 8,
			target: "self"
		}, {
			type: "applyMark",
			value: 2,
			target: "enemy"
		}]
	},
	sunderingNeedle: {
		id: "sunderingNeedle",
		name: "裂界针",
		type: "attack",
		cost: 2,
		icon: "🪡",
		description: "造成 10 点穿透伤害并施加 2 层流血",
		rarity: "rare",
		keywords: ["bleed", "penetrate"],
		comboTag: "bleed",
		synergyGroup: "hemorrhage",
		effects: [{
			type: "penetrate",
			value: 10,
			target: "enemy"
		}, {
			type: "applyBleed",
			value: 2,
			target: "enemy"
		}]
	},
	hemorrhageRain: {
		id: "hemorrhageRain",
		name: "血雨",
		type: "attack",
		cost: 2,
		icon: "🌧️",
		description: "对全体造成 5 点伤害，并施加 1 层流血",
		rarity: "rare",
		keywords: ["bleed", "aoe"],
		comboTag: "bleed",
		synergyGroup: "hemorrhage",
		effects: [{
			type: "damageAll",
			value: 5,
			target: "allEnemies"
		}, {
			type: "applyBleed",
			value: 1,
			target: "enemy"
		}]
	},
	executionDoctrine: {
		id: "executionDoctrine",
		name: "斩决要义",
		type: "attack",
		cost: 2,
		icon: "📜",
		description: "造成 8 点伤害；若目标有破绽，额外造成 8 点伤害",
		rarity: "rare",
		keywords: ["mark", "burst"],
		comboTag: "mark",
		synergyGroup: "precision",
		effects: [{
			type: "damage",
			value: 8,
			target: "enemy"
		}, {
			type: "conditionalDamage",
			value: 8,
			condition: "marked",
			target: "enemy"
		}]
	},
	serratedRitual: {
		id: "serratedRitual",
		name: "锯刃仪式",
		type: "attack",
		cost: 1,
		icon: "🩸",
		description: "造成 5 点伤害，施加 2 层流血，自身受到 1 点伤害",
		rarity: "common",
		keywords: ["bleed"],
		comboTag: "bleed",
		synergyGroup: "hemorrhage",
		effects: [
			{
				type: "damage",
				value: 5,
				target: "enemy"
			},
			{
				type: "applyBleed",
				value: 2,
				target: "enemy"
			},
			{
				type: "selfDamage",
				value: 1,
				target: "self"
			}
		]
	},
	coagulatedGuard: {
		id: "coagulatedGuard",
		name: "凝血守式",
		type: "defense",
		cost: 1,
		icon: "🛡️",
		description: "获得 6 点护盾，并施加 1 层流血",
		rarity: "common",
		keywords: ["bleed", "stance"],
		comboTag: "bleed",
		synergyGroup: "hemorrhage",
		effects: [{
			type: "block",
			value: 6,
			target: "self"
		}, {
			type: "applyBleed",
			value: 1,
			target: "enemy"
		}]
	},
	bloodDebt: {
		id: "bloodDebt",
		name: "血债引燃",
		type: "skill",
		cost: 0,
		icon: "🧪",
		description: "失去 3 点生命，获得 2 点灵力并抽 1 张牌",
		rarity: "uncommon",
		keywords: ["bleed", "tempo"],
		comboTag: "bleed",
		synergyGroup: "hemorrhage",
		effects: [
			{
				type: "selfDamage",
				value: 3,
				target: "self"
			},
			{
				type: "energy",
				value: 2,
				target: "self"
			},
			{
				type: "draw",
				value: 1,
				target: "self"
			}
		]
	},
	arteryRupture: {
		id: "arteryRupture",
		name: "断脉贯刺",
		type: "attack",
		cost: 2,
		icon: "🗡️",
		description: "造成 8 点穿透伤害并施加 4 层流血",
		rarity: "uncommon",
		keywords: ["bleed", "penetrate"],
		comboTag: "bleed",
		synergyGroup: "hemorrhage",
		effects: [{
			type: "penetrate",
			value: 8,
			target: "enemy"
		}, {
			type: "applyBleed",
			value: 4,
			target: "enemy"
		}]
	},
	scarletJudgement: {
		id: "scarletJudgement",
		name: "赤裁",
		type: "attack",
		cost: 2,
		icon: "⚰️",
		description: "造成 7 点伤害并施加 2 层流血；对半血以下目标造成 10 点处决伤害",
		rarity: "rare",
		keywords: ["bleed", "burst"],
		comboTag: "bleed",
		synergyGroup: "hemorrhage",
		effects: [
			{
				type: "damage",
				value: 7,
				target: "enemy"
			},
			{
				type: "applyBleed",
				value: 2,
				target: "enemy"
			},
			{
				type: "executeDamage",
				value: 10,
				threshold: .5,
				target: "enemy"
			}
		]
	},
	bloodTideOath: {
		id: "bloodTideOath",
		name: "血潮誓约",
		type: "attack",
		cost: 3,
		icon: "🌊",
		description: "对全体造成 6 点伤害，抽 1 张牌，自身受到 4 点伤害",
		rarity: "rare",
		keywords: ["bleed", "aoe"],
		comboTag: "bleed",
		synergyGroup: "hemorrhage",
		effects: [
			{
				type: "damageAll",
				value: 6,
				target: "allEnemies"
			},
			{
				type: "draw",
				value: 1,
				target: "self"
			},
			{
				type: "selfDamage",
				value: 4,
				target: "self"
			}
		]
	},
	weakpointSurvey: {
		id: "weakpointSurvey",
		name: "弱点勘测",
		type: "skill",
		cost: 0,
		icon: "🧭",
		description: "施加 2 层破绽并抽 1 张牌",
		rarity: "common",
		keywords: ["mark", "tempo"],
		comboTag: "mark",
		synergyGroup: "precision",
		effects: [{
			type: "applyMark",
			value: 2,
			target: "enemy"
		}, {
			type: "draw",
			value: 1,
			target: "self"
		}]
	},
	duetFeint: {
		id: "duetFeint",
		name: "双式佯攻",
		type: "attack",
		cost: 1,
		icon: "🪶",
		description: "造成 5 点伤害并施加 2 层破绽",
		rarity: "common",
		keywords: ["mark"],
		comboTag: "mark",
		synergyGroup: "precision",
		effects: [{
			type: "damage",
			value: 5,
			target: "enemy"
		}, {
			type: "applyMark",
			value: 2,
			target: "enemy"
		}]
	},
	poisedCounter: {
		id: "poisedCounter",
		name: "定式反制",
		type: "defense",
		cost: 1,
		icon: "⚖️",
		description: "获得 7 点护盾并施加 2 层破绽",
		rarity: "common",
		keywords: ["mark", "stance"],
		comboTag: "mark",
		synergyGroup: "precision",
		effects: [{
			type: "block",
			value: 7,
			target: "self"
		}, {
			type: "applyMark",
			value: 2,
			target: "enemy"
		}]
	},
	razorFocus: {
		id: "razorFocus",
		name: "锋念凝聚",
		type: "skill",
		cost: 1,
		icon: "🎯",
		description: "施加 5 层破绽并获得 1 点灵力",
		rarity: "uncommon",
		keywords: ["mark"],
		comboTag: "mark",
		synergyGroup: "precision",
		effects: [{
			type: "applyMark",
			value: 5,
			target: "enemy"
		}, {
			type: "energy",
			value: 1,
			target: "self"
		}]
	},
	stancePivot: {
		id: "stancePivot",
		name: "转势",
		type: "skill",
		cost: 0,
		icon: "☯️",
		description: "切回中和架势，施加 2 层破绽并抽 1 张牌",
		rarity: "uncommon",
		keywords: ["mark", "stance"],
		comboTag: "stance",
		synergyGroup: "precision",
		effects: [
			{
				type: "setStance",
				stance: "neutral",
				target: "self"
			},
			{
				type: "applyMark",
				value: 2,
				target: "enemy"
			},
			{
				type: "draw",
				value: 1,
				target: "self"
			}
		]
	},
	focusBreak: {
		id: "focusBreak",
		name: "断念",
		type: "attack",
		cost: 1,
		icon: "⚔️",
		description: "造成 6 点伤害；若目标有破绽，额外造成 6 点伤害",
		rarity: "uncommon",
		keywords: ["mark", "burst"],
		comboTag: "mark",
		synergyGroup: "precision",
		effects: [{
			type: "damage",
			value: 6,
			target: "enemy"
		}, {
			type: "conditionalDamage",
			value: 6,
			condition: "marked",
			target: "enemy"
		}]
	},
	verdictNeedle: {
		id: "verdictNeedle",
		name: "裁决针",
		type: "attack",
		cost: 2,
		icon: "🪡",
		description: "造成 10 点穿透伤害；若目标有破绽，额外造成 7 点伤害",
		rarity: "rare",
		keywords: ["mark", "penetrate"],
		comboTag: "mark",
		synergyGroup: "precision",
		effects: [{
			type: "penetrate",
			value: 10,
			target: "enemy"
		}, {
			type: "conditionalDamage",
			value: 7,
			condition: "marked",
			target: "enemy"
		}]
	},
	recklessMulligan: {
		id: "recklessMulligan",
		name: "孤注换手",
		type: "skill",
		cost: 0,
		icon: "🎴",
		description: "丢弃所有手牌，抽 2+弃牌数 张牌",
		rarity: "common",
		keywords: ["discard", "tempo"],
		comboTag: "discard",
		synergyGroup: "entropy",
		effects: [{
			type: "discardHand",
			target: "self"
		}, {
			type: "drawCalculated",
			base: 2,
			perDiscard: 1,
			target: "self"
		}]
	},
	echoingCut: {
		id: "echoingCut",
		name: "回响斩",
		type: "attack",
		cost: 1,
		icon: "🗡️",
		description: "造成 6 点伤害，随机弃 1 张牌并抽 1 张牌",
		rarity: "common",
		keywords: [
			"discard",
			"echo",
			"mirror"
		],
		comboTag: "discard",
		synergyGroup: "entropy",
		effects: [
			{
				type: "damage",
				value: 6,
				target: "enemy"
			},
			{
				type: "discardRandom",
				value: 1,
				target: "self"
			},
			{
				type: "draw",
				value: 1,
				target: "self"
			}
		]
	},
	voidLedger: {
		id: "voidLedger",
		name: "虚账",
		type: "skill",
		cost: 1,
		icon: "📒",
		description: "抽 2 张牌，然后随机弃 1 张牌",
		rarity: "common",
		keywords: ["discard"],
		comboTag: "discard",
		synergyGroup: "entropy",
		effects: [{
			type: "draw",
			value: 2,
			target: "self"
		}, {
			type: "discardRandom",
			value: 1,
			target: "self"
		}]
	},
	entropyGuard: {
		id: "entropyGuard",
		name: "熵障",
		type: "defense",
		cost: 1,
		icon: "🧿",
		description: "获得 9 点护盾，随机弃 1 张牌并获得 1 点灵力",
		rarity: "common",
		keywords: ["discard"],
		comboTag: "discard",
		synergyGroup: "entropy",
		effects: [
			{
				type: "block",
				value: 9,
				target: "self"
			},
			{
				type: "discardRandom",
				value: 1,
				target: "self"
			},
			{
				type: "energy",
				value: 1,
				target: "self"
			}
		]
	},
	debtCollection: {
		id: "debtCollection",
		name: "索偿",
		type: "skill",
		cost: 0,
		icon: "🩸",
		description: "自身受到 2 点伤害，抽 2 张牌并获得 1 点灵力",
		rarity: "uncommon",
		keywords: ["discard", "tempo"],
		comboTag: "discard",
		synergyGroup: "entropy",
		effects: [
			{
				type: "selfDamage",
				value: 2,
				target: "self"
			},
			{
				type: "draw",
				value: 2,
				target: "self"
			},
			{
				type: "energy",
				value: 1,
				target: "self"
			}
		]
	},
	recirculation: {
		id: "recirculation",
		name: "再循环",
		type: "skill",
		cost: 1,
		icon: "🔁",
		description: "重抽当前手牌（丢弃并抽取等量卡牌）",
		rarity: "uncommon",
		keywords: ["discard"],
		comboTag: "discard",
		synergyGroup: "entropy",
		effects: [{
			type: "mulligan",
			target: "self"
		}]
	},
	calculatedRuin: {
		id: "calculatedRuin",
		name: "筹算崩解",
		type: "attack",
		cost: 2,
		icon: "📉",
		description: "每张手牌造成 2 点伤害，随后随机弃 1 张牌",
		rarity: "uncommon",
		keywords: ["discard", "burst"],
		comboTag: "discard",
		synergyGroup: "entropy",
		effects: [{
			type: "damagePerCard",
			value: 2,
			target: "enemy"
		}, {
			type: "discardRandom",
			value: 1,
			target: "self"
		}]
	},
	oblivionSpiral: {
		id: "oblivionSpiral",
		name: "湮旋",
		type: "skill",
		cost: 2,
		icon: "🌀",
		description: "丢弃所有手牌，抽 1+弃牌数 张牌，并对全体造成 7 点伤害",
		rarity: "rare",
		keywords: ["discard", "aoe"],
		comboTag: "discard",
		synergyGroup: "entropy",
		effects: [
			{
				type: "discardHand",
				target: "self"
			},
			{
				type: "drawCalculated",
				base: 1,
				perDiscard: 1,
				target: "self"
			},
			{
				type: "damageAll",
				value: 7,
				target: "allEnemies"
			}
		]
	},
	finalConvergence: {
		id: "finalConvergence",
		name: "终局收束",
		type: "attack",
		cost: 3,
		icon: "🕳️",
		description: "消耗所有灵力，每点灵力造成 7 点伤害，然后随机弃 1 张牌",
		rarity: "rare",
		keywords: ["discard", "burst"],
		comboTag: "discard",
		synergyGroup: "entropy",
		effects: [{
			type: "consumeAllEnergy",
			damagePerEnergy: 7,
			target: "enemy"
		}, {
			type: "discardRandom",
			value: 1,
			target: "self"
		}]
	},
	lightningProbe: {
		id: "lightningProbe",
		name: "雷策试探",
		type: "attack",
		cost: 1,
		icon: "⚡",
		description: "造成 5 点伤害，并施加 1 层易伤",
		rarity: "common",
		keywords: ["storm", "vulnerable"],
		comboTag: "storm",
		synergyGroup: "stormcraft",
		effects: [{
			type: "damage",
			value: 5,
			target: "enemy"
		}, {
			type: "debuff",
			buffType: "vulnerable",
			value: 1,
			target: "enemy"
		}]
	},
	chainArc: {
		id: "chainArc",
		name: "链弧斩",
		type: "attack",
		cost: 1,
		icon: "🔗",
		description: "造成 4 点伤害，并施加 2 层破绽",
		rarity: "common",
		keywords: ["storm", "mark"],
		comboTag: "storm",
		synergyGroup: "stormcraft",
		effects: [{
			type: "damage",
			value: 4,
			target: "enemy"
		}, {
			type: "applyMark",
			value: 2,
			target: "enemy"
		}]
	},
	stormDraft: {
		id: "stormDraft",
		name: "雷图推演",
		type: "skill",
		cost: 0,
		icon: "🗺️",
		description: "抽 1 张牌，并施加 1 层易伤",
		rarity: "common",
		keywords: ["storm", "tempo"],
		comboTag: "storm",
		synergyGroup: "stormcraft",
		effects: [{
			type: "draw",
			value: 1,
			target: "self"
		}, {
			type: "debuff",
			buffType: "vulnerable",
			value: 1,
			target: "enemy"
		}]
	},
	ionReserve: {
		id: "ionReserve",
		name: "离子蓄势",
		type: "skill",
		cost: 1,
		icon: "🔋",
		description: "获得 1 点灵力，并施加 1 层破绽",
		rarity: "common",
		keywords: ["storm", "mark"],
		comboTag: "storm",
		synergyGroup: "stormcraft",
		effects: [{
			type: "energy",
			value: 1,
			target: "self"
		}, {
			type: "applyMark",
			value: 1,
			target: "enemy"
		}]
	},
	surgeStep: {
		id: "surgeStep",
		name: "疾电步",
		type: "skill",
		cost: 1,
		icon: "🌀",
		description: "获得 6 点护盾，并抽 1 张牌",
		rarity: "common",
		keywords: ["storm", "guard"],
		comboTag: "storm",
		synergyGroup: "stormcraft",
		effects: [{
			type: "block",
			value: 6,
			target: "self"
		}, {
			type: "draw",
			value: 1,
			target: "self"
		}]
	},
	forkedNeedle: {
		id: "forkedNeedle",
		name: "分岔雷针",
		type: "attack",
		cost: 1,
		icon: "🪡",
		description: "连续造成 3 点伤害 2 次",
		rarity: "common",
		keywords: ["storm", "chain"],
		comboTag: "storm",
		synergyGroup: "stormcraft",
		effects: [{
			type: "damage",
			value: 3,
			target: "enemy"
		}, {
			type: "damage",
			value: 3,
			target: "enemy"
		}]
	},
	pressureSpark: {
		id: "pressureSpark",
		name: "压电火花",
		type: "attack",
		cost: 0,
		icon: "✨",
		description: "造成 4 点伤害；若目标有破绽，额外造成 4 点伤害",
		rarity: "common",
		keywords: ["storm", "mark"],
		comboTag: "storm",
		synergyGroup: "stormcraft",
		effects: [{
			type: "damage",
			value: 4,
			target: "enemy"
		}, {
			type: "conditionalDamage",
			value: 4,
			condition: "marked",
			target: "enemy"
		}]
	},
	thunderLattice: {
		id: "thunderLattice",
		name: "雷网矩阵",
		type: "skill",
		cost: 1,
		icon: "🕸️",
		description: "施加 4 层破绽并抽 1 张牌",
		rarity: "uncommon",
		keywords: ["storm", "mark"],
		comboTag: "storm",
		synergyGroup: "stormcraft",
		effects: [{
			type: "applyMark",
			value: 4,
			target: "enemy"
		}, {
			type: "draw",
			value: 1,
			target: "self"
		}]
	},
	exposedCircuit: {
		id: "exposedCircuit",
		name: "裸露回路",
		type: "attack",
		cost: 1,
		icon: "🧨",
		description: "造成 8 点伤害；若目标有破绽，额外造成 5 点伤害",
		rarity: "uncommon",
		keywords: [
			"storm",
			"mark",
			"burst"
		],
		comboTag: "storm",
		synergyGroup: "stormcraft",
		effects: [{
			type: "damage",
			value: 8,
			target: "enemy"
		}, {
			type: "conditionalDamage",
			value: 5,
			condition: "marked",
			target: "enemy"
		}]
	},
	flashRelay: {
		id: "flashRelay",
		name: "闪继回路",
		type: "skill",
		cost: 1,
		icon: "📡",
		description: "抽 2 张牌，并施加 1 层易伤",
		rarity: "uncommon",
		keywords: ["storm", "tempo"],
		comboTag: "storm",
		synergyGroup: "stormcraft",
		effects: [{
			type: "draw",
			value: 2,
			target: "self"
		}, {
			type: "debuff",
			buffType: "vulnerable",
			value: 1,
			target: "enemy"
		}]
	},
	stormWard: {
		id: "stormWard",
		name: "雷障",
		type: "defense",
		cost: 1,
		icon: "🛡️",
		description: "获得 8 点护盾，并施加 1 层虚弱",
		rarity: "uncommon",
		keywords: ["storm", "guard"],
		comboTag: "storm",
		synergyGroup: "stormcraft",
		effects: [{
			type: "block",
			value: 8,
			target: "self"
		}, {
			type: "debuff",
			buffType: "weak",
			value: 1,
			target: "enemy"
		}]
	},
	cascadeVolt: {
		id: "cascadeVolt",
		name: "级联伏特",
		type: "attack",
		cost: 2,
		icon: "⚙️",
		description: "对全体造成 6 点伤害并抽 1 张牌",
		rarity: "uncommon",
		keywords: ["storm", "aoe"],
		comboTag: "storm",
		synergyGroup: "stormcraft",
		effects: [{
			type: "damageAll",
			value: 6,
			target: "allEnemies"
		}, {
			type: "draw",
			value: 1,
			target: "self"
		}]
	},
	skybreakerArray: {
		id: "skybreakerArray",
		name: "裂穹雷列",
		type: "attack",
		cost: 2,
		icon: "🌩️",
		description: "造成 10 点伤害并施加 3 层破绽",
		rarity: "rare",
		keywords: [
			"storm",
			"mark",
			"burst"
		],
		comboTag: "storm",
		synergyGroup: "stormcraft",
		effects: [{
			type: "damage",
			value: 10,
			target: "enemy"
		}, {
			type: "applyMark",
			value: 3,
			target: "enemy"
		}]
	},
	resonanceTempest: {
		id: "resonanceTempest",
		name: "共振风暴",
		type: "power",
		cost: 2,
		icon: "🌪️",
		description: "获得 1 点力量，抽 1 张牌并对全体造成 4 点伤害",
		rarity: "rare",
		keywords: ["storm", "aoe"],
		comboTag: "storm",
		synergyGroup: "stormcraft",
		effects: [
			{
				type: "buff",
				buffType: "strength",
				value: 1,
				target: "self"
			},
			{
				type: "draw",
				value: 1,
				target: "self"
			},
			{
				type: "damageAll",
				value: 4,
				target: "allEnemies"
			}
		]
	},
	executionThunder: {
		id: "executionThunder",
		name: "断庭雷裁",
		type: "attack",
		cost: 3,
		icon: "⚖️",
		description: "若目标生命低于 40%，造成 14 点斩杀伤害",
		rarity: "rare",
		keywords: ["storm", "execute"],
		comboTag: "storm",
		synergyGroup: "stormcraft",
		effects: [{
			type: "executeDamage",
			value: 14,
			threshold: .4,
			target: "enemy"
		}]
	},
	mendThread: {
		id: "mendThread",
		name: "续命丝",
		type: "skill",
		cost: 1,
		icon: "🧵",
		description: "恢复 5 点生命，并获得 4 点护盾",
		rarity: "common",
		keywords: ["vital", "heal"],
		comboTag: "vital",
		synergyGroup: "vitalweave",
		effects: [{
			type: "heal",
			value: 5,
			target: "self"
		}, {
			type: "block",
			value: 4,
			target: "self"
		}]
	},
	pulseBandage: {
		id: "pulseBandage",
		name: "脉冲绷带",
		type: "skill",
		cost: 0,
		icon: "🩹",
		description: "恢复 3 点生命，并施加 1 层破绽",
		rarity: "common",
		keywords: [
			"vital",
			"heal",
			"mark"
		],
		comboTag: "vital",
		synergyGroup: "vitalweave",
		effects: [{
			type: "heal",
			value: 3,
			target: "self"
		}, {
			type: "applyMark",
			value: 1,
			target: "enemy"
		}]
	},
	transfuseStrike: {
		id: "transfuseStrike",
		name: "输生斩",
		type: "attack",
		cost: 1,
		icon: "🩸",
		description: "失去 2 点生命，造成 8 点伤害并恢复 2 点生命",
		rarity: "common",
		keywords: [
			"vital",
			"heal",
			"bleed"
		],
		comboTag: "vital",
		synergyGroup: "vitalweave",
		effects: [
			{
				type: "selfDamage",
				value: 2,
				target: "self"
			},
			{
				type: "damage",
				value: 8,
				target: "enemy"
			},
			{
				type: "heal",
				value: 2,
				target: "self"
			}
		]
	},
	wardingHerb: {
		id: "wardingHerb",
		name: "护脉草",
		type: "defense",
		cost: 1,
		icon: "🌿",
		description: "获得 7 点护盾并恢复 2 点生命",
		rarity: "common",
		keywords: ["vital", "guard"],
		comboTag: "vital",
		synergyGroup: "vitalweave",
		effects: [{
			type: "block",
			value: 7,
			target: "self"
		}, {
			type: "heal",
			value: 2,
			target: "self"
		}]
	},
	renewalChord: {
		id: "renewalChord",
		name: "回生律",
		type: "skill",
		cost: 1,
		icon: "🎵",
		description: "恢复 4 点生命并抽 1 张牌",
		rarity: "common",
		keywords: [
			"vital",
			"heal",
			"tempo"
		],
		comboTag: "vital",
		synergyGroup: "vitalweave",
		effects: [{
			type: "heal",
			value: 4,
			target: "self"
		}, {
			type: "draw",
			value: 1,
			target: "self"
		}]
	},
	bloodBloom: {
		id: "bloodBloom",
		name: "血华",
		type: "attack",
		cost: 1,
		icon: "🌺",
		description: "失去 3 点生命，造成 9 点伤害",
		rarity: "common",
		keywords: ["vital", "bleed"],
		comboTag: "vital",
		synergyGroup: "vitalweave",
		effects: [{
			type: "selfDamage",
			value: 3,
			target: "self"
		}, {
			type: "damage",
			value: 9,
			target: "enemy"
		}]
	},
	mercyNeedle: {
		id: "mercyNeedle",
		name: "慈脉针",
		type: "attack",
		cost: 0,
		icon: "🪡",
		description: "造成 4 点伤害并恢复 2 点生命",
		rarity: "common",
		keywords: ["vital", "heal"],
		comboTag: "vital",
		synergyGroup: "vitalweave",
		effects: [{
			type: "damage",
			value: 4,
			target: "enemy"
		}, {
			type: "heal",
			value: 2,
			target: "self"
		}]
	},
	lifelinkWeave: {
		id: "lifelinkWeave",
		name: "生链织构",
		type: "skill",
		cost: 1,
		icon: "🧶",
		description: "恢复 6 点生命，并获得下回合 4 点护盾",
		rarity: "uncommon",
		keywords: [
			"vital",
			"heal",
			"guard"
		],
		comboTag: "vital",
		synergyGroup: "vitalweave",
		effects: [{
			type: "heal",
			value: 6,
			target: "self"
		}, {
			type: "buff",
			buffType: "nextTurnBlock",
			value: 4,
			target: "self"
		}]
	},
	hospiceEdict: {
		id: "hospiceEdict",
		name: "护生敕令",
		type: "skill",
		cost: 1,
		icon: "📜",
		description: "恢复 5 点生命，并施加 2 层虚弱",
		rarity: "uncommon",
		keywords: [
			"vital",
			"heal",
			"control"
		],
		comboTag: "vital",
		synergyGroup: "vitalweave",
		effects: [{
			type: "heal",
			value: 5,
			target: "self"
		}, {
			type: "debuff",
			buffType: "weak",
			value: 2,
			target: "enemy"
		}]
	},
	rebirthSpiral: {
		id: "rebirthSpiral",
		name: "回生螺旋",
		type: "attack",
		cost: 2,
		icon: "🌀",
		description: "造成 7 点伤害并恢复 7 点生命",
		rarity: "uncommon",
		keywords: [
			"vital",
			"heal",
			"burst"
		],
		comboTag: "vital",
		synergyGroup: "vitalweave",
		effects: [{
			type: "damage",
			value: 7,
			target: "enemy"
		}, {
			type: "heal",
			value: 7,
			target: "self"
		}]
	},
	thornedRemedy: {
		id: "thornedRemedy",
		name: "刺脉疗法",
		type: "attack",
		cost: 1,
		icon: "🌵",
		description: "恢复 4 点生命，并对全体造成 4 点伤害",
		rarity: "uncommon",
		keywords: [
			"vital",
			"heal",
			"aoe"
		],
		comboTag: "vital",
		synergyGroup: "vitalweave",
		effects: [{
			type: "heal",
			value: 4,
			target: "self"
		}, {
			type: "damageAll",
			value: 4,
			target: "allEnemies"
		}]
	},
	vitalPivot: {
		id: "vitalPivot",
		name: "生息转枢",
		type: "skill",
		cost: 1,
		icon: "🔄",
		description: "恢复 3 点生命，获得 1 点灵力并施加 2 层破绽",
		rarity: "uncommon",
		keywords: [
			"vital",
			"heal",
			"mark"
		],
		comboTag: "vital",
		synergyGroup: "vitalweave",
		effects: [
			{
				type: "heal",
				value: 3,
				target: "self"
			},
			{
				type: "energy",
				value: 1,
				target: "self"
			},
			{
				type: "applyMark",
				value: 2,
				target: "enemy"
			}
		]
	},
	soulSuture: {
		id: "soulSuture",
		name: "魂缝",
		type: "power",
		cost: 2,
		icon: "🪢",
		description: "恢复 8 点生命，获得 1 层护盾留存并抽 1 张牌",
		rarity: "rare",
		keywords: [
			"vital",
			"heal",
			"retain"
		],
		comboTag: "vital",
		synergyGroup: "vitalweave",
		effects: [
			{
				type: "heal",
				value: 8,
				target: "self"
			},
			{
				type: "buff",
				buffType: "retainBlock",
				value: 1,
				target: "self"
			},
			{
				type: "draw",
				value: 1,
				target: "self"
			}
		]
	},
	reversalPulse: {
		id: "reversalPulse",
		name: "逆脉冲",
		type: "attack",
		cost: 2,
		icon: "💢",
		description: "失去 4 点生命，造成 12 点伤害并恢复 6 点生命",
		rarity: "rare",
		keywords: [
			"vital",
			"heal",
			"burst"
		],
		comboTag: "vital",
		synergyGroup: "vitalweave",
		effects: [
			{
				type: "selfDamage",
				value: 4,
				target: "self"
			},
			{
				type: "damage",
				value: 12,
				target: "enemy"
			},
			{
				type: "heal",
				value: 6,
				target: "self"
			}
		]
	},
	phoenixReprieve: {
		id: "phoenixReprieve",
		name: "回生凤返",
		type: "skill",
		cost: 3,
		icon: "🕊️",
		description: "恢复 15 点生命，并对全体造成 10 点伤害",
		rarity: "rare",
		keywords: [
			"vital",
			"heal",
			"aoe"
		],
		comboTag: "vital",
		synergyGroup: "vitalweave",
		effects: [{
			type: "heal",
			value: 15,
			target: "self"
		}, {
			type: "damageAll",
			value: 10,
			target: "allEnemies"
		}]
	},
	ironBreath: {
		id: "ironBreath",
		name: "铁息守律",
		type: "defense",
		cost: 1,
		icon: "🛡️",
		description: "获得 9 点护盾并净化 1 层负面效果",
		rarity: "common",
		keywords: ["guard", "cleanse"],
		comboTag: "guard",
		synergyGroup: "bulwark",
		effects: [{
			type: "block",
			value: 9,
			target: "self"
		}, {
			type: "cleanse",
			value: 1,
			target: "self"
		}]
	},
	mirrorWall: {
		id: "mirrorWall",
		name: "镜壁折锋",
		type: "skill",
		cost: 1,
		icon: "🪞",
		description: "获得 6 点护盾并获得 1 层护盾留存",
		rarity: "common",
		keywords: [
			"guard",
			"retain",
			"mirror",
			"delay"
		],
		comboTag: "guard",
		synergyGroup: "bulwark",
		effects: [{
			type: "block",
			value: 6,
			target: "self"
		}, {
			type: "buff",
			buffType: "retainBlock",
			value: 1,
			target: "self"
		}]
	},
	reboundingShell: {
		id: "reboundingShell",
		name: "回壳击",
		type: "attack",
		cost: 1,
		icon: "🐢",
		description: "造成 5 点伤害并获得 6 点护盾",
		rarity: "common",
		keywords: ["guard", "tempo"],
		comboTag: "guard",
		synergyGroup: "bulwark",
		effects: [{
			type: "damage",
			value: 5,
			target: "enemy"
		}, {
			type: "block",
			value: 6,
			target: "self"
		}]
	},
	bastionStudy: {
		id: "bastionStudy",
		name: "垒势演算",
		type: "skill",
		cost: 0,
		icon: "📐",
		description: "抽 1 张牌并获得 4 点护盾",
		rarity: "common",
		keywords: ["guard", "tempo"],
		comboTag: "guard",
		synergyGroup: "bulwark",
		effects: [{
			type: "draw",
			value: 1,
			target: "self"
		}, {
			type: "block",
			value: 4,
			target: "self"
		}]
	},
	wardingSweep: {
		id: "wardingSweep",
		name: "镇界横扫",
		type: "attack",
		cost: 1,
		icon: "🧱",
		description: "对全体造成 4 点伤害并获得 4 点护盾",
		rarity: "common",
		keywords: ["guard", "aoe"],
		comboTag: "guard",
		synergyGroup: "bulwark",
		effects: [{
			type: "damageAll",
			value: 4,
			target: "allEnemies"
		}, {
			type: "block",
			value: 4,
			target: "self"
		}]
	},
	resolveAnchor: {
		id: "resolveAnchor",
		name: "定心锚",
		type: "skill",
		cost: 1,
		icon: "⚓",
		description: "下回合开始时获得 7 点护盾并抽 1 张牌",
		rarity: "uncommon",
		keywords: ["guard", "setup"],
		comboTag: "guard",
		synergyGroup: "bulwark",
		effects: [{
			type: "buff",
			buffType: "nextTurnBlock",
			value: 7,
			target: "self"
		}, {
			type: "draw",
			value: 1,
			target: "self"
		}]
	},
	guardianMantra: {
		id: "guardianMantra",
		name: "守愿咒",
		type: "defense",
		cost: 1,
		icon: "📿",
		description: "获得 10 点护盾并获得 1 层护盾留存",
		rarity: "uncommon",
		keywords: ["guard", "retain"],
		comboTag: "guard",
		synergyGroup: "bulwark",
		effects: [{
			type: "block",
			value: 10,
			target: "self"
		}, {
			type: "buff",
			buffType: "retainBlock",
			value: 1,
			target: "self"
		}]
	},
	shieldTax: {
		id: "shieldTax",
		name: "护势征敛",
		type: "skill",
		cost: 1,
		icon: "🧾",
		description: "获得等于已损失生命 30% 的护盾并抽 1 张牌",
		rarity: "uncommon",
		keywords: ["guard", "recover"],
		comboTag: "guard",
		synergyGroup: "bulwark",
		effects: [{
			type: "blockFromLostHp",
			percent: .3,
			target: "self"
		}, {
			type: "draw",
			value: 1,
			target: "self"
		}]
	},
	bastionCrash: {
		id: "bastionCrash",
		name: "垒势崩落",
		type: "attack",
		cost: 1,
		icon: "💥",
		description: "消耗至多 12 点护盾，每点护盾造成 1 点伤害，并抽 1 张牌",
		rarity: "uncommon",
		keywords: ["guard", "burst"],
		comboTag: "guard",
		synergyGroup: "bulwark",
		effects: [{
			type: "blockBurst",
			ratio: 1,
			maxConsume: 12,
			minDamage: 4,
			target: "enemy"
		}, {
			type: "draw",
			value: 1,
			target: "self"
		}]
	},
	counterEdict: {
		id: "counterEdict",
		name: "反制敕令",
		type: "attack",
		cost: 2,
		icon: "📜",
		description: "移除敌人所有护盾并造成 8 点伤害",
		rarity: "uncommon",
		keywords: ["guard", "counter"],
		comboTag: "guard",
		synergyGroup: "bulwark",
		effects: [{
			type: "removeBlock",
			target: "enemy"
		}, {
			type: "damage",
			value: 8,
			target: "enemy"
		}]
	},
	citadelOath: {
		id: "citadelOath",
		name: "天阙誓垒",
		type: "power",
		cost: 2,
		icon: "🏯",
		description: "获得 8 点护盾、2 点荆棘与 2 层护盾留存",
		rarity: "rare",
		keywords: ["guard", "retain"],
		comboTag: "guard",
		synergyGroup: "bulwark",
		effects: [
			{
				type: "block",
				value: 8,
				target: "self"
			},
			{
				type: "buff",
				buffType: "thorns",
				value: 2,
				target: "self"
			},
			{
				type: "buff",
				buffType: "retainBlock",
				value: 2,
				target: "self"
			}
		]
	},
	fortressEdict: {
		id: "fortressEdict",
		name: "镇垒断罪",
		type: "attack",
		cost: 2,
		icon: "⚖️",
		description: "消耗全部护盾，每点护盾造成 1.3 点伤害，并施加 2 层虚弱",
		rarity: "rare",
		keywords: ["guard", "burst"],
		comboTag: "guard",
		synergyGroup: "bulwark",
		effects: [{
			type: "blockBurst",
			ratio: 1.3,
			minDamage: 8,
			target: "enemy"
		}, {
			type: "debuff",
			buffType: "weak",
			value: 2,
			target: "enemy"
		}]
	},
	aegisJudgement: {
		id: "aegisJudgement",
		name: "玄甲裁断",
		type: "attack",
		cost: 2,
		icon: "⚔️",
		description: "造成 10 点伤害并获得 8 点护盾",
		rarity: "rare",
		keywords: ["guard", "burst"],
		comboTag: "guard",
		synergyGroup: "bulwark",
		effects: [{
			type: "damage",
			value: 10,
			target: "enemy"
		}, {
			type: "block",
			value: 8,
			target: "self"
		}]
	},
	healingTouch: {
		id: "healingTouch",
		name: "治愈之触",
		type: "skill",
		cost: 1,
		icon: "💚",
		description: "回复 6 点生命，移除 1 个负面效果",
		rarity: "uncommon",
		effects: [{
			type: "heal",
			value: 6,
			target: "self"
		}, {
			type: "cleanse",
			value: 1,
			target: "self"
		}]
	},
	bloodBlessing: {
		id: "bloodBlessing",
		name: "鲜血祝福",
		type: "power",
		cost: 2,
		icon: "🩸",
		description: "消耗 5 点生命，获得 2 点力量",
		rarity: "rare",
		effects: [{
			type: "selfDamage",
			value: 5,
			target: "self"
		}, {
			type: "buff",
			buffType: "strength",
			value: 2,
			target: "self"
		}]
	},
	poisonThorn: {
		id: "poisonThorn",
		name: "毒刺",
		type: "attack",
		cost: 1,
		icon: "🌵",
		description: "造成 4 点伤害，施加 2 层中毒",
		rarity: "common",
		effects: [{
			type: "damage",
			value: 4,
			target: "enemy"
		}, {
			type: "debuff",
			buffType: "poison",
			value: 2,
			target: "enemy"
		}],
		element: "wood"
	},
	natureGrowth: {
		id: "natureGrowth",
		name: "自然生长",
		type: "power",
		cost: 1,
		icon: "🌱",
		description: "每回合结束时，获得 3 点护盾",
		rarity: "uncommon",
		effects: [{
			type: "buff",
			buffType: "regenBlock",
			value: 3,
			target: "self"
		}]
	},
	thunderLaw: {
		id: "thunderLaw",
		name: "雷法残章",
		type: "law",
		cost: 2,
		icon: "⚡",
		description: "造成 8 点伤害，使敌人下回合受到的伤害+3",
		rarity: "rare",
		lawType: "thunder",
		effects: [{
			type: "damage",
			value: 8,
			target: "enemy"
		}, {
			type: "debuff",
			buffType: "vulnerable",
			value: 3,
			target: "enemy"
		}]
	},
	swordIntent: {
		id: "swordIntent",
		name: "剑意碎片",
		type: "law",
		cost: 1,
		icon: "🗡️",
		description: "造成 7 点穿透伤害（无视护盾）",
		rarity: "rare",
		lawType: "sword",
		element: "metal",
		effects: [{
			type: "penetrate",
			value: 7,
			target: "enemy"
		}]
	},
	flameTruth: {
		id: "flameTruth",
		name: "火焰真意",
		type: "law",
		cost: 2,
		icon: "🔥",
		description: "造成 6 点伤害，使敌人获得 3 层灼烧",
		rarity: "rare",
		lawType: "fire",
		element: "fire",
		effects: [{
			type: "damage",
			value: 6,
			target: "enemy"
		}, {
			type: "debuff",
			buffType: "burn",
			value: 3,
			target: "enemy"
		}]
	},
	spaceRift: {
		id: "spaceRift",
		name: "空间裂隙",
		type: "law",
		cost: 1,
		icon: "🌀",
		description: "获得 50% 闪避率（持续1回合）",
		rarity: "rare",
		lawType: "space",
		effects: [{
			type: "buff",
			buffType: "dodgeChance",
			value: .5,
			target: "self",
			duration: 1
		}]
	},
	timeStop: {
		id: "timeStop",
		name: "时间静止",
		type: "law",
		cost: 3,
		icon: "⏱️",
		description: "敌人跳过下一回合",
		rarity: "legendary",
		lawType: "time",
		effects: [{
			type: "debuff",
			buffType: "stun",
			value: 1,
			target: "enemy"
		}]
	},
	voidEmbrace: {
		id: "voidEmbrace",
		name: "虚空拥抱",
		type: "law",
		cost: 2,
		icon: "🕳️",
		description: "造成敌人已损失生命值10%的伤害",
		rarity: "legendary",
		lawType: "void",
		effects: [{
			type: "execute",
			value: .1,
			target: "enemy"
		}]
	},
	luckyStrike: {
		id: "luckyStrike",
		name: "天降机缘",
		type: "chance",
		cost: 1,
		icon: "🌟",
		description: "随机造成 5-15 点伤害",
		rarity: "uncommon",
		effects: [{
			type: "randomDamage",
			minValue: 5,
			maxValue: 15,
			target: "enemy"
		}]
	},
	fortuneWheel: {
		id: "fortuneWheel",
		name: "命运之轮",
		type: "chance",
		cost: 1,
		consumeCandy: true,
		icon: "🎰",
		description: "消耗1奶糖。随机获得 1-3 张临时卡牌",
		rarity: "rare",
		effects: [{
			type: "randomCards",
			minValue: 1,
			maxValue: 3,
			target: "self"
		}]
	},
	miracleHeal: {
		id: "miracleHeal",
		name: "奇迹治愈",
		type: "chance",
		cost: 2,
		icon: "💖",
		description: "回复 15 点生命",
		rarity: "rare",
		effects: [{
			type: "heal",
			value: 15,
			target: "self"
		}]
	},
	defianceStrike: {
		id: "defianceStrike",
		name: "逆命一击",
		type: "attack",
		character: "linFeng",
		cost: 1,
		icon: "🗡️",
		description: "造成 8 点伤害。若生命值低于50%，伤害翻倍",
		rarity: "common",
		effects: [{
			type: "damage",
			value: 8,
			target: "enemy"
		}, {
			type: "conditionalDamage",
			condition: "lowHp",
			threshold: .5,
			multiplier: 2,
			target: "enemy"
		}]
	},
	fusionBlast: {
		id: "fusionBlast",
		name: "融合爆发",
		type: "skill",
		character: "linFeng",
		cost: 1,
		icon: "🌌",
		description: "消耗所有手牌，抽取消耗数量+1张牌",
		rarity: "uncommon",
		effects: [{
			type: "discardHand",
			target: "self"
		}, {
			type: "drawCalculated",
			base: 1,
			perDiscard: 1,
			target: "self"
		}]
	},
	lawbreaker: {
		id: "lawbreaker",
		name: "破法者",
		type: "power",
		character: "linFeng",
		cost: 2,
		icon: "🛡️",
		description: "每打出一张攻击牌，获得 2 点护盾",
		rarity: "rare",
		effects: [{
			type: "buff",
			buffType: "blockOnAttack",
			value: 2,
			target: "self"
		}]
	},
	bloodSeal: {
		id: "bloodSeal",
		name: "血之封印",
		type: "skill",
		character: "xiangYe",
		cost: 1,
		icon: "🩸",
		description: "流失 5 点生命，获得 20 点护盾",
		rarity: "common",
		effects: [{
			type: "selfDamage",
			value: 5,
			target: "self"
		}, {
			type: "block",
			value: 20,
			target: "self"
		}]
	},
	vitalityBloom: {
		id: "vitalityBloom",
		name: "生命绽放",
		type: "power",
		character: "xiangYe",
		cost: 2,
		icon: "🌸",
		description: "回合开始时，回复 3 点生命",
		rarity: "uncommon",
		effects: [{
			type: "buff",
			buffType: "regen",
			value: 3,
			target: "self"
		}]
	},
	unchain: {
		id: "unchain",
		name: "解脱",
		type: "attack",
		character: "xiangYe",
		cost: 2,
		icon: "🔗",
		description: "造成 15 点伤害。若仍有封印槽位，额外造成 10 点伤害",
		rarity: "common",
		effects: [{
			type: "damage",
			value: 15,
			target: "enemy"
		}, {
			type: "conditionalDamage",
			condition: "sealed",
			bonusDamage: 10,
			target: "enemy"
		}]
	},
	karmaStrike: {
		id: "karmaStrike",
		name: "业力击",
		type: "attack",
		character: "wuYu",
		cost: 1,
		icon: "🕉️",
		description: "造成 6 点伤害。增加 5 点业力",
		rarity: "common",
		effects: [{
			type: "damage",
			value: 6,
			target: "enemy"
		}, {
			type: "gainSin",
			value: 5,
			target: "self"
		}]
	},
	goldenBellSkill: {
		id: "goldenBellSkill",
		name: "金钟罩",
		type: "skill",
		character: "wuYu",
		cost: 1,
		icon: "🔔",
		description: "获得 12 点护盾。增加 5 点功德",
		rarity: "common",
		effects: [{
			type: "block",
			value: 12,
			target: "self"
		}, {
			type: "gainMerit",
			value: 5,
			target: "self"
		}]
	},
	asceticism: {
		id: "asceticism",
		name: "苦行",
		type: "power",
		character: "wuYu",
		cost: 1,
		icon: "🙏",
		description: "回合结束时若有保留手牌，获得保留数x2点功德",
		rarity: "uncommon",
		effects: [{
			type: "buff",
			buffType: "meritOnRetain",
			value: 2,
			target: "self"
		}]
	},
	probe: {
		id: "probe",
		name: "试探",
		type: "attack",
		character: "yanHan",
		cost: 0,
		consumeCandy: true,
		icon: "🔍",
		description: "消耗1奶糖。造成 4 点伤害。抽 1 张牌",
		rarity: "common",
		effects: [{
			type: "damage",
			value: 4,
			target: "enemy"
		}, {
			type: "draw",
			value: 1,
			target: "self"
		}]
	},
	analyzeWeakness: {
		id: "analyzeWeakness",
		name: "弱点分析",
		type: "skill",
		character: "yanHan",
		cost: 1,
		icon: "📊",
		description: "给予所有敌人 2 层易伤",
		rarity: "uncommon",
		effects: [{
			type: "debuff",
			buffType: "vulnerable",
			value: 2,
			target: "allEnemies"
		}]
	},
	tacticalAdvantage: {
		id: "tacticalAdvantage",
		name: "战术优势",
		type: "power",
		character: "yanHan",
		cost: 2,
		icon: "📈",
		description: "攻击带有易伤的敌人时，回复 1 点灵力(每回合限2次)",
		rarity: "rare",
		effects: [{
			type: "buff",
			buffType: "energyOnVulnerable",
			value: 1,
			limit: 2,
			target: "self"
		}]
	},
	sweepingStrike: {
		id: "sweepingStrike",
		name: "横扫千军",
		type: "attack",
		cost: 2,
		icon: "🌪️",
		description: "对所有敌人造成 8 点伤害",
		rarity: "uncommon",
		effects: [{
			type: "damageAll",
			value: 8,
			target: "allEnemies"
		}]
	},
	armorBreaker: {
		id: "armorBreaker",
		name: "破甲一击",
		type: "attack",
		cost: 1,
		icon: "🔨",
		description: "造成 5 点伤害，移除敌人护盾",
		rarity: "common",
		effects: [{
			type: "removeBlock",
			target: "enemy"
		}, {
			type: "damage",
			value: 5,
			target: "enemy"
		}]
	},
	tripleSlash: {
		id: "tripleSlash",
		name: "致命连击",
		type: "attack",
		cost: 1,
		icon: "⚡",
		description: "造成 3 点伤害三次",
		rarity: "uncommon",
		effects: [
			{
				type: "damage",
				value: 3,
				target: "enemy"
			},
			{
				type: "damage",
				value: 3,
				target: "enemy"
			},
			{
				type: "damage",
				value: 3,
				target: "enemy"
			}
		]
	},
	earthShatter: {
		id: "earthShatter",
		name: "天崩地裂",
		type: "attack",
		cost: 3,
		icon: "🌋",
		description: "造成 25 点伤害，自身受 5 点伤害（生命≤5不可用）",
		rarity: "rare",
		condition: {
			type: "hp",
			min: 6
		},
		effects: [{
			type: "damage",
			value: 25,
			target: "enemy"
		}, {
			type: "selfDamage",
			value: 5,
			target: "self"
		}]
	},
	swordBreaker: {
		id: "swordBreaker",
		name: "一剑破万法",
		type: "attack",
		cost: 2,
		icon: "✨",
		description: "造成 15 点穿透伤害",
		rarity: "rare",
		effects: [{
			type: "penetrate",
			value: 15,
			target: "enemy"
		}]
	},
	bloodSlash: {
		id: "bloodSlash",
		name: "血刃斩",
		type: "attack",
		cost: 1,
		icon: "🩸",
		description: "造成 8 点伤害，回复造成伤害的30%生命",
		rarity: "uncommon",
		effects: [{
			type: "lifeSteal",
			value: .3,
			target: "self"
		}, {
			type: "damage",
			value: 8,
			target: "enemy"
		}]
	},
	finishingBlow: {
		id: "finishingBlow",
		name: "终结一击",
		type: "attack",
		cost: 2,
		icon: "💀",
		description: "造成 10 点伤害，对生命低于30%的敌人造成双倍",
		rarity: "rare",
		effects: [{
			type: "executeDamage",
			value: 10,
			threshold: .3,
			target: "enemy"
		}]
	},
	goldenBell: {
		id: "goldenBell",
		name: "金钟罩",
		type: "defense",
		cost: 2,
		icon: "🔔",
		description: "获得 15 点护盾",
		rarity: "common",
		effects: [{
			type: "block",
			value: 15,
			target: "self"
		}]
	},
	offenseDefense: {
		id: "offenseDefense",
		name: "以攻代守",
		type: "defense",
		cost: 1,
		icon: "⚔️",
		description: "获得等于你力量值x3的护盾（最少5）",
		rarity: "uncommon",
		effects: [{
			type: "blockFromStrength",
			multiplier: 3,
			minimum: 5,
			target: "self"
		}]
	},
	halfDamage: {
		id: "halfDamage",
		name: "天地同寿",
		type: "defense",
		cost: 2,
		icon: "☯️",
		description: "本回合受到的伤害减少30%（升级后50%）",
		rarity: "rare",
		effects: [{
			type: "buff",
			buffType: "damageReduction",
			value: 30,
			target: "self"
		}]
	},
	turtleShell: {
		id: "turtleShell",
		name: "乌龟壳",
		type: "defense",
		cost: 0,
		consumeCandy: true,
		icon: "🐢",
		description: "消耗1奶糖。获得 3 点护盾，抽 1 张牌",
		rarity: "common",
		effects: [{
			type: "block",
			value: 3,
			target: "self"
		}, {
			type: "draw",
			value: 1,
			target: "self"
		}]
	},
	ironSkin: {
		id: "ironSkin",
		name: "铁布衫",
		type: "defense",
		cost: 1,
		icon: "🦾",
		description: "获得 6 点护盾，下回合开始时再获得 4 点",
		rarity: "uncommon",
		effects: [{
			type: "block",
			value: 6,
			target: "self"
		}, {
			type: "buff",
			buffType: "nextTurnBlock",
			value: 4,
			target: "self"
		}]
	},
	thunderStorm: {
		id: "thunderStorm",
		name: "劫雷轰顶",
		type: "law",
		cost: 2,
		icon: "🌩️",
		description: "造成 10 点伤害，使敌人获得 2 层麻痹",
		rarity: "rare",
		lawType: "thunder",
		effects: [{
			type: "damage",
			value: 10,
			target: "enemy"
		}, {
			type: "debuff",
			buffType: "paralysis",
			value: 2,
			target: "enemy"
		}]
	},
	inferno: {
		id: "inferno",
		name: "业火焚天",
		type: "law",
		cost: 3,
		icon: "🔥",
		description: "造成 8 点伤害3次，每次+1灼烧",
		rarity: "epic",
		lawType: "fire",
		element: "fire",
		effects: [
			{
				type: "damage",
				value: 8,
				target: "enemy"
			},
			{
				type: "debuff",
				buffType: "burn",
				value: 1,
				target: "enemy"
			},
			{
				type: "damage",
				value: 8,
				target: "enemy"
			},
			{
				type: "debuff",
				buffType: "burn",
				value: 1,
				target: "enemy"
			},
			{
				type: "damage",
				value: 8,
				target: "enemy"
			},
			{
				type: "debuff",
				buffType: "burn",
				value: 1,
				target: "enemy"
			}
		],
		descriptionTemplate: "造成 {e0} 点伤害3次，每次+{e1}灼烧"
	},
	voidWalk: {
		id: "voidWalk",
		name: "穿梭虚空",
		type: "law",
		cost: 1,
		icon: "🌀",
		description: "获得 1 层闪避",
		rarity: "rare",
		lawType: "space",
		effects: [{
			type: "buff",
			buffType: "dodge",
			value: 1,
			target: "self"
		}]
	},
	timeRewind: {
		id: "timeRewind",
		name: "时光倒流",
		type: "law",
		cost: 4,
		icon: "⏪",
		description: "将轮回洗回识海",
		rarity: "epic",
		lawType: "time",
		effects: [{
			type: "reshuffleDiscard",
			target: "self"
		}]
	},
	karmaKill: {
		id: "karmaKill",
		name: "因果律杀",
		type: "law",
		cost: 3,
		icon: "☠️",
		description: "必定命中，造成敌人最大生命15%的伤害",
		rarity: "legendary",
		lawType: "karma",
		effects: [{
			type: "percentDamage",
			value: .15,
			target: "enemy"
		}]
	},
	iceFreeze: {
		id: "iceFreeze",
		name: "冰封万里",
		type: "law",
		cost: 2,
		icon: "❄️",
		description: "造成 7 点伤害，使敌人下回合伤害-3",
		rarity: "rare",
		lawType: "ice",
		effects: [{
			type: "damage",
			value: 7,
			target: "enemy"
		}, {
			type: "debuff",
			buffType: "weak",
			value: 3,
			target: "enemy"
		}]
	},
	desperateSurvival: {
		id: "desperateSurvival",
		name: "绝处逢生",
		type: "chance",
		cost: 1,
		icon: "🆘",
		description: "若生命低于20%，抽3张牌+3灵力",
		rarity: "rare",
		effects: [{
			type: "conditionalDraw",
			condition: "lowHp",
			threshold: .2,
			drawValue: 3,
			energyValue: 3
		}]
	},
	windfall: {
		id: "windfall",
		name: "天降横财",
		type: "chance",
		cost: 1,
		icon: "💰",
		description: "战斗结束后获得 25-100 灵石",
		rarity: "uncommon",
		effects: [{
			type: "bonusGold",
			min: 25,
			max: 100
		}]
	},
	enlightenment: {
		id: "enlightenment",
		name: "顿悟",
		type: "chance",
		cost: 2,
		icon: "💡",
		description: "命环经验+50",
		rarity: "rare",
		effects: [{
			type: "ringExp",
			value: 50
		}]
	},
	reversal: {
		id: "reversal",
		name: "逆转乾坤",
		type: "chance",
		cost: 4,
		icon: "🔄",
		description: "与敌人交换当前生命值百分比",
		rarity: "legendary",
		effects: [{
			type: "swapHpPercent",
			target: "enemy"
		}]
	},
	concentration: {
		id: "concentration",
		name: "聚气",
		type: "energy",
		cost: 1,
		icon: "🎯",
		description: "下一张攻击牌伤害+5",
		rarity: "common",
		effects: [{
			type: "buff",
			buffType: "nextAttackBonus",
			value: 5,
			target: "self"
		}]
	},
	doubleEdge: {
		id: "doubleEdge",
		name: "双刃",
		type: "attack",
		cost: 1,
		icon: "🔪",
		description: "造成 10 点伤害，获得 1 层易伤",
		rarity: "common",
		effects: [{
			type: "damage",
			value: 10,
			target: "enemy"
		}, {
			type: "debuff",
			buffType: "vulnerable",
			value: 1,
			target: "self"
		}]
	},
	powerUp: {
		id: "powerUp",
		name: "蓄力",
		type: "energy",
		cost: 1,
		icon: "💪",
		description: "获得 2 点力量（永久）",
		rarity: "uncommon",
		effects: [{
			type: "buff",
			buffType: "strength",
			value: 2,
			target: "self",
			permanent: true
		}]
	},
	allIn: {
		id: "allIn",
		name: "破釜沉舟",
		type: "attack",
		cost: 1,
		icon: "🎲",
		description: "消耗所有灵力，每点灵力造成 6 点伤害",
		rarity: "rare",
		effects: [{
			type: "consumeAllEnergy",
			damagePerEnergy: 6,
			target: "enemy"
		}]
	},
	chaosControl: {
		id: "chaosControl",
		name: "混沌支配",
		type: "law",
		cost: 2,
		icon: "🌀",
		description: "造成 5 点伤害，使敌人眩晕1回合",
		rarity: "legendary",
		lawType: "chaos",
		effects: [{
			type: "damage",
			value: 5,
			target: "enemy"
		}, {
			type: "debuff",
			buffType: "stun",
			value: 1,
			target: "enemy"
		}]
	},
	defiantWill: {
		id: "defiantWill",
		name: "逆天意志",
		type: "attack",
		cost: 1,
		icon: "💫",
		description: "造成 8 点伤害，若命环≥2级，再造成 8 点伤害",
		rarity: "uncommon",
		character: "linFeng",
		effects: [{
			type: "damage",
			value: 8,
			target: "enemy"
		}, {
			type: "conditionalDamage",
			condition: "fateRingLevel",
			minLevel: 2,
			bonusDamage: 8,
			target: "enemy"
		}]
	},
	ringResonance: {
		id: "ringResonance",
		name: "命环共振",
		type: "attack",
		cost: 2,
		icon: "🔮",
		description: "根据装载法则数量+4伤害，抽1张牌",
		rarity: "rare",
		character: "linFeng",
		effects: [{
			type: "damagePerLaw",
			baseDamage: 4,
			damagePerLaw: 4,
			target: "enemy"
		}, {
			type: "draw",
			value: 1,
			target: "self"
		}]
	},
	breakthrough: {
		id: "breakthrough",
		name: "突破极限",
		type: "attack",
		cost: 3,
		icon: "⚡",
		description: "造成 25 点伤害，命环经验+30",
		rarity: "rare",
		character: "linFeng",
		effects: [{
			type: "damage",
			value: 25,
			target: "enemy"
		}, {
			type: "ringExp",
			value: 30
		}]
	},
	healingTouch: {
		id: "healingTouch",
		name: "治愈之触",
		type: "skill",
		cost: 1,
		icon: "💚",
		description: "回复 8 点生命，净化 1 层负面效果",
		rarity: "uncommon",
		character: "xiangYe",
		effects: [{
			type: "heal",
			value: 8,
			target: "self"
		}, {
			type: "cleanse",
			value: 1,
			target: "self"
		}]
	},
	bloodBlessing: {
		id: "bloodBlessing",
		name: "血之祝福",
		type: "skill",
		cost: 2,
		icon: "🩸",
		description: "回复 15 点生命，使敌人虚弱 2 回合",
		rarity: "rare",
		character: "xiangYe",
		effects: [{
			type: "heal",
			value: 15,
			target: "self"
		}, {
			type: "debuff",
			buffType: "weak",
			value: 2,
			target: "enemy"
		}]
	},
	lifeSurge: {
		id: "lifeSurge",
		name: "生命涌动",
		type: "defense",
		cost: 1,
		icon: "💖",
		description: "获得等于已损失生命50%的护盾",
		rarity: "rare",
		character: "xiangYe",
		effects: [{
			type: "blockFromLostHp",
			percent: .5,
			target: "self"
		}]
	},
	vajraGlare: {
		id: "vajraGlare",
		name: "金刚怒目",
		type: "attack",
		cost: 1,
		icon: "😡",
		description: "造成 5 点伤害，获得 3 点荆棘持续 2 回合",
		rarity: "uncommon",
		character: "wuYu",
		effects: [{
			type: "damage",
			value: 5,
			target: "enemy"
		}, {
			type: "buff",
			buffType: "thorns",
			value: 3,
			target: "self",
			duration: 2
		}]
	},
	zenMeditation: {
		id: "zenMeditation",
		name: "禅定",
		type: "defense",
		cost: 2,
		icon: "🧘",
		description: "获得 15 点护盾，下次被攻击时反弹等量伤害",
		rarity: "rare",
		character: "wuYu",
		effects: [{
			type: "block",
			value: 15,
			target: "self"
		}, {
			type: "buff",
			buffType: "reflect",
			value: 1,
			target: "self"
		}]
	},
	salvation: {
		id: "salvation",
		name: "普渡众生",
		type: "law",
		cost: 3,
		icon: "☸️",
		description: "对所有敌人造成 12 点伤害并眩晕 1 回合",
		rarity: "epic",
		character: "wuYu",
		effects: [{
			type: "damageAll",
			value: 12,
			target: "allEnemies"
		}, {
			type: "debuffAll",
			buffType: "stun",
			value: 1,
			target: "allEnemies"
		}]
	},
	ringAnalysis: {
		id: "ringAnalysis",
		name: "命环解析",
		type: "skill",
		cost: 1,
		icon: "📊",
		description: "敌人易伤 2 层，命环经验+15",
		rarity: "uncommon",
		character: "yanHan",
		effects: [{
			type: "debuff",
			buffType: "vulnerable",
			value: 2,
			target: "enemy"
		}, {
			type: "ringExp",
			value: 15
		}]
	},
	lawInsight: {
		id: "lawInsight",
		name: "法则窥探",
		type: "skill",
		cost: 2,
		icon: "👁️",
		description: "抽 2 张牌，本战法则盗取率+10%",
		rarity: "rare",
		character: "yanHan",
		effects: [{
			type: "draw",
			value: 2,
			target: "self"
		}, {
			type: "buff",
			buffType: "stealBonus",
			value: .1,
			target: "self"
		}]
	},
	timeStasis: {
		id: "timeStasis",
		name: "时间凝滞",
		type: "law",
		cost: 3,
		icon: "⏳",
		description: "敌人下次攻击伤害-50%，你额外行动1次",
		rarity: "epic",
		character: "yanHan",
		effects: [{
			type: "debuff",
			buffType: "damageReduction",
			value: 50,
			target: "enemy"
		}, {
			type: "buff",
			buffType: "extraTurn",
			value: 1,
			target: "self"
		}]
	},
	starNeedle: {
		id: "starNeedle",
		name: "星痕针",
		type: "attack",
		character: "moChen",
		cost: 1,
		icon: "🌠",
		description: "造成 7 点伤害，并施加 2 层破绽。",
		rarity: "common",
		effects: [{
			type: "damage",
			value: 7,
			target: "enemy"
		}, {
			type: "applyMark",
			value: 2,
			target: "enemy"
		}]
	},
	omenBarrier: {
		id: "omenBarrier",
		name: "星兆护幕",
		type: "defense",
		character: "moChen",
		cost: 1,
		icon: "🛡️",
		description: "获得 9 点护盾，抽 1 张牌。",
		rarity: "uncommon",
		effects: [{
			type: "block",
			value: 9,
			target: "self"
		}, {
			type: "draw",
			value: 1,
			target: "self"
		}]
	},
	ringCatalyst: {
		id: "ringCatalyst",
		name: "命环催化",
		type: "skill",
		character: "moChen",
		cost: 1,
		icon: "🔭",
		description: "命环经验 +20，并获得 1 点力量。",
		rarity: "rare",
		effects: [{
			type: "ringExp",
			value: 20
		}, {
			type: "buff",
			buffType: "strength",
			value: 1,
			target: "self"
		}]
	},
	artifactBolt: {
		id: "artifactBolt",
		name: "灵器矢",
		type: "attack",
		character: "ningXuan",
		cost: 1,
		icon: "🪬",
		description: "造成 6 点伤害，获得 3 点护盾。",
		rarity: "common",
		keywords: ["guard"],
		comboTag: "guard",
		synergyGroup: "bulwark",
		effects: [{
			type: "damage",
			value: 6,
			target: "enemy"
		}, {
			type: "block",
			value: 3,
			target: "self"
		}]
	},
	echoWard: {
		id: "echoWard",
		name: "回响障壁",
		type: "defense",
		character: "ningXuan",
		cost: 1,
		icon: "🧱",
		description: "获得 10 点护盾并抽 1 张牌。",
		rarity: "uncommon",
		keywords: [
			"guard",
			"echo",
			"mirror"
		],
		comboTag: "guard",
		synergyGroup: "bulwark",
		effects: [{
			type: "block",
			value: 10,
			target: "self"
		}, {
			type: "draw",
			value: 1,
			target: "self"
		}]
	},
	ringInfusion: {
		id: "ringInfusion",
		name: "命环灌注",
		type: "skill",
		character: "ningXuan",
		cost: 1,
		icon: "⚗️",
		description: "命环经验 +16，获得 1 点灵力。",
		rarity: "rare",
		effects: [{
			type: "ringExp",
			value: 16
		}, {
			type: "energy",
			value: 1,
			target: "self"
		}]
	},
	mirrorTrace: {
		id: "mirrorTrace",
		name: "镜迹演算",
		type: "skill",
		cost: 1,
		icon: "🪞",
		description: "获得 6 点护盾并抽 1 张牌。",
		rarity: "common",
		keywords: [
			"mirror",
			"echo",
			"tempo"
		],
		comboTag: "echo",
		synergyGroup: "mirrorweave",
		effects: [{
			type: "block",
			value: 6,
			target: "self"
		}, {
			type: "draw",
			value: 1,
			target: "self"
		}]
	},
	delayPrism: {
		id: "delayPrism",
		name: "滞光棱镜",
		type: "skill",
		cost: 1,
		icon: "🔷",
		description: "下回合开始时获得 7 点护盾并抽 1 张牌。",
		rarity: "common",
		keywords: [
			"mirror",
			"delay",
			"setup"
		],
		comboTag: "echo",
		synergyGroup: "mirrorweave",
		effects: [{
			type: "buff",
			buffType: "nextTurnBlock",
			value: 7,
			target: "self"
		}, {
			type: "draw",
			value: 1,
			target: "self"
		}]
	},
	reverberantEdge: {
		id: "reverberantEdge",
		name: "镜渊回锋",
		type: "attack",
		cost: 1,
		icon: "🗡️",
		description: "造成 7 点伤害，并以 60% 强度回响上一张已打出的牌。",
		rarity: "common",
		keywords: ["mirror", "echo"],
		comboTag: "echo",
		synergyGroup: "mirrorweave",
		effects: [{
			type: "damage",
			value: 7,
			target: "enemy"
		}, {
			type: "echoLastPlayedCard",
			value: .6,
			repeatCount: 1,
			target: "self"
		}]
	},
	mirroredRecital: {
		id: "mirroredRecital",
		name: "双镜咏诵",
		type: "skill",
		cost: 1,
		icon: "🎼",
		description: "抽 1 张牌，并以 65% 强度回响上一张已打出的牌。",
		rarity: "uncommon",
		keywords: [
			"mirror",
			"echo",
			"tempo"
		],
		comboTag: "echo",
		synergyGroup: "mirrorweave",
		effects: [{
			type: "draw",
			value: 1,
			target: "self"
		}, {
			type: "echoLastPlayedCard",
			value: .65,
			repeatCount: 1,
			target: "self"
		}]
	},
	echoVault: {
		id: "echoVault",
		name: "回响封存",
		type: "defense",
		cost: 1,
		icon: "🏛️",
		description: "获得 9 点护盾与 1 层护盾留存，并以 45% 强度回响上一张已打出的牌。",
		rarity: "uncommon",
		keywords: [
			"mirror",
			"echo",
			"delay",
			"guard"
		],
		comboTag: "echo",
		synergyGroup: "mirrorweave",
		effects: [
			{
				type: "block",
				value: 9,
				target: "self"
			},
			{
				type: "buff",
				buffType: "retainBlock",
				value: 1,
				target: "self"
			},
			{
				type: "echoLastPlayedCard",
				value: .45,
				repeatCount: 1,
				target: "self"
			}
		]
	},
	abyssalReflection: {
		id: "abyssalReflection",
		name: "渊镜复奏",
		type: "power",
		cost: 2,
		icon: "🌌",
		description: "抽 1 张牌，并以 70% 强度回响上一张已打出的牌 2 次。",
		rarity: "rare",
		keywords: [
			"mirror",
			"echo",
			"delay",
			"burst"
		],
		comboTag: "echo",
		synergyGroup: "mirrorweave",
		effects: [{
			type: "draw",
			value: 1,
			target: "self"
		}, {
			type: "echoLastPlayedCard",
			value: .7,
			repeatCount: 2,
			target: "self"
		}]
	},
	oathbrandCut: {
		id: "oathbrandCut",
		name: "誓印裁击",
		type: "attack",
		cost: 1,
		icon: "⚔️",
		description: "造成 8 点伤害并获得 1 层誓债。",
		rarity: "common",
		keywords: [
			"oath",
			"debt",
			"penance"
		],
		comboTag: "oath",
		synergyGroup: "oathbound",
		effects: [{
			type: "damage",
			value: 8,
			target: "enemy"
		}, {
			type: "buff",
			buffType: "oathDebt",
			value: 1,
			target: "self"
		}]
	},
	debtorVow: {
		id: "debtorVow",
		name: "负誓",
		type: "skill",
		cost: 0,
		icon: "📜",
		description: "自身受到 2 点伤害，抽 1 张牌并获得 1 层誓债。",
		rarity: "common",
		keywords: [
			"oath",
			"debt",
			"selfharm"
		],
		comboTag: "oath",
		synergyGroup: "oathbound",
		effects: [
			{
				type: "selfDamage",
				value: 2,
				target: "self"
			},
			{
				type: "draw",
				value: 1,
				target: "self"
			},
			{
				type: "buff",
				buffType: "oathDebt",
				value: 1,
				target: "self"
			}
		]
	},
	penanceWall: {
		id: "penanceWall",
		name: "偿罪壁",
		type: "defense",
		cost: 1,
		icon: "🛡️",
		description: "获得 9 点护盾并获得 1 层誓债。",
		rarity: "common",
		keywords: [
			"oath",
			"debt",
			"penance",
			"guard"
		],
		comboTag: "oath",
		synergyGroup: "oathbound",
		effects: [{
			type: "block",
			value: 9,
			target: "self"
		}, {
			type: "buff",
			buffType: "oathDebt",
			value: 1,
			target: "self"
		}]
	},
	debtTribunal: {
		id: "debtTribunal",
		name: "债契审决",
		type: "skill",
		cost: 1,
		icon: "⚖️",
		description: "清算全部誓债，每层造成 4 点伤害并抽 1 张牌。",
		rarity: "uncommon",
		keywords: [
			"oath",
			"debt",
			"penance"
		],
		comboTag: "oath",
		synergyGroup: "oathbound",
		effects: [{
			type: "consumeOathDebt",
			value: 4,
			target: "enemy"
		}, {
			type: "draw",
			value: 1,
			target: "self"
		}]
	},
	bloodOathLedger: {
		id: "bloodOathLedger",
		name: "血誓账簿",
		type: "power",
		cost: 1,
		icon: "🩸",
		description: "获得 2 层誓债、1 点灵力并抽 1 张牌。",
		rarity: "uncommon",
		keywords: [
			"oath",
			"debt",
			"tempo"
		],
		comboTag: "oath",
		synergyGroup: "oathbound",
		effects: [
			{
				type: "buff",
				buffType: "oathDebt",
				value: 2,
				target: "self"
			},
			{
				type: "energy",
				value: 1,
				target: "self"
			},
			{
				type: "draw",
				value: 1,
				target: "self"
			}
		]
	},
	sentenceOfPenance: {
		id: "sentenceOfPenance",
		name: "偿誓终判",
		type: "attack",
		cost: 2,
		icon: "⛓️",
		description: "造成 8 点伤害，并清算全部誓债，每层额外造成 6 点伤害。",
		rarity: "rare",
		keywords: [
			"oath",
			"debt",
			"penance",
			"burst"
		],
		comboTag: "oath",
		synergyGroup: "oathbound",
		effects: [{
			type: "damage",
			value: 8,
			target: "enemy"
		}, {
			type: "consumeOathDebt",
			value: 6,
			target: "enemy"
		}]
	},
	matrixGuardProtocol: {
		id: "matrixGuardProtocol",
		name: "命环矩阵·守式",
		type: "defense",
		cost: 1,
		icon: "🧩",
		description: "获得 11 点护盾，净化 1 层减益，并为命环共振注入守势信号。",
		rarity: "uncommon",
		keywords: [
			"guard",
			"cleanse",
			"matrix"
		],
		comboTag: "guard",
		synergyGroup: "bulwark",
		effects: [
			{
				type: "block",
				value: 11,
				target: "self"
			},
			{
				type: "cleanse",
				value: 1,
				target: "self"
			},
			{
				type: "buff",
				buffType: "matrixGuardSignal",
				value: 1,
				target: "self"
			}
		]
	},
	matrixShatterVector: {
		id: "matrixShatterVector",
		name: "命环矩阵·破式",
		type: "attack",
		cost: 1,
		icon: "🪓",
		description: "移除目标所有护盾并造成 10 点伤害，并为命环共振注入破阵信号。",
		rarity: "uncommon",
		keywords: [
			"penetrate",
			"burst",
			"matrix"
		],
		comboTag: "storm",
		synergyGroup: "stormcraft",
		effects: [
			{
				type: "removeBlock",
				target: "enemy"
			},
			{
				type: "damage",
				value: 10,
				target: "enemy"
			},
			{
				type: "buff",
				buffType: "matrixBreakSignal",
				value: 1,
				target: "self"
			}
		]
	},
	matrixPurgeLoop: {
		id: "matrixPurgeLoop",
		name: "命环矩阵·净式",
		type: "skill",
		cost: 1,
		icon: "🫧",
		description: "净化 2 层减益并抽 1 张牌，并为命环共振注入净域信号。",
		rarity: "rare",
		keywords: [
			"cleanse",
			"tempo",
			"matrix"
		],
		comboTag: "vital",
		synergyGroup: "vitalweave",
		effects: [
			{
				type: "cleanse",
				value: 2,
				target: "self"
			},
			{
				type: "draw",
				value: 1,
				target: "self"
			},
			{
				type: "buff",
				buffType: "matrixCleanseSignal",
				value: 1,
				target: "self"
			}
		]
	},
	quickDraw: {
		id: "quickDraw",
		name: "快抽",
		type: "energy",
		cost: 0,
		consumeCandy: true,
		icon: "⚡",
		description: "消耗1奶糖。抽 2 张牌",
		rarity: "common",
		effects: [{
			type: "draw",
			value: 2,
			target: "self"
		}]
	},
	poisonTouch: {
		id: "poisonTouch",
		name: "毒手",
		type: "skill",
		character: "xiangYe",
		cost: 1,
		icon: "☠️",
		description: "使敌人中毒 2 层",
		rarity: "common",
		effects: [{
			type: "debuff",
			buffType: "poison",
			value: 2,
			target: "enemy"
		}, {
			type: "damage",
			value: 3,
			target: "enemy"
		}]
	},
	minorHeal: {
		id: "minorHeal",
		name: "小回春术",
		type: "skill",
		character: "xiangYe",
		cost: 1,
		icon: "🌿",
		description: "回复 5 点生命",
		rarity: "common",
		effects: [{
			type: "heal",
			value: 5,
			target: "self"
		}]
	},
	monkStrike: {
		id: "monkStrike",
		name: "罗汉拳",
		type: "attack",
		character: "wuYu",
		cost: 1,
		icon: "👊",
		description: "造成 6 点伤害，获得 4 点护盾",
		rarity: "common",
		effects: [{
			type: "damage",
			value: 6,
			target: "enemy"
		}, {
			type: "block",
			value: 4,
			target: "self"
		}]
	},
	analysis: {
		id: "analysis",
		name: "弱点分析",
		type: "skill",
		character: "yanHan",
		cost: 0,
		consumeCandy: true,
		icon: "🧐",
		description: "消耗1奶糖。抽 1 张牌，使敌人获得 1 层易伤",
		rarity: "common",
		effects: [{
			type: "draw",
			value: 1,
			target: "self"
		}, {
			type: "debuff",
			buffType: "vulnerable",
			value: 1,
			target: "enemy"
		}]
	},
	demonDoubt: {
		id: "demonDoubt",
		name: "心魔·疑心",
		type: "status",
		cost: -1,
		icon: "❔",
		description: "无法打出。保留。占据抽牌位 (在手中时下回合少抽一张)。回合结束：受到 2 点伤害。",
		rarity: "special",
		unplayable: true,
		retain: true,
		occupiesDrawSlot: true,
		effects: [{
			type: "selfDamage",
			value: 2,
			trigger: "turnEnd"
		}]
	},
	demonFear: {
		id: "demonFear",
		name: "心魔·恐惧",
		type: "status",
		cost: -1,
		icon: "😱",
		description: "无法打出。保留。占据抽牌位 (在手中时下回合少抽一张)。回合结束：随机丢弃 1 张手牌。",
		rarity: "special",
		unplayable: true,
		retain: true,
		occupiesDrawSlot: true,
		effects: [{
			type: "discardRandom",
			value: 1,
			trigger: "turnEnd"
		}]
	},
	demonDespair: {
		id: "demonDespair",
		name: "心魔·绝望",
		type: "status",
		cost: -1,
		icon: "🌑",
		description: "无法打出。保留。占据抽牌位 (在手中时下回合少抽一张)。回合结束：失去 1 点灵力。",
		rarity: "special",
		unplayable: true,
		retain: true,
		occupiesDrawSlot: true,
		effects: [{
			type: "energyLoss",
			value: 1,
			trigger: "turnEnd"
		}]
	},
	cursedScar: {
		id: "cursedScar",
		name: "契咒灼痕",
		type: "status",
		cost: -1,
		icon: "🩸",
		description: "无法打出。保留。占据抽牌位。回合结束：受到 2 点伤害。",
		rarity: "special",
		unplayable: true,
		retain: true,
		occupiesDrawSlot: true,
		keywords: ["curse"],
		synergyGroup: "cursebound",
		effects: [{
			type: "selfDamage",
			value: 2,
			trigger: "turnEnd"
		}]
	},
	covenantDebt: {
		id: "covenantDebt",
		name: "契债回响",
		type: "status",
		cost: -1,
		icon: "📜",
		description: "无法打出。保留。占据抽牌位。回合结束：随机弃 1 张其他手牌。",
		rarity: "special",
		unplayable: true,
		retain: true,
		occupiesDrawSlot: true,
		keywords: ["curse"],
		synergyGroup: "cursebound",
		effects: [{
			type: "discardRandom",
			value: 1,
			trigger: "turnEnd"
		}]
	},
	emberServitor: {
		id: "emberServitor",
		name: "炽傀侍灵",
		type: "attack",
		cost: 0,
		icon: "🪆",
		description: "造成 4 点伤害并获得 2 点护盾。",
		rarity: "special",
		keywords: ["forge", "construct"],
		comboTag: "forge",
		synergyGroup: "soulforge",
		effects: [{
			type: "damage",
			value: 4,
			target: "enemy"
		}, {
			type: "block",
			value: 2,
			target: "self"
		}]
	},
	wardConstruct: {
		id: "wardConstruct",
		name: "护炉灵构",
		type: "defense",
		cost: 0,
		icon: "🛡️",
		description: "获得 6 点护盾。",
		rarity: "special",
		keywords: [
			"forge",
			"construct",
			"guard"
		],
		comboTag: "forge",
		synergyGroup: "soulforge",
		effects: [{
			type: "block",
			value: 6,
			target: "self"
		}]
	},
	forgeArray: {
		id: "forgeArray",
		name: "熔阵齐发",
		type: "attack",
		cost: 1,
		icon: "⚙️",
		description: "对全体造成 6 点伤害。",
		rarity: "special",
		keywords: [
			"forge",
			"array",
			"aoe"
		],
		comboTag: "forge",
		synergyGroup: "soulforge",
		effects: [{
			type: "damageAll",
			value: 6,
			target: "allEnemies"
		}]
	},
	oathscarCut: {
		id: "oathscarCut",
		name: "契痕斩",
		type: "attack",
		cost: 1,
		icon: "🗡️",
		description: "自身受到 2 点伤害，造成 9 点伤害。",
		rarity: "common",
		keywords: [
			"curse",
			"selfharm",
			"oath",
			"debt"
		],
		comboTag: "curse",
		synergyGroup: "cursebound",
		effects: [{
			type: "selfDamage",
			value: 2,
			target: "self"
		}, {
			type: "damage",
			value: 9,
			target: "enemy"
		}]
	},
	hexbrandSigil: {
		id: "hexbrandSigil",
		name: "烙契印",
		type: "skill",
		cost: 1,
		icon: "🪬",
		description: "抽 2 张牌，并向弃牌堆置入 1 张契咒灼痕。",
		rarity: "common",
		keywords: ["curse", "tempo"],
		comboTag: "curse",
		synergyGroup: "cursebound",
		effects: [{
			type: "draw",
			value: 2,
			target: "self"
		}, {
			type: "addStatus",
			cardId: "cursedScar",
			count: 1,
			zone: "discard"
		}]
	},
	blacktidePact: {
		id: "blacktidePact",
		name: "黑潮契约",
		type: "skill",
		cost: 0,
		icon: "🌑",
		description: "自身受到 3 点伤害，获得 1 点灵力并抽 1 张牌。",
		rarity: "common",
		keywords: [
			"curse",
			"selfharm",
			"tempo",
			"oath",
			"debt"
		],
		comboTag: "curse",
		synergyGroup: "cursebound",
		effects: [
			{
				type: "selfDamage",
				value: 3,
				target: "self"
			},
			{
				type: "energy",
				value: 1,
				target: "self"
			},
			{
				type: "draw",
				value: 1,
				target: "self"
			}
		]
	},
	covenantWard: {
		id: "covenantWard",
		name: "契护",
		type: "defense",
		cost: 1,
		icon: "🕯️",
		description: "获得 8 点护盾，并向弃牌堆置入 1 张契债回响。",
		rarity: "common",
		keywords: [
			"curse",
			"guard",
			"oath",
			"penance"
		],
		comboTag: "curse",
		synergyGroup: "cursebound",
		effects: [{
			type: "block",
			value: 8,
			target: "self"
		}, {
			type: "addStatus",
			cardId: "covenantDebt",
			count: 1,
			zone: "discard"
		}]
	},
	doomwhisperNeedle: {
		id: "doomwhisperNeedle",
		name: "祸语针",
		type: "attack",
		cost: 1,
		icon: "🪡",
		description: "造成 6 点伤害，施加 1 层虚弱，并向弃牌堆置入 1 张契咒灼痕。",
		rarity: "common",
		keywords: ["curse", "control"],
		comboTag: "curse",
		synergyGroup: "cursebound",
		effects: [
			{
				type: "damage",
				value: 6,
				target: "enemy"
			},
			{
				type: "debuff",
				buffType: "weak",
				value: 1,
				target: "enemy"
			},
			{
				type: "addStatus",
				cardId: "cursedScar",
				count: 1,
				zone: "discard"
			}
		]
	},
	scarredDivination: {
		id: "scarredDivination",
		name: "伤契占卜",
		type: "skill",
		cost: 1,
		icon: "🔮",
		description: "抽 1 张牌；若生命低于 60%，再抽 2 张牌并获得 1 点灵力。随后向弃牌堆置入 1 张契咒灼痕。",
		rarity: "common",
		keywords: [
			"curse",
			"tempo",
			"selfharm"
		],
		comboTag: "curse",
		synergyGroup: "cursebound",
		effects: [
			{
				type: "draw",
				value: 1,
				target: "self"
			},
			{
				type: "conditionalDraw",
				condition: "lowHp",
				threshold: .6,
				drawValue: 2,
				energyValue: 1,
				target: "self"
			},
			{
				type: "addStatus",
				cardId: "cursedScar",
				count: 1,
				zone: "discard"
			}
		]
	},
	bloodpriceMandate: {
		id: "bloodpriceMandate",
		name: "血价敕令",
		type: "power",
		cost: 1,
		icon: "📕",
		description: "自身受到 4 点伤害，获得 2 点力量。",
		rarity: "uncommon",
		keywords: [
			"curse",
			"selfharm",
			"burst",
			"oath",
			"debt"
		],
		comboTag: "curse",
		synergyGroup: "cursebound",
		effects: [{
			type: "selfDamage",
			value: 4,
			target: "self"
		}, {
			type: "buff",
			buffType: "strength",
			value: 2,
			target: "self"
		}]
	},
	griefLedger: {
		id: "griefLedger",
		name: "悲契账簿",
		type: "skill",
		cost: 1,
		icon: "📚",
		description: "抽 2 张牌，获得 1 点灵力，并向手牌置入 1 张契债回响。",
		rarity: "uncommon",
		keywords: [
			"curse",
			"tempo",
			"oath",
			"debt"
		],
		comboTag: "curse",
		synergyGroup: "cursebound",
		effects: [
			{
				type: "draw",
				value: 2,
				target: "self"
			},
			{
				type: "energy",
				value: 1,
				target: "self"
			},
			{
				type: "addStatus",
				cardId: "covenantDebt",
				count: 1,
				zone: "hand"
			}
		]
	},
	morbidAbsolution: {
		id: "morbidAbsolution",
		name: "厄赦",
		type: "attack",
		cost: 2,
		icon: "⚖️",
		description: "造成 8 点伤害；若生命低于 60%，额外造成 8 点伤害。",
		rarity: "uncommon",
		keywords: ["curse", "burst"],
		comboTag: "curse",
		synergyGroup: "cursebound",
		effects: [{
			type: "damage",
			value: 8,
			target: "enemy"
		}, {
			type: "conditionalDamage",
			value: 8,
			condition: "lowHp",
			threshold: .6,
			target: "enemy"
		}]
	},
	chainedVigil: {
		id: "chainedVigil",
		name: "缚夜戒备",
		type: "defense",
		cost: 1,
		icon: "⛓️",
		description: "获得 10 点护盾，并获得 1 层护盾留存。",
		rarity: "uncommon",
		keywords: [
			"curse",
			"guard",
			"retain",
			"oath",
			"penance"
		],
		comboTag: "curse",
		synergyGroup: "cursebound",
		effects: [{
			type: "block",
			value: 10,
			target: "self"
		}, {
			type: "buff",
			buffType: "retainBlock",
			value: 1,
			target: "self"
		}]
	},
	omenOfRuin: {
		id: "omenOfRuin",
		name: "殃兆",
		type: "attack",
		cost: 2,
		icon: "🌘",
		description: "自身受到 2 点伤害，对全体造成 6 点伤害。",
		rarity: "uncommon",
		keywords: [
			"curse",
			"aoe",
			"selfharm"
		],
		comboTag: "curse",
		synergyGroup: "cursebound",
		effects: [{
			type: "selfDamage",
			value: 2,
			target: "self"
		}, {
			type: "damageAll",
			value: 6,
			target: "allEnemies"
		}]
	},
	pactRite: {
		id: "pactRite",
		name: "契礼",
		type: "skill",
		cost: 1,
		icon: "🕯️",
		description: "抽 1 张牌，并向弃牌堆置入 2 张契咒灼痕。",
		rarity: "uncommon",
		keywords: ["curse", "setup"],
		comboTag: "curse",
		synergyGroup: "cursebound",
		effects: [{
			type: "draw",
			value: 1,
			target: "self"
		}, {
			type: "addStatus",
			cardId: "cursedScar",
			count: 2,
			zone: "discard"
		}]
	},
	sacramentOfAsh: {
		id: "sacramentOfAsh",
		name: "灰烬圣约",
		type: "power",
		cost: 2,
		icon: "🔥",
		description: "自身受到 4 点伤害，抽 1 张牌并获得 2 点力量。",
		rarity: "rare",
		keywords: [
			"curse",
			"selfharm",
			"burst"
		],
		comboTag: "curse",
		synergyGroup: "cursebound",
		effects: [
			{
				type: "selfDamage",
				value: 4,
				target: "self"
			},
			{
				type: "draw",
				value: 1,
				target: "self"
			},
			{
				type: "buff",
				buffType: "strength",
				value: 2,
				target: "self"
			}
		]
	},
	soulCollateral: {
		id: "soulCollateral",
		name: "魂押",
		type: "skill",
		cost: 2,
		icon: "🕳️",
		description: "抽 3 张牌，并向弃牌堆置入 2 张契债回响。",
		rarity: "rare",
		keywords: ["curse", "tempo"],
		comboTag: "curse",
		synergyGroup: "cursebound",
		effects: [{
			type: "draw",
			value: 3,
			target: "self"
		}, {
			type: "addStatus",
			cardId: "covenantDebt",
			count: 2,
			zone: "discard"
		}]
	},
	doomsentVerdict: {
		id: "doomsentVerdict",
		name: "终契裁决",
		type: "attack",
		cost: 3,
		icon: "☠️",
		description: "造成 14 点伤害；若生命低于 50%，额外造成 10 点伤害。随后向弃牌堆置入 1 张契咒灼痕。",
		rarity: "rare",
		keywords: [
			"curse",
			"burst",
			"execute"
		],
		comboTag: "curse",
		synergyGroup: "cursebound",
		effects: [
			{
				type: "damage",
				value: 14,
				target: "enemy"
			},
			{
				type: "conditionalDamage",
				value: 10,
				condition: "lowHp",
				threshold: .5,
				target: "enemy"
			},
			{
				type: "addStatus",
				cardId: "cursedScar",
				count: 1,
				zone: "discard"
			}
		]
	},
	emberPuppetScript: {
		id: "emberPuppetScript",
		name: "炽傀谱",
		type: "skill",
		cost: 1,
		icon: "📘",
		description: "向手牌生成 1 张炽傀侍灵，并抽 1 张牌。",
		rarity: "common",
		keywords: [
			"forge",
			"construct",
			"tempo"
		],
		comboTag: "forge",
		synergyGroup: "soulforge",
		effects: [{
			type: "createCard",
			cardId: "emberServitor",
			count: 1,
			zone: "hand",
			temporary: true
		}, {
			type: "draw",
			value: 1,
			target: "self"
		}]
	},
	spareSoulCore: {
		id: "spareSoulCore",
		name: "备用魂芯",
		type: "skill",
		cost: 0,
		icon: "💠",
		description: "向手牌生成 1 张护炉灵构。",
		rarity: "common",
		keywords: ["forge", "construct"],
		comboTag: "forge",
		synergyGroup: "soulforge",
		effects: [{
			type: "createCard",
			cardId: "wardConstruct",
			count: 1,
			zone: "hand",
			temporary: true
		}]
	},
	relayHarness: {
		id: "relayHarness",
		name: "中继束具",
		type: "defense",
		cost: 1,
		icon: "🪢",
		description: "获得 7 点护盾，并向弃牌堆生成 1 张炽傀侍灵。",
		rarity: "common",
		keywords: [
			"forge",
			"construct",
			"guard"
		],
		comboTag: "forge",
		synergyGroup: "soulforge",
		effects: [{
			type: "block",
			value: 7,
			target: "self"
		}, {
			type: "createCard",
			cardId: "emberServitor",
			count: 1,
			zone: "discard",
			temporary: true
		}]
	},
	forgeVolley: {
		id: "forgeVolley",
		name: "熔炉齐射",
		type: "attack",
		cost: 1,
		icon: "🔥",
		description: "造成 6 点伤害，并向弃牌堆生成 1 张护炉灵构。",
		rarity: "common",
		keywords: ["forge", "construct"],
		comboTag: "forge",
		synergyGroup: "soulforge",
		effects: [{
			type: "damage",
			value: 6,
			target: "enemy"
		}, {
			type: "createCard",
			cardId: "wardConstruct",
			count: 1,
			zone: "discard",
			temporary: true
		}]
	},
	matrixKiln: {
		id: "matrixKiln",
		name: "矩阵炉心",
		type: "skill",
		cost: 1,
		icon: "⚗️",
		description: "向手牌生成 1 张炽傀侍灵，并向弃牌堆生成 1 张护炉灵构。",
		rarity: "common",
		keywords: [
			"forge",
			"construct",
			"setup"
		],
		comboTag: "forge",
		synergyGroup: "soulforge",
		effects: [{
			type: "createCard",
			cardId: "emberServitor",
			count: 1,
			zone: "hand",
			temporary: true
		}, {
			type: "createCard",
			cardId: "wardConstruct",
			count: 1,
			zone: "discard",
			temporary: true
		}]
	},
	socketedAegis: {
		id: "socketedAegis",
		name: "嵌魂壁",
		type: "defense",
		cost: 1,
		icon: "🧱",
		description: "获得 6 点护盾，并获得 1 层护盾留存。",
		rarity: "common",
		keywords: [
			"forge",
			"guard",
			"retain"
		],
		comboTag: "forge",
		synergyGroup: "soulforge",
		effects: [{
			type: "block",
			value: 6,
			target: "self"
		}, {
			type: "buff",
			buffType: "retainBlock",
			value: 1,
			target: "self"
		}]
	},
	spiritAnvil: {
		id: "spiritAnvil",
		name: "灵锻砧",
		type: "power",
		cost: 1,
		icon: "🔨",
		description: "向手牌生成 1 张炽傀侍灵，并获得 1 点力量。",
		rarity: "uncommon",
		keywords: [
			"forge",
			"construct",
			"burst"
		],
		comboTag: "forge",
		synergyGroup: "soulforge",
		effects: [{
			type: "createCard",
			cardId: "emberServitor",
			count: 1,
			zone: "hand",
			temporary: true
		}, {
			type: "buff",
			buffType: "strength",
			value: 1,
			target: "self"
		}]
	},
	arrayOverclock: {
		id: "arrayOverclock",
		name: "阵列过载",
		type: "attack",
		cost: 1,
		icon: "⚡",
		description: "造成 7 点伤害，并向弃牌堆生成 1 张熔阵齐发。",
		rarity: "uncommon",
		keywords: [
			"forge",
			"array",
			"burst"
		],
		comboTag: "forge",
		synergyGroup: "soulforge",
		effects: [{
			type: "damage",
			value: 7,
			target: "enemy"
		}, {
			type: "createCard",
			cardId: "forgeArray",
			count: 1,
			zone: "discard",
			temporary: true
		}]
	},
	guardianGimbal: {
		id: "guardianGimbal",
		name: "守机云台",
		type: "defense",
		cost: 1,
		icon: "🛰️",
		description: "获得 10 点护盾，并向手牌生成 1 张护炉灵构。",
		rarity: "uncommon",
		keywords: [
			"forge",
			"construct",
			"guard"
		],
		comboTag: "forge",
		synergyGroup: "soulforge",
		effects: [{
			type: "block",
			value: 10,
			target: "self"
		}, {
			type: "createCard",
			cardId: "wardConstruct",
			count: 1,
			zone: "hand",
			temporary: true
		}]
	},
	soulcaseLattice: {
		id: "soulcaseLattice",
		name: "魂匣格架",
		type: "skill",
		cost: 1,
		icon: "🧰",
		description: "抽 2 张牌，并向手牌生成 1 张炽傀侍灵。",
		rarity: "uncommon",
		keywords: [
			"forge",
			"construct",
			"tempo"
		],
		comboTag: "forge",
		synergyGroup: "soulforge",
		effects: [{
			type: "draw",
			value: 2,
			target: "self"
		}, {
			type: "createCard",
			cardId: "emberServitor",
			count: 1,
			zone: "hand",
			temporary: true
		}]
	},
	effigyBarrage: {
		id: "effigyBarrage",
		name: "傀焰攒射",
		type: "attack",
		cost: 2,
		icon: "🎇",
		description: "对全体造成 4 点伤害，并向手牌生成 1 张炽傀侍灵。",
		rarity: "uncommon",
		keywords: [
			"forge",
			"construct",
			"aoe"
		],
		comboTag: "forge",
		synergyGroup: "soulforge",
		effects: [{
			type: "damageAll",
			value: 4,
			target: "allEnemies"
		}, {
			type: "createCard",
			cardId: "emberServitor",
			count: 1,
			zone: "hand",
			temporary: true
		}]
	},
	foundryBulwark: {
		id: "foundryBulwark",
		name: "炉心壁垒",
		type: "defense",
		cost: 1,
		icon: "🏗️",
		description: "获得 8 点护盾，抽 1 张牌，并向弃牌堆生成 1 张护炉灵构。",
		rarity: "uncommon",
		keywords: [
			"forge",
			"guard",
			"tempo"
		],
		comboTag: "forge",
		synergyGroup: "soulforge",
		effects: [
			{
				type: "block",
				value: 8,
				target: "self"
			},
			{
				type: "draw",
				value: 1,
				target: "self"
			},
			{
				type: "createCard",
				cardId: "wardConstruct",
				count: 1,
				zone: "discard",
				temporary: true
			}
		]
	},
	grandForgeMandate: {
		id: "grandForgeMandate",
		name: "大锻命令",
		type: "power",
		cost: 2,
		icon: "👑",
		description: "获得 6 点护盾，并向手牌各生成 1 张炽傀侍灵与护炉灵构。",
		rarity: "rare",
		keywords: [
			"forge",
			"construct",
			"guard"
		],
		comboTag: "forge",
		synergyGroup: "soulforge",
		effects: [
			{
				type: "block",
				value: 6,
				target: "self"
			},
			{
				type: "createCard",
				cardId: "emberServitor",
				count: 1,
				zone: "hand",
				temporary: true
			},
			{
				type: "createCard",
				cardId: "wardConstruct",
				count: 1,
				zone: "hand",
				temporary: true
			}
		]
	},
	ancestralMachina: {
		id: "ancestralMachina",
		name: "祖机开炉",
		type: "attack",
		cost: 2,
		icon: "🏭",
		description: "对全体造成 7 点伤害，并向手牌生成 1 张熔阵齐发。",
		rarity: "rare",
		keywords: [
			"forge",
			"array",
			"aoe"
		],
		comboTag: "forge",
		synergyGroup: "soulforge",
		effects: [{
			type: "damageAll",
			value: 7,
			target: "allEnemies"
		}, {
			type: "createCard",
			cardId: "forgeArray",
			count: 1,
			zone: "hand",
			temporary: true
		}]
	},
	throneOfCinders: {
		id: "throneOfCinders",
		name: "余烬王座",
		type: "power",
		cost: 3,
		icon: "🔥",
		description: "获得 1 点力量，并向手牌生成 2 张炽傀侍灵。",
		rarity: "rare",
		keywords: [
			"forge",
			"construct",
			"burst"
		],
		comboTag: "forge",
		synergyGroup: "soulforge",
		effects: [{
			type: "buff",
			buffType: "strength",
			value: 1,
			target: "self"
		}, {
			type: "createCard",
			cardId: "emberServitor",
			count: 2,
			zone: "hand",
			temporary: true
		}]
	}
};
//#endregion
//#region js/data/treasures.js
/**
* The Defier - 法宝数据
* 独立于法则的被动道具，提供多样化的构建思路
* 
* 法宝携带规则：
* - 最多同时携带4个法宝
* - 同品质法宝最多携带2个
* - 神话法宝最多携带1个
*/
var TREASURES = {
	metalEssence: {
		id: "metalEssence",
		name: "金精石",
		description: "金属性伤害+30%，免疫中毒（木属性负面）。",
		rarity: "rare",
		setTag: "wuxing",
		icon: "⚔️",
		elementBonus: {
			element: "metal",
			value: .3
		},
		immuneDebuffs: ["poison"]
	},
	woodSpiritRoot: {
		id: "woodSpiritRoot",
		name: "木灵根",
		description: "每回合回复2血，木属性伤害+30%。",
		rarity: "rare",
		setTag: "wuxing",
		icon: "🌿",
		elementBonus: {
			element: "wood",
			value: .3
		},
		onTurnStart: (player) => {
			player.heal(2);
		}
	},
	waterCrystal: {
		id: "waterCrystal",
		name: "水晶髓",
		description: "免疫灼烧，水属性伤害+30%。",
		rarity: "rare",
		setTag: "wuxing",
		icon: "💧",
		elementBonus: {
			element: "water",
			value: .3
		},
		immuneDebuffs: ["burn"]
	},
	firePhoenixFeather: {
		id: "firePhoenixFeather",
		name: "火凤羽",
		description: "免疫冰冻/减速，火属性伤害+30%。",
		rarity: "rare",
		setTag: "wuxing",
		icon: "🔥",
		elementBonus: {
			element: "fire",
			value: .3
		},
		immuneDebuffs: ["freeze", "slow"]
	},
	thickEarthShield: {
		id: "thickEarthShield",
		name: "厚土盾",
		description: "护盾效果+25%，土属性伤害+30%。",
		rarity: "rare",
		setTag: "wuxing",
		icon: "🛡️",
		elementBonus: {
			element: "earth",
			value: .3
		}
	},
	"vitality_stone": {
		id: "vitality_stone",
		name: "气血石",
		description: "战斗开始时，获得 5+(等级x2) 点护盾。",
		rarity: "common",
		setTag: "xuanjia",
		icon: "🪨",
		price: 50,
		callbacks: { onBattleStart: (player) => {
			const value = 5 + (player.fateRing ? player.fateRing.level : 0) * 2;
			player.addBlock(value);
			Utils.showBattleLog(`【气血石】提供了${value}点护盾`);
		} },
		getDesc: (player) => {
			const level = player ? player.fateRing ? player.fateRing.level : 0 : 0;
			return `战斗开始时，获得 ${5 + level * 2} (5 + ${level}x2) 点护盾。`;
		}
	},
	"sharp_whetstone": {
		id: "sharp_whetstone",
		name: "磨刀石",
		description: "战斗开始时，第一张攻击牌伤害 +3+(等级x1)。",
		rarity: "common",
		icon: "🔪",
		price: 50,
		callbacks: {
			onBattleStart: (player) => {
				const value = 3 + (player.fateRing ? player.fateRing.level : 0);
				player.addBuff("sharp_whetstone", value);
			},
			onCardPlay: (player, card, context) => {
				if (player.buffs["sharp_whetstone"] && card.type === "attack") {
					const bonus = player.buffs["sharp_whetstone"];
					context.damageModifier = (context.damageModifier || 0) + bonus;
					delete player.buffs["sharp_whetstone"];
					Utils.showBattleLog(`【磨刀石】增加了${bonus}点伤害`);
				}
			}
		},
		getDesc: (player) => {
			const level = player ? player.fateRing ? player.fateRing.level : 0 : 0;
			return `战斗开始时，第一张攻击牌伤害 +${3 + level} (3 + ${level})。`;
		}
	},
	"pressure_talisman": {
		id: "pressure_talisman",
		name: "威压符",
		description: "敌人召唤的随从生命值减半。战斗开始时获得5点护盾。",
		rarity: "common",
		icon: "📜",
		price: 60,
		counters: ["banditLeader", "stormSummoner"],
		callbacks: { onBattleStart: (player) => {
			player.addBuff("suppress_summon", .5);
			player.addBlock(5);
			Utils.showBattleLog("【威压符】威压四方！");
		} }
	},
	"soul_jade": {
		id: "soul_jade",
		name: "镇魂玉",
		description: "敌人回合结束时，降低其1层力量（最低为0）。",
		rarity: "common",
		icon: "🟢",
		price: 75,
		counters: ["demonWolf"],
		callbacks: { onEnemyTurnEnd: (player, enemies) => {
			if (enemies) enemies.forEach((enemy) => {
				if (enemy.isAlive() && enemy.buffs && enemy.buffs.strength > 0) {
					enemy.buffs.strength = Math.max(0, enemy.buffs.strength - 1);
					Utils.showBattleLog("【镇魂玉】削减敌人力量！");
				}
			});
		} }
	},
	"qi_gourd": {
		id: "qi_gourd",
		name: "养气葫芦",
		description: "每3回合回复5点生命。",
		rarity: "common",
		icon: "🍶",
		price: 65,
		data: { counter: 0 },
		callbacks: {
			onBattleStart: (player, treasure) => {
				treasure.data.counter = 0;
			},
			onTurnStart: (player, treasure) => {
				treasure.data.counter++;
				if (treasure.data.counter >= 3) {
					player.heal(5);
					treasure.data.counter = 0;
					Utils.showBattleLog("【养气葫芦】吐纳灵气，回复5点生命");
				}
			}
		}
	},
	"spirit_stone": {
		id: "spirit_stone",
		name: "聚灵石",
		description: "战斗开始时获得1点额外灵力。",
		rarity: "common",
		icon: "💠",
		price: 80,
		callbacks: { onBattleStart: (player) => {
			player.gainEnergy(1);
			Utils.showBattleLog("【聚灵石】灵力涌动！");
		} }
	},
	"blood_orb": {
		id: "blood_orb",
		name: "血煞珠",
		description: "生命值低于50%时，攻击伤害+25%。",
		rarity: "common",
		setTag: "liemai",
		icon: "🔴",
		price: 70,
		callbacks: { onBeforeDealDamage: (player, amount, context) => {
			if (player.currentHp < player.maxHp * .5) {
				const bonus = Math.floor(amount * .25);
				Utils.showBattleLog(`【血煞珠】低血激发，伤害+${bonus}`);
				return amount + bonus;
			}
			return amount;
		} }
	},
	"iron_talisman": {
		id: "iron_talisman",
		name: "铁壁符",
		description: "护盾获得量+15%。",
		rarity: "common",
		setTag: "xuanjia",
		icon: "🔶",
		price: 55,
		callbacks: { onGainBlock: (player, amount) => {
			return amount + Math.floor(amount * .15);
		} }
	},
	"soul_banner": {
		id: "soul_banner",
		name: "吸魂幡",
		description: "每击杀一个敌人，最大生命值+2。",
		rarity: "rare",
		setTag: "liemai",
		icon: "🏴",
		price: 150,
		callbacks: { onKill: (player, enemy) => {
			player.maxHp += 2;
			player.currentHp += 2;
			Utils.showBattleLog("【吸魂幡】吸收魂魄，最大生命+2");
		} }
	},
	"spirit_bead": {
		id: "spirit_bead",
		name: "聚灵珠",
		description: "每打出3张技能牌，回复1点灵力。",
		rarity: "rare",
		icon: "🔮",
		price: 150,
		data: { counter: 0 },
		callbacks: {
			onBattleStart: (player, treasure) => {
				treasure.data.counter = 0;
			},
			onCardPlay: (player, card, context, treasure) => {
				if (card.type === "skill") {
					treasure.data.counter++;
					if (treasure.data.counter >= 3) {
						player.gainEnergy(1);
						treasure.data.counter = 0;
						Utils.showBattleLog("【聚灵珠】灵力涌动，恢复1点灵力");
					}
				}
			}
		}
	},
	"ice_spirit_bead": {
		id: "ice_spirit_bead",
		name: "玄冰珠",
		description: "免疫\"灼烧\"负面效果。受到火焰伤害时回复3点生命。",
		rarity: "rare",
		icon: "❄️",
		price: 200,
		counters: [
			"danZun",
			"dualMagmaGuardians",
			"flameCultist"
		],
		callbacks: {
			onBattleStart: (player) => {
				player.addBuff("immunity_burn", 999);
				Utils.showBattleLog("【玄冰珠】散发寒气，隔绝灼热！");
			},
			onBeforeTakeDamage: (player, amount, context, treasure) => {
				if (context && context.damageType === "fire") {
					player.heal(3);
					Utils.showBattleLog("【玄冰珠】吸收火劲，回复3点生命！");
				}
				return amount;
			}
		}
	},
	"heart_mirror": {
		id: "heart_mirror",
		name: "护心镜",
		description: "受到的穿透伤害减少40%。",
		rarity: "rare",
		icon: "🪞",
		price: 180,
		counters: ["swordElder", "divineSwordsman"],
		callbacks: { onBeforeTakePenetrate: (player, amount) => {
			const reduced = Math.floor(amount * .4);
			Utils.showBattleLog(`【护心镜】抵御穿透，减免${reduced}点伤害`);
			return amount - reduced;
		} }
	},
	"seal_soul_bead": {
		id: "seal_soul_bead",
		name: "封魂珠",
		description: "敌人的治疗效果减少50%。",
		rarity: "rare",
		icon: "⚫",
		price: 200,
		counters: [
			"ancientSpirit",
			"voidDevourer",
			"abyssHulk"
		],
		callbacks: { onBattleStart: (player) => {
			player.addBuff("anti_heal", .5);
			Utils.showBattleLog("【封魂珠】封印魂力，削弱敌人恢复！");
		} }
	},
	"space_anchor": {
		id: "space_anchor",
		name: "空间锚",
		description: "免疫强制弃牌效果。手牌上限+1。",
		rarity: "rare",
		icon: "⚓",
		price: 220,
		counters: ["divineLord", "voidDevourer"],
		callbacks: { onBattleStart: (player) => {
			player.addBuff("immunity_discard", 999);
			player.maxHandSize = (player.maxHandSize || 10) + 1;
			Utils.showBattleLog("【空间锚】锚定时空，抵抗混乱！");
		} }
	},
	"wind_bead": {
		id: "wind_bead",
		name: "定风珠",
		description: "免疫风属性伤害。敌人召唤的风系随从生命值-50%。",
		rarity: "rare",
		icon: "🌀",
		price: 200,
		counters: ["stormSummoner", "galeSpirit"],
		callbacks: { onBattleStart: (player) => {
			player.addBuff("immunity_wind", 999);
			player.addBuff("wind_minion_weaken", .5);
			Utils.showBattleLog("【定风珠】定住狂风！");
		} }
	},
	"ward_jade": {
		id: "ward_jade",
		name: "辟邪玉佩",
		description: "免疫毒素效果。虚弱效果持续时间减半。",
		rarity: "rare",
		icon: "🟡",
		price: 180,
		counters: ["venomSnake"],
		callbacks: { onBattleStart: (player) => {
			player.addBuff("immunity_poison", 999);
			player.addBuff("weak_resist", .5);
			Utils.showBattleLog("【辟邪玉佩】辟邪镇煞！");
		} }
	},
	"diamond_amulet": {
		id: "diamond_amulet",
		name: "金刚护身符",
		description: "受到超过15点的单次伤害时，减免5点。",
		rarity: "rare",
		icon: "💎",
		price: 240,
		callbacks: { onBeforeTakeDamage: (player, amount, context) => {
			if (amount > 15) {
				Utils.showBattleLog("【金刚护身符】金刚不坏，减免5点伤害！");
				return amount - 5;
			}
			return amount;
		} }
	},
	"phoenix_feather": {
		id: "phoenix_feather",
		name: "朱雀羽",
		description: "你造成的灼烧伤害+50%。战斗开始时对所有敌人施加2层灼烧。",
		rarity: "rare",
		icon: "🐦",
		price: 200,
		callbacks: { onBattleStart: (player) => {
			player.addBuff("burn_amplify", .5);
			if (window.game && window.game.enemies) {
				window.game.enemies.forEach((e) => {
					if (e.isAlive && e.isAlive()) e.addDebuff("burn", 2);
				});
				Utils.showBattleLog("【朱雀羽】朱雀之焰燃遍敌阵！");
			}
		} }
	},
	"tortoise_shell": {
		id: "tortoise_shell",
		name: "玄武甲",
		description: "回合结束时，保留40%护盾（向上取整）。",
		rarity: "rare",
		setTag: "xuanjia",
		icon: "🐢",
		price: 230,
		callbacks: { onTurnEnd: (player) => {
			if (player.block > 0) {
				const retain = Math.ceil(player.block * .4);
				player.buffs.nextTurnBlock = (player.buffs.nextTurnBlock || 0) + retain;
				Utils.showBattleLog(`【玄武甲】保留${retain}点护盾`);
			}
		} }
	},
	"flying_dagger": {
		id: "flying_dagger",
		name: "斩仙飞刀",
		description: "战斗开始时，对所有敌人造成 10+(等级x5) 点穿透伤害。",
		rarity: "legendary",
		icon: "🗡️",
		price: 300,
		callbacks: { onBattleStart: (player) => {
			if (window.game && window.game.enemies) {
				const dmg = 10 + (player.fateRing ? player.fateRing.level : 0) * 5;
				window.game.enemies.forEach((enemy) => {
					if (enemy.isAlive && enemy.isAlive() || enemy.currentHp > 0) enemy.takeDamage(dmg, { ignoreBlock: true });
				});
				Utils.showBattleLog(`【斩仙飞刀】造成${dmg}点穿透伤害！`);
			}
		} },
		getDesc: (player) => {
			const level = player ? player.fateRing ? player.fateRing.level : 0 : 0;
			return `战斗开始时，对所有敌人造成 ${10 + level * 5} (10 + ${level}x5) 点穿透伤害。`;
		}
	},
	"yin_yang_mirror": {
		id: "yin_yang_mirror",
		name: "阴阳镜",
		description: "受到伤害时，有20%几率将伤害转化为治疗。",
		rarity: "legendary",
		icon: "☯️",
		price: 300,
		callbacks: { onBeforeTakeDamage: (player, amount, context) => {
			if (Math.random() < .2) {
				player.heal(amount);
				Utils.showBattleLog(`【阴阳镜】逆转阴阳，将${amount}点伤害转化为治疗！`);
				return 0;
			}
			return amount;
		} }
	},
	"void_mirror": {
		id: "void_mirror",
		name: "虚空镜",
		description: "你的攻击无视敌人20%护盾。免疫\"反伤\"效果。",
		rarity: "legendary",
		icon: "🪞",
		price: 350,
		counters: ["triheadGoldDragon", "goldenGuard"],
		callbacks: { onBattleStart: (player) => {
			player.addBuff("pierce_block", .2);
			player.addBuff("immunity_reflect", 999);
			Utils.showBattleLog("【虚空镜】映照虚实，无视防御与反伤！");
		} }
	},
	"soul_severing_blade": {
		id: "soul_severing_blade",
		name: "断魂刃",
		description: "攻击施加\"重伤\"（受疗减半）。处于\"禁疗\"时，攻击力+50%。",
		rarity: "legendary",
		icon: "👹",
		price: 350,
		counters: ["voidDevourer", "abyssHulk"],
		callbacks: { onCardPlay: (player, card, context) => {
			if (card.type === "attack") {
				context.addDebuff = {
					type: "severe_wound",
					value: 1
				};
				if (player.hasBuff && player.hasBuff("healing_corrupt")) {
					context.damageModifier = (context.damageModifier || 0) + .5;
					Utils.showBattleLog("【断魂刃】因禁疗而狂暴！伤害+50%！");
				}
			}
		} }
	},
	"spirit_turtle_shell": {
		id: "spirit_turtle_shell",
		name: "灵龟壳",
		description: "免疫[减速]、[麻痹]效果。回合开始时获得等同于命环等级的护盾。",
		rarity: "legendary",
		setTag: "xuanjia",
		icon: "🐚",
		price: 350,
		counters: ["fusionSovereign", "thunderTribulation"],
		callbacks: {
			onBattleStart: (player) => {
				player.addBuff("immunity_slow", 999);
				player.addBuff("immunity_paralysis", 999);
				Utils.showBattleLog("【灵龟壳】坚如磐石，不受干扰！");
			},
			onTurnStart: (player) => {
				const level = player.fateRing?.level || 1;
				player.addBlock(level);
				Utils.showBattleLog(`【灵龟壳】获得${level}点护盾`);
			}
		}
	},
	"cloud_boots": {
		id: "cloud_boots",
		name: "云步靴",
		description: "免疫卡牌费用增加效果。每回合第一张牌费用-1（最低0）。",
		rarity: "legendary",
		icon: "👟",
		price: 380,
		counters: ["mahayanaSupreme"],
		data: { reduced: false },
		callbacks: {
			onBattleStart: (player) => {
				player.addBuff("immunity_cost_increase", 999);
				Utils.showBattleLog("【云步靴】轻盈飘逸！");
			},
			onTurnStart: (player, treasure) => {
				treasure.data.reduced = false;
				player.addBuff("first_card_discount", 1);
			}
		}
	},
	"thunder_ward": {
		id: "thunder_ward",
		name: "避雷符",
		description: "受到雷属性伤害减少50%。每受到雷属性攻击，敌人反受5点伤害。",
		rarity: "legendary",
		icon: "⚡",
		price: 350,
		counters: [
			"ascensionSovereign",
			"thunderTribulation",
			"tribulationCloud5",
			"tribulationCloud10",
			"tribulationCloud15"
		],
		callbacks: { onBattleStart: (player) => {
			player.addBuff("thunder_resist", .5);
			player.addBuff("thunder_reflect", 5);
			Utils.showBattleLog("【避雷符】雷霆不侵！");
		} }
	},
	"truth_mirror": {
		id: "truth_mirror",
		name: "破妄镜",
		description: "无效敌人的反射效果。回合开始时，移除敌人15%护盾。",
		rarity: "legendary",
		icon: "🔍",
		price: 380,
		counters: ["mirrorDemon", "mirrorReplicant"],
		callbacks: {
			onBattleStart: (player) => {
				player.addBuff("pierce_reflect", 999);
				Utils.showBattleLog("【破妄镜】照破虚妄！");
			},
			onTurnStart: (player) => {
				if (window.game && window.game.enemies) window.game.enemies.forEach((e) => {
					if (e.isAlive() && e.block > 0) {
						const remove = Math.floor(e.block * .15);
						e.block = Math.max(0, e.block - remove);
						if (remove > 0) Utils.showBattleLog(`【破妄镜】瓦解${remove}点护盾！`);
					}
				});
			}
		}
	},
	"clarity_bead": {
		id: "clarity_bead",
		name: "定心珠",
		description: "免疫混乱、眩晕效果。手牌费用无法被敌人修改。",
		rarity: "legendary",
		icon: "🔵",
		price: 400,
		counters: ["chaosEye"],
		callbacks: { onBattleStart: (player) => {
			player.addBuff("immunity_confuse", 999);
			player.addBuff("immunity_stun", 999);
			player.addBuff("cost_lock", 999);
			Utils.showBattleLog("【定心珠】心如止水，不受干扰！");
		} }
	},
	"nine_sword_case": {
		id: "nine_sword_case",
		name: "九霄剑匣",
		description: "每打出一张攻击牌积累1层剑气。6层时下次攻击造成双倍伤害并清空。",
		rarity: "legendary",
		icon: "⚔️",
		price: 420,
		data: { stacks: 0 },
		callbacks: {
			onBattleStart: (player, treasure) => {
				treasure.data.stacks = 0;
			},
			onCardPlay: (player, card, context, treasure) => {
				if (card.type === "attack") {
					treasure.data.stacks++;
					if (treasure.data.stacks >= 6) {
						context.damageMultiplier = (context.damageMultiplier || 1) * 2;
						treasure.data.stacks = 0;
						Utils.showBattleLog("【九霄剑匣】剑气爆发！伤害翻倍！");
					}
				}
			}
		}
	},
	"stabilizer_pin": {
		id: "stabilizer_pin",
		name: "定海神针",
		description: "回合开始时，灵力补满至3点。免疫一次即死效果（每场战斗一次）。",
		rarity: "mythic",
		icon: "🥢",
		price: 800,
		counters: ["heavenlyDao"],
		data: { deathSaveUsed: false },
		callbacks: {
			onBattleStart: (player, treasure) => {
				treasure.data.deathSaveUsed = false;
				player.addBuff("execution_immunity", 1);
				Utils.showBattleLog("【定海神针】定住乾坤！");
			},
			onTurnStart: (player) => {
				if (player.currentEnergy < 3) {
					const diff = 3 - player.currentEnergy;
					player.gainEnergy(diff);
					Utils.showBattleLog(`【定海神针】灵力补至3点 (+${diff})`);
				}
			},
			onBeforeDeath: (player, treasure) => {
				if (!treasure.data.deathSaveUsed) {
					treasure.data.deathSaveUsed = true;
					player.currentHp = 1;
					Utils.showBattleLog("【定海神针】定海神针阻挡了致命一击！");
					return true;
				}
				return false;
			}
		}
	},
	"five_element_bead": {
		id: "five_element_bead",
		name: "五行珠",
		description: "战斗开始时随机获得一种元素亲和。对该元素敌人伤害+40%，受该元素伤害-30%。",
		rarity: "mythic",
		setTag: "wuxing",
		icon: "🌈",
		price: 600,
		counters: ["elementalElder", "elementalConstruct"],
		data: { element: null },
		callbacks: {
			onBattleStart: (player, treasure) => {
				const elements = [
					"fire",
					"ice",
					"thunder",
					"earth",
					"wood"
				];
				treasure.data.element = elements[Math.floor(Math.random() * elements.length)];
				player.buffs.element_affinity = treasure.data.element;
				Utils.showBattleLog(`【五行珠】获得${{
					fire: "火",
					ice: "冰",
					thunder: "雷",
					earth: "土",
					wood: "木"
				}[treasure.data.element]}元素亲和！`);
			},
			onBeforeDealDamage: (player, amount, context, treasure) => {
				if (context.targetElement === treasure.data.element) return Math.floor(amount * 1.4);
				return amount;
			},
			onBeforeTakeDamage: (player, amount, context, treasure) => {
				if (context.damageElement === treasure.data.element) return Math.floor(amount * .7);
				return amount;
			}
		}
	},
	"karma_wheel": {
		id: "karma_wheel",
		name: "因果轮",
		description: "受到的反伤伤害转化为治疗。击杀敌人时恢复8%最大生命。",
		rarity: "mythic",
		icon: "☸️",
		price: 700,
		counters: ["karmaArbiter", "karmaSpirit"],
		callbacks: {
			onBattleStart: (player) => {
				player.addBuff("thorns_heal", 999);
				Utils.showBattleLog("【因果轮】因果流转！");
			},
			onBeforeTakeDamage: (player, amount, context) => {
				if (context && context.source === "thorns") {
					player.heal(amount);
					Utils.showBattleLog(`【因果轮】因果反噬转化为${amount}点治疗！`);
					return 0;
				}
				return amount;
			},
			onKill: (player, enemy) => {
				const heal = Math.floor(player.maxHp * .08);
				player.heal(heal);
				Utils.showBattleLog(`【因果轮】因果圆满，回复${heal}点生命`);
			}
		}
	},
	"ring_echo_compass": {
		id: "ring_echo_compass",
		name: "星轨罗盘",
		description: "战斗开始时奶糖上限外 +1；命环达到4级时额外抽1张牌。",
		rarity: "rare",
		setTag: "xingheng",
		icon: "🧭",
		price: 230,
		callbacks: { onBattleStart: (player) => {
			player.milkCandy = Math.min((player.maxMilkCandy || 0) + 2, (player.milkCandy || 0) + 1);
			if ((player?.fateRing?.level || 0) >= 4) player.drawCards(1);
			Utils.showBattleLog("【星轨罗盘】校准命轨，补充奶糖并调整手牌节奏");
		} }
	},
	"astral_forge_core": {
		id: "astral_forge_core",
		name: "星熔炉心",
		description: "每打出2张技能牌，获得1点灵力并获得4点护盾。",
		rarity: "legendary",
		setTag: "xingheng",
		icon: "🌋",
		price: 380,
		data: { skillCounter: 0 },
		callbacks: {
			onBattleStart: (player, treasure) => {
				if (treasure && treasure.data) treasure.data.skillCounter = 0;
			},
			onCardPlay: (player, card, context, treasure) => {
				if (!treasure || !treasure.data || !card || card.type !== "skill") return;
				treasure.data.skillCounter = Math.max(0, Math.floor(Number(treasure.data.skillCounter) || 0)) + 1;
				if (treasure.data.skillCounter >= 2) {
					treasure.data.skillCounter = 0;
					player.gainEnergy(1);
					player.addBlock(4);
					Utils.showBattleLog("【星熔炉心】技能链闭环：灵力+1，护盾+4");
				}
			}
		}
	},
	"fate_lotus_seal": {
		id: "fate_lotus_seal",
		name: "命契莲印",
		description: "每次击杀敌人，命环经验+12+2x等级，并回复3点生命。",
		rarity: "legendary",
		setTag: "liemai",
		icon: "🪷",
		price: 410,
		callbacks: { onKill: (player) => {
			const gainExp = 12 + Math.max(0, Math.floor(Number(player?.fateRing?.level) || 0)) * 2;
			if (player && player.fateRing) {
				player.fateRing.exp += gainExp;
				if (typeof player.checkFateRingLevelUp === "function") player.checkFateRingLevelUp();
			}
			player.heal(3);
			Utils.showBattleLog(`【命契莲印】击杀回响：命环经验 +${gainExp}，回复3生命`);
		} }
	},
	"moonblade_sheath": {
		id: "moonblade_sheath",
		name: "月刃鞘",
		description: "每回合首次打出攻击牌时，获得4点护盾并抽1张牌。",
		rarity: "rare",
		setTag: "xingheng",
		icon: "🌙",
		price: 260,
		data: { attackProcUsed: false },
		callbacks: {
			onBattleStart: (player, treasure) => {
				if (treasure && treasure.data) treasure.data.attackProcUsed = false;
			},
			onTurnStart: (player, treasure) => {
				if (treasure && treasure.data) treasure.data.attackProcUsed = false;
			},
			onCardPlay: (player, card, context, treasure) => {
				if (!treasure || !treasure.data || !card || card.type !== "attack") return;
				if (treasure.data.attackProcUsed) return;
				treasure.data.attackProcUsed = true;
				player.addBlock(4);
				player.drawCards(1);
				Utils.showBattleLog("【月刃鞘】攻势引流：护盾+4，抽牌+1");
			}
		}
	},
	"ringweaver_anvil": {
		id: "ringweaver_anvil",
		name: "织环砧",
		description: "每次打出法则牌，命环经验+10，并回复1点奶糖（可溢出1点）。",
		rarity: "legendary",
		setTag: "xingheng",
		icon: "⚒️",
		price: 420,
		callbacks: { onCardPlay: (player, card) => {
			if (!card || card.type !== "law" || !player || !player.fateRing) return;
			player.fateRing.exp += 10;
			if (typeof player.checkFateRingLevelUp === "function") player.checkFateRingLevelUp();
			player.milkCandy = Math.min((player.maxMilkCandy || 0) + 1, (player.milkCandy || 0) + 1);
			Utils.showBattleLog("【织环砧】法则共振：命环经验+10，奶糖+1");
		} }
	},
	"hunter_contract": {
		id: "hunter_contract",
		name: "猎征契",
		description: "战斗开始获得1点力量。每次击杀敌人，抽1张牌并额外获得10灵石。",
		rarity: "rare",
		setTag: "liemai",
		icon: "📜",
		price: 245,
		callbacks: {
			onBattleStart: (player) => {
				player.addBuff("strength", 1);
				Utils.showBattleLog("【猎征契】狩猎契约生效：力量+1");
			},
			onKill: (player) => {
				player.drawCards(1);
				player.gold = Math.max(0, Math.floor(Number(player.gold) || 0)) + 10;
				Utils.showBattleLog("【猎征契】击杀结算：抽牌+1，灵石+10");
			}
		}
	},
	"matrix_resonator": {
		id: "matrix_resonator",
		name: "矩阵谐振核",
		description: "战斗开始获得1点指令槽。打出命环矩阵卡牌后，额外装填1层对应策略信号。",
		rarity: "rare",
		setTag: "xingheng",
		icon: "🜇",
		price: 285,
		callbacks: {
			onBattleStart: (player) => {
				const battle = player?.game?.battle;
				if (!battle || !battle.commandState || !battle.commandState.enabled) return;
				if (typeof battle.gainBattleCommandPoints === "function") {
					battle.gainBattleCommandPoints(1, "matrixResonator");
					Utils.showBattleLog("【矩阵谐振核】开场校准：指令槽 +1");
				}
			},
			onCardPlay: (player, card) => {
				if (!player || !card || typeof card !== "object") return;
				const battle = player?.game?.battle;
				if (!battle || !battle.commandState || !battle.commandState.enabled) return;
				const signalBuff = {
					matrixGuardProtocol: "matrixGuardSignal",
					matrixShatterVector: "matrixBreakSignal",
					matrixPurgeLoop: "matrixCleanseSignal"
				}[String(card.id || "")];
				if (!signalBuff) return;
				if (typeof player.addBuff === "function") player.addBuff(signalBuff, 1);
				else {
					player.buffs = player.buffs || {};
					player.buffs[signalBuff] = Math.max(0, Math.floor(Number(player.buffs[signalBuff]) || 0)) + 1;
				}
				Utils.showBattleLog("【矩阵谐振核】矩阵信号叠加：下次命环共振策略已强化");
			}
		}
	},
	"tactical_relay_spindle": {
		id: "tactical_relay_spindle",
		name: "战术继电梭",
		description: "每次命环共振结算后，下一回合开始灵力+1；若上次为手动策略，再抽1张牌。",
		rarity: "legendary",
		setTag: "xingheng",
		icon: "🧵",
		price: 430,
		data: { lastTriggeredUseCount: 0 },
		callbacks: {
			onBattleStart: (player, treasure) => {
				if (!treasure || !treasure.data) return;
				treasure.data.lastTriggeredUseCount = 0;
			},
			onTurnStart: (player, treasure) => {
				if (!player || !treasure || !treasure.data) return;
				const battle = player?.game?.battle;
				if (!battle || !battle.commandState || !battle.commandState.enabled) return;
				const totalUsed = Math.max(0, Math.floor(Number(battle.commandState.totalCommandsUsed) || 0));
				if (totalUsed <= Math.max(0, Math.floor(Number(treasure.data.lastTriggeredUseCount) || 0))) return;
				if (String(battle.commandState.lastCommandId || "") !== "resonance_matrix_order") return;
				treasure.data.lastTriggeredUseCount = totalUsed;
				if (typeof player.gainEnergy === "function") player.gainEnergy(1);
				else player.currentEnergy = Math.max(0, Math.floor(Number(player.currentEnergy) || 0) + 1);
				const usedManualMode = String(battle.commandState.lastResonanceMatrixMode || "auto") !== "auto";
				if (usedManualMode && typeof player.drawCards === "function") player.drawCards(1);
				Utils.showBattleLog(`【战术继电梭】承接命环共振：灵力 +1${usedManualMode ? "，抽牌 +1" : ""}`);
			}
		}
	},
	"heaven_shard": {
		id: "heaven_shard",
		name: "天道碎片",
		description: "每回合获得随机强力增益。不会被秒杀（生命不会低于1）。",
		rarity: "mythic",
		icon: "✨",
		price: 999,
		counters: ["heavenlyDao"],
		callbacks: {
			onBattleStart: (player) => {
				player.addBuff("execution_immunity", 999);
				Utils.showBattleLog("【天道碎片】天道庇护！");
			},
			onTurnStart: (player) => {
				const buffs = [
					() => {
						player.addBuff("strength", 2);
						Utils.showBattleLog("【天道碎片】力量+2");
					},
					() => {
						player.addBlock(12);
						Utils.showBattleLog("【天道碎片】护盾+12");
					},
					() => {
						player.drawCards(1);
						Utils.showBattleLog("【天道碎片】额外抽1张牌");
					},
					() => {
						player.gainEnergy(1);
						Utils.showBattleLog("【天道碎片】灵力+1");
					},
					() => {
						player.heal(8);
						Utils.showBattleLog("【天道碎片】回复8点生命");
					}
				];
				buffs[Math.floor(Math.random() * buffs.length)]();
			},
			onBeforeTakeDamage: (player, amount, context) => {
				if (amount >= player.currentHp && player.currentHp > 1) {
					Utils.showBattleLog("【天道碎片】天道护体，免疫致命伤害！");
					return player.currentHp - 1;
				}
				return amount;
			}
		}
	}
};
var TREASURE_CONFIG = {
	maxTreasures: 4,
	maxPerRarity: {
		common: 2,
		rare: 2,
		legendary: 2,
		mythic: 1
	},
	rarityColors: {
		common: "#a0a0a0",
		rare: "#4fc3f7",
		legendary: "#ffd700",
		mythic: "#ff6ec7"
	},
	rarityNames: {
		common: "普通",
		rare: "稀有",
		legendary: "传说",
		mythic: "神话"
	},
	unlockRealm: {
		"pressure_talisman": 1,
		"soul_jade": 1,
		"qi_gourd": 1,
		"spirit_stone": 1,
		"blood_orb": 2,
		"iron_talisman": 1,
		"vitality_stone": 1,
		"sharp_whetstone": 1,
		"soul_banner": 2,
		"spirit_bead": 2,
		"ice_spirit_bead": 3,
		"heart_mirror": 2,
		"seal_soul_bead": 4,
		"space_anchor": 5,
		"wind_bead": 10,
		"ward_jade": 2,
		"diamond_amulet": 3,
		"phoenix_feather": 3,
		"tortoise_shell": 4,
		"flying_dagger": 5,
		"yin_yang_mirror": 6,
		"void_mirror": 11,
		"soul_severing_blade": 14,
		"spirit_turtle_shell": 6,
		"cloud_boots": 7,
		"thunder_ward": 8,
		"truth_mirror": 12,
		"clarity_bead": 13,
		"nine_sword_case": 9,
		"stabilizer_pin": 16,
		"five_element_bead": 15,
		"karma_wheel": 16,
		"ring_echo_compass": 7,
		"astral_forge_core": 11,
		"fate_lotus_seal": 12,
		"moonblade_sheath": 6,
		"ringweaver_anvil": 10,
		"hunter_contract": 8,
		"matrix_resonator": 9,
		"tactical_relay_spindle": 12,
		"heaven_shard": 17
	}
};
function getAvailableTreasures(realm) {
	return Object.values(TREASURES).filter((t) => {
		return realm >= (TREASURE_CONFIG.unlockRealm[t.id] || 1);
	});
}
function canAddTreasure(playerTreasures, newTreasure) {
	if (!playerTreasures) playerTreasures = [];
	if (playerTreasures.length >= TREASURE_CONFIG.maxTreasures) return {
		canAdd: false,
		reason: `最多携带${TREASURE_CONFIG.maxTreasures}个法宝`
	};
	const rarity = TREASURES[newTreasure]?.rarity || "common";
	if (playerTreasures.filter((t) => TREASURES[t]?.rarity === rarity).length >= TREASURE_CONFIG.maxPerRarity[rarity]) return {
		canAdd: false,
		reason: `同品质(${TREASURE_CONFIG.rarityNames[rarity]})法宝最多${TREASURE_CONFIG.maxPerRarity[rarity]}个`
	};
	if (playerTreasures.includes(newTreasure)) return {
		canAdd: false,
		reason: "已拥有该法宝"
	};
	return { canAdd: true };
}
function getTreasureCounters(treasureId) {
	const treasure = TREASURES[treasureId];
	if (!treasure || !treasure.counters) return [];
	return treasure.counters;
}
function getCounterTreasures(bossId) {
	return Object.values(TREASURES).filter((t) => t.counters && t.counters.includes(bossId));
}
if (typeof window !== "undefined") {
	window.TREASURES = TREASURES;
	window.TREASURE_CONFIG = TREASURE_CONFIG;
	window.getAvailableTreasures = getAvailableTreasures;
	window.canAddTreasure = canAddTreasure;
	window.getTreasureCounters = getTreasureCounters;
	window.getCounterTreasures = getCounterTreasures;
}
//#endregion
//#region js/data/characters.js
/**
* The Defier - 角色数据
* 定义可选角色的属性、初始卡组和特性
*/
var CHARACTERS = {
	linFeng: {
		id: "linFeng",
		name: "林风",
		title: "逆命者",
		avatar: "🤺",
		image: "assets/images/characters/lin_feng.webp",
		description: "命环可以进化的逆命者，每次进化都伴随着巨大的风险与机遇。",
		stats: {
			maxHp: 80,
			gold: 100,
			energy: 3
		},
		deck: [
			"strike",
			"strike",
			"strike",
			"strike",
			"defiantWill",
			"defend",
			"defend",
			"defend",
			"defend",
			"spiritBoost"
		],
		relic: {
			id: "fateRing",
			name: "逆命之环",
			desc: "每次战斗胜利获得额外命环经验 (+20 + 5x等级)。"
		},
		themeColor: "var(--accent-gold)",
		bgImage: "linear-gradient(135deg, rgba(255,215,0,0.1) 0%, rgba(0,0,0,0.8) 100%)",
		activeSkillId: "heavensDefiance"
	},
	xiangYe: {
		id: "xiangYe",
		name: "香叶",
		title: "被诅咒的医者",
		avatar: "🌿",
		image: "assets/images/characters/xiang_ye.webp",
		description: "身负“逆生咒”的医者，血液中流淌着治愈法则，却需时刻压制体内的力量。",
		stats: {
			maxHp: 65,
			gold: 100,
			energy: 3
		},
		deck: [
			"strike",
			"strike",
			"strike",
			"strike",
			"poisonTouch",
			"defend",
			"defend",
			"defend",
			"healingTouch",
			"minorHeal"
		],
		relic: {
			id: "healingBlood",
			name: "治愈之血",
			desc: "回合开始时，回复 2+(等级/3) 点生命值。"
		},
		themeColor: "var(--accent-green)",
		bgImage: "linear-gradient(135deg, rgba(76,175,80,0.1) 0%, rgba(0,0,0,0.8) 100%)",
		activeSkillId: "lifeBloom"
	},
	wuYu: {
		id: "wuYu",
		name: "无欲",
		title: "苦行僧",
		avatar: "📿",
		description: "脱离宗门的佛门子弟，修习金刚不坏之身，誓要荡平世间黑暗。",
		stats: {
			maxHp: 90,
			gold: 100,
			energy: 3
		},
		deck: [
			"monkStrike",
			"monkStrike",
			"monkStrike",
			"vajraGlare",
			"strike",
			"defend",
			"defend",
			"defend",
			"defend",
			"ironSkin"
		],
		relic: {
			id: "vajraBody",
			name: "金刚法相",
			desc: "战斗开始时，获得 6+等级 点护盾。"
		},
		themeColor: "var(--accent-red)",
		bgImage: "linear-gradient(135deg, rgba(255,87,34,0.1) 0%, rgba(0,0,0,0.8) 100%)",
		activeSkillId: "vajraIndestructible",
		image: "assets/images/characters/wuyu.webp"
	},
	yanHan: {
		id: "yanHan",
		name: "严寒",
		title: "命环学者",
		avatar: "assets/images/characters/yan_han.webp",
		description: "潜心研究命环的学者，掌握着早已失传的古老知识，试图用智慧解开命运的谜题。",
		stats: {
			maxHp: 70,
			gold: 150,
			energy: 3
		},
		deck: [
			"strike",
			"strike",
			"strike",
			"defend",
			"defend",
			"defend",
			"meditation",
			"spiritBoost",
			"quickDraw",
			"ringAnalysis"
		],
		relic: {
			id: "scholarLens",
			name: "真理之镜",
			desc: "战斗开始时，随机获得1张0费技能牌 (5级后获得2张)。"
		},
		themeColor: "#2196F3",
		bgImage: "linear-gradient(135deg, rgba(33,150,243,0.1) 0%, rgba(0,0,0,0.8) 100%)",
		activeSkillId: "absoluteTruth"
	},
	moChen: {
		id: "moChen",
		name: "墨尘",
		title: "星律巡使",
		avatar: "🌠",
		description: "游走于诸天裂隙的巡使，擅长以命环律动叠加战术节奏，越战越强。",
		stats: {
			maxHp: 74,
			gold: 120,
			energy: 3
		},
		deck: [
			"strike",
			"strike",
			"defend",
			"defend",
			"defend",
			"spiritBoost",
			"starNeedle",
			"omenBarrier",
			"ringCatalyst",
			"quickDraw"
		],
		relic: {
			id: "starsealCompass",
			name: "星封罗盘",
			desc: "战斗开始时奶糖上限外 +1；每回合首次打出技能牌，额外抽1张牌。"
		},
		themeColor: "#8aa4ff",
		bgImage: "linear-gradient(135deg, rgba(76, 104, 255, 0.20) 0%, rgba(0,0,0,0.82) 100%)",
		activeSkillId: "starOath"
	},
	ningXuan: {
		id: "ningXuan",
		name: "宁玄",
		title: "灵器行者",
		avatar: "🪬",
		description: "游历诸界的灵器行者，擅长以法宝与命环同频，将攻防节奏压入同一回合。",
		stats: {
			maxHp: 78,
			gold: 110,
			energy: 3
		},
		deck: [
			"strike",
			"strike",
			"defend",
			"defend",
			"defend",
			"spiritBoost",
			"artifactBolt",
			"echoWard",
			"ringInfusion",
			"quickDraw"
		],
		relic: {
			id: "artifactPulse",
			name: "灵器脉印",
			desc: "战斗开始时获得6点护盾；每回合首次打出攻击牌，获得1点灵力。"
		},
		themeColor: "#4ecdc4",
		bgImage: "linear-gradient(135deg, rgba(47, 209, 182, 0.22) 0%, rgba(0,0,0,0.82) 100%)",
		activeSkillId: "artifactOverdrive"
	}
};
//#endregion
//#region js/data/index.js?v=7.0.0
if (typeof window !== "undefined") {
	window.ENEMIES = ENEMIES;
	window.ENEMY_ECOLOGY_TEMPLATES = ENEMY_ECOLOGY_TEMPLATES;
	window.CHAPTER_ELITE_COMBOS = CHAPTER_ELITE_COMBOS;
	window.CARDS = CARDS;
	window.TREASURES = TREASURES;
	window.CHARACTERS = CHARACTERS;
}
//#endregion
