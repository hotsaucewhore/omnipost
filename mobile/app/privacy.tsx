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

const OAUTH_SCOPES_TABLE = [
  {
    provider: 'YouTube (Google OAuth 2.0)',
    scopes: 'youtube.upload, youtube.readonly',
    purpose:
      'Upload user-selected Shorts and long-form videos, set titles/descriptions/visibility, and display channel handle.',
  },
  {
    provider: 'Instagram & Facebook (Meta Graph API)',
    scopes:
      'instagram_basic, instagram_content_publish, pages_show_list, pages_manage_posts',
    purpose:
      'Publish Reels, multi-photo carousels, and Page posts initiated by the user, plus optional first-comment replies.',
  },
  {
    provider: 'TikTok (Content Posting API)',
    scopes: 'user.info.basic, video.publish, video.upload',
    purpose:
      'Publish vertical video clips and photo carousels with the audience and interaction settings chosen in the composer.',
  },
  {
    provider: 'Threads (Meta Threads API)',
    scopes: 'threads_basic, threads_content_publish',
    purpose:
      'Publish text posts, carousels, videos, and threaded first-comment links.',
  },
  {
    provider: 'X / Twitter (OAuth 2.0 PKCE)',
    scopes: 'tweet.read, tweet.write, users.read, offline.access',
    purpose:
      'Post text, media, and immediate self-reply links on the authenticated X account.',
  },
  {
    provider: 'LinkedIn (Posts API)',
    scopes: 'openid, profile, w_member_social',
    purpose:
      'Publish text, multi-image carousels, and videos to the authenticated member profile.',
  },
  {
    provider: 'Bluesky (AT Protocol)',
    scopes: 'App Password session (com.atproto.repo.createRecord)',
    purpose:
      'Publish posts, image blobs, and reply records without storing your primary account password.',
  },
];

export default function PrivacyPolicyScreen() {
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
            <Pressable onPress={() => router.push('/terms')}>
              <Text style={[styles.navLink, { color: palette.textSecondary }]}>
                Terms
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
              Effective November 2026 · OAuth & User Data Compliance
            </Text>
            <Text style={[styles.docTitle, { color: palette.text }]}>
              Privacy Policy & Data Deletion
            </Text>
            <Text style={[styles.lead, { color: palette.textSecondary }]}>
              OmniPost is a user-directed publishing tool. We only access,
              store, and transmit the media, captions, and OAuth credentials
              required to publish the posts you explicitly create or schedule.
            </Text>
          </View>

          <View style={[styles.section, { borderTopColor: palette.border }]}>
            <Text style={[styles.h2, { color: palette.text }]}>
              1. Information We Collect
            </Text>
            <Text style={[styles.p, { color: palette.textSecondary }]}>
              • Account credentials: Your email address, display name, and a
              salted scrypt password hash (never your plaintext password).{'\n'}
              • Connected social tokens: OAuth 2.0 access/refresh tokens or
              Bluesky App Password session tokens, plus your public profile
              handle and external account ID for each channel you connect.{'\n'}
              • Draft, scheduled, and published media: Videos, photos, captions,
              hashtags, and first-comment text uploaded to our relay server so
              we can transcode aspect-ratio variants and dispatch scheduled
              posts on time.
            </Text>
          </View>

          <View style={[styles.section, { borderTopColor: palette.border }]}>
            <Text style={[styles.h2, { color: palette.text }]}>
              2. Platform Permissions & OAuth Scopes
            </Text>
            <Text style={[styles.p, { color: palette.textSecondary }]}>
              OmniPost requests the minimum scopes necessary to publish content
              and display post performance:
            </Text>

            <View
              style={[
                styles.scopeTable,
                { borderColor: palette.border },
              ]}
            >
              {OAUTH_SCOPES_TABLE.map((row, idx) => (
                <View
                  key={row.provider}
                  style={[
                    styles.scopeRow,
                    idx > 0 && {
                      borderTopWidth: 1,
                      borderTopColor: palette.border,
                    },
                  ]}
                >
                  <Text style={[styles.scopeProvider, { color: palette.text }]}>
                    {row.provider}
                  </Text>
                  <Text style={[styles.scopeCode, { color: palette.textMuted }]}>
                    Scopes: {row.scopes}
                  </Text>
                  <Text
                    style={[
                      styles.scopePurpose,
                      { color: palette.textSecondary },
                    ]}
                  >
                    {row.purpose}
                  </Text>
                </View>
              ))}
            </View>
          </View>

          <View style={[styles.section, { borderTopColor: palette.border }]}>
            <Text style={[styles.h2, { color: palette.text }]}>
              3. Google API Services Limited Use Disclosure
            </Text>
            <Text style={[styles.p, { color: palette.textSecondary }]}>
              OmniPost’s use and transfer to any other app of information
              received from Google APIs adheres to the Google API Services User
              Data Policy, including the Limited Use requirements. We never sell
              user data, never use connected account data or uploaded media for
              advertising, and never use your videos, photos, or captions to
              train artificial intelligence or machine learning models.
            </Text>
            <Pressable
              onPress={() =>
                void Linking.openURL('https://myaccount.google.com/permissions')
              }
            >
              <Text style={[styles.extLink, { color: palette.text }]}>
                Manage or revoke Google permissions at
                myaccount.google.com/permissions ↗
              </Text>
            </Pressable>
          </View>

          <View style={[styles.section, { borderTopColor: palette.border }]}>
            <Text style={[styles.h2, { color: palette.text }]}>
              4. User Data Deletion & Token Revocation Instructions
            </Text>
            <Text style={[styles.p, { color: palette.textSecondary }]}>
              You have complete control over your data at all times:{'\n'}
              1. Disconnect a single channel: Open Accounts in OmniPost and
              click Disconnect next to TikTok, Instagram, YouTube, Facebook, X,
              Threads, Bluesky, or LinkedIn. Its stored OAuth tokens are erased
              immediately.{'\n'}
              2. Delete scheduled/published records: Open Queue and click Delete
              on any draft or scheduled post to purge its media files from the
              relay server.{'\n'}
              3. Full account & Meta Data Deletion Callback: Deleting a
              workspace or account permanently deletes all associated workspaces,
              tokens, presets, and job records. Automated Meta Graph data
              deletion callbacks are also supported at{' '}
              /api/compliance/meta-data-deletion.
            </Text>
          </View>

          <View style={[styles.section, { borderTopColor: palette.border }]}>
            <Text style={[styles.h2, { color: palette.text }]}>
              5. Billing & Subprocessors
            </Text>
            <Text style={[styles.p, { color: palette.textSecondary }]}>
              Paid Creator and Studio subscriptions are processed directly by
              Stripe. OmniPost never receives or stores your credit card number.
              For privacy or data deletion inquiries, contact
              privacy@omnipost.app.
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
  scopeTable: {
    borderWidth: 1,
    borderRadius: 9,
    overflow: 'hidden',
    marginTop: 4,
  },
  scopeRow: {
    padding: 13,
    gap: 3,
  },
  scopeProvider: {
    fontSize: 13.5,
    fontWeight: '600',
  },
  scopeCode: {
    fontSize: 11.5,
  },
  scopePurpose: {
    fontSize: 12.5,
    lineHeight: 18,
  },
  extLink: {
    fontSize: 12.5,
    fontWeight: '600',
    textDecorationLine: 'underline',
    marginTop: 2,
  },
});
