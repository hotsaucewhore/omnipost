import { Ionicons } from '@expo/vector-icons';
import * as ImagePicker from 'expo-image-picker';
import { useRouter } from 'expo-router';
import React, { useMemo, useRef, useState } from 'react';
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
  BatchCadencePreset,
  computeBatchSlotIsos,
  formatScheduleLabel,
  mergeHashtagStrings,
  PhotoAssetMeta,
  PLATFORM_ORDER,
  PLATFORM_SPECS,
  PostKind,
  recommendPlatformsForPost,
  VideoAssetMeta,
} from '../../shared/platforms';
import { PLATFORM_ICONS } from '../constants/theme';
import { useOmniPost } from '../context/OmniPostContext';
import { importRssFeedApi } from '../lib/api';

interface DraftBatchRow {
  localId: string;
  postKind: PostKind;
  title: string;
  caption: string;
  hashtags: string;
  firstComment: string;
  videoMeta?: VideoAssetMeta | null;
  photosMeta?: PhotoAssetMeta[];
  webFile?: File;
}

const CADENCE_OPTIONS: { id: BatchCadencePreset; label: string }[] = [
  { id: 'weekdays', label: 'Weekdays (M–F)' },
  { id: 'mwf', label: '3x / wk (M·W·F)' },
  { id: 'daily', label: 'Daily' },
  { id: 'twice_daily', label: '2x / day' },
];

const TIME_WINDOWS: { label: string; hour: number; minute: number }[] = [
  { label: '9:30 AM', hour: 9, minute: 30 },
  { label: '12:15 PM', hour: 12, minute: 15 },
  { label: '6:00 PM', hour: 18, minute: 0 },
];

function cleanCaptionFromFileName(fileName: string): string {
  const base = fileName.replace(/\.[^.]+$/, '');
  const spaced = base.replace(/[_-]+/g, ' ').replace(/\s+/g, ' ').trim();
  if (!spaced) return 'Behind-the-scenes update from the studio.';
  return spaced.charAt(0).toUpperCase() + spaced.slice(1);
}

function buildTomorrowIso(): string {
  const d = new Date();
  d.setDate(d.getDate() + 1);
  d.setHours(9, 30, 0, 0);
  return d.toISOString();
}

function buildNextMondayIso(): string {
  const d = new Date();
  const dow = d.getDay();
  const daysUntilMon = dow === 0 ? 1 : 8 - dow;
  d.setDate(d.getDate() + daysUntilMon);
  d.setHours(9, 30, 0, 0);
  return d.toISOString();
}

function toDateInputString(iso: string): string {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return '';
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(
    2,
    '0'
  )}-${String(d.getDate()).padStart(2, '0')}`;
}

function buildSampleWeeklyRows(): DraftBatchRow[] {
  const stamp = Date.now();
  return [
    {
      localId: `samp_${stamp}_1`,
      postKind: 'video',
      title: '60-second lighting breakdown',
      caption:
        'Why moving the key light 30 degrees higher immediately cleaned up glasses glare on camera.',
      hashtags: 'creatorstudio lighting filmmaking',
      firstComment: 'Lighting diagram + stands -> https://studio.example.com/key-light',
      videoMeta: {
        fileName: 'mon-keylight-tip.mp4',
        mimeType: 'video/mp4',
        fileSizeBytes: 14_200_000,
        width: 1080,
        height: 1920,
        durationSec: 46,
        isSamplePreset: true,
      },
    },
    {
      localId: `samp_${stamp}_2`,
      postKind: 'photo',
      title: '',
      caption:
        'Four desk changes that cut cable clutter in half before client shoot days.',
      hashtags: 'desksetup studio behindthescenes',
      firstComment: '',
      photosMeta: Array.from({ length: 4 }, (_, i) => ({
        id: `samp_ph_${stamp}_${i}`,
        fileName: `desk_0${i + 1}.jpg`,
        mimeType: 'image/jpeg',
        width: 1080,
        height: 1350,
        isSamplePreset: true,
        sampleTint: ['#303633', '#423931', '#2D3A45', '#3A3138'][i],
        sampleLabel: `0${i + 1} · Desk View`,
      })),
    },
    {
      localId: `samp_${stamp}_3`,
      postKind: 'text',
      title: '',
      caption:
        'Writing every caption in one sitting on Monday morning makes the whole week’s tone feel cohesive instead of rushed.',
      hashtags: 'contentstrategy creatorworkflow',
      firstComment: 'Weekly editorial template -> https://studio.example.com/template',
    },
    {
      localId: `samp_${stamp}_4`,
      postKind: 'video',
      title: 'Color grade before vs after',
      caption:
        'Subtle halation + warm midtones on a neutral log profile — zero heavy LUT artifacts.',
      hashtags: 'colorgrading videoediting',
      firstComment: '',
      videoMeta: {
        fileName: 'thu-color-pass.mp4',
        mimeType: 'video/mp4',
        fileSizeBytes: 18_400_000,
        width: 1080,
        height: 1920,
        durationSec: 34,
        isSamplePreset: true,
      },
    },
    {
      localId: `samp_${stamp}_5`,
      postKind: 'text',
      title: '',
      caption:
        'Friday wrap-up: shipped 5 shoots, trimmed turnaround time by a full day, and queued next week’s lineup before 4 PM.',
      hashtags: 'buildinpublic agency',
      firstComment: '',
    },
  ];
}

export function BatchSchedulerModal() {
  const router = useRouter();
  const {
    palette,
    activeWorkspace,
    accounts,
    presets,
    effectiveRole,
    batchModalOpen,
    closeBatchModal,
    createBatchJobs,
    setPreferredPostsFilter,
  } = useOmniPost();

  const fileInputRef = useRef<HTMLInputElement | null>(null);

  const [rows, setRows] = useState<DraftBatchRow[]>(() =>
    buildSampleWeeklyRows().slice(0, 3)
  );
  const [startIso, setStartIso] = useState<string>(() => buildTomorrowIso());
  const [cadence, setCadence] = useState<BatchCadencePreset>('weekdays');
  const [windowIndex, setWindowIndex] = useState<number>(0);
  const [holdForApproval, setHoldForApproval] = useState<boolean>(false);

  const [scriptDrawerOpen, setScriptDrawerOpen] = useState(false);
  const [rawScript, setRawScript] = useState('');
  const [rssDrawerOpen, setRssDrawerOpen] = useState(false);
  const [rssUrl, setRssUrl] = useState('');
  const [importingRss, setImportingRss] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);

  const chosenWindow = TIME_WINDOWS[windowIndex] ?? TIME_WINDOWS[0];
  const effectiveHold =
    Boolean(activeWorkspace.requireApproval) ||
    effectiveRole === 'editor' ||
    holdForApproval;

  const linkedGroups = useMemo(
    () => new Set(accounts.map((a) => a.platformGroup)),
    [accounts]
  );

  const computedSlots = useMemo(
    () =>
      computeBatchSlotIsos(
        startIso,
        rows.length,
        cadence,
        chosenWindow.hour,
        chosenWindow.minute
      ),
    [startIso, rows.length, cadence, chosenWindow.hour, chosenWindow.minute]
  );

  const previewPlatformsForRow = (row: DraftBatchRow) => {
    const rec = recommendPlatformsForPost(
      row.videoMeta ?? null,
      row.photosMeta
    );
    return PLATFORM_ORDER.filter(
      (pid) =>
        rec[pid] &&
        (linkedGroups.size === 0 ||
          linkedGroups.has(PLATFORM_SPECS[pid].accountGroup))
    );
  };

  const handleWebFilesPicked = (files: FileList | null) => {
    if (!files || files.length === 0) return;
    const added: DraftBatchRow[] = [];
    Array.from(files).forEach((file, idx) => {
      const isVid = file.type.startsWith('video/');
      const isImg = file.type.startsWith('image/');
      if (!isVid && !isImg) return;
      const caption = cleanCaptionFromFileName(file.name);
      added.push({
        localId: `file_${Date.now()}_${idx}`,
        postKind: isVid ? 'video' : 'photo',
        title: isVid ? caption.slice(0, 70) : '',
        caption,
        hashtags: '',
        firstComment: '',
        webFile: file,
        videoMeta: isVid
          ? {
              fileName: file.name,
              mimeType: file.type || 'video/mp4',
              fileSizeBytes: file.size,
              width: 1080,
              height: 1920,
              durationSec: 30,
            }
          : null,
        photosMeta: isImg
          ? [
              {
                id: `ph_web_${Date.now()}_${idx}`,
                fileName: file.name,
                mimeType: file.type || 'image/jpeg',
                fileSizeBytes: file.size,
                width: 1080,
                height: 1350,
              },
            ]
          : undefined,
      });
    });
    if (added.length > 0) {
      setRows((prev) => [...prev, ...added]);
    }
  };

  const handlePickMedia = async () => {
    if (Platform.OS === 'web') {
      fileInputRef.current?.click();
      return;
    }
    const result = await ImagePicker.launchImageLibraryAsync({
      mediaTypes: ['images', 'videos'],
      allowsMultipleSelection: true,
      quality: 0.9,
    });
    if (result.canceled || !result.assets.length) return;
    const added: DraftBatchRow[] = result.assets.map((asset, idx) => {
      const isVid = asset.type === 'video';
      const fname = asset.fileName || `media_${idx + 1}.${isVid ? 'mp4' : 'jpg'}`;
      const caption = cleanCaptionFromFileName(fname);
      return {
        localId: `nat_${Date.now()}_${idx}`,
        postKind: isVid ? 'video' : 'photo',
        title: isVid ? caption.slice(0, 70) : '',
        caption,
        hashtags: '',
        firstComment: '',
        videoMeta: isVid
          ? {
              fileName: fname,
              mimeType: asset.mimeType || 'video/mp4',
              fileSizeBytes: asset.fileSize || 0,
              width: asset.width || 1080,
              height: asset.height || 1920,
              durationSec: asset.duration ? Math.round(asset.duration / 1000) : 30,
              isSamplePreset: true,
            }
          : null,
        photosMeta: !isVid
          ? [
              {
                id: `ph_nat_${Date.now()}_${idx}`,
                fileName: fname,
                mimeType: asset.mimeType || 'image/jpeg',
                fileSizeBytes: asset.fileSize,
                width: asset.width || 1080,
                height: asset.height || 1350,
                isSamplePreset: true,
              },
            ]
          : undefined,
      };
    });
    setRows((prev) => [...prev, ...added]);
  };

  const handleSplitScript = () => {
    const blocks = rawScript
      .split(/\n\s*---+\s*\n|\n\s*\n\s*\n/)
      .map((b) => b.trim())
      .filter(Boolean);
    if (blocks.length === 0) return;

    const added: DraftBatchRow[] = blocks.map((text, idx) => ({
      localId: `txt_${Date.now()}_${idx}`,
      postKind: 'text',
      title: '',
      caption: text,
      hashtags: '',
      firstComment: '',
    }));
    setRows((prev) => [...prev, ...added]);
    setRawScript('');
    setScriptDrawerOpen(false);
  };

  const handleApplyPresetToAll = (presetId: string) => {
    const preset = presets.find((p) => p.id === presetId);
    if (!preset) return;
    setRows((prev) =>
      prev.map((r) => ({
        ...r,
        hashtags: preset.hashtags
          ? mergeHashtagStrings(r.hashtags, preset.hashtags)
          : r.hashtags,
        firstComment: preset.firstComment || r.firstComment,
      }))
    );
  };

  const updateRowField = (
    localId: string,
    field: 'caption' | 'hashtags' | 'title',
    value: string
  ) => {
    setRows((prev) =>
      prev.map((r) => (r.localId === localId ? { ...r, [field]: value } : r))
    );
  };

  const removeRow = (localId: string) => {
    setRows((prev) => prev.filter((r) => r.localId !== localId));
  };

  const addBlankTextRow = () => {
    setRows((prev) => [
      ...prev,
      {
        localId: `blank_${Date.now()}`,
        postKind: 'text',
        title: '',
        caption: '',
        hashtags: '',
        firstComment: '',
      },
    ]);
  };

  const handleSubmitBatch = async (targetLifecycle: 'scheduled' | 'draft') => {
    const validRows = rows.filter(
      (r) => r.postKind !== 'text' || r.caption.trim().length > 0
    );
    if (validRows.length === 0 || submitting) {
      setErrorMsg('Write at least one caption or attach media files first.');
      return;
    }

    setErrorMsg(null);
    setSubmitting(true);
    try {
      const slotIsos = computeBatchSlotIsos(
        startIso,
        validRows.length,
        cadence,
        chosenWindow.hour,
        chosenWindow.minute
      );

      const created = await createBatchJobs({
        lifecycle: targetLifecycle,
        holdForApproval: effectiveHold,
        items: validRows.map((r, idx) => ({
          title: r.title,
          caption: r.caption,
          hashtags: r.hashtags,
          firstComment: r.firstComment || undefined,
          scheduledAt:
            targetLifecycle === 'scheduled' ? slotIsos[idx] : undefined,
          lifecycle: targetLifecycle,
          videoMeta: r.videoMeta,
          photosMeta: r.photosMeta,
          webFile: r.webFile,
        })),
      });

      if (created && created.length > 0) {
        closeBatchModal();
        setPreferredPostsFilter(
          targetLifecycle === 'draft' ? 'drafts' : 'calendar'
        );
        router.push('/history');
      }
    } catch (err: any) {
      setErrorMsg(err?.message || 'Batch schedule failed.');
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <Modal
      visible={batchModalOpen}
      transparent
      animationType="fade"
      onRequestClose={closeBatchModal}
    >
      <View style={styles.backdrop}>
        {Platform.OS === 'web' && (
          <input
            ref={fileInputRef}
            type="file"
            multiple
            accept="video/*,image/*"
            style={{ display: 'none' }}
            onChange={(e) => {
              handleWebFilesPicked(e.target.files);
              e.target.value = '';
            }}
          />
        )}

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
              <Text style={[styles.title, { color: palette.text }]}>
                Bulk batch scheduler · {activeWorkspace.name}
              </Text>
              <Text style={[styles.sub, { color: palette.textSecondary }]}>
                Drop multiple clips, photos, or text posts and auto-distribute across your weekly calendar
              </Text>
            </View>
            <Pressable onPress={closeBatchModal} style={{ padding: 4 }}>
              <Ionicons name="close" size={20} color={palette.textSecondary} />
            </Pressable>
          </View>

          <ScrollView style={{ maxHeight: 530 }}>
            <View style={styles.body}>
              {/* Source Toolbar */}
              <View style={styles.sourceToolbar}>
                <Pressable
                  onPress={() => void handlePickMedia()}
                  style={[
                    styles.toolBtn,
                    {
                      backgroundColor: palette.surfaceSubtle,
                      borderColor: palette.borderStrong,
                    },
                  ]}
                >
                  <Ionicons
                    name="folder-open-outline"
                    size={14}
                    color={palette.text}
                  />
                  <Text style={[styles.toolBtnText, { color: palette.text }]}>
                    Pick videos / photos
                  </Text>
                </Pressable>

                <Pressable
                  onPress={() => setScriptDrawerOpen((s) => !s)}
                  style={[
                    styles.toolBtn,
                    {
                      backgroundColor: scriptDrawerOpen
                        ? palette.surfaceMuted
                        : palette.surfaceSubtle,
                      borderColor: palette.border,
                    },
                  ]}
                >
                  <Ionicons
                    name="document-text-outline"
                    size={14}
                    color={palette.textSecondary}
                  />
                  <Text style={[styles.toolBtnText, { color: palette.text }]}>
                    Paste multi-post script
                  </Text>
                </Pressable>

                <Pressable
                  onPress={() => setRssDrawerOpen((s) => !s)}
                  style={[
                    styles.toolBtn,
                    {
                      backgroundColor: rssDrawerOpen
                        ? palette.surfaceMuted
                        : palette.surfaceSubtle,
                      borderColor: palette.border,
                    },
                  ]}
                >
                  <Ionicons
                    name="logo-rss"
                    size={13}
                    color={palette.textSecondary}
                  />
                  <Text style={[styles.toolBtnText, { color: palette.text }]}>
                    Import RSS feed
                  </Text>
                </Pressable>

                <Pressable
                  onPress={addBlankTextRow}
                  style={[
                    styles.toolBtn,
                    {
                      backgroundColor: palette.surfaceSubtle,
                      borderColor: palette.border,
                    },
                  ]}
                >
                  <Text style={[styles.toolBtnText, { color: palette.text }]}>
                    + Blank row
                  </Text>
                </Pressable>

                <Pressable
                  onPress={() => setRows(buildSampleWeeklyRows())}
                  style={[
                    styles.toolBtn,
                    {
                      backgroundColor: palette.surface,
                      borderColor: palette.border,
                    },
                  ]}
                >
                  <Text
                    style={[
                      styles.toolBtnText,
                      { color: palette.textSecondary },
                    ]}
                  >
                    Load 5-post weekly mix
                  </Text>
                </Pressable>
              </View>

              {/* Collapsible Multi-Post Script Splitter */}
              {rssDrawerOpen && (
                <View
                  style={[
                    styles.scriptBox,
                    {
                      borderColor: palette.border,
                      backgroundColor: palette.surfaceSubtle,
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
                        fontSize: 12,
                        fontWeight: '600',
                        color: palette.textSecondary,
                      }}
                    >
                      Paste RSS / Substack / YouTube feed URL
                    </Text>
                    <Pressable
                      onPress={() =>
                        setRssUrl('https://studio.example.com/feed.xml')
                      }
                    >
                      <Text
                        style={{
                          fontSize: 11.5,
                          color: palette.text,
                          textDecorationLine: 'underline',
                        }}
                      >
                        Try sample RSS feed
                      </Text>
                    </Pressable>
                  </View>

                  <View style={{ flexDirection: 'row', gap: 8 }}>
                    <TextInput
                      style={{
                        flex: 1,
                        borderWidth: 1,
                        borderColor: palette.borderStrong,
                        backgroundColor: palette.surface,
                        color: palette.text,
                        borderRadius: 7,
                        paddingHorizontal: 10,
                        paddingVertical: 7,
                        fontSize: 13,
                      }}
                      autoCapitalize="none"
                      placeholder="https://newsletter.substack.com/feed"
                      placeholderTextColor={palette.textMuted}
                      value={rssUrl}
                      onChangeText={setRssUrl}
                    />
                    <Pressable
                      disabled={!rssUrl.trim() || importingRss}
                      onPress={async () => {
                        setImportingRss(true);
                        setErrorMsg(null);
                        try {
                          const feed = await importRssFeedApi(rssUrl.trim());
                          const importedRows: DraftBatchRow[] = feed.items.map(
                            (it, i) => ({
                              localId: `rss_${Date.now()}_${i}`,
                              postKind: 'text',
                              title: it.title,
                              caption: it.suggestedCaption,
                              hashtags: '',
                              firstComment: it.suggestedFirstComment,
                            })
                          );
                          setRows((prev) => [...prev, ...importedRows]);
                          setRssDrawerOpen(false);
                          setRssUrl('');
                        } catch (err: any) {
                          setErrorMsg(
                            err?.message || 'Could not import RSS feed.'
                          );
                        } finally {
                          setImportingRss(false);
                        }
                      }}
                      style={[
                        styles.smallChip,
                        {
                          backgroundColor: rssUrl.trim()
                            ? palette.ctaBg
                            : palette.ctaDisabledBg,
                          borderColor: 'transparent',
                          justifyContent: 'center',
                        },
                      ]}
                    >
                      <Text
                        style={{
                          fontSize: 12,
                          fontWeight: '600',
                          color: rssUrl.trim()
                            ? palette.ctaText
                            : palette.ctaDisabledText,
                        }}
                      >
                        {importingRss ? 'Importing…' : 'Pull articles'}
                      </Text>
                    </Pressable>
                  </View>
                </View>
              )}
              {scriptDrawerOpen && (
                <View
                  style={[
                    styles.scriptBox,
                    {
                      borderColor: palette.border,
                      backgroundColor: palette.surfaceSubtle,
                    },
                  ]}
                >
                  <Text
                    style={{
                      fontSize: 12,
                      fontWeight: '600',
                      color: palette.textSecondary,
                    }}
                  >
                    Paste multiple captions separated by --- on its own line
                  </Text>
                  <TextInput
                    multiline
                    style={[
                      styles.scriptInput,
                      {
                        color: palette.text,
                        backgroundColor: palette.surface,
                        borderColor: palette.borderStrong,
                      },
                    ]}
                    placeholder={
                      'Monday post: 3 lessons from cutting our studio setup in half.\n---\nWednesday post: Full audio chain walkthrough drops tomorrow.\n---\nFriday post: Open Q&A in the replies.'
                    }
                    placeholderTextColor={palette.textMuted}
                    value={rawScript}
                    onChangeText={setRawScript}
                  />
                  <View
                    style={{
                      flexDirection: 'row',
                      justifyContent: 'flex-end',
                      gap: 8,
                    }}
                  >
                    <Pressable
                      onPress={() => setScriptDrawerOpen(false)}
                      style={[
                        styles.smallChip,
                        { borderColor: palette.border },
                      ]}
                    >
                      <Text
                        style={{ fontSize: 12, color: palette.textSecondary }}
                      >
                        Cancel
                      </Text>
                    </Pressable>
                    <Pressable
                      disabled={!rawScript.trim()}
                      onPress={handleSplitScript}
                      style={[
                        styles.smallChip,
                        {
                          backgroundColor: rawScript.trim()
                            ? palette.ctaBg
                            : palette.ctaDisabledBg,
                          borderColor: 'transparent',
                        },
                      ]}
                    >
                      <Text
                        style={{
                          fontSize: 12,
                          fontWeight: '600',
                          color: rawScript.trim()
                            ? palette.ctaText
                            : palette.ctaDisabledText,
                        }}
                      >
                        Split into batch rows
                      </Text>
                    </Pressable>
                  </View>
                </View>
              )}

              {/* Auto-Cadence Distributor Controls */}
              <View
                style={[
                  styles.cadenceCard,
                  {
                    backgroundColor: palette.surfaceSubtle,
                    borderColor: palette.border,
                  },
                ]}
              >
                <View style={styles.cadenceGroup}>
                  <Text
                    style={[styles.cadenceLabel, { color: palette.textSecondary }]}
                  >
                    Start
                  </Text>
                  <View style={styles.chipsRow}>
                    <Pressable
                      onPress={() => setStartIso(buildTomorrowIso())}
                      style={[
                        styles.smallChip,
                        {
                          backgroundColor: palette.surface,
                          borderColor: palette.border,
                        },
                      ]}
                    >
                      <Text style={{ fontSize: 11.5, color: palette.text }}>
                        Tomorrow
                      </Text>
                    </Pressable>
                    <Pressable
                      onPress={() => setStartIso(buildNextMondayIso())}
                      style={[
                        styles.smallChip,
                        {
                          backgroundColor: palette.surface,
                          borderColor: palette.border,
                        },
                      ]}
                    >
                      <Text style={{ fontSize: 11.5, color: palette.text }}>
                        Next Monday
                      </Text>
                    </Pressable>
                    {Platform.OS === 'web' && (
                      <input
                        type="date"
                        value={toDateInputString(startIso)}
                        onChange={(e) => {
                          if (!e.target.value) return;
                          const [y, m, d] = e.target.value
                            .split('-')
                            .map(Number);
                          const next = new Date(
                            y,
                            (m || 1) - 1,
                            d || 1,
                            chosenWindow.hour,
                            chosenWindow.minute
                          );
                          if (!Number.isNaN(next.getTime())) {
                            setStartIso(next.toISOString());
                          }
                        }}
                        style={{
                          padding: '4px 8px',
                          borderRadius: 6,
                          border: `1px solid ${palette.border}`,
                          backgroundColor: palette.surface,
                          color: palette.text,
                          fontSize: 11.5,
                        }}
                      />
                    )}
                  </View>
                </View>

                <View style={styles.cadenceGroup}>
                  <Text
                    style={[styles.cadenceLabel, { color: palette.textSecondary }]}
                  >
                    Cadence
                  </Text>
                  <View style={styles.chipsRow}>
                    {CADENCE_OPTIONS.map((opt) => {
                      const active = cadence === opt.id;
                      return (
                        <Pressable
                          key={opt.id}
                          onPress={() => setCadence(opt.id)}
                          style={[
                            styles.smallChip,
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
                              fontSize: 11.5,
                              fontWeight: active ? '600' : '500',
                              color: active ? palette.ctaText : palette.text,
                            }}
                          >
                            {opt.label}
                          </Text>
                        </Pressable>
                      );
                    })}
                  </View>
                </View>

                <View style={styles.cadenceBottomRow}>
                  <View style={styles.cadenceGroup}>
                    <Text
                      style={[
                        styles.cadenceLabel,
                        { color: palette.textSecondary },
                      ]}
                    >
                      Best-time slot
                    </Text>
                    <View style={styles.chipsRow}>
                      {TIME_WINDOWS.map((w, idx) => {
                        const active = windowIndex === idx;
                        return (
                          <Pressable
                            key={w.label}
                            onPress={() => setWindowIndex(idx)}
                            style={[
                              styles.smallChip,
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
                                fontSize: 11.5,
                                fontWeight: active ? '600' : '500',
                                color: active ? palette.ctaText : palette.text,
                              }}
                            >
                              {w.label}
                            </Text>
                          </Pressable>
                        );
                      })}
                    </View>
                  </View>

                  <Pressable
                    disabled={
                      Boolean(activeWorkspace.requireApproval) ||
                      effectiveRole === 'editor'
                    }
                    onPress={() => setHoldForApproval((h) => !h)}
                    style={styles.holdCheckRow}
                  >
                    <Ionicons
                      name={effectiveHold ? 'checkbox' : 'square-outline'}
                      size={16}
                      color={
                        effectiveHold ? palette.text : palette.textSecondary
                      }
                    />
                    <Text
                      style={{
                        fontSize: 12,
                        color: palette.textSecondary,
                        fontWeight: effectiveHold ? '600' : '400',
                      }}
                    >
                      Hold batch for approval
                    </Text>
                  </Pressable>
                </View>

                {presets.length > 0 && (
                  <View style={styles.presetStampRow}>
                    <Text
                      style={{ fontSize: 11.5, color: palette.textMuted }}
                    >
                      Stamp preset across all {rows.length} posts:
                    </Text>
                    {presets.slice(0, 3).map((p) => (
                      <Pressable
                        key={p.id}
                        onPress={() => handleApplyPresetToAll(p.id)}
                        style={[
                          styles.presetPill,
                          {
                            borderColor: palette.border,
                            backgroundColor: palette.surface,
                          },
                        ]}
                      >
                        <Text
                          style={{
                            fontSize: 11,
                            fontWeight: '600',
                            color: palette.textSecondary,
                          }}
                        >
                          + {p.name}
                        </Text>
                      </Pressable>
                    ))}
                  </View>
                )}
              </View>

              {/* Batch Rows List */}
              <View style={{ gap: 8 }}>
                <View style={styles.listHeaderRow}>
                  <Text
                    style={{
                      fontSize: 12,
                      fontWeight: '600',
                      color: palette.textSecondary,
                    }}
                  >
                    Scheduled lineup ({rows.length}{' '}
                    {rows.length === 1 ? 'post' : 'posts'})
                  </Text>
                  {rows.length > 0 && (
                    <Pressable onPress={() => setRows([])}>
                      <Text
                        style={{
                          fontSize: 11.5,
                          color: palette.textMuted,
                          textDecorationLine: 'underline',
                        }}
                      >
                        Clear list
                      </Text>
                    </Pressable>
                  )}
                </View>

                {rows.length === 0 ? (
                  <View
                    style={[
                      styles.emptyBox,
                      {
                        borderColor: palette.border,
                        backgroundColor: palette.surfaceSubtle,
                      },
                    ]}
                  >
                    <Text
                      style={{
                        fontSize: 13,
                        color: palette.textSecondary,
                        textAlign: 'center',
                      }}
                    >
                      Pick video/photo files, paste a script separated by ---, or click “Load 5-post weekly mix”.
                    </Text>
                  </View>
                ) : (
                  rows.map((row, idx) => {
                    const slotIso = computedSlots[idx];
                    const targets = previewPlatformsForRow(row);
                    return (
                      <View
                        key={row.localId}
                        style={[
                          styles.batchRowCard,
                          {
                            borderColor: palette.border,
                            backgroundColor: palette.surface,
                          },
                        ]}
                      >
                        <View style={styles.batchRowTop}>
                          <View style={styles.slotIndexGroup}>
                            <Text
                              style={{
                                fontSize: 11.5,
                                fontWeight: '700',
                                color: palette.accent,
                              }}
                            >
                              #{String(idx + 1).padStart(2, '0')}
                            </Text>
                            <Text
                              style={{
                                fontSize: 12.5,
                                fontWeight: '600',
                                color: palette.text,
                              }}
                            >
                              {formatScheduleLabel(slotIso)}
                            </Text>
                            <View
                              style={[
                                styles.kindTag,
                                {
                                  backgroundColor: palette.surfaceSubtle,
                                  borderColor: palette.border,
                                },
                              ]}
                            >
                              <Text
                                style={{
                                  fontSize: 10.5,
                                  fontWeight: '600',
                                  color: palette.textSecondary,
                                }}
                              >
                                {row.postKind === 'video'
                                  ? `Video · ${row.videoMeta?.fileName ?? 'clip.mp4'}`
                                  : row.postKind === 'photo'
                                  ? `${row.photosMeta?.length ?? 1}-photo post`
                                  : 'Text'}
                              </Text>
                            </View>
                          </View>

                          <View style={styles.rowRightMeta}>
                            <View style={styles.destIconsRow}>
                              {targets.map((pid) => (
                                <Ionicons
                                  key={pid}
                                  name={PLATFORM_ICONS[pid] as any}
                                  size={13}
                                  color={palette.textSecondary}
                                />
                              ))}
                            </View>
                            <Pressable
                              onPress={() => removeRow(row.localId)}
                              style={{ padding: 3 }}
                            >
                              <Ionicons
                                name="close"
                                size={16}
                                color={palette.textMuted}
                              />
                            </Pressable>
                          </View>
                        </View>

                        <TextInput
                          multiline
                          style={[
                            styles.rowCaptionInput,
                            {
                              color: palette.text,
                              backgroundColor: palette.surfaceSubtle,
                              borderColor: palette.border,
                            },
                          ]}
                          placeholder="Write caption for this slot…"
                          placeholderTextColor={palette.textMuted}
                          value={row.caption}
                          onChangeText={(v) =>
                            updateRowField(row.localId, 'caption', v)
                          }
                        />

                        <TextInput
                          style={[
                            styles.rowTagsInput,
                            {
                              color: palette.textSecondary,
                              borderColor: palette.border,
                            },
                          ]}
                          placeholder="Hashtags (optional, space-separated)"
                          placeholderTextColor={palette.textMuted}
                          value={row.hashtags}
                          onChangeText={(v) =>
                            updateRowField(row.localId, 'hashtags', v)
                          }
                        />
                      </View>
                    );
                  })
                )}
              </View>

              {errorMsg && (
                <Text style={{ fontSize: 12.5, color: palette.danger }}>
                  {errorMsg}
                </Text>
              )}
            </View>
          </ScrollView>

          {/* Footer */}
          <View
            style={[
              styles.footer,
              {
                borderTopColor: palette.border,
                backgroundColor: palette.surface,
              },
            ]}
          >
            <Pressable
              disabled={rows.length === 0 || submitting}
              onPress={() => void handleSubmitBatch('draft')}
              style={[
                styles.secondaryBtn,
                {
                  borderColor: palette.borderStrong,
                  opacity: rows.length === 0 || submitting ? 0.5 : 1,
                },
              ]}
            >
              <Text style={[styles.secondaryBtnText, { color: palette.text }]}>
                Save {rows.length} as drafts
              </Text>
            </Pressable>

            <Pressable
              disabled={rows.length === 0 || submitting}
              onPress={() => void handleSubmitBatch('scheduled')}
              style={[
                styles.primaryBtn,
                {
                  backgroundColor:
                    rows.length > 0 ? palette.ctaBg : palette.ctaDisabledBg,
                },
              ]}
            >
              <Text
                style={[
                  styles.primaryBtnText,
                  {
                    color:
                      rows.length > 0
                        ? palette.ctaText
                        : palette.ctaDisabledText,
                  },
                ]}
              >
                {submitting
                  ? 'Scheduling…'
                  : effectiveHold
                  ? `Queue ${rows.length} for approval`
                  : `Schedule ${rows.length} to calendar`}
              </Text>
            </Pressable>
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
    maxWidth: 720,
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
  body: {
    padding: 18,
    gap: 14,
  },
  sourceToolbar: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 8,
  },
  toolBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    paddingHorizontal: 11,
    paddingVertical: 7,
    borderRadius: 7,
    borderWidth: 1,
  },
  toolBtnText: {
    fontSize: 12.5,
    fontWeight: '600',
  },
  scriptBox: {
    borderWidth: 1,
    borderRadius: 10,
    padding: 12,
    gap: 8,
  },
  scriptInput: {
    minHeight: 92,
    borderWidth: 1,
    borderRadius: 8,
    padding: 10,
    fontSize: 13,
    textAlignVertical: 'top',
  },
  cadenceCard: {
    borderWidth: 1,
    borderRadius: 10,
    padding: 13,
    gap: 10,
  },
  cadenceGroup: {
    flexDirection: 'row',
    alignItems: 'center',
    flexWrap: 'wrap',
    gap: 8,
  },
  cadenceLabel: {
    fontSize: 11.5,
    fontWeight: '600',
    minWidth: 74,
  },
  chipsRow: {
    flexDirection: 'row',
    alignItems: 'center',
    flexWrap: 'wrap',
    gap: 6,
  },
  smallChip: {
    paddingHorizontal: 10,
    paddingVertical: 5,
    borderRadius: 6,
    borderWidth: 1,
  },
  cadenceBottomRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    flexWrap: 'wrap',
    gap: 10,
  },
  holdCheckRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
  },
  presetStampRow: {
    flexDirection: 'row',
    alignItems: 'center',
    flexWrap: 'wrap',
    gap: 6,
    paddingTop: 4,
  },
  presetPill: {
    paddingHorizontal: 8,
    paddingVertical: 3.5,
    borderRadius: 5,
    borderWidth: 1,
  },
  listHeaderRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  emptyBox: {
    borderWidth: 1,
    borderRadius: 10,
    padding: 24,
    alignItems: 'center',
  },
  batchRowCard: {
    borderWidth: 1,
    borderRadius: 10,
    padding: 12,
    gap: 8,
  },
  batchRowTop: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    flexWrap: 'wrap',
    gap: 8,
  },
  slotIndexGroup: {
    flexDirection: 'row',
    alignItems: 'center',
    flexWrap: 'wrap',
    gap: 8,
  },
  kindTag: {
    paddingHorizontal: 7,
    paddingVertical: 2,
    borderRadius: 5,
    borderWidth: 1,
  },
  rowRightMeta: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
  },
  destIconsRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 5,
  },
  rowCaptionInput: {
    borderWidth: 1,
    borderRadius: 7,
    paddingHorizontal: 10,
    paddingVertical: 7,
    fontSize: 13,
    minHeight: 44,
  },
  rowTagsInput: {
    borderWidth: 1,
    borderRadius: 7,
    paddingHorizontal: 10,
    paddingVertical: 5,
    fontSize: 12,
  },
  footer: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 20,
    paddingVertical: 12,
    borderTopWidth: 1,
    gap: 10,
  },
  secondaryBtn: {
    paddingHorizontal: 13,
    paddingVertical: 8,
    borderRadius: 7,
    borderWidth: 1,
  },
  secondaryBtnText: {
    fontSize: 12.5,
    fontWeight: '600',
  },
  primaryBtn: {
    paddingHorizontal: 16,
    paddingVertical: 9,
    borderRadius: 7,
  },
  primaryBtnText: {
    fontSize: 13,
    fontWeight: '600',
  },
});
