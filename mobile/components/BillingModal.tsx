import { Ionicons } from '@expo/vector-icons';
import React, { useEffect, useState } from 'react';
import {
  Modal,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  useWindowDimensions,
  View,
} from 'react-native';
import {
  BillingInterval,
  PLAN_TIERS,
  PlanTierId,
} from '../../shared/platforms';
import { useOmniPost } from '../context/OmniPostContext';

const TIER_ORDER: PlanTierId[] = ['free', 'creator', 'studio'];

export function BillingModal() {
  const { width } = useWindowDimensions();
  const isDesktop = width >= 760;

  const {
    palette,
    user,
    usage,
    activeWorkspace,
    billingModalOpen,
    billingHighlightTier,
    billingReason,
    closeBillingModal,
    selectPlan,
    redeemPromoCode,
    logout,
  } = useOmniPost();

  const [interval, setInterval] = useState<BillingInterval>(
    user.billingInterval || 'monthly'
  );
  const [loadingTier, setLoadingTier] = useState<PlanTierId | null>(null);
  const [promoInput, setPromoInput] = useState('');
  const [redeemingPromo, setRedeemingPromo] = useState(false);
  const [promoStatus, setPromoStatus] = useState<{
    ok: boolean;
    msg: string;
  } | null>(null);

  useEffect(() => {
    setInterval(user.billingInterval || 'monthly');
    setPromoStatus(null);
  }, [user.billingInterval, billingModalOpen]);

  const handleChooseTier = async (tier: PlanTierId) => {
    setLoadingTier(tier);
    try {
      await selectPlan(tier, interval);
    } finally {
      setLoadingTier(null);
    }
  };

  return (
    <Modal
      visible={billingModalOpen}
      transparent
      animationType="fade"
      onRequestClose={closeBillingModal}
    >
      <Pressable style={styles.backdrop} onPress={closeBillingModal}>
        <Pressable
          onPress={(e) => e.stopPropagation()}
          style={[
            styles.sheet,
            {
              backgroundColor: palette.surface,
              borderColor: palette.border,
            },
          ]}
        >
          {/* Header */}
          <View
            style={[styles.header, { borderBottomColor: palette.border }]}
          >
            <View style={{ flex: 1, gap: 2 }}>
              <Text style={[styles.title, { color: palette.text }]}>
                Plans & billing
              </Text>
              <Text
                style={[styles.subtitle, { color: palette.textSecondary }]}
                numberOfLines={1}
              >
                Signed in as {user.name} ({user.email}) · Currently on{' '}
                {PLAN_TIERS[user.planTier].name}
              </Text>
            </View>

            <View style={styles.headerRight}>
              <View
                style={[
                  styles.intervalToggle,
                  {
                    backgroundColor: palette.surfaceSubtle,
                    borderColor: palette.border,
                  },
                ]}
              >
                <Pressable
                  onPress={() => setInterval('monthly')}
                  style={[
                    styles.intervalBtn,
                    interval === 'monthly' && {
                      backgroundColor: palette.surface,
                    },
                  ]}
                >
                  <Text
                    style={[
                      styles.intervalText,
                      {
                        color:
                          interval === 'monthly'
                            ? palette.text
                            : palette.textSecondary,
                        fontWeight: interval === 'monthly' ? '600' : '400',
                      },
                    ]}
                  >
                    Monthly
                  </Text>
                </Pressable>

                <Pressable
                  onPress={() => setInterval('annual')}
                  style={[
                    styles.intervalBtn,
                    interval === 'annual' && {
                      backgroundColor: palette.surface,
                    },
                  ]}
                >
                  <Text
                    style={[
                      styles.intervalText,
                      {
                        color:
                          interval === 'annual'
                            ? palette.text
                            : palette.textSecondary,
                        fontWeight: interval === 'annual' ? '600' : '400',
                      },
                    ]}
                  >
                    Annual (-20%)
                  </Text>
                </Pressable>
              </View>

              <Pressable
                onPress={closeBillingModal}
                style={[
                  styles.closeBtn,
                  {
                    borderColor: palette.border,
                    backgroundColor: palette.surfaceSubtle,
                  },
                ]}
              >
                <Ionicons
                  name="close"
                  size={16}
                  color={palette.textSecondary}
                />
              </Pressable>
            </View>
          </View>

          <ScrollView contentContainerStyle={styles.body}>
            {billingReason ? (
              <View
                style={[
                  styles.reasonBanner,
                  {
                    backgroundColor: palette.warningBg,
                    borderColor: palette.border,
                  },
                ]}
              >
                <Ionicons
                  name="information-circle-outline"
                  size={16}
                  color={palette.warning}
                />
                <Text style={[styles.reasonText, { color: palette.text }]}>
                  {billingReason}
                </Text>
              </View>
            ) : null}

            {/* Live Account Usage Strip */}
            <View
              style={[
                styles.usageStrip,
                {
                  backgroundColor: palette.surfaceSubtle,
                  borderColor: palette.border,
                  flexDirection: isDesktop ? 'row' : 'column',
                },
              ]}
            >
              <View
                style={[
                  styles.usageCell,
                  isDesktop && {
                    borderRightWidth: 1,
                    borderRightColor: palette.border,
                  },
                ]}
              >
                <Text
                  style={[styles.usageLabel, { color: palette.textSecondary }]}
                >
                  Brand workspaces
                </Text>
                <Text style={[styles.usageValue, { color: palette.text }]}>
                  {usage.workspacesUsed} /{' '}
                  {usage.maxWorkspaces === null ? 'Unlimited' : usage.maxWorkspaces}
                </Text>
              </View>

              <View
                style={[
                  styles.usageCell,
                  isDesktop && {
                    borderRightWidth: 1,
                    borderRightColor: palette.border,
                  },
                ]}
              >
                <Text
                  style={[styles.usageLabel, { color: palette.textSecondary }]}
                >
                  Channels in {activeWorkspace.name}
                </Text>
                <Text style={[styles.usageValue, { color: palette.text }]}>
                  {usage.accountsInActiveWorkspace} /{' '}
                  {usage.maxAccountsPerWorkspace === null
                    ? 'All 8'
                    : usage.maxAccountsPerWorkspace}
                </Text>
              </View>

              <View style={styles.usageCell}>
                <Text
                  style={[styles.usageLabel, { color: palette.textSecondary }]}
                >
                  Posts this month
                </Text>
                <Text style={[styles.usageValue, { color: palette.text }]}>
                  {usage.postsThisMonth} /{' '}
                  {usage.maxPostsPerMonth === null
                    ? 'Unlimited'
                    : usage.maxPostsPerMonth}
                </Text>
              </View>
            </View>

            {/* 3-Column Plan Comparison */}
            <View
              style={[
                styles.tiersRow,
                { flexDirection: isDesktop ? 'row' : 'column' },
              ]}
            >
              {TIER_ORDER.map((tierId) => {
                const spec = PLAN_TIERS[tierId];
                const isCurrent =
                  user.planTier === tierId &&
                  (tierId === 'free' || user.billingInterval === interval);
                const isRecommended =
                  billingReason && billingHighlightTier === tierId;
                const price =
                  interval === 'annual'
                    ? spec.annualMonthlyPriceUsd
                    : spec.monthlyPriceUsd;

                return (
                  <View
                    key={tierId}
                    style={[
                      styles.tierCard,
                      {
                        backgroundColor: palette.surface,
                        borderColor:
                          isRecommended || tierId === 'creator'
                            ? palette.text
                            : palette.border,
                        borderWidth:
                          isRecommended || tierId === 'creator' ? 1.5 : 1,
                      },
                    ]}
                  >
                    <View style={styles.tierTop}>
                      <View style={styles.tierNameLine}>
                        <Text
                          style={[styles.tierName, { color: palette.text }]}
                        >
                          {spec.name}
                        </Text>
                        {tierId === 'creator' && (
                          <View
                            style={[
                              styles.popularTag,
                              {
                                backgroundColor: palette.surfaceMuted,
                              },
                            ]}
                          >
                            <Text
                              style={[
                                styles.popularTagText,
                                { color: palette.text },
                              ]}
                            >
                              Most popular
                            </Text>
                          </View>
                        )}
                      </View>

                      <Text
                        style={[
                          styles.tierTagline,
                          { color: palette.textSecondary },
                        ]}
                      >
                        {spec.tagline}
                      </Text>

                      <View style={styles.priceLine}>
                        <Text
                          style={[styles.priceAmount, { color: palette.text }]}
                        >
                          ${price}
                        </Text>
                        <Text
                          style={[
                            styles.priceUnit,
                            { color: palette.textMuted },
                          ]}
                        >
                          {price === 0
                            ? 'forever'
                            : interval === 'annual'
                            ? '/ mo · billed yearly'
                            : '/ month'}
                        </Text>
                      </View>
                    </View>

                    <View style={styles.featureList}>
                      {spec.features.map((feat) => (
                        <View key={feat} style={styles.featureRow}>
                          <Ionicons
                            name="checkmark"
                            size={14}
                            color={palette.text}
                          />
                          <Text
                            style={[
                              styles.featureText,
                              { color: palette.textSecondary },
                            ]}
                          >
                            {feat}
                          </Text>
                        </View>
                      ))}
                    </View>

                    <Pressable
                      disabled={isCurrent || loadingTier !== null}
                      onPress={() => void handleChooseTier(tierId)}
                      style={[
                        styles.chooseBtn,
                        isCurrent
                          ? {
                              backgroundColor: palette.surfaceSubtle,
                              borderWidth: 1,
                              borderColor: palette.border,
                            }
                          : tierId === 'free'
                          ? {
                              backgroundColor: palette.surface,
                              borderWidth: 1,
                              borderColor: palette.borderStrong,
                            }
                          : {
                              backgroundColor: palette.ctaBg,
                            },
                      ]}
                    >
                      <Text
                        style={[
                          styles.chooseBtnText,
                          {
                            color: isCurrent
                              ? palette.textMuted
                              : tierId === 'free'
                              ? palette.text
                              : palette.ctaText,
                          },
                        ]}
                      >
                        {loadingTier === tierId
                          ? 'Updating...'
                          : isCurrent
                          ? 'Current plan'
                          : tierId === 'free'
                          ? 'Switch to Starter (test limits)'
                          : usage.stripeLiveConfigured
                          ? `Checkout ${spec.name}`
                          : `Upgrade to ${spec.name}`}
                      </Text>
                    </Pressable>
                  </View>
                );
              })}
            </View>

            {/* Promo / Beta Access Code Redemption */}
            <View
              style={{
                marginTop: 14,
                padding: 13,
                borderRadius: 10,
                borderWidth: 1,
                borderColor: palette.border,
                backgroundColor: palette.surfaceSubtle,
                gap: 8,
              }}
            >
              <View
                style={{
                  flexDirection: 'row',
                  alignItems: 'center',
                  flexWrap: 'wrap',
                  gap: 8,
                }}
              >
                <Text
                  style={{
                    fontSize: 12,
                    fontWeight: '600',
                    color: palette.textSecondary,
                  }}
                >
                  Have a beta or launch code?
                </Text>
                <TextInput
                  style={{
                    flex: 1,
                    minWidth: 150,
                    borderWidth: 1,
                    borderColor: palette.borderStrong,
                    backgroundColor: palette.surface,
                    color: palette.text,
                    borderRadius: 7,
                    paddingHorizontal: 10,
                    paddingVertical: 6,
                    fontSize: 12.5,
                  }}
                  autoCapitalize="characters"
                  placeholder="Enter code (e.g. AGENCY30 or EARLYBIRD)"
                  placeholderTextColor={palette.textMuted}
                  value={promoInput}
                  onChangeText={setPromoInput}
                />
                <Pressable
                  disabled={!promoInput.trim() || redeemingPromo}
                  onPress={async () => {
                    setRedeemingPromo(true);
                    setPromoStatus(null);
                    try {
                      const promo = await redeemPromoCode(promoInput.trim());
                      setPromoStatus({
                        ok: true,
                        msg: `Unlocked ${promo.grantTier.toUpperCase()} plan with ${promo.code}!`,
                      });
                      setPromoInput('');
                    } catch (err: any) {
                      setPromoStatus({
                        ok: false,
                        msg: err?.message || 'Could not redeem code.',
                      });
                    } finally {
                      setRedeemingPromo(false);
                    }
                  }}
                  style={{
                    paddingHorizontal: 13,
                    paddingVertical: 7,
                    borderRadius: 7,
                    backgroundColor: promoInput.trim()
                      ? palette.ctaBg
                      : palette.ctaDisabledBg,
                  }}
                >
                  <Text
                    style={{
                      fontSize: 12,
                      fontWeight: '600',
                      color: promoInput.trim()
                        ? palette.ctaText
                        : palette.ctaDisabledText,
                    }}
                  >
                    {redeemingPromo ? 'Applying…' : 'Redeem'}
                  </Text>
                </Pressable>
              </View>
              {promoStatus && (
                <Text
                  style={{
                    fontSize: 12,
                    fontWeight: '600',
                    color: promoStatus.ok ? palette.success : palette.danger,
                  }}
                >
                  {promoStatus.msg}
                </Text>
              )}
            </View>
          </ScrollView>

          <View
            style={[styles.footer, { borderTopColor: palette.border }]}
          >
            <Text style={[styles.footerNote, { color: palette.textMuted }]}>
              {usage.stripeLiveConfigured
                ? 'Live Stripe Checkout enabled · Secure card & Apple Pay billing'
                : 'Instant sandbox billing active · Add STRIPE_SECRET_KEY in server/.env for live Stripe Checkout'}
            </Text>

            <Pressable
              onPress={() => {
                closeBillingModal();
                void logout();
              }}
              style={styles.logoutBtn}
            >
              <Ionicons
                name="log-out-outline"
                size={14}
                color={palette.textSecondary}
              />
              <Text
                style={[styles.logoutText, { color: palette.textSecondary }]}
              >
                Sign out / Switch user
              </Text>
            </Pressable>
          </View>
        </Pressable>
      </Pressable>
    </Modal>
  );
}

const styles = StyleSheet.create({
  backdrop: {
    flex: 1,
    backgroundColor: 'rgba(15, 15, 14, 0.48)',
    alignItems: 'center',
    justifyContent: 'center',
    padding: 16,
  },
  sheet: {
    width: '100%',
    maxWidth: 880,
    maxHeight: '90%',
    borderRadius: 14,
    borderWidth: 1,
    overflow: 'hidden',
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    flexWrap: 'wrap',
    paddingHorizontal: 20,
    paddingVertical: 14,
    borderBottomWidth: 1,
    gap: 12,
  },
  title: {
    fontSize: 17,
    fontWeight: '700',
    letterSpacing: -0.3,
  },
  subtitle: {
    fontSize: 12.5,
  },
  headerRight: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
  },
  intervalToggle: {
    flexDirection: 'row',
    borderWidth: 1,
    borderRadius: 8,
    padding: 2,
    gap: 2,
  },
  intervalBtn: {
    paddingHorizontal: 10,
    paddingVertical: 5,
    borderRadius: 6,
  },
  intervalText: {
    fontSize: 12,
  },
  closeBtn: {
    width: 28,
    height: 28,
    borderRadius: 7,
    borderWidth: 1,
    alignItems: 'center',
    justifyContent: 'center',
  },
  body: {
    padding: 20,
    gap: 16,
  },
  reasonBanner: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    paddingHorizontal: 13,
    paddingVertical: 10,
    borderRadius: 8,
    borderWidth: 1,
  },
  reasonText: {
    flex: 1,
    fontSize: 13,
    fontWeight: '500',
  },
  usageStrip: {
    borderWidth: 1,
    borderRadius: 10,
    overflow: 'hidden',
  },
  usageCell: {
    flex: 1,
    paddingHorizontal: 14,
    paddingVertical: 10,
    gap: 2,
  },
  usageLabel: {
    fontSize: 11.5,
  },
  usageValue: {
    fontSize: 14,
    fontWeight: '700',
  },
  tiersRow: {
    gap: 12,
  },
  tierCard: {
    flex: 1,
    borderRadius: 12,
    padding: 18,
    justifyContent: 'space-between',
    gap: 16,
  },
  tierTop: {
    gap: 6,
  },
  tierNameLine: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: 8,
  },
  tierName: {
    fontSize: 16,
    fontWeight: '700',
    letterSpacing: -0.2,
  },
  popularTag: {
    paddingHorizontal: 7,
    paddingVertical: 2,
    borderRadius: 5,
  },
  popularTagText: {
    fontSize: 10.5,
    fontWeight: '600',
  },
  tierTagline: {
    fontSize: 12.5,
    lineHeight: 17,
    minHeight: 34,
  },
  priceLine: {
    flexDirection: 'row',
    alignItems: 'baseline',
    gap: 5,
    marginTop: 4,
  },
  priceAmount: {
    fontSize: 28,
    fontWeight: '700',
    letterSpacing: -0.8,
  },
  priceUnit: {
    fontSize: 12,
  },
  featureList: {
    gap: 8,
    flex: 1,
  },
  featureRow: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: 7,
  },
  featureText: {
    flex: 1,
    fontSize: 12.5,
    lineHeight: 17,
  },
  chooseBtn: {
    paddingVertical: 9.5,
    paddingHorizontal: 12,
    borderRadius: 8,
    alignItems: 'center',
  },
  chooseBtnText: {
    fontSize: 12.5,
    fontWeight: '600',
  },
  footer: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    flexWrap: 'wrap',
    paddingHorizontal: 20,
    paddingVertical: 12,
    borderTopWidth: 1,
    gap: 10,
  },
  footerNote: {
    fontSize: 11.5,
    flexShrink: 1,
  },
  logoutBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 5,
    paddingVertical: 3,
  },
  logoutText: {
    fontSize: 12.5,
    fontWeight: '500',
  },
});
