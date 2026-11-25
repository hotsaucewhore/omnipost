import { Ionicons } from '@expo/vector-icons';
import React, { useState } from 'react';
import {
  Modal,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native';
import { WORKSPACE_COLORS } from '../../shared/platforms';
import { useOmniPost } from '../context/OmniPostContext';

interface Props {
  visible: boolean;
  onClose: () => void;
}

export function WorkspaceModal({ visible, onClose }: Props) {
  const {
    palette,
    usage,
    openBillingModal,
    workspaces,
    workspaceAccountCounts,
    activeWorkspace,
    selectWorkspace,
    createWorkspace,
    removeWorkspace,
    members,
    openTeamModal,
  } = useOmniPost();

  const [newName, setNewName] = useState('');
  const [selectedColor, setSelectedColor] = useState(WORKSPACE_COLORS[2]);
  const [seedDemo, setSeedDemo] = useState(false);
  const [creating, setCreating] = useState(false);

  const atWorkspaceLimit =
    usage.maxWorkspaces !== null && workspaces.length >= usage.maxWorkspaces;

  const handleCreate = async () => {
    if (!newName.trim() || creating) return;
    setCreating(true);
    try {
      const created = await createWorkspace(
        newName.trim(),
        selectedColor,
        seedDemo
      );
      if (created) {
        setNewName('');
      }
      onClose();
    } finally {
      setCreating(false);
    }
  };

  return (
    <Modal
      visible={visible}
      transparent
      animationType="fade"
      onRequestClose={onClose}
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
            style={[
              styles.header,
              { borderBottomColor: palette.border },
            ]}
          >
            <View>
              <Text style={[styles.title, { color: palette.text }]}>
                Workspaces
              </Text>
              <Text style={[styles.sub, { color: palette.textSecondary }]}>
                Separate brands or clients, each with its own linked accounts & queue
              </Text>
            </View>
            <Pressable onPress={onClose} style={{ padding: 4 }}>
              <Ionicons name="close" size={20} color={palette.textSecondary} />
            </Pressable>
          </View>

          <ScrollView style={{ maxHeight: 260 }}>
            {workspaces.map((ws, idx) => {
              const isCurrent = ws.id === activeWorkspace.id;
              const count = workspaceAccountCounts[ws.id] ?? 0;

              return (
                <View
                  key={ws.id}
                  style={[
                    styles.wsRow,
                    idx > 0 && {
                      borderTopWidth: 1,
                      borderTopColor: palette.border,
                    },
                    isCurrent && { backgroundColor: palette.surfaceSubtle },
                  ]}
                >
                  <Pressable
                    onPress={() => {
                      selectWorkspace(ws.id);
                      onClose();
                    }}
                    style={styles.wsSelectArea}
                  >
                    <View
                      style={[
                        styles.colorDot,
                        { backgroundColor: ws.accentColor },
                      ]}
                    />
                    <View style={{ flex: 1 }}>
                      <Text
                        style={[
                          styles.wsName,
                          {
                            color: palette.text,
                            fontWeight: isCurrent ? '600' : '500',
                          },
                        ]}
                      >
                        {ws.name}
                      </Text>
                      <Text
                        style={[styles.wsMeta, { color: palette.textMuted }]}
                      >
                        {count} {count === 1 ? 'account' : 'accounts'} linked
                      </Text>
                    </View>

                    {isCurrent && (
                      <Ionicons
                        name="checkmark"
                        size={17}
                        color={palette.text}
                      />
                    )}
                  </Pressable>

                  {workspaces.length > 1 && !isCurrent && (
                    <Pressable
                      onPress={() => void removeWorkspace(ws.id)}
                      style={styles.deleteBtn}
                      accessibilityLabel={`Delete ${ws.name}`}
                    >
                      <Ionicons
                        name="trash-outline"
                        size={15}
                        color={palette.textMuted}
                      />
                    </Pressable>
                  )}
                </View>
              );
            })}
          </ScrollView>

          {/* Quick link to Team & Approval Rules */}
          <Pressable
            onPress={() => {
              onClose();
              openTeamModal();
            }}
            style={[
              styles.wsSelectArea,
              {
                borderTopWidth: 1,
                borderTopColor: palette.border,
                backgroundColor: palette.surface,
              },
            ]}
          >
            <Ionicons
              name="people-outline"
              size={15}
              color={palette.textSecondary}
            />
            <Text
              style={{
                flex: 1,
                fontSize: 12.5,
                fontWeight: '600',
                color: palette.text,
              }}
            >
              Team & approval rules ({members.length})
              {activeWorkspace.requireApproval ? ' · Gate active' : ''}
            </Text>
            <Ionicons
              name="chevron-forward"
              size={14}
              color={palette.textMuted}
            />
          </Pressable>

          {/* Create New Workspace Form or Studio Upgrade Prompt */}
          <View
            style={[
              styles.createBox,
              {
                borderTopColor: palette.border,
                backgroundColor: palette.surfaceSubtle,
              },
            ]}
          >
            {atWorkspaceLimit ? (
              <View style={{ gap: 8 }}>
                <Text style={[styles.createLabel, { color: palette.text }]}>
                  Need separate workspaces for clients or side brands?
                </Text>
                <Text
                  style={{
                    fontSize: 12.5,
                    lineHeight: 18,
                    color: palette.textSecondary,
                  }}
                >
                  Your current plan includes 1 workspace. Upgrade to Studio
                  ($29/mo) for unlimited client & brand workspaces.
                </Text>
                <Pressable
                  onPress={() => {
                    onClose();
                    openBillingModal(
                      'studio',
                      'Multi-brand workspaces are included on Studio ($29/mo).'
                    );
                  }}
                  style={[
                    styles.createBtn,
                    {
                      backgroundColor: palette.ctaBg,
                      paddingVertical: 9,
                      alignSelf: 'flex-start',
                    },
                  ]}
                >
                  <Text
                    style={[styles.createBtnText, { color: palette.ctaText }]}
                  >
                    Upgrade to Studio
                  </Text>
                </Pressable>
              </View>
            ) : (
              <>
                <Text
                  style={[styles.createLabel, { color: palette.textSecondary }]}
                >
                  Add workspace
                </Text>

                <View style={styles.inputRow}>
                  <TextInput
                    style={[
                      styles.nameInput,
                      {
                        color: palette.text,
                        backgroundColor: palette.surface,
                        borderColor: palette.borderStrong,
                      },
                    ]}
                    placeholder="e.g. Podcast, Side Project, Client"
                    placeholderTextColor={palette.textMuted}
                    value={newName}
                    onChangeText={setNewName}
                  />

                  <Pressable
                    disabled={!newName.trim() || creating}
                    onPress={handleCreate}
                    style={[
                      styles.createBtn,
                      {
                        backgroundColor: newName.trim()
                          ? palette.ctaBg
                          : palette.ctaDisabledBg,
                      },
                    ]}
                  >
                    <Text
                      style={[
                        styles.createBtnText,
                        {
                          color: newName.trim()
                            ? palette.ctaText
                            : palette.ctaDisabledText,
                        },
                      ]}
                    >
                      Create
                    </Text>
                  </Pressable>
                </View>

                <View style={styles.createFootRow}>
                  <View style={styles.swatchesRow}>
                    {WORKSPACE_COLORS.map((c) => {
                      const active = c === selectedColor;
                      return (
                        <Pressable
                          key={c}
                          onPress={() => setSelectedColor(c)}
                          style={[
                            styles.swatchOuter,
                            active && { borderColor: palette.text },
                          ]}
                        >
                          <View
                            style={[styles.swatchInner, { backgroundColor: c }]}
                          />
                        </Pressable>
                      );
                    })}
                  </View>

                  <Pressable
                    onPress={() => setSeedDemo((s) => !s)}
                    style={styles.seedCheck}
                  >
                    <Ionicons
                      name={seedDemo ? 'checkbox' : 'square-outline'}
                      size={15}
                      color={palette.textSecondary}
                    />
                    <Text
                      style={{ fontSize: 12, color: palette.textSecondary }}
                    >
                      Pre-link demo accounts
                    </Text>
                  </Pressable>
                </View>
              </>
            )}
          </View>
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
    maxWidth: 430,
    borderRadius: 14,
    borderWidth: 1,
    overflow: 'hidden',
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 18,
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
    lineHeight: 16,
  },
  wsRow: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingRight: 14,
  },
  wsSelectArea: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 11,
    paddingHorizontal: 18,
    paddingVertical: 12,
  },
  colorDot: {
    width: 10,
    height: 10,
    borderRadius: 5,
  },
  wsName: {
    fontSize: 13.5,
  },
  wsMeta: {
    fontSize: 11.5,
    marginTop: 1,
  },
  deleteBtn: {
    padding: 6,
  },
  createBox: {
    borderTopWidth: 1,
    padding: 18,
    gap: 10,
  },
  createLabel: {
    fontSize: 12,
    fontWeight: '600',
  },
  inputRow: {
    flexDirection: 'row',
    gap: 8,
  },
  nameInput: {
    flex: 1,
    borderWidth: 1,
    borderRadius: 8,
    paddingHorizontal: 11,
    paddingVertical: 8,
    fontSize: 13.5,
  },
  createBtn: {
    paddingHorizontal: 15,
    borderRadius: 8,
    alignItems: 'center',
    justifyContent: 'center',
  },
  createBtnText: {
    fontSize: 13,
    fontWeight: '600',
  },
  createFootRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    flexWrap: 'wrap',
    gap: 10,
    paddingTop: 2,
  },
  swatchesRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
  },
  swatchOuter: {
    width: 20,
    height: 20,
    borderRadius: 10,
    borderWidth: 1.5,
    borderColor: 'transparent',
    alignItems: 'center',
    justifyContent: 'center',
  },
  swatchInner: {
    width: 12,
    height: 12,
    borderRadius: 6,
  },
  seedCheck: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 5,
  },
});
