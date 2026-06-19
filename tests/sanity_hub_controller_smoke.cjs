const fs = require("fs");
const path = require("path");

function assert(condition, message) {
  if (!condition) throw new Error(message);
}

function read(relativePath) {
  return fs.readFileSync(path.resolve(__dirname, "..", relativePath), "utf8");
}

(function run() {
  const collectionHub = read("js/core/collection_hub.js");
  const challengeHub = read("js/core/challenge_hub.js");
  const expeditionHub = read("js/core/expedition_hub.js");
  const hubRegistry = read("js/runtime/hub-registry.js");
  const game = read("js/game.js");
  const map = read("js/core/map.js");

  assert(!/Game\.prototype\.[A-Za-z0-9_]+\s*=\s*function/.test(collectionHub), "collection hub should not patch Game.prototype directly");
  assert(!/Game\.prototype\.[A-Za-z0-9_]+\s*=\s*function/.test(challengeHub), "challenge hub should not patch Game.prototype directly");
  assert(!/Game\.prototype\.[A-Za-z0-9_]+\s*=\s*function/.test(expeditionHub), "expedition hub should not patch Game.prototype directly");
  assert(!/GameMap\.prototype\.[A-Za-z0-9_]+\s*=\s*function/.test(challengeHub), "challenge hub should not patch GameMap.prototype directly");
  assert(!/GameMap\.prototype\.[A-Za-z0-9_]+\s*=\s*function/.test(expeditionHub), "expedition hub should not patch GameMap.prototype directly");

  assert(/export const CollectionHubController\s*=/.test(collectionHub), "collection hub should export CollectionHubController");
  assert(/export const ChallengeHubController\s*=/.test(challengeHub), "challenge hub should export ChallengeHubController");
  assert(/export const ExpeditionHubController\s*=/.test(expeditionHub), "expedition hub should export ExpeditionHubController");
  assert(/__attachCollectionHubController/.test(collectionHub), "collection hub should expose explicit attach entry");
  assert(/__attachChallengeHubController/.test(challengeHub), "challenge hub should expose explicit attach entry");
  assert(/__attachExpeditionHubController/.test(expeditionHub), "expedition hub should expose explicit attach entry");
  assert(/registerHubController\('collection'/.test(collectionHub), "collection hub should register with hub registry");
  assert(/registerHubController\('challenge'/.test(challengeHub), "challenge hub should register with hub registry");
  assert(/registerHubController\('expedition'/.test(expeditionHub), "expedition hub should register with hub registry");

  assert(/attachHubControllers\(\)/.test(game), "game should define attachHubControllers");
  assert(/attachRegisteredHubControllers\(this\)/.test(game), "game should attach registered hub controllers");
  assert(/attachLegacyHubControllers\(runtimeGlobal\)/.test(game), "game should keep legacy hub fallback");
  assert(/runtimeGlobal\.__attachCollectionHubController\(this\)/.test(game), "game should keep collection hub fallback");
  assert(/runtimeGlobal\.__attachChallengeHubController\(this\)/.test(game), "game should keep challenge hub fallback");
  assert(/runtimeGlobal\.__attachExpeditionHubController\(this\)/.test(game), "game should keep expedition hub fallback");
  assert(/registerHubController/.test(hubRegistry), "hub registry should register attach functions");
  assert(/attachRegisteredHubControllers/.test(hubRegistry), "hub registry should attach registered controllers");

  assert(/registerHook\(name, callback\)/.test(map), "map should expose hook registration");
  assert(/runHooks\('afterRender'/.test(map), "map should trigger afterRender hook");
  assert(/runHooks\('afterUpdateState'/.test(map), "map should trigger afterUpdateState hook");
  assert(/runHooks\('afterCompleteNode'/.test(map), "map should trigger afterCompleteNode hook");

  console.log("Hub controller smoke checks passed.");
})();
