#!/usr/bin/env bash
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$ROOT_DIR"

node tests/sanity_auth_config_checks.js
node tests/sanity_balance_checks.js
node tests/sanity_expansion_system_checks.js
node tests/sanity_event_flow_checks.js
node tests/sanity_content_archetype_checks.js
node tests/sanity_event_bias_distribution_checks.js
node tests/sanity_battle_pollution_checks.js
node tests/sanity_battle_debuff_checks.js
node tests/sanity_battle_guardbreak_checks.js
node tests/sanity_battle_variation_checks.js
node tests/sanity_battle_advisor_plan_checks.js
node tests/sanity_battle_squad_reward_checks.js
node tests/sanity_battle_encounter_theme_checks.js
node tests/sanity_battle_command_checks.js
node tests/sanity_battle_command_synergy_checks.js
node tests/sanity_boss_three_act_checks.js
node tests/sanity_path_doctrine_growth_checks.js
node tests/sanity_enemy_tactical_queue_checks.js
node tests/sanity_enemy_ecology_diversity_checks.js
node tests/sanity_map_weight_checks.js
node tests/sanity_map_path_synergy_checks.js
node tests/sanity_map_ghost_duel_checks.js
node tests/sanity_legacy_progression_checks.js
node tests/sanity_entropy_doctrine_checks.js
node tests/sanity_stormcraft_vitalweave_resonance_checks.js
node tests/sanity_bulwark_resonance_checks.js
node tests/sanity_bulwark_doctrine_checks.js
node tests/sanity_bulwark_blockburst_checks.js
node tests/sanity_treasure_set_bonus_checks.js
node tests/sanity_card_design_guardrail_checks.js
node tests/sanity_adventure_buff_checks.js
node tests/sanity_pvp_service_checks.js
node tests/sanity_pvp_shop_checks.js
node tests/sanity_shop_strategy_system_checks.js
node tests/sanity_planning_todo_checks.js
node tests/verify_assets.js
node tests/verify_avatars.js
node tests/sanity_runtime_hooks_checks.js
node tests/sanity_save_migration_checks.js
node tests/sanity_endless_mode_checks.js
node tests/sanity_endless_pressure_curve_checks.js
node tests/sanity_endless_phase_boss_checks.js
node tests/sanity_endless_shop_service_checks.js

echo "All node checks passed."
