const { withDangerousMod } = require('@expo/config-plugins');
const fs = require('fs');
const path = require('path');

/**
 * Config plugin that patches the generated Podfile to fix
 * @react-native-firebase compilation errors when using
 * useFrameworks: static + New Architecture.
 *
 * Root cause: with use_frameworks! :linkage => :static, all pods become
 * framework modules. RNFB pods include React Native headers in a way that
 * Clang's strict module system rejects. Fix: tell Xcode NOT to treat RNFB
 * pods as modules (DEFINES_MODULE = NO) so they compile as plain static libs.
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

      // Guard: skip if already patched
      if (contents.includes('# RNFB_PATCH_APPLIED')) {
        return config;
      }

      const patch = `
  # RNFB_PATCH_APPLIED
  # Fix: @react-native-firebase with useFrameworks:static + New Architecture.
  # DEFINES_MODULE=NO: prevents RNFB pods from being framework modules,
  # allowing them to include React Native headers without strict module checks.
  installer.pods_project.targets.each do |target|
    if target.name.start_with?('RNFB')
      target.build_configurations.each do |cfg|
        cfg.build_settings['DEFINES_MODULE'] = 'NO'
        cfg.build_settings['CLANG_ALLOW_NON_MODULAR_INCLUDES_IN_FRAMEWORK_MODULES'] = 'YES'
      end
    end
  end
`;

      contents = contents.replace(
        'post_install do |installer|',
        `post_install do |installer|\n${patch}`
      );

      fs.writeFileSync(podfilePath, contents);
      return config;
    },
  ]);
};
