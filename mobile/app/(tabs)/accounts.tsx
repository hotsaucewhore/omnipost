import { Ionicons } from '@expo/vector-icons';
import React, { useState } from 'react';
import {
  Linking,
  Pressable,
  ScrollView,
  StyleSheet,
  Switch,
  Text,
  TextInput,
  View,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import {
  ACCOUNT_GROUPS,
  AccountGroupId,
  PLATFORM_SPECS,
} from '../../../shared/platforms';
import { AppHeader } from '../../components/AppHeader';
import { ACCOUNT_GROUP_ICONS } from '../../constants/theme';
import { useOmniPost } from '../../context/OmniPostContext';
import { SERVER_BASE_URL } from '../../lib/api';

export default function AccountsManagerScreen() {
  const {
    palette,
    usage,
    openBillingModal,
    openBioModal,
    openLaunchModal,
    bioConfig,
    activeWorkspace,
    accounts,
    liveConfigured,
    connectSandbox,
    connectLiveBluesky,
    toggleSimulateFailure,
    removeAccount,
  } = useOmniPost();

  const [customHandles, setCustomHandles] = useState<
    Partial<Record<AccountGroupId, string>>
  >({});
  const [showTestingTools, setShowTestingTools] = useState(false);

  // Inline Live Bluesky App-Password Drawer
  const [bskyDrawerOpen, setBskyDrawerOpen] = useState(false);
  const [bskyHandle, setBskyHandle] = useState('');
  const [bskyPassword, setBskyPassword] = useState('');
  const [bskyConnecting, setBskyConnecting] = useState(false);
  const [bskyError, setBskyError] = useState<string | null>(null);

  const handleConnectBlueskyLive = async () => {
    setBskyError(null);
    setBskyConnecting(true);
    try {
      await connectLiveBluesky(bskyHandle, bskyPassword);
      setBskyPassword('');
      setBskyDrawerOpen(false);
    } catch (err: any) {
      setBskyError(err?.message || 'Could not connect live Bluesky account.');
    } finally {
      setBskyConnecting(false);
    }
  };

  return (
    <SafeAreaView
      style={[styles.safe, { backgroundColor: palette.bg }]}
      edges={['top']}
    >
      <AppHeader />

      <ScrollView contentContainerStyle={styles.content}>
        <View style={styles.headerBlock}>
          <View
            style={{
              flexDirection: 'row',
              alignItems: 'center',
              justifyContent: 'space-between',
              flexWrap: 'wrap',
              gap: 10,
            }}
          >
            <Text style={[styles.pageTitle, { color: palette.text }]}>
              Accounts · {activeWorkspace.name}
            </Text>

            <View style={{ flexDirection: 'row', gap: 8, flexWrap: 'wrap' }}>
              <Pressable
                onPress={openBioModal}
                style={{
                  paddingHorizontal: 11,
                  paddingVertical: 7,
                  borderRadius: 7,
                  borderWidth: 1,
                  borderColor: palette.border,
                  backgroundColor: palette.surface,
                }}
              >
                <Text
                  style={{
                    fontSize: 12.5,
                    fontWeight: '600',
                    color: palette.text,
                  }}
                >
                  Bio page (/u/{bioConfig?.slug || 'studio'})
                </Text>
              </Pressable>

              <Pressable
                onPress={openLaunchModal}
                style={{
                  paddingHorizontal: 12,
                  paddingVertical: 7,
                  borderRadius: 7,
                  backgroundColor: palette.ctaBg,
                }}
              >
                <Text
                  style={{
                    fontSize: 12.5,
                    fontWeight: '600',
                    color: palette.ctaText,
                  }}
                >
                  Launch & OAuth checklist
                </Text>
              </Pressable>
            </View>
          </View>
          <Text style={[styles.pageSub, { color: palette.textSecondary }]}>
            Channels linked to {activeWorkspace.name}. Switch workspaces in the
            top-left header to manage another brand or client.
          </Text>
        </View>

        {usage.maxAccountsPerWorkspace !== null && (
          <View
            style={[
              styles.planCapBanner,
              {
                backgroundColor: palette.surface,
                borderColor: palette.border,
              },
            ]}
          >
            <View style={{ flex: 1, gap: 2 }}>
              <Text style={[styles.planCapTitle, { color: palette.text }]}>
                {accounts.length} of {usage.maxAccountsPerWorkspace} Starter
                channels linked
              </Text>
              <Text
                style={[styles.planCapSub, { color: palette.textSecondary }]}
              >
                Upgrade to Creator ($12/mo) to connect all 8 platform groups in
                this workspace.
              </Text>
            </View>
            <Pressable
              onPress={() => openBillingModal('creator')}
              style={[
                styles.solidSmallBtn,
                { backgroundColor: palette.ctaBg },
              ]}
            >
              <Text
                style={[styles.solidSmallBtnText, { color: palette.ctaText }]}
              >
                Upgrade
              </Text>
            </Pressable>
          </View>
        )}

        {/* Clean Single-Table Settings Sheet */}
        <View
          style={[
            styles.tableSheet,
            {
              backgroundColor: palette.surface,
              borderColor: palette.border,
            },
          ]}
        >
          {ACCOUNT_GROUPS.map((group, idx) => {
            const connected = accounts.find(
              (a) => a.platformGroup === group.id
            );
            const hasLiveKeys = liveConfigured[group.id];
            const isBluesky = group.id === 'bluesky';

            return (
              <View
                key={group.id}
                style={[
                  styles.row,
                  idx > 0 && {
                    borderTopWidth: 1,
                    borderTopColor: palette.border,
                  },
                ]}
              >
                <View style={styles.rowMain}>
                  <Ionicons
                    name={ACCOUNT_GROUP_ICONS[group.id]}
                    size={19}
                    color={group.brandColor}
                    style={{ width: 24 }}
                  />

                  <View style={{ flex: 1 }}>
                    <View style={styles.titleWithMode}>
                      <Text
                        style={[styles.groupTitle, { color: palette.text }]}
                      >
                        {group.name}
                      </Text>

                      {connected && (
                        <View
                          style={[
                            styles.modeBadge,
                            {
                              backgroundColor:
                                connected.mode === 'live'
                                  ? palette.successBg
                                  : palette.surfaceSubtle,
                              borderColor: palette.border,
                            },
                          ]}
                        >
                          {connected.mode === 'live' && (
                            <View
                              style={[
                                styles.liveDot,
                                { backgroundColor: palette.success },
                              ]}
                            />
                          )}
                          <Text
                            style={[
                              styles.modeBadgeText,
                              {
                                color:
                                  connected.mode === 'live'
                                    ? palette.success
                                    : palette.textMuted,
                              },
                            ]}
                          >
                            {connected.mode === 'live' ? 'Live' : 'Sandbox'}
                          </Text>
                        </View>
                      )}
                    </View>

                    <Text
                      style={[
                        styles.groupMeta,
                        { color: palette.textSecondary },
                      ]}
                    >
                      {connected
                        ? `${connected.handle} · ${group.unlocksPlatforms
                            .map((p) => PLATFORM_SPECS[p].shortName)
                            .join(', ')}`
                        : group.unlocksPlatforms
                            .map((p) => PLATFORM_SPECS[p].name)
                            .join(' & ')}
                    </Text>
                  </View>

                  {connected ? (
                    <View style={styles.rowActions}>
                      {isBluesky && connected.mode !== 'live' && (
                        <Pressable
                          onPress={() => {
                            setBskyError(null);
                            setBskyDrawerOpen((v) => !v);
                          }}
                          style={[
                            styles.solidSmallBtn,
                            { backgroundColor: palette.ctaBg },
                          ]}
                        >
                          <Text
                            style={[
                              styles.solidSmallBtnText,
                              { color: palette.ctaText },
                            ]}
                          >
                            Connect live
                          </Text>
                        </Pressable>
                      )}

                      {!isBluesky && hasLiveKeys && connected.mode !== 'live' && (
                        <Pressable
                          onPress={() =>
                            void Linking.openURL(
                              `${SERVER_BASE_URL}/api/oauth/${
                                group.id
                              }/start?workspaceId=${encodeURIComponent(
                                activeWorkspace.id
                              )}`
                            )
                          }
                          style={[
                            styles.solidSmallBtn,
                            { backgroundColor: palette.ctaBg },
                          ]}
                        >
                          <Text
                            style={[
                              styles.solidSmallBtnText,
                              { color: palette.ctaText },
                            ]}
                          >
                            Sign in live
                          </Text>
                        </Pressable>
                      )}

                      <Pressable
                        onPress={() => void removeAccount(connected.id)}
                        style={[
                          styles.outlineSmallBtn,
                          { borderColor: palette.borderStrong },
                        ]}
                      >
                        <Text
                          style={[
                            styles.outlineSmallBtnText,
                            { color: palette.textSecondary },
                          ]}
                        >
                          Disconnect
                        </Text>
                      </Pressable>
                    </View>
                  ) : (
                    <View style={styles.connectInline}>
                      <TextInput
                        style={[
                          styles.inlineInput,
                          {
                            color: palette.text,
                            borderColor: palette.border,
                            backgroundColor: palette.surfaceSubtle,
                          },
                        ]}
                        placeholder={group.defaultSandboxHandle}
                        placeholderTextColor={palette.textMuted}
                        value={customHandles[group.id] ?? ''}
                        onChangeText={(t) =>
                          setCustomHandles((p) => ({ ...p, [group.id]: t }))
                        }
                      />

                      {isBluesky && (
                        <Pressable
                          onPress={() => {
                            setBskyError(null);
                            setBskyDrawerOpen((v) => !v);
                          }}
                          style={[
                            styles.outlineSmallBtn,
                            { borderColor: palette.borderStrong },
                          ]}
                        >
                          <Text
                            style={[
                              styles.outlineSmallBtnText,
                              { color: palette.text },
                            ]}
                          >
                            Live login
                          </Text>
                        </Pressable>
                      )}

                      <Pressable
                        onPress={() =>
                          !isBluesky && hasLiveKeys
                            ? void Linking.openURL(
                                `${SERVER_BASE_URL}/api/oauth/${
                                  group.id
                                }/start?workspaceId=${encodeURIComponent(
                                  activeWorkspace.id
                                )}`
                              )
                            : void connectSandbox(
                                group.id,
                                customHandles[group.id]
                              )
                        }
                        style={[
                          styles.solidSmallBtn,
                          { backgroundColor: palette.ctaBg },
                        ]}
                      >
                        <Text
                          style={[
                            styles.solidSmallBtnText,
                            { color: palette.ctaText },
                          ]}
                        >
                          Connect
                        </Text>
                      </Pressable>
                    </View>
                  )}
                </View>

                {/* Instant Zero-Review Live Bluesky Connection Drawer */}
                {isBluesky && bskyDrawerOpen && (
                  <View
                    style={[
                      styles.liveDrawer,
                      {
                        backgroundColor: palette.surfaceSubtle,
                        borderColor: palette.border,
                      },
                    ]}
                  >
                    <View style={styles.liveDrawerHead}>
                      <Text
                        style={[styles.liveDrawerTitle, { color: palette.text }]}
                      >
                        Connect real Bluesky account (posts live immediately)
                      </Text>
                      <Pressable
                        onPress={() =>
                          void Linking.openURL(
                            'https://bsky.app/settings/app-passwords'
                          )
                        }
                      >
                        <Text
                          style={[
                            styles.appPassLink,
                            { color: palette.textSecondary },
                          ]}
                        >
                          Get App Password ↗
                        </Text>
                      </Pressable>
                    </View>

                    <View style={styles.liveDrawerInputs}>
                      <TextInput
                        style={[
                          styles.liveInput,
                          {
                            color: palette.text,
                            backgroundColor: palette.surface,
                            borderColor: palette.border,
                          },
                        ]}
                        autoCapitalize="none"
                        placeholder="you.bsky.social"
                        placeholderTextColor={palette.textMuted}
                        value={bskyHandle}
                        onChangeText={setBskyHandle}
                      />
                      <TextInput
                        style={[
                          styles.liveInput,
                          {
                            color: palette.text,
                            backgroundColor: palette.surface,
                            borderColor: palette.border,
                          },
                        ]}
                        secureTextEntry
                        autoCapitalize="none"
                        placeholder="xxxx-xxxx-xxxx-xxxx (App Password)"
                        placeholderTextColor={palette.textMuted}
                        value={bskyPassword}
                        onChangeText={setBskyPassword}
                      />
                      <Pressable
                        disabled={bskyConnecting}
                        onPress={() => void handleConnectBlueskyLive()}
                        style={[
                          styles.solidSmallBtn,
                          { backgroundColor: palette.ctaBg },
                        ]}
                      >
                        <Text
                          style={[
                            styles.solidSmallBtnText,
                            { color: palette.ctaText },
                          ]}
                        >
                          {bskyConnecting ? 'Verifying...' : 'Verify & connect'}
                        </Text>
                      </Pressable>
                    </View>

                    {bskyError ? (
                      <Text style={{ fontSize: 12, color: palette.danger }}>
                        {bskyError}
                      </Text>
                    ) : null}
                  </View>
                )}

                {showTestingTools && connected?.mode === 'sandbox' && (
                  <View
                    style={[
                      styles.testSubRow,
                      { borderTopColor: palette.border },
                    ]}
                  >
                    <Text
                      style={{ fontSize: 12.5, color: palette.textSecondary }}
                    >
                      Simulate upload error on {group.name} (for testing retry)
                    </Text>
                    <Switch
                      value={Boolean(connected.simulateFailure)}
                      onValueChange={(v) =>
                        void toggleSimulateFailure(connected.id, v)
                      }
                    />
                  </View>
                )}
              </View>
            );
          })}
        </View>

        {/* Quiet Footer Toggle for Dev/QA */}
        <Pressable
          onPress={() => setShowTestingTools((s) => !s)}
          style={styles.quietFooterToggle}
        >
          <Text style={[styles.quietFooterText, { color: palette.textMuted }]}>
            {showTestingTools
              ? 'Hide developer & sandbox options'
              : 'Developer & sandbox options'}
          </Text>
        </Pressable>

        {showTestingTools && (
          <Text style={[styles.devNote, { color: palette.textSecondary }]}>
            Bluesky can be connected live above using an App Password with zero
            platform review wait. For TikTok, Instagram, YouTube, Facebook, X,
            Threads, and LinkedIn OAuth, add your client keys in `server/.env`.
          </Text>
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
    maxWidth: 760,
    width: '100%',
    alignSelf: 'center',
    paddingHorizontal: 20,
    paddingVertical: 28,
    gap: 18,
  },
  headerBlock: {
    gap: 4,
  },
  pageTitle: {
    fontSize: 20,
    fontWeight: '700',
    letterSpacing: -0.3,
  },
  pageSub: {
    fontSize: 13.5,
  },
  planCapBanner: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: 12,
    paddingHorizontal: 16,
    paddingVertical: 12,
    borderRadius: 10,
    borderWidth: 1,
  },
  planCapTitle: {
    fontSize: 13.5,
    fontWeight: '600',
  },
  planCapSub: {
    fontSize: 12,
  },
  tableSheet: {
    borderRadius: 12,
    borderWidth: 1,
    overflow: 'hidden',
  },
  row: {
    paddingHorizontal: 18,
    paddingVertical: 15,
    gap: 12,
  },
  rowMain: {
    flexDirection: 'row',
    alignItems: 'center',
    flexWrap: 'wrap',
    gap: 12,
  },
  titleWithMode: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  groupTitle: {
    fontSize: 14.5,
    fontWeight: '600',
  },
  modeBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    paddingHorizontal: 6,
    paddingVertical: 1.5,
    borderRadius: 5,
    borderWidth: 1,
  },
  liveDot: {
    width: 5,
    height: 5,
    borderRadius: 3,
  },
  modeBadgeText: {
    fontSize: 10.5,
    fontWeight: '600',
  },
  groupMeta: {
    fontSize: 12.5,
    marginTop: 2,
  },
  rowActions: {
    flexDirection: 'row',
    alignItems: 'center',
    flexWrap: 'wrap',
    gap: 8,
  },
  connectInline: {
    flexDirection: 'row',
    alignItems: 'center',
    flexWrap: 'wrap',
    gap: 8,
  },
  inlineInput: {
    borderWidth: 1,
    borderRadius: 7,
    paddingHorizontal: 10,
    paddingVertical: 6,
    fontSize: 13,
    minWidth: 135,
  },
  solidSmallBtn: {
    paddingHorizontal: 12,
    paddingVertical: 7,
    borderRadius: 7,
  },
  solidSmallBtnText: {
    fontSize: 12.5,
    fontWeight: '600',
  },
  outlineSmallBtn: {
    borderWidth: 1,
    borderRadius: 7,
    paddingHorizontal: 11,
    paddingVertical: 6,
  },
  outlineSmallBtnText: {
    fontSize: 12.5,
    fontWeight: '500',
  },
  liveDrawer: {
    borderWidth: 1,
    borderRadius: 9,
    padding: 12,
    gap: 9,
  },
  liveDrawerHead: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    flexWrap: 'wrap',
    gap: 8,
  },
  liveDrawerTitle: {
    fontSize: 12.5,
    fontWeight: '600',
  },
  appPassLink: {
    fontSize: 12,
    textDecorationLine: 'underline',
  },
  liveDrawerInputs: {
    flexDirection: 'row',
    alignItems: 'center',
    flexWrap: 'wrap',
    gap: 8,
  },
  liveInput: {
    flex: 1,
    minWidth: 165,
    borderWidth: 1,
    borderRadius: 7,
    paddingHorizontal: 10,
    paddingVertical: 7,
    fontSize: 13,
  },
  testSubRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingTop: 10,
    borderTopWidth: 1,
  },
  quietFooterToggle: {
    alignSelf: 'flex-start',
  },
  quietFooterText: {
    fontSize: 12.5,
    textDecorationLine: 'underline',
  },
  devNote: {
    fontSize: 12.5,
    lineHeight: 19,
  },
});
