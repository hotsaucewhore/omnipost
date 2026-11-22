import { Ionicons } from '@expo/vector-icons';
import React, { useState } from 'react';
import {
  Modal,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native';
import {
  WORKSPACE_ROLE_LABELS,
  WorkspaceMember,
  WorkspaceRole,
} from '../../shared/platforms';
import { useOmniPost } from '../context/OmniPostContext';

const ASSIGNABLE_ROLES: Exclude<WorkspaceRole, 'owner'>[] = [
  'editor',
  'approver',
  'admin',
];

function initialsFor(name: string): string {
  const parts = name.trim().split(/\s+/).filter(Boolean);
  if (parts.length === 0) return 'TM';
  if (parts.length === 1) return parts[0].slice(0, 2).toUpperCase();
  return `${parts[0][0]}${parts[parts.length - 1][0]}`.toUpperCase();
}

export function TeamModal() {
  const {
    palette,
    usage,
    openBillingModal,
    activeWorkspace,
    members,
    rolePreview,
    effectiveRole,
    setRolePreview,
    teamModalOpen,
    closeTeamModal,
    toggleWorkspaceRequireApproval,
    inviteMember,
    updateMemberRole,
    removeMember,
  } = useOmniPost();

  const [inviteName, setInviteName] = useState('');
  const [inviteEmail, setInviteEmail] = useState('');
  const [inviteRole, setInviteRole] =
    useState<Exclude<WorkspaceRole, 'owner'>>('editor');
  const [inviting, setInviting] = useState(false);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  const [copiedMemberId, setCopiedMemberId] = useState<string | null>(null);

  const actualRole: WorkspaceRole =
    activeWorkspace.currentUserRole ?? 'owner';
  const canPreviewRoles = actualRole === 'owner' || actualRole === 'admin';
  const canManageTeam = effectiveRole === 'owner' || effectiveRole === 'admin';
  const studioIncluded = usage.allowsClientApprovals;

  const handleInvite = async () => {
    if (!inviteEmail.trim() || inviting) return;
    setErrorMsg(null);
    setInviting(true);
    try {
      const created = await inviteMember({
        email: inviteEmail.trim(),
        name: inviteName.trim() || undefined,
        role: inviteRole,
      });
      if (created) {
        setInviteName('');
        setInviteEmail('');
      }
    } catch (err: any) {
      setErrorMsg(err?.message || 'Could not send invite.');
    } finally {
      setInviting(false);
    }
  };

  const handleCopyInvite = async (member: WorkspaceMember) => {
    const origin =
      Platform.OS === 'web' && typeof window !== 'undefined'
        ? window.location.origin
        : 'http://localhost:8081';
    const inviteUrl = `${origin}/?invite=${encodeURIComponent(
      member.inviteToken || member.id
    )}&email=${encodeURIComponent(member.email)}`;
    if (
      Platform.OS === 'web' &&
      typeof navigator !== 'undefined' &&
      navigator.clipboard?.writeText
    ) {
      try {
        await navigator.clipboard.writeText(inviteUrl);
      } catch {
        // Ignore clipboard errors
      }
    }
    setCopiedMemberId(member.id);
    setTimeout(() => {
      setCopiedMemberId((prev) => (prev === member.id ? null : prev));
    }, 2200);
  };

  return (
    <Modal
      visible={teamModalOpen}
      transparent
      animationType="fade"
      onRequestClose={closeTeamModal}
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
          {/* Header */}
          <View
            style={[styles.header, { borderBottomColor: palette.border }]}
          >
            <View style={{ flex: 1 }}>
              <View style={styles.wsHeadingRow}>
                <View
                  style={[
                    styles.wsDot,
                    { backgroundColor: activeWorkspace.accentColor },
                  ]}
                />
                <Text style={[styles.title, { color: palette.text }]}>
                  Team & approval rules · {activeWorkspace.name}
                </Text>
              </View>
              <Text style={[styles.sub, { color: palette.textSecondary }]}>
                Assign Editor, Approver, or Admin permissions and gate scheduled publishing
              </Text>
            </View>
            <Pressable onPress={closeTeamModal} style={{ padding: 4 }}>
              <Ionicons name="close" size={20} color={palette.textSecondary} />
            </Pressable>
          </View>

          <ScrollView style={{ maxHeight: 500 }}>
            <View style={styles.body}>
              {/* Approval-Gated Publishing Switch */}
              <View
                style={[
                  styles.policyCard,
                  {
                    backgroundColor: palette.surfaceSubtle,
                    borderColor: palette.border,
                  },
                ]}
              >
                <View style={{ flex: 1, gap: 3 }}>
                  <View style={styles.policyTitleRow}>
                    <Text style={[styles.policyTitle, { color: palette.text }]}>
                      Hold scheduled posts until approved
                    </Text>
                    {activeWorkspace.requireApproval && (
                      <View
                        style={[
                          styles.activeGateBadge,
                          {
                            borderColor: palette.borderStrong,
                            backgroundColor: palette.surface,
                          },
                        ]}
                      >
                        <Text
                          style={{
                            fontSize: 10.5,
                            fontWeight: '600',
                            color: palette.success,
                          }}
                        >
                          Active gate
                        </Text>
                      </View>
                    )}
                  </View>
                  <Text
                    style={[
                      styles.policyDesc,
                      { color: palette.textSecondary },
                    ]}
                  >
                    Scheduled posts pause at their slot until an Owner, Admin, Approver, or client review link signs off.
                  </Text>
                </View>

                <Pressable
                  disabled={!canManageTeam}
                  onPress={() => {
                    void toggleWorkspaceRequireApproval(
                      !activeWorkspace.requireApproval
                    );
                  }}
                  style={[
                    styles.switchTrack,
                    {
                      backgroundColor: activeWorkspace.requireApproval
                        ? palette.ctaBg
                        : palette.surfaceMuted,
                      borderColor: activeWorkspace.requireApproval
                        ? palette.ctaBg
                        : palette.borderStrong,
                      opacity: canManageTeam ? 1 : 0.5,
                    },
                  ]}
                >
                  <View
                    style={[
                      styles.switchThumb,
                      {
                        backgroundColor: activeWorkspace.requireApproval
                          ? palette.ctaText
                          : palette.surface,
                        transform: [
                          {
                            translateX: activeWorkspace.requireApproval ? 16 : 0,
                          },
                        ],
                      },
                    ]}
                  />
                </Pressable>
              </View>

              {/* Interactive Role Perspective Switcher for Owners/Admins */}
              {canPreviewRoles && (
                <View
                  style={[
                    styles.previewBar,
                    {
                      borderColor: palette.border,
                      backgroundColor: palette.surface,
                    },
                  ]}
                >
                  <View style={styles.previewTopRow}>
                    <Text
                      style={[
                        styles.sectionLabel,
                        { color: palette.textSecondary },
                      ]}
                    >
                      Test studio permissions as
                    </Text>
                    <View style={styles.rolePillsRow}>
                      {(['owner', 'editor', 'approver'] as WorkspaceRole[]).map(
                        (r) => {
                          const selected =
                            (rolePreview ?? actualRole) === r;
                          return (
                            <Pressable
                              key={r}
                              onPress={() =>
                                setRolePreview(r === actualRole ? null : r)
                              }
                              style={[
                                styles.rolePill,
                                {
                                  backgroundColor: selected
                                    ? palette.ctaBg
                                    : palette.surfaceSubtle,
                                  borderColor: selected
                                    ? palette.ctaBg
                                    : palette.border,
                                },
                              ]}
                            >
                              <Text
                                style={{
                                  fontSize: 12,
                                  fontWeight: '600',
                                  color: selected
                                    ? palette.ctaText
                                    : palette.textSecondary,
                                }}
                              >
                                {WORKSPACE_ROLE_LABELS[r].label}
                              </Text>
                            </Pressable>
                          );
                        }
                      )}
                    </View>
                  </View>
                  <Text
                    style={{
                      fontSize: 12,
                      color: palette.textMuted,
                      lineHeight: 17,
                    }}
                  >
                    {WORKSPACE_ROLE_LABELS[effectiveRole].summary}
                  </Text>
                </View>
              )}

              {/* Workspace Members Roster */}
              <View style={{ gap: 8 }}>
                <Text
                  style={[styles.sectionLabel, { color: palette.textSecondary }]}
                >
                  Workspace members ({members.length})
                </Text>

                <View
                  style={[
                    styles.rosterCard,
                    {
                      borderColor: palette.border,
                      backgroundColor: palette.surface,
                    },
                  ]}
                >
                  {members.map((m, idx) => {
                    const isOwner = m.role === 'owner';
                    return (
                      <View
                        key={m.id}
                        style={[
                          styles.memberRow,
                          idx > 0 && {
                            borderTopWidth: 1,
                            borderTopColor: palette.border,
                          },
                        ]}
                      >
                        <View
                          style={[
                            styles.monogram,
                            {
                              backgroundColor: palette.surfaceSubtle,
                              borderColor: palette.border,
                            },
                          ]}
                        >
                          <Text
                            style={{
                              fontSize: 11.5,
                              fontWeight: '700',
                              color: palette.text,
                            }}
                          >
                            {initialsFor(m.name)}
                          </Text>
                        </View>

                        <View style={{ flex: 1, minWidth: 120 }}>
                          <View style={styles.memberNameRow}>
                            <Text
                              style={[styles.memberName, { color: palette.text }]}
                              numberOfLines={1}
                            >
                              {m.name}
                            </Text>
                            {m.status === 'invited' && (
                              <View
                                style={[
                                  styles.invitedBadge,
                                  {
                                    borderColor: palette.border,
                                    backgroundColor: palette.surfaceSubtle,
                                  },
                                ]}
                              >
                                <Text
                                  style={{
                                    fontSize: 10.5,
                                    fontWeight: '600',
                                    color: palette.warning,
                                  }}
                                >
                                  Invited
                                </Text>
                              </View>
                            )}
                          </View>
                          <Text
                            style={[
                              styles.memberEmail,
                              { color: palette.textMuted },
                            ]}
                            numberOfLines={1}
                          >
                            {m.email}
                          </Text>
                        </View>

                        {isOwner ? (
                          <View
                            style={[
                              styles.ownerTag,
                              {
                                borderColor: palette.border,
                                backgroundColor: palette.surfaceSubtle,
                              },
                            ]}
                          >
                            <Text
                              style={{
                                fontSize: 11.5,
                                fontWeight: '600',
                                color: palette.textSecondary,
                              }}
                            >
                              Owner
                            </Text>
                          </View>
                        ) : (
                          <View style={styles.memberActions}>
                            <View style={styles.inlineRoleGroup}>
                              {ASSIGNABLE_ROLES.map((r) => {
                                const active = m.role === r;
                                return (
                                  <Pressable
                                    key={r}
                                    disabled={!canManageTeam}
                                    onPress={() =>
                                      void updateMemberRole(m.id, r)
                                    }
                                    style={[
                                      styles.miniRoleBtn,
                                      {
                                        backgroundColor: active
                                          ? palette.surfaceMuted
                                          : 'transparent',
                                        borderColor: active
                                          ? palette.borderStrong
                                          : 'transparent',
                                      },
                                    ]}
                                  >
                                    <Text
                                      style={{
                                        fontSize: 11.5,
                                        fontWeight: active ? '600' : '500',
                                        color: active
                                          ? palette.text
                                          : palette.textMuted,
                                      }}
                                    >
                                      {WORKSPACE_ROLE_LABELS[r].label}
                                    </Text>
                                  </Pressable>
                                );
                              })}
                            </View>

                            {m.status === 'invited' && (
                              <Pressable
                                onPress={() => void handleCopyInvite(m)}
                                style={[
                                  styles.copyLinkBtn,
                                  { borderColor: palette.border },
                                ]}
                              >
                                <Text
                                  style={{
                                    fontSize: 11,
                                    fontWeight: '600',
                                    color:
                                      copiedMemberId === m.id
                                        ? palette.success
                                        : palette.textSecondary,
                                  }}
                                >
                                  {copiedMemberId === m.id ? 'Copied' : 'Link'}
                                </Text>
                              </Pressable>
                            )}

                            {canManageTeam && (
                              <Pressable
                                onPress={() => void removeMember(m.id)}
                                accessibilityLabel={`Remove ${m.name}`}
                                style={{ padding: 5 }}
                              >
                                <Ionicons
                                  name="trash-outline"
                                  size={14}
                                  color={palette.textMuted}
                                />
                              </Pressable>
                            )}
                          </View>
                        )}
                      </View>
                    );
                  })}
                </View>
              </View>

              {/* Invite New Team Member or Upgrade Banner */}
              <View
                style={[
                  styles.inviteSection,
                  {
                    borderColor: palette.border,
                    backgroundColor: palette.surfaceSubtle,
                  },
                ]}
              >
                {!studioIncluded ? (
                  <View style={{ gap: 8 }}>
                    <Text
                      style={{
                        fontSize: 13,
                        fontWeight: '600',
                        color: palette.text,
                      }}
                    >
                      Collaborate with editors & client approvers on Studio
                    </Text>
                    <Text
                      style={{
                        fontSize: 12.5,
                        lineHeight: 18,
                        color: palette.textSecondary,
                      }}
                    >
                      Invite video editors to load your queue and let brand leads approve posts before they publish. Included on Studio ($29/mo).
                    </Text>
                    <Pressable
                      onPress={() => {
                        closeTeamModal();
                        openBillingModal(
                          'studio',
                          'Team members, workspace roles & approval-gated publishing are included on Studio ($29/mo).'
                        );
                      }}
                      style={[
                        styles.primaryBtn,
                        {
                          backgroundColor: palette.ctaBg,
                          alignSelf: 'flex-start',
                        },
                      ]}
                    >
                      <Text
                        style={[
                          styles.primaryBtnText,
                          { color: palette.ctaText },
                        ]}
                      >
                        Upgrade to Studio
                      </Text>
                    </Pressable>
                  </View>
                ) : !canManageTeam ? (
                  <Text
                    style={{
                      fontSize: 12.5,
                      color: palette.textSecondary,
                    }}
                  >
                    You are currently viewing as{' '}
                    {WORKSPACE_ROLE_LABELS[effectiveRole].label}. Switch back to Owner or Admin to invite or edit team members.
                  </Text>
                ) : (
                  <View style={{ gap: 10 }}>
                    <Text
                      style={[
                        styles.sectionLabel,
                        { color: palette.textSecondary },
                      ]}
                    >
                      Invite collaborator
                    </Text>

                    <View style={styles.inviteInputsRow}>
                      <TextInput
                        style={[
                          styles.input,
                          {
                            flex: 0.9,
                            color: palette.text,
                            backgroundColor: palette.surface,
                            borderColor: palette.borderStrong,
                          },
                        ]}
                        placeholder="Name (e.g. Alex Rivera)"
                        placeholderTextColor={palette.textMuted}
                        value={inviteName}
                        onChangeText={setInviteName}
                      />
                      <TextInput
                        style={[
                          styles.input,
                          {
                            flex: 1.3,
                            color: palette.text,
                            backgroundColor: palette.surface,
                            borderColor: palette.borderStrong,
                          },
                        ]}
                        placeholder="Email (alex@agency.co)"
                        placeholderTextColor={palette.textMuted}
                        autoCapitalize="none"
                        keyboardType="email-address"
                        value={inviteEmail}
                        onChangeText={setInviteEmail}
                      />
                    </View>

                    <View style={styles.inviteBottomRow}>
                      <View style={styles.rolePillsRow}>
                        {ASSIGNABLE_ROLES.map((r) => {
                          const active = inviteRole === r;
                          return (
                            <Pressable
                              key={r}
                              onPress={() => setInviteRole(r)}
                              style={[
                                styles.rolePill,
                                {
                                  backgroundColor: active
                                    ? palette.surface
                                    : 'transparent',
                                  borderColor: active
                                    ? palette.borderStrong
                                    : palette.border,
                                },
                              ]}
                            >
                              <Text
                                style={{
                                  fontSize: 12,
                                  fontWeight: active ? '600' : '500',
                                  color: active
                                    ? palette.text
                                    : palette.textSecondary,
                                }}
                              >
                                {WORKSPACE_ROLE_LABELS[r].label}
                              </Text>
                            </Pressable>
                          );
                        })}
                      </View>

                      <Pressable
                        disabled={!inviteEmail.trim() || inviting}
                        onPress={() => void handleInvite()}
                        style={[
                          styles.primaryBtn,
                          {
                            backgroundColor: inviteEmail.trim()
                              ? palette.ctaBg
                              : palette.ctaDisabledBg,
                          },
                        ]}
                      >
                        <Text
                          style={[
                            styles.primaryBtnText,
                            {
                              color: inviteEmail.trim()
                                ? palette.ctaText
                                : palette.ctaDisabledText,
                            },
                          ]}
                        >
                          {inviting ? 'Sending…' : 'Send invite'}
                        </Text>
                      </Pressable>
                    </View>

                    {errorMsg && (
                      <Text style={{ fontSize: 12, color: palette.danger }}>
                        {errorMsg}
                      </Text>
                    )}
                  </View>
                )}
              </View>
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
    backgroundColor: 'rgba(15, 15, 14, 0.5)',
    alignItems: 'center',
    justifyContent: 'center',
    padding: 16,
  },
  dialog: {
    width: '100%',
    maxWidth: 570,
    borderRadius: 14,
    borderWidth: 1,
    overflow: 'hidden',
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 20,
    paddingVertical: 15,
    borderBottomWidth: 1,
    gap: 12,
  },
  wsHeadingRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  wsDot: {
    width: 9,
    height: 9,
    borderRadius: 5,
  },
  title: {
    fontSize: 15.5,
    fontWeight: '600',
  },
  sub: {
    fontSize: 12,
    marginTop: 2,
    lineHeight: 16,
  },
  body: {
    padding: 18,
    gap: 14,
  },
  policyCard: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: 14,
    padding: 14,
    borderRadius: 10,
    borderWidth: 1,
  },
  policyTitleRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    flexWrap: 'wrap',
  },
  policyTitle: {
    fontSize: 13.5,
    fontWeight: '600',
  },
  activeGateBadge: {
    paddingHorizontal: 7,
    paddingVertical: 2,
    borderRadius: 5,
    borderWidth: 1,
  },
  policyDesc: {
    fontSize: 12,
    lineHeight: 17,
  },
  switchTrack: {
    width: 40,
    height: 23,
    borderRadius: 12,
    borderWidth: 1,
    padding: 2,
    justifyContent: 'center',
  },
  switchThumb: {
    width: 17,
    height: 17,
    borderRadius: 9,
  },
  previewBar: {
    borderWidth: 1,
    borderRadius: 10,
    padding: 12,
    gap: 6,
  },
  previewTopRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    flexWrap: 'wrap',
    gap: 8,
  },
  sectionLabel: {
    fontSize: 12,
    fontWeight: '600',
  },
  rolePillsRow: {
    flexDirection: 'row',
    alignItems: 'center',
    flexWrap: 'wrap',
    gap: 6,
  },
  rolePill: {
    paddingHorizontal: 10,
    paddingVertical: 5,
    borderRadius: 6,
    borderWidth: 1,
  },
  rosterCard: {
    borderWidth: 1,
    borderRadius: 10,
    overflow: 'hidden',
  },
  memberRow: {
    flexDirection: 'row',
    alignItems: 'center',
    flexWrap: 'wrap',
    gap: 10,
    paddingHorizontal: 13,
    paddingVertical: 11,
  },
  monogram: {
    width: 30,
    height: 30,
    borderRadius: 15,
    borderWidth: 1,
    alignItems: 'center',
    justifyContent: 'center',
  },
  memberNameRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
  },
  memberName: {
    fontSize: 13,
    fontWeight: '600',
  },
  invitedBadge: {
    paddingHorizontal: 6,
    paddingVertical: 1.5,
    borderRadius: 4,
    borderWidth: 1,
  },
  memberEmail: {
    fontSize: 11.5,
    marginTop: 1,
  },
  ownerTag: {
    paddingHorizontal: 9,
    paddingVertical: 4,
    borderRadius: 6,
    borderWidth: 1,
  },
  memberActions: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
  },
  inlineRoleGroup: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 2,
  },
  miniRoleBtn: {
    paddingHorizontal: 7,
    paddingVertical: 4,
    borderRadius: 5,
    borderWidth: 1,
  },
  copyLinkBtn: {
    paddingHorizontal: 7,
    paddingVertical: 4,
    borderRadius: 5,
    borderWidth: 1,
  },
  inviteSection: {
    borderWidth: 1,
    borderRadius: 10,
    padding: 14,
  },
  inviteInputsRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 8,
  },
  input: {
    minWidth: 160,
    borderWidth: 1,
    borderRadius: 8,
    paddingHorizontal: 11,
    paddingVertical: 8,
    fontSize: 13,
  },
  inviteBottomRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    flexWrap: 'wrap',
    gap: 10,
  },
  primaryBtn: {
    paddingHorizontal: 14,
    paddingVertical: 8,
    borderRadius: 7,
    alignItems: 'center',
    justifyContent: 'center',
  },
  primaryBtnText: {
    fontSize: 12.5,
    fontWeight: '600',
  },
});
