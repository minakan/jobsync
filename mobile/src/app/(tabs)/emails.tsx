import { useEffect, useMemo } from 'react';
import {
  ActivityIndicator,
  Alert,
  FlatList,
  SafeAreaView,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import { useQuery } from '@tanstack/react-query';
import { format, isValid, parseISO } from 'date-fns';

import { emailQueryKeys, fetchEmails } from '../../api/emails';
import { AppCard } from '@/components/ui/AppCard';
import { EmptyState } from '@/components/ui/EmptyState';
import { SectionHeader } from '@/components/ui/SectionHeader';
import { type EmailListItem } from '../../types/email';
import { colors, radius, spacing } from '@/theme/tokens';

const DEFAULT_LIMIT = 50;
const DEFAULT_OFFSET = 0;

const getErrorMessage = (error: unknown): string => {
  if (error instanceof Error && error.message.length > 0) {
    return error.message;
  }

  return '通信に失敗しました。時間をおいて再試行してください。';
};

const formatReceivedAt = (receivedAt: string | null): string => {
  if (!receivedAt) {
    return '日時不明';
  }

  const parsed = parseISO(receivedAt);
  if (!isValid(parsed)) {
    return '日時不明';
  }

  return format(parsed, 'M月d日 HH:mm');
};

const senderLabelFor = (item: EmailListItem): string => {
  if (item.sender.length > 0) {
    return item.sender;
  }

  if (item.sender_email.length > 0) {
    return item.sender_email;
  }

  return '送信者不明';
};

const subjectLabelFor = (item: EmailListItem): string => {
  if (item.subject.length > 0) {
    return item.subject;
  }

  return '(件名なし)';
};

export default function EmailsScreen() {
  const emailsQuery = useQuery({
    queryKey: emailQueryKeys.list({ limit: DEFAULT_LIMIT, offset: DEFAULT_OFFSET }),
    queryFn: () => fetchEmails({ limit: DEFAULT_LIMIT, offset: DEFAULT_OFFSET }),
  });

  useEffect(() => {
    if (emailsQuery.isError) {
      Alert.alert('メール取得エラー', getErrorMessage(emailsQuery.error));
    }
  }, [emailsQuery.error, emailsQuery.isError]);

  const emails = useMemo<EmailListItem[]>(() => {
    return emailsQuery.data?.items ?? [];
  }, [emailsQuery.data]);

  const handleRefresh = async (): Promise<void> => {
    await emailsQuery.refetch();
  };

  const renderEmailItem = ({ item }: { item: EmailListItem }) => {
    return (
      <AppCard>
        <View style={styles.cardHeader}>
          <Text style={styles.subject} numberOfLines={1}>
            {subjectLabelFor(item)}
          </Text>
          {item.company_name ? (
            <View style={styles.companyBadge}>
              <Text style={styles.companyBadgeText} numberOfLines={1}>
                {item.company_name}
              </Text>
            </View>
          ) : null}
        </View>
        <Text style={styles.sender} numberOfLines={1}>
          {senderLabelFor(item)}
        </Text>
        <Text style={styles.receivedAt}>{formatReceivedAt(item.received_at)}</Text>
      </AppCard>
    );
  };

  return (
    <SafeAreaView style={styles.safeArea}>
      {emailsQuery.isLoading ? (
        <View style={styles.centered}>
          <ActivityIndicator size="large" color={colors.primary} />
          <Text style={styles.loadingText}>メールを読み込み中...</Text>
        </View>
      ) : (
        <FlatList
          data={emails}
          keyExtractor={(item) => item.id}
          renderItem={renderEmailItem}
          contentContainerStyle={styles.listContent}
          onRefresh={handleRefresh}
          refreshing={emailsQuery.isRefetching}
          ItemSeparatorComponent={() => <View style={styles.listGap} />}
          ListHeaderComponent={
            <View style={styles.headerWrap}>
              <SectionHeader title="受信メール" subtitle="解析済みメール一覧" />
            </View>
          }
          ListEmptyComponent={
            <AppCard>
              <EmptyState
                title="メールがありません"
                description="Gmail転送設定後、解析されたメールがここに表示されます。"
              />
            </AppCard>
          }
        />
      )}
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safeArea: {
    flex: 1,
    backgroundColor: colors.background,
  },
  centered: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    gap: 10,
  },
  loadingText: {
    color: colors.subtext,
    fontSize: 14,
    fontWeight: '600',
  },
  listContent: {
    flexGrow: 1,
    paddingHorizontal: spacing.lg,
    paddingTop: spacing.md,
    paddingBottom: 24,
  },
  headerWrap: {
    marginBottom: 10,
  },
  listGap: {
    height: 10,
  },
  cardHeader: {
    alignItems: 'flex-start',
    flexDirection: 'row',
    gap: 8,
  },
  subject: {
    color: colors.text,
    flex: 1,
    fontSize: 16,
    fontWeight: '700',
  },
  sender: {
    color: colors.subtext,
    fontSize: 14,
    fontWeight: '600',
  },
  receivedAt: {
    color: colors.muted,
    fontSize: 13,
    fontWeight: '500',
  },
  companyBadge: {
    backgroundColor: colors.primarySoft,
    borderColor: colors.primaryBorder,
    borderRadius: radius.round,
    borderWidth: 1,
    maxWidth: 160,
    paddingHorizontal: 10,
    paddingVertical: 4,
  },
  companyBadgeText: {
    color: colors.primaryStrong,
    fontSize: 12,
    fontWeight: '700',
  },
});
