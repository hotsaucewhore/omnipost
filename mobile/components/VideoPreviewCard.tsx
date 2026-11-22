import { Ionicons } from '@expo/vector-icons';
import React, { useEffect, useState } from 'react';
import {
  Image,
  Platform,
  Pressable,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import {
  classifyAspectRatio,
  ConnectedAccount,
  detectPostKind,
  formatDuration,
  getEffectiveVideoForPlatform,
  MasterDraft,
  PhotoAssetMeta,
  PLATFORM_ORDER,
  PLATFORM_SPECS,
  PlatformId,
  PlatformOverride,
  resolvePlatformText,
  summarizeVideoEdits,
  VideoAssetMeta,
} from '../../shared/platforms';
import { PLATFORM_ICONS } from '../constants/theme';
import { useOmniPost } from '../context/OmniPostContext';

interface Props {
  video: VideoAssetMeta | null;
  photos?: PhotoAssetMeta[];
  master: MasterDraft;
  overrides: Record<PlatformId, PlatformOverride>;
  accounts: ConnectedAccount[];
  selectedPlatform: PlatformId;
  onSelectPlatform: (id: PlatformId) => void;
}

export function VideoPreviewCard({
  video,
  photos = [],
  master,
  overrides,
  accounts,
  selectedPlatform,
  onSelectPlatform,
}: Props) {
  const { palette } = useOmniPost();
  const [showSafeZones, setShowSafeZones] = useState(false);
  const [expandedCaption, setExpandedCaption] = useState(false);
  const [slideIdx, setSlideIdx] = useState(0);

  useEffect(() => {
    if (slideIdx >= photos.length) {
      setSlideIdx(0);
    }
  }, [photos.length, slideIdx]);

  const postKind = detectPostKind(video, photos);
  const enabledIds = PLATFORM_ORDER.filter((id) => overrides[id]?.enabled);
  const previewId = overrides[selectedPlatform]?.enabled
    ? selectedPlatform
    : enabledIds[0] ?? (postKind === 'text' ? 'x' : 'tiktok');

  const spec = PLATFORM_SPECS[previewId];
  const ov = overrides[previewId];
  const effectiveVideo = video
    ? getEffectiveVideoForPlatform(video, previewId)
    : undefined;
  const resolved = resolvePlatformText(
    previewId,
    master,
    ov,
    effectiveVideo
  );
  const account = accounts.find((a) => a.platformGroup === spec.accountGroup);
  const handle = account?.handle || `@${spec.id.split('_')[0]}`;
  const displayName = account?.displayName || spec.shortName;

  const isMicroblogChannel =
    previewId === 'x' ||
    previewId === 'threads' ||
    previewId === 'bluesky' ||
    previewId === 'linkedin';

  const isVerticalVideoFeed =
    postKind === 'video' &&
    !isMicroblogChannel &&
    (previewId === 'tiktok' ||
      previewId === 'instagram_reels' ||
      previewId === 'youtube_shorts' ||
      (previewId === 'facebook_video' && resolved.effectiveFbMode === 'reel'));

  const isCarouselCard =
    postKind === 'photo' &&
    (previewId === 'instagram_reels' ||
      previewId === 'tiktok' ||
      previewId === 'facebook_video');

  const coverUri = ov?.customThumbnailUri || video?.thumbnailUri;
  const hasRealWebVideo =
    Platform.OS === 'web' && Boolean(video?.uri && !video.isSamplePreset);

  const aspect = effectiveVideo
    ? classifyAspectRatio(effectiveVideo.width, effectiveVideo.height)
    : null;
  const editSummary = video ? summarizeVideoEdits(video) : [];

  const rawDisplayBody =
    previewId === 'youtube_shorts' && postKind === 'video'
      ? resolved.title || resolved.combinedCaptionOrDescription
      : resolved.combinedCaptionOrDescription;

  const isTruncated =
    !expandedCaption && rawDisplayBody.length > spec.truncationPreviewChars;
  const shownCaption = isTruncated
    ? `${rawDisplayBody.slice(0, spec.truncationPreviewChars).trimEnd()}… `
    : rawDisplayBody;

  const visiblePhotos = spec.maxPhotos
    ? photos.slice(0, spec.maxPhotos)
    : photos;

  const renderPhotoTile = (photo: PhotoAssetMeta, styleObj: any) => {
    if (photo.uri && !photo.isSamplePreset) {
      return <Image source={{ uri: photo.uri }} style={styleObj} />;
    }
    return (
      <View
        style={[
          styleObj,
          styles.samplePhotoPlaceholder,
          { backgroundColor: photo.sampleTint || '#2B2A27' },
        ]}
      >
        <Ionicons name="image-outline" size={20} color="rgba(255,255,255,0.75)" />
        <Text style={styles.samplePhotoText} numberOfLines={1}>
          {photo.sampleLabel || photo.fileName}
        </Text>
      </View>
    );
  };

  const renderMediaBackdrop = () => {
    if (hasRealWebVideo && video?.uri) {
      const focusX = video.edits?.cropFocusX ?? 50;
      const isBlurMode =
        video.edits?.reframeMode === 'vertical_blur' && isVerticalVideoFeed;
      if (isBlurMode) {
        return (
          <>
            {React.createElement('video', {
              src: video.uri,
              muted: true,
              autoPlay: true,
              loop: true,
              playsInline: true,
              style: {
                position: 'absolute',
                top: 0,
                left: 0,
                width: '100%',
                height: '100%',
                objectFit: 'cover',
                filter: 'blur(18px) brightness(0.55)',
                transform: 'scale(1.1)',
              },
            })}
            {React.createElement('video', {
              src: video.uri,
              muted: true,
              autoPlay: true,
              loop: true,
              playsInline: true,
              style: {
                position: 'absolute',
                top: 0,
                left: 0,
                width: '100%',
                height: '100%',
                objectFit: 'contain',
              },
            })}
          </>
        );
      }
      return React.createElement('video', {
        src: video.uri,
        muted: true,
        autoPlay: true,
        loop: true,
        playsInline: true,
        style: {
          position: 'absolute',
          top: 0,
          left: 0,
          width: '100%',
          height: '100%',
          objectFit: 'cover',
          objectPosition: `${focusX}% 50%`,
        },
      });
    }
    if (coverUri) {
      return <Image source={{ uri: coverUri }} style={styles.bgImage} />;
    }
    return (
      <View style={styles.matteStage}>
        {effectiveVideo ? (
          <>
            <Ionicons
              name="play"
              size={22}
              color="rgba(255,255,255,0.7)"
              style={{ marginBottom: 4 }}
            />
            <Text style={styles.stageFile} numberOfLines={1}>
              {effectiveVideo.fileName}
            </Text>
            <Text style={styles.stageMeta}>
              {aspect?.label} · {formatDuration(effectiveVideo.durationSec)}
            </Text>
            {editSummary.length > 0 && (
              <Text style={styles.stageEditNote} numberOfLines={1}>
                {editSummary.join(' · ')}
              </Text>
            )}
          </>
        ) : (
          <Text style={styles.emptyStageLabel}>Preview</Text>
        )}
      </View>
    );
  };

  const renderSocialFeedCard = () => {
    const charCount = resolved.combinedCaptionOrDescription.length;
    const overLimit = charCount > spec.maxCaptionChars;

    return (
      <View
        style={[
          styles.feedCard,
          {
            backgroundColor: palette.surface,
            borderColor: palette.border,
          },
        ]}
      >
        <View style={styles.feedCardHeader}>
          <View
            style={[
              styles.feedAvatar,
              { backgroundColor: palette.surfaceMuted },
            ]}
          >
            <Ionicons
              name={PLATFORM_ICONS[previewId]}
              size={14}
              color={palette.text}
            />
          </View>
          <View style={{ flex: 1 }}>
            <Text
              style={[styles.feedDisplayName, { color: palette.text }]}
              numberOfLines={1}
            >
              {displayName}
            </Text>
            <Text
              style={[styles.feedHandle, { color: palette.textMuted }]}
              numberOfLines={1}
            >
              {handle} · now
            </Text>
          </View>

          {spec.maxCaptionChars <= 500 && (
            <Text
              style={[
                styles.charBadge,
                { color: overLimit ? palette.danger : palette.textMuted },
              ]}
            >
              {charCount}/{spec.maxCaptionChars}
            </Text>
          )}
        </View>

        <Text
          style={[
            styles.feedBodyText,
            {
              color: resolved.combinedCaptionOrDescription
                ? palette.text
                : palette.textMuted,
            },
          ]}
        >
          {resolved.combinedCaptionOrDescription ||
            `Write your ${spec.shortName} post on the left...`}
        </Text>

        {/* Attached Photo Grid inside Feed Post */}
        {postKind === 'photo' && visiblePhotos.length > 0 && (
          <View style={styles.feedPhotoGrid}>
            {visiblePhotos.slice(0, 4).map((ph, idx) => {
              const extraCount = visiblePhotos.length - 4;
              const showMoreOverlay = idx === 3 && extraCount > 0;
              return (
                <View
                  key={ph.id}
                  style={[
                    styles.feedGridCell,
                    visiblePhotos.length === 1 && { width: '100%', height: 170 },
                  ]}
                >
                  {renderPhotoTile(ph, styles.fullFill)}
                  {showMoreOverlay && (
                    <View style={styles.morePhotosOverlay}>
                      <Text style={styles.morePhotosOverlayText}>
                        +{extraCount}
                      </Text>
                    </View>
                  )}
                </View>
              );
            })}
          </View>
        )}

        {/* Attached Video Pill inside Microblog Post */}
        {postKind === 'video' && effectiveVideo && (
          <View style={styles.feedVideoBox}>
            {renderMediaBackdrop()}
          </View>
        )}

        {!spec.supportsTextOnly && postKind === 'text' && (
          <View
            style={[
              styles.unsupportedNote,
              { backgroundColor: palette.dangerBg },
            ]}
          >
            <Text style={{ color: palette.danger, fontSize: 12 }}>
              {spec.shortName} requires a photo or video attachment.
            </Text>
          </View>
        )}

        <View
          style={[
            styles.feedActionRow,
            { borderTopColor: palette.border },
          ]}
        >
          <Ionicons
            name="chatbubble-outline"
            size={15}
            color={palette.textMuted}
          />
          <Ionicons
            name="repeat-outline"
            size={16}
            color={palette.textMuted}
          />
          <Ionicons
            name="heart-outline"
            size={15}
            color={palette.textMuted}
          />
          <Ionicons
            name="share-outline"
            size={15}
            color={palette.textMuted}
          />
        </View>
      </View>
    );
  };

  const renderPhotoCarouselPreview = () => {
    const safeSlide = Math.min(
      Math.max(0, slideIdx),
      Math.max(0, visiblePhotos.length - 1)
    );
    const activePhoto = visiblePhotos[safeSlide];

    return (
      <View
        style={[
          styles.carouselCard,
          {
            backgroundColor: palette.surface,
            borderColor: palette.border,
          },
        ]}
      >
        <View style={styles.carouselHeader}>
          <Text
            style={[styles.feedDisplayName, { color: palette.text }]}
            numberOfLines={1}
          >
            {handle}
          </Text>
          <Text style={{ fontSize: 11.5, color: palette.textMuted }}>
            {spec.shortName}
          </Text>
        </View>

        <View style={styles.carouselStage}>
          {activePhoto && renderPhotoTile(activePhoto, styles.fullFill)}

          {visiblePhotos.length > 1 && (
            <>
              <View style={styles.slideCountPill}>
                <Text style={styles.slideCountText}>
                  {safeSlide + 1}/{visiblePhotos.length}
                </Text>
              </View>

              {safeSlide > 0 && (
                <Pressable
                  onPress={() => setSlideIdx((i) => Math.max(0, i - 1))}
                  style={[styles.slideArrow, { left: 8 }]}
                >
                  <Ionicons name="chevron-back" size={15} color="#FFF" />
                </Pressable>
              )}

              {safeSlide < visiblePhotos.length - 1 && (
                <Pressable
                  onPress={() =>
                    setSlideIdx((i) =>
                      Math.min(visiblePhotos.length - 1, i + 1)
                    )
                  }
                  style={[styles.slideArrow, { right: 8 }]}
                >
                  <Ionicons name="chevron-forward" size={15} color="#FFF" />
                </Pressable>
              )}
            </>
          )}
        </View>

        {visiblePhotos.length > 1 && (
          <View style={styles.dotsRow}>
            {visiblePhotos.map((p, idx) => (
              <View
                key={p.id}
                style={[
                  styles.dot,
                  {
                    backgroundColor:
                      idx === safeSlide ? palette.text : palette.borderStrong,
                  },
                ]}
              />
            ))}
          </View>
        )}

        <View style={styles.carouselCaptionArea}>
          <Pressable onPress={() => setExpandedCaption((e) => !e)}>
            <Text style={[styles.carouselCaption, { color: palette.text }]}>
              <Text style={{ fontWeight: '600' }}>{handle} </Text>
              {shownCaption || (
                <Text style={{ color: palette.textMuted }}>
                  Add a caption...
                </Text>
              )}
              {isTruncated && (
                <Text style={{ color: palette.textMuted }}>more</Text>
              )}
            </Text>
          </Pressable>
        </View>
      </View>
    );
  };

  return (
    <View style={styles.wrap}>
      {/* Quiet Unboxed Top Bar */}
      <View style={styles.topRow}>
        <Text style={[styles.previewHeading, { color: palette.textSecondary }]}>
          Preview
        </Text>

        <View style={styles.switcherLinks}>
          {(enabledIds.length > 0 ? enabledIds : PLATFORM_ORDER.slice(0, 5)).map(
            (id) => {
              const s = PLATFORM_SPECS[id];
              const active = id === previewId;
              return (
                <Pressable
                  key={id}
                  onPress={() => {
                    setExpandedCaption(false);
                    onSelectPlatform(id);
                  }}
                  style={[
                    styles.switchItem,
                    active && { backgroundColor: palette.surfaceMuted },
                  ]}
                >
                  <Text
                    style={[
                      styles.switchText,
                      {
                        color: active ? palette.text : palette.textMuted,
                        fontWeight: active ? '600' : '400',
                      },
                    ]}
                  >
                    {s.shortName}
                  </Text>
                </Pressable>
              );
            }
          )}
        </View>
      </View>

      {postKind === 'text' || isMicroblogChannel ? (
        renderSocialFeedCard()
      ) : isCarouselCard ? (
        renderPhotoCarouselPreview()
      ) : isVerticalVideoFeed ? (
        <View
          style={[
            styles.phoneFrame,
            {
              borderColor: palette.borderStrong,
            },
          ]}
        >
          {renderMediaBackdrop()}

          {showSafeZones && (
            <>
              <View style={styles.topSafeGuide}>
                <Text style={styles.safeGuideText}>App header area</Text>
              </View>
              <View style={styles.rightSafeGuide} />
            </>
          )}

          <View style={styles.rightSilhouetteRail}>
            <Ionicons
              name="heart-outline"
              size={20}
              color="rgba(255,255,255,0.55)"
            />
            <Ionicons
              name="chatbubble-outline"
              size={19}
              color="rgba(255,255,255,0.55)"
            />
            <Ionicons
              name="paper-plane-outline"
              size={19}
              color="rgba(255,255,255,0.55)"
            />
          </View>

          <View
            style={[
              styles.bottomScrim,
              showSafeZones && styles.bottomSafeBorder,
            ]}
          >
            <Text style={styles.handleLabel} numberOfLines={1}>
              {handle}
            </Text>
            <Pressable onPress={() => setExpandedCaption((e) => !e)}>
              <Text
                style={[
                  styles.captionPreview,
                  !shownCaption && { color: 'rgba(255,255,255,0.42)' },
                ]}
              >
                {shownCaption || 'Your caption will show here...'}
                {isTruncated && <Text style={styles.moreWord}>more</Text>}
              </Text>
            </Pressable>
          </View>
        </View>
      ) : (
        <View
          style={[
            styles.widescreenFrame,
            {
              backgroundColor: palette.surface,
              borderColor: palette.border,
            },
          ]}
        >
          <View style={styles.widescreenStage}>
            {renderMediaBackdrop()}
            {effectiveVideo && (
              <View style={styles.timeBadge}>
                <Text style={styles.timeBadgeText}>
                  {formatDuration(effectiveVideo.durationSec)}
                </Text>
              </View>
            )}
          </View>
          <View style={styles.widescreenMeta}>
            <Text
              style={[styles.widescreenTitle, { color: palette.text }]}
              numberOfLines={2}
            >
              {resolved.title || 'Untitled video'}
            </Text>
            <Text
              style={[styles.widescreenHandle, { color: palette.textSecondary }]}
            >
              {handle} · {spec.shortName}
            </Text>
            {resolved.combinedCaptionOrDescription ? (
              <Text
                style={[styles.widescreenDesc, { color: palette.textMuted }]}
                numberOfLines={2}
              >
                {resolved.combinedCaptionOrDescription}
              </Text>
            ) : null}
          </View>
        </View>
      )}

      {isVerticalVideoFeed && (
        <Pressable
          onPress={() => setShowSafeZones((s) => !s)}
          style={styles.safeToggleLink}
        >
          <Ionicons
            name={showSafeZones ? 'eye-off-outline' : 'grid-outline'}
            size={13}
            color={palette.textSecondary}
          />
          <Text
            style={[styles.safeToggleText, { color: palette.textSecondary }]}
          >
            {showSafeZones
              ? 'Hide UI safe-area guides'
              : 'Show UI safe-area guides'}
          </Text>
        </Pressable>
      )}

      {resolved.firstComment ? (
        <View
          style={[
            styles.firstCommentPreviewBox,
            {
              backgroundColor: palette.surface,
              borderColor: palette.border,
            },
          ]}
        >
          <View style={styles.firstCommentHeaderLine}>
            <Ionicons
              name="return-down-forward-outline"
              size={13}
              color={palette.accent}
            />
            <Text
              style={[styles.firstCommentHandle, { color: palette.text }]}
              numberOfLines={1}
            >
              {handle}
            </Text>
            <Text style={{ fontSize: 11, color: palette.textMuted }}>
              · 1st comment
            </Text>
          </View>
          <Text
            style={[
              styles.firstCommentBody,
              { color: palette.textSecondary },
            ]}
            numberOfLines={3}
          >
            {resolved.firstComment}
          </Text>
        </View>
      ) : master.firstComment?.trim() && !spec.supportsFirstComment ? (
        <Text
          style={{
            fontSize: 11.5,
            color: palette.textMuted,
            textAlign: 'center',
          }}
        >
          ({spec.shortName} API does not support automated first comments — skipped cleanly)
        </Text>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: {
    gap: 10,
  },
  topRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    flexWrap: 'wrap',
    gap: 6,
  },
  previewHeading: {
    fontSize: 12.5,
    fontWeight: '600',
  },
  switcherLinks: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 2,
  },
  switchItem: {
    paddingHorizontal: 7,
    paddingVertical: 4,
    borderRadius: 6,
  },
  switchText: {
    fontSize: 11.5,
  },
  phoneFrame: {
    alignSelf: 'center',
    width: '100%',
    maxWidth: 256,
    height: 438,
    borderRadius: 20,
    backgroundColor: '#191918',
    borderWidth: 1,
    overflow: 'hidden',
    position: 'relative',
    justifyContent: 'flex-end',
  },
  bgImage: {
    position: 'absolute',
    top: 0,
    right: 0,
    bottom: 0,
    left: 0,
    width: '100%',
    height: '100%',
    resizeMode: 'cover',
  },
  fullFill: {
    width: '100%',
    height: '100%',
    resizeMode: 'cover',
  },
  samplePhotoPlaceholder: {
    alignItems: 'center',
    justifyContent: 'center',
    gap: 6,
    padding: 12,
  },
  samplePhotoText: {
    color: 'rgba(255,255,255,0.86)',
    fontSize: 11.5,
    fontWeight: '500',
  },
  matteStage: {
    position: 'absolute',
    top: 0,
    right: 0,
    bottom: 0,
    left: 0,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 24,
    paddingBottom: 90,
    backgroundColor: '#1E1E1C',
    gap: 4,
  },
  stageFile: {
    color: 'rgba(255,255,255,0.88)',
    fontSize: 12.5,
    fontWeight: '500',
    maxWidth: 190,
  },
  stageMeta: {
    color: 'rgba(255,255,255,0.48)',
    fontSize: 11.5,
  },
  stageEditNote: {
    color: 'rgba(255,255,255,0.68)',
    fontSize: 10.5,
    marginTop: 2,
  },
  emptyStageLabel: {
    color: 'rgba(255,255,255,0.32)',
    fontSize: 12.5,
    fontWeight: '500',
  },
  feedCard: {
    borderRadius: 12,
    borderWidth: 1,
    padding: 16,
    gap: 12,
  },
  feedCardHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
  },
  feedAvatar: {
    width: 32,
    height: 32,
    borderRadius: 16,
    alignItems: 'center',
    justifyContent: 'center',
  },
  feedDisplayName: {
    fontSize: 13.5,
    fontWeight: '600',
  },
  feedHandle: {
    fontSize: 12,
  },
  charBadge: {
    fontSize: 11.5,
    fontWeight: '600',
  },
  feedBodyText: {
    fontSize: 13.5,
    lineHeight: 20,
  },
  feedPhotoGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 4,
    borderRadius: 8,
    overflow: 'hidden',
  },
  feedGridCell: {
    width: '48.8%',
    flexGrow: 1,
    height: 110,
    borderRadius: 6,
    overflow: 'hidden',
    position: 'relative',
  },
  morePhotosOverlay: {
    position: 'absolute',
    top: 0,
    right: 0,
    bottom: 0,
    left: 0,
    backgroundColor: 'rgba(18, 18, 16, 0.62)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  morePhotosOverlayText: {
    color: '#FFFFFF',
    fontSize: 16,
    fontWeight: '700',
  },
  feedVideoBox: {
    width: '100%',
    height: 150,
    borderRadius: 8,
    overflow: 'hidden',
    position: 'relative',
  },
  unsupportedNote: {
    padding: 9,
    borderRadius: 7,
  },
  feedActionRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingTop: 10,
    paddingRight: 24,
    borderTopWidth: 1,
  },
  carouselCard: {
    borderRadius: 12,
    borderWidth: 1,
    overflow: 'hidden',
  },
  carouselHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingHorizontal: 13,
    paddingVertical: 10,
  },
  carouselStage: {
    width: '100%',
    height: 290,
    backgroundColor: '#1E1E1C',
    position: 'relative',
  },
  slideCountPill: {
    position: 'absolute',
    top: 10,
    right: 10,
    backgroundColor: 'rgba(0,0,0,0.68)',
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: 999,
  },
  slideCountText: {
    color: '#FFF',
    fontSize: 11,
    fontWeight: '600',
  },
  slideArrow: {
    position: 'absolute',
    top: '45%',
    width: 26,
    height: 26,
    borderRadius: 13,
    backgroundColor: 'rgba(0,0,0,0.55)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  dotsRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    justifyContent: 'center',
    alignItems: 'center',
    gap: 5,
    paddingTop: 10,
    paddingHorizontal: 14,
  },
  dot: {
    width: 5,
    height: 5,
    borderRadius: 3,
  },
  carouselCaptionArea: {
    paddingHorizontal: 13,
    paddingVertical: 11,
  },
  carouselCaption: {
    fontSize: 12.5,
    lineHeight: 18,
  },
  topSafeGuide: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    height: 44,
    backgroundColor: 'rgba(217, 155, 38, 0.18)',
    borderBottomWidth: 1,
    borderStyle: 'dashed',
    borderBottomColor: 'rgba(251, 191, 36, 0.7)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  safeGuideText: {
    color: '#FDE68A',
    fontSize: 10,
    fontWeight: '600',
  },
  rightSafeGuide: {
    position: 'absolute',
    top: 120,
    right: 0,
    width: 46,
    bottom: 84,
    backgroundColor: 'rgba(217, 155, 38, 0.15)',
    borderLeftWidth: 1,
    borderStyle: 'dashed',
    borderLeftColor: 'rgba(251, 191, 36, 0.7)',
  },
  rightSilhouetteRail: {
    position: 'absolute',
    right: 12,
    bottom: 98,
    alignItems: 'center',
    gap: 18,
    zIndex: 5,
  },
  bottomScrim: {
    paddingHorizontal: 14,
    paddingVertical: 14,
    paddingRight: 52,
    backgroundColor: 'rgba(15, 15, 14, 0.72)',
    gap: 4,
  },
  bottomSafeBorder: {
    borderTopWidth: 1,
    borderStyle: 'dashed',
    borderTopColor: 'rgba(251, 191, 36, 0.75)',
  },
  handleLabel: {
    color: '#FFFFFF',
    fontSize: 12.5,
    fontWeight: '600',
  },
  captionPreview: {
    color: 'rgba(255,255,255,0.86)',
    fontSize: 12,
    lineHeight: 17,
  },
  moreWord: {
    color: 'rgba(255,255,255,0.55)',
    fontWeight: '600',
  },
  widescreenFrame: {
    borderRadius: 12,
    borderWidth: 1,
    overflow: 'hidden',
  },
  widescreenStage: {
    width: '100%',
    height: 172,
    position: 'relative',
    backgroundColor: '#1E1E1C',
  },
  timeBadge: {
    position: 'absolute',
    right: 8,
    bottom: 8,
    backgroundColor: 'rgba(0,0,0,0.8)',
    paddingHorizontal: 6,
    paddingVertical: 2,
    borderRadius: 4,
  },
  timeBadgeText: {
    color: '#FFF',
    fontSize: 11,
    fontWeight: '600',
  },
  widescreenMeta: {
    padding: 13,
    gap: 4,
  },
  widescreenTitle: {
    fontSize: 14,
    fontWeight: '600',
    lineHeight: 19,
  },
  widescreenHandle: {
    fontSize: 12,
  },
  widescreenDesc: {
    fontSize: 12,
    marginTop: 2,
  },
  safeToggleLink: {
    alignSelf: 'center',
    flexDirection: 'row',
    alignItems: 'center',
    gap: 5,
    paddingVertical: 4,
  },
  safeToggleText: {
    fontSize: 12,
  },
  firstCommentPreviewBox: {
    borderRadius: 10,
    borderWidth: 1,
    paddingHorizontal: 12,
    paddingVertical: 10,
    gap: 4,
  },
  firstCommentHeaderLine: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 5,
  },
  firstCommentHandle: {
    fontSize: 12,
    fontWeight: '600',
    flexShrink: 1,
  },
  firstCommentBody: {
    fontSize: 12,
    lineHeight: 17,
  },
});
