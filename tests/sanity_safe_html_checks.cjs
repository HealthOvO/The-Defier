const path = require('path');
const { pathToFileURL } = require('url');

function assert(condition, message) {
  if (!condition) throw new Error(message);
}

(async function run() {
  const mod = await import(pathToFileURL(path.resolve(__dirname, '../js/core/safe-html.js')).href);
  assert(typeof mod.escapeHtml === 'function', 'escapeHtml should exist');
  assert(typeof mod.escapeAttr === 'function', 'escapeAttr should exist');

  assert(mod.escapeHtml(`Tom & "Jerry" <tag> 'x'`) === 'Tom &amp; &quot;Jerry&quot; &lt;tag&gt; &#39;x&#39;', 'escapeHtml should escape html special chars including single quote');
  assert(mod.escapeAttr(`onmouseover='alert("x")'`) === 'onmouseover=&#39;alert(&quot;x&quot;)&#39;', 'escapeAttr should escape event attribute payloads');
  assert(mod.escapeHtml(null) === '', 'escapeHtml should normalize null to empty string');
  assert(mod.escapeAttr(undefined) === '', 'escapeAttr should normalize undefined to empty string');
  assert(mod.escapeAttr("line1\nline2") === 'line1&#10;line2', 'escapeAttr should escape newlines for attributes');

  console.log('Safe HTML checks passed.');
})().catch(error => {
  console.error(error);
  process.exit(1);
});
