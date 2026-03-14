import { ActivityIndicator, Pressable, StyleSheet, Text, type StyleProp, type TextStyle, type ViewStyle } from 'react-native';

import { colors, radius, shadow } from '@/theme/tokens';

type ButtonVariant = 'primary' | 'secondary' | 'danger' | 'ghost';

interface AppButtonProps {
  label: string;
  onPress: () => void;
  variant?: ButtonVariant;
  disabled?: boolean;
  loading?: boolean;
  style?: StyleProp<ViewStyle>;
  textStyle?: StyleProp<TextStyle>;
  compact?: boolean;
}

const variantStyleMap: Record<ButtonVariant, ViewStyle> = {
  primary: {
    backgroundColor: colors.primary,
    borderColor: colors.primary,
    borderWidth: 1,
    ...shadow.card,
  },
  secondary: {
    backgroundColor: colors.surface,
    borderColor: colors.borderStrong,
    borderWidth: 1,
  },
  danger: {
    backgroundColor: colors.dangerSoft,
    borderColor: colors.dangerBorder,
    borderWidth: 1,
  },
  ghost: {
    backgroundColor: 'transparent',
    borderColor: 'transparent',
    borderWidth: 1,
  },
};

const variantTextStyleMap: Record<ButtonVariant, TextStyle> = {
  primary: {
    color: '#FFFFFF',
  },
  secondary: {
    color: colors.subtext,
  },
  danger: {
    color: colors.danger,
  },
  ghost: {
    color: colors.primaryStrong,
  },
};

const loadingColorMap: Record<ButtonVariant, string> = {
  primary: '#FFFFFF',
  secondary: colors.primary,
  danger: colors.danger,
  ghost: colors.primary,
};

export const AppButton = ({
  label,
  onPress,
  variant = 'primary',
  disabled = false,
  loading = false,
  style,
  textStyle,
  compact = false,
}: AppButtonProps) => {
  return (
    <Pressable
      style={({ pressed }) => [
        styles.base,
        variantStyleMap[variant],
        compact && styles.compact,
        (pressed || loading) && styles.pressed,
        (disabled || loading) && styles.disabled,
        style,
      ]}
      onPress={onPress}
      disabled={disabled || loading}
    >
      {loading ? (
        <ActivityIndicator color={loadingColorMap[variant]} size="small" />
      ) : (
        <Text style={[styles.label, variantTextStyleMap[variant], textStyle]}>{label}</Text>
      )}
    </Pressable>
  );
};

const styles = StyleSheet.create({
  base: {
    minHeight: 50,
    borderRadius: radius.sm,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 14,
    paddingVertical: 12,
  },
  compact: {
    minHeight: 40,
    paddingVertical: 8,
  },
  label: {
    fontSize: 14,
    fontWeight: '700',
  },
  pressed: {
    opacity: 0.9,
    transform: [{ scale: 0.99 }],
  },
  disabled: {
    opacity: 0.6,
  },
});
