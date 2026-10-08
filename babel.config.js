module.exports = function (api) {
  api.cache(true);
  return {
    presets: ['babel-preset-expo'],
    plugins: [
      // Must remain last in the plugins array (Reanimated requirement).
      'react-native-reanimated/plugin',
    ],
  };
};
