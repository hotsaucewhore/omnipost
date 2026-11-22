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
import { ContentPreset, normalizeHashtags } from '../../shared/platforms';
import { useOmniPost } from '../context/OmniPostContext';

interface Props {
  visible: boolean;
  onClose: () => void;
  targetLabel: string;
  currentDraftValues: {
    caption: string;
    hashtags: string;
    firstComment: string;
  };
  onApplyPreset: (preset: ContentPreset) => void;
}

export function PresetsModal({
  visible,
  onClose,
  targetLabel,
  currentDraftValues,
  onApplyPreset,
}: Props) {
  const { palette, activeWorkspace, presets, createPreset, removePreset } =
    useOmniPost();

  const [creating, setCreating] = useState(false);
  const [name, setName] = useState('');
  const [captionSnippet, setCaptionSnippet] = useState('');
  const [hashtags, setHashtags] = useState('');
  const [firstComment, setFirstComment] = useState('');
  const [saving, setSaving] = useState(false);
  const [formError, setFormError] = useState<string | null>(null);

  const hasDraftText = Boolean(
    currentDraftValues.caption.trim() ||
      currentDraftValues.hashtags.trim() ||
      currentDraftValues.firstComment.trim()
  );

  const resetForm = () => {
    setName('');
    setCaptionSnippet('');
    setHashtags('');
    setFirstComment('');
    setFormError(null);
    setCreating(false);
  };

  const handleOpenCreateFromDraft = () => {
    setCaptionSnippet(currentDraftValues.caption.trim());
    setHashtags(currentDraftValues.hashtags.trim());
    setFirstComment(currentDraftValues.firstComment.trim());
    setFormError(null);
    setCreating(true);
  };

  const handleSave = async (alsoInsert: boolean) => {
    if (!name.trim()) {
      setFormError('Give this preset a short name.');
      return;
    }
    if (
      !captionSnippet.trim() &&
      !hashtags.trim() &&
      !firstComment.trim()
    ) {
      setFormError(
        'Fill in at least a caption snippet, hashtags, or a first comment.'
      );
      return;
    }

    setSaving(true);
    setFormError(null);
    try {
      const saved = await createPreset({
        name: name.trim(),
        captionSnippet: captionSnippet.trim() || undefined,
        hashtags: hashtags.trim() || undefined,
        firstComment: firstComment.trim() || undefined,
      });
      resetForm();
      if (alsoInsert) {
        onApplyPreset(saved);
        onClose();
      }
    } catch (err: any) {
      setFormError(err?.message || 'Could not save preset.');
    } finally {
      setSaving(false);
    }
  };

  return (
    <Modal
      visible={visible}
      transparent
      animationType="fade"
      onRequestClose={() => {
        resetForm();
        onClose();
      }}
    >
      <Pressable
        style={styles.backdrop}
        onPress={() => {
          resetForm();
          onClose();
        }}
      >
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
              <View style={styles.titleRow}>
                <View
                  style={[
                    styles.wsDot,
                    { backgroundColor: activeWorkspace.accentColor },
                  ]}
                />
                <Text style={[styles.title, { color: palette.text }]}>
                  {creating ? 'New saved preset' : 'Saved presets'}
                </Text>
              </View>
              <Text style={[styles.subtitle, { color: palette.textSecondary }]}>
                {creating
                  ? `Saved exclusively to ${activeWorkspace.name}`
                  : `${activeWorkspace.name} · Inserting into ${targetLabel}`}
              </Text>
            </View>

            <Pressable
              onPress={() => {
                resetForm();
                onClose();
              }}
              style={[
                styles.closeBtn,
                {
                  borderColor: palette.border,
                  backgroundColor: palette.surfaceSubtle,
                },
              ]}
            >
              <Ionicons name="close" size={16} color={palette.textSecondary} />
            </Pressable>
          </View>

          {!creating ? (
            <>
              <ScrollView
                style={styles.listScroll}
                contentContainerStyle={styles.listContent}
              >
                {presets.length === 0 ? (
                  <View style={styles.emptyBox}>
                    <Text style={[styles.emptyTitle, { color: palette.text }]}>
                      No presets saved for {activeWorkspace.name} yet
                    </Text>
                    <Text
                      style={[
                        styles.emptySub,
                        { color: palette.textSecondary },
                      ]}
                    >
                      Save recurring hashtag groups, newsletter CTAs, or
                      first-comment links to insert in one click.
                    </Text>
                  </View>
                ) : (
                  presets.map((preset) => {
                    const tagsPreview = preset.hashtags
                      ? normalizeHashtags(preset.hashtags).slice(0, 4).join(' ')
                      : '';
                    return (
                      <View
                        key={preset.id}
                        style={[
                          styles.presetCard,
                          {
                            borderColor: palette.border,
                            backgroundColor: palette.surfaceSubtle,
                          },
                        ]}
                      >
                        <View style={styles.presetTopRow}>
                          <Text
                            style={[styles.presetName, { color: palette.text }]}
                            numberOfLines={1}
                          >
                            {preset.name}
                          </Text>

                          <View style={styles.presetActions}>
                            <Pressable
                              onPress={() => void removePreset(preset.id)}
                              accessibilityLabel={`Delete ${preset.name}`}
                              style={styles.deleteBtn}
                            >
                              <Ionicons
                                name="trash-outline"
                                size={14}
                                color={palette.textMuted}
                              />
                            </Pressable>

                            <Pressable
                              onPress={() => {
                                onApplyPreset(preset);
                                onClose();
                              }}
                              style={[
                                styles.insertBtn,
                                { backgroundColor: palette.text },
                              ]}
                            >
                              <Text
                                style={[
                                  styles.insertBtnText,
                                  { color: palette.surface },
                                ]}
                              >
                                Insert
                              </Text>
                            </Pressable>
                          </View>
                        </View>

                        <View style={styles.badgesRow}>
                          {Boolean(preset.captionSnippet) && (
                            <View
                              style={[
                                styles.kindBadge,
                                {
                                  backgroundColor: palette.surface,
                                  borderColor: palette.border,
                                },
                              ]}
                            >
                              <Text
                                style={[
                                  styles.kindBadgeText,
                                  { color: palette.textSecondary },
                                ]}
                              >
                                Caption
                              </Text>
                            </View>
                          )}
                          {Boolean(preset.hashtags) && (
                            <View
                              style={[
                                styles.kindBadge,
                                {
                                  backgroundColor: palette.surface,
                                  borderColor: palette.border,
                                },
                              ]}
                            >
                              <Text
                                style={[
                                  styles.kindBadgeText,
                                  { color: palette.textSecondary },
                                ]}
                              >
                                # Hashtags
                              </Text>
                            </View>
                          )}
                          {Boolean(preset.firstComment) && (
                            <View
                              style={[
                                styles.kindBadge,
                                {
                                  backgroundColor: palette.surface,
                                  borderColor: palette.border,
                                },
                              ]}
                            >
                              <Text
                                style={[
                                  styles.kindBadgeText,
                                  { color: palette.textSecondary },
                                ]}
                              >
                                ↳ 1st comment
                              </Text>
                            </View>
                          )}
                        </View>

                        {preset.captionSnippet ? (
                          <Text
                            style={[
                              styles.previewLine,
                              { color: palette.textSecondary },
                            ]}
                            numberOfLines={2}
                          >
                            {preset.captionSnippet}
                          </Text>
                        ) : null}

                        {tagsPreview ? (
                          <Text
                            style={[
                              styles.previewTags,
                              { color: palette.textMuted },
                            ]}
                            numberOfLines={1}
                          >
                            {tagsPreview}
                          </Text>
                        ) : null}

                        {preset.firstComment ? (
                          <Text
                            style={[
                              styles.previewReply,
                              { color: palette.textSecondary },
                            ]}
                            numberOfLines={1}
                          >
                            ↳ {preset.firstComment}
                          </Text>
                        ) : null}
                      </View>
                    );
                  })
                )}
              </ScrollView>

              <View
                style={[styles.footer, { borderTopColor: palette.border }]}
              >
                <Pressable
                  onPress={() => {
                    setFormError(null);
                    setCreating(true);
                  }}
                  style={[
                    styles.newPresetBtn,
                    {
                      borderColor: palette.borderStrong,
                      backgroundColor: palette.surface,
                    },
                  ]}
                >
                  <Ionicons name="add" size={15} color={palette.text} />
                  <Text style={[styles.newPresetText, { color: palette.text }]}>
                    New preset
                  </Text>
                </Pressable>

                {hasDraftText && (
                  <Pressable
                    onPress={handleOpenCreateFromDraft}
                    style={styles.saveCurrentBtn}
                  >
                    <Ionicons
                      name="bookmark-outline"
                      size={14}
                      color={palette.textSecondary}
                    />
                    <Text
                      style={[
                        styles.saveCurrentText,
                        { color: palette.textSecondary },
                      ]}
                    >
                      Save current draft
                    </Text>
                  </Pressable>
                )}
              </View>
            </>
          ) : (
            <ScrollView
              style={styles.listScroll}
              contentContainerStyle={styles.formBody}
            >
              {hasDraftText && (
                <Pressable
                  onPress={() => {
                    setCaptionSnippet(currentDraftValues.caption.trim());
                    setHashtags(currentDraftValues.hashtags.trim());
                    setFirstComment(currentDraftValues.firstComment.trim());
                  }}
                  style={[
                    styles.prefillBanner,
                    {
                      backgroundColor: palette.surfaceSubtle,
                      borderColor: palette.border,
                    },
                  ]}
                >
                  <Ionicons
                    name="download-outline"
                    size={14}
                    color={palette.textSecondary}
                  />
                  <Text
                    style={[
                      styles.prefillText,
                      { color: palette.textSecondary },
                    ]}
                  >
                    Copy fields from your current composer draft
                  </Text>
                </Pressable>
              )}

              <View style={styles.fieldGroup}>
                <Text
                  style={[styles.fieldLabel, { color: palette.textSecondary }]}
                >
                  Preset name
                </Text>
                <TextInput
                  style={[
                    styles.input,
                    {
                      color: palette.text,
                      backgroundColor: palette.surfaceSubtle,
                      borderColor: palette.border,
                    },
                  ]}
                  placeholder="e.g. Newsletter CTA, Podcast tags, Sponsor note"
                  placeholderTextColor={palette.textMuted}
                  value={name}
                  onChangeText={setName}
                />
              </View>

              <View style={styles.fieldGroup}>
                <Text
                  style={[styles.fieldLabel, { color: palette.textSecondary }]}
                >
                  Caption snippet (optional)
                </Text>
                <TextInput
                  style={[
                    styles.input,
                    styles.multilineInput,
                    {
                      color: palette.text,
                      backgroundColor: palette.surfaceSubtle,
                      borderColor: palette.border,
                    },
                  ]}
                  multiline
                  placeholder="Appends cleanly to your post body..."
                  placeholderTextColor={palette.textMuted}
                  value={captionSnippet}
                  onChangeText={setCaptionSnippet}
                />
              </View>

              <View style={styles.fieldGroup}>
                <Text
                  style={[styles.fieldLabel, { color: palette.textSecondary }]}
                >
                  Hashtags (optional)
                </Text>
                <TextInput
                  style={[
                    styles.input,
                    {
                      color: palette.text,
                      backgroundColor: palette.surfaceSubtle,
                      borderColor: palette.border,
                    },
                  ]}
                  placeholder="creatorstudio filmmaking gear"
                  placeholderTextColor={palette.textMuted}
                  value={hashtags}
                  onChangeText={setHashtags}
                />
              </View>

              <View style={styles.fieldGroup}>
                <Text
                  style={[styles.fieldLabel, { color: palette.textSecondary }]}
                >
                  Auto first-comment / link (optional)
                </Text>
                <TextInput
                  style={[
                    styles.input,
                    {
                      color: palette.text,
                      backgroundColor: palette.surfaceSubtle,
                      borderColor: palette.border,
                    },
                  ]}
                  placeholder="Full breakdown -> https://..."
                  placeholderTextColor={palette.textMuted}
                  value={firstComment}
                  onChangeText={setFirstComment}
                />
              </View>

              {formError ? (
                <Text style={[styles.errorText, { color: palette.danger }]}>
                  {formError}
                </Text>
              ) : null}

              <View style={styles.formActions}>
                <Pressable
                  onPress={resetForm}
                  style={[
                    styles.cancelBtn,
                    { borderColor: palette.border },
                  ]}
                >
                  <Text
                    style={[
                      styles.cancelBtnText,
                      { color: palette.textSecondary },
                    ]}
                  >
                    Back
                  </Text>
                </Pressable>

                <View style={styles.saveBtnsRight}>
                  <Pressable
                    disabled={saving}
                    onPress={() => void handleSave(false)}
                    style={[
                      styles.secondarySaveBtn,
                      {
                        borderColor: palette.borderStrong,
                        backgroundColor: palette.surface,
                      },
                    ]}
                  >
                    <Text
                      style={[
                        styles.secondarySaveText,
                        { color: palette.text },
                      ]}
                    >
                      Save only
                    </Text>
                  </Pressable>

                  <Pressable
                    disabled={saving}
                    onPress={() => void handleSave(true)}
                    style={[
                      styles.primarySaveBtn,
                      { backgroundColor: palette.text },
                    ]}
                  >
                    <Text
                      style={[
                        styles.primarySaveText,
                        { color: palette.surface },
                      ]}
                    >
                      {saving ? 'Saving...' : 'Save & insert'}
                    </Text>
                  </Pressable>
                </View>
              </View>
            </ScrollView>
          )}
        </Pressable>
      </Pressable>
    </Modal>
  );
}

const styles = StyleSheet.create({
  backdrop: {
    flex: 1,
    backgroundColor: 'rgba(15, 15, 14, 0.45)',
    alignItems: 'center',
    justifyContent: 'center',
    padding: 18,
  },
  sheet: {
    width: '100%',
    maxWidth: 490,
    maxHeight: '86%',
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
  titleRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  wsDot: {
    width: 8,
    height: 8,
    borderRadius: 4,
  },
  title: {
    fontSize: 15.5,
    fontWeight: '700',
    letterSpacing: -0.2,
  },
  subtitle: {
    fontSize: 12.5,
  },
  closeBtn: {
    width: 28,
    height: 28,
    borderRadius: 7,
    borderWidth: 1,
    alignItems: 'center',
    justifyContent: 'center',
  },
  listScroll: {
    maxHeight: 410,
  },
  listContent: {
    padding: 16,
    gap: 10,
  },
  emptyBox: {
    paddingVertical: 28,
    paddingHorizontal: 12,
    alignItems: 'center',
    gap: 6,
  },
  emptyTitle: {
    fontSize: 14,
    fontWeight: '600',
    textAlign: 'center',
  },
  emptySub: {
    fontSize: 12.5,
    lineHeight: 18,
    textAlign: 'center',
    maxWidth: 340,
  },
  presetCard: {
    borderWidth: 1,
    borderRadius: 10,
    padding: 12,
    gap: 7,
  },
  presetTopRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: 10,
  },
  presetName: {
    fontSize: 13.5,
    fontWeight: '600',
    flex: 1,
  },
  presetActions: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  deleteBtn: {
    padding: 5,
  },
  insertBtn: {
    paddingHorizontal: 11,
    paddingVertical: 5,
    borderRadius: 6,
  },
  insertBtnText: {
    fontSize: 12,
    fontWeight: '600',
  },
  badgesRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 5,
  },
  kindBadge: {
    paddingHorizontal: 7,
    paddingVertical: 2,
    borderRadius: 5,
    borderWidth: 1,
  },
  kindBadgeText: {
    fontSize: 11,
    fontWeight: '500',
  },
  previewLine: {
    fontSize: 12.5,
    lineHeight: 17,
  },
  previewTags: {
    fontSize: 12,
  },
  previewReply: {
    fontSize: 12,
    fontStyle: 'italic',
  },
  footer: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 16,
    paddingVertical: 12,
    borderTopWidth: 1,
    gap: 10,
  },
  newPresetBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 5,
    paddingHorizontal: 12,
    paddingVertical: 7,
    borderRadius: 8,
    borderWidth: 1,
  },
  newPresetText: {
    fontSize: 12.5,
    fontWeight: '600',
  },
  saveCurrentBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 5,
    paddingVertical: 6,
    paddingHorizontal: 6,
  },
  saveCurrentText: {
    fontSize: 12.5,
    fontWeight: '500',
  },
  formBody: {
    padding: 16,
    gap: 13,
  },
  prefillBanner: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 7,
    paddingHorizontal: 11,
    paddingVertical: 8,
    borderRadius: 8,
    borderWidth: 1,
  },
  prefillText: {
    fontSize: 12,
    fontWeight: '500',
  },
  fieldGroup: {
    gap: 5,
  },
  fieldLabel: {
    fontSize: 12,
    fontWeight: '600',
  },
  input: {
    borderWidth: 1,
    borderRadius: 8,
    paddingHorizontal: 11,
    paddingVertical: 9,
    fontSize: 13.5,
  },
  multilineInput: {
    minHeight: 70,
    textAlignVertical: 'top',
  },
  errorText: {
    fontSize: 12.5,
    fontWeight: '500',
  },
  formActions: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginTop: 4,
    gap: 10,
  },
  cancelBtn: {
    paddingHorizontal: 12,
    paddingVertical: 8,
    borderRadius: 8,
    borderWidth: 1,
  },
  cancelBtnText: {
    fontSize: 12.5,
    fontWeight: '500',
  },
  saveBtnsRight: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  secondarySaveBtn: {
    paddingHorizontal: 12,
    paddingVertical: 8,
    borderRadius: 8,
    borderWidth: 1,
  },
  secondarySaveText: {
    fontSize: 12.5,
    fontWeight: '600',
  },
  primarySaveBtn: {
    paddingHorizontal: 13,
    paddingVertical: 8,
    borderRadius: 8,
  },
  primarySaveText: {
    fontSize: 12.5,
    fontWeight: '600',
  },
});
