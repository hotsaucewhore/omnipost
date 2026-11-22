import { Ionicons } from '@expo/vector-icons';
import { useRouter } from 'expo-router';
import React, { useMemo, useState } from 'react';
import {
  Linking,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import {
  formatCompactNumber,
  formatDuration,
  formatScheduleLabel,
  PLATFORM_ORDER,
  PLATFORM_SPECS,
  PlatformId,
  PublishJob,
  summarizeVideoEdits,
} from '../../../shared/platforms';
import { AppHeader } from '../../components/AppHeader';
import { ContentCalendar } from '../../components/ContentCalendar';
import { PLATFORM_ICONS } from '../../constants/theme';
import { PostsTabFilter, useOmniPost } from '../../context/OmniPostContext';

export default function QueueAndHistoryScreen() {
  const router = useRouter();
  const {
    palette,
    activeWorkspace,
    effectiveRole,
    openBatchModal,
    openTeamModal,
    jobs,
    preferredPostsFilter,
    setPreferredPostsFilter,
    setEditingJob,
    publishScheduledNow,
    deleteJob,
    retryPlatform,
    shareJobForApproval,
    submitTeamApproval,
    toggleEvergreen,
    fillEvergreenSlots,
  } = useOmniPost();

  const [copiedJobId, setCopiedJobId] = useState<string | null>(null);
  const [evergreenNotice, setEvergreenNotice] = useState<string | null>(null);

  const handleShareReviewLink = async (job: PublishJob) => {
    const token =
      job.approval?.shareToken || (await shareJobForApproval(job.id));
    if (!token) return;
    const origin =
      Platform.OS === 'web' && typeof window !== 'undefined'
        ? window.location.origin
        : 'http://localhost:8081';
    const fullUrl = `${origin}/review/${token}`;
    if (
      Platform.OS === 'web' &&
      typeof navigator !== 'undefined' &&
      navigator.clipboard?.writeText
    ) {
      try {
        await navigator.clipboard.writeText(fullUrl);
      } catch {
        // Ignore clipboard permission errors
      }
    }
    setCopiedJobId(job.id);
    setTimeout(() => {
      setCopiedJobId((prev) => (prev === job.id ? null : prev));
    }, 2400);
  };

  const renderApprovalStrip = (job: PublishJob) => {
    const gatedWithoutToken =
      !job.approval &&
      job.lifecycle === 'scheduled' &&
      (Boolean(activeWorkspace.requireApproval) ||
        job.createdByRole === 'editor');
    if (!job.approval && !gatedWithoutToken) return null;

    const status = job.approval?.status ?? 'pending';
    const reviewerName = job.approval?.reviewerName;
    const comments = job.approval?.comments ?? [];
    const shareToken = job.approval?.shareToken;
    const latestNote = comments[comments.length - 1]?.body;
    const isHeld =
      job.lifecycle === 'scheduled' &&
      status !== 'approved' &&
      (Boolean(activeWorkspace.requireApproval) ||
        job.createdByRole === 'editor' ||
        status === 'changes_requested');

    const statusColor =
      status === 'approved'
        ? palette.success
        : status === 'changes_requested' || isHeld
        ? palette.warning
        : palette.textSecondary;

    return (
      <View
        style={{
          flexDirection: 'row',
          alignItems: 'center',
          justifyContent: 'space-between',
          flexWrap: 'wrap',
          gap: 10,
          paddingHorizontal: 18,
          paddingVertical: 9,
          borderTopWidth: 1,
          borderTopColor: palette.border,
          backgroundColor: palette.surfaceSubtle,
        }}
      >
        <Text
          style={{
            flex: 1,
            minWidth: 180,
            fontSize: 12,
            color: statusColor,
            fontWeight: '600',
          }}
          numberOfLines={1}
        >
          {status === 'approved'
            ? `✓ Approved${reviewerName ? ` by ${reviewerName}` : ''}${
                latestNote ? ` · "${latestNote}"` : ''
              }`
            : status === 'changes_requested'
            ? `Held · Changes requested${
                reviewerName ? ` by ${reviewerName}` : ''
              }${latestNote ? `: "${latestNote}"` : ''}`
            : isHeld
            ? 'Held · Paused until team or client sign-off'
            : 'Awaiting client sign-off'}
        </Text>

        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 10 }}>
          {status !== 'approved' && effectiveRole !== 'editor' && (
            <Pressable
              onPress={() => void submitTeamApproval(job.id, 'approved')}
              style={{
                paddingHorizontal: 10,
                paddingVertical: 4,
                borderRadius: 6,
                backgroundColor: palette.ctaBg,
              }}
            >
              <Text
                style={{
                  fontSize: 11.5,
                  fontWeight: '600',
                  color: palette.ctaText,
                }}
              >
                Approve ✓
              </Text>
            </Pressable>
          )}

          {shareToken && (
            <Pressable
              onPress={() => router.push(`/review/${shareToken}` as any)}
              style={{ flexDirection: 'row', alignItems: 'center', gap: 4 }}
            >
              <Text
                style={{
                  fontSize: 12,
                  fontWeight: '600',
                  color: palette.text,
                  textDecorationLine: 'underline',
                }}
              >
                Open client view ↗
              </Text>
            </Pressable>
          )}
        </View>
      </View>
    );
  };

  const upcomingJobs = useMemo(
    () =>
      jobs
        .filter((j) => j.lifecycle === 'scheduled')
        .sort((a, b) =>
          (a.scheduledAt ?? '').localeCompare(b.scheduledAt ?? '')
        ),
    [jobs]
  );

  const draftJobs = useMemo(
    () => jobs.filter((j) => j.lifecycle === 'draft'),
    [jobs]
  );

  const publishedJobs = useMemo(
    () => jobs.filter((j) => (j.lifecycle ?? 'active') === 'active'),
    [jobs]
  );

  // Build 7-day cadence strip for Upcoming Queue
  const weekDays = useMemo(() => {
    const out: {
      key: string;
      dayName: string;
      dayNum: number;
      count: number;
    }[] = [];
    const base = new Date();
    for (let i = 0; i < 7; i++) {
      const d = new Date(base);
      d.setDate(base.getDate() + i);
      const count = upcomingJobs.filter((j) => {
        if (!j.scheduledAt) return false;
        const sd = new Date(j.scheduledAt);
        return (
          sd.getFullYear() === d.getFullYear() &&
          sd.getMonth() === d.getMonth() &&
          sd.getDate() === d.getDate()
        );
      }).length;
      out.push({
        key: `${d.getFullYear()}-${d.getMonth()}-${d.getDate()}`,
        dayName:
          i === 0
            ? 'Today'
            : d.toLocaleDateString([], { weekday: 'short' }),
        dayNum: d.getDate(),
        count,
      });
    }
    return out;
  }, [upcomingJobs]);

  const handleOpenInComposer = (job: PublishJob) => {
    setEditingJob(job);
    router.push('/');
  };

  const renderPlatformIconsInline = (job: PublishJob) => {
    const enabled = PLATFORM_ORDER.filter((id) => job.overrides[id]?.enabled);
    return (
      <View style={styles.inlineIconsRow}>
        {enabled.map((id) => (
          <Ionicons
            key={id}
            name={PLATFORM_ICONS[id]}
            size={14}
            color={PLATFORM_SPECS[id].brandColor}
          />
        ))}
      </View>
    );
  };

  const renderUpcomingTab = () => (
    <View style={{ gap: 16 }}>
      {/* Calm 7-Day Cadence Strip */}
      <View
        style={[
          styles.weekStrip,
          {
            backgroundColor: palette.surface,
            borderColor: palette.border,
          },
        ]}
      >
        {weekDays.map((day, idx) => (
          <View
            key={day.key}
            style={[
              styles.weekCell,
              idx > 0 && {
                borderLeftWidth: 1,
                borderLeftColor: palette.border,
              },
            ]}
          >
            <Text style={[styles.weekDayName, { color: palette.textMuted }]}>
              {day.dayName}
            </Text>
            <Text style={[styles.weekDayNum, { color: palette.text }]}>
              {day.dayNum}
            </Text>
            <Text
              style={[
                styles.weekCount,
                {
                  color:
                    day.count > 0 ? palette.accent : palette.textMuted,
                  fontWeight: day.count > 0 ? '600' : '400',
                },
              ]}
            >
              {day.count > 0 ? `${day.count} queued` : '—'}
            </Text>
          </View>
        ))}
      </View>

      {upcomingJobs.length === 0 ? (
        <View
          style={[
            styles.emptySheet,
            {
              backgroundColor: palette.surface,
              borderColor: palette.border,
            },
          ]}
        >
          <Text style={[styles.emptyTitle, { color: palette.text }]}>
            Nothing scheduled yet
          </Text>
          <Text style={[styles.emptySub, { color: palette.textSecondary }]}>
            Pick a date & time using the Schedule button in the composer to line up your week.
          </Text>
        </View>
      ) : (
        upcomingJobs.map((job) => {
          const editSummary = job.video ? summarizeVideoEdits(job.video) : [];
          return (
            <View
              key={job.id}
              style={[
                styles.jobSheet,
                {
                  backgroundColor: palette.surface,
                  borderColor: palette.border,
                },
              ]}
            >
              <View
                style={[
                  styles.scheduledTopBar,
                  {
                    backgroundColor: palette.surfaceSubtle,
                    borderBottomColor: palette.border,
                  },
                ]}
              >
                <View style={styles.scheduledBadgeRow}>
                  <Ionicons
                    name="calendar-outline"
                    size={14}
                    color={palette.accent}
                  />
                  <Text
                    style={[styles.scheduledTimeLabel, { color: palette.text }]}
                  >
                    {formatScheduleLabel(job.scheduledAt)}
                  </Text>
                </View>

                {renderPlatformIconsInline(job)}
              </View>

              <View style={styles.queueCardBody}>
                <View style={{ flex: 1, gap: 4 }}>
                  <Text
                    style={[styles.jobTitle, { color: palette.text }]}
                    numberOfLines={1}
                  >
                    {job.master.title ||
                      job.master.caption ||
                      job.video?.fileName ||
                      'Scheduled post'}
                  </Text>
                  <Text
                    style={[styles.jobMeta, { color: palette.textSecondary }]}
                    numberOfLines={2}
                  >
                    {job.video
                      ? `${job.video.fileName} · ${formatDuration(job.video.durationSec)}${
                          editSummary.length > 0
                            ? ` · ${editSummary.join(' · ')}`
                            : ''
                        }`
                      : job.photos?.length
                      ? `${job.photos.length} photo${
                          job.photos.length > 1 ? 's (carousel)' : ''
                        }`
                      : 'Text post'}
                  </Text>
                </View>

                <View style={styles.cardActionRow}>
                  <Pressable
                    onPress={() =>
                      void toggleEvergreen(job.id, !job.isEvergreen)
                    }
                    style={[
                      styles.outlineBtn,
                      {
                        borderColor: job.isEvergreen
                          ? palette.accent
                          : palette.border,
                        backgroundColor: palette.surfaceSubtle,
                      },
                    ]}
                  >
                    <Text
                      style={[
                        styles.outlineBtnText,
                        {
                          color: job.isEvergreen
                            ? palette.accent
                            : palette.textSecondary,
                        },
                      ]}
                    >
                      {job.isEvergreen ? 'Evergreen ↻' : '+ Evergreen'}
                    </Text>
                  </Pressable>

                  <Pressable
                    onPress={() => void handleShareReviewLink(job)}
                    style={[
                      styles.outlineBtn,
                      {
                        borderColor: palette.border,
                        backgroundColor: palette.surfaceSubtle,
                      },
                    ]}
                  >
                    <Text
                      style={[
                        styles.outlineBtnText,
                        { color: palette.textSecondary },
                      ]}
                    >
                      {copiedJobId === job.id
                        ? 'Link copied ✓'
                        : job.approval
                        ? 'Copy review link'
                        : 'Share for approval'}
                    </Text>
                  </Pressable>

                  <Pressable
                    onPress={() => handleOpenInComposer(job)}
                    style={[
                      styles.outlineBtn,
                      { borderColor: palette.borderStrong },
                    ]}
                  >
                    <Text
                      style={[styles.outlineBtnText, { color: palette.text }]}
                    >
                      Edit
                    </Text>
                  </Pressable>

                  {effectiveRole !== 'editor' && (
                    <Pressable
                      onPress={() => void publishScheduledNow(job.id)}
                      style={[
                        styles.solidBtn,
                        { backgroundColor: palette.ctaBg },
                      ]}
                    >
                      <Text
                        style={[styles.solidBtnText, { color: palette.ctaText }]}
                      >
                        Post now
                      </Text>
                    </Pressable>
                  )}

                  <Pressable
                    onPress={() => void deleteJob(job.id)}
                    style={{ padding: 4 }}
                    accessibilityLabel="Delete scheduled post"
                  >
                    <Ionicons
                      name="trash-outline"
                      size={16}
                      color={palette.textMuted}
                    />
                  </Pressable>
                </View>
              </View>

              {renderApprovalStrip(job)}
            </View>
          );
        })
      )}
    </View>
  );

  const renderDraftsTab = () => {
    if (draftJobs.length === 0) {
      return (
        <View
          style={[
            styles.emptySheet,
            {
              backgroundColor: palette.surface,
              borderColor: palette.border,
            },
          ]}
        >
          <Text style={[styles.emptyTitle, { color: palette.text }]}>
            No saved drafts
          </Text>
          <Text style={[styles.emptySub, { color: palette.textSecondary }]}>
            Click &ldquo;Save draft&rdquo; in the composer anytime — even if you haven&rsquo;t filmed the video yet.
          </Text>
        </View>
      );
    }

    return (
      <View style={{ gap: 14 }}>
        {draftJobs.map((job) => (
          <View
            key={job.id}
            style={[
              styles.jobSheet,
              {
                backgroundColor: palette.surface,
                borderColor: palette.border,
              },
            ]}
          >
            <View style={styles.queueCardBody}>
              <View style={{ flex: 1, gap: 4 }}>
                <View style={styles.draftHeadLine}>
                  <Text
                    style={[styles.jobTitle, { color: palette.text }]}
                    numberOfLines={1}
                  >
                    {job.master.title ||
                      job.master.caption.slice(0, 60) ||
                      job.video?.fileName ||
                      'Untitled draft'}
                  </Text>
                  {renderPlatformIconsInline(job)}
                </View>

                <Text
                  style={[styles.jobMeta, { color: palette.textSecondary }]}
                  numberOfLines={2}
                >
                  {job.video
                    ? `${job.video.fileName} (${formatDuration(job.video.durationSec)})`
                    : job.photos?.length
                    ? `${job.photos.length} photo${
                        job.photos.length > 1 ? 's' : ''
                      }`
                    : 'Text draft'}
                  {' · Saved '}
                  {new Date(job.updatedAt ?? job.createdAt).toLocaleTimeString(
                    [],
                    { hour: 'numeric', minute: '2-digit' }
                  )}
                </Text>
              </View>

              <View style={styles.cardActionRow}>
                <Pressable
                  onPress={() => void handleShareReviewLink(job)}
                  style={[
                    styles.outlineBtn,
                    {
                      borderColor: palette.border,
                      backgroundColor: palette.surfaceSubtle,
                    },
                  ]}
                >
                  <Text
                    style={[
                      styles.outlineBtnText,
                      { color: palette.textSecondary },
                    ]}
                  >
                    {copiedJobId === job.id
                      ? 'Link copied ✓'
                      : job.approval
                      ? 'Copy review link'
                      : 'Share for approval'}
                  </Text>
                </Pressable>

                <Pressable
                  onPress={() => handleOpenInComposer(job)}
                  style={[styles.solidBtn, { backgroundColor: palette.ctaBg }]}
                >
                  <Text
                    style={[styles.solidBtnText, { color: palette.ctaText }]}
                  >
                    Continue editing
                  </Text>
                </Pressable>

                <Pressable
                  onPress={() => void deleteJob(job.id)}
                  style={{ padding: 4 }}
                  accessibilityLabel="Delete draft"
                >
                  <Ionicons
                    name="trash-outline"
                    size={16}
                    color={palette.textMuted}
                  />
                </Pressable>
              </View>
            </View>

            {renderApprovalStrip(job)}
          </View>
        ))}
      </View>
    );
  };

  const renderPublishedTab = () => {
    if (publishedJobs.length === 0) {
      return (
        <View
          style={[
            styles.emptySheet,
            {
              backgroundColor: palette.surface,
              borderColor: palette.border,
            },
          ]}
        >
          <Text style={[styles.emptyTitle, { color: palette.text }]}>
            No published posts yet
          </Text>
          <Text style={[styles.emptySub, { color: palette.textSecondary }]}>
            Posts you send immediately (or scheduled posts once their time arrives) show live progress and links here.
          </Text>
        </View>
      );
    }

    return (
      <View style={{ gap: 16 }}>
        {publishedJobs.map((job) => {
          const entries = PLATFORM_ORDER.filter((id) => job.results[id]).map(
            (id) => job.results[id]!
          );
          const publishedCount = entries.filter(
            (e) => e.status === 'published'
          ).length;
          const failedCount = entries.filter(
            (e) => e.status === 'failed'
          ).length;
          const totalJobViews = entries.reduce(
            (acc, e) => acc + (e.metrics?.views ?? 0),
            0
          );

          return (
            <View
              key={job.id}
              style={[
                styles.jobSheet,
                {
                  backgroundColor: palette.surface,
                  borderColor: palette.border,
                },
              ]}
            >
              <View
                style={[
                  styles.jobHead,
                  { borderBottomColor: palette.border },
                ]}
              >
                <View style={{ flex: 1 }}>
                  <Text
                    style={[styles.jobTitle, { color: palette.text }]}
                    numberOfLines={1}
                  >
                    {job.master.title ||
                      job.master.caption.slice(0, 64) ||
                      job.video?.fileName ||
                      'Published post'}
                  </Text>
                  <Text style={[styles.jobMeta, { color: palette.textMuted }]}>
                    {job.video
                      ? `${job.video.fileName} · ${formatDuration(job.video.durationSec)} · `
                      : job.photos?.length
                      ? `${job.photos.length} photo${
                          job.photos.length > 1 ? 's' : ''
                        } · `
                      : 'Text post · '}
                    {new Date(job.createdAt).toLocaleTimeString([], {
                      hour: '2-digit',
                      minute: '2-digit',
                    })}
                  </Text>
                </View>

                <View style={styles.headRight}>
                  <Pressable
                    onPress={() =>
                      void toggleEvergreen(job.id, !job.isEvergreen)
                    }
                    style={[
                      styles.outlineBtn,
                      {
                        borderColor: job.isEvergreen
                          ? palette.accent
                          : palette.border,
                        backgroundColor: palette.surfaceSubtle,
                      },
                    ]}
                  >
                    <Text
                      style={[
                        styles.outlineBtnText,
                        {
                          color: job.isEvergreen
                            ? palette.accent
                            : palette.textSecondary,
                        },
                      ]}
                    >
                      {job.isEvergreen ? 'Evergreen ↻' : '+ Evergreen'}
                    </Text>
                  </Pressable>

                  {totalJobViews > 0 && (
                    <Pressable
                      onPress={() => router.push('/insights')}
                      style={[
                        styles.outlineBtn,
                        {
                          borderColor: palette.border,
                          backgroundColor: palette.surfaceSubtle,
                        },
                      ]}
                    >
                      <Text
                        style={[
                          styles.outlineBtnText,
                          { color: palette.textSecondary },
                        ]}
                      >
                        {formatCompactNumber(totalJobViews)} views · Insights
                      </Text>
                    </Pressable>
                  )}
                  {failedCount > 1 && (
                    <Pressable
                      onPress={() => void retryPlatform(job.id)}
                      style={[
                        styles.outlineBtn,
                        { borderColor: palette.borderStrong },
                      ]}
                    >
                      <Text
                        style={[styles.outlineBtnText, { color: palette.text }]}
                      >
                        Retry failed
                      </Text>
                    </Pressable>
                  )}
                  <Text
                    style={[
                      styles.countSummary,
                      { color: palette.textSecondary },
                    ]}
                  >
                    {publishedCount}/{entries.length} sent
                  </Text>
                </View>
              </View>

              {entries.map((res, idx) => {
                const pid = res.platformId as PlatformId;
                const spec = PLATFORM_SPECS[pid];
                const isDone = res.status === 'published';
                const isFailed = res.status === 'failed';

                return (
                  <View
                    key={res.platformId}
                    style={[
                      styles.destRow,
                      idx > 0 && {
                        borderTopWidth: 1,
                        borderTopColor: palette.border,
                      },
                    ]}
                  >
                    <Ionicons
                      name={PLATFORM_ICONS[pid]}
                      size={16}
                      color={spec.brandColor}
                    />

                    <View style={{ flex: 1, gap: 4 }}>
                      <View style={styles.destTopLine}>
                        <Text
                          style={[styles.destName, { color: palette.text }]}
                        >
                          {spec.name}
                        </Text>
                        <Text
                          style={[
                            styles.destState,
                            {
                              color: isFailed
                                ? palette.danger
                                : isDone
                                ? palette.success
                                : palette.textMuted,
                            },
                          ]}
                        >
                          {isDone
                            ? res.firstCommentPosted
                              ? 'Published · + 1st comment'
                              : 'Published'
                            : isFailed
                            ? 'Failed'
                            : `${res.progressPct}%`}
                        </Text>
                      </View>

                      {!isDone && !isFailed && (
                        <View
                          style={[
                            styles.thinTrack,
                            { backgroundColor: palette.surfaceMuted },
                          ]}
                        >
                          <View
                            style={[
                              styles.thinFill,
                              {
                                width: `${Math.max(5, res.progressPct)}%`,
                                backgroundColor: palette.text,
                              },
                            ]}
                          />
                        </View>
                      )}

                      {isFailed && res.error && (
                        <Text style={{ color: palette.danger, fontSize: 12 }}>
                          {res.error}
                        </Text>
                      )}
                    </View>

                    {isDone && res.externalUrl && (
                      <Pressable
                        onPress={() => void Linking.openURL(res.externalUrl!)}
                      >
                        <Text
                          style={[
                            styles.rowLink,
                            { color: palette.textSecondary },
                          ]}
                        >
                          Open ↗
                        </Text>
                      </Pressable>
                    )}

                    {isFailed && (
                      <Pressable
                        onPress={() => void retryPlatform(job.id, pid)}
                        style={[
                          styles.outlineBtn,
                          { borderColor: palette.borderStrong },
                        ]}
                      >
                        <Text
                          style={[
                            styles.outlineBtnText,
                            { color: palette.text },
                          ]}
                        >
                          Retry
                        </Text>
                      </Pressable>
                    )}
                  </View>
                );
              })}
            </View>
          );
        })}
      </View>
    );
  };

  const tabs: { id: PostsTabFilter; label: string; count?: number }[] = [
    { id: 'calendar', label: 'Calendar' },
    { id: 'upcoming', label: 'Upcoming', count: upcomingJobs.length },
    { id: 'drafts', label: 'Drafts', count: draftJobs.length },
    { id: 'published', label: 'Published', count: publishedJobs.length },
  ];

  return (
    <SafeAreaView
      style={[styles.safe, { backgroundColor: palette.bg }]}
      edges={['top']}
    >
      <AppHeader />

      <ScrollView
        contentContainerStyle={[
          styles.content,
          preferredPostsFilter === 'calendar' && { maxWidth: 1020 },
        ]}
      >
        <View style={styles.headerRow}>
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: 10, flexWrap: 'wrap' }}>
            <Text style={[styles.pageTitle, { color: palette.text }]}>
              Content queue
            </Text>
            {activeWorkspace.requireApproval && (
              <Pressable
                onPress={openTeamModal}
                style={[
                  styles.outlineBtn,
                  {
                    borderColor: palette.border,
                    backgroundColor: palette.surface,
                  },
                ]}
              >
                <Text
                  style={{
                    fontSize: 11.5,
                    fontWeight: '600',
                    color: palette.success,
                  }}
                >
                  Approval gate active · Team
                </Text>
              </Pressable>
            )}
          </View>

          <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
            <Pressable
              onPress={async () => {
                const count = await fillEvergreenSlots(7);
                setEvergreenNotice(
                  count > 0
                    ? `Auto-filled ${count} open weekday ${
                        count === 1 ? 'slot' : 'slots'
                      } from Evergreen`
                    : 'All upcoming weekdays already have posts queued'
                );
                setTimeout(() => setEvergreenNotice(null), 3200);
              }}
              style={[
                styles.outlineBtn,
                {
                  borderColor: palette.border,
                  backgroundColor: palette.surface,
                  paddingHorizontal: 11,
                  paddingVertical: 8,
                },
              ]}
            >
              <Text
                style={[
                  styles.outlineBtnText,
                  { color: palette.textSecondary },
                ]}
              >
                {evergreenNotice || 'Fill open days ↻'}
              </Text>
            </Pressable>

            <Pressable
              onPress={openBatchModal}
              style={[
                styles.outlineBtn,
                {
                  borderColor: palette.borderStrong,
                  backgroundColor: palette.surface,
                  paddingHorizontal: 12,
                  paddingVertical: 8,
                },
              ]}
            >
              <Text style={[styles.outlineBtnText, { color: palette.text }]}>
                Batch schedule
              </Text>
            </Pressable>

            <Pressable
              onPress={() => router.push('/')}
              style={[styles.newBtn, { backgroundColor: palette.ctaBg }]}
            >
              <Text style={[styles.newBtnText, { color: palette.ctaText }]}>
                New post
              </Text>
            </Pressable>
          </View>
        </View>

        {/* Clean 4-Tab Underline Switcher */}
        <View
          style={[
            styles.tabsBar,
            { borderBottomColor: palette.border },
          ]}
        >
          {tabs.map((t) => {
            const active = preferredPostsFilter === t.id;
            return (
              <Pressable
                key={t.id}
                onPress={() => setPreferredPostsFilter(t.id)}
                style={[
                  styles.tabItem,
                  active && { borderBottomColor: palette.text },
                ]}
              >
                <Text
                  style={[
                    styles.tabLabel,
                    {
                      color: active ? palette.text : palette.textSecondary,
                      fontWeight: active ? '600' : '400',
                    },
                  ]}
                >
                  {t.label}
                </Text>
                {typeof t.count === 'number' && (
                  <Text
                    style={[
                      styles.tabCount,
                      { color: active ? palette.text : palette.textMuted },
                    ]}
                  >
                    {t.count}
                  </Text>
                )}
              </Pressable>
            );
          })}
        </View>

        {preferredPostsFilter === 'calendar' ? (
          <ContentCalendar
            onShareReviewLink={handleShareReviewLink}
            copiedJobId={copiedJobId}
          />
        ) : preferredPostsFilter === 'upcoming' ? (
          renderUpcomingTab()
        ) : preferredPostsFilter === 'drafts' ? (
          renderDraftsTab()
        ) : (
          renderPublishedTab()
        )}
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safe: {
    flex: 1,
  },
  content: {
    maxWidth: 820,
    width: '100%',
    alignSelf: 'center',
    paddingHorizontal: 20,
    paddingVertical: 28,
    gap: 18,
  },
  headerRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  pageTitle: {
    fontSize: 20,
    fontWeight: '700',
    letterSpacing: -0.3,
  },
  newBtn: {
    paddingHorizontal: 14,
    paddingVertical: 8,
    borderRadius: 7,
  },
  newBtnText: {
    fontSize: 13,
    fontWeight: '600',
  },
  tabsBar: {
    flexDirection: 'row',
    borderBottomWidth: 1,
    gap: 24,
  },
  tabItem: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    paddingVertical: 10,
    borderBottomWidth: 2,
    borderBottomColor: 'transparent',
  },
  tabLabel: {
    fontSize: 13.5,
  },
  tabCount: {
    fontSize: 12,
  },
  weekStrip: {
    flexDirection: 'row',
    borderWidth: 1,
    borderRadius: 10,
    overflow: 'hidden',
  },
  weekCell: {
    flex: 1,
    paddingVertical: 10,
    paddingHorizontal: 6,
    alignItems: 'center',
    gap: 2,
  },
  weekDayName: {
    fontSize: 11,
  },
  weekDayNum: {
    fontSize: 14,
    fontWeight: '600',
  },
  weekCount: {
    fontSize: 10.5,
    marginTop: 1,
  },
  emptySheet: {
    borderRadius: 12,
    borderWidth: 1,
    padding: 32,
    gap: 6,
  },
  emptyTitle: {
    fontSize: 15,
    fontWeight: '600',
  },
  emptySub: {
    fontSize: 13.5,
    lineHeight: 20,
  },
  jobSheet: {
    borderRadius: 12,
    borderWidth: 1,
    overflow: 'hidden',
  },
  scheduledTopBar: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 18,
    paddingVertical: 10,
    borderBottomWidth: 1,
  },
  scheduledBadgeRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 7,
  },
  scheduledTimeLabel: {
    fontSize: 13,
    fontWeight: '600',
  },
  inlineIconsRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  queueCardBody: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    flexWrap: 'wrap',
    paddingHorizontal: 18,
    paddingVertical: 15,
    gap: 14,
  },
  draftHeadLine: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
  },
  cardActionRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  solidBtn: {
    paddingHorizontal: 12,
    paddingVertical: 7,
    borderRadius: 7,
  },
  solidBtnText: {
    fontSize: 12.5,
    fontWeight: '600',
  },
  jobHead: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 18,
    paddingVertical: 14,
    borderBottomWidth: 1,
    gap: 12,
  },
  jobTitle: {
    fontSize: 14.5,
    fontWeight: '600',
  },
  jobMeta: {
    fontSize: 12.5,
    lineHeight: 18,
  },
  headRight: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
  },
  countSummary: {
    fontSize: 12.5,
    fontWeight: '500',
  },
  destRow: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 18,
    paddingVertical: 13,
    gap: 12,
  },
  destTopLine: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  destName: {
    fontSize: 13.5,
    fontWeight: '500',
  },
  destState: {
    fontSize: 12.5,
    fontWeight: '500',
  },
  thinTrack: {
    height: 3,
    borderRadius: 2,
    overflow: 'hidden',
  },
  thinFill: {
    height: '100%',
  },
  rowLink: {
    fontSize: 12.5,
    fontWeight: '500',
    textDecorationLine: 'underline',
  },
  outlineBtn: {
    borderWidth: 1,
    borderRadius: 6,
    paddingHorizontal: 10,
    paddingVertical: 6,
  },
  outlineBtnText: {
    fontSize: 12.5,
    fontWeight: '600',
  },
});
