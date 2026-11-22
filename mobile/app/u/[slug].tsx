import { Ionicons } from '@expo/vector-icons';
import { useLocalSearchParams, useRouter } from 'expo-router';
import React, { useEffect, useState } from 'react';
import {
  ActivityIndicator,
  Linking,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { PublicBioPagePayload } from '../../../shared/platforms';
import {
  ACCOUNT_GROUP_ICONS,
  DARK_PALETTE,
  LIGHT_PALETTE,
} from '../../constants/theme';
import { fetchPublicBioPageApi, recordBioClickApi } from '../../lib/api';

function openExternalUrl(url: string) {
  if (Platform.OS === 'web' && typeof window !== 'undefined') {
    window.open(url, '_blank', 'noopener,noreferrer');
    return;
  }
  void Linking.openURL(url);
}

export default function PublicBioPageScreen() {
  const router = useRouter();
  const params = useLocalSearchParams<{ slug: string }>();
  const slug = String(params.slug || 'creatorstudio');

  const [data, setData] = useState<PublicBioPagePayload | null>(null);
  const [loading, setLoading] = useState(true);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    setErrorMsg(null);
    fetchPublicBioPageApi(slug, true)
      .then((res) => {
        if (!cancelled) setData(res);
      })
      .catch((err: any) => {
        if (!cancelled) {
          setErrorMsg(err?.message || 'This Link-in-Bio page does not exist.');
        }
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [slug]);

  const palette =
    data?.config.theme === 'graphite' ? DARK_PALETTE : LIGHT_PALETTE;

  const handleLinkPress = async (linkId: string, fallbackUrl: string) => {
    openExternalUrl(fallbackUrl);
    try {
      await recordBioClickApi(slug, 'link', linkId);
    } catch {
      // Ignore background analytics failure
    }
  };

  const handlePostCardPress = async (jobId: string, fallbackUrl: string) => {
    openExternalUrl(fallbackUrl);
    try {
      await recordBioClickApi(slug, 'post', jobId);
    } catch {
      // Ignore background analytics failure
    }
  };

  if (loading) {
    return (
      <SafeAreaView
        style={[styles.centerWrap, { backgroundColor: LIGHT_PALETTE.bg }]}
      >
        <ActivityIndicator size="small" color={LIGHT_PALETTE.text} />
      </SafeAreaView>
    );
  }

  if (errorMsg || !data) {
    return (
      <SafeAreaView
        style={[styles.centerWrap, { backgroundColor: LIGHT_PALETTE.bg }]}
      >
        <Text
          style={{
            fontSize: 16,
            fontWeight: '600',
            color: LIGHT_PALETTE.text,
          }}
        >
          Bio page not found
        </Text>
        <Text
          style={{
            fontSize: 13,
            color: LIGHT_PALETTE.textSecondary,
            marginTop: 6,
          }}
        >
          {errorMsg}
        </Text>
        <Pressable
          onPress={() => router.push('/')}
          style={[
            styles.backStudioBtn,
            { borderColor: LIGHT_PALETTE.borderStrong, marginTop: 16 },
          ]}
        >
          <Text style={{ fontSize: 12.5, fontWeight: '600', color: LIGHT_PALETTE.text }}>
            Back to OmniPost
          </Text>
        </Pressable>
      </SafeAreaView>
    );
  }

  const initials = data.config.headline
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((p) => p[0]?.toUpperCase() || '')
    .join('');

  return (
    <SafeAreaView
      style={[styles.safe, { backgroundColor: palette.bg }]}
      edges={['top', 'bottom']}
    >
      <ScrollView contentContainerStyle={styles.scrollContent}>
        {/* Top subtle studio return bar */}
        <View style={styles.topUtilityBar}>
          <Pressable
            onPress={() => router.push('/')}
            style={[
              styles.backStudioBtn,
              {
                borderColor: palette.border,
                backgroundColor: palette.surface,
              },
            ]}
          >
            <Ionicons name="arrow-back" size={13} color={palette.textSecondary} />
            <Text
              style={{
                fontSize: 12,
                fontWeight: '500',
                color: palette.textSecondary,
              }}
            >
              Studio
            </Text>
          </Pressable>

          <Text style={{ fontSize: 11.5, color: palette.textMuted }}>
            /u/{data.config.slug}
          </Text>
        </View>

        {/* Identity Card */}
        <View style={styles.identitySection}>
          <View
            style={[
              styles.avatarCircle,
              {
                backgroundColor: palette.surface,
                borderColor: palette.borderStrong,
              },
            ]}
          >
            <View
              style={[
                styles.accentDot,
                { backgroundColor: data.workspaceColor },
              ]}
            />
            <Text style={[styles.avatarInitials, { color: palette.text }]}>
              {initials || 'OP'}
            </Text>
          </View>

          <Text style={[styles.headline, { color: palette.text }]}>
            {data.config.headline}
          </Text>

          {Boolean(data.config.bio) && (
            <Text style={[styles.bioText, { color: palette.textSecondary }]}>
              {data.config.bio}
            </Text>
          )}

          {data.accounts.length > 0 && (
            <View style={styles.socialIconsRow}>
              {data.accounts.map((acc) => (
                <View
                  key={`${acc.platformGroup}_${acc.handle}`}
                  style={[
                    styles.socialChip,
                    {
                      backgroundColor: palette.surface,
                      borderColor: palette.border,
                    },
                  ]}
                >
                  <Ionicons
                    name={ACCOUNT_GROUP_ICONS[acc.platformGroup] as any}
                    size={13}
                    color={palette.textSecondary}
                  />
                  <Text
                    style={{
                      fontSize: 11.5,
                      color: palette.textSecondary,
                      fontWeight: '500',
                    }}
                  >
                    {acc.handle}
                  </Text>
                </View>
              ))}
            </View>
          )}
        </View>

        {/* Pinned CTA Links */}
        {data.config.customLinks.length > 0 && (
          <View style={styles.linksStack}>
            {data.config.customLinks.map((lnk) => (
              <Pressable
                key={lnk.id}
                onPress={() => void handleLinkPress(lnk.id, lnk.url)}
                style={[
                  styles.pinnedLinkCard,
                  {
                    backgroundColor: palette.surface,
                    borderColor: palette.borderStrong,
                  },
                ]}
              >
                <Text
                  style={[styles.pinnedLinkLabel, { color: palette.text }]}
                  numberOfLines={1}
                >
                  {lnk.label}
                </Text>
                <Ionicons
                  name="arrow-up-right-box-outline"
                  size={16}
                  color={palette.textSecondary}
                />
              </Pressable>
            ))}
          </View>
        )}

        {/* Recent Post Links Grid */}
        {data.posts.length > 0 && (
          <View style={{ gap: 10 }}>
            <Text
              style={[styles.sectionEyebrow, { color: palette.textSecondary }]}
            >
              Featured from recent posts
            </Text>

            <View style={styles.postsGrid}>
              {data.posts.map((post) => (
                <Pressable
                  key={post.jobId}
                  onPress={() =>
                    void handlePostCardPress(post.jobId, post.destinationUrl)
                  }
                  style={[
                    styles.postCard,
                    {
                      backgroundColor: palette.surface,
                      borderColor: palette.border,
                    },
                  ]}
                >
                  <View
                    style={[
                      styles.postVisualBand,
                      {
                        backgroundColor:
                          post.sampleTint || palette.surfaceSubtle,
                        borderBottomColor: palette.border,
                      },
                    ]}
                  >
                    <Ionicons
                      name={
                        post.postKind === 'video'
                          ? 'play-circle-outline'
                          : post.postKind === 'photo'
                          ? 'images-outline'
                          : 'document-text-outline'
                      }
                      size={18}
                      color={post.sampleTint ? '#F5F4F0' : palette.textSecondary}
                    />
                    <Text
                      style={{
                        fontSize: 10.5,
                        fontWeight: '600',
                        color: post.sampleTint
                          ? '#F5F4F0'
                          : palette.textSecondary,
                      }}
                    >
                      {post.postKind === 'video'
                        ? 'Video link'
                        : post.postKind === 'photo'
                        ? `${post.photoCount ?? 1}-slide link`
                        : 'Post link'}
                    </Text>
                  </View>

                  <View style={{ padding: 12, gap: 5 }}>
                    <Text
                      style={[styles.postCardTitle, { color: palette.text }]}
                      numberOfLines={2}
                    >
                      {post.title}
                    </Text>
                    <Text
                      style={{
                        fontSize: 11.5,
                        color: palette.accent,
                        fontWeight: '600',
                      }}
                      numberOfLines={1}
                    >
                      Open link ↗
                    </Text>
                  </View>
                </Pressable>
              ))}
            </View>
          </View>
        )}

        {/* Quiet Editorial Footer */}
        <View style={styles.footerRow}>
          <View
            style={[styles.footerDot, { backgroundColor: palette.accent }]}
          />
          <Text style={{ fontSize: 12, color: palette.textMuted }}>
            Published with{' '}
            <Text style={{ fontWeight: '700', color: palette.textSecondary }}>
              omnipost
            </Text>
          </Text>
        </View>
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safe: {
    flex: 1,
  },
  centerWrap: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    padding: 24,
  },
  scrollContent: {
    width: '100%',
    maxWidth: 520,
    alignSelf: 'center',
    paddingHorizontal: 20,
    paddingTop: 14,
    paddingBottom: 48,
    gap: 24,
  },
  topUtilityBar: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  backStudioBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 5,
    paddingHorizontal: 10,
    paddingVertical: 5,
    borderRadius: 7,
    borderWidth: 1,
  },
  identitySection: {
    alignItems: 'center',
    gap: 8,
    paddingTop: 4,
  },
  avatarCircle: {
    width: 64,
    height: 64,
    borderRadius: 32,
    borderWidth: 1,
    alignItems: 'center',
    justifyContent: 'center',
    position: 'relative',
  },
  accentDot: {
    position: 'absolute',
    top: 4,
    right: 4,
    width: 10,
    height: 10,
    borderRadius: 5,
  },
  avatarInitials: {
    fontSize: 20,
    fontWeight: '700',
    letterSpacing: -0.5,
  },
  headline: {
    fontSize: 22,
    fontWeight: '700',
    letterSpacing: -0.4,
    textAlign: 'center',
    marginTop: 2,
  },
  bioText: {
    fontSize: 13.5,
    lineHeight: 20,
    textAlign: 'center',
    maxWidth: 420,
  },
  socialIconsRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    justifyContent: 'center',
    gap: 6,
    marginTop: 4,
  },
  socialChip: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 5,
    paddingHorizontal: 9,
    paddingVertical: 4,
    borderRadius: 999,
    borderWidth: 1,
  },
  linksStack: {
    gap: 9,
  },
  pinnedLinkCard: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: 12,
    paddingHorizontal: 16,
    paddingVertical: 14,
    borderRadius: 11,
    borderWidth: 1,
  },
  pinnedLinkLabel: {
    flex: 1,
    fontSize: 14,
    fontWeight: '600',
  },
  sectionEyebrow: {
    fontSize: 12,
    fontWeight: '600',
  },
  postsGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 10,
  },
  postCard: {
    width: '48%',
    minWidth: 195,
    flexGrow: 1,
    borderRadius: 11,
    borderWidth: 1,
    overflow: 'hidden',
  },
  postVisualBand: {
    height: 68,
    borderBottomWidth: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 6,
  },
  postCardTitle: {
    fontSize: 13,
    fontWeight: '600',
    lineHeight: 18,
  },
  footerRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 6,
    paddingTop: 12,
  },
  footerDot: {
    width: 7,
    height: 7,
    borderRadius: 4,
  },
});
