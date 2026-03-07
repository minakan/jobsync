import { useEffect, useMemo, useState } from 'react';
import { differenceInDays, differenceInHours, isSameDay, isValid, parseISO } from 'date-fns';
import { StyleSheet, Text } from 'react-native';

interface CountdownTimerProps {
  scheduledAt: string;
}

const COLORS = {
  normal: '#10B981',
  warning: '#F59E0B',
  urgent: '#EF4444',
};

export const CountdownTimer = ({ scheduledAt }: CountdownTimerProps) => {
  const [now, setNow] = useState<Date>(new Date());

  useEffect(() => {
    const intervalId = setInterval(() => {
      setNow(new Date());
    }, 60000);

    return () => {
      clearInterval(intervalId);
    };
  }, []);

  const content = useMemo(() => {
    const targetDate = parseISO(scheduledAt);

    if (!isValid(targetDate)) {
      return { text: '日時不明', color: COLORS.urgent };
    }

    const totalHours = differenceInHours(targetDate, now);

    if (totalHours < 0) {
      return { text: '期限切れ', color: COLORS.urgent };
    }

    const days = differenceInDays(targetDate, now);

    if (isSameDay(targetDate, now)) {
      return {
        text: `残り${Math.max(totalHours, 0)}時間`,
        color: COLORS.urgent,
      };
    }

    if (days <= 3) {
      const remainderHours = Math.max(totalHours - days * 24, 0);
      return {
        text: `残り${days}日${remainderHours}時間`,
        color: COLORS.warning,
      };
    }

    return {
      text: `残り${days}日`,
      color: COLORS.normal,
    };
  }, [now, scheduledAt]);

  return <Text style={[styles.timerText, { color: content.color }]}>{content.text}</Text>;
};

const styles = StyleSheet.create({
  timerText: {
    fontSize: 12,
    fontWeight: '700',
  },
});
