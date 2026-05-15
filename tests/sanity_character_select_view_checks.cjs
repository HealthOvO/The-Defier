const fs = require('fs');
const path = require('path');
const assert = require('assert');

const viewPath = path.resolve(__dirname, '../js/views/CharacterSelectView.js');
const source = fs.readFileSync(viewPath, 'utf8');

assert(!/onclick=/.test(source), 'CharacterSelectView should not render inline click handlers');
assert(!/onerror=/.test(source), 'CharacterSelectView should not render inline error handlers');
assert(/data-run-destiny-id=/.test(source), 'CharacterSelectView should render data-run-destiny-id for delegated selection');
assert(/data-spirit-id=/.test(source), 'CharacterSelectView should render data-spirit-id for delegated selection');
assert(/data-run-path-id=/.test(source), 'CharacterSelectView should render data-run-path-id for delegated selection');
assert(/bindCharacterSelectionEvents\(container\)/.test(source), 'CharacterSelectView should bind delegated selection handlers');

console.log('Character select view safety checks passed.');
