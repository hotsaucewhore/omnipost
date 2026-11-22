import { Ionicons } from '@expo/vector-icons';
import { useRouter } from 'expo-router';
import React, { useMemo, useState } from 'react';
import {
  Linking,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  useWindowDimensions,
  View,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import {
  AnalyticsTimeRange,
  createDefaultOverrides,
  formatCompactNumber,
  PLATFORM_SPECS,
  PostAnalyticsBreakdown,
} from '../../../shared/platforms';
import { AppHeader } from '../../components/AppHeader';
import { PLATFORM_ICONS } from '../../constants/theme';
import { useOmniPost } from '../../context/OmniPostContext';

type ChannelMetricKey = 'views' | 'engagements' | 'linkClicks';

export default function InsightsScreen() {
  const router = useRouter();
  const { width } = useWindowDimensions();
  const isDesktop = width >= 760;

  const {
    palette,
    activeWorkspace,
    analytics,
    analyticsRange,
    setAnalyticsRange,
    syncingAnalytics,
    syncAnalytics,
    jobs,
    setEditingJob,
    bioConfig,
    openBioModal,
  } = useOmniPost();

  const [channelMetric, setChannelMetric] =
    useState<ChannelMetricKey>('views');
  const [expandedJobId, setExpandedJobId] = useState<string | null>(null);

  const effectiveExpandedJobId =
    expandedJobId !== null
      ? expandedJobId
      : analytics.postBreakdowns[0]?.jobId ?? null;

  const sortedChannels = useMemo(() => {
    const list = [...analytics.byPlatform];
    list.sort((a, b) => b[channelMetric] - a[channelMetric]);
    return list;
  }, [analytics.byPlatform, channelMetric]);

  const maxChannelVal = useMemo(() => {
    if (sortedChannels.length === 0) return 1;
    return Math.max(1, sortedChannels[0][channelMetric]);
  }, [sortedChannels, channelMetric]);

  const formatShortDate = (iso: string) => {
    const d = new Date(iso);
    if (Number.isNaN(d.getTime())) return '';
    return d.toLocaleDateString([], {
      month: 'short',
      day: 'numeric',
    });
  };

  const handleReusePostSetup = (post: PostAnalyticsBreakdown) => {
    const sourceJob = jobs.find((j) => j.id === post.jobId);
    const overrides = createDefaultOverrides();
    if (sourceJob) {
      for (const key of Object.keys(overrides) as (keyof typeof overrides)[]) {
        overrides[key] = {
          ...overrides[key],
          enabled: Boolean(sourceJob.overrides[key]?.enabled),
          useCustomText: false,
        };
      }
    } else {
      for (const key of Object.keys(overrides) as (keyof typeof overrides)[]) {
        overrides[key].enabled = post.platforms.some(
          (p) => p.platformId === key
        );
      }
    }

    setEditingJob({
      id: '',
      workspaceId: activeWorkspace.id,
      createdAt: new Date().toISOString(),
      lifecycle: 'draft',
      video: null,
      photos: [],
      master: {
        title: '',
        caption: '',
        hashtags: sourceJob?.master.hashtags ?? '',
        firstComment: sourceJob?.master.firstComment ?? '',
      },
      overrides,
      results: {},
    });
    router.push('/');
  };

  const { totals, topPlatform } = analytics;

  return (
    <SafeAreaView
      edges={['top']}
      style={[styles.safe, { backgroundColor: palette.bg }]}
    >
      <AppHeader />

      <ScrollView contentContainerStyle={styles.scrollContent}>
        <View style={styles.container}>
          {/* Top Page Header */}
          <View style={styles.topHeader}>
            <View style={{ gap: 3, flexShrink: 1 }}>
              <View style={styles.eyebrowRow}>
                <View
                  style={[
                    styles.wsDot,
                    { backgroundColor: activeWorkspace.accentColor },
                  ]}
                />
                <Text
                  style={[styles.eyebrowText, { color: palette.textSecondary }]}
                >
                  {activeWorkspace.name}
                </Text>
              </View>
              <Text style={[styles.pageTitle, { color: palette.text }]}>
                Performance
              </Text>
              <Text
                style={[styles.pageSub, { color: palette.textSecondary }]}
              >
                Side-by-side reach, engagement, and reply-link clicks across
                every channel.
              </Text>
              {bioConfig && (
                <View
                  style={{
                    flexDirection: 'row',
                    alignItems: 'center',
                    flexWrap: 'wrap',
                    gap: 10,
                    marginTop: 6,
                  }}
                >
                  <Text
                    style={{
                      fontSize: 12,
                      color: palette.textSecondary,
                      fontWeight: '500',
                    }}
                  >
                    Link-in-Bio /u/{bioConfig.slug}:{' '}
                    <Text style={{ fontWeight: '700', color: palette.text }}>
                      {formatCompactNumber(bioConfig.totalViews)} views
                    </Text>{' '}
                    ·{' '}
                    <Text style={{ fontWeight: '700', color: palette.accent }}>
                      {formatCompactNumber(bioConfig.totalClicks)} attributed clicks
                    </Text>
                  </Text>
                  <Pressable onPress={openBioModal}>
                    <Text
                      style={{
                        fontSize: 12,
                        fontWeight: '600',
                        color: palette.text,
                        textDecorationLine: 'underline',
                      }}
                    >
                      Edit bio
                    </Text>
                  </Pressable>
                  <Pressable
                    onPress={() => router.push(`/u/${bioConfig.slug}` as any)}
                  >
                    <Text
                      style={{
                        fontSize: 12,
                        fontWeight: '600',
                        color: palette.textSecondary,
                        textDecorationLine: 'underline',
                      }}
                    >
                      Open /u/{bioConfig.slug} ↗
                    </Text>
                  </Pressable>
                </View>
              )}
            </View>

            <View style={styles.controlsCluster}>
              <View
                style={[
                  styles.rangeGroup,
                  {
                    backgroundColor: palette.surface,
                    borderColor: palette.border,
                  },
                ]}
              >
                {(
                  [
                    ['7d', '7 days'],
                    ['30d', '30 days'],
                    ['all', 'All time'],
                  ] as [AnalyticsTimeRange, string][]
                ).map(([val, label]) => {
                  const active = analyticsRange === val;
                  return (
                    <Pressable
                      key={val}
                      onPress={() => setAnalyticsRange(val)}
                      style={[
                        styles.rangeBtn,
                        active && { backgroundColor: palette.surfaceMuted },
                      ]}
                    >
                      <Text
                        style={[
                          styles.rangeBtnText,
                          {
                            color: active
                              ? palette.text
                              : palette.textSecondary,
                            fontWeight: active ? '600' : '400',
                          },
                        ]}
                      >
                        {label}
                      </Text>
                    </Pressable>
                  );
                })}
              </View>

              <Pressable
                disabled={syncingAnalytics}
                onPress={() => void syncAnalytics()}
                style={[
                  styles.syncBtn,
                  {
                    backgroundColor: palette.surface,
                    borderColor: palette.borderStrong,
                  },
                ]}
              >
                <Ionicons
                  name="refresh-outline"
                  size={14}
                  color={palette.text}
                />
                <Text style={[styles.syncBtnText, { color: palette.text }]}>
                  {syncingAnalytics ? 'Syncing...' : 'Sync stats'}
                </Text>
              </Pressable>
            </View>
          </View>

          {totals.publishedPosts === 0 ? (
            <View
              style={[
                styles.emptySheet,
                {
                  backgroundColor: palette.surface,
                  borderColor: palette.border,
                },
              ]}
            >
              <Ionicons
                name="bar-chart-outline"
                size={24}
                color={palette.textMuted}
              />
              <Text style={[styles.emptyTitle, { color: palette.text }]}>
                No published posts in this window yet
              </Text>
              <Text
                style={[styles.emptySub, { color: palette.textSecondary }]}
              >
                Publish a video, photo carousel, or text post in{' '}
                {activeWorkspace.name} to compare how it performs across each
                platform side-by-side.
              </Text>
              <Pressable
                onPress={() => router.push('/')}
                style={[
                  styles.emptyCta,
                  { backgroundColor: palette.text },
                ]}
              >
                <Text
                  style={[styles.emptyCtaText, { color: palette.surface }]}
                >
                  Write a post
                </Text>
              </Pressable>
            </View>
          ) : (
            <>
              {/* 1. Single-Sheet 4-Column Editorial Scorecard */}
              <View
                style={[
                  styles.scorecardSheet,
                  {
                    backgroundColor: palette.surface,
                    borderColor: palette.border,
                    flexDirection: isDesktop ? 'row' : 'column',
                  },
                ]}
              >
                <View
                  style={[
                    styles.scoreCell,
                    isDesktop
                      ? { borderRightWidth: 1, borderRightColor: palette.border }
                      : { borderBottomWidth: 1, borderBottomColor: palette.border },
                  ]}
                >
                  <Text
                    style={[
                      styles.scoreLabel,
                      { color: palette.textSecondary },
                    ]}
                  >
                    Views & impressions
                  </Text>
                  <Text style={[styles.scoreValue, { color: palette.text }]}>
                    {formatCompactNumber(totals.views)}
                  </Text>
                  <Text
                    style={[styles.scoreMeta, { color: palette.textMuted }]}
                  >
                    Across {totals.publishedPosts} published{' '}
                    {totals.publishedPosts === 1 ? 'post' : 'posts'}
                  </Text>
                </View>

                <View
                  style={[
                    styles.scoreCell,
                    isDesktop
                      ? { borderRightWidth: 1, borderRightColor: palette.border }
                      : { borderBottomWidth: 1, borderBottomColor: palette.border },
                  ]}
                >
                  <Text
                    style={[
                      styles.scoreLabel,
                      { color: palette.textSecondary },
                    ]}
                  >
                    Engagements
                  </Text>
                  <Text style={[styles.scoreValue, { color: palette.text }]}>
                    {formatCompactNumber(totals.engagements)}
                  </Text>
                  <Text
                    style={[styles.scoreMeta, { color: palette.textMuted }]}
                  >
                    {totals.avgEngagementRatePct}% average rate
                  </Text>
                </View>

                <View
                  style={[
                    styles.scoreCell,
                    isDesktop
                      ? { borderRightWidth: 1, borderRightColor: palette.border }
                      : { borderBottomWidth: 1, borderBottomColor: palette.border },
                  ]}
                >
                  <Text
                    style={[
                      styles.scoreLabel,
                      { color: palette.textSecondary },
                    ]}
                  >
                    Link & reply clicks
                  </Text>
                  <Text style={[styles.scoreValue, { color: palette.text }]}>
                    {formatCompactNumber(totals.linkClicks)}
                  </Text>
                  <Text
                    style={[styles.scoreMeta, { color: palette.textMuted }]}
                  >
                    Includes auto 1st-comment links
                  </Text>
                </View>

                <View style={styles.scoreCell}>
                  <Text
                    style={[
                      styles.scoreLabel,
                      { color: palette.textSecondary },
                    ]}
                  >
                    Strongest channel
                  </Text>
                  {topPlatform ? (
                    <>
                      <View style={styles.topPlatformRow}>
                        <Ionicons
                          name={PLATFORM_ICONS[topPlatform.platformId]}
                          size={18}
                          color={
                            PLATFORM_SPECS[topPlatform.platformId].brandColor
                          }
                        />
                        <Text
                          style={[
                            styles.scoreTopChannel,
                            { color: palette.text },
                          ]}
                          numberOfLines={1}
                        >
                          {PLATFORM_SPECS[topPlatform.platformId].shortName}
                        </Text>
                      </View>
                      <Text
                        style={[styles.scoreMeta, { color: palette.textMuted }]}
                      >
                        {topPlatform.shareOfViewsPct}% of reach ·{' '}
                        {topPlatform.engagementRatePct}% eng
                      </Text>
                    </>
                  ) : (
                    <Text style={[styles.scoreValue, { color: palette.text }]}>
                      —
                    </Text>
                  )}
                </View>
              </View>

              {/* 2. Channel Comparison Sheet */}
              <View
                style={[
                  styles.sectionSheet,
                  {
                    backgroundColor: palette.surface,
                    borderColor: palette.border,
                  },
                ]}
              >
                <View
                  style={[
                    styles.sheetHeader,
                    { borderBottomColor: palette.border },
                  ]}
                >
                  <View>
                    <Text style={[styles.sheetTitle, { color: palette.text }]}>
                      By channel
                    </Text>
                    <Text
                      style={[
                        styles.sheetSubtitle,
                        { color: palette.textSecondary },
                      ]}
                    >
                      Where your posts are getting traction right now
                    </Text>
                  </View>

                  <View
                    style={[
                      styles.metricToggleRow,
                      {
                        backgroundColor: palette.surfaceSubtle,
                        borderColor: palette.border,
                      },
                    ]}
                  >
                    {(
                      [
                        ['views', 'Views'],
                        ['engagements', 'Engagements'],
                        ['linkClicks', 'Clicks'],
                      ] as [ChannelMetricKey, string][]
                    ).map(([key, label]) => {
                      const active = channelMetric === key;
                      return (
                        <Pressable
                          key={key}
                          onPress={() => setChannelMetric(key)}
                          style={[
                            styles.metricPill,
                            active && { backgroundColor: palette.surface },
                          ]}
                        >
                          <Text
                            style={[
                              styles.metricPillText,
                              {
                                color: active
                                  ? palette.text
                                  : palette.textSecondary,
                                fontWeight: active ? '600' : '400',
                              },
                            ]}
                          >
                            {label}
                          </Text>
                        </Pressable>
                      );
                    })}
                  </View>
                </View>

                <View>
                  {sortedChannels.map((row, idx) => {
                    const spec = PLATFORM_SPECS[row.platformId];
                    const metricVal = row[channelMetric];
                    const pctWidth = Math.max(
                      4,
                      Math.round((metricVal / maxChannelVal) * 100)
                    );
                    const isLeader = idx === 0;

                    return (
                      <View
                        key={row.platformId}
                        style={[
                          styles.channelRow,
                          idx < sortedChannels.length - 1 && {
                            borderBottomWidth: 1,
                            borderBottomColor: palette.border,
                          },
                        ]}
                      >
                        <View style={styles.channelIdentity}>
                          <Ionicons
                            name={PLATFORM_ICONS[row.platformId]}
                            size={16}
                            color={spec.brandColor}
                          />
                          <View style={{ flex: 1 }}>
                            <Text
                              style={[
                                styles.channelName,
                                { color: palette.text },
                              ]}
                              numberOfLines={1}
                            >
                              {spec.shortName}
                            </Text>
                            <Text
                              style={[
                                styles.channelCount,
                                { color: palette.textMuted },
                              ]}
                            >
                              {row.postsCount}{' '}
                              {row.postsCount === 1 ? 'post' : 'posts'}
                            </Text>
                          </View>
                        </View>

                        <View style={styles.barTrackWrap}>
                          <View
                            style={[
                              styles.barTrack,
                              { backgroundColor: palette.surfaceMuted },
                            ]}
                          >
                            <View
                              style={[
                                styles.barFill,
                                {
                                  width: `${pctWidth}%`,
                                  backgroundColor: isLeader
                                    ? palette.text
                                    : palette.borderStrong,
                                },
                              ]}
                            />
                          </View>
                        </View>

                        <View style={styles.channelNumbers}>
                          <Text
                            style={[
                              styles.channelPrimaryNum,
                              { color: palette.text },
                            ]}
                          >
                            {formatCompactNumber(metricVal)}
                          </Text>
                          <Text
                            style={[
                              styles.channelSecondaryNum,
                              { color: palette.textMuted },
                            ]}
                          >
                            {channelMetric === 'views'
                              ? `${row.shareOfViewsPct}% share`
                              : `${row.engagementRatePct}% eng`}
                          </Text>
                        </View>
                      </View>
                    );
                  })}
                </View>
              </View>

              {/* 3. Post-by-Post Cross-Platform Breakdown */}
              <View style={{ gap: 12 }}>
                <View style={styles.postsSectionHead}>
                  <Text style={[styles.sectionHeading, { color: palette.text }]}>
                    Post comparisons
                  </Text>
                  <Text
                    style={[
                      styles.sectionSubheading,
                      { color: palette.textSecondary },
                    ]}
                  >
                    Compare how each cross-post landed across platforms
                  </Text>
                </View>

                {analytics.postBreakdowns.map((post) => {
                  const isExpanded = effectiveExpandedJobId === post.jobId;
                  const kindLabel =
                    post.postKind === 'video'
                      ? 'Video'
                      : post.postKind === 'photo'
                      ? 'Carousel'
                      : 'Text';
                  const winnerSpec = post.winningPlatformId
                    ? PLATFORM_SPECS[post.winningPlatformId]
                    : null;

                  return (
                    <View
                      key={post.jobId}
                      style={[
                        styles.postCard,
                        {
                          backgroundColor: palette.surface,
                          borderColor: palette.border,
                        },
                      ]}
                    >
                      <Pressable
                        onPress={() =>
                          setExpandedJobId(isExpanded ? '' : post.jobId)
                        }
                        style={styles.postSummaryRow}
                      >
                        <View style={styles.postSummaryLeft}>
                          <View style={styles.postMetaTop}>
                            <View
                              style={[
                                styles.kindPill,
                                {
                                  backgroundColor: palette.surfaceSubtle,
                                  borderColor: palette.border,
                                },
                              ]}
                            >
                              <Text
                                style={[
                                  styles.kindPillText,
                                  { color: palette.textSecondary },
                                ]}
                              >
                                {kindLabel}
                              </Text>
                            </View>
                            <Text
                              style={[
                                styles.postDateText,
                                { color: palette.textMuted },
                              ]}
                            >
                              {formatShortDate(post.createdAt)}
                            </Text>
                            <View style={styles.inlinePlatformIcons}>
                              {post.platforms.map((entry) => (
                                <Ionicons
                                  key={entry.platformId}
                                  name={PLATFORM_ICONS[entry.platformId]}
                                  size={13}
                                  color={
                                    PLATFORM_SPECS[entry.platformId].brandColor
                                  }
                                />
                              ))}
                            </View>
                          </View>

                          <Text
                            style={[
                              styles.postHeadline,
                              { color: palette.text },
                            ]}
                            numberOfLines={1}
                          >
                            {post.title}
                          </Text>
                        </View>

                        <View style={styles.postSummaryRight}>
                          <View style={{ alignItems: 'flex-end', gap: 2 }}>
                            <Text
                              style={[
                                styles.postTotalViews,
                                { color: palette.text },
                              ]}
                            >
                              {formatCompactNumber(post.totalViews)} views
                            </Text>
                            {winnerSpec && (
                              <Text
                                style={[
                                  styles.winnerNote,
                                  { color: palette.textSecondary },
                                ]}
                              >
                                Best on {winnerSpec.shortName} (
                                {formatCompactNumber(post.winningViews)})
                              </Text>
                            )}
                          </View>

                          <Ionicons
                            name={isExpanded ? 'chevron-up' : 'chevron-down'}
                            size={16}
                            color={palette.textSecondary}
                          />
                        </View>
                      </Pressable>

                      {isExpanded && (
                        <View
                          style={[
                            styles.expandedArea,
                            { borderTopColor: palette.border },
                          ]}
                        >
                          {post.captionPreview &&
                          post.captionPreview !== post.title ? (
                            <Text
                              style={[
                                styles.captionSnippet,
                                { color: palette.textSecondary },
                              ]}
                              numberOfLines={2}
                            >
                              {post.captionPreview}
                            </Text>
                          ) : null}

                          {/* Column headers on desktop */}
                          {isDesktop && (
                            <View
                              style={[
                                styles.tableHeadRow,
                                { borderBottomColor: palette.border },
                              ]}
                            >
                              <Text
                                style={[
                                  styles.thText,
                                  { color: palette.textMuted, flex: 1.5 },
                                ]}
                              >
                                Channel
                              </Text>
                              <Text
                                style={[
                                  styles.thText,
                                  styles.thNum,
                                  { color: palette.textMuted },
                                ]}
                              >
                                Views
                              </Text>
                              <Text
                                style={[
                                  styles.thText,
                                  styles.thNum,
                                  { color: palette.textMuted },
                                ]}
                              >
                                Likes
                              </Text>
                              <Text
                                style={[
                                  styles.thText,
                                  styles.thNum,
                                  { color: palette.textMuted },
                                ]}
                              >
                                Replies
                              </Text>
                              <Text
                                style={[
                                  styles.thText,
                                  styles.thNum,
                                  { color: palette.textMuted },
                                ]}
                              >
                                Reposts / Saves
                              </Text>
                              <Text
                                style={[
                                  styles.thText,
                                  styles.thNum,
                                  { color: palette.textMuted },
                                ]}
                              >
                                Clicks
                              </Text>
                              <View style={{ width: 26 }} />
                            </View>
                          )}

                          {post.platforms.map((entry, pIdx) => {
                            const spec = PLATFORM_SPECS[entry.platformId];
                            const m = entry.metrics;
                            const relPct =
                              post.winningViews > 0
                                ? Math.max(
                                    5,
                                    Math.round(
                                      (m.views / post.winningViews) * 100
                                    )
                                  )
                                : 10;

                            return (
                              <View
                                key={entry.platformId}
                                style={[
                                  styles.platformBreakdownRow,
                                  pIdx < post.platforms.length - 1 && {
                                    borderBottomWidth: 1,
                                    borderBottomColor: palette.border,
                                  },
                                ]}
                              >
                                <View style={styles.pChannelCell}>
                                  <View style={styles.pChannelTitleLine}>
                                    <Ionicons
                                      name={PLATFORM_ICONS[entry.platformId]}
                                      size={14}
                                      color={spec.brandColor}
                                    />
                                    <Text
                                      style={[
                                        styles.pChannelName,
                                        { color: palette.text },
                                      ]}
                                    >
                                      {spec.shortName}
                                    </Text>
                                    {entry.firstCommentPosted && (
                                      <View
                                        style={[
                                          styles.fcBadge,
                                          {
                                            backgroundColor:
                                              palette.surfaceSubtle,
                                            borderColor: palette.border,
                                          },
                                        ]}
                                      >
                                        <Text
                                          style={[
                                            styles.fcBadgeText,
                                            { color: palette.textSecondary },
                                          ]}
                                        >
                                          + 1st comment
                                        </Text>
                                      </View>
                                    )}
                                  </View>

                                  <View
                                    style={[
                                      styles.miniBarTrack,
                                      { backgroundColor: palette.surfaceMuted },
                                    ]}
                                  >
                                    <View
                                      style={[
                                        styles.miniBarFill,
                                        {
                                          width: `${relPct}%`,
                                          backgroundColor:
                                            pIdx === 0
                                              ? palette.text
                                              : palette.borderStrong,
                                        },
                                      ]}
                                    />
                                  </View>
                                </View>

                                {isDesktop ? (
                                  <>
                                    <Text
                                      style={[
                                        styles.tdNum,
                                        styles.tdBold,
                                        { color: palette.text },
                                      ]}
                                    >
                                      {formatCompactNumber(m.views)}
                                    </Text>
                                    <Text
                                      style={[
                                        styles.tdNum,
                                        { color: palette.textSecondary },
                                      ]}
                                    >
                                      {formatCompactNumber(m.likes)}
                                    </Text>
                                    <Text
                                      style={[
                                        styles.tdNum,
                                        { color: palette.textSecondary },
                                      ]}
                                    >
                                      {formatCompactNumber(m.comments)}
                                    </Text>
                                    <Text
                                      style={[
                                        styles.tdNum,
                                        { color: palette.textSecondary },
                                      ]}
                                    >
                                      {formatCompactNumber(m.shares + m.saves)}
                                    </Text>
                                    <Text
                                      style={[
                                        styles.tdNum,
                                        { color: palette.text },
                                      ]}
                                    >
                                      {formatCompactNumber(m.linkClicks)}
                                    </Text>
                                  </>
                                ) : (
                                  <View style={styles.mobileStatsWrap}>
                                    <Text
                                      style={[
                                        styles.mobileStatItem,
                                        { color: palette.text },
                                      ]}
                                    >
                                      {formatCompactNumber(m.views)} views
                                    </Text>
                                    <Text
                                      style={[
                                        styles.mobileStatItem,
                                        { color: palette.textSecondary },
                                      ]}
                                    >
                                      {formatCompactNumber(m.likes)} likes ·{' '}
                                      {formatCompactNumber(m.comments)} replies ·{' '}
                                      {formatCompactNumber(m.linkClicks)} clicks
                                    </Text>
                                  </View>
                                )}

                                <View style={{ width: 26, alignItems: 'flex-end' }}>
                                  {entry.externalUrl ? (
                                    <Pressable
                                      onPress={() =>
                                        void Linking.openURL(entry.externalUrl!)
                                      }
                                      accessibilityLabel={`Open ${spec.shortName} post`}
                                      style={{ padding: 4 }}
                                    >
                                      <Ionicons
                                        name="open-outline"
                                        size={14}
                                        color={palette.textMuted}
                                      />
                                    </Pressable>
                                  ) : null}
                                </View>
                              </View>
                            );
                          })}

                          <View
                            style={[
                              styles.postFooterBar,
                              {
                                backgroundColor: palette.surfaceSubtle,
                                borderTopColor: palette.border,
                              },
                            ]}
                          >
                            <Text
                              style={[
                                styles.postFooterMeta,
                                { color: palette.textSecondary },
                              ]}
                            >
                              {post.totalEngagements.toLocaleString()}{' '}
                              engagements · {post.avgEngagementRatePct}% rate ·{' '}
                              {post.totalLinkClicks.toLocaleString()} link clicks
                            </Text>

                            <Pressable
                              onPress={() => handleReusePostSetup(post)}
                              style={styles.reuseBtn}
                            >
                              <Text
                                style={[
                                  styles.reuseBtnText,
                                  { color: palette.text },
                                ]}
                              >
                                Write follow-up with this setup
                              </Text>
                              <Ionicons
                                name="arrow-forward"
                                size={13}
                                color={palette.text}
                              />
                            </Pressable>
                          </View>
                        </View>
                      )}
                    </View>
                  );
                })}
              </View>
            </>
          )}
        </View>
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safe: {
    flex: 1,
  },
  scrollContent: {
    paddingHorizontal: 20,
    paddingTop: 24,
    paddingBottom: 64,
  },
  container: {
    maxWidth: 960,
    width: '100%',
    alignSelf: 'center',
    gap: 22,
  },
  topHeader: {
    flexDirection: 'row',
    alignItems: 'flex-end',
    justifyContent: 'space-between',
    flexWrap: 'wrap',
    gap: 14,
  },
  eyebrowRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
  },
  wsDot: {
    width: 7,
    height: 7,
    borderRadius: 4,
  },
  eyebrowText: {
    fontSize: 12,
    fontWeight: '600',
  },
  pageTitle: {
    fontSize: 23,
    fontWeight: '700',
    letterSpacing: -0.5,
  },
  pageSub: {
    fontSize: 13.5,
  },
  controlsCluster: {
    flexDirection: 'row',
    alignItems: 'center',
    flexWrap: 'wrap',
    gap: 8,
  },
  rangeGroup: {
    flexDirection: 'row',
    alignItems: 'center',
    borderWidth: 1,
    borderRadius: 8,
    padding: 3,
    gap: 2,
  },
  rangeBtn: {
    paddingHorizontal: 10,
    paddingVertical: 5,
    borderRadius: 6,
  },
  rangeBtnText: {
    fontSize: 12.5,
  },
  syncBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    paddingHorizontal: 12,
    paddingVertical: 7.5,
    borderRadius: 8,
    borderWidth: 1,
  },
  syncBtnText: {
    fontSize: 12.5,
    fontWeight: '600',
  },
  emptySheet: {
    borderWidth: 1,
    borderRadius: 12,
    paddingVertical: 46,
    paddingHorizontal: 24,
    alignItems: 'center',
    gap: 8,
  },
  emptyTitle: {
    fontSize: 15.5,
    fontWeight: '600',
    marginTop: 4,
  },
  emptySub: {
    fontSize: 13.5,
    lineHeight: 20,
    textAlign: 'center',
    maxWidth: 420,
  },
  emptyCta: {
    marginTop: 8,
    paddingHorizontal: 16,
    paddingVertical: 9,
    borderRadius: 8,
  },
  emptyCtaText: {
    fontSize: 13,
    fontWeight: '600',
  },
  scorecardSheet: {
    borderWidth: 1,
    borderRadius: 12,
    overflow: 'hidden',
  },
  scoreCell: {
    flex: 1,
    paddingHorizontal: 18,
    paddingVertical: 16,
    gap: 4,
  },
  scoreLabel: {
    fontSize: 12,
    fontWeight: '500',
  },
  scoreValue: {
    fontSize: 25,
    fontWeight: '700',
    letterSpacing: -0.6,
  },
  topPlatformRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 7,
    paddingVertical: 2,
  },
  scoreTopChannel: {
    fontSize: 20,
    fontWeight: '700',
    letterSpacing: -0.4,
    flexShrink: 1,
  },
  scoreMeta: {
    fontSize: 12,
  },
  sectionSheet: {
    borderWidth: 1,
    borderRadius: 12,
    overflow: 'hidden',
  },
  sheetHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    flexWrap: 'wrap',
    paddingHorizontal: 18,
    paddingVertical: 14,
    borderBottomWidth: 1,
    gap: 10,
  },
  sheetTitle: {
    fontSize: 15,
    fontWeight: '700',
    letterSpacing: -0.2,
  },
  sheetSubtitle: {
    fontSize: 12.5,
    marginTop: 1,
  },
  metricToggleRow: {
    flexDirection: 'row',
    alignItems: 'center',
    borderWidth: 1,
    borderRadius: 7,
    padding: 2,
    gap: 2,
  },
  metricPill: {
    paddingHorizontal: 9,
    paddingVertical: 4,
    borderRadius: 5,
  },
  metricPillText: {
    fontSize: 12,
  },
  channelRow: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 18,
    paddingVertical: 12,
    gap: 14,
  },
  channelIdentity: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 9,
    width: 140,
  },
  channelName: {
    fontSize: 13.5,
    fontWeight: '600',
  },
  channelCount: {
    fontSize: 11.5,
  },
  barTrackWrap: {
    flex: 1,
  },
  barTrack: {
    height: 7,
    borderRadius: 4,
    overflow: 'hidden',
    width: '100%',
  },
  barFill: {
    height: '100%',
    borderRadius: 4,
  },
  channelNumbers: {
    width: 86,
    alignItems: 'flex-end',
  },
  channelPrimaryNum: {
    fontSize: 13.5,
    fontWeight: '700',
  },
  channelSecondaryNum: {
    fontSize: 11.5,
  },
  postsSectionHead: {
    gap: 2,
    paddingTop: 2,
  },
  sectionHeading: {
    fontSize: 16,
    fontWeight: '700',
    letterSpacing: -0.3,
  },
  sectionSubheading: {
    fontSize: 13,
  },
  postCard: {
    borderWidth: 1,
    borderRadius: 12,
    overflow: 'hidden',
  },
  postSummaryRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 18,
    paddingVertical: 14,
    gap: 12,
  },
  postSummaryLeft: {
    flex: 1,
    gap: 5,
  },
  postMetaTop: {
    flexDirection: 'row',
    alignItems: 'center',
    flexWrap: 'wrap',
    gap: 8,
  },
  kindPill: {
    paddingHorizontal: 7,
    paddingVertical: 2,
    borderRadius: 5,
    borderWidth: 1,
  },
  kindPillText: {
    fontSize: 11,
    fontWeight: '600',
  },
  postDateText: {
    fontSize: 12,
  },
  inlinePlatformIcons: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 5,
  },
  postHeadline: {
    fontSize: 14.5,
    fontWeight: '600',
  },
  postSummaryRight: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
  },
  postTotalViews: {
    fontSize: 14,
    fontWeight: '700',
  },
  winnerNote: {
    fontSize: 11.5,
  },
  expandedArea: {
    borderTopWidth: 1,
  },
  captionSnippet: {
    paddingHorizontal: 18,
    paddingTop: 12,
    paddingBottom: 6,
    fontSize: 13,
    lineHeight: 19,
  },
  tableHeadRow: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 18,
    paddingVertical: 9,
    borderBottomWidth: 1,
    gap: 8,
  },
  thText: {
    fontSize: 11.5,
    fontWeight: '600',
  },
  thNum: {
    width: 82,
    textAlign: 'right',
  },
  platformBreakdownRow: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 18,
    paddingVertical: 11,
    gap: 8,
  },
  pChannelCell: {
    flex: 1.5,
    gap: 6,
    paddingRight: 8,
  },
  pChannelTitleLine: {
    flexDirection: 'row',
    alignItems: 'center',
    flexWrap: 'wrap',
    gap: 7,
  },
  pChannelName: {
    fontSize: 13,
    fontWeight: '600',
  },
  fcBadge: {
    paddingHorizontal: 6,
    paddingVertical: 1.5,
    borderRadius: 4,
    borderWidth: 1,
  },
  fcBadgeText: {
    fontSize: 10.5,
    fontWeight: '500',
  },
  miniBarTrack: {
    height: 4,
    borderRadius: 2,
    overflow: 'hidden',
    maxWidth: 210,
  },
  miniBarFill: {
    height: '100%',
    borderRadius: 2,
  },
  tdNum: {
    width: 82,
    textAlign: 'right',
    fontSize: 13,
  },
  tdBold: {
    fontWeight: '600',
  },
  mobileStatsWrap: {
    alignItems: 'flex-end',
    gap: 2,
  },
  mobileStatItem: {
    fontSize: 12,
  },
  postFooterBar: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    flexWrap: 'wrap',
    paddingHorizontal: 18,
    paddingVertical: 11,
    borderTopWidth: 1,
    gap: 10,
  },
  postFooterMeta: {
    fontSize: 12,
  },
  reuseBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 5,
    paddingVertical: 2,
  },
  reuseBtnText: {
    fontSize: 12.5,
    fontWeight: '600',
  },
});
