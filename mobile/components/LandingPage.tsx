import { Ionicons } from '@expo/vector-icons';
import { useRouter } from 'expo-router';
import React, { useState } from 'react';
import {
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  useWindowDimensions,
  View,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import {
  BillingInterval,
  formatDuration,
  PLAN_TIERS,
  PlanTierId,
  PLATFORM_ORDER,
  PLATFORM_SPECS,
  PlatformId,
} from '../../shared/platforms';
import { PLATFORM_ICONS } from '../constants/theme';
import { useOmniPost } from '../context/OmniPostContext';

type DemoFormat = 'video' | 'carousel' | 'text';

const DEMO_SCENARIOS: Record<
  DemoFormat,
  {
    label: string;
    mediaTag: string;
    mediaDetail: string;
    caption: string;
    hashtags: string;
    firstComment: string;
    enabled: PlatformId[];
    adaptationNotes: { platform: PlatformId; note: string }[];
  }
> = {
  video: {
    label: 'Video + 9:16 reframe',
    mediaTag: 'studio-lighting-cut.mp4 · 0:46',
    mediaDetail: '16:9 master -> Auto 9:16 crop for Reels, TikTok & Shorts',
    caption:
      'Swapped our bulky softbox for a 60W wall bounce — cleaner skin tones and half the setup time.',
    hashtags: '#filmmaking #creatorstudio #lighting',
    firstComment:
      'Full lighting diagram + gear list -> https://studio.example.com/setup',
    enabled: [
      'instagram_reels',
      'tiktok',
      'youtube_shorts',
      'youtube_long',
      'x',
      'linkedin',
    ],
    adaptationNotes: [
      {
        platform: 'youtube_shorts',
        note: 'Title auto-derived + #Shorts appended · 9:16 variant routed',
      },
      {
        platform: 'youtube_long',
        note: 'Original 16:9 widescreen master preserved · 1st comment queued',
      },
      {
        platform: 'instagram_reels',
        note: '9:16 Reel + profile grid enabled · Link placed in 1st comment',
      },
    ],
  },
  carousel: {
    label: 'Multi-photo carousel',
    mediaTag: '14 slides attached · 4:5 portrait',
    mediaDetail: '14/20 slides on IG, LinkedIn & Threads · First 4 sent on X',
    caption:
      'Fourteen small details from our Q3 product teardown — swipe through the before & after screens.',
    hashtags: '#productdesign #teardown #ux',
    firstComment:
      'Download the annotated Figma file -> https://studio.example.com/teardown',
    enabled: ['instagram_reels', 'linkedin', 'threads', 'tiktok', 'x', 'bluesky'],
    adaptationNotes: [
      {
        platform: 'instagram_reels',
        note: 'All 14 slides published as native swipe carousel (up to 20)',
      },
      {
        platform: 'tiktok',
        note: 'All 14 slides published via TikTok Photo Mode (up to 35)',
      },
      {
        platform: 'x',
        note: 'First 4 slides attached cleanly · Main text fitted under 280 chars',
      },
    ],
  },
  text: {
    label: 'Text + 1st-comment link',
    mediaTag: 'Text-only dispatch · 5 feed channels',
    mediaDetail: 'Main post kept link-free so feed distribution stays unthrottled',
    caption:
      'Publishing across five networks used to mean five browser tabs and twenty minutes of copy-pasting. Now it takes forty seconds.',
    hashtags: '#buildinpublic #indieweb',
    firstComment:
      'Read the full write-up here -> https://notes.example.com/workflow',
    enabled: ['x', 'threads', 'bluesky', 'linkedin', 'facebook_video'],
    adaptationNotes: [
      {
        platform: 'x',
        note: '172 / 280 chars · Auto self-reply tweet posts link immediately',
      },
      {
        platform: 'bluesky',
        note: '172 / 300 chars · AT Protocol root + reply record linked',
      },
      {
        platform: 'linkedin',
        note: 'Link kept out of main post body · Posted in 1st comment',
      },
    ],
  },
};

interface Props {
  onOpenAuth?: (initialMode: 'login' | 'register') => void;
}

export function LandingPage({ onOpenAuth }: Props) {
  const router = useRouter();
  const { width } = useWindowDimensions();
  const isDesktop = width >= 860;
  const isMedium = width >= 640;

  const {
    palette,
    toggleTheme,
    isSignedOut,
    loginDemoFounder,
    openBillingModal,
  } = useOmniPost();

  const [demoFormat, setDemoFormat] = useState<DemoFormat>('video');
  const [billingInterval, setBillingInterval] =
    useState<BillingInterval>('monthly');
  const [launchingDemo, setLaunchingDemo] = useState(false);

  const scenario = DEMO_SCENARIOS[demoFormat];

  const handlePrimaryStart = (mode: 'login' | 'register' = 'register') => {
    if (!isSignedOut) {
      router.push('/');
      return;
    }
    if (onOpenAuth) {
      onOpenAuth(mode);
    } else {
      router.push('/');
    }
  };

  const handleOpenInteractiveDemo = async () => {
    if (!isSignedOut) {
      router.push('/');
      return;
    }
    setLaunchingDemo(true);
    try {
      await loginDemoFounder();
      router.push('/');
    } finally {
      setLaunchingDemo(false);
    }
  };

  const handleSelectPricingTier = (tier: PlanTierId) => {
    if (!isSignedOut) {
      if (tier === 'free') {
        router.push('/');
      } else {
        openBillingModal(tier);
      }
      return;
    }
    handlePrimaryStart('register');
  };

  return (
    <SafeAreaView
      edges={['top']}
      style={[styles.safe, { backgroundColor: palette.bg }]}
    >
      {/* Top Editorial Navigation */}
      <View
        style={[
          styles.navOuter,
          {
            backgroundColor: palette.surface,
            borderBottomColor: palette.border,
          },
        ]}
      >
        <View style={styles.navInner}>
          <Pressable
            onPress={() => router.push('/welcome')}
            style={styles.brandRow}
          >
            <View
              style={[styles.brandDot, { backgroundColor: palette.accent }]}
            />
            <Text style={[styles.brandWordmark, { color: palette.text }]}>
              omnipost
            </Text>
          </Pressable>

          <View style={styles.navRight}>
            {isMedium && (
              <View style={styles.legalLinksRow}>
                <Pressable onPress={() => router.push('/privacy')}>
                  <Text
                    style={[styles.navTextLink, { color: palette.textSecondary }]}
                  >
                    Privacy
                  </Text>
                </Pressable>
                <Pressable onPress={() => router.push('/terms')}>
                  <Text
                    style={[styles.navTextLink, { color: palette.textSecondary }]}
                  >
                    Terms
                  </Text>
                </Pressable>
              </View>
            )}

            <Pressable
              onPress={toggleTheme}
              accessibilityLabel="Toggle color theme"
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

            {isSignedOut ? (
              <>
                <Pressable
                  onPress={() => handlePrimaryStart('login')}
                  style={[
                    styles.navOutlineBtn,
                    { borderColor: palette.borderStrong },
                  ]}
                >
                  <Text
                    style={[styles.navOutlineBtnText, { color: palette.text }]}
                  >
                    Sign in
                  </Text>
                </Pressable>

                <Pressable
                  onPress={() => handlePrimaryStart('register')}
                  style={[
                    styles.navSolidBtn,
                    { backgroundColor: palette.ctaBg },
                  ]}
                >
                  <Text
                    style={[styles.navSolidBtnText, { color: palette.ctaText }]}
                  >
                    Start free
                  </Text>
                </Pressable>
              </>
            ) : (
              <Pressable
                onPress={() => router.push('/')}
                style={[styles.navSolidBtn, { backgroundColor: palette.ctaBg }]}
              >
                <Text
                  style={[styles.navSolidBtnText, { color: palette.ctaText }]}
                >
                  Back to studio
                </Text>
                <Ionicons
                  name="arrow-forward"
                  size={13}
                  color={palette.ctaText}
                />
              </Pressable>
            )}
          </View>
        </View>
      </View>

      <ScrollView contentContainerStyle={styles.scrollContent}>
        <View style={styles.container}>
          {/* 1. Asymmetric Two-Column Hero */}
          <View
            style={[
              styles.heroGrid,
              { flexDirection: isDesktop ? 'row' : 'column' },
            ]}
          >
            <View style={[styles.heroLeft, isDesktop && { flex: 1.05 }]}>
              <Text
                style={[styles.eyebrow, { color: palette.textSecondary }]}
              >
                Cross-platform publishing for creators, brands & agencies
              </Text>

              <Text style={[styles.heroHeadline, { color: palette.text }]}>
                Upload once. Publish to every channel without opening eight apps.
              </Text>

              <Text
                style={[styles.heroBody, { color: palette.textSecondary }]}
              >
                Drop a video, up to 35 carousel photos, or a text post. Trim and
                reframe 16:9 to 9:16 in one place, tailor copy only where
                character limits differ, tuck links into the auto first-comment,
                and dispatch everywhere in a single pass.
              </Text>

              <View style={styles.heroActions}>
                <Pressable
                  onPress={() => handlePrimaryStart('register')}
                  style={[
                    styles.primaryHeroBtn,
                    { backgroundColor: palette.ctaBg },
                  ]}
                >
                  <Text
                    style={[
                      styles.primaryHeroBtnText,
                      { color: palette.ctaText },
                    ]}
                  >
                    {isSignedOut ? 'Create free account' : 'Open composer'}
                  </Text>
                </Pressable>

                <Pressable
                  disabled={launchingDemo}
                  onPress={() => void handleOpenInteractiveDemo()}
                  style={[
                    styles.secondaryHeroBtn,
                    {
                      backgroundColor: palette.surface,
                      borderColor: palette.borderStrong,
                    },
                  ]}
                >
                  <Text
                    style={[
                      styles.secondaryHeroBtnText,
                      { color: palette.text },
                    ]}
                  >
                    {launchingDemo
                      ? 'Opening studio...'
                      : 'Try live studio demo'}
                  </Text>
                  <Ionicons
                    name="arrow-forward"
                    size={14}
                    color={palette.text}
                  />
                </Pressable>
              </View>

              <Text style={[styles.heroMicroNote, { color: palette.textMuted }]}>
                Starter plan is $0 forever (1 workspace, 3 channels, 10
                posts/mo). Works on Web, iOS, and Android.
              </Text>
            </View>

            {/* Interactive Live Format Specimen Sheet */}
            <View style={[styles.heroRight, isDesktop && { flex: 0.95 }]}>
              <View
                style={[
                  styles.specimenSheet,
                  {
                    backgroundColor: palette.surface,
                    borderColor: palette.border,
                  },
                ]}
              >
                {/* Interactive Format Switcher */}
                <View
                  style={[
                    styles.specimenHeader,
                    {
                      borderBottomColor: palette.border,
                      backgroundColor: palette.surfaceSubtle,
                    },
                  ]}
                >
                  {(
                    [
                      ['video', 'Video'],
                      ['carousel', 'Carousel (14)'],
                      ['text', 'Text + Reply'],
                    ] as [DemoFormat, string][]
                  ).map(([key, label]) => {
                    const active = demoFormat === key;
                    return (
                      <Pressable
                        key={key}
                        onPress={() => setDemoFormat(key)}
                        style={[
                          styles.specimenTab,
                          active && {
                            backgroundColor: palette.surface,
                            borderColor: palette.border,
                            borderWidth: 1,
                          },
                        ]}
                      >
                        <Text
                          style={[
                            styles.specimenTabText,
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

                <View style={styles.specimenBody}>
                  {/* Enabled Destination Chips */}
                  <View style={styles.specimenChipsRow}>
                    {scenario.enabled.map((pid) => {
                      const spec = PLATFORM_SPECS[pid];
                      return (
                        <View
                          key={pid}
                          style={[
                            styles.specimenChip,
                            {
                              borderColor: palette.border,
                              backgroundColor: palette.surfaceSubtle,
                            },
                          ]}
                        >
                          <Ionicons
                            name={PLATFORM_ICONS[pid]}
                            size={12}
                            color={
                              pid === 'x' || pid === 'threads'
                                ? palette.text
                                : spec.brandColor
                            }
                          />
                          <Text
                            style={[
                              styles.specimenChipText,
                              { color: palette.text },
                            ]}
                          >
                            {spec.shortName}
                          </Text>
                        </View>
                      );
                    })}
                  </View>

                  {/* Media Summary Box */}
                  <View
                    style={[
                      styles.specimenMediaBox,
                      {
                        backgroundColor: palette.surfaceSubtle,
                        borderColor: palette.border,
                      },
                    ]}
                  >
                    <Text
                      style={[styles.specimenMediaTitle, { color: palette.text }]}
                    >
                      {scenario.mediaTag}
                    </Text>
                    <Text
                      style={[
                        styles.specimenMediaSub,
                        { color: palette.textSecondary },
                      ]}
                    >
                      {scenario.mediaDetail}
                    </Text>
                  </View>

                  {/* Caption + Auto First Comment Preview */}
                  <View style={{ gap: 6 }}>
                    <Text
                      style={[styles.specimenCaption, { color: palette.text }]}
                    >
                      {scenario.caption}
                    </Text>
                    <Text
                      style={[
                        styles.specimenHashtags,
                        { color: palette.textMuted },
                      ]}
                    >
                      {scenario.hashtags}
                    </Text>
                  </View>

                  <View
                    style={[
                      styles.specimenFirstComment,
                      {
                        backgroundColor: palette.surfaceSubtle,
                        borderColor: palette.border,
                      },
                    ]}
                  >
                    <Text
                      style={[
                        styles.specimenFcLabel,
                        { color: palette.accent },
                      ]}
                    >
                      ↳ Auto 1st comment · Posted right after publish
                    </Text>
                    <Text
                      style={[
                        styles.specimenFcBody,
                        { color: palette.textSecondary },
                      ]}
                      numberOfLines={1}
                    >
                      {scenario.firstComment}
                    </Text>
                  </View>

                  {/* Per-Platform Automatic Adaptations */}
                  <View
                    style={[
                      styles.adaptationsList,
                      { borderTopColor: palette.border },
                    ]}
                  >
                    {scenario.adaptationNotes.map((item) => (
                      <View
                        key={item.platform}
                        style={styles.adaptationLine}
                      >
                        <Ionicons
                          name={PLATFORM_ICONS[item.platform]}
                          size={12.5}
                          color={PLATFORM_SPECS[item.platform].brandColor}
                        />
                        <Text
                          style={[
                            styles.adaptationText,
                            { color: palette.textSecondary },
                          ]}
                          numberOfLines={1}
                        >
                          <Text
                            style={{ fontWeight: '600', color: palette.text }}
                          >
                            {PLATFORM_SPECS[item.platform].shortName}:{' '}
                          </Text>
                          {item.note}
                        </Text>
                      </View>
                    ))}
                  </View>
                </View>
              </View>
            </View>
          </View>

          {/* 2. Three-Column Numbered Workflow Breakdown */}
          <View style={{ gap: 12 }}>
            <Text style={[styles.sectionTitle, { color: palette.text }]}>
              Built for the parts of publishing that actually waste time
            </Text>

            <View
              style={[
                styles.workflowSheet,
                {
                  backgroundColor: palette.surface,
                  borderColor: palette.border,
                  flexDirection: isDesktop ? 'row' : 'column',
                },
              ]}
            >
              <View
                style={[
                  styles.workflowCol,
                  isDesktop
                    ? { borderRightWidth: 1, borderRightColor: palette.border }
                    : { borderBottomWidth: 1, borderBottomColor: palette.border },
                ]}
              >
                <Text style={[styles.stepNumber, { color: palette.accent }]}>
                  01
                </Text>
                <Text style={[styles.stepHeading, { color: palette.text }]}>
                  Last-mile video & 35-slide carousels
                </Text>
                <Text
                  style={[styles.stepBody, { color: palette.textSecondary }]}
                >
                  Trim dead air, pick a cover frame, and let FFmpeg generate
                  both 16:9 widescreen and 9:16 vertical cuts from a single
                  upload—or organize up to 35 carousel photos in one grid.
                </Text>
              </View>

              <View
                style={[
                  styles.workflowCol,
                  isDesktop
                    ? { borderRightWidth: 1, borderRightColor: palette.border }
                    : { borderBottomWidth: 1, borderBottomColor: palette.border },
                ]}
              >
                <Text style={[styles.stepNumber, { color: palette.accent }]}>
                  02
                </Text>
                <Text style={[styles.stepHeading, { color: palette.text }]}>
                  Write once, override only when needed
                </Text>
                <Text
                  style={[styles.stepBody, { color: palette.textSecondary }]}
                >
                  Insert saved hashtag and CTA presets, tighten 280-character X
                  or 300-character Bluesky copy in one click, and auto-post
                  links in the first reply so main-feed reach stays intact.
                </Text>
              </View>

              <View style={styles.workflowCol}>
                <Text style={[styles.stepNumber, { color: palette.accent }]}>
                  03
                </Text>
                <Text style={[styles.stepHeading, { color: palette.text }]}>
                  Isolated workspaces & side-by-side insights
                </Text>
                <Text
                  style={[styles.stepBody, { color: palette.textSecondary }]}
                >
                  Keep personal, company, and agency client accounts completely
                  separate—and see which channel drove the most views, replies,
                  and link clicks per post without checking eight apps.
                </Text>
              </View>
            </View>
          </View>

          {/* 3. Factual 9-Destination Specification Matrix */}
          <View style={{ gap: 12 }}>
            <View style={{ gap: 3 }}>
              <Text style={[styles.sectionTitle, { color: palette.text }]}>
                Nine destinations, direct official APIs
              </Text>
              <Text
                style={[styles.sectionSub, { color: palette.textSecondary }]}
              >
                OmniPost connects via official OAuth 2.0 and AT Protocol
                endpoints—never screen-scraping or unofficial password bots.
              </Text>
            </View>

            <View
              style={[
                styles.matrixSheet,
                {
                  backgroundColor: palette.surface,
                  borderColor: palette.border,
                },
              ]}
            >
              {isMedium && (
                <View
                  style={[
                    styles.matrixHeadRow,
                    {
                      borderBottomColor: palette.border,
                      backgroundColor: palette.surfaceSubtle,
                    },
                  ]}
                >
                  <Text
                    style={[
                      styles.matrixTh,
                      { color: palette.textMuted, flex: 1.4 },
                    ]}
                  >
                    Destination
                  </Text>
                  <Text
                    style={[
                      styles.matrixTh,
                      { color: palette.textMuted, flex: 1 },
                    ]}
                  >
                    Video limit
                  </Text>
                  <Text
                    style={[
                      styles.matrixTh,
                      { color: palette.textMuted, flex: 1 },
                    ]}
                  >
                    Photo carousel
                  </Text>
                  <Text
                    style={[
                      styles.matrixTh,
                      { color: palette.textMuted, flex: 0.9 },
                    ]}
                  >
                    Text-only
                  </Text>
                  <Text
                    style={[
                      styles.matrixTh,
                      { color: palette.textMuted, flex: 0.9 },
                    ]}
                  >
                    Auto 1st reply
                  </Text>
                </View>
              )}

              {PLATFORM_ORDER.map((pid, idx) => {
                const spec = PLATFORM_SPECS[pid];
                return (
                  <View
                    key={pid}
                    style={[
                      styles.matrixRow,
                      idx < PLATFORM_ORDER.length - 1 && {
                        borderBottomWidth: 1,
                        borderBottomColor: palette.border,
                      },
                    ]}
                  >
                    <View style={[styles.matrixChannelCell, { flex: 1.4 }]}>
                      <Ionicons
                        name={PLATFORM_ICONS[pid]}
                        size={15}
                        color={
                          pid === 'x' || pid === 'threads'
                            ? palette.text
                            : spec.brandColor
                        }
                      />
                      <Text
                        style={[
                          styles.matrixChannelName,
                          { color: palette.text },
                        ]}
                      >
                        {spec.name}
                      </Text>
                    </View>

                    {isMedium ? (
                      <>
                        <Text
                          style={[
                            styles.matrixTd,
                            { color: palette.textSecondary, flex: 1 },
                          ]}
                        >
                          Up to {formatDuration(spec.maxDurationSec)} (
                          {spec.idealAspect === 'both'
                            ? '9:16 / 16:9'
                            : spec.idealAspect}
                          )
                        </Text>
                        <Text
                          style={[
                            styles.matrixTd,
                            { color: palette.textSecondary, flex: 1 },
                          ]}
                        >
                          {spec.supportsPhotos
                            ? `Up to ${spec.maxPhotos} slides`
                            : '—'}
                        </Text>
                        <Text
                          style={[
                            styles.matrixTd,
                            { color: palette.textSecondary, flex: 0.9 },
                          ]}
                        >
                          {spec.supportsTextOnly
                            ? `${spec.maxCaptionChars.toLocaleString()} chars`
                            : '—'}
                        </Text>
                        <Text
                          style={[
                            styles.matrixTd,
                            { color: palette.textSecondary, flex: 0.9 },
                          ]}
                        >
                          {spec.supportsFirstComment ? 'Supported' : '—'}
                        </Text>
                      </>
                    ) : (
                      <Text
                        style={[
                          styles.matrixTd,
                          { color: palette.textSecondary },
                        ]}
                      >
                        {spec.supportsPhotos
                          ? `${spec.maxPhotos} photos · `
                          : ''}
                        {formatDuration(spec.maxDurationSec)} video
                      </Text>
                    )}
                  </View>
                );
              })}
            </View>
          </View>

          {/* 4. Transparent Flat Pricing */}
          <View style={{ gap: 14 }}>
            <View style={styles.pricingHeaderRow}>
              <View style={{ gap: 3, flexShrink: 1 }}>
                <Text style={[styles.sectionTitle, { color: palette.text }]}>
                  Flat pricing—never per social profile
                </Text>
                <Text
                  style={[styles.sectionSub, { color: palette.textSecondary }]}
                >
                  Most schedulers charge $6–$15 for every single channel you
                  connect. OmniPost charges one flat rate.
                </Text>
              </View>

              <View
                style={[
                  styles.billingSwitch,
                  {
                    backgroundColor: palette.surface,
                    borderColor: palette.border,
                  },
                ]}
              >
                <Pressable
                  onPress={() => setBillingInterval('monthly')}
                  style={[
                    styles.billingSwitchBtn,
                    billingInterval === 'monthly' && {
                      backgroundColor: palette.surfaceMuted,
                    },
                  ]}
                >
                  <Text
                    style={[
                      styles.billingSwitchText,
                      {
                        color:
                          billingInterval === 'monthly'
                            ? palette.text
                            : palette.textSecondary,
                        fontWeight:
                          billingInterval === 'monthly' ? '600' : '400',
                      },
                    ]}
                  >
                    Monthly
                  </Text>
                </Pressable>
                <Pressable
                  onPress={() => setBillingInterval('annual')}
                  style={[
                    styles.billingSwitchBtn,
                    billingInterval === 'annual' && {
                      backgroundColor: palette.surfaceMuted,
                    },
                  ]}
                >
                  <Text
                    style={[
                      styles.billingSwitchText,
                      {
                        color:
                          billingInterval === 'annual'
                            ? palette.text
                            : palette.textSecondary,
                        fontWeight:
                          billingInterval === 'annual' ? '600' : '400',
                      },
                    ]}
                  >
                    Annual (-20%)
                  </Text>
                </Pressable>
              </View>
            </View>

            <View
              style={[
                styles.pricingGrid,
                { flexDirection: isDesktop ? 'row' : 'column' },
              ]}
            >
              {(['free', 'creator', 'studio'] as PlanTierId[]).map((tierId) => {
                const spec = PLAN_TIERS[tierId];
                const price =
                  billingInterval === 'annual'
                    ? spec.annualMonthlyPriceUsd
                    : spec.monthlyPriceUsd;
                const featured = tierId === 'creator';

                return (
                  <View
                    key={tierId}
                    style={[
                      styles.pricingCard,
                      {
                        backgroundColor: palette.surface,
                        borderColor: featured ? palette.text : palette.border,
                        borderWidth: featured ? 1.5 : 1,
                      },
                    ]}
                  >
                    <View style={{ gap: 6 }}>
                      <View style={styles.pricingNameRow}>
                        <Text
                          style={[styles.pricingName, { color: palette.text }]}
                        >
                          {spec.name}
                        </Text>
                        {featured && (
                          <View
                            style={[
                              styles.featuredPill,
                              { backgroundColor: palette.surfaceMuted },
                            ]}
                          >
                            <Text
                              style={[
                                styles.featuredPillText,
                                { color: palette.text },
                              ]}
                            >
                              Creator pick
                            </Text>
                          </View>
                        )}
                      </View>
                      <Text
                        style={[
                          styles.pricingTagline,
                          { color: palette.textSecondary },
                        ]}
                      >
                        {spec.tagline}
                      </Text>
                      <View style={styles.pricingAmountRow}>
                        <Text
                          style={[
                            styles.pricingDollar,
                            { color: palette.text },
                          ]}
                        >
                          ${price}
                        </Text>
                        <Text
                          style={[
                            styles.pricingPeriod,
                            { color: palette.textMuted },
                          ]}
                        >
                          {price === 0
                            ? 'forever'
                            : billingInterval === 'annual'
                            ? '/ mo · billed yearly'
                            : '/ month'}
                        </Text>
                      </View>
                    </View>

                    <View style={styles.pricingFeatures}>
                      {spec.features.map((f) => (
                        <View key={f} style={styles.pricingFeatureRow}>
                          <Ionicons
                            name="checkmark"
                            size={14}
                            color={palette.text}
                          />
                          <Text
                            style={[
                              styles.pricingFeatureText,
                              { color: palette.textSecondary },
                            ]}
                          >
                            {f}
                          </Text>
                        </View>
                      ))}
                    </View>

                    <Pressable
                      onPress={() => handleSelectPricingTier(tierId)}
                      style={[
                        styles.pricingBtn,
                        featured
                          ? { backgroundColor: palette.ctaBg }
                          : {
                              backgroundColor: palette.surfaceSubtle,
                              borderWidth: 1,
                              borderColor: palette.borderStrong,
                            },
                      ]}
                    >
                      <Text
                        style={[
                          styles.pricingBtnText,
                          {
                            color: featured ? palette.ctaText : palette.text,
                          },
                        ]}
                      >
                        {tierId === 'free'
                          ? 'Start on Starter'
                          : `Choose ${spec.name}`}
                      </Text>
                    </Pressable>
                  </View>
                );
              })}
            </View>
          </View>

          {/* 5. Reviewer-Ready Compliance Footer */}
          <View
            style={[styles.siteFooter, { borderTopColor: palette.border }]}
          >
            <View style={{ gap: 3 }}>
              <View style={styles.brandRow}>
                <View
                  style={[styles.brandDot, { backgroundColor: palette.accent }]}
                />
                <Text style={[styles.footerBrand, { color: palette.text }]}>
                  omnipost
                </Text>
              </View>
              <Text style={[styles.footerCopy, { color: palette.textMuted }]}>
                Direct OAuth 2.0 & AT Protocol publishing studio. Users retain
                100% ownership of all uploaded media.
              </Text>
            </View>

            <View style={styles.footerLinks}>
              <Pressable onPress={() => router.push('/privacy')}>
                <Text
                  style={[styles.footerLink, { color: palette.textSecondary }]}
                >
                  Privacy Policy & Data Deletion
                </Text>
              </Pressable>
              <Pressable onPress={() => router.push('/terms')}>
                <Text
                  style={[styles.footerLink, { color: palette.textSecondary }]}
                >
                  Terms of Service
                </Text>
              </Pressable>
              <Pressable onPress={() => void handleOpenInteractiveDemo()}>
                <Text
                  style={[styles.footerLink, { color: palette.textSecondary }]}
                >
                  Live Demo
                </Text>
              </Pressable>
            </View>
          </View>
        </View>
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safe: {
    flex: 1,
  },
  navOuter: {
    borderBottomWidth: 1,
    paddingHorizontal: 20,
  },
  navInner: {
    maxWidth: 1060,
    width: '100%',
    alignSelf: 'center',
    height: 56,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: 12,
  },
  brandRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 7,
  },
  brandDot: {
    width: 9,
    height: 9,
    borderRadius: 5,
  },
  brandWordmark: {
    fontSize: 17.5,
    fontWeight: '700',
    letterSpacing: -0.5,
  },
  navRight: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
  },
  legalLinksRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 16,
    marginRight: 6,
  },
  navTextLink: {
    fontSize: 13,
    fontWeight: '500',
  },
  iconBtn: {
    width: 31,
    height: 31,
    borderRadius: 7,
    borderWidth: 1,
    alignItems: 'center',
    justifyContent: 'center',
  },
  navOutlineBtn: {
    borderWidth: 1,
    borderRadius: 7,
    paddingHorizontal: 12,
    paddingVertical: 6.5,
  },
  navOutlineBtnText: {
    fontSize: 12.5,
    fontWeight: '600',
  },
  navSolidBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 5,
    borderRadius: 7,
    paddingHorizontal: 13,
    paddingVertical: 7,
  },
  navSolidBtnText: {
    fontSize: 12.5,
    fontWeight: '600',
  },
  scrollContent: {
    paddingHorizontal: 20,
    paddingTop: 34,
    paddingBottom: 64,
  },
  container: {
    maxWidth: 1060,
    width: '100%',
    alignSelf: 'center',
    gap: 48,
  },
  heroGrid: {
    alignItems: 'center',
    gap: 32,
  },
  heroLeft: {
    gap: 14,
  },
  eyebrow: {
    fontSize: 12.5,
    fontWeight: '600',
  },
  heroHeadline: {
    fontSize: 34,
    lineHeight: 40,
    fontWeight: '700',
    letterSpacing: -0.9,
  },
  heroBody: {
    fontSize: 15,
    lineHeight: 23,
  },
  heroActions: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    alignItems: 'center',
    gap: 10,
    paddingTop: 4,
  },
  primaryHeroBtn: {
    paddingHorizontal: 18,
    paddingVertical: 11,
    borderRadius: 8,
  },
  primaryHeroBtnText: {
    fontSize: 14,
    fontWeight: '600',
  },
  secondaryHeroBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    paddingHorizontal: 15,
    paddingVertical: 10.5,
    borderRadius: 8,
    borderWidth: 1,
  },
  secondaryHeroBtnText: {
    fontSize: 13.5,
    fontWeight: '600',
  },
  heroMicroNote: {
    fontSize: 12,
  },
  heroRight: {
    width: '100%',
  },
  specimenSheet: {
    borderWidth: 1,
    borderRadius: 13,
    overflow: 'hidden',
  },
  specimenHeader: {
    flexDirection: 'row',
    padding: 6,
    gap: 5,
    borderBottomWidth: 1,
  },
  specimenTab: {
    flex: 1,
    paddingVertical: 6.5,
    borderRadius: 7,
    alignItems: 'center',
  },
  specimenTabText: {
    fontSize: 12,
  },
  specimenBody: {
    padding: 16,
    gap: 12,
  },
  specimenChipsRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 6,
  },
  specimenChip: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 5,
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: 6,
    borderWidth: 1,
  },
  specimenChipText: {
    fontSize: 11.5,
    fontWeight: '600',
  },
  specimenMediaBox: {
    borderWidth: 1,
    borderRadius: 8,
    paddingHorizontal: 11,
    paddingVertical: 9,
    gap: 2,
  },
  specimenMediaTitle: {
    fontSize: 12.5,
    fontWeight: '600',
  },
  specimenMediaSub: {
    fontSize: 11.5,
  },
  specimenCaption: {
    fontSize: 13.5,
    lineHeight: 19,
  },
  specimenHashtags: {
    fontSize: 12,
  },
  specimenFirstComment: {
    borderWidth: 1,
    borderRadius: 8,
    paddingHorizontal: 11,
    paddingVertical: 8,
    gap: 2,
  },
  specimenFcLabel: {
    fontSize: 11,
    fontWeight: '600',
  },
  specimenFcBody: {
    fontSize: 12,
  },
  adaptationsList: {
    borderTopWidth: 1,
    paddingTop: 10,
    gap: 6,
  },
  adaptationLine: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 7,
  },
  adaptationText: {
    flex: 1,
    fontSize: 11.5,
  },
  sectionTitle: {
    fontSize: 21,
    fontWeight: '700',
    letterSpacing: -0.4,
  },
  sectionSub: {
    fontSize: 13.5,
    lineHeight: 20,
  },
  workflowSheet: {
    borderWidth: 1,
    borderRadius: 12,
    overflow: 'hidden',
  },
  workflowCol: {
    flex: 1,
    padding: 20,
    gap: 7,
  },
  stepNumber: {
    fontSize: 12,
    fontWeight: '700',
  },
  stepHeading: {
    fontSize: 15,
    fontWeight: '700',
    letterSpacing: -0.2,
  },
  stepBody: {
    fontSize: 13.5,
    lineHeight: 20,
  },
  matrixSheet: {
    borderWidth: 1,
    borderRadius: 12,
    overflow: 'hidden',
  },
  matrixHeadRow: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 18,
    paddingVertical: 10,
    borderBottomWidth: 1,
    gap: 10,
  },
  matrixTh: {
    fontSize: 11.5,
    fontWeight: '600',
  },
  matrixRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 18,
    paddingVertical: 11,
    gap: 10,
  },
  matrixChannelCell: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 9,
  },
  matrixChannelName: {
    fontSize: 13.5,
    fontWeight: '600',
  },
  matrixTd: {
    fontSize: 12.5,
  },
  pricingHeaderRow: {
    flexDirection: 'row',
    alignItems: 'flex-end',
    justifyContent: 'space-between',
    flexWrap: 'wrap',
    gap: 12,
  },
  billingSwitch: {
    flexDirection: 'row',
    borderWidth: 1,
    borderRadius: 8,
    padding: 3,
    gap: 2,
  },
  billingSwitchBtn: {
    paddingHorizontal: 10,
    paddingVertical: 5,
    borderRadius: 6,
  },
  billingSwitchText: {
    fontSize: 12,
  },
  pricingGrid: {
    gap: 14,
  },
  pricingCard: {
    flex: 1,
    borderRadius: 12,
    padding: 20,
    justifyContent: 'space-between',
    gap: 18,
  },
  pricingNameRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: 8,
  },
  pricingName: {
    fontSize: 16.5,
    fontWeight: '700',
  },
  featuredPill: {
    paddingHorizontal: 8,
    paddingVertical: 2.5,
    borderRadius: 5,
  },
  featuredPillText: {
    fontSize: 11,
    fontWeight: '600',
  },
  pricingTagline: {
    fontSize: 12.5,
    lineHeight: 18,
    minHeight: 36,
  },
  pricingAmountRow: {
    flexDirection: 'row',
    alignItems: 'baseline',
    gap: 5,
    marginTop: 4,
  },
  pricingDollar: {
    fontSize: 29,
    fontWeight: '700',
    letterSpacing: -0.8,
  },
  pricingPeriod: {
    fontSize: 12,
  },
  pricingFeatures: {
    gap: 8,
    flex: 1,
  },
  pricingFeatureRow: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: 7,
  },
  pricingFeatureText: {
    flex: 1,
    fontSize: 12.5,
    lineHeight: 18,
  },
  pricingBtn: {
    paddingVertical: 10,
    borderRadius: 8,
    alignItems: 'center',
  },
  pricingBtnText: {
    fontSize: 13,
    fontWeight: '600',
  },
  siteFooter: {
    borderTopWidth: 1,
    paddingTop: 22,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    flexWrap: 'wrap',
    gap: 16,
  },
  footerBrand: {
    fontSize: 15,
    fontWeight: '700',
    letterSpacing: -0.3,
  },
  footerCopy: {
    fontSize: 12,
  },
  footerLinks: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 18,
  },
  footerLink: {
    fontSize: 12.5,
    textDecorationLine: 'underline',
  },
});
