import { Ionicons } from '@expo/vector-icons';
import React, { useEffect, useState } from 'react';
import {
  Linking,
  Modal,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import { LaunchReadinessReport } from '../../shared/platforms';
import { ACCOUNT_GROUP_ICONS } from '../constants/theme';
import { useOmniPost } from '../context/OmniPostContext';
import { fetchLaunchReadinessApi } from '../lib/api';

export function LaunchChecklistModal() {
  const { palette, launchModalOpen, closeLaunchModal } = useOmniPost();

  const [report, setReport] = useState<LaunchReadinessReport | null>(null);
  const [copiedKey, setCopiedKey] = useState<string | null>(null);

  useEffect(() => {
    if (!launchModalOpen) return;
    fetchLaunchReadinessApi()
      .then(setReport)
      .catch(() => null);
  }, [launchModalOpen]);

  const copyValue = async (key: string, val: string) => {
    if (
      Platform.OS === 'web' &&
      typeof navigator !== 'undefined' &&
      navigator.clipboard?.writeText
    ) {
      try {
        await navigator.clipboard.writeText(val);
      } catch {
        // Ignore clipboard errors
      }
    }
    setCopiedKey(key);
    setTimeout(() => {
      setCopiedKey((prev) => (prev === key ? null : prev));
    }, 2000);
  };

  return (
    <Modal
      visible={launchModalOpen}
      transparent
      animationType="fade"
      onRequestClose={closeLaunchModal}
    >
      <View style={styles.backdrop}>
        <View
          style={[
            styles.dialog,
            {
              backgroundColor: palette.surface,
              borderColor: palette.border,
            },
          ]}
        >
          <View
            style={[styles.header, { borderBottomColor: palette.border }]}
          >
            <View style={{ flex: 1 }}>
              <Text style={[styles.title, { color: palette.text }]}>
                Production cloud launch & live OAuth rollout
              </Text>
              <Text style={[styles.sub, { color: palette.textSecondary }]}>
                Live server diagnostics, copyable webhook/callback URLs, and ordered app-review checklist
              </Text>
            </View>
            <Pressable onPress={closeLaunchModal} style={{ padding: 4 }}>
              <Ionicons name="close" size={20} color={palette.textSecondary} />
            </Pressable>
          </View>

          <ScrollView style={{ maxHeight: 540 }}>
            <View style={styles.body}>
              {report && (
                <>
                  {/* 1. Core Infrastructure & Stripe Status */}
                  <View
                    style={[
                      styles.card,
                      {
                        backgroundColor: palette.surfaceSubtle,
                        borderColor: palette.border,
                      },
                    ]}
                  >
                    <Text style={[styles.sectionTitle, { color: palette.text }]}>
                      1. Database, HTTPS & Stripe Billing
                    </Text>

                    <View style={styles.checkRow}>
                      <Ionicons
                        name="checkmark-circle"
                        size={15}
                        color={palette.success}
                      />
                      <Text
                        style={{ fontSize: 12.5, color: palette.text, flex: 1 }}
                      >
                        Storage: {report.storageEngine.toUpperCase()} ({report.databaseFile})
                      </Text>
                    </View>

                    <View style={styles.checkRow}>
                      <Ionicons
                        name={
                          report.httpsConfigured
                            ? 'checkmark-circle'
                            : 'ellipse-outline'
                        }
                        size={15}
                        color={
                          report.httpsConfigured
                            ? palette.success
                            : palette.warning
                        }
                      />
                      <Text
                        style={{ fontSize: 12.5, color: palette.text, flex: 1 }}
                      >
                        Public domain: {report.publicServerUrl}{' '}
                        {report.httpsConfigured
                          ? '(HTTPS active)'
                          : '(Set PUBLIC_SERVER_URL & PUBLIC_WEB_URL on cloud host)'}
                      </Text>
                    </View>

                    <View style={styles.checkRow}>
                      <Ionicons
                        name={
                          report.stripe.secretConfigured
                            ? 'checkmark-circle'
                            : 'ellipse-outline'
                        }
                        size={15}
                        color={
                          report.stripe.secretConfigured
                            ? palette.success
                            : palette.warning
                        }
                      />
                      <Text
                        style={{ fontSize: 12.5, color: palette.text, flex: 1 }}
                      >
                        Stripe Webhook: {report.stripe.webhookEndpointUrl}
                      </Text>
                      <Pressable
                        onPress={() =>
                          void copyValue(
                            'stripe_wh',
                            report.stripe.webhookEndpointUrl
                          )
                        }
                      >
                        <Text
                          style={{
                            fontSize: 11.5,
                            fontWeight: '600',
                            color:
                              copiedKey === 'stripe_wh'
                                ? palette.success
                                : palette.textSecondary,
                          }}
                        >
                          {copiedKey === 'stripe_wh' ? 'Copied ✓' : 'Copy'}
                        </Text>
                      </Pressable>
                    </View>
                  </View>

                  {/* 2. App-Review Compliance URLs */}
                  <View
                    style={[
                      styles.card,
                      {
                        backgroundColor: palette.surface,
                        borderColor: palette.border,
                      },
                    ]}
                  >
                    <Text style={[styles.sectionTitle, { color: palette.text }]}>
                      2. Required OAuth Review Legal & Data-Deletion URLs
                    </Text>
                    {[
                      {
                        key: 'priv',
                        label: 'Privacy Policy',
                        url: report.complianceUrls.privacyUrl,
                      },
                      {
                        key: 'terms',
                        label: 'Terms of Service',
                        url: report.complianceUrls.termsUrl,
                      },
                      {
                        key: 'meta_del',
                        label: 'Meta Data Deletion Callback',
                        url: report.complianceUrls.metaDeletionCallbackUrl,
                      },
                    ].map((row) => (
                      <View key={row.key} style={styles.urlCopyRow}>
                        <Text
                          style={{
                            fontSize: 12,
                            color: palette.textSecondary,
                            minWidth: 165,
                          }}
                        >
                          {row.label}
                        </Text>
                        <Text
                          style={{
                            fontSize: 12,
                            color: palette.text,
                            flex: 1,
                          }}
                          numberOfLines={1}
                        >
                          {row.url}
                        </Text>
                        <Pressable
                          onPress={() => void copyValue(row.key, row.url)}
                        >
                          <Text
                            style={{
                              fontSize: 11.5,
                              fontWeight: '600',
                              color:
                                copiedKey === row.key
                                  ? palette.success
                                  : palette.textSecondary,
                            }}
                          >
                            {copiedKey === row.key ? 'Copied ✓' : 'Copy'}
                          </Text>
                        </Pressable>
                      </View>
                    ))}
                  </View>

                  {/* 3. Ordered OAuth Rollout */}
                  <View style={{ gap: 8 }}>
                    <Text style={[styles.sectionTitle, { color: palette.text }]}>
                      3. Ordered Channel Rollout (Fastest to Longest Review)
                    </Text>

                    <View
                      style={[
                        styles.channelsTable,
                        {
                          borderColor: palette.border,
                          backgroundColor: palette.surface,
                        },
                      ]}
                    >
                      {report.channels.map((ch, idx) => (
                        <View
                          key={ch.groupId}
                          style={[
                            styles.channelRow,
                            idx > 0 && {
                              borderTopWidth: 1,
                              borderTopColor: palette.border,
                            },
                          ]}
                        >
                          <Ionicons
                            name={ACCOUNT_GROUP_ICONS[ch.groupId] as any}
                            size={16}
                            color={palette.text}
                          />

                          <View style={{ flex: 1, minWidth: 180 }}>
                            <View
                              style={{
                                flexDirection: 'row',
                                alignItems: 'center',
                                gap: 8,
                              }}
                            >
                              <Text
                                style={{
                                  fontSize: 13,
                                  fontWeight: '600',
                                  color: palette.text,
                                }}
                              >
                                {ch.name}
                              </Text>
                              <Text
                                style={{
                                  fontSize: 11,
                                  fontWeight: '600',
                                  color: ch.liveReady
                                    ? palette.success
                                    : palette.textMuted,
                                }}
                              >
                                {ch.liveReady ? '● Live ready' : '○ Env keys pending'}
                              </Text>
                            </View>
                            <Text
                              style={{
                                fontSize: 11.5,
                                color: palette.textSecondary,
                              }}
                            >
                              {ch.approvalSpeed}
                              {ch.envKeys.length > 0
                                ? ` · ${ch.envKeys.join(', ')}`
                                : ''}
                            </Text>
                          </View>

                          <View style={{ flexDirection: 'row', gap: 8 }}>
                            {ch.callbackUrl && (
                              <Pressable
                                onPress={() =>
                                  void copyValue(
                                    `cb_${ch.groupId}`,
                                    ch.callbackUrl!
                                  )
                                }
                                style={[
                                  styles.miniBtn,
                                  { borderColor: palette.border },
                                ]}
                              >
                                <Text
                                  style={{
                                    fontSize: 11,
                                    fontWeight: '600',
                                    color:
                                      copiedKey === `cb_${ch.groupId}`
                                        ? palette.success
                                        : palette.textSecondary,
                                  }}
                                >
                                  {copiedKey === `cb_${ch.groupId}`
                                    ? 'URI copied ✓'
                                    : 'Copy redirect URI'}
                                </Text>
                              </Pressable>
                            )}

                            <Pressable
                              onPress={() =>
                                void Linking.openURL(ch.developerPortalUrl)
                              }
                              style={[
                                styles.miniBtn,
                                { borderColor: palette.borderStrong },
                              ]}
                            >
                              <Text
                                style={{
                                  fontSize: 11,
                                  fontWeight: '600',
                                  color: palette.text,
                                }}
                              >
                                Portal ↗
                              </Text>
                            </Pressable>
                          </View>
                        </View>
                      ))}
                    </View>
                  </View>
                </>
              )}
            </View>
          </ScrollView>
        </View>
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  backdrop: {
    flex: 1,
    backgroundColor: 'rgba(15, 15, 14, 0.52)',
    alignItems: 'center',
    justifyContent: 'center',
    padding: 16,
  },
  dialog: {
    width: '100%',
    maxWidth: 700,
    borderRadius: 14,
    borderWidth: 1,
    overflow: 'hidden',
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 20,
    paddingVertical: 14,
    borderBottomWidth: 1,
    gap: 12,
  },
  title: {
    fontSize: 15.5,
    fontWeight: '600',
  },
  sub: {
    fontSize: 12,
    marginTop: 2,
  },
  body: {
    padding: 18,
    gap: 14,
  },
  card: {
    borderWidth: 1,
    borderRadius: 10,
    padding: 13,
    gap: 8,
  },
  sectionTitle: {
    fontSize: 12.5,
    fontWeight: '700',
  },
  checkRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  urlCopyRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
  },
  channelsTable: {
    borderWidth: 1,
    borderRadius: 10,
    overflow: 'hidden',
  },
  channelRow: {
    flexDirection: 'row',
    alignItems: 'center',
    flexWrap: 'wrap',
    gap: 10,
    paddingHorizontal: 13,
    paddingVertical: 10,
  },
  miniBtn: {
    paddingHorizontal: 8,
    paddingVertical: 4.5,
    borderRadius: 6,
    borderWidth: 1,
  },
});
