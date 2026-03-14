import { StyleSheet, Text, View } from 'react-native';

import { colors, typography } from '@/theme/tokens';

interface SectionHeaderProps {
  title: string;
  subtitle?: string;
}

export const SectionHeader = ({ title, subtitle }: SectionHeaderProps) => {
  return (
    <View style={styles.container}>
      <Text style={styles.title}>{title}</Text>
      {subtitle ? <Text style={styles.subtitle}>{subtitle}</Text> : null}
    </View>
  );
};

const styles = StyleSheet.create({
  container: {
    gap: 2,
  },
  title: {
    color: colors.text,
    fontSize: typography.section,
    fontWeight: '800',
  },
  subtitle: {
    color: colors.muted,
    fontSize: typography.caption,
    fontWeight: '500',
  },
});
