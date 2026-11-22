import { Ionicons } from '@expo/vector-icons';
import { usePathname, useRouter } from 'expo-router';
import React, { useState } from 'react';
import {
  Pressable,
  StyleSheet,
  Text,
  useWindowDimensions,
  View,
} from 'react-native';
import { PLAN_TIERS, WORKSPACE_ROLE_LABELS } from '../../shared/platforms';
import { useOmniPost } from '../context/OmniPostContext';
import { WorkspaceModal } from './WorkspaceModal';

export function AppHeader() {
  const router = useRouter();
  const pathname = usePathname();
  const { width } = useWindowDimensions();
  const isDesktop = width >= 768;

  const {
    palette,
    toggleTheme,
    user,
    openBillingModal,
    activeWorkspace,
    accounts,
    activeJobsCount,
    scheduledCount,
    members,
    rolePreview,
    effectiveRole,
    openTeamModal,
    openBioModal,
    unansweredInboxCount,
  } = useOmniPost();

  const [wsModalOpen, setWsModalOpen] = useState(false);

  const currentRoute:
    | 'create'
    | 'history'
    | 'inbox'
    | 'insights'
    | 'accounts' = pathname.includes('history')
    ? 'history'
    : pathname.includes('inbox')
    ? 'inbox'
    : pathname.includes('insights')
    ? 'insights'
    : pathname.includes('accounts')
    ? 'accounts'
    : 'create';

  return (
    <View
      style={[
        styles.outer,
        {
          backgroundColor: palette.surface,
          borderBottomColor: palette.border,
        },
      ]}
    >
      <WorkspaceModal
        visible={wsModalOpen}
        onClose={() => setWsModalOpen(false)}
      />

      <View style={styles.inner}>
        <View style={styles.leftCluster}>
          <View style={styles.brandAndWorkspace}>
            <Pressable onPress={() => router.push('/')} style={styles.brandBtn}>
              <View
                style={[styles.brandDot, { backgroundColor: palette.accent }]}
              />
              <Text style={[styles.brandWordmark, { color: palette.text }]}>
                omnipost
              </Text>
            </Pressable>

            <Text style={[styles.slashSep, { color: palette.borderStrong }]}>
              /
            </Text>

            <Pressable
              onPress={() => setWsModalOpen(true)}
              style={[
                styles.workspaceBtn,
                {
                  backgroundColor: palette.surfaceSubtle,
                  borderColor: palette.border,
                },
              ]}
            >
              <View
                style={[
                  styles.wsDot,
                  { backgroundColor: activeWorkspace.accentColor },
                ]}
              />
              <Text
                style={[styles.wsBtnText, { color: palette.text }]}
                numberOfLines={1}
              >
                {activeWorkspace.name}
              </Text>
              <Ionicons
                name="chevron-down"
                size={12}
                color={palette.textSecondary}
              />
            </Pressable>
          </View>

          {isDesktop && (
            <View style={styles.navLinks}>
              <Pressable
                onPress={() => router.push('/')}
                style={[
                  styles.navLink,
                  currentRoute === 'create' && {
                    backgroundColor: palette.surfaceMuted,
                  },
                ]}
              >
                <Text
                  style={[
                    styles.navLinkText,
                    {
                      color:
                        currentRoute === 'create'
                          ? palette.text
                          : palette.textSecondary,
                      fontWeight: currentRoute === 'create' ? '600' : '500',
                    },
                  ]}
                >
                  New post
                </Text>
              </Pressable>

              <Pressable
                onPress={() => router.push('/history')}
                style={[
                  styles.navLink,
                  currentRoute === 'history' && {
                    backgroundColor: palette.surfaceMuted,
                  },
                ]}
              >
                <Text
                  style={[
                    styles.navLinkText,
                    {
                      color:
                        currentRoute === 'history'
                          ? palette.text
                          : palette.textSecondary,
                      fontWeight: currentRoute === 'history' ? '600' : '500',
                    },
                  ]}
                >
                  Queue{scheduledCount > 0 ? ` (${scheduledCount})` : ''}
                </Text>
                {activeJobsCount > 0 && (
                  <View
                    style={[
                      styles.liveCountDot,
                      { backgroundColor: palette.accent },
                    ]}
                  />
                )}
              </Pressable>

              <Pressable
                onPress={() => router.push('/inbox' as any)}
                style={[
                  styles.navLink,
                  currentRoute === 'inbox' && {
                    backgroundColor: palette.surfaceMuted,
                  },
                ]}
              >
                <Text
                  style={[
                    styles.navLinkText,
                    {
                      color:
                        currentRoute === 'inbox'
                          ? palette.text
                          : palette.textSecondary,
                      fontWeight: currentRoute === 'inbox' ? '600' : '500',
                    },
                  ]}
                >
                  Inbox
                  {unansweredInboxCount > 0 ? ` (${unansweredInboxCount})` : ''}
                </Text>
              </Pressable>

              <Pressable
                onPress={() => router.push('/insights')}
                style={[
                  styles.navLink,
                  currentRoute === 'insights' && {
                    backgroundColor: palette.surfaceMuted,
                  },
                ]}
              >
                <Text
                  style={[
                    styles.navLinkText,
                    {
                      color:
                        currentRoute === 'insights'
                          ? palette.text
                          : palette.textSecondary,
                      fontWeight: currentRoute === 'insights' ? '600' : '500',
                    },
                  ]}
                >
                  Insights
                </Text>
              </Pressable>

              <Pressable
                onPress={() => router.push('/accounts')}
                style={[
                  styles.navLink,
                  currentRoute === 'accounts' && {
                    backgroundColor: palette.surfaceMuted,
                  },
                ]}
              >
                <Text
                  style={[
                    styles.navLinkText,
                    {
                      color:
                        currentRoute === 'accounts'
                          ? palette.text
                          : palette.textSecondary,
                      fontWeight: currentRoute === 'accounts' ? '600' : '500',
                    },
                  ]}
                >
                  Accounts
                </Text>
              </Pressable>
            </View>
          )}
        </View>

        <View style={styles.rightCluster}>
          {user.isFounderAdmin && (
            <Pressable
              onPress={() => router.push('/admin' as any)}
              accessibilityLabel="Open Founder Admin Console"
              style={[
                styles.planPillBtn,
                {
                  borderColor: pathname.includes('admin')
                    ? palette.text
                    : palette.border,
                  backgroundColor: pathname.includes('admin')
                    ? palette.surfaceMuted
                    : palette.surfaceSubtle,
                },
              ]}
            >
              <Text
                style={[styles.planPillText, { color: palette.text }]}
                numberOfLines={1}
              >
                Admin
              </Text>
            </Pressable>
          )}

          <Pressable
            onPress={openBioModal}
            accessibilityLabel="Manage Link-in-Bio page"
            style={[
              styles.planPillBtn,
              {
                borderColor: palette.border,
                backgroundColor: palette.surfaceSubtle,
              },
            ]}
          >
            <Text
              style={[styles.planPillText, { color: palette.textSecondary }]}
              numberOfLines={1}
            >
              Bio
            </Text>
          </Pressable>

          <Pressable
            onPress={openTeamModal}
            accessibilityLabel="Manage workspace team and approval rules"
            style={[
              styles.planPillBtn,
              {
                borderColor: rolePreview ? palette.accent : palette.border,
                backgroundColor: palette.surfaceSubtle,
              },
            ]}
          >
            <Text
              style={[
                styles.planPillText,
                {
                  color: rolePreview ? palette.accent : palette.textSecondary,
                },
              ]}
              numberOfLines={1}
            >
              {rolePreview
                ? `Role: ${WORKSPACE_ROLE_LABELS[effectiveRole].label}`
                : `Team${members.length > 0 ? ` (${members.length})` : ''}`}
            </Text>
          </Pressable>

          {isDesktop && (
            <Pressable
              onPress={() => router.push('/accounts')}
              style={styles.accountsStatusBtn}
            >
              <View
                style={[
                  styles.statusDot,
                  {
                    backgroundColor:
                      accounts.length > 0 ? palette.success : palette.textMuted,
                  },
                ]}
              />
              <Text
                style={[
                  styles.accountsStatusText,
                  { color: palette.textSecondary },
                ]}
              >
                {accounts.length} linked
              </Text>
            </Pressable>
          )}

          <Pressable
            onPress={() => openBillingModal()}
            style={[
              styles.planPillBtn,
              {
                borderColor:
                  user.planTier === 'free'
                    ? palette.accent
                    : palette.border,
                backgroundColor: palette.surfaceSubtle,
              },
            ]}
          >
            <Text
              style={[
                styles.planPillText,
                {
                  color:
                    user.planTier === 'free' ? palette.accent : palette.text,
                },
              ]}
              numberOfLines={1}
            >
              {user.planTier === 'free'
                ? 'Starter · Upgrade'
                : `${PLAN_TIERS[user.planTier].name}${
                    isDesktop ? ` · ${user.name.split(' ')[0]}` : ''
                  }`}
            </Text>
          </Pressable>

          <Pressable
            onPress={() => router.push('/welcome')}
            accessibilityLabel="View public landing page"
            style={[
              styles.planPillBtn,
              {
                borderColor: palette.border,
                backgroundColor: palette.surfaceSubtle,
              },
            ]}
          >
            <Text style={[styles.planPillText, { color: palette.textSecondary }]}>
              Site
            </Text>
          </Pressable>

          <Pressable
            onPress={toggleTheme}
            accessibilityLabel="Switch theme"
            style={[
              styles.themeBtn,
              {
                borderColor: palette.border,
                backgroundColor: palette.surfaceSubtle,
              },
            ]}
          >
            <Ionicons
              name={palette.mode === 'light' ? 'moon-outline' : 'sunny-outline'}
              size={15}
              color={palette.textSecondary}
            />
          </Pressable>
        </View>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  outer: {
    borderBottomWidth: 1,
    paddingHorizontal: 20,
  },
  inner: {
    maxWidth: 1080,
    width: '100%',
    alignSelf: 'center',
    height: 54,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: 10,
  },
  leftCluster: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 22,
    flexShrink: 1,
  },
  brandAndWorkspace: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    flexShrink: 1,
  },
  brandBtn: {
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
    fontSize: 17,
    fontWeight: '700',
    letterSpacing: -0.5,
  },
  slashSep: {
    fontSize: 16,
    fontWeight: '300',
  },
  workspaceBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    paddingHorizontal: 9,
    paddingVertical: 4.5,
    borderRadius: 7,
    borderWidth: 1,
    maxWidth: 165,
  },
  wsDot: {
    width: 7,
    height: 7,
    borderRadius: 4,
  },
  wsBtnText: {
    fontSize: 12.5,
    fontWeight: '600',
    flexShrink: 1,
  },
  navLinks: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
  },
  navLink: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    paddingHorizontal: 11,
    paddingVertical: 6,
    borderRadius: 7,
  },
  navLinkText: {
    fontSize: 13.5,
  },
  liveCountDot: {
    width: 6,
    height: 6,
    borderRadius: 3,
  },
  rightCluster: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
  },
  accountsStatusBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    paddingVertical: 4,
  },
  statusDot: {
    width: 6,
    height: 6,
    borderRadius: 3,
  },
  accountsStatusText: {
    fontSize: 12.5,
    fontWeight: '500',
  },
  planPillBtn: {
    paddingHorizontal: 9,
    paddingVertical: 4.5,
    borderRadius: 7,
    borderWidth: 1,
    maxWidth: 150,
  },
  planPillText: {
    fontSize: 12,
    fontWeight: '600',
  },
  themeBtn: {
    width: 30,
    height: 30,
    borderRadius: 7,
    borderWidth: 1,
    alignItems: 'center',
    justifyContent: 'center',
  },
});
