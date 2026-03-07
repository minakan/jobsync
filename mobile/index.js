/**
 * カスタムエントリーポイント
 *
 * Expo Go で React Native の New Architecture を使う際、
 * "disableEventLoopOnBridgeless" ネイティブモジュールが
 * 初期化前にアクセスされる既知の問題を抑制する。
 * この警告は致命的ではないが、dev overlay がクラッシュ扱いする。
 */

// expo-router/entry をロードする前に console.error をパッチする
const _originalError = console.error.bind(console);
console.error = function (msg, ...args) {
  if (
    typeof msg === 'string' &&
    (msg.includes('disableEventLoopOnBridgeless') ||
      msg.includes('native module method was not available'))
  ) {
    // Expo Go で New Architecture 初期化中に発生する既知の無害な警告
    return;
  }
  _originalError(msg, ...args);
};

// アプリをロード
require('expo-router/entry');
