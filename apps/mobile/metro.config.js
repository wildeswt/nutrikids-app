const path = require('node:path');
const { getDefaultConfig } = require('expo/metro-config');

const projectRoot = __dirname;
const monorepoRoot = path.resolve(projectRoot, '../..');

const config = getDefaultConfig(projectRoot);

config.watchFolders = [monorepoRoot];
config.resolver.nodeModulesPaths = [
  path.resolve(projectRoot, 'node_modules'),
  path.resolve(monorepoRoot, 'node_modules'),
];

// `@nutrikids/shared` usa imports con extensión `.js` (requerido por Node ESM / NodeNext)
// aunque el archivo real sea `.ts`. Metro no hace ese mapeo por defecto, así que lo resolvemos aquí.
const defaultResolveRequest = config.resolver.resolveRequest;
config.resolver.resolveRequest = (context, moduleName, platform) => {
  const resolve = defaultResolveRequest ?? context.resolveRequest;
  if (moduleName.startsWith('.') && moduleName.endsWith('.js')) {
    try {
      return resolve(context, moduleName.replace(/\.js$/, ''), platform);
    } catch {
      // Si no existe la versión sin extensión, se intenta el nombre original.
    }
  }
  return resolve(context, moduleName, platform);
};

module.exports = config;
