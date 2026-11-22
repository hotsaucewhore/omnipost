import { Ionicons } from '@expo/vector-icons';
import { useRouter } from 'expo-router';
import React from 'react';
import {
  Linking,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useOmniPost } from '../context/OmniPostContext';

export default function TermsOfServiceScreen() {
  const router = useRouter();
  const { palette, toggleTheme, isSignedOut } = useOmniPost();

  return (
    <SafeAreaView
      edges={['top']}
      style={[styles.safe, { backgroundColor: palette.bg }]}
    >
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
          <Pressable
            onPress={() => router.push('/welcome')}
            style={styles.brandRow}
          >
            <View
              style={[styles.brandDot, { backgroundColor: palette.accent }]}
            />
            <Text style={[styles.brandText, { color: palette.text }]}>
              omnipost
            </Text>
          </Pressable>

          <View style={styles.topRight}>
            <Pressable onPress={() => router.push('/privacy')}>
              <Text style={[styles.navLink, { color: palette.textSecondary }]}>
                Privacy
              </Text>
            </Pressable>

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

            <Pressable
              onPress={() => router.push(isSignedOut ? '/welcome' : '/')}
              style={[styles.backBtn, { backgroundColor: palette.ctaBg }]}
            >
              <Text style={[styles.backBtnText, { color: palette.ctaText }]}>
                {isSignedOut ? 'Overview' : 'Back to studio'}
              </Text>
            </Pressable>
          </View>
        </View>
      </View>

      <ScrollView contentContainerStyle={styles.scrollContent}>
        <View
          style={[
            styles.docSheet,
            {
              backgroundColor: palette.surface,
              borderColor: palette.border,
            },
          ]}
        >
          <View style={styles.docHeader}>
            <Text style={[styles.eyebrow, { color: palette.textMuted }]}>
              Effective November 2026
            </Text>
            <Text style={[styles.docTitle, { color: palette.text }]}>
              Terms of Service
            </Text>
            <Text style={[styles.lead, { color: palette.textSecondary }]}>
              Plainspoken terms governing your use of the OmniPost web and
              mobile publishing studio.
            </Text>
          </View>

          <View style={[styles.section, { borderTopColor: palette.border }]}>
            <Text style={[styles.h2, { color: palette.text }]}>
              1. Your Content Remains Yours
            </Text>
            <Text style={[styles.p, { color: palette.textSecondary }]}>
              You retain 100% ownership and intellectual property rights in
              every video, photograph, caption, and brand asset you upload to
              OmniPost. You grant OmniPost only the limited technical right to
              transcode, store temporarily, and transmit your content to the
              destination accounts you explicitly enable.
            </Text>
          </View>

          <View style={[styles.section, { borderTopColor: palette.border }]}>
            <Text style={[styles.h2, { color: palette.text }]}>
              2. Third-Party Social Platform Terms
            </Text>
            <Text style={[styles.p, { color: palette.textSecondary }]}>
              When you connect social accounts and publish through OmniPost, you
              also agree to abide by each platform’s respective terms and
              community guidelines, including:{'\n'}
              • YouTube Terms of Service (youtube.com/t/terms) and Google
              Privacy Policy{'\n'}
              • Meta Terms of Service, Instagram Terms of Use, and Threads
              Supplemental Terms{'\n'}
              • TikTok Terms of Service and Community Guidelines{'\n'}
              • X User Agreement, LinkedIn User Agreement, and Bluesky Social
              Terms of Service
            </Text>
            <Pressable
              onPress={() =>
                void Linking.openURL('https://www.youtube.com/t/terms')
              }
            >
              <Text style={[styles.extLink, { color: palette.text }]}>
                Read the YouTube Terms of Service (youtube.com/t/terms) ↗
              </Text>
            </Pressable>
          </View>

          <View style={[styles.section, { borderTopColor: palette.border }]}>
            <Text style={[styles.h2, { color: palette.text }]}>
              3. Acceptable Use
            </Text>
            <Text style={[styles.p, { color: palette.textSecondary }]}>
              You may only connect accounts you own or have explicit client
              authorization to manage. You may not use OmniPost to distribute
              spam, unlawful material, coordinated inauthentic behavior, or
              content that infringes third-party copyrights.
            </Text>
          </View>

          <View style={[styles.section, { borderTopColor: palette.border }]}>
            <Text style={[styles.h2, { color: palette.text }]}>
              4. Plans, Billing & Cancellation
            </Text>
            <Text style={[styles.p, { color: palette.textSecondary }]}>
              Starter ($0) is free with monthly workspace, channel, and post
              allowances. Paid Creator ($12/mo or $10/mo billed annually) and
              Studio ($29/mo or $24/mo billed annually) plans renew
              automatically each billing period and can be downgraded or
              canceled anytime with one click inside Plans & Billing.
            </Text>
          </View>

          <View style={[styles.section, { borderTopColor: palette.border }]}>
            <Text style={[styles.h2, { color: palette.text }]}>
              5. Service Availability & Upstream APIs
            </Text>
            <Text style={[styles.p, { color: palette.textSecondary }]}>
              OmniPost relies on official third-party platform APIs. If an
              upstream platform experiences an outage, rate limit, or token
              expiration, OmniPost surfaces the exact status in Queue and lets
              you retry failed destinations individually without re-uploading.
            </Text>
          </View>
        </View>
      </ScrollView>
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
    maxWidth: 820,
    width: '100%',
    alignSelf: 'center',
    height: 54,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
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
  brandText: {
    fontSize: 17,
    fontWeight: '700',
    letterSpacing: -0.5,
  },
  topRight: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
  },
  navLink: {
    fontSize: 13,
    fontWeight: '500',
  },
  iconBtn: {
    width: 30,
    height: 30,
    borderRadius: 7,
    borderWidth: 1,
    alignItems: 'center',
    justifyContent: 'center',
  },
  backBtn: {
    paddingHorizontal: 12,
    paddingVertical: 6.5,
    borderRadius: 7,
  },
  backBtnText: {
    fontSize: 12.5,
    fontWeight: '600',
  },
  scrollContent: {
    paddingHorizontal: 20,
    paddingVertical: 30,
  },
  docSheet: {
    maxWidth: 820,
    width: '100%',
    alignSelf: 'center',
    borderWidth: 1,
    borderRadius: 12,
    overflow: 'hidden',
  },
  docHeader: {
    padding: 26,
    gap: 8,
  },
  eyebrow: {
    fontSize: 12,
    fontWeight: '600',
  },
  docTitle: {
    fontSize: 26,
    fontWeight: '700',
    letterSpacing: -0.6,
  },
  lead: {
    fontSize: 14.5,
    lineHeight: 22,
  },
  section: {
    borderTopWidth: 1,
    padding: 26,
    gap: 10,
  },
  h2: {
    fontSize: 16,
    fontWeight: '700',
    letterSpacing: -0.2,
  },
  p: {
    fontSize: 13.5,
    lineHeight: 21,
  },
  extLink: {
    fontSize: 12.5,
    fontWeight: '600',
    textDecorationLine: 'underline',
    marginTop: 2,
  },
});
