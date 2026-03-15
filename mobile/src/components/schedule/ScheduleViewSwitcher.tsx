import { Pressable, StyleSheet, Text, View } from 'react-native';

import { type ScheduleViewMode } from '@/utils/scheduleCalendar';
import { colors, radius } from '@/theme/tokens';

interface ScheduleViewSwitcherProps {
  value: ScheduleViewMode;
  onChange: (next: ScheduleViewMode) => void;
}

const VIEW_OPTIONS: Array<{ value: ScheduleViewMode; label: string }> = [
  { value: 'list', label: '一覧' },
  { value: 'day', label: '日' },
  { value: 'week', label: '週' },
  { value: 'month', label: '月' },
];

export const ScheduleViewSwitcher = ({ value, onChange }: ScheduleViewSwitcherProps) => {
  return (
    <View style={styles.switcherWrap}>
      {VIEW_OPTIONS.map((option) => {
        const isSelected = option.value === value;

        return (
          <Pressable
            key={option.value}
            style={[styles.option, isSelected && styles.optionSelected]}
            onPress={() => onChange(option.value)}
          >
            <Text style={[styles.optionLabel, isSelected && styles.optionLabelSelected]}>{option.label}</Text>
          </Pressable>
        );
      })}
    </View>
  );
};

const styles = StyleSheet.create({
  switcherWrap: {
    borderRadius: radius.round,
    padding: 4,
    borderWidth: 1,
    borderColor: colors.border,
    backgroundColor: colors.surfaceMuted,
    flexDirection: 'row',
    gap: 6,
  },
  option: {
    flex: 1,
    minHeight: 34,
    borderRadius: radius.round,
    alignItems: 'center',
    justifyContent: 'center',
  },
  optionSelected: {
    backgroundColor: colors.primarySoft,
    borderWidth: 1,
    borderColor: colors.primaryBorder,
  },
  optionLabel: {
    color: colors.subtext,
    fontSize: 13,
    fontWeight: '700',
  },
  optionLabelSelected: {
    color: colors.primaryStrong,
  },
});
