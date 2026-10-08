const path = require('path');
const { getDefaultConfig } = require('expo/metro-config');

const config = getDefaultConfig(__dirname);

// Node core modules that isomorphic-git (and friends) reference but that
// don't exist in React Native. If a real npm package of the same name is
// installed it is used; otherwise we fall back to an empty module.
const NODE_BUILTINS = new Set([
  'crypto', 'fs', 'path', 'os', 'stream', 'zlib', 'http', 'https', 'net',
  'tls', 'url', 'util', 'events', 'string_decoder', 'assert', 'child_process',
  'buffer', 'process',
]);
const emptyShim = path.resolve(__dirname, 'shims/empty.js');

config.resolver.resolveRequest = (context, moduleName, platform) => {
  try {
    return context.resolveRequest(context, moduleName, platform);
  } catch (err) {
    if (NODE_BUILTINS.has(moduleName)) {
      return { type: 'sourceFile', filePath: emptyShim };
    }
    throw err;
  }
};

module.exports = config;
