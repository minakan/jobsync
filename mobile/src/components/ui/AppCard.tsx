import { type PropsWithChildren } from 'react';
import { type StyleProp, StyleSheet, View, type ViewStyle } from 'react-native';

import { colors, radius, shadow } from '@/theme/tokens';

interface AppCardProps extends PropsWithChildren {
  style?: StyleProp<ViewStyle>;
}

export const AppCard = ({ children, style }: AppCardProps) => {
  return <View style={[styles.card, style]}>{children}</View>;
};

const styles = StyleSheet.create({
  card: {
    backgroundColor: colors.surface,
    borderColor: colors.border,
    borderRadius: radius.md,
    borderWidth: 1,
    padding: 14,
    gap: 8,
    ...shadow.card,
  },
});
