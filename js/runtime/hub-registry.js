const HUB_KEYS = Object.freeze(['collection', 'challenge', 'expedition']);
const hubControllers = new Map();

export function registerHubController(name, attachController) {
  if (!HUB_KEYS.includes(name) || typeof attachController !== 'function') return false;
  hubControllers.set(name, attachController);
  return true;
}

export function attachRegisteredHubControllers(game) {
  if (!game) return {};
  const attached = {};
  HUB_KEYS.forEach(name => {
    const attachController = hubControllers.get(name);
    if (typeof attachController === 'function') {
      attached[name] = attachController(game);
    }
  });
  return attached;
}

export function getRegisteredHubControllerNames() {
  return HUB_KEYS.filter(name => hubControllers.has(name));
}
