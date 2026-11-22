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
import {
  MediaVaultAsset,
  PhotoAssetMeta,
  VideoAssetMeta,
} from '../../shared/platforms';
import { useOmniPost } from '../context/OmniPostContext';

interface Props {
  visible: boolean;
  onClose: () => void;
  onSelectPhotoAsset: (photo: PhotoAssetMeta) => void;
  onSelectVideoAsset: (video: VideoAssetMeta) => void;
}

export function MediaVaultModal({
  visible,
  onClose,
  onSelectPhotoAsset,
  onSelectVideoAsset,
}: Props) {
  const {
    palette,
    activeWorkspace,
    vaultAssets,
    saveToVault,
    removeVaultAsset,
  } = useOmniPost();

  const [newLabel, setNewLabel] = useState('');
  const [newKind, setNewKind] = useState<'photo' | 'video'>('photo');
  const [saving, setSaving] = useState(false);

  const handleUseAsset = (asset: MediaVaultAsset) => {
    if (asset.kind === 'video') {
      onSelectVideoAsset({
        fileName: asset.fileName,
        mimeType: asset.mimeType,
        width: asset.width,
        height: asset.height,
        durationSec: asset.durationSec || 15,
        isSamplePreset: true,
      });
    } else {
      onSelectPhotoAsset({
        id: `vault_pick_${Date.now()}_${asset.id}`,
        fileName: asset.fileName,
        mimeType: asset.mimeType,
        width: asset.width,
        height: asset.height,
        isSamplePreset: true,
        sampleTint: asset.sampleTint || '#2E3432',
        sampleLabel: asset.label,
      });
    }
    onClose();
  };

  const handleAddCustomCard = async () => {
    if (!newLabel.trim() || saving) return;
    setSaving(true);
    try {
      await saveToVault({
        kind: newKind,
        label: newLabel.trim(),
        fileName:
          newKind === 'video'
            ? `${newLabel.trim().toLowerCase().replace(/[^a-z0-9]+/g, '-')}.mp4`
            : `${newLabel.trim().toLowerCase().replace(/[^a-z0-9]+/g, '-')}.jpg`,
        mimeType: newKind === 'video' ? 'video/mp4' : 'image/jpeg',
        width: 1080,
        height: newKind === 'video' ? 1920 : 1350,
        durationSec: newKind === 'video' ? 15 : undefined,
        sampleTint: '#313735',
      });
      setNewLabel('');
    } finally {
      setSaving(false);
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
            style={[styles.header, { borderBottomColor: palette.border }]}
          >
            <View style={{ flex: 1 }}>
              <Text style={[styles.title, { color: palette.text }]}>
                Media vault · {activeWorkspace.name}
              </Text>
              <Text style={[styles.sub, { color: palette.textSecondary }]}>
                Reusable brand end-cards, carousel slides, and B-roll clips
              </Text>
            </View>
            <Pressable onPress={onClose} style={{ padding: 4 }}>
              <Ionicons name="close" size={20} color={palette.textSecondary} />
            </Pressable>
          </View>

          <ScrollView style={{ maxHeight: 460 }}>
            <View style={styles.body}>
              <View style={styles.grid}>
                {vaultAssets.map((asset) => (
                  <View
                    key={asset.id}
                    style={[
                      styles.assetCard,
                      {
                        borderColor: palette.border,
                        backgroundColor: palette.surfaceSubtle,
                      },
                    ]}
                  >
                    <View
                      style={[
                        styles.previewTile,
                        {
                          backgroundColor:
                            asset.sampleTint || palette.surfaceMuted,
                        },
                      ]}
                    >
                      <Ionicons
                        name={
                          asset.kind === 'video'
                            ? 'videocam-outline'
                            : 'image-outline'
                        }
                        size={18}
                        color="#F5F4F0"
                      />
                      <Text
                        style={{
                          fontSize: 11,
                          fontWeight: '600',
                          color: '#F5F4F0',
                        }}
                      >
                        {asset.kind === 'video'
                          ? `9:16 Video · ${asset.durationSec ?? 15}s`
                          : '4:5 Slide'}
                      </Text>
                    </View>

                    <View style={{ padding: 11, gap: 6 }}>
                      <Text
                        style={{
                          fontSize: 13,
                          fontWeight: '600',
                          color: palette.text,
                        }}
                        numberOfLines={1}
                      >
                        {asset.label}
                      </Text>

                      <View
                        style={{
                          flexDirection: 'row',
                          alignItems: 'center',
                          justifyContent: 'space-between',
                        }}
                      >
                        <Pressable
                          onPress={() => handleUseAsset(asset)}
                          style={[
                            styles.insertBtn,
                            { backgroundColor: palette.ctaBg },
                          ]}
                        >
                          <Text
                            style={{
                              fontSize: 11.5,
                              fontWeight: '600',
                              color: palette.ctaText,
                            }}
                          >
                            {asset.kind === 'video'
                              ? 'Use clip'
                              : '+ Add slide'}
                          </Text>
                        </Pressable>

                        <Pressable
                          onPress={() => void removeVaultAsset(asset.id)}
                          style={{ padding: 4 }}
                        >
                          <Ionicons
                            name="trash-outline"
                            size={14}
                            color={palette.textMuted}
                          />
                        </Pressable>
                      </View>
                    </View>
                  </View>
                ))}
              </View>

              {/* Save new reusable template asset */}
              <View
                style={[
                  styles.addBar,
                  {
                    borderColor: palette.border,
                    backgroundColor: palette.surfaceSubtle,
                  },
                ]}
              >
                <TextInput
                  style={[
                    styles.input,
                    {
                      flex: 1,
                      color: palette.text,
                      backgroundColor: palette.surface,
                      borderColor: palette.borderStrong,
                    },
                  ]}
                  placeholder="Save new brand asset template (e.g. Podcast CTA Slide)"
                  placeholderTextColor={palette.textMuted}
                  value={newLabel}
                  onChangeText={setNewLabel}
                />

                {(['photo', 'video'] as const).map((k) => {
                  const active = newKind === k;
                  return (
                    <Pressable
                      key={k}
                      onPress={() => setNewKind(k)}
                      style={[
                        styles.kindPill,
                        {
                          backgroundColor: active
                            ? palette.surfaceMuted
                            : palette.surface,
                          borderColor: active
                            ? palette.borderStrong
                            : palette.border,
                        },
                      ]}
                    >
                      <Text
                        style={{
                          fontSize: 11.5,
                          fontWeight: active ? '600' : '500',
                          color: palette.text,
                        }}
                      >
                        {k === 'photo' ? 'Slide' : 'Clip'}
                      </Text>
                    </Pressable>
                  );
                })}

                <Pressable
                  disabled={!newLabel.trim() || saving}
                  onPress={() => void handleAddCustomCard()}
                  style={[
                    styles.insertBtn,
                    {
                      paddingVertical: 8,
                      backgroundColor: newLabel.trim()
                        ? palette.ctaBg
                        : palette.ctaDisabledBg,
                    },
                  ]}
                >
                  <Text
                    style={{
                      fontSize: 12,
                      fontWeight: '600',
                      color: newLabel.trim()
                        ? palette.ctaText
                        : palette.ctaDisabledText,
                    }}
                  >
                    + Save to vault
                  </Text>
                </Pressable>
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
    maxWidth: 620,
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
  grid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 10,
  },
  assetCard: {
    width: '48%',
    minWidth: 220,
    flexGrow: 1,
    borderRadius: 10,
    borderWidth: 1,
    overflow: 'hidden',
  },
  previewTile: {
    height: 68,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 6,
  },
  insertBtn: {
    paddingHorizontal: 11,
    paddingVertical: 5.5,
    borderRadius: 6,
  },
  addBar: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    alignItems: 'center',
    gap: 8,
    padding: 12,
    borderRadius: 10,
    borderWidth: 1,
  },
  input: {
    minWidth: 180,
    borderWidth: 1,
    borderRadius: 7,
    paddingHorizontal: 10,
    paddingVertical: 7,
    fontSize: 12.5,
  },
  kindPill: {
    paddingHorizontal: 9,
    paddingVertical: 6.5,
    borderRadius: 6,
    borderWidth: 1,
  },
});
