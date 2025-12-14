// babel.config.js
module.exports = function(api) {
  api.cache(true);
  return {
    presets: ['babel-preset-expo'],
    // ⬇️ 把下面這一行刪掉或是註解起來 //
    // plugins: ['react-native-reanimated/plugin'], 
  };
};