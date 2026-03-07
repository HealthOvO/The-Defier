#!/usr/bin/env bash
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$ROOT_DIR"

node tests/sanity_auth_config_checks.js
node tests/sanity_balance_checks.js
node tests/sanity_event_flow_checks.js
node tests/sanity_content_archetype_checks.js
node tests/sanity_event_bias_distribution_checks.js
node tests/sanity_battle_debuff_checks.js
node tests/sanity_battle_guardbreak_checks.js
node tests/sanity_map_weight_checks.js
node tests/sanity_legacy_progression_checks.js
node tests/sanity_entropy_doctrine_checks.js
node tests/sanity_bulwark_resonance_checks.js
node tests/sanity_bulwark_doctrine_checks.js
node tests/sanity_bulwark_blockburst_checks.js
node tests/sanity_pvp_service_checks.js
node tests/sanity_pvp_shop_checks.js
node tests/verify_assets.js
node tests/verify_avatars.js
node tests/sanity_runtime_hooks_checks.js
node tests/sanity_save_migration_checks.js

echo "All node checks passed."
