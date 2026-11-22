import { Ionicons } from '@expo/vector-icons';
import { useRouter } from 'expo-router';
import React, { useEffect, useState } from 'react';
import {
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import {
  AdminOverviewSummary,
  PlanTierId,
} from '../../shared/platforms';
import { AppHeader } from '../components/AppHeader';
import { useOmniPost } from '../context/OmniPostContext';
import {
  compUserPlanAdminApi,
  createPromoCodeAdminApi,
  deletePromoCodeAdminApi,
  fetchAdminOverviewApi,
  SERVER_BASE_URL,
} from '../lib/api';

export default function FounderAdminScreen() {
  const router = useRouter();
  const {
    palette,
    user,
    activeWorkspace,
    apiKeys,
    createApiKey,
    revokeApiKey,
    refreshAll,
  } = useOmniPost();

  const [overview, setOverview] = useState<AdminOverviewSummary | null>(null);
  const [loading, setLoading] = useState(true);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);

  // Promo code creator state
  const [promoCode, setPromoCode] = useState('');
  const [promoTier, setPromoTier] = useState<'creator' | 'studio'>('studio');
  const [promoNote, setPromoNote] = useState('');
  const [promoMaxUses, setPromoMaxUses] = useState('50');

  // Studio API key state
  const [keyLabel, setKeyLabel] = useState('');
  const [revealedSecret, setRevealedSecret] = useState<string | null>(null);
  const [copiedId, setCopiedId] = useState<string | null>(null);

  const loadOverview = async () => {
    setLoading(true);
    setErrorMsg(null);
    try {
      const data = await fetchAdminOverviewApi();
      setOverview(data);
    } catch (err: any) {
      setErrorMsg(err?.message || 'Could not load founder overview.');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    void loadOverview();
  }, []);

  const copyText = async (id: string, text: string) => {
    if (
      Platform.OS === 'web' &&
      typeof navigator !== 'undefined' &&
      navigator.clipboard?.writeText
    ) {
      try {
        await navigator.clipboard.writeText(text);
      } catch {
        // Ignore clipboard errors
      }
    }
    setCopiedId(id);
    setTimeout(() => {
      setCopiedId((prev) => (prev === id ? null : prev));
    }, 2000);
  };

  const handleCreatePromo = async () => {
    if (!promoCode.trim()) return;
    try {
      const nextCodes = await createPromoCodeAdminApi({
        code: promoCode.trim(),
        grantTier: promoTier,
        maxUses: Number(promoMaxUses) || 50,
        note: promoNote.trim() || undefined,
      });
      setOverview((prev) => (prev ? { ...prev, promoCodes: nextCodes } : prev));
      setPromoCode('');
      setPromoNote('');
    } catch (err: any) {
      setErrorMsg(err?.message || 'Could not create promo code.');
    }
  };

  const handleCompUser = async (userId: string, tier: PlanTierId) => {
    try {
      const nextOverview = await compUserPlanAdminApi(userId, tier, 'monthly');
      setOverview(nextOverview);
      if (userId === user.id) {
        await refreshAll();
      }
    } catch (err: any) {
      setErrorMsg(err?.message || 'Could not update plan.');
    }
  };

  const handleGenerateApiKey = async () => {
    const created = await createApiKey(
      keyLabel.trim() || 'Zapier / Make Automation'
    );
    if (created) {
      setRevealedSecret(created.secretKey);
      setKeyLabel('');
    }
  };

  const sampleCurl = `curl -X POST ${SERVER_BASE_URL}/api/v1/posts \\
  -H "Authorization: Bearer ${revealedSecret || 'omni_live_your_key'}" \\
  -H "Content-Type: application/json" \\
  -d '{"url":"https://studio.example.com/new-guide","lifecycle":"scheduled"}'`;

  return (
    <SafeAreaView
      style={[styles.safe, { backgroundColor: palette.bg }]}
      edges={['top']}
    >
      <AppHeader />

      <ScrollView contentContainerStyle={styles.content}>
        <View style={styles.topRow}>
          <View style={{ gap: 2 }}>
            <Text style={[styles.pageTitle, { color: palette.text }]}>
              Founder console & API automation
            </Text>
            <Text style={[styles.pageSub, { color: palette.textSecondary }]}>
              SaaS revenue pulse, redeemable beta promo codes, REST API keys, and email outbox
            </Text>
          </View>

          <Pressable
            onPress={() => router.push('/')}
            style={[
              styles.outlineBtn,
              {
                borderColor: palette.borderStrong,
                backgroundColor: palette.surface,
              },
            ]}
          >
            <Text style={{ fontSize: 12.5, fontWeight: '600', color: palette.text }}>
              Back to composer
            </Text>
          </Pressable>
        </View>

        {errorMsg && (
          <Text style={{ fontSize: 13, color: palette.danger }}>{errorMsg}</Text>
        )}

        {overview && (
          <>
            {/* 1. SaaS Revenue & Queue Health Pulse */}
            <View style={styles.metricsGrid}>
              {[
                {
                  label: 'Monthly Recurring Revenue',
                  value: `$${overview.mrrUsd}/mo`,
                  sub: `$${overview.arrUsd}/yr ARR run-rate`,
                },
                {
                  label: 'Accounts by Tier',
                  value: `${overview.counts.totalUsers} total`,
                  sub: `${overview.counts.studioUsers} Studio · ${overview.counts.creatorUsers} Creator · ${overview.counts.freeUsers} Starter`,
                },
                {
                  label: 'Active Workspaces',
                  value: `${overview.counts.totalWorkspaces}`,
                  sub: 'Isolated brand & client studios',
                },
                {
                  label: 'Relay Queue Health',
                  value: `${overview.counts.scheduledJobs} scheduled`,
                  sub: `${overview.counts.publishedJobs} published · ${overview.counts.failedJobs} failed`,
                },
              ].map((m) => (
                <View
                  key={m.label}
                  style={[
                    styles.metricCard,
                    {
                      backgroundColor: palette.surface,
                      borderColor: palette.border,
                    },
                  ]}
                >
                  <Text
                    style={{ fontSize: 11.5, color: palette.textSecondary }}
                  >
                    {m.label}
                  </Text>
                  <Text
                    style={{
                      fontSize: 22,
                      fontWeight: '700',
                      color: palette.text,
                      letterSpacing: -0.4,
                    }}
                  >
                    {m.value}
                  </Text>
                  <Text style={{ fontSize: 11.5, color: palette.textMuted }}>
                    {m.sub}
                  </Text>
                </View>
              ))}
            </View>

            {/* 2. Redeemable Promo & Beta Access Codes */}
            <View
              style={[
                styles.sectionCard,
                {
                  backgroundColor: palette.surface,
                  borderColor: palette.border,
                },
              ]}
            >
              <View style={{ gap: 2 }}>
                <Text style={[styles.sectionTitle, { color: palette.text }]}>
                  Promo & beta access codes
                </Text>
                <Text style={{ fontSize: 12, color: palette.textSecondary }}>
                  Share codes with early adopters or agency prospects — redeemable inside the Upgrade modal
                </Text>
              </View>

              <View style={styles.createPromoRow}>
                <TextInput
                  style={[
                    styles.input,
                    {
                      flex: 0.9,
                      color: palette.text,
                      backgroundColor: palette.surfaceSubtle,
                      borderColor: palette.borderStrong,
                    },
                  ]}
                  autoCapitalize="characters"
                  placeholder="CODE (e.g. LAUNCH50)"
                  placeholderTextColor={palette.textMuted}
                  value={promoCode}
                  onChangeText={setPromoCode}
                />
                <TextInput
                  style={[
                    styles.input,
                    {
                      flex: 1.2,
                      color: palette.text,
                      backgroundColor: palette.surfaceSubtle,
                      borderColor: palette.border,
                    },
                  ]}
                  placeholder="Internal note (optional)"
                  placeholderTextColor={palette.textMuted}
                  value={promoNote}
                  onChangeText={setPromoNote}
                />
                <TextInput
                  style={[
                    styles.input,
                    {
                      width: 82,
                      minWidth: 74,
                      color: palette.text,
                      backgroundColor: palette.surfaceSubtle,
                      borderColor: palette.border,
                    },
                  ]}
                  keyboardType="numeric"
                  placeholder="Uses"
                  placeholderTextColor={palette.textMuted}
                  value={promoMaxUses}
                  onChangeText={setPromoMaxUses}
                />

                <View style={{ flexDirection: 'row', gap: 5 }}>
                  {(['creator', 'studio'] as const).map((t) => {
                    const active = promoTier === t;
                    return (
                      <Pressable
                        key={t}
                        onPress={() => setPromoTier(t)}
                        style={[
                          styles.pillBtn,
                          {
                            backgroundColor: active
                              ? palette.surfaceMuted
                              : palette.surfaceSubtle,
                            borderColor: active
                              ? palette.borderStrong
                              : palette.border,
                          },
                        ]}
                      >
                        <Text
                          style={{
                            fontSize: 12,
                            fontWeight: active ? '700' : '500',
                            color: palette.text,
                          }}
                        >
                          {t === 'studio' ? 'Studio' : 'Creator'}
                        </Text>
                      </Pressable>
                    );
                  })}
                </View>

                <Pressable
                  onPress={() => void handleCreatePromo()}
                  style={[styles.solidBtn, { backgroundColor: palette.ctaBg }]}
                >
                  <Text
                    style={{
                      fontSize: 12.5,
                      fontWeight: '600',
                      color: palette.ctaText,
                    }}
                  >
                    Create code
                  </Text>
                </Pressable>
              </View>

              <View style={{ gap: 8 }}>
                {overview.promoCodes.map((p) => (
                  <View
                    key={p.code}
                    style={[
                      styles.listRow,
                      {
                        borderColor: palette.border,
                        backgroundColor: palette.surfaceSubtle,
                      },
                    ]}
                  >
                    <View style={{ flex: 1 }}>
                      <Text
                        style={{
                          fontSize: 13.5,
                          fontWeight: '700',
                          color: palette.text,
                        }}
                      >
                        {p.code}{' '}
                        <Text
                          style={{
                            fontWeight: '600',
                            color: palette.accent,
                            fontSize: 12,
                          }}
                        >
                          · Grants {p.grantTier.toUpperCase()}
                        </Text>
                      </Text>
                      <Text style={{ fontSize: 11.5, color: palette.textMuted }}>
                        {p.usedCount} / {p.maxUses} redeemed
                        {p.note ? ` · ${p.note}` : ''}
                      </Text>
                    </View>

                    <Pressable
                      onPress={() => void copyText(`promo_${p.code}`, p.code)}
                      style={[
                        styles.outlineBtn,
                        { borderColor: palette.border },
                      ]}
                    >
                      <Text
                        style={{
                          fontSize: 11.5,
                          fontWeight: '600',
                          color:
                            copiedId === `promo_${p.code}`
                              ? palette.success
                              : palette.textSecondary,
                        }}
                      >
                        {copiedId === `promo_${p.code}` ? 'Copied ✓' : 'Copy'}
                      </Text>
                    </Pressable>

                    <Pressable
                      onPress={async () => {
                        const next = await deletePromoCodeAdminApi(p.code);
                        setOverview((prev) =>
                          prev ? { ...prev, promoCodes: next } : prev
                        );
                      }}
                      style={{ padding: 4 }}
                    >
                      <Ionicons
                        name="trash-outline"
                        size={15}
                        color={palette.textMuted}
                      />
                    </Pressable>
                  </View>
                ))}
              </View>
            </View>

            {/* 3. Studio Public REST API Keys (/api/v1/posts) */}
            <View
              style={[
                styles.sectionCard,
                {
                  backgroundColor: palette.surface,
                  borderColor: palette.border,
                },
              ]}
            >
              <View style={{ gap: 2 }}>
                <Text style={[styles.sectionTitle, { color: palette.text }]}>
                  Public REST API keys · {activeWorkspace.name}
                </Text>
                <Text style={{ fontSize: 12, color: palette.textSecondary }}>
                  Queue posts automatically from Zapier, Make, n8n, Notion, or scripts via POST /api/v1/posts
                </Text>
              </View>

              <View style={styles.createPromoRow}>
                <TextInput
                  style={[
                    styles.input,
                    {
                      flex: 1,
                      color: palette.text,
                      backgroundColor: palette.surfaceSubtle,
                      borderColor: palette.borderStrong,
                    },
                  ]}
                  placeholder="Key label (e.g. Notion Content Pipeline)"
                  placeholderTextColor={palette.textMuted}
                  value={keyLabel}
                  onChangeText={setKeyLabel}
                />
                <Pressable
                  onPress={() => void handleGenerateApiKey()}
                  style={[styles.solidBtn, { backgroundColor: palette.ctaBg }]}
                >
                  <Text
                    style={{
                      fontSize: 12.5,
                      fontWeight: '600',
                      color: palette.ctaText,
                    }}
                  >
                    Generate API key
                  </Text>
                </Pressable>
              </View>

              {revealedSecret && (
                <View
                  style={[
                    styles.secretRevealBox,
                    {
                      borderColor: palette.accent,
                      backgroundColor: palette.surfaceSubtle,
                    },
                  ]}
                >
                  <View style={{ flex: 1, gap: 2 }}>
                    <Text
                      style={{
                        fontSize: 11.5,
                        fontWeight: '700',
                        color: palette.accent,
                      }}
                    >
                      Copy your new Studio API key now (shown once):
                    </Text>
                    <Text
                      selectable
                      style={{
                        fontSize: 13,
                        fontWeight: '600',
                        color: palette.text,
                      }}
                    >
                      {revealedSecret}
                    </Text>
                  </View>
                  <Pressable
                    onPress={() => void copyText('new_api_key', revealedSecret)}
                    style={[
                      styles.outlineBtn,
                      { borderColor: palette.borderStrong },
                    ]}
                  >
                    <Text
                      style={{
                        fontSize: 12,
                        fontWeight: '600',
                        color:
                          copiedId === 'new_api_key'
                            ? palette.success
                            : palette.text,
                      }}
                    >
                      {copiedId === 'new_api_key' ? 'Copied ✓' : 'Copy key'}
                    </Text>
                  </Pressable>
                </View>
              )}

              {apiKeys.map((k) => (
                <View
                  key={k.id}
                  style={[
                    styles.listRow,
                    {
                      borderColor: palette.border,
                      backgroundColor: palette.surfaceSubtle,
                    },
                  ]}
                >
                  <View style={{ flex: 1 }}>
                    <Text
                      style={{
                        fontSize: 13,
                        fontWeight: '600',
                        color: palette.text,
                      }}
                    >
                      {k.label}
                    </Text>
                    <Text style={{ fontSize: 11.5, color: palette.textMuted }}>
                      {k.keyPrefix}
                      {k.lastUsedAt
                        ? ` · Last used ${new Date(
                            k.lastUsedAt
                          ).toLocaleTimeString([], {
                            hour: '2-digit',
                            minute: '2-digit',
                          })}`
                        : ' · Never used yet'}
                    </Text>
                  </View>
                  <Pressable
                    onPress={() => void revokeApiKey(k.id)}
                    style={{ padding: 4 }}
                  >
                    <Ionicons
                      name="trash-outline"
                      size={15}
                      color={palette.textMuted}
                    />
                  </Pressable>
                </View>
              ))}

              <View
                style={[
                  styles.codeSnippetBox,
                  {
                    backgroundColor: palette.surfaceSubtle,
                    borderColor: palette.border,
                  },
                ]}
              >
                <View
                  style={{
                    flexDirection: 'row',
                    justifyContent: 'space-between',
                    alignItems: 'center',
                  }}
                >
                  <Text
                    style={{
                      fontSize: 11.5,
                      fontWeight: '600',
                      color: palette.textSecondary,
                    }}
                  >
                    Quick webhook / Zapier example
                  </Text>
                  <Pressable
                    onPress={() => void copyText('curl_snip', sampleCurl)}
                  >
                    <Text
                      style={{
                        fontSize: 11.5,
                        fontWeight: '600',
                        color:
                          copiedId === 'curl_snip'
                            ? palette.success
                            : palette.textSecondary,
                      }}
                    >
                      {copiedId === 'curl_snip' ? 'Copied ✓' : 'Copy cURL'}
                    </Text>
                  </Pressable>
                </View>
                <Text
                  selectable
                  style={{
                    fontSize: 11.5,
                    lineHeight: 17,
                    color: palette.text,
                    fontFamily: Platform.OS === 'web' ? 'monospace' : 'SpaceMono',
                  }}
                >
                  {sampleCurl}
                </Text>
              </View>
            </View>

            {/* 4. Customer Roster & 1-Click Plan Comping */}
            <View
              style={[
                styles.sectionCard,
                {
                  backgroundColor: palette.surface,
                  borderColor: palette.border,
                },
              ]}
            >
              <Text style={[styles.sectionTitle, { color: palette.text }]}>
                Customer accounts ({overview.users.length})
              </Text>

              {overview.users.map((u) => (
                <View
                  key={u.id}
                  style={[
                    styles.listRow,
                    {
                      borderColor: palette.border,
                      backgroundColor: palette.surfaceSubtle,
                    },
                  ]}
                >
                  <View style={{ flex: 1 }}>
                    <Text
                      style={{
                        fontSize: 13.5,
                        fontWeight: '600',
                        color: palette.text,
                      }}
                    >
                      {u.name}{' '}
                      <Text
                        style={{
                          fontSize: 11.5,
                          fontWeight: '700',
                          color: palette.accent,
                        }}
                      >
                        · {u.planTier.toUpperCase()}
                      </Text>
                    </Text>
                    <Text style={{ fontSize: 11.5, color: palette.textMuted }}>
                      {u.email} · {u.workspacesCount}{' '}
                      {u.workspacesCount === 1 ? 'workspace' : 'workspaces'}
                    </Text>
                  </View>

                  <View style={{ flexDirection: 'row', gap: 5 }}>
                    {(['free', 'creator', 'studio'] as PlanTierId[]).map(
                      (tier) => {
                        const active = u.planTier === tier;
                        return (
                          <Pressable
                            key={tier}
                            disabled={active}
                            onPress={() => void handleCompUser(u.id, tier)}
                            style={[
                              styles.pillBtn,
                              {
                                backgroundColor: active
                                  ? palette.ctaBg
                                  : palette.surface,
                                borderColor: active
                                  ? palette.ctaBg
                                  : palette.border,
                              },
                            ]}
                          >
                            <Text
                              style={{
                                fontSize: 11,
                                fontWeight: '600',
                                color: active
                                  ? palette.ctaText
                                  : palette.textSecondary,
                              }}
                            >
                              {tier === 'free'
                                ? 'Starter'
                                : tier === 'creator'
                                ? 'Creator'
                                : 'Studio'}
                            </Text>
                          </Pressable>
                        );
                      }
                    )}
                  </View>
                </View>
              ))}
            </View>

            {/* 5. Transactional Email Outbox */}
            <View
              style={[
                styles.sectionCard,
                {
                  backgroundColor: palette.surface,
                  borderColor: palette.border,
                },
              ]}
            >
              <Text style={[styles.sectionTitle, { color: palette.text }]}>
                Recent transactional emails ({overview.recentEmails.length})
              </Text>
              {overview.recentEmails.length === 0 ? (
                <Text style={{ fontSize: 12.5, color: palette.textMuted }}>
                  Password resets, team invites, and client review notifications appear here (and send live when RESEND_API_KEY is set).
                </Text>
              ) : (
                overview.recentEmails.map((em) => (
                  <View
                    key={em.id}
                    style={[
                      styles.listRow,
                      {
                        borderColor: palette.border,
                        backgroundColor: palette.surfaceSubtle,
                      },
                    ]}
                  >
                    <View style={{ flex: 1, gap: 2 }}>
                      <Text
                        style={{
                          fontSize: 13,
                          fontWeight: '600',
                          color: palette.text,
                        }}
                      >
                        {em.subject}
                      </Text>
                      <Text
                        style={{ fontSize: 11.5, color: palette.textMuted }}
                      >
                        To {em.toEmail} ·{' '}
                        {em.deliveryMode === 'resend_live'
                          ? 'Sent via Resend'
                          : 'Logged locally'}
                      </Text>
                    </View>
                  </View>
                ))
              )}
            </View>
          </>
        )}

        {loading && !overview && (
          <Text style={{ fontSize: 13, color: palette.textMuted }}>
            Loading founder console…
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
    maxWidth: 960,
    width: '100%',
    alignSelf: 'center',
    paddingHorizontal: 20,
    paddingTop: 24,
    paddingBottom: 56,
    gap: 18,
  },
  topRow: {
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
  },
  metricsGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 12,
  },
  metricCard: {
    flexGrow: 1,
    minWidth: 205,
    padding: 16,
    borderRadius: 12,
    borderWidth: 1,
    gap: 4,
  },
  sectionCard: {
    borderRadius: 12,
    borderWidth: 1,
    padding: 18,
    gap: 12,
  },
  sectionTitle: {
    fontSize: 15,
    fontWeight: '600',
  },
  createPromoRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 8,
    alignItems: 'center',
  },
  input: {
    minWidth: 150,
    borderWidth: 1,
    borderRadius: 8,
    paddingHorizontal: 11,
    paddingVertical: 8,
    fontSize: 13,
  },
  pillBtn: {
    paddingHorizontal: 10,
    paddingVertical: 6.5,
    borderRadius: 7,
    borderWidth: 1,
  },
  solidBtn: {
    paddingHorizontal: 14,
    paddingVertical: 8.5,
    borderRadius: 7,
  },
  outlineBtn: {
    paddingHorizontal: 11,
    paddingVertical: 6.5,
    borderRadius: 7,
    borderWidth: 1,
  },
  listRow: {
    flexDirection: 'row',
    alignItems: 'center',
    flexWrap: 'wrap',
    gap: 10,
    paddingHorizontal: 13,
    paddingVertical: 10,
    borderRadius: 9,
    borderWidth: 1,
  },
  secretRevealBox: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    padding: 12,
    borderRadius: 9,
    borderWidth: 1,
  },
  codeSnippetBox: {
    padding: 12,
    borderRadius: 9,
    borderWidth: 1,
    gap: 6,
  },
});
