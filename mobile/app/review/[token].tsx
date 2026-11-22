import { Ionicons } from '@expo/vector-icons';
import { useLocalSearchParams, useRouter } from 'expo-router';
import React, { useEffect, useMemo, useState } from 'react';
import {
  ActivityIndicator,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  useWindowDimensions,
  View,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import {
  ConnectedAccount,
  formatScheduleLabel,
  PLATFORM_ORDER,
  PLATFORM_SPECS,
  PlatformId,
  PublicReviewPayload,
} from '../../../shared/platforms';
import { VideoPreviewCard } from '../../components/VideoPreviewCard';
import { PLATFORM_ICONS } from '../../constants/theme';
import { useOmniPost } from '../../context/OmniPostContext';
import {
  fetchPublicReviewApi,
  submitPublicReviewDecisionApi,
} from '../../lib/api';

export default function ClientReviewPortalScreen() {
  const router = useRouter();
  const params = useLocalSearchParams<{ token?: string }>();
  const token = typeof params.token === 'string' ? params.token : '';
  const { width } = useWindowDimensions();
  const isDesktop = width >= 840;

  const { palette, toggleTheme, isSignedOut, refreshAll } = useOmniPost();

  const [review, setReview] = useState<PublicReviewPayload | null>(null);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState<string | null>(null);

  const [previewPlatform, setPreviewPlatform] = useState<PlatformId>('tiktok');
  const [reviewerName, setReviewerName] = useState('');
  const [comment, setComment] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [formError, setFormError] = useState<string | null>(null);
  const [submittedNotice, setSubmittedNotice] = useState<string | null>(null);

  useEffect(() => {
    if (!token) {
      setLoadError('Missing review link token.');
      setLoading(false);
      return;
    }
    setLoading(true);
    setLoadError(null);
    fetchPublicReviewApi(token)
      .then((res) => {
        setReview(res);
        const firstEnabled =
          PLATFORM_ORDER.find((id) => res.job.overrides[id]?.enabled) ?? 'x';
        setPreviewPlatform(firstEnabled);
        if (res.job.approval.reviewerName) {
          setReviewerName(res.job.approval.reviewerName);
        }
      })
      .catch((err: any) => {
        setLoadError(err?.message || 'Review link expired or unavailable.');
      })
      .finally(() => setLoading(false));
  }, [token]);

  const previewAccounts: ConnectedAccount[] = useMemo(() => {
    if (!review) return [];
    return review.accounts.map((a, idx) => ({
      id: `rev_acc_${idx}`,
      platformGroup: a.platformGroup,
      mode: 'sandbox',
      handle: a.handle,
      displayName: a.displayName,
      connectedAt: review.job.createdAt,
    }));
  }, [review]);

  const enabledPlatforms = useMemo(() => {
    if (!review) return [];
    return PLATFORM_ORDER.filter((id) => review.job.overrides[id]?.enabled);
  }, [review]);

  const handleDecision = async (decision: 'approved' | 'changes_requested') => {
    if (!token || submitting) return;
    if (decision === 'changes_requested' && !comment.trim()) {
      setFormError('Leave a short note describing what should be changed.');
      return;
    }
    setFormError(null);
    setSubmittedNotice(null);
    setSubmitting(true);
    try {
      const updated = await submitPublicReviewDecisionApi(token, {
        reviewerName: reviewerName.trim() || 'Client Reviewer',
        decision,
        comment: comment.trim() || undefined,
      });
      setReview(updated);
      setComment('');
      setSubmittedNotice(
        decision === 'approved'
          ? 'Marked as approved — the studio team has been updated.'
          : 'Revision request sent to the studio team.'
      );
      if (!isSignedOut) {
        void refreshAll();
      }
    } catch (err: any) {
      setFormError(err?.message || 'Could not submit decision.');
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <SafeAreaView
      edges={['top']}
      style={[styles.safe, { backgroundColor: palette.bg }]}
    >
      {/* Top Client Review Header */}
      <View
        style={[
          styles.topBar,
          {
            backgroundColor: palette.surface,
            borderBottomColor: palette.border,
          },
        ]}
      >
        <View style={styles.topInner}>
          <View style={styles.brandRow}>
            <View
              style={[
                styles.wsDot,
                {
                  backgroundColor: review?.workspaceColor || palette.accent,
                },
              ]}
            />
            <Text style={[styles.wsTitle, { color: palette.text }]}>
              {review ? `${review.workspaceName} · Post Review` : 'omnipost review'}
            </Text>
          </View>

          <View style={styles.topRight}>
            <Pressable
              onPress={toggleTheme}
              style={[
                styles.iconBtn,
                {
                  borderColor: palette.border,
                  backgroundColor: palette.surfaceSubtle,
                },
              ]}
            >
              <Ionicons
                name={
                  palette.mode === 'light' ? 'moon-outline' : 'sunny-outline'
                }
                size={15}
                color={palette.textSecondary}
              />
            </Pressable>

            {!isSignedOut && (
              <Pressable
                onPress={() => router.push('/history')}
                style={[
                  styles.backQueueBtn,
                  { borderColor: palette.borderStrong },
                ]}
              >
                <Text style={[styles.backQueueText, { color: palette.text }]}>
                  Back to Queue
                </Text>
              </Pressable>
            )}
          </View>
        </View>
      </View>

      {loading ? (
        <View style={styles.centerState}>
          <ActivityIndicator size="small" color={palette.text} />
          <Text style={{ color: palette.textSecondary, fontSize: 13.5 }}>
            Loading post preview...
          </Text>
        </View>
      ) : loadError || !review ? (
        <View style={styles.centerState}>
          <Text style={[styles.errorHeading, { color: palette.text }]}>
            Review link unavailable
          </Text>
          <Text style={{ color: palette.textSecondary, fontSize: 13.5 }}>
            {loadError || 'This post may have been deleted or already published.'}
          </Text>
        </View>
      ) : (
        <ScrollView contentContainerStyle={styles.scrollContent}>
          <View
            style={[
              styles.columns,
              { flexDirection: isDesktop ? 'row' : 'column' },
            ]}
          >
            {/* Left Column: Live Interactive Platform Previews */}
            <View style={[styles.previewCol, isDesktop && { width: 320 }]}>
              <VideoPreviewCard
                video={review.job.video}
                photos={review.job.photos}
                master={review.job.master}
                overrides={review.job.overrides}
                accounts={previewAccounts}
                selectedPlatform={previewPlatform}
                onSelectPlatform={setPreviewPlatform}
              />
            </View>

            {/* Right Column: Post Details + Sign-off Sheet */}
            <View style={{ flex: 1, gap: 16 }}>
              <View
                style={[
                  styles.sheet,
                  {
                    backgroundColor: palette.surface,
                    borderColor: palette.border,
                  },
                ]}
              >
                {/* Status & Schedule Header */}
                <View
                  style={[
                    styles.sheetHead,
                    {
                      borderBottomColor: palette.border,
                      backgroundColor: palette.surfaceSubtle,
                    },
                  ]}
                >
                  <View style={{ gap: 2 }}>
                    <Text
                      style={[
                        styles.scheduleEyebrow,
                        { color: palette.textSecondary },
                      ]}
                    >
                      {review.job.scheduledAt
                        ? `Scheduled for ${formatScheduleLabel(
                            review.job.scheduledAt
                          )}`
                        : 'Draft awaiting sign-off'}
                    </Text>
                    <Text style={[styles.postTitle, { color: palette.text }]}>
                      {review.job.master.title ||
                        review.job.master.caption.split('\n')[0]?.slice(0, 68) ||
                        'Prepared cross-platform post'}
                    </Text>
                  </View>

                  <View
                    style={[
                      styles.statusBadge,
                      {
                        backgroundColor:
                          review.job.approval.status === 'approved'
                            ? palette.successBg
                            : review.job.approval.status === 'changes_requested'
                            ? palette.warningBg
                            : palette.surface,
                        borderColor: palette.border,
                      },
                    ]}
                  >
                    <Text
                      style={[
                        styles.statusBadgeText,
                        {
                          color:
                            review.job.approval.status === 'approved'
                              ? palette.success
                              : review.job.approval.status ===
                                'changes_requested'
                              ? palette.warning
                              : palette.textSecondary,
                        },
                      ]}
                    >
                      {review.job.approval.status === 'approved'
                        ? `✓ Approved${
                            review.job.approval.reviewerName
                              ? ` by ${review.job.approval.reviewerName}`
                              : ''
                          }`
                        : review.job.approval.status === 'changes_requested'
                        ? 'Changes requested'
                        : 'Awaiting client review'}
                    </Text>
                  </View>
                </View>

                {/* Channels & Full Copy Summary */}
                <View style={styles.copySection}>
                  <Text
                    style={[styles.microLabel, { color: palette.textMuted }]}
                  >
                    Publishing to {enabledPlatforms.length}{' '}
                    {enabledPlatforms.length === 1 ? 'channel' : 'channels'}
                  </Text>
                  <View style={styles.channelsRow}>
                    {enabledPlatforms.map((pid) => (
                      <Pressable
                        key={pid}
                        onPress={() => setPreviewPlatform(pid)}
                        style={[
                          styles.channelChip,
                          {
                            borderColor:
                              previewPlatform === pid
                                ? palette.text
                                : palette.border,
                            backgroundColor: palette.surfaceSubtle,
                          },
                        ]}
                      >
                        <Ionicons
                          name={PLATFORM_ICONS[pid]}
                          size={13}
                          color={
                            pid === 'x' || pid === 'threads'
                              ? palette.text
                              : PLATFORM_SPECS[pid].brandColor
                          }
                        />
                        <Text
                          style={[
                            styles.channelChipText,
                            { color: palette.text },
                          ]}
                        >
                          {PLATFORM_SPECS[pid].shortName}
                        </Text>
                      </Pressable>
                    ))}
                  </View>

                  {review.job.master.caption ? (
                    <View style={{ marginTop: 6, gap: 4 }}>
                      <Text
                        style={[styles.microLabel, { color: palette.textMuted }]}
                      >
                        Main copy
                      </Text>
                      <Text
                        style={[styles.bodyCopy, { color: palette.text }]}
                      >
                        {review.job.master.caption}
                      </Text>
                    </View>
                  ) : null}

                  {review.job.master.firstComment ? (
                    <View
                      style={[
                        styles.fcBox,
                        {
                          backgroundColor: palette.surfaceSubtle,
                          borderColor: palette.border,
                        },
                      ]}
                    >
                      <Text
                        style={[styles.fcTitle, { color: palette.accent }]}
                      >
                        ↳ Auto 1st comment / link
                      </Text>
                      <Text
                        style={[
                          styles.fcCopy,
                          { color: palette.textSecondary },
                        ]}
                      >
                        {review.job.master.firstComment}
                      </Text>
                    </View>
                  ) : null}
                </View>

                {/* Client Sign-Off Form */}
                <View
                  style={[
                    styles.signoffArea,
                    { borderTopColor: palette.border },
                  ]}
                >
                  <Text
                    style={[styles.signoffTitle, { color: palette.text }]}
                  >
                    Client sign-off
                  </Text>

                  <View style={styles.fieldGroup}>
                    <Text
                      style={[
                        styles.fieldLabel,
                        { color: palette.textSecondary },
                      ]}
                    >
                      Your name
                    </Text>
                    <TextInput
                      style={[
                        styles.input,
                        {
                          color: palette.text,
                          backgroundColor: palette.surfaceSubtle,
                          borderColor: palette.border,
                        },
                      ]}
                      placeholder="e.g. Jordan · Brand Lead"
                      placeholderTextColor={palette.textMuted}
                      value={reviewerName}
                      onChangeText={setReviewerName}
                    />
                  </View>

                  <View style={styles.fieldGroup}>
                    <Text
                      style={[
                        styles.fieldLabel,
                        { color: palette.textSecondary },
                      ]}
                    >
                      Notes or requested edits (required if requesting changes)
                    </Text>
                    <TextInput
                      style={[
                        styles.input,
                        styles.notesInput,
                        {
                          color: palette.text,
                          backgroundColor: palette.surfaceSubtle,
                          borderColor: palette.border,
                        },
                      ]}
                      multiline
                      placeholder="Looks good to go — or let the team know what to tweak..."
                      placeholderTextColor={palette.textMuted}
                      value={comment}
                      onChangeText={setComment}
                    />
                  </View>

                  {formError ? (
                    <Text style={{ fontSize: 12.5, color: palette.danger }}>
                      {formError}
                    </Text>
                  ) : null}

                  {submittedNotice ? (
                    <Text style={{ fontSize: 12.5, color: palette.success }}>
                      {submittedNotice}
                    </Text>
                  ) : null}

                  <View style={styles.decisionBtns}>
                    <Pressable
                      disabled={submitting}
                      onPress={() => void handleDecision('approved')}
                      style={[
                        styles.approveBtn,
                        { backgroundColor: palette.ctaBg },
                      ]}
                    >
                      <Ionicons
                        name="checkmark"
                        size={15}
                        color={palette.ctaText}
                      />
                      <Text
                        style={[
                          styles.approveBtnText,
                          { color: palette.ctaText },
                        ]}
                      >
                        Approve post
                      </Text>
                    </Pressable>

                    <Pressable
                      disabled={submitting}
                      onPress={() => void handleDecision('changes_requested')}
                      style={[
                        styles.changesBtn,
                        {
                          borderColor: palette.borderStrong,
                          backgroundColor: palette.surface,
                        },
                      ]}
                    >
                      <Text
                        style={[styles.changesBtnText, { color: palette.text }]}
                      >
                        Request changes
                      </Text>
                    </Pressable>
                  </View>
                </View>

                {/* Activity / Comment Thread */}
                {review.job.approval.comments.length > 0 && (
                  <View
                    style={[
                      styles.commentsSection,
                      {
                        borderTopColor: palette.border,
                        backgroundColor: palette.surfaceSubtle,
                      },
                    ]}
                  >
                    <Text
                      style={[styles.microLabel, { color: palette.textMuted }]}
                    >
                      Review history
                    </Text>
                    {review.job.approval.comments.map((c) => (
                      <View
                        key={c.id}
                        style={[
                          styles.commentCard,
                          {
                            backgroundColor: palette.surface,
                            borderColor: palette.border,
                          },
                        ]}
                      >
                        <View style={styles.commentHead}>
                          <Text
                            style={[
                              styles.commentAuthor,
                              { color: palette.text },
                            ]}
                          >
                            {c.authorName}
                          </Text>
                          <Text
                            style={{
                              fontSize: 11.5,
                              color:
                                c.decision === 'approved'
                                  ? palette.success
                                  : palette.warning,
                              fontWeight: '600',
                            }}
                          >
                            {c.decision === 'approved'
                              ? 'Approved'
                              : 'Changes requested'}
                          </Text>
                        </View>
                        <Text
                          style={[
                            styles.commentBody,
                            { color: palette.textSecondary },
                          ]}
                        >
                          {c.body}
                        </Text>
                      </View>
                    ))}
                  </View>
                )}
              </View>
            </View>
          </View>
        </ScrollView>
      )}
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1 },
  topBar: {
    borderBottomWidth: 1,
    paddingHorizontal: 20,
  },
  topInner: {
    maxWidth: 980,
    width: '100%',
    alignSelf: 'center',
    height: 54,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: 12,
  },
  brandRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  wsDot: {
    width: 9,
    height: 9,
    borderRadius: 5,
  },
  wsTitle: {
    fontSize: 15.5,
    fontWeight: '700',
    letterSpacing: -0.3,
  },
  topRight: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
  },
  iconBtn: {
    width: 30,
    height: 30,
    borderRadius: 7,
    borderWidth: 1,
    alignItems: 'center',
    justifyContent: 'center',
  },
  backQueueBtn: {
    borderWidth: 1,
    borderRadius: 7,
    paddingHorizontal: 11,
    paddingVertical: 6,
  },
  backQueueText: {
    fontSize: 12.5,
    fontWeight: '600',
  },
  centerState: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    padding: 24,
    gap: 8,
  },
  errorHeading: {
    fontSize: 17,
    fontWeight: '700',
  },
  scrollContent: {
    paddingHorizontal: 20,
    paddingTop: 26,
    paddingBottom: 60,
  },
  columns: {
    maxWidth: 980,
    width: '100%',
    alignSelf: 'center',
    alignItems: 'flex-start',
    gap: 28,
  },
  previewCol: {
    width: '100%',
  },
  sheet: {
    borderWidth: 1,
    borderRadius: 12,
    overflow: 'hidden',
  },
  sheetHead: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    justifyContent: 'space-between',
    flexWrap: 'wrap',
    padding: 18,
    borderBottomWidth: 1,
    gap: 10,
  },
  scheduleEyebrow: {
    fontSize: 12,
    fontWeight: '600',
  },
  postTitle: {
    fontSize: 16.5,
    fontWeight: '700',
    letterSpacing: -0.3,
  },
  statusBadge: {
    paddingHorizontal: 9,
    paddingVertical: 4,
    borderRadius: 6,
    borderWidth: 1,
  },
  statusBadgeText: {
    fontSize: 12,
    fontWeight: '600',
  },
  copySection: {
    padding: 18,
    gap: 10,
  },
  microLabel: {
    fontSize: 11.5,
    fontWeight: '600',
  },
  channelsRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 6,
  },
  channelChip: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 5,
    paddingHorizontal: 9,
    paddingVertical: 5,
    borderRadius: 6,
    borderWidth: 1,
  },
  channelChipText: {
    fontSize: 12,
    fontWeight: '600',
  },
  bodyCopy: {
    fontSize: 14,
    lineHeight: 21,
  },
  fcBox: {
    borderWidth: 1,
    borderRadius: 8,
    padding: 11,
    gap: 3,
    marginTop: 4,
  },
  fcTitle: {
    fontSize: 11.5,
    fontWeight: '600',
  },
  fcCopy: {
    fontSize: 12.5,
    lineHeight: 18,
  },
  signoffArea: {
    borderTopWidth: 1,
    padding: 18,
    gap: 12,
  },
  signoffTitle: {
    fontSize: 14.5,
    fontWeight: '700',
  },
  fieldGroup: {
    gap: 5,
  },
  fieldLabel: {
    fontSize: 12,
    fontWeight: '600',
  },
  input: {
    borderWidth: 1,
    borderRadius: 8,
    paddingHorizontal: 11,
    paddingVertical: 9,
    fontSize: 13.5,
  },
  notesInput: {
    minHeight: 74,
    textAlignVertical: 'top',
  },
  decisionBtns: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    alignItems: 'center',
    gap: 10,
    paddingTop: 2,
  },
  approveBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    paddingHorizontal: 15,
    paddingVertical: 10,
    borderRadius: 8,
  },
  approveBtnText: {
    fontSize: 13,
    fontWeight: '600',
  },
  changesBtn: {
    paddingHorizontal: 14,
    paddingVertical: 9.5,
    borderRadius: 8,
    borderWidth: 1,
  },
  changesBtnText: {
    fontSize: 13,
    fontWeight: '600',
  },
  commentsSection: {
    borderTopWidth: 1,
    padding: 18,
    gap: 9,
  },
  commentCard: {
    borderWidth: 1,
    borderRadius: 8,
    padding: 11,
    gap: 4,
  },
  commentHead: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: 8,
  },
  commentAuthor: {
    fontSize: 12.5,
    fontWeight: '600',
  },
  commentBody: {
    fontSize: 12.5,
    lineHeight: 18,
  },
});
