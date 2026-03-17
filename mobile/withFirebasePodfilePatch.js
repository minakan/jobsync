const { withDangerousMod } = require('@expo/config-plugins');
const fs = require('fs');
const path = require('path');

/**
 * Config plugin that patches the generated Podfile to allow
 * @react-native-firebase to include non-modular React headers
 * when building with useFrameworks: static + New Architecture.
 */
module.exports = (config) => {
  return withDangerousMod(config, [
    'ios',
    async (config) => {
      const podfilePath = path.join(
        config.modRequest.platformProjectRoot,
        'Podfile'
      );
      let contents = fs.readFileSync(podfilePath, 'utf-8');

      const patch = `
  # Fix: @react-native-firebase non-modular header inside framework module
  # when useFrameworks: static + New Architecture are both enabled.
  installer.pods_project.targets.each do |target|
    if target.name.start_with?('RNFB')
      target.build_configurations.each do |cfg|
        cfg.build_settings['CLANG_ALLOW_NON_MODULAR_INCLUDES_IN_FRAMEWORK_MODULES'] = 'YES'
      end
    end
  end
`;

      if (contents.includes('CLANG_ALLOW_NON_MODULAR_INCLUDES_IN_FRAMEWORK_MODULES')) {
        // Already patched
        return config;
      }

      contents = contents.replace(
        'post_install do |installer|',
        `post_install do |installer|\n${patch}`
      );

      fs.writeFileSync(podfilePath, contents);
      return config;
    },
  ]);
};
