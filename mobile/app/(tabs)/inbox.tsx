import { Ionicons } from '@expo/vector-icons';
import React, { useState } from 'react';
import {
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import {
  InboxFilterStatus,
  PLATFORM_SPECS,
  SocialCommentItem,
} from '../../../shared/platforms';
import { AppHeader } from '../../components/AppHeader';
import { PLATFORM_ICONS } from '../../constants/theme';
import { useOmniPost } from '../../context/OmniPostContext';

function formatRelativeAgo(iso: string): string {
  const diffSec = Math.max(
    1,
    Math.round((Date.now() - new Date(iso).getTime()) / 1000)
  );
  if (diffSec < 60) return 'just now';
  if (diffSec < 3600) return `${Math.floor(diffSec / 60)}m ago`;
  if (diffSec < 86400) return `${Math.floor(diffSec / 3600)}h ago`;
  return `${Math.floor(diffSec / 86400)}d ago`;
}

const QUICK_SNIPPETS = [
  'Appreciate you watching — full breakdown link is in the top comment!',
  'Great question! Happy to share our exact settings in a follow-up post.',
  'Thank you! Glad that detail was helpful.',
];

export default function UnifiedInboxScreen() {
  const {
    palette,
    activeWorkspace,
    presets,
    inboxComments,
    unansweredInboxCount,
    inboxFilter,
    setInboxFilter,
    syncingInbox,
    syncInbox,
    replyToComment,
    setCommentStatus,
  } = useOmniPost();

  const [openReplyId, setOpenReplyId] = useState<string | null>(null);
  const [draftReplies, setDraftReplies] = useState<Record<string, string>>({});
  const [sendingId, setSendingId] = useState<string | null>(null);

  const filterTabs: { id: InboxFilterStatus; label: string; badge?: number }[] =
    [
      {
        id: 'unanswered',
        label: 'Unanswered',
        badge: unansweredInboxCount,
      },
      { id: 'all', label: 'All active' },
      { id: 'replied', label: 'Replied' },
      { id: 'archived', label: 'Archived' },
    ];

  const handleSendReply = async (item: SocialCommentItem) => {
    const body = (draftReplies[item.id] || '').trim();
    if (!body || sendingId) return;
    setSendingId(item.id);
    try {
      await replyToComment(item.id, body);
      setDraftReplies((prev) => ({ ...prev, [item.id]: '' }));
      setOpenReplyId(null);
    } finally {
      setSendingId(null);
    }
  };

  return (
    <SafeAreaView
      style={[styles.safe, { backgroundColor: palette.bg }]}
      edges={['top']}
    >
      <AppHeader />

      <ScrollView contentContainerStyle={styles.content}>
        <View style={styles.headerRow}>
          <View style={{ gap: 2 }}>
            <Text style={[styles.pageTitle, { color: palette.text }]}>
              Comments inbox · {activeWorkspace.name}
            </Text>
            <Text style={[styles.pageSub, { color: palette.textSecondary }]}>
              Read and reply to audience questions across every connected channel in one place
            </Text>
          </View>

          <Pressable
            disabled={syncingInbox}
            onPress={() => void syncInbox()}
            style={[
              styles.syncBtn,
              {
                borderColor: palette.borderStrong,
                backgroundColor: palette.surface,
              },
            ]}
          >
            <Ionicons
              name="refresh-outline"
              size={14}
              color={palette.text}
            />
            <Text style={[styles.syncBtnText, { color: palette.text }]}>
              {syncingInbox ? 'Syncing…' : 'Sync comments'}
            </Text>
          </Pressable>
        </View>

        {/* Underline Filter Bar */}
        <View
          style={[styles.tabsBar, { borderBottomColor: palette.border }]}
        >
          {filterTabs.map((t) => {
            const active = inboxFilter === t.id;
            return (
              <Pressable
                key={t.id}
                onPress={() => setInboxFilter(t.id)}
                style={[
                  styles.tabItem,
                  active && { borderBottomColor: palette.text },
                ]}
              >
                <Text
                  style={{
                    fontSize: 13.5,
                    fontWeight: active ? '600' : '400',
                    color: active ? palette.text : palette.textSecondary,
                  }}
                >
                  {t.label}
                  {typeof t.badge === 'number' && t.badge > 0
                    ? ` (${t.badge})`
                    : ''}
                </Text>
              </Pressable>
            );
          })}
        </View>

        {inboxComments.length === 0 ? (
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
              {inboxFilter === 'unanswered'
                ? 'Inbox zero — every comment answered'
                : 'No comments in this view'}
            </Text>
            <Text style={[styles.emptySub, { color: palette.textSecondary }]}>
              Click “Sync comments” to pull new replies from live Bluesky threads and connected channels.
            </Text>
          </View>
        ) : (
          <View style={{ gap: 14 }}>
            {inboxComments.map((item) => {
              const spec = PLATFORM_SPECS[item.platformId];
              const isComposerOpen = openReplyId === item.id;
              const currentDraft = draftReplies[item.id] ?? '';

              return (
                <View
                  key={item.id}
                  style={[
                    styles.commentCard,
                    {
                      backgroundColor: palette.surface,
                      borderColor: palette.border,
                    },
                  ]}
                >
                  {/* Top context strip */}
                  <View
                    style={[
                      styles.cardTopBar,
                      {
                        backgroundColor: palette.surfaceSubtle,
                        borderBottomColor: palette.border,
                      },
                    ]}
                  >
                    <View style={styles.platformAndPost}>
                      <Ionicons
                        name={PLATFORM_ICONS[item.platformId] as any}
                        size={14}
                        color={
                          item.platformId === 'x' ||
                          item.platformId === 'threads'
                            ? palette.text
                            : spec.brandColor
                        }
                      />
                      <Text
                        style={{
                          fontSize: 12,
                          fontWeight: '600',
                          color: palette.text,
                        }}
                      >
                        {spec.shortName}
                      </Text>
                      <Text
                        style={{
                          fontSize: 12,
                          color: palette.textMuted,
                          flexShrink: 1,
                        }}
                        numberOfLines={1}
                      >
                        · on “{item.postTitle}”
                      </Text>
                    </View>

                    <Text style={{ fontSize: 11.5, color: palette.textMuted }}>
                      {formatRelativeAgo(item.createdAt)}
                    </Text>
                  </View>

                  {/* Comment Body */}
                  <View style={styles.cardBody}>
                    <View style={styles.authorRow}>
                      <Text
                        style={{
                          fontSize: 13.5,
                          fontWeight: '600',
                          color: palette.text,
                        }}
                      >
                        {item.authorName}
                      </Text>
                      <Text
                        style={{ fontSize: 12, color: palette.textMuted }}
                      >
                        {item.authorHandle}
                      </Text>
                      {item.likes > 0 && (
                        <Text
                          style={{ fontSize: 11.5, color: palette.textMuted }}
                        >
                          · ♥ {item.likes}
                        </Text>
                      )}
                    </View>

                    <Text style={[styles.commentBody, { color: palette.text }]}>
                      {item.body}
                    </Text>

                    {/* Existing Thread Replies */}
                    {item.replies.length > 0 && (
                      <View
                        style={[
                          styles.repliesThread,
                          { borderLeftColor: palette.borderStrong },
                        ]}
                      >
                        {item.replies.map((rep) => (
                          <View key={rep.id} style={{ gap: 2 }}>
                            <Text
                              style={{
                                fontSize: 11.5,
                                fontWeight: '600',
                                color: palette.textSecondary,
                              }}
                            >
                              You ({rep.authorHandle}) ·{' '}
                              {rep.mode === 'live' ? 'Sent live' : 'Replied'}
                            </Text>
                            <Text
                              style={{
                                fontSize: 13,
                                lineHeight: 19,
                                color: palette.text,
                              }}
                            >
                              {rep.body}
                            </Text>
                          </View>
                        ))}
                      </View>
                    )}

                    {/* Action Row */}
                    <View style={styles.actionsRow}>
                      <Pressable
                        onPress={() =>
                          setOpenReplyId(isComposerOpen ? null : item.id)
                        }
                        style={[
                          styles.replyToggleBtn,
                          {
                            backgroundColor: isComposerOpen
                              ? palette.surfaceMuted
                              : palette.ctaBg,
                          },
                        ]}
                      >
                        <Text
                          style={{
                            fontSize: 12,
                            fontWeight: '600',
                            color: isComposerOpen
                              ? palette.text
                              : palette.ctaText,
                          }}
                        >
                          {isComposerOpen
                            ? 'Close'
                            : item.replies.length > 0
                            ? 'Reply again'
                            : 'Reply'}
                        </Text>
                      </Pressable>

                      {item.status !== 'archived' ? (
                        <Pressable
                          onPress={() =>
                            void setCommentStatus(item.id, 'archived')
                          }
                          style={[
                            styles.secondaryBtn,
                            { borderColor: palette.border },
                          ]}
                        >
                          <Text
                            style={{
                              fontSize: 12,
                              color: palette.textSecondary,
                            }}
                          >
                            Archive
                          </Text>
                        </Pressable>
                      ) : (
                        <Pressable
                          onPress={() =>
                            void setCommentStatus(item.id, 'unanswered')
                          }
                          style={[
                            styles.secondaryBtn,
                            { borderColor: palette.border },
                          ]}
                        >
                          <Text
                            style={{
                              fontSize: 12,
                              color: palette.textSecondary,
                            }}
                          >
                            Move to unanswered
                          </Text>
                        </Pressable>
                      )}
                    </View>

                    {/* Inline Quick Reply Box */}
                    {isComposerOpen && (
                      <View
                        style={[
                          styles.replyComposer,
                          {
                            backgroundColor: palette.surfaceSubtle,
                            borderColor: palette.border,
                          },
                        ]}
                      >
                        <View style={styles.snippetsRow}>
                          {QUICK_SNIPPETS.map((snip, idx) => (
                            <Pressable
                              key={idx}
                              onPress={() =>
                                setDraftReplies((prev) => ({
                                  ...prev,
                                  [item.id]: snip,
                                }))
                              }
                              style={[
                                styles.snippetChip,
                                {
                                  backgroundColor: palette.surface,
                                  borderColor: palette.border,
                                },
                              ]}
                            >
                              <Text
                                style={{
                                  fontSize: 11,
                                  color: palette.textSecondary,
                                }}
                                numberOfLines={1}
                              >
                                + {snip.slice(0, 38)}…
                              </Text>
                            </Pressable>
                          ))}
                          {presets
                            .filter((p) => Boolean(p.firstComment))
                            .slice(0, 2)
                            .map((p) => (
                              <Pressable
                                key={p.id}
                                onPress={() =>
                                  setDraftReplies((prev) => ({
                                    ...prev,
                                    [item.id]: p.firstComment || '',
                                  }))
                                }
                                style={[
                                  styles.snippetChip,
                                  {
                                    backgroundColor: palette.surface,
                                    borderColor: palette.borderStrong,
                                  },
                                ]}
                              >
                                <Text
                                  style={{
                                    fontSize: 11,
                                    fontWeight: '600',
                                    color: palette.text,
                                  }}
                                >
                                  + {p.name}
                                </Text>
                              </Pressable>
                            ))}
                        </View>

                        <TextInput
                          multiline
                          style={[
                            styles.replyInput,
                            {
                              color: palette.text,
                              backgroundColor: palette.surface,
                              borderColor: palette.borderStrong,
                            },
                          ]}
                          placeholder={`Reply to ${item.authorHandle}…`}
                          placeholderTextColor={palette.textMuted}
                          value={currentDraft}
                          onChangeText={(val) =>
                            setDraftReplies((prev) => ({
                              ...prev,
                              [item.id]: val,
                            }))
                          }
                        />

                        <View
                          style={{
                            flexDirection: 'row',
                            justifyContent: 'flex-end',
                          }}
                        >
                          <Pressable
                            disabled={
                              !currentDraft.trim() || sendingId === item.id
                            }
                            onPress={() => void handleSendReply(item)}
                            style={[
                              styles.replyToggleBtn,
                              {
                                backgroundColor: currentDraft.trim()
                                  ? palette.ctaBg
                                  : palette.ctaDisabledBg,
                              },
                            ]}
                          >
                            <Text
                              style={{
                                fontSize: 12.5,
                                fontWeight: '600',
                                color: currentDraft.trim()
                                  ? palette.ctaText
                                  : palette.ctaDisabledText,
                              }}
                            >
                              {sendingId === item.id ? 'Sending…' : 'Send reply'}
                            </Text>
                          </Pressable>
                        </View>
                      </View>
                    )}
                  </View>
                </View>
              );
            })}
          </View>
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
    paddingTop: 24,
    paddingBottom: 48,
    gap: 18,
  },
  headerRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    flexWrap: 'wrap',
    gap: 12,
  },
  pageTitle: {
    fontSize: 22,
    fontWeight: '700',
    letterSpacing: -0.4,
  },
  pageSub: {
    fontSize: 13,
    lineHeight: 19,
  },
  syncBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    paddingHorizontal: 12,
    paddingVertical: 8,
    borderRadius: 8,
    borderWidth: 1,
  },
  syncBtnText: {
    fontSize: 12.5,
    fontWeight: '600',
  },
  tabsBar: {
    flexDirection: 'row',
    borderBottomWidth: 1,
    gap: 20,
  },
  tabItem: {
    paddingVertical: 10,
    borderBottomWidth: 2,
    borderBottomColor: 'transparent',
  },
  emptySheet: {
    borderWidth: 1,
    borderRadius: 12,
    padding: 32,
    alignItems: 'center',
    gap: 6,
  },
  emptyTitle: {
    fontSize: 15,
    fontWeight: '600',
  },
  emptySub: {
    fontSize: 13,
    textAlign: 'center',
    maxWidth: 440,
    lineHeight: 19,
  },
  commentCard: {
    borderWidth: 1,
    borderRadius: 12,
    overflow: 'hidden',
  },
  cardTopBar: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 16,
    paddingVertical: 9,
    borderBottomWidth: 1,
    gap: 10,
  },
  platformAndPost: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    flex: 1,
  },
  cardBody: {
    padding: 16,
    gap: 10,
  },
  authorRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 7,
  },
  commentBody: {
    fontSize: 14,
    lineHeight: 21,
  },
  repliesThread: {
    borderLeftWidth: 2,
    paddingLeft: 12,
    gap: 8,
    marginTop: 2,
  },
  actionsRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    paddingTop: 2,
  },
  replyToggleBtn: {
    paddingHorizontal: 13,
    paddingVertical: 6.5,
    borderRadius: 7,
  },
  secondaryBtn: {
    paddingHorizontal: 11,
    paddingVertical: 6,
    borderRadius: 7,
    borderWidth: 1,
  },
  replyComposer: {
    borderWidth: 1,
    borderRadius: 10,
    padding: 12,
    gap: 9,
    marginTop: 4,
  },
  snippetsRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 6,
  },
  snippetChip: {
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: 6,
    borderWidth: 1,
    maxWidth: 250,
  },
  replyInput: {
    minHeight: 62,
    borderWidth: 1,
    borderRadius: 8,
    padding: 10,
    fontSize: 13.5,
    textAlignVertical: 'top',
  },
});
