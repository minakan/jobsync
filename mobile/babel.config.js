module.exports = function (api) {
  api.cache(true);

  return {
    presets: ['babel-preset-expo'],
    plugins: [
      // expo-router/babel は expo-router v6 で廃止・削除された
      // react-native-reanimated/plugin は必ず最後に置く
      'react-native-reanimated/plugin',
    ],
  };
};
