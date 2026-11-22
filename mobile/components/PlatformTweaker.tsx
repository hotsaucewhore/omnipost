import { Ionicons } from '@expo/vector-icons';
import React, { useState } from 'react';
import {
  Pressable,
  ScrollView,
  StyleSheet,
  Switch,
  Text,
  TextInput,
  View,
} from 'react-native';
import {
  ContentPreset,
  detectPostKind,
  MasterDraft,
  mergeHashtagStrings,
  PhotoAssetMeta,
  PLATFORM_ORDER,
  PLATFORM_SPECS,
  PlatformId,
  PlatformOverride,
  resolvePlatformText,
  VideoAssetMeta,
} from '../../shared/platforms';
import { PlatformValidationSummary } from '../../shared/validator';
import { useOmniPost } from '../context/OmniPostContext';
import { PresetsModal } from './PresetsModal';

interface Props {
  activeTab: 'master' | PlatformId;
  onSelectTab: (tab: 'master' | PlatformId) => void;
  master: MasterDraft;
  onChangeMaster: (next: MasterDraft) => void;
  overrides: Record<PlatformId, PlatformOverride>;
  onUpdateOverride: (id: PlatformId, patch: Partial<PlatformOverride>) => void;
  validations: Record<PlatformId, PlatformValidationSummary>;
  video: VideoAssetMeta | null;
  photos?: PhotoAssetMeta[];
  onPickPlatformCover: (id: PlatformId) => void;
}

export function PlatformTweaker({
  activeTab,
  onSelectTab,
  master,
  onChangeMaster,
  overrides,
  onUpdateOverride,
  validations,
  video,
  photos = [],
  onPickPlatformCover,
}: Props) {
  const { palette, presets } = useOmniPost();
  const [showFirstComment, setShowFirstComment] = useState(false);
  const [presetsModalOpen, setPresetsModalOpen] = useState(false);
  const postKind = detectPostKind(video, photos);
  const enabledPlatforms = PLATFORM_ORDER.filter((id) => overrides[id]?.enabled);

  const isFirstCommentOpen =
    showFirstComment || Boolean(master.firstComment && master.firstComment.length > 0);

  const handleApplyPreset = (preset: ContentPreset) => {
    if (activeTab === 'master' || !overrides[activeTab]?.enabled) {
      const nextCaption = preset.captionSnippet
        ? master.caption.trim()
          ? `${master.caption.trimEnd()}\n\n${preset.captionSnippet}`
          : preset.captionSnippet
        : master.caption;
      const nextHashtags = preset.hashtags
        ? mergeHashtagStrings(master.hashtags, preset.hashtags)
        : master.hashtags;
      const nextFirstComment = preset.firstComment
        ? preset.firstComment
        : master.firstComment;
      if (preset.firstComment) {
        setShowFirstComment(true);
      }
      onChangeMaster({
        ...master,
        caption: nextCaption,
        hashtags: nextHashtags,
        firstComment: nextFirstComment,
      });
    } else {
      const ov = overrides[activeTab];
      const baseCaption = ov.useCustomText
        ? ov.customCaption ?? ''
        : master.caption;
      const baseTags = ov.useCustomText
        ? ov.customHashtags ?? ''
        : master.hashtags;
      const baseFirst = ov.useCustomText
        ? ov.customFirstComment ?? master.firstComment ?? ''
        : master.firstComment ?? '';

      onUpdateOverride(activeTab, {
        useCustomText: true,
        customTitle: ov.useCustomText ? ov.customTitle : master.title,
        customCaption: preset.captionSnippet
          ? baseCaption.trim()
            ? `${baseCaption.trimEnd()}\n\n${preset.captionSnippet}`
            : preset.captionSnippet
          : baseCaption,
        customHashtags: preset.hashtags
          ? mergeHashtagStrings(baseTags, preset.hashtags)
          : baseTags,
        customFirstComment: preset.firstComment || baseFirst,
      });
    }
  };

  const currentDraftForPreset =
    activeTab === 'master' || !overrides[activeTab]?.enabled
      ? {
          caption: master.caption,
          hashtags: master.hashtags,
          firstComment: master.firstComment ?? '',
        }
      : {
          caption: overrides[activeTab].useCustomText
            ? overrides[activeTab].customCaption ?? ''
            : master.caption,
          hashtags: overrides[activeTab].useCustomText
            ? overrides[activeTab].customHashtags ?? ''
            : master.hashtags,
          firstComment: overrides[activeTab].useCustomText
            ? overrides[activeTab].customFirstComment ?? ''
            : master.firstComment ?? '',
        };

  const smartShortenText = (text: string, limit: number): string => {
    const clean = text.trim();
    if (clean.length <= limit) return clean;
    const sliced = clean.slice(0, Math.max(10, limit - 1));
    const lastSpace = sliced.lastIndexOf(' ');
    const cut = lastSpace > limit * 0.65 ? sliced.slice(0, lastSpace) : sliced;
    return `${cut.trimEnd()}…`;
  };

  const renderMasterFields = () => (
    <View style={styles.composerFields}>
      {postKind === 'video' && (
        <TextInput
          style={[
            styles.titleInput,
            { color: palette.text, borderBottomColor: palette.border },
          ]}
          placeholder="Add a title (optional except YouTube)"
          placeholderTextColor={palette.textMuted}
          value={master.title}
          onChangeText={(title) => onChangeMaster({ ...master, title })}
        />
      )}

      <TextInput
        style={[styles.captionInput, { color: palette.text }]}
        multiline
        placeholder={
          postKind === 'text'
            ? 'Write your post once — tailor per platform above if needed...'
            : 'Write your caption once...'
        }
        placeholderTextColor={palette.textMuted}
        value={master.caption}
        onChangeText={(caption) => onChangeMaster({ ...master, caption })}
      />

      <View
        style={[styles.tagsRow, { borderTopColor: palette.border }]}
      >
        <Text style={[styles.hashPrefix, { color: palette.textMuted }]}>#</Text>
        <TextInput
          style={[styles.tagsInput, { color: palette.text }]}
          placeholder="Add hashtags (e.g. creator behindthescenes)"
          placeholderTextColor={palette.textMuted}
          value={master.hashtags}
          onChangeText={(hashtags) => onChangeMaster({ ...master, hashtags })}
        />
      </View>

      {/* Tucked-Away Auto First-Comment / Reply Field */}
      <View
        style={[styles.firstCommentArea, { borderTopColor: palette.border }]}
      >
        {!isFirstCommentOpen ? (
          <Pressable
            onPress={() => setShowFirstComment(true)}
            style={styles.addFirstCommentBtn}
          >
            <Ionicons
              name="chatbubble-ellipses-outline"
              size={14}
              color={palette.textSecondary}
            />
            <Text
              style={[
                styles.addFirstCommentText,
                { color: palette.textSecondary },
              ]}
            >
              Add auto first-comment / reply (keep links out of main post)
            </Text>
          </Pressable>
        ) : (
          <View style={styles.firstCommentExpanded}>
            <View style={styles.firstCommentHead}>
              <View style={styles.firstCommentTitleRow}>
                <Ionicons
                  name="return-down-forward-outline"
                  size={14}
                  color={palette.accent}
                />
                <Text
                  style={[styles.firstCommentLabel, { color: palette.text }]}
                >
                  Auto first-comment / reply
                </Text>
              </View>

              <Pressable
                onPress={() => {
                  onChangeMaster({ ...master, firstComment: '' });
                  setShowFirstComment(false);
                }}
                style={{ padding: 2 }}
              >
                <Ionicons name="close" size={15} color={palette.textMuted} />
              </Pressable>
            </View>

            <TextInput
              style={[
                styles.firstCommentInput,
                {
                  color: palette.text,
                  backgroundColor: palette.surfaceSubtle,
                  borderColor: palette.border,
                },
              ]}
              multiline
              placeholder="Paste your link, newsletter CTA, or extra tags — auto-posted right after your main post goes live..."
              placeholderTextColor={palette.textMuted}
              value={master.firstComment ?? ''}
              onChangeText={(firstComment) =>
                onChangeMaster({ ...master, firstComment })
              }
            />
          </View>
        )}
      </View>
    </View>
  );

  const renderPlatformFields = (id: PlatformId) => {
    const spec = PLATFORM_SPECS[id];
    const ov = overrides[id];
    const resolved = resolvePlatformText(id, master, ov, video ?? undefined);
    const totalChars = resolved.combinedCaptionOrDescription.length;
    const overLimit = totalChars > spec.maxCaptionChars;

    const toggleCustomText = (nextVal: boolean) => {
      if (nextVal) {
        onUpdateOverride(id, {
          useCustomText: true,
          customTitle: ov.customTitle ?? master.title,
          customCaption: ov.customCaption ?? master.caption,
          customHashtags: ov.customHashtags ?? master.hashtags,
          customFirstComment: ov.customFirstComment ?? master.firstComment,
        });
      } else {
        onUpdateOverride(id, { useCustomText: false });
      }
    };

    const handleSmartFitLimit = () => {
      const sourceText = resolved.combinedCaptionOrDescription;
      const fitted = smartShortenText(sourceText, spec.maxCaptionChars);
      onUpdateOverride(id, {
        useCustomText: true,
        customTitle: '',
        customHashtags: '',
        customCaption: fitted,
        customFirstComment: ov.customFirstComment ?? master.firstComment,
      });
    };

    return (
      <View style={styles.platformBody}>
        <View
          style={[
            styles.customSwitchRow,
            {
              backgroundColor: palette.surfaceSubtle,
              borderBottomColor: palette.border,
            },
          ]}
        >
          <View style={{ flex: 1 }}>
            <Text style={[styles.customSwitchTitle, { color: palette.text }]}>
              Write separate copy for {spec.shortName}
            </Text>
            <Text
              style={[
                styles.customSwitchSub,
                { color: palette.textSecondary },
              ]}
            >
              {ov.useCustomText
                ? `Only applies to ${spec.shortName}`
                : 'Currently using your main post text'}
            </Text>
          </View>

          {overLimit && (
            <Pressable
              onPress={handleSmartFitLimit}
              style={[
                styles.fitLimitBtn,
                { borderColor: palette.text, backgroundColor: palette.surface },
              ]}
            >
              <Text style={[styles.fitLimitBtnText, { color: palette.text }]}>
                Fit to {spec.maxCaptionChars}
              </Text>
            </Pressable>
          )}

          <Switch
            value={ov.useCustomText}
            onValueChange={toggleCustomText}
            trackColor={{ false: palette.borderStrong, true: palette.text }}
          />
        </View>

        {ov.useCustomText ? (
          <View style={styles.composerFields}>
            {(spec.maxTitleChars ||
              id === 'tiktok' ||
              id === 'instagram_reels') && (
              <TextInput
                style={[
                  styles.titleInput,
                  { color: palette.text, borderBottomColor: palette.border },
                ]}
                placeholder={
                  spec.maxTitleChars
                    ? `${spec.shortName} title`
                    : 'Opening line (optional)'
                }
                placeholderTextColor={palette.textMuted}
                value={ov.customTitle ?? ''}
                onChangeText={(customTitle) =>
                  onUpdateOverride(id, { customTitle })
                }
              />
            )}

            <TextInput
              style={[styles.captionInput, { color: palette.text }]}
              multiline
              placeholder={`Write ${spec.shortName} ${spec.captionLabel.toLowerCase()}...`}
              placeholderTextColor={palette.textMuted}
              value={ov.customCaption ?? ''}
              onChangeText={(customCaption) =>
                onUpdateOverride(id, { customCaption })
              }
            />

            <View style={[styles.tagsRow, { borderTopColor: palette.border }]}>
              <Text style={[styles.hashPrefix, { color: palette.textMuted }]}>
                #
              </Text>
              <TextInput
                style={[styles.tagsInput, { color: palette.text }]}
                placeholder={`${spec.shortName} hashtags`}
                placeholderTextColor={palette.textMuted}
                value={ov.customHashtags ?? ''}
                onChangeText={(customHashtags) =>
                  onUpdateOverride(id, { customHashtags })
                }
              />
              <Text
                style={[
                  styles.charNote,
                  { color: overLimit ? palette.danger : palette.textMuted },
                ]}
              >
                {totalChars}/{spec.maxCaptionChars}
              </Text>
            </View>
            {spec.supportsFirstComment && (
              <View
                style={[styles.tagsRow, { borderTopColor: palette.border }]}
              >
                <Ionicons
                  name="return-down-forward-outline"
                  size={14}
                  color={palette.textMuted}
                />
                <TextInput
                  style={[styles.tagsInput, { color: palette.text }]}
                  placeholder={`${spec.shortName} first comment / link (optional)`}
                  placeholderTextColor={palette.textMuted}
                  value={ov.customFirstComment ?? ''}
                  onChangeText={(customFirstComment) =>
                    onUpdateOverride(id, { customFirstComment })
                  }
                />
              </View>
            )}
          </View>
        ) : (
          <View style={styles.readonlySummary}>
            {resolved.title ? (
              <Text
                style={[styles.readonlyTitle, { color: palette.text }]}
                numberOfLines={1}
              >
                {resolved.title}
              </Text>
            ) : null}
            <Text
              style={[
                styles.readonlyBody,
                {
                  color: resolved.combinedCaptionOrDescription
                    ? palette.textSecondary
                    : palette.textMuted,
                },
              ]}
              numberOfLines={3}
            >
              {resolved.combinedCaptionOrDescription ||
                'No text written yet — type in "Everywhere" or turn on separate copy above.'}
            </Text>
            <Text
              style={[
                styles.charNote,
                { color: overLimit ? palette.danger : palette.textMuted },
              ]}
            >
              {totalChars.toLocaleString()} / {spec.maxCaptionChars.toLocaleString()} characters
            </Text>
          </View>
        )}

        {/* Quiet Inline Platform Settings (shown when applicable to postKind) */}
        {postKind === 'video' && (
        <View
          style={[
            styles.optionsArea,
            { borderTopColor: palette.border },
          ]}
        >
          {id === 'tiktok' && (
            <>
              <View style={styles.optionLine}>
                <Text
                  style={[styles.optionLabel, { color: palette.textSecondary }]}
                >
                  Audience
                </Text>
                <View style={styles.segmentedRow}>
                  {(
                    [
                      ['PUBLIC_TO_EVERYONE', 'Everyone'],
                      ['MUTUAL_FOLLOW_FRIENDS', 'Friends'],
                      ['SELF_ONLY', 'Only me'],
                    ] as const
                  ).map(([val, label]) => {
                    const active =
                      (ov.tiktokPrivacy ?? 'PUBLIC_TO_EVERYONE') === val;
                    return (
                      <Pressable
                        key={val}
                        onPress={() =>
                          onUpdateOverride(id, { tiktokPrivacy: val })
                        }
                        style={[
                          styles.segBtn,
                          {
                            borderColor: active ? palette.text : palette.border,
                            backgroundColor: active
                              ? palette.surfaceMuted
                              : 'transparent',
                          },
                        ]}
                      >
                        <Text
                          style={[
                            styles.segBtnText,
                            {
                              color: active
                                ? palette.text
                                : palette.textSecondary,
                              fontWeight: active ? '600' : '400',
                            },
                          ]}
                        >
                          {label}
                        </Text>
                      </Pressable>
                    );
                  })}
                </View>
              </View>

              <View style={styles.inlineChecksRow}>
                {(
                  [
                    ['tiktokAllowComments', 'Comments', ov.tiktokAllowComments !== false],
                    ['tiktokAllowDuet', 'Duet', ov.tiktokAllowDuet !== false],
                    ['tiktokAllowStitch', 'Stitch', ov.tiktokAllowStitch !== false],
                  ] as const
                ).map(([key, label, checked]) => (
                  <Pressable
                    key={key}
                    onPress={() => onUpdateOverride(id, { [key]: !checked })}
                    style={styles.checkItem}
                  >
                    <Ionicons
                      name={checked ? 'checkbox' : 'square-outline'}
                      size={16}
                      color={checked ? palette.text : palette.textMuted}
                    />
                    <Text
                      style={[styles.checkLabel, { color: palette.text }]}
                    >
                      {label}
                    </Text>
                  </Pressable>
                ))}
              </View>
            </>
          )}

          {id === 'instagram_reels' && (
            <Pressable
              onPress={() =>
                onUpdateOverride(id, {
                  igShareToFeed: ov.igShareToFeed === false,
                })
              }
              style={styles.checkItem}
            >
              <Ionicons
                name={ov.igShareToFeed !== false ? 'checkbox' : 'square-outline'}
                size={16}
                color={
                  ov.igShareToFeed !== false ? palette.text : palette.textMuted
                }
              />
              <Text style={[styles.checkLabel, { color: palette.text }]}>
                Also show on main profile grid
              </Text>
            </Pressable>
          )}

          {(id === 'youtube_shorts' || id === 'youtube_long') && (
            <>
              <View style={styles.optionLine}>
                <Text
                  style={[styles.optionLabel, { color: palette.textSecondary }]}
                >
                  Visibility
                </Text>
                <View style={styles.segmentedRow}>
                  {(['public', 'unlisted', 'private'] as const).map((vis) => {
                    const active = (ov.ytVisibility ?? 'public') === vis;
                    return (
                      <Pressable
                        key={vis}
                        onPress={() =>
                          onUpdateOverride(id, { ytVisibility: vis })
                        }
                        style={[
                          styles.segBtn,
                          {
                            borderColor: active ? palette.text : palette.border,
                            backgroundColor: active
                              ? palette.surfaceMuted
                              : 'transparent',
                          },
                        ]}
                      >
                        <Text
                          style={[
                            styles.segBtnText,
                            {
                              color: active
                                ? palette.text
                                : palette.textSecondary,
                              fontWeight: active ? '600' : '400',
                            },
                          ]}
                        >
                          {vis.charAt(0).toUpperCase() + vis.slice(1)}
                        </Text>
                      </Pressable>
                    );
                  })}
                </View>
              </View>

              <View style={styles.inlineChecksRow}>
                {id === 'youtube_shorts' && (
                  <Pressable
                    onPress={() =>
                      onUpdateOverride(id, {
                        ytAppendShortsTag: ov.ytAppendShortsTag === false,
                      })
                    }
                    style={styles.checkItem}
                  >
                    <Ionicons
                      name={
                        ov.ytAppendShortsTag !== false
                          ? 'checkbox'
                          : 'square-outline'
                      }
                      size={16}
                      color={
                        ov.ytAppendShortsTag !== false
                          ? palette.text
                          : palette.textMuted
                      }
                    />
                    <Text style={[styles.checkLabel, { color: palette.text }]}>
                      Add #Shorts tag
                    </Text>
                  </Pressable>
                )}

                <Pressable
                  onPress={() =>
                    onUpdateOverride(id, {
                      ytMadeForKids: !ov.ytMadeForKids,
                    })
                  }
                  style={styles.checkItem}
                >
                  <Ionicons
                    name={ov.ytMadeForKids ? 'checkbox' : 'square-outline'}
                    size={16}
                    color={ov.ytMadeForKids ? palette.text : palette.textMuted}
                  />
                  <Text style={[styles.checkLabel, { color: palette.text }]}>
                    Made for kids
                  </Text>
                </Pressable>
              </View>
            </>
          )}

          {id === 'facebook_video' && (
            <View style={styles.optionLine}>
              <Text
                style={[styles.optionLabel, { color: palette.textSecondary }]}
              >
                Format
              </Text>
              <View style={styles.segmentedRow}>
                {(
                  [
                    ['auto', 'Auto'],
                    ['reel', 'Reel'],
                    ['video', 'Page video'],
                  ] as const
                ).map(([mode, label]) => {
                  const active = (ov.fbPostType ?? 'auto') === mode;
                  return (
                    <Pressable
                      key={mode}
                      onPress={() => onUpdateOverride(id, { fbPostType: mode })}
                      style={[
                        styles.segBtn,
                        {
                          borderColor: active ? palette.text : palette.border,
                          backgroundColor: active
                            ? palette.surfaceMuted
                            : 'transparent',
                        },
                      ]}
                    >
                      <Text
                        style={[
                          styles.segBtnText,
                          {
                            color: active
                              ? palette.text
                              : palette.textSecondary,
                            fontWeight: active ? '600' : '400',
                          },
                        ]}
                      >
                        {label}
                      </Text>
                    </Pressable>
                  );
                })}
              </View>
            </View>
          )}

          {spec.supportsCustomThumbnail && (
            <Pressable
              onPress={() => onPickPlatformCover(id)}
              style={styles.coverTextBtn}
            >
              <Ionicons
                name="image-outline"
                size={15}
                color={palette.textSecondary}
              />
              <Text
                style={[
                  styles.coverTextBtnLabel,
                  { color: palette.textSecondary },
                ]}
              >
                {ov.customThumbnailUri
                  ? `Custom ${spec.shortName} cover selected · Change`
                  : `Set custom cover for ${spec.shortName}`}
              </Text>
            </Pressable>
          )}
        </View>
        )}
      </View>
    );
  };

  const targetLabel =
    activeTab === 'master' || !overrides[activeTab]?.enabled
      ? 'Everywhere'
      : PLATFORM_SPECS[activeTab].shortName;

  return (
    <View>
      <PresetsModal
        visible={presetsModalOpen}
        onClose={() => setPresetsModalOpen(false)}
        targetLabel={targetLabel}
        currentDraftValues={currentDraftForPreset}
        onApplyPreset={handleApplyPreset}
      />

      {/* Quiet Underline Tab Bar + Pinned Presets Button */}
      <View
        style={[
          styles.tabsBarContainer,
          { borderBottomColor: palette.border },
        ]}
      >
        <ScrollView
          horizontal
          showsHorizontalScrollIndicator={false}
          style={{ flex: 1 }}
          contentContainerStyle={styles.underlineTabsRow}
        >
          <Pressable
            onPress={() => onSelectTab('master')}
            style={[
              styles.uTab,
              activeTab === 'master' && {
                borderBottomColor: palette.text,
              },
            ]}
          >
            <Text
              style={[
                styles.uTabText,
                {
                  color:
                    activeTab === 'master'
                      ? palette.text
                      : palette.textSecondary,
                  fontWeight: activeTab === 'master' ? '600' : '400',
                },
              ]}
            >
              Everywhere
            </Text>
          </Pressable>

          {enabledPlatforms.map((id) => {
            const spec = PLATFORM_SPECS[id];
            const isSelected = activeTab === id;
            const isCustom = overrides[id]?.useCustomText;
            const hasErr =
              (Boolean(video) ||
                photos.length > 0 ||
                Boolean(master.caption.trim())) &&
              validations[id]?.status === 'error';

            return (
              <Pressable
                key={id}
                onPress={() => onSelectTab(id)}
                style={[
                  styles.uTab,
                  isSelected && {
                    borderBottomColor: palette.text,
                  },
                ]}
              >
                <Text
                  style={[
                    styles.uTabText,
                    {
                      color: hasErr
                        ? palette.danger
                        : isSelected
                        ? palette.text
                        : palette.textSecondary,
                      fontWeight: isSelected ? '600' : '400',
                    },
                  ]}
                >
                  {spec.shortName}
                </Text>
                {isCustom && (
                  <View
                    style={[
                      styles.editedDot,
                      { backgroundColor: palette.accent },
                    ]}
                  />
                )}
              </Pressable>
            );
          })}
        </ScrollView>

        <Pressable
          onPress={() => setPresetsModalOpen(true)}
          style={[
            styles.presetsTriggerBtn,
            {
              borderColor: palette.border,
              backgroundColor: palette.surfaceSubtle,
            },
          ]}
        >
          <Ionicons
            name="bookmark-outline"
            size={13}
            color={palette.textSecondary}
          />
          <Text
            style={[styles.presetsTriggerText, { color: palette.text }]}
          >
            Presets{presets.length > 0 ? ` (${presets.length})` : ''}
          </Text>
          <Ionicons
            name="chevron-down"
            size={11}
            color={palette.textSecondary}
          />
        </Pressable>
      </View>

      {activeTab === 'master'
        ? renderMasterFields()
        : overrides[activeTab]?.enabled
        ? renderPlatformFields(activeTab)
        : renderMasterFields()}
    </View>
  );
}

const styles = StyleSheet.create({
  tabsBarContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    borderBottomWidth: 1,
    paddingRight: 12,
    gap: 8,
  },
  underlineTabsRow: {
    paddingHorizontal: 16,
    gap: 14,
  },
  presetsTriggerBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 5,
    paddingHorizontal: 9,
    paddingVertical: 5,
    borderRadius: 6,
    borderWidth: 1,
  },
  presetsTriggerText: {
    fontSize: 12,
    fontWeight: '600',
  },
  uTab: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 5,
    paddingVertical: 11,
    borderBottomWidth: 2,
    borderBottomColor: 'transparent',
  },
  uTabText: {
    fontSize: 13,
  },
  editedDot: {
    width: 5,
    height: 5,
    borderRadius: 3,
  },
  composerFields: {
    paddingHorizontal: 20,
  },
  titleInput: {
    paddingVertical: 14,
    fontSize: 15.5,
    fontWeight: '600',
    borderBottomWidth: 1,
  },
  captionInput: {
    paddingVertical: 14,
    minHeight: 118,
    textAlignVertical: 'top',
    fontSize: 14.5,
    lineHeight: 22,
  },
  tagsRow: {
    flexDirection: 'row',
    alignItems: 'center',
    borderTopWidth: 1,
    paddingVertical: 10,
    gap: 4,
  },
  hashPrefix: {
    fontSize: 14,
    fontWeight: '500',
  },
  tagsInput: {
    flex: 1,
    fontSize: 13.5,
    paddingVertical: 2,
  },
  charNote: {
    fontSize: 12,
  },
  firstCommentArea: {
    borderTopWidth: 1,
    paddingVertical: 10,
  },
  addFirstCommentBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    paddingVertical: 2,
  },
  addFirstCommentText: {
    fontSize: 12.5,
    fontWeight: '500',
  },
  firstCommentExpanded: {
    gap: 8,
    paddingVertical: 2,
  },
  firstCommentHead: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  firstCommentTitleRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
  },
  firstCommentLabel: {
    fontSize: 12.5,
    fontWeight: '600',
  },
  firstCommentInput: {
    borderWidth: 1,
    borderRadius: 8,
    paddingHorizontal: 11,
    paddingVertical: 8,
    minHeight: 54,
    textAlignVertical: 'top',
    fontSize: 13,
    lineHeight: 19,
  },
  fitLimitBtn: {
    borderWidth: 1,
    borderRadius: 6,
    paddingHorizontal: 9,
    paddingVertical: 4,
  },
  fitLimitBtnText: {
    fontSize: 11.5,
    fontWeight: '600',
  },
  platformBody: {
    gap: 0,
  },
  customSwitchRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 20,
    paddingVertical: 12,
    borderBottomWidth: 1,
    gap: 12,
  },
  customSwitchTitle: {
    fontSize: 13.5,
    fontWeight: '600',
  },
  customSwitchSub: {
    fontSize: 12,
    marginTop: 1,
  },
  readonlySummary: {
    paddingHorizontal: 20,
    paddingVertical: 16,
    gap: 6,
  },
  readonlyTitle: {
    fontSize: 14.5,
    fontWeight: '600',
  },
  readonlyBody: {
    fontSize: 13.5,
    lineHeight: 20,
  },
  optionsArea: {
    borderTopWidth: 1,
    paddingHorizontal: 20,
    paddingVertical: 14,
    gap: 12,
  },
  optionLine: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    flexWrap: 'wrap',
    gap: 10,
  },
  optionLabel: {
    fontSize: 13,
    fontWeight: '500',
  },
  segmentedRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 6,
  },
  segBtn: {
    paddingHorizontal: 10,
    paddingVertical: 5,
    borderRadius: 6,
    borderWidth: 1,
  },
  segBtnText: {
    fontSize: 12,
  },
  inlineChecksRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 18,
  },
  checkItem: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
  },
  checkLabel: {
    fontSize: 13,
  },
  coverTextBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    paddingTop: 2,
  },
  coverTextBtnLabel: {
    fontSize: 12.5,
    fontWeight: '500',
    textDecorationLine: 'underline',
  },
});
