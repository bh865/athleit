// Expo SDK 52+ configures Metro for monorepos automatically (watchFolders and
// node_modules resolution for the workspace root), and SDK 54+ supports pnpm's
// default isolated installs. So the documented setup is simply the default
// config; no manual watchFolders / nodeModulesPaths needed.
// https://docs.expo.dev/guides/monorepos/
const { getDefaultConfig } = require('expo/metro-config');

module.exports = getDefaultConfig(__dirname);
