import { Ionicons } from '@expo/vector-icons';
import React, { useEffect, useRef, useState } from 'react';
import {
  GestureResponderEvent,
  Modal,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  useWindowDimensions,
  View,
} from 'react-native';
import {
  classifyAspectRatio,
  createDefaultEdits,
  formatDuration,
  ReframeMode,
  VideoAssetMeta,
  VideoEdits,
} from '../../shared/platforms';
import { useOmniPost } from '../context/OmniPostContext';

interface Props {
  visible: boolean;
  video: VideoAssetMeta | null;
  onClose: () => void;
  onApply: (nextEdits: VideoEdits, capturedThumbUri?: string) => void;
  onPickCustomImage: () => void;
}

interface ScrubBarProps {
  value: number;
  min: number;
  max: number;
  onChange: (val: number) => void;
  accentColor: string;
  trackColor: string;
}

function TactileScrubBar({
  value,
  min,
  max,
  onChange,
  accentColor,
  trackColor,
}: ScrubBarProps) {
  const [barWidth, setBarWidth] = useState(240);
  const safeSpan = Math.max(0.1, max - min);
  const pct = Math.min(100, Math.max(0, ((value - min) / safeSpan) * 100));

  if (Platform.OS === 'web') {
    return React.createElement('input', {
      type: 'range',
      min,
      max,
      step: 0.5,
      value,
      onChange: (e: any) => onChange(Number(e.target.value)),
      style: {
        width: '100%',
        accentColor,
        cursor: 'pointer',
        height: 20,
        margin: 0,
      },
    });
  }

  const handleTouch = (e: GestureResponderEvent) => {
    if (!barWidth) return;
    const ratio = Math.min(1, Math.max(0, e.nativeEvent.locationX / barWidth));
    onChange(Math.round((min + ratio * safeSpan) * 2) / 2);
  };

  return (
    <View
      onLayout={(e) => setBarWidth(e.nativeEvent.layout.width || 240)}
      onStartShouldSetResponder={() => true}
      onResponderGrant={handleTouch}
      onResponderMove={handleTouch}
      style={[styles.nativeTrack, { backgroundColor: trackColor }]}
    >
      <View
        style={[
          styles.nativeFill,
          { width: `${pct}%`, backgroundColor: accentColor },
        ]}
      />
    </View>
  );
}

export function VideoEditModal({
  visible,
  video,
  onClose,
  onApply,
  onPickCustomImage,
}: Props) {
  const { palette } = useOmniPost();
  const { width: viewportWidth } = useWindowDimensions();
  const isTwoCol = viewportWidth >= 700;

  const [draft, setDraft] = useState<VideoEdits>(() =>
    createDefaultEdits(video?.durationSec ?? 30)
  );
  const [scrubSec, setScrubSec] = useState<number>(0);
  const [capturedCoverDataUrl, setCapturedCoverDataUrl] = useState<
    string | undefined
  >(undefined);

  const webVideoRef = useRef<HTMLVideoElement | null>(null);

  useEffect(() => {
    if (!video || !visible) return;
    const base = video.edits
      ? { ...video.edits }
      : createDefaultEdits(video.durationSec);
    setDraft(base);
    setScrubSec(base.coverTimestampSec ?? base.trimStartSec);
    setCapturedCoverDataUrl(undefined);
  }, [video, visible]);

  const seekWebVideo = (sec: number) => {
    if (Platform.OS === 'web' && webVideoRef.current) {
      try {
        webVideoRef.current.currentTime = Math.max(0, sec);
      } catch {
        // Ignore if metadata not loaded yet
      }
    }
  };

  if (!video) return null;

  const totalSec = Math.max(1, Math.round(video.durationSec));
  const origAspect = classifyAspectRatio(video.width, video.height);
  const hasRealWebVideo =
    Platform.OS === 'web' && Boolean(video.uri && !video.isSamplePreset);

  const trimmedLen = Math.max(
    1,
    Math.round(draft.trimEndSec - draft.trimStartSec)
  );
  const startPct = (draft.trimStartSec / totalSec) * 100;
  const widthPct = Math.max(
    3,
    ((draft.trimEndSec - draft.trimStartSec) / totalSec) * 100
  );

  const updateStart = (val: number) => {
    const clamped = Math.max(0, Math.min(val, draft.trimEndSec - 1));
    setDraft((prev) => ({ ...prev, trimStartSec: Math.round(clamped) }));
    setScrubSec(Math.round(clamped));
    seekWebVideo(clamped);
  };

  const updateEnd = (val: number) => {
    const clamped = Math.min(totalSec, Math.max(val, draft.trimStartSec + 1));
    setDraft((prev) => ({ ...prev, trimEndSec: Math.round(clamped) }));
    seekWebVideo(clamped);
  };

  const handleCaptureFrame = () => {
    const targetSec = Math.min(
      draft.trimEndSec,
      Math.max(draft.trimStartSec, Math.round(scrubSec))
    );
    setDraft((prev) => ({ ...prev, coverTimestampSec: targetSec }));

    if (Platform.OS === 'web' && webVideoRef.current) {
      try {
        const v = webVideoRef.current;
        if (v.videoWidth && v.videoHeight) {
          const canvas = document.createElement('canvas');
          canvas.width = v.videoWidth;
          canvas.height = v.videoHeight;
          const ctx = canvas.getContext('2d');
          if (ctx) {
            ctx.drawImage(v, 0, 0, canvas.width, canvas.height);
            setCapturedCoverDataUrl(canvas.toDataURL('image/jpeg', 0.88));
          }
        }
      } catch {
        // Timestamp still saved for server-side FFmpeg extraction
      }
    }
  };

  const handleReset = () => {
    const fresh = createDefaultEdits(totalSec);
    setDraft(fresh);
    setScrubSec(0);
    setCapturedCoverDataUrl(undefined);
    seekWebVideo(0);
  };

  const showVerticalStage =
    draft.reframeMode === 'vertical_crop' ||
    draft.reframeMode === 'vertical_blur' ||
    draft.reframeMode === 'smart_hybrid' ||
    origAspect.orientation === 'vertical';

  const reframeOptions: {
    mode: ReframeMode;
    title: string;
    desc: string;
  }[] = [
    {
      mode: 'original',
      title: `Original (${origAspect.label})`,
      desc: 'Send source dimensions as-is',
    },
    {
      mode: 'smart_hybrid',
      title: 'Smart 16:9 + 9:16',
      desc: '16:9 on YouTube/FB, 9:16 crop on Shorts/Reels/TikTok',
    },
    {
      mode: 'vertical_crop',
      title: '9:16 fill crop',
      desc: 'Full-screen vertical crop everywhere',
    },
    {
      mode: 'vertical_blur',
      title: '9:16 blurred pad',
      desc: 'Full frame centered over soft blur',
    },
  ];

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
          {/* Header */}
          <View
            style={[
              styles.header,
              { borderBottomColor: palette.border },
            ]}
          >
            <View>
              <Text style={[styles.title, { color: palette.text }]}>
                Trim & format video
              </Text>
              <Text style={[styles.subtitle, { color: palette.textSecondary }]}>
                {video.fileName} · Output length {formatDuration(trimmedLen)}
              </Text>
            </View>
            <Pressable onPress={onClose} style={styles.closeBtn}>
              <Ionicons name="close" size={20} color={palette.textSecondary} />
            </Pressable>
          </View>

          <ScrollView contentContainerStyle={styles.bodyScroll}>
            <View style={[styles.columns, isTwoCol && styles.columnsRow]}>
              {/* Left Stage: Live Crop & Scrub Preview */}
              <View
                style={[
                  styles.stagePane,
                  isTwoCol && { width: 244 },
                  {
                    backgroundColor: palette.surfaceSubtle,
                    borderColor: palette.border,
                  },
                ]}
              >
                <View
                  style={[
                    showVerticalStage
                      ? styles.stageFrameVertical
                      : styles.stageFrameWide,
                    { borderColor: palette.borderStrong },
                  ]}
                >
                  {hasRealWebVideo && video.uri ? (
                    draft.reframeMode === 'vertical_blur' ? (
                      <>
                        {React.createElement('video', {
                          src: video.uri,
                          muted: true,
                          playsInline: true,
                          style: {
                            position: 'absolute',
                            top: 0,
                            left: 0,
                            width: '100%',
                            height: '100%',
                            objectFit: 'cover',
                            filter: 'blur(16px) brightness(0.55)',
                            transform: 'scale(1.1)',
                          },
                        })}
                        {React.createElement('video', {
                          ref: (el: HTMLVideoElement | null) => {
                            webVideoRef.current = el;
                          },
                          src: video.uri,
                          muted: true,
                          playsInline: true,
                          style: {
                            width: '100%',
                            height: '100%',
                            objectFit: 'contain',
                            position: 'relative',
                            zIndex: 2,
                          },
                        })}
                      </>
                    ) : (
                      React.createElement('video', {
                        ref: (el: HTMLVideoElement | null) => {
                          webVideoRef.current = el;
                        },
                        src: video.uri,
                        muted: true,
                        playsInline: true,
                        style: {
                          width: '100%',
                          height: '100%',
                          objectFit:
                            draft.reframeMode === 'original'
                              ? 'contain'
                              : 'cover',
                          objectPosition: `${draft.cropFocusX}% 50%`,
                        },
                      })
                    )
                  ) : (
                    /* Clean Architectural Frame Diagram for Sample Clips */
                    <View style={styles.diagramCanvas}>
                      {draft.reframeMode === 'vertical_blur' ? (
                        <View style={styles.blurDiagramOuter}>
                          <Text style={styles.diagramMicro}>Blurred 9:16 fill</Text>
                          <View style={styles.blurDiagramInner}>
                            <Text style={styles.diagramLabel}>16:9 frame</Text>
                          </View>
                          <Text style={styles.diagramMicro}>Blurred 9:16 fill</Text>
                        </View>
                      ) : (draft.reframeMode === 'vertical_crop' ||
                          draft.reframeMode === 'smart_hybrid') &&
                        origAspect.orientation === 'horizontal' ? (
                        <View style={styles.cropDiagramOuter}>
                          <View
                            style={[
                              styles.cropFocusBox,
                              {
                                left: `${Math.min(
                                  62,
                                  Math.max(4, draft.cropFocusX * 0.66)
                                )}%`,
                              },
                            ]}
                          />
                          <Text style={styles.diagramLabel}>
                            9:16 crop ({draft.cropFocusX}%)
                          </Text>
                        </View>
                      ) : (
                        <View style={{ alignItems: 'center', gap: 4 }}>
                          <Ionicons
                            name="videocam-outline"
                            size={22}
                            color="rgba(255,255,255,0.65)"
                          />
                          <Text style={styles.diagramLabel}>
                            {showVerticalStage ? '9:16 frame' : origAspect.label}
                          </Text>
                        </View>
                      )}
                    </View>
                  )}

                  <View style={styles.stageTimePill}>
                    <Text style={styles.stageTimeText}>
                      {formatDuration(scrubSec)}
                    </Text>
                  </View>
                </View>

                {draft.reframeMode === 'smart_hybrid' && (
                  <Text
                    style={[
                      styles.hybridCaption,
                      { color: palette.textSecondary },
                    ]}
                  >
                    Sends 16:9 to YouTube/FB & 9:16 crop to Shorts/Reels/TikTok
                  </Text>
                )}
              </View>

              {/* Right Controls */}
              <View style={styles.controlsCol}>
                {/* 1. TRIM */}
                <View style={styles.sectionBlock}>
                  <View style={styles.sectionTopRow}>
                    <Text style={[styles.sectionLabel, { color: palette.text }]}>
                      Trim clip
                    </Text>
                    <Text
                      style={[
                        styles.sectionValue,
                        { color: palette.textSecondary },
                      ]}
                    >
                      {formatDuration(draft.trimStartSec)} –{' '}
                      {formatDuration(draft.trimEndSec)} ({formatDuration(trimmedLen)})
                    </Text>
                  </View>

                  {/* Visual Trim Range Bar */}
                  <View
                    style={[
                      styles.trimVisualTrack,
                      { backgroundColor: palette.surfaceMuted },
                    ]}
                  >
                    <View
                      style={[
                        styles.trimVisualActive,
                        {
                          left: `${startPct}%`,
                          width: `${widthPct}%`,
                          backgroundColor: palette.text,
                        },
                      ]}
                    />
                  </View>

                  <View style={styles.sliderRow}>
                    <Text
                      style={[styles.sliderTag, { color: palette.textMuted }]}
                    >
                      Start
                    </Text>
                    <View style={{ flex: 1 }}>
                      <TactileScrubBar
                        value={draft.trimStartSec}
                        min={0}
                        max={Math.max(1, draft.trimEndSec - 1)}
                        onChange={updateStart}
                        accentColor={palette.text}
                        trackColor={palette.surfaceMuted}
                      />
                    </View>
                    <Text
                      style={[styles.sliderTime, { color: palette.textSecondary }]}
                    >
                      {formatDuration(draft.trimStartSec)}
                    </Text>
                  </View>

                  <View style={styles.sliderRow}>
                    <Text
                      style={[styles.sliderTag, { color: palette.textMuted }]}
                    >
                      End
                    </Text>
                    <View style={{ flex: 1 }}>
                      <TactileScrubBar
                        value={draft.trimEndSec}
                        min={Math.min(totalSec, draft.trimStartSec + 1)}
                        max={totalSec}
                        onChange={updateEnd}
                        accentColor={palette.text}
                        trackColor={palette.surfaceMuted}
                      />
                    </View>
                    <Text
                      style={[styles.sliderTime, { color: palette.textSecondary }]}
                    >
                      {formatDuration(draft.trimEndSec)}
                    </Text>
                  </View>

                  {totalSec > 90 && (
                    <View style={styles.quickTrimRow}>
                      {totalSec > 180 && (
                        <Pressable
                          onPress={() =>
                            updateEnd(Math.min(totalSec, draft.trimStartSec + 178))
                          }
                          style={[
                            styles.quickTrimBtn,
                            { borderColor: palette.borderStrong },
                          ]}
                        >
                          <Text
                            style={[
                              styles.quickTrimText,
                              { color: palette.textSecondary },
                            ]}
                          >
                            Fit Shorts (2:58)
                          </Text>
                        </Pressable>
                      )}
                      <Pressable
                        onPress={() =>
                          updateEnd(Math.min(totalSec, draft.trimStartSec + 88))
                        }
                        style={[
                          styles.quickTrimBtn,
                          { borderColor: palette.borderStrong },
                        ]}
                      >
                        <Text
                          style={[
                            styles.quickTrimText,
                            { color: palette.textSecondary },
                          ]}
                        >
                          Fit Reels (&lt;90s)
                        </Text>
                      </Pressable>
                    </View>
                  )}
                </View>

                {/* 2. ASPECT / REFRAME */}
                <View
                  style={[
                    styles.sectionBlock,
                    {
                      borderTopWidth: 1,
                      borderTopColor: palette.border,
                      paddingTop: 14,
                    },
                  ]}
                >
                  <Text style={[styles.sectionLabel, { color: palette.text }]}>
                    Aspect ratio & framing
                  </Text>

                  <View style={styles.reframeGrid}>
                    {reframeOptions.map((opt) => {
                      const selected = draft.reframeMode === opt.mode;
                      return (
                        <Pressable
                          key={opt.mode}
                          onPress={() =>
                            setDraft((prev) => ({
                              ...prev,
                              reframeMode: opt.mode,
                            }))
                          }
                          style={[
                            styles.reframeOption,
                            {
                              borderColor: selected
                                ? palette.text
                                : palette.border,
                              backgroundColor: selected
                                ? palette.surfaceSubtle
                                : 'transparent',
                            },
                          ]}
                        >
                          <Text
                            style={[
                              styles.reframeTitle,
                              {
                                color: palette.text,
                                fontWeight: selected ? '600' : '500',
                              },
                            ]}
                          >
                            {opt.title}
                          </Text>
                          <Text
                            style={[
                              styles.reframeDesc,
                              { color: palette.textMuted },
                            ]}
                          >
                            {opt.desc}
                          </Text>
                        </Pressable>
                      );
                    })}
                  </View>

                  {(draft.reframeMode === 'vertical_crop' ||
                    draft.reframeMode === 'smart_hybrid') &&
                    origAspect.orientation === 'horizontal' && (
                      <View style={styles.sliderRow}>
                        <Text
                          style={[
                            styles.sliderTag,
                            { color: palette.textMuted, width: 64 },
                          ]}
                        >
                          Framing
                        </Text>
                        <View style={{ flex: 1 }}>
                          <TactileScrubBar
                            value={draft.cropFocusX}
                            min={0}
                            max={100}
                            onChange={(v) =>
                              setDraft((prev) => ({
                                ...prev,
                                cropFocusX: Math.round(v),
                              }))
                            }
                            accentColor={palette.text}
                            trackColor={palette.surfaceMuted}
                          />
                        </View>
                        <Text
                          style={[
                            styles.sliderTime,
                            { color: palette.textSecondary },
                          ]}
                        >
                          {draft.cropFocusX}%
                        </Text>
                      </View>
                    )}
                </View>

                {/* 3. COVER FRAME SCRUBBER */}
                <View
                  style={[
                    styles.sectionBlock,
                    {
                      borderTopWidth: 1,
                      borderTopColor: palette.border,
                      paddingTop: 14,
                    },
                  ]}
                >
                  <View style={styles.sectionTopRow}>
                    <Text style={[styles.sectionLabel, { color: palette.text }]}>
                      Cover thumbnail
                    </Text>
                    <Text
                      style={[
                        styles.sectionValue,
                        { color: palette.textSecondary },
                      ]}
                    >
                      {typeof draft.coverTimestampSec === 'number'
                        ? `Selected @ ${formatDuration(draft.coverTimestampSec)}`
                        : 'Default first frame'}
                    </Text>
                  </View>

                  <View style={styles.sliderRow}>
                    <Text
                      style={[styles.sliderTag, { color: palette.textMuted }]}
                    >
                      Scrub
                    </Text>
                    <View style={{ flex: 1 }}>
                      <TactileScrubBar
                        value={scrubSec}
                        min={draft.trimStartSec}
                        max={draft.trimEndSec}
                        onChange={(v) => {
                          const rounded = Math.round(v);
                          setScrubSec(rounded);
                          seekWebVideo(rounded);
                        }}
                        accentColor={palette.accent}
                        trackColor={palette.surfaceMuted}
                      />
                    </View>
                    <Text
                      style={[styles.sliderTime, { color: palette.textSecondary }]}
                    >
                      {formatDuration(scrubSec)}
                    </Text>
                  </View>

                  <View style={styles.coverActionsRow}>
                    <Pressable
                      onPress={handleCaptureFrame}
                      style={[
                        styles.useFrameBtn,
                        { borderColor: palette.borderStrong },
                      ]}
                    >
                      <Text
                        style={[styles.useFrameText, { color: palette.text }]}
                      >
                        Use frame at {formatDuration(scrubSec)}
                      </Text>
                    </Pressable>

                    <Pressable onPress={onPickCustomImage}>
                      <Text
                        style={[
                          styles.uploadCoverLink,
                          { color: palette.textSecondary },
                        ]}
                      >
                        Or upload image
                      </Text>
                    </Pressable>
                  </View>
                </View>

                {/* 4. SUBTITLES (.SRT / .VTT BURN-IN) */}
                <View
                  style={[
                    styles.sectionBlock,
                    {
                      borderTopWidth: 1,
                      borderTopColor: palette.border,
                      paddingTop: 14,
                    },
                  ]}
                >
                  <View
                    style={{
                      flexDirection: 'row',
                      alignItems: 'center',
                      justifyContent: 'space-between',
                      flexWrap: 'wrap',
                      gap: 8,
                    }}
                  >
                    <Pressable
                      onPress={() =>
                        setDraft((prev) => ({
                          ...prev,
                          burnSubtitles: !prev.burnSubtitles,
                        }))
                      }
                      style={{
                        flexDirection: 'row',
                        alignItems: 'center',
                        gap: 6,
                      }}
                    >
                      <Ionicons
                        name={
                          draft.burnSubtitles ? 'checkbox' : 'square-outline'
                        }
                        size={16}
                        color={
                          draft.burnSubtitles
                            ? palette.accent
                            : palette.textSecondary
                        }
                      />
                      <Text style={[styles.sectionLabel, { color: palette.text }]}>
                        Burn-in subtitles (.srt / .vtt)
                      </Text>
                    </Pressable>

                    <View style={{ flexDirection: 'row', gap: 10 }}>
                      {Platform.OS === 'web' && (
                        <label
                          style={{
                            cursor: 'pointer',
                            fontSize: 12,
                            fontWeight: 600,
                            color: palette.text,
                            textDecoration: 'underline',
                          }}
                        >
                          Upload .srt/.vtt
                          <input
                            type="file"
                            accept=".srt,.vtt,text/plain,text/vtt"
                            style={{ display: 'none' }}
                            onChange={(e) => {
                              const file = e.target.files?.[0];
                              if (!file) return;
                              const reader = new FileReader();
                              reader.onload = () => {
                                setDraft((prev) => ({
                                  ...prev,
                                  burnSubtitles: true,
                                  subtitleFileName: file.name,
                                  subtitleContent: String(reader.result || ''),
                                }));
                              };
                              reader.readAsText(file);
                              e.target.value = '';
                            }}
                          />
                        </label>
                      )}

                      <Pressable
                        onPress={() =>
                          setDraft((prev) => ({
                            ...prev,
                            burnSubtitles: true,
                            subtitleFileName: 'sample-captions.srt',
                            subtitleContent:
                              '1\n00:00:00,400 --> 00:00:03,200\nSwapped our bulky softbox for a 60W wall bounce.\n\n2\n00:00:03,400 --> 00:00:06,800\nCleaner skin tones and half the studio footprint.',
                          }))
                        }
                      >
                        <Text
                          style={{
                            fontSize: 12,
                            fontWeight: '600',
                            color: palette.textSecondary,
                            textDecorationLine: 'underline',
                          }}
                        >
                          Load sample .srt
                        </Text>
                      </Pressable>
                    </View>
                  </View>

                  {draft.burnSubtitles && (
                    <TextInput
                      multiline
                      style={{
                        minHeight: 82,
                        borderWidth: 1,
                        borderColor: palette.borderStrong,
                        backgroundColor: palette.surfaceSubtle,
                        color: palette.text,
                        borderRadius: 8,
                        padding: 10,
                        fontSize: 12,
                        textAlignVertical: 'top',
                      }}
                      placeholder={
                        '1\n00:00:00,500 --> 00:00:03,000\nPaste .srt or WEBVTT caption cues here…'
                      }
                      placeholderTextColor={palette.textMuted}
                      value={draft.subtitleContent || ''}
                      onChangeText={(val) =>
                        setDraft((prev) => ({
                          ...prev,
                          subtitleContent: val,
                        }))
                      }
                    />
                  )}
                </View>
              </View>
            </View>
          </ScrollView>

          {/* Footer */}
          <View
            style={[
              styles.footer,
              {
                backgroundColor: palette.surfaceSubtle,
                borderTopColor: palette.border,
              },
            ]}
          >
            <Pressable onPress={handleReset}>
              <Text
                style={[styles.resetText, { color: palette.textSecondary }]}
              >
                Reset edits
              </Text>
            </Pressable>

            <View style={styles.footerRight}>
              <Pressable
                onPress={onClose}
                style={[
                  styles.cancelBtn,
                  { borderColor: palette.borderStrong },
                ]}
              >
                <Text
                  style={[styles.cancelText, { color: palette.textSecondary }]}
                >
                  Cancel
                </Text>
              </Pressable>

              <Pressable
                onPress={() => onApply(draft, capturedCoverDataUrl)}
                style={[styles.applyBtn, { backgroundColor: palette.ctaBg }]}
              >
                <Text style={[styles.applyText, { color: palette.ctaText }]}>
                  Apply
                </Text>
              </Pressable>
            </View>
          </View>
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
    maxWidth: 760,
    maxHeight: '92%',
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
  subtitle: {
    fontSize: 12,
    marginTop: 2,
  },
  closeBtn: {
    padding: 4,
  },
  bodyScroll: {
    padding: 20,
  },
  columns: {
    gap: 20,
  },
  columnsRow: {
    flexDirection: 'row',
    alignItems: 'flex-start',
  },
  stagePane: {
    borderRadius: 10,
    borderWidth: 1,
    padding: 14,
    alignItems: 'center',
    justifyContent: 'center',
    gap: 10,
  },
  stageFrameVertical: {
    width: 176,
    height: 312,
    borderRadius: 12,
    backgroundColor: '#191918',
    borderWidth: 1,
    overflow: 'hidden',
    position: 'relative',
    alignItems: 'center',
    justifyContent: 'center',
  },
  stageFrameWide: {
    width: '100%',
    height: 154,
    borderRadius: 10,
    backgroundColor: '#191918',
    borderWidth: 1,
    overflow: 'hidden',
    position: 'relative',
    alignItems: 'center',
    justifyContent: 'center',
  },
  diagramCanvas: {
    width: '100%',
    height: '100%',
    alignItems: 'center',
    justifyContent: 'center',
    padding: 12,
  },
  blurDiagramOuter: {
    width: '100%',
    height: '100%',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingVertical: 20,
    backgroundColor: '#262624',
  },
  blurDiagramInner: {
    width: '100%',
    height: 96,
    backgroundColor: '#141413',
    borderTopWidth: 1,
    borderBottomWidth: 1,
    borderColor: 'rgba(255,255,255,0.22)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  cropDiagramOuter: {
    width: '100%',
    height: 112,
    backgroundColor: '#292926',
    borderRadius: 6,
    position: 'relative',
    alignItems: 'center',
    justifyContent: 'center',
    overflow: 'hidden',
  },
  cropFocusBox: {
    position: 'absolute',
    top: 0,
    bottom: 0,
    width: '34%',
    borderWidth: 1.5,
    borderColor: '#F2F0EB',
    backgroundColor: 'rgba(255,255,255,0.08)',
  },
  diagramLabel: {
    color: 'rgba(255,255,255,0.85)',
    fontSize: 11.5,
    fontWeight: '500',
  },
  diagramMicro: {
    color: 'rgba(255,255,255,0.38)',
    fontSize: 10,
  },
  stageTimePill: {
    position: 'absolute',
    bottom: 8,
    right: 8,
    backgroundColor: 'rgba(0,0,0,0.72)',
    paddingHorizontal: 6,
    paddingVertical: 2,
    borderRadius: 4,
    zIndex: 4,
  },
  stageTimeText: {
    color: '#FFF',
    fontSize: 10.5,
    fontWeight: '600',
  },
  hybridCaption: {
    fontSize: 11.5,
    textAlign: 'center',
    lineHeight: 16,
  },
  controlsCol: {
    flex: 1,
    gap: 14,
  },
  sectionBlock: {
    gap: 9,
  },
  sectionTopRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    gap: 8,
  },
  sectionLabel: {
    fontSize: 13.5,
    fontWeight: '600',
  },
  sectionValue: {
    fontSize: 12,
  },
  trimVisualTrack: {
    height: 8,
    borderRadius: 4,
    position: 'relative',
    overflow: 'hidden',
  },
  trimVisualActive: {
    position: 'absolute',
    top: 0,
    bottom: 0,
    borderRadius: 4,
  },
  sliderRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
  },
  sliderTag: {
    fontSize: 12,
    width: 40,
  },
  sliderTime: {
    fontSize: 12,
    width: 40,
    textAlign: 'right',
  },
  nativeTrack: {
    height: 10,
    borderRadius: 5,
    overflow: 'hidden',
  },
  nativeFill: {
    height: '100%',
  },
  quickTrimRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 8,
  },
  quickTrimBtn: {
    borderWidth: 1,
    borderRadius: 6,
    paddingHorizontal: 9,
    paddingVertical: 4,
  },
  quickTrimText: {
    fontSize: 11.5,
    fontWeight: '500',
  },
  reframeGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 8,
  },
  reframeOption: {
    width: '48%',
    flexGrow: 1,
    minWidth: 155,
    borderWidth: 1,
    borderRadius: 8,
    padding: 10,
    gap: 2,
  },
  reframeTitle: {
    fontSize: 12.5,
  },
  reframeDesc: {
    fontSize: 11,
    lineHeight: 15,
  },
  coverActionsRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    paddingTop: 2,
  },
  useFrameBtn: {
    borderWidth: 1,
    borderRadius: 7,
    paddingHorizontal: 11,
    paddingVertical: 6,
  },
  useFrameText: {
    fontSize: 12,
    fontWeight: '600',
  },
  uploadCoverLink: {
    fontSize: 12,
    textDecorationLine: 'underline',
  },
  footer: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 20,
    paddingVertical: 12,
    borderTopWidth: 1,
  },
  resetText: {
    fontSize: 12.5,
    textDecorationLine: 'underline',
  },
  footerRight: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  cancelBtn: {
    borderWidth: 1,
    borderRadius: 7,
    paddingHorizontal: 13,
    paddingVertical: 8,
  },
  cancelText: {
    fontSize: 13,
    fontWeight: '500',
  },
  applyBtn: {
    borderRadius: 7,
    paddingHorizontal: 18,
    paddingVertical: 8,
  },
  applyText: {
    fontSize: 13,
    fontWeight: '600',
  },
});
