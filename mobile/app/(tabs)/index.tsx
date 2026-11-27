import { Ionicons } from '@expo/vector-icons';
import * as ImagePicker from 'expo-image-picker';
import { useRouter } from 'expo-router';
import React, { useEffect, useMemo, useRef, useState } from 'react';
import {
  ActivityIndicator,
  Image,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  useWindowDimensions,
  View,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import {
  classifyAspectRatio,
  createDefaultEdits,
  createDefaultOverrides,
  detectPostKind,
  formatDuration,
  formatScheduleLabel,
  MasterDraft,
  MAX_CAROUSEL_PHOTOS,
  PhotoAssetMeta,
  PLATFORM_ORDER,
  PLATFORM_SPECS,
  PlatformId,
  PlatformOverride,
  recommendPlatformsForPost,
  recommendPlatformsForVideo,
  summarizeVideoEdits,
  VideoAssetMeta,
} from '../../../shared/platforms';
import { validateAllPlatforms } from '../../../shared/validator';
import { AppHeader } from '../../components/AppHeader';
import { MediaVaultModal } from '../../components/MediaVaultModal';
import { PlatformTweaker } from '../../components/PlatformTweaker';
import { ScheduleModal } from '../../components/ScheduleModal';
import { ValidationBadges } from '../../components/ValidationBadges';
import { VideoEditModal } from '../../components/VideoEditModal';
import { VideoPreviewCard } from '../../components/VideoPreviewCard';
import { PLATFORM_ICONS } from '../../constants/theme';
import { useOmniPost } from '../../context/OmniPostContext';
import {
  importUrlPreviewApi,
  PlanLimitError,
  submitPublishJob,
} from '../../lib/api';

const SAMPLE_VIDEO: { video: VideoAssetMeta; draft: MasterDraft } = {
  video: {
    fileName: 'studio_cut_v2.mp4',
    mimeType: 'video/mp4',
    fileSizeBytes: 24 * 1024 * 1024,
    width: 1080,
    height: 1920,
    durationSec: 42,
    isSamplePreset: true,
  },
  draft: {
    title: 'Morning studio setup',
    caption:
      'Quick look at the desk lighting setup before we start filming today.',
    hashtags: 'filmmaking desksetup',
  },
};

const SAMPLE_SLIDE_TINTS = [
  '#36322E',
  '#2B3330',
  '#3B2E2B',
  '#2C3640',
  '#423B30',
  '#332F3D',
  '#2E3B36',
  '#3F332C',
];

const SAMPLE_PHOTOS: { photos: PhotoAssetMeta[]; draft: MasterDraft } = {
  photos: [
    {
      id: 'sp_1',
      fileName: 'slide_01_cover.jpg',
      mimeType: 'image/jpeg',
      width: 1080,
      height: 1350,
      isSamplePreset: true,
      sampleTint: '#36322E',
      sampleLabel: '01 · Cover',
    },
    {
      id: 'sp_2',
      fileName: 'slide_02_desk.jpg',
      mimeType: 'image/jpeg',
      width: 1080,
      height: 1350,
      isSamplePreset: true,
      sampleTint: '#2B3330',
      sampleLabel: '02 · Wide desk',
    },
    {
      id: 'sp_3',
      fileName: 'slide_03_camera.jpg',
      mimeType: 'image/jpeg',
      width: 1080,
      height: 1350,
      isSamplePreset: true,
      sampleTint: '#3B2E2B',
      sampleLabel: '03 · Camera rig',
    },
    {
      id: 'sp_4',
      fileName: 'slide_04_lighting.jpg',
      mimeType: 'image/jpeg',
      width: 1080,
      height: 1350,
      isSamplePreset: true,
      sampleTint: '#2C3640',
      sampleLabel: '04 · Key light',
    },
    {
      id: 'sp_5',
      fileName: 'slide_05_audio.jpg',
      mimeType: 'image/jpeg',
      width: 1080,
      height: 1350,
      isSamplePreset: true,
      sampleTint: '#423B30',
      sampleLabel: '05 · Mic chain',
    },
    {
      id: 'sp_6',
      fileName: 'slide_06_color.jpg',
      mimeType: 'image/jpeg',
      width: 1080,
      height: 1350,
      isSamplePreset: true,
      sampleTint: '#332F3D',
      sampleLabel: '06 · Color grade',
    },
    {
      id: 'sp_7',
      fileName: 'slide_07_export.jpg',
      mimeType: 'image/jpeg',
      width: 1080,
      height: 1350,
      isSamplePreset: true,
      sampleTint: '#2E3B36',
      sampleLabel: '07 · Export spec',
    },
    {
      id: 'sp_8',
      fileName: 'slide_08_recap.jpg',
      mimeType: 'image/jpeg',
      width: 1080,
      height: 1350,
      isSamplePreset: true,
      sampleTint: '#3F332C',
      sampleLabel: '08 · Checklist',
    },
  ],
  draft: {
    title: '',
    caption:
      'Eight studio changes we made this quarter that cut filming and turnaround time in half.',
    hashtags: 'studiotour photography behindthescenes',
  },
};

const SAMPLE_TEXT_DRAFT: MasterDraft = {
  title: '',
  caption:
    'Shipping small improvements every week beats waiting six months for a giant relaunch. What are you building this week?',
  hashtags: 'buildinpublic creators',
};

async function probeWebVideoFile(file: File): Promise<VideoAssetMeta> {
  const objectUrl = URL.createObjectURL(file);
  return new Promise((resolve) => {
    const vid = document.createElement('video');
    vid.preload = 'metadata';
    vid.onloadedmetadata = () => {
      const safeDur =
        Number.isFinite(vid.duration) && vid.duration > 0
          ? Math.max(1, Math.round(vid.duration))
          : 30;
      resolve({
        uri: objectUrl,
        fileName: file.name,
        mimeType: file.type || 'video/mp4',
        fileSizeBytes: file.size,
        width: vid.videoWidth || 1080,
        height: vid.videoHeight || 1920,
        durationSec: safeDur,
        isSamplePreset: false,
      });
    };
    vid.onerror = () => {
      resolve({
        uri: objectUrl,
        fileName: file.name,
        mimeType: file.type || 'video/mp4',
        fileSizeBytes: file.size,
        width: 1080,
        height: 1920,
        durationSec: 30,
        isSamplePreset: false,
      });
    };
    vid.src = objectUrl;
  });
}

async function probeWebImageFile(file: File, idx: number): Promise<PhotoAssetMeta> {
  const objectUrl = URL.createObjectURL(file);
  return new Promise((resolve) => {
    const img = new window.Image();
    img.onload = () => {
      resolve({
        id: `web_img_${Date.now()}_${idx}`,
        uri: objectUrl,
        fileName: file.name,
        mimeType: file.type || 'image/jpeg',
        fileSizeBytes: file.size,
        width: img.naturalWidth || 1080,
        height: img.naturalHeight || 1350,
        isSamplePreset: false,
      });
    };
    img.onerror = () => {
      resolve({
        id: `web_img_${Date.now()}_${idx}`,
        uri: objectUrl,
        fileName: file.name,
        mimeType: file.type || 'image/jpeg',
        fileSizeBytes: file.size,
        width: 1080,
        height: 1350,
        isSamplePreset: false,
      });
    };
    img.src = objectUrl;
  });
}

export default function CreateStudioScreen() {
  const router = useRouter();
  const { width: viewportWidth } = useWindowDimensions();
  const isWide = viewportWidth >= 900;

  const {
    palette,
    usage,
    openBillingModal,
    activeWorkspace,
    effectiveRole,
    openBatchModal,
    openTeamModal,
    vaultModalOpen,
    openVaultModal,
    closeVaultModal,
    accounts,
    recordCreatedJob,
    editingJob,
    setEditingJob,
    prefillScheduleIso,
    setPrefillScheduleIso,
    setPreferredPostsFilter,
  } = useOmniPost();

  const [video, setVideo] = useState<VideoAssetMeta | null>(null);
  const [photos, setPhotos] = useState<PhotoAssetMeta[]>([]);
  const [master, setMaster] = useState<MasterDraft>({
    title: '',
    caption: '',
    hashtags: '',
    firstComment: '',
  });
  const [overrides, setOverrides] = useState<
    Record<PlatformId, PlatformOverride>
  >(() => createDefaultOverrides());
  const [scheduledAt, setScheduledAt] = useState<string | undefined>(undefined);
  const [editingJobId, setEditingJobId] = useState<string | undefined>(
    undefined
  );
  const [editingOriginType, setEditingOriginType] = useState<
    'draft' | 'scheduled'
  >('draft');

  const [activeTweakerTab, setActiveTweakerTab] = useState<
    'master' | PlatformId
  >('master');
  const [previewPlatform, setPreviewPlatform] = useState<PlatformId>('tiktok');
  const [mobileView, setMobileView] = useState<'write' | 'preview'>('write');
  const [editModalOpen, setEditModalOpen] = useState(false);
  const [scheduleModalOpen, setScheduleModalOpen] = useState(false);
  const [isDraggingOver, setIsDraggingOver] = useState(false);
  const [publishing, setPublishing] = useState(false);
  const [savingDraft, setSavingDraft] = useState(false);
  const [draftSavedNotice, setDraftSavedNotice] = useState(false);
  const [submitError, setSubmitError] = useState<string | null>(null);
  const [isEvergreen, setIsEvergreen] = useState(false);
  const [urlImportOpen, setUrlImportOpen] = useState(false);
  const [urlInput, setUrlInput] = useState('');
  const [importingUrl, setImportingUrl] = useState(false);

  const dropZoneRef = useRef<React.ComponentRef<typeof View> | null>(null);

  useEffect(() => {
    if (!editingJob) return;
    setVideo(editingJob.video ?? null);
    setPhotos(editingJob.photos ?? []);
    setMaster({ ...editingJob.master });
    setOverrides({ ...createDefaultOverrides(), ...editingJob.overrides });
    setScheduledAt(editingJob.scheduledAt);
    setIsEvergreen(Boolean(editingJob.isEvergreen));
    setEditingJobId(editingJob.id || undefined);
    setEditingOriginType(
      editingJob.lifecycle === 'scheduled' ? 'scheduled' : 'draft'
    );
    setDraftSavedNotice(false);
    setSubmitError(null);
    setEditingJob(null);
  }, [editingJob, setEditingJob]);

  useEffect(() => {
    if (!prefillScheduleIso) return;
    setScheduledAt(prefillScheduleIso);
    setSubmitError(null);
    setPrefillScheduleIso(null);
  }, [prefillScheduleIso, setPrefillScheduleIso]);

  const resetComposerBlank = () => {
    setVideo(null);
    setPhotos([]);
    setMaster({ title: '', caption: '', hashtags: '', firstComment: '' });
    setOverrides(createDefaultOverrides());
    setScheduledAt(undefined);
    setEditingJobId(undefined);
    setDraftSavedNotice(false);
    setSubmitError(null);
  };

  const postKind = useMemo(
    () => detectPostKind(video, photos),
    [video, photos]
  );

  const validations = useMemo(
    () => validateAllPlatforms(video, master, overrides, accounts, photos),
    [video, master, overrides, accounts, photos]
  );

  const enabledPlatforms = useMemo(
    () => PLATFORM_ORDER.filter((id) => overrides[id]?.enabled),
    [overrides]
  );

  const hasTextWritten = Boolean(
    master.caption.trim() || master.title.trim()
  );

  const blockingErrorCount = useMemo(() => {
    if (postKind === 'text' && !hasTextWritten) return 0;
    return enabledPlatforms.reduce(
      (acc, id) =>
        acc +
        validations[id].issues.filter((iss) => iss.severity === 'error').length,
      0
    );
  }, [postKind, hasTextWritten, enabledPlatforms, validations]);

  const applyRecommendedSelection = (
    nextVideo?: VideoAssetMeta | null,
    nextPhotos?: PhotoAssetMeta[]
  ) => {
    const rec = nextVideo
      ? recommendPlatformsForVideo(nextVideo)
      : recommendPlatformsForPost(nextVideo, nextPhotos);
    setOverrides((prev) => {
      const updated = { ...prev };
      for (const id of PLATFORM_ORDER) {
        updated[id] = { ...prev[id], enabled: rec[id] };
      }
      return updated;
    });
    const firstEnabled = PLATFORM_ORDER.find((id) => rec[id]) ?? 'x';
    setPreviewPlatform(firstEnabled);
    setActiveTweakerTab('master');
  };

  // Drag & Drop support for BOTH Videos and Multi-Photo Carousels on Web
  useEffect(() => {
    if (Platform.OS !== 'web') return;
    const node = dropZoneRef.current as unknown as HTMLElement | null;
    if (!node || !node.addEventListener) return;

    const onDragOver = (e: DragEvent) => {
      e.preventDefault();
      setIsDraggingOver(true);
    };
    const onDragLeave = () => setIsDraggingOver(false);
    const onDrop = async (e: DragEvent) => {
      e.preventDefault();
      setIsDraggingOver(false);
      const fileList = Array.from(e.dataTransfer?.files ?? []);
      if (fileList.length === 0) return;

      setSubmitError(null);
      const videoFile = fileList.find((f) => f.type.startsWith('video/'));
      if (videoFile) {
        const meta = await probeWebVideoFile(videoFile);
        setPhotos([]);
        setVideo(meta);
        applyRecommendedSelection(meta, []);
        return;
      }

      const imageFiles = fileList
        .filter((f) => f.type.startsWith('image/'))
        .slice(0, MAX_CAROUSEL_PHOTOS);
      if (imageFiles.length > 0) {
        const probed = await Promise.all(
          imageFiles.map((f, i) => probeWebImageFile(f, i))
        );
        setVideo(null);
        setPhotos((prev) => {
          const merged = [...prev, ...probed].slice(0, MAX_CAROUSEL_PHOTOS);
          applyRecommendedSelection(null, merged);
          return merged;
        });
      }
    };

    node.addEventListener('dragover', onDragOver);
    node.addEventListener('dragleave', onDragLeave);
    node.addEventListener('drop', onDrop);
    return () => {
      node.removeEventListener('dragover', onDragOver);
      node.removeEventListener('dragleave', onDragLeave);
      node.removeEventListener('drop', onDrop);
    };
  }, [video, photos]);

  const handlePickDeviceVideo = async () => {
    setSubmitError(null);
    const res = await ImagePicker.launchImageLibraryAsync({
      mediaTypes: ['videos'],
      quality: 1,
    });
    if (res.canceled || !res.assets?.[0]) return;
    const asset = res.assets[0];

    if (Platform.OS === 'web' && (asset as any).file instanceof File) {
      const probed = await probeWebVideoFile((asset as any).file);
      setPhotos([]);
      setVideo(probed);
      applyRecommendedSelection(probed, []);
      return;
    }

    // expo-image-picker returns seconds on Web and milliseconds on iOS/Android
    const rawDur = asset.duration;
    const durationSec =
      rawDur && Number.isFinite(rawDur) && rawDur > 0
        ? Platform.OS === 'web'
          ? Math.max(1, Math.round(rawDur > 1000 ? rawDur / 1000 : rawDur))
          : Math.max(1, Math.round(rawDur / 1000))
        : 30;
    const picked: VideoAssetMeta = {
      uri: asset.uri,
      fileName: asset.fileName || `video_${Date.now()}.mp4`,
      mimeType: asset.mimeType || 'video/mp4',
      fileSizeBytes: asset.fileSize,
      width: asset.width || 1080,
      height: asset.height || 1920,
      durationSec,
      isSamplePreset: false,
    };
    setPhotos([]);
    setVideo(picked);
    applyRecommendedSelection(picked, []);
  };

  const handlePickDevicePhotos = async () => {
    setSubmitError(null);
    const remaining = Math.max(1, MAX_CAROUSEL_PHOTOS - photos.length);
    const res = await ImagePicker.launchImageLibraryAsync({
      mediaTypes: ['images'],
      allowsMultipleSelection: true,
      selectionLimit: remaining,
      quality: 0.92,
    });
    if (res.canceled || !res.assets?.length) return;
    const added: PhotoAssetMeta[] = res.assets.map((a, idx) => ({
      id: `img_${Date.now()}_${idx}`,
      uri: a.uri,
      fileName: a.fileName || `photo_${idx + 1}.jpg`,
      mimeType: a.mimeType || 'image/jpeg',
      fileSizeBytes: a.fileSize,
      width: a.width || 1080,
      height: a.height || 1350,
      isSamplePreset: false,
    }));
    setVideo(null);
    setPhotos((prev) => {
      const merged = [...prev, ...added].slice(0, MAX_CAROUSEL_PHOTOS);
      applyRecommendedSelection(null, merged);
      return merged;
    });
  };

  const handleAddSampleSlide = () => {
    setPhotos((prev) => {
      if (prev.length >= MAX_CAROUSEL_PHOTOS) return prev;
      const nextNum = prev.length + 1;
      const padNum = String(nextNum).padStart(2, '0');
      const nextSlide: PhotoAssetMeta = {
        id: `sp_${Date.now()}_${nextNum}`,
        fileName: `slide_${padNum}.jpg`,
        mimeType: 'image/jpeg',
        width: 1080,
        height: 1350,
        isSamplePreset: true,
        sampleTint: SAMPLE_SLIDE_TINTS[(nextNum - 1) % SAMPLE_SLIDE_TINTS.length],
        sampleLabel: `${padNum} · Slide ${nextNum}`,
      };
      return [...prev, nextSlide];
    });
  };

  const handleMovePhoto = (idx: number, dir: -1 | 1) => {
    setPhotos((prev) => {
      const target = idx + dir;
      if (target < 0 || target >= prev.length) return prev;
      const copy = [...prev];
      const [item] = copy.splice(idx, 1);
      copy.splice(target, 0, item);
      return copy;
    });
  };

  const handleRemovePhoto = (id: string) => {
    setPhotos((prev) => prev.filter((p) => p.id !== id));
  };

  const handlePickMasterCover = async () => {
    const res = await ImagePicker.launchImageLibraryAsync({
      mediaTypes: ['images'],
      quality: 0.9,
    });
    if (res.canceled || !res.assets?.[0] || !video) return;
    setVideo({ ...video, thumbnailUri: res.assets[0].uri });
  };

  const handlePickPlatformCover = async (id: PlatformId) => {
    const res = await ImagePicker.launchImageLibraryAsync({
      mediaTypes: ['images'],
      quality: 0.9,
    });
    if (res.canceled || !res.assets?.[0]) return;
    setOverrides((prev) => ({
      ...prev,
      [id]: { ...prev[id], customThumbnailUri: res.assets[0].uri },
    }));
  };

  const togglePlatformEnabled = (id: PlatformId) => {
    setOverrides((prev) => {
      const nextEnabled = !prev[id].enabled;
      if (nextEnabled) {
        setPreviewPlatform(id);
      }
      return {
        ...prev,
        [id]: { ...prev[id], enabled: nextEnabled },
      };
    });
  };

  const updateOverride = (id: PlatformId, patch: Partial<PlatformOverride>) => {
    setOverrides((prev) => ({
      ...prev,
      [id]: { ...prev[id], ...patch },
    }));
  };

  const hasAnyDraftContent = Boolean(
    video ||
      photos.length > 0 ||
      master.title.trim() ||
      master.caption.trim() ||
      master.hashtags.trim() ||
      master.firstComment?.trim()
  );

  const handleSaveDraft = async () => {
    if (!hasAnyDraftContent || savingDraft) return;
    setSavingDraft(true);
    setSubmitError(null);
    try {
      const saved = await submitPublishJob({
        workspaceId: activeWorkspace.id,
        video,
        photos,
        master,
        overrides,
        lifecycle: 'draft',
        replaceJobId: editingJobId,
      });
      recordCreatedJob(saved);
      setEditingJobId(saved.id);
      setDraftSavedNotice(true);
    } catch (err: any) {
      setSubmitError(err?.message || 'Could not save draft.');
    } finally {
      setSavingDraft(false);
    }
  };

  const hasPublishablePayload =
    Boolean(video) || photos.length > 0 || hasTextWritten;

  const canPublish =
    !publishing &&
    hasPublishablePayload &&
    enabledPlatforms.length > 0 &&
    blockingErrorCount === 0;

  const handlePublishOrSchedule = async () => {
    if (!canPublish) return;
    if (effectiveRole === 'editor' && !scheduledAt) {
      setScheduleModalOpen(true);
      return;
    }
    setPublishing(true);
    setSubmitError(null);
    try {
      const isScheduling = Boolean(scheduledAt) || effectiveRole === 'editor';
      const job = await submitPublishJob({
        workspaceId: activeWorkspace.id,
        video,
        photos,
        master,
        overrides,
        lifecycle: isScheduling ? 'scheduled' : 'active',
        scheduledAt: isScheduling ? scheduledAt : undefined,
        replaceJobId: editingJobId,
        isEvergreen,
      });
      recordCreatedJob(job);
      resetComposerBlank();
      setPreferredPostsFilter(isScheduling ? 'calendar' : 'published');
      router.push('/history');
    } catch (err: any) {
      if (err instanceof PlanLimitError || err?.code === 'PLAN_LIMIT_REACHED') {
        openBillingModal(err.requiredTier ?? 'creator', err.message);
        return;
      }
      setSubmitError(err?.message || 'Could not submit post.');
    } finally {
      setPublishing(false);
    }
  };

  const aspectInfo = video
    ? classifyAspectRatio(video.width, video.height)
    : null;

  const buttonLabel = !hasPublishablePayload
    ? 'Write post or add media'
    : enabledPlatforms.length === 0
    ? 'Select an account'
    : blockingErrorCount > 0
    ? 'Fix issue above'
    : effectiveRole === 'editor'
    ? scheduledAt
      ? 'Submit for approval'
      : 'Pick slot for approval'
    : scheduledAt
    ? activeWorkspace.requireApproval
      ? 'Queue for approval'
      : 'Schedule post'
    : enabledPlatforms.length === 1
    ? `Post to ${PLATFORM_SPECS[enabledPlatforms[0]].shortName}`
    : `Post to ${enabledPlatforms.length} accounts`;

  const renderComposerSheet = () => (
    <View
      style={[
        styles.sheet,
        {
          backgroundColor: palette.surface,
          borderColor: palette.border,
        },
      ]}
    >
      {effectiveRole === 'editor' && (
        <View
          style={[
            styles.editingBanner,
            {
              backgroundColor: palette.surfaceSubtle,
              borderBottomColor: palette.border,
            },
          ]}
        >
          <Text style={[styles.editingText, { color: palette.textSecondary }]}>
            Editor permissions · Posts enter the queue awaiting team or client sign-off
          </Text>
          <Pressable onPress={openTeamModal}>
            <Text style={[styles.quietTextBtn, { color: palette.text }]}>
              Team roles
            </Text>
          </Pressable>
        </View>
      )}
      {editingJobId && (
        <View
          style={[
            styles.editingBanner,
            {
              backgroundColor: palette.surfaceSubtle,
              borderBottomColor: palette.border,
            },
          ]}
        >
          <Text style={[styles.editingText, { color: palette.textSecondary }]}>
            Editing saved{' '}
            {editingOriginType === 'scheduled' ? 'scheduled post' : 'draft'}
          </Text>
          <Pressable onPress={resetComposerBlank}>
            <Text style={[styles.quietTextBtn, { color: palette.text }]}>
              Start new blank post
            </Text>
          </Pressable>
        </View>
      )}

      {/* 1. Account Selector Row */}
      {urlImportOpen && (
        <View
          style={{
            paddingHorizontal: 18,
            paddingVertical: 12,
            borderBottomWidth: 1,
            borderBottomColor: palette.border,
            backgroundColor: palette.surfaceSubtle,
            gap: 8,
          }}
        >
          <View
            style={{
              flexDirection: 'row',
              alignItems: 'center',
              justifyContent: 'space-between',
            }}
          >
            <Text
              style={{
                fontSize: 12,
                fontWeight: '600',
                color: palette.textSecondary,
              }}
            >
              Import article, newsletter, shop, or YouTube URL
            </Text>
            <Pressable
              onPress={() =>
                setUrlInput(
                  'https://studio.example.com/two-light-interview-setup'
                )
              }
            >
              <Text
                style={{
                  fontSize: 11.5,
                  color: palette.text,
                  textDecorationLine: 'underline',
                }}
              >
                Try sample URL
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
              placeholder="https://yourblog.com/post..."
              placeholderTextColor={palette.textMuted}
              value={urlInput}
              onChangeText={setUrlInput}
            />
            <Pressable
              disabled={!urlInput.trim() || importingUrl}
              onPress={async () => {
                setImportingUrl(true);
                setSubmitError(null);
                try {
                  const preview = await importUrlPreviewApi(urlInput.trim());
                  setMaster((prev) => ({
                    title: preview.title.slice(0, 95) || prev.title,
                    caption: preview.suggestedCaption || prev.caption,
                    hashtags: preview.suggestedHashtags || prev.hashtags,
                    firstComment:
                      preview.suggestedFirstComment || prev.firstComment,
                  }));
                  if (!video && photos.length === 0) {
                    applyRecommendedSelection(null, []);
                  }
                  setUrlImportOpen(false);
                  setUrlInput('');
                } catch (err: any) {
                  setSubmitError(err?.message || 'Could not import URL.');
                } finally {
                  setImportingUrl(false);
                }
              }}
              style={{
                paddingHorizontal: 13,
                paddingVertical: 8,
                borderRadius: 7,
                backgroundColor: urlInput.trim()
                  ? palette.ctaBg
                  : palette.ctaDisabledBg,
                justifyContent: 'center',
              }}
            >
              <Text
                style={{
                  fontSize: 12.5,
                  fontWeight: '600',
                  color: urlInput.trim()
                    ? palette.ctaText
                    : palette.ctaDisabledText,
                }}
              >
                {importingUrl ? 'Extracting…' : 'Extract'}
              </Text>
            </Pressable>
          </View>
        </View>
      )}
      <View
        style={[
          styles.accountsBar,
          { borderBottomColor: palette.border },
        ]}
      >
        <View style={styles.accountsTopRow}>
          <Text style={[styles.sectionMicroLabel, { color: palette.textMuted }]}>
            Post to
          </Text>

          <View style={styles.presetFilterLinks}>
            <Pressable onPress={() => setUrlImportOpen((v) => !v)}>
              <Text
                style={[
                  styles.quietTextBtn,
                  {
                    color: urlImportOpen
                      ? palette.accent
                      : palette.textSecondary,
                  },
                ]}
              >
                Import URL
              </Text>
            </Pressable>
            <Text style={{ color: palette.textMuted, fontSize: 12 }}>·</Text>
            <Pressable
              onPress={() => applyRecommendedSelection(video, photos)}
            >
              <Text
                style={[styles.quietTextBtn, { color: palette.textSecondary }]}
              >
                Match {postKind}
              </Text>
            </Pressable>
            <Text style={{ color: palette.textMuted, fontSize: 12 }}>·</Text>
            <Pressable
              onPress={() => applyRecommendedSelection(null, [])}
            >
              <Text
                style={[styles.quietTextBtn, { color: palette.textSecondary }]}
              >
                Text channels
              </Text>
            </Pressable>
            <Text style={{ color: palette.textMuted, fontSize: 12 }}>·</Text>
            <Pressable
              onPress={() => {
                setOverrides((prev) => {
                  const allOn = PLATFORM_ORDER.every((id) => prev[id]?.enabled);
                  const next = { ...prev };
                  PLATFORM_ORDER.forEach((id) => {
                    next[id] = { ...prev[id], enabled: !allOn };
                  });
                  return next;
                });
              }}
            >
              <Text
                style={[styles.quietTextBtn, { color: palette.textSecondary }]}
              >
                All
              </Text>
            </Pressable>
          </View>
        </View>

        <View style={styles.chipsWrap}>
          {PLATFORM_ORDER.map((id) => {
            const spec = PLATFORM_SPECS[id];
            const active = overrides[id]?.enabled;
            const acc = accounts.find(
              (a) => a.platformGroup === spec.accountGroup
            );

            return (
              <Pressable
                key={id}
                onPress={() => togglePlatformEnabled(id)}
                style={[
                  styles.accountChip,
                  {
                    backgroundColor: active
                      ? palette.surface
                      : palette.surfaceSubtle,
                    borderColor: active ? palette.text : palette.border,
                    opacity: active ? 1 : 0.65,
                  },
                ]}
              >
                <Ionicons
                  name={PLATFORM_ICONS[id]}
                  size={13.5}
                  color={
                    active
                      ? id === 'x' || id === 'threads'
                        ? palette.text
                        : spec.brandColor
                      : palette.textMuted
                  }
                />
                <Text
                  style={[
                    styles.chipName,
                    {
                      color: active ? palette.text : palette.textSecondary,
                      fontWeight: active ? '600' : '400',
                    },
                  ]}
                >
                  {spec.shortName}
                </Text>
                {!acc && (
                  <Text style={{ fontSize: 11, color: palette.danger }}>!</Text>
                )}
              </Pressable>
            );
          })}
        </View>
      </View>

      {/* 2. Media Dropzone (Video, Photo Carousel, or Optional for Text Posts) */}
      <View
        ref={dropZoneRef}
        style={[
          styles.mediaSection,
          {
            borderBottomColor: palette.border,
            backgroundColor: isDraggingOver
              ? palette.surfaceMuted
              : 'transparent',
          },
        ]}
      >
        {!video && photos.length === 0 ? (
          <View
            style={[
              styles.emptyDropzone,
              {
                backgroundColor: palette.surfaceSubtle,
                borderColor: isDraggingOver
                  ? palette.text
                  : palette.borderStrong,
              },
            ]}
          >
            <View style={styles.pickerActionBtns}>
              <Pressable
                onPress={handlePickDeviceVideo}
                style={[
                  styles.mediaTypeBtn,
                  {
                    backgroundColor: palette.surface,
                    borderColor: palette.borderStrong,
                  },
                ]}
              >
                <Ionicons
                  name="film-outline"
                  size={15}
                  color={palette.text}
                />
                <Text style={[styles.mediaTypeBtnText, { color: palette.text }]}>
                  Add video
                </Text>
              </Pressable>

              <Pressable
                onPress={handlePickDevicePhotos}
                style={[
                  styles.mediaTypeBtn,
                  {
                    backgroundColor: palette.surface,
                    borderColor: palette.borderStrong,
                  },
                ]}
              >
                <Ionicons
                  name="images-outline"
                  size={15}
                  color={palette.text}
                />
                <Text style={[styles.mediaTypeBtnText, { color: palette.text }]}>
                  Add photos
                </Text>
              </Pressable>

              <Pressable
                onPress={openVaultModal}
                style={[
                  styles.mediaTypeBtn,
                  {
                    backgroundColor: palette.surface,
                    borderColor: palette.border,
                  },
                ]}
              >
                <Ionicons
                  name="albums-outline"
                  size={15}
                  color={palette.textSecondary}
                />
                <Text style={[styles.mediaTypeBtnText, { color: palette.text }]}>
                  Media vault
                </Text>
              </Pressable>
            </View>

            <Text style={[styles.dropSub, { color: palette.textMuted }]}>
              {Platform.OS === 'web'
                ? `Drop a video or up to ${MAX_CAROUSEL_PHOTOS} carousel photos here — or leave empty for a text post`
                : `Attach a video or up to ${MAX_CAROUSEL_PHOTOS} carousel photos — or leave empty for a text post`}
            </Text>

            <View style={styles.sampleInlineRow}>
              <Text style={[styles.sampleHint, { color: palette.textMuted }]}>
                Try sample:
              </Text>
              <Pressable
                onPress={() => {
                  setPhotos([]);
                  setVideo(SAMPLE_VIDEO.video);
                  if (!master.caption) setMaster(SAMPLE_VIDEO.draft);
                  applyRecommendedSelection(SAMPLE_VIDEO.video, []);
                }}
              >
                <Text
                  style={[styles.sampleLink, { color: palette.textSecondary }]}
                >
                  9:16 video
                </Text>
              </Pressable>
              <Text style={{ color: palette.textMuted, fontSize: 12 }}>·</Text>
              <Pressable
                onPress={() => {
                  setVideo(null);
                  setPhotos(SAMPLE_PHOTOS.photos);
                  if (!master.caption) setMaster(SAMPLE_PHOTOS.draft);
                  applyRecommendedSelection(null, SAMPLE_PHOTOS.photos);
                }}
              >
                <Text
                  style={[styles.sampleLink, { color: palette.textSecondary }]}
                >
                  Photo carousel (8)
                </Text>
              </Pressable>
              <Text style={{ color: palette.textMuted, fontSize: 12 }}>·</Text>
              <Pressable
                onPress={() => {
                  setVideo(null);
                  setPhotos([]);
                  setMaster(SAMPLE_TEXT_DRAFT);
                  applyRecommendedSelection(null, []);
                }}
              >
                <Text
                  style={[styles.sampleLink, { color: palette.textSecondary }]}
                >
                  Text post
                </Text>
              </Pressable>
            </View>
          </View>
        ) : video ? (
          /* Attached Video Row */
          <View
            style={[
              styles.attachedMediaRow,
              {
                backgroundColor: palette.surfaceSubtle,
                borderColor: palette.border,
              },
            ]}
          >
            <View style={styles.miniThumb}>
              <Ionicons name="play" size={14} color="#FFF" />
            </View>

            <View style={{ flex: 1 }}>
              <Text
                style={[styles.attachedName, { color: palette.text }]}
                numberOfLines={1}
              >
                {video.fileName}
              </Text>
              <Text
                style={[styles.attachedMeta, { color: palette.textSecondary }]}
              >
                {aspectInfo?.label} ({video.width}×{video.height}) ·{' '}
                {formatDuration(video.durationSec)}
                {video.fileSizeBytes
                  ? ` · ${(video.fileSizeBytes / (1024 * 1024)).toFixed(1)} MB`
                  : ''}
              </Text>
              {summarizeVideoEdits(video).length > 0 && (
                <Text
                  style={[styles.editsActiveText, { color: palette.accent }]}
                >
                  {summarizeVideoEdits(video).join(' · ')}
                </Text>
              )}
            </View>

            <View style={styles.mediaRightLinks}>
              <Pressable
                onPress={() => setEditModalOpen(true)}
                style={[
                  styles.trimCropBtn,
                  {
                    borderColor: palette.borderStrong,
                    backgroundColor: palette.surface,
                  },
                ]}
              >
                <Ionicons name="cut-outline" size={13} color={palette.text} />
                <Text style={[styles.trimCropBtnText, { color: palette.text }]}>
                  Trim & crop
                </Text>
              </Pressable>
              <Pressable onPress={handlePickDeviceVideo}>
                <Text
                  style={[
                    styles.mediaLinkText,
                    { color: palette.textSecondary },
                  ]}
                >
                  Replace
                </Text>
              </Pressable>
              <Pressable onPress={() => setVideo(null)}>
                <Ionicons name="close" size={17} color={palette.textMuted} />
              </Pressable>
            </View>
          </View>
        ) : (
          /* Attached Photo / Multi-Row Carousel Grid (up to 35 slides) */
          <View style={{ gap: 11 }}>
            <View style={styles.photoStripHeader}>
              <View style={{ flex: 1, gap: 2 }}>
                <Text
                  style={[styles.attachedName, { color: palette.text }]}
                >
                  {photos.length} / {MAX_CAROUSEL_PHOTOS}{' '}
                  {photos.length === 1 ? 'carousel slide' : 'carousel slides'}
                </Text>
                <Text
                  style={[
                    styles.carouselCapSub,
                    { color: palette.textMuted },
                  ]}
                >
                  Up to 20 slides on Instagram, LinkedIn, Threads & Facebook · 35 on TikTok · first 4 on X & Bluesky
                </Text>
              </View>

              <View style={styles.carouselHeaderActions}>
                {photos.length < MAX_CAROUSEL_PHOTOS && (
                  <Pressable
                    onPress={handlePickDevicePhotos}
                    style={[
                      styles.trimCropBtn,
                      {
                        borderColor: palette.borderStrong,
                        backgroundColor: palette.surface,
                      },
                    ]}
                  >
                    <Ionicons name="add" size={14} color={palette.text} />
                    <Text
                      style={[styles.trimCropBtnText, { color: palette.text }]}
                    >
                      Add photos
                    </Text>
                  </Pressable>
                )}

                {photos.length < MAX_CAROUSEL_PHOTOS &&
                  photos.some((p) => p.isSamplePreset) && (
                    <Pressable onPress={handleAddSampleSlide}>
                      <Text
                        style={[
                          styles.mediaLinkText,
                          { color: palette.textSecondary },
                        ]}
                      >
                        + Sample slide
                      </Text>
                    </Pressable>
                  )}

                <Pressable onPress={() => setPhotos([])}>
                  <Text
                    style={[
                      styles.mediaLinkText,
                      { color: palette.textSecondary },
                    ]}
                  >
                    Clear
                  </Text>
                </Pressable>
              </View>
            </View>

            <View style={styles.photoGridWrap}>
              {photos.map((ph, idx) => (
                <View
                  key={ph.id}
                  style={[
                    styles.photoTile,
                    { borderColor: palette.borderStrong },
                  ]}
                >
                  {ph.uri && !ph.isSamplePreset ? (
                    <Image source={{ uri: ph.uri }} style={styles.photoTileImg} />
                  ) : (
                    <View
                      style={[
                        styles.photoTileImg,
                        styles.sampleThumbCenter,
                        { backgroundColor: ph.sampleTint || '#2E2D2A' },
                      ]}
                    >
                      <Ionicons
                        name="image-outline"
                        size={15}
                        color="rgba(255,255,255,0.8)"
                      />
                      <Text style={styles.sampleTileMicroLabel} numberOfLines={1}>
                        {ph.sampleLabel?.replace(/^\d+\s*·\s*/, '') || 'Slide'}
                      </Text>
                    </View>
                  )}

                  <View style={styles.photoIndexBadge}>
                    <Text style={styles.photoIndexText}>{idx + 1}</Text>
                  </View>

                  <Pressable
                    onPress={() => handleRemovePhoto(ph.id)}
                    style={styles.photoRemoveBadge}
                  >
                    <Ionicons name="close" size={11} color="#FFF" />
                  </Pressable>

                  {photos.length > 1 && (
                    <View style={styles.photoReorderBar}>
                      <Pressable
                        disabled={idx === 0}
                        onPress={() => handleMovePhoto(idx, -1)}
                        style={{ opacity: idx === 0 ? 0.3 : 1 }}
                      >
                        <Ionicons name="chevron-back" size={12} color="#FFF" />
                      </Pressable>
                      <Pressable
                        disabled={idx === photos.length - 1}
                        onPress={() => handleMovePhoto(idx, 1)}
                        style={{
                          opacity: idx === photos.length - 1 ? 0.3 : 1,
                        }}
                      >
                        <Ionicons
                          name="chevron-forward"
                          size={12}
                          color="#FFF"
                        />
                      </Pressable>
                    </View>
                  )}
                </View>
              ))}

              {(() => {
                if (photos.length >= MAX_CAROUSEL_PHOTOS) return null;
                const targetVisible =
                  photos.length < 10
                    ? 10
                    : photos.length < 20
                    ? 20
                    : Math.min(MAX_CAROUSEL_PHOTOS, photos.length + 5);
                const emptyCount = Math.max(1, targetVisible - photos.length);
                return Array.from({ length: emptyCount }, (_, offset) => {
                  const slotNumber = photos.length + offset + 1;
                  return (
                    <Pressable
                      key={`empty_slot_${slotNumber}`}
                      onPress={handlePickDevicePhotos}
                      style={[
                        styles.addMorePhotoTile,
                        {
                          borderColor: palette.borderStrong,
                          backgroundColor: palette.surfaceSubtle,
                        },
                      ]}
                    >
                      <Ionicons
                        name="add"
                        size={16}
                        color={palette.textMuted}
                      />
                      <Text
                        style={[
                          styles.emptySlotNum,
                          { color: palette.textMuted },
                        ]}
                      >
                        Slot {slotNumber}
                      </Text>
                    </Pressable>
                  );
                });
              })()}
            </View>
          </View>
        )}
      </View>

      {/* 3. Writing Area + Per-App Tabs */}
      <PlatformTweaker
        activeTab={activeTweakerTab}
        onSelectTab={(tab) => {
          setActiveTweakerTab(tab);
          if (tab !== 'master') {
            setPreviewPlatform(tab);
          }
        }}
        master={master}
        onChangeMaster={(next) => {
          setDraftSavedNotice(false);
          setMaster(next);
        }}
        overrides={overrides}
        onUpdateOverride={updateOverride}
        validations={validations}
        video={video}
        photos={photos}
        onPickPlatformCover={handlePickPlatformCover}
      />

      {/* 4. Calm Inline Validation */}
      <ValidationBadges
        validations={validations}
        focusedPlatform={activeTweakerTab}
        onQuickDisablePlatform={(id) => updateOverride(id, { enabled: false })}
        onQuickMatchPostType={() => applyRecommendedSelection(video, photos)}
        onSelectPlatformTab={(id) => {
          setActiveTweakerTab(id);
          setPreviewPlatform(id);
        }}
        onQuickAutoReframe={() => {
          if (!video) return;
          const base = video.edits ?? createDefaultEdits(video.durationSec);
          setVideo({
            ...video,
            edits: { ...base, reframeMode: 'smart_hybrid' },
          });
        }}
        onQuickTrimToSec={(maxSec) => {
          if (!video) return;
          const base = video.edits ?? createDefaultEdits(video.durationSec);
          setVideo({
            ...video,
            edits: {
              ...base,
              trimEndSec: Math.min(video.durationSec, base.trimStartSec + maxSec),
            },
          });
        }}
      />

      {submitError && (
        <View
          style={[
            styles.errorBar,
            {
              backgroundColor: palette.dangerBg,
              borderTopColor: palette.border,
            },
          ]}
        >
          <Text style={{ color: palette.danger, fontSize: 13 }}>
            {submitError}
          </Text>
        </View>
      )}

      {/* 5. Sheet Footer */}
      <View
        style={[
          styles.sheetFooter,
          {
            backgroundColor: palette.surfaceSubtle,
            borderTopColor: palette.border,
          },
        ]}
      >
        <View style={styles.footerLeft}>
          <Pressable
            disabled={!hasAnyDraftContent || savingDraft}
            onPress={handleSaveDraft}
            style={[
              styles.draftBtn,
              !hasAnyDraftContent && { opacity: 0.45 },
            ]}
          >
            <Text
              style={[styles.draftBtnText, { color: palette.textSecondary }]}
            >
              {savingDraft
                ? 'Saving...'
                : draftSavedNotice
                ? 'Draft saved ✓'
                : 'Save draft'}
            </Text>
          </Pressable>

          {draftSavedNotice && (
            <Pressable
              onPress={() => {
                setPreferredPostsFilter('drafts');
                router.push('/history');
              }}
            >
              <Text style={[styles.quietTextBtn, { color: palette.text }]}>
                View drafts
              </Text>
            </Pressable>
          )}

            {usage.maxPostsPerMonth !== null && (
              <Pressable
                onPress={() => openBillingModal('creator')}
                style={{ paddingLeft: 4 }}
              >
                <Text
                  style={[styles.quietTextBtn, { color: palette.textMuted }]}
                >
                  {usage.postsThisMonth}/{usage.maxPostsPerMonth} free posts
                </Text>
              </Pressable>
            )}

            <Pressable
              onPress={() => setIsEvergreen((v) => !v)}
              style={{
                flexDirection: 'row',
                alignItems: 'center',
                gap: 4,
                paddingLeft: 4,
              }}
            >
              <Ionicons
                name={isEvergreen ? 'checkbox' : 'square-outline'}
                size={14}
                color={isEvergreen ? palette.accent : palette.textSecondary}
              />
              <Text
                style={[
                  styles.quietTextBtn,
                  {
                    color: isEvergreen ? palette.accent : palette.textSecondary,
                  },
                ]}
              >
                Evergreen ↻
              </Text>
            </Pressable>

            <Pressable onPress={openBatchModal} style={{ paddingLeft: 6 }}>
              <Text
                style={[styles.quietTextBtn, { color: palette.textSecondary }]}
              >
                Batch schedule ↗
              </Text>
            </Pressable>
          </View>

        <View style={styles.footerRight}>
          <View
            style={[
              styles.schedulePillWrap,
              {
                borderColor: scheduledAt ? palette.text : palette.borderStrong,
                backgroundColor: palette.surface,
              },
            ]}
          >
            <Pressable
              onPress={() => setScheduleModalOpen(true)}
              style={styles.scheduleBtnInner}
            >
              <Ionicons
                name="calendar-outline"
                size={14}
                color={scheduledAt ? palette.text : palette.textSecondary}
              />
              <Text
                style={[
                  styles.scheduleBtnText,
                  {
                    color: scheduledAt ? palette.text : palette.textSecondary,
                    fontWeight: scheduledAt ? '600' : '500',
                  },
                ]}
              >
                {scheduledAt
                  ? formatScheduleLabel(scheduledAt)
                  : 'Schedule'}
              </Text>
            </Pressable>

            {scheduledAt && (
              <Pressable
                onPress={() => setScheduledAt(undefined)}
                style={[
                  styles.scheduleClearBtn,
                  { borderLeftColor: palette.border },
                ]}
              >
                <Ionicons
                  name="close"
                  size={13}
                  color={palette.textSecondary}
                />
              </Pressable>
            )}
          </View>

          <Pressable
            disabled={!canPublish}
            onPress={handlePublishOrSchedule}
            style={[
              styles.postBtn,
              {
                backgroundColor: canPublish
                  ? palette.ctaBg
                  : palette.ctaDisabledBg,
              },
            ]}
          >
            {publishing ? (
              <ActivityIndicator size="small" color={palette.ctaText} />
            ) : (
              <Text
                style={[
                  styles.postBtnText,
                  {
                    color: canPublish
                      ? palette.ctaText
                      : palette.ctaDisabledText,
                  },
                ]}
              >
                {buttonLabel}
              </Text>
            )}
          </Pressable>
        </View>
      </View>
    </View>
  );

  return (
    <SafeAreaView
      style={[styles.safe, { backgroundColor: palette.bg }]}
      edges={['top']}
    >
      <AppHeader />

      <MediaVaultModal
        visible={vaultModalOpen}
        onClose={closeVaultModal}
        onSelectPhotoAsset={(photo) => {
          setVideo(null);
          setPhotos((prev) => {
            const next = [...prev, photo].slice(0, MAX_CAROUSEL_PHOTOS);
            applyRecommendedSelection(null, next);
            return next;
          });
        }}
        onSelectVideoAsset={(vid) => {
          setPhotos([]);
          setVideo(vid);
          applyRecommendedSelection(vid, []);
        }}
      />

      <VideoEditModal
        visible={editModalOpen}
        video={video}
        onClose={() => setEditModalOpen(false)}
        onApply={(nextEdits, capturedThumbUri) => {
          if (video) {
            setVideo({
              ...video,
              edits: nextEdits,
              thumbnailUri: capturedThumbUri ?? video.thumbnailUri,
            });
          }
          setEditModalOpen(false);
        }}
        onPickCustomImage={() => {
          setEditModalOpen(false);
          void handlePickMasterCover();
        }}
      />

      <ScheduleModal
        visible={scheduleModalOpen}
        initialIso={scheduledAt}
        onClose={() => setScheduleModalOpen(false)}
        onApplySchedule={(iso) => setScheduledAt(iso)}
      />

      {isWide ? (
        <ScrollView
          contentContainerStyle={styles.desktopContainer}
          keyboardShouldPersistTaps="handled"
        >
          <View style={styles.desktopColumns}>
            <View style={styles.leftMain}>{renderComposerSheet()}</View>

            <View style={styles.rightRailCol}>
              <VideoPreviewCard
                video={video}
                photos={photos}
                master={master}
                overrides={overrides}
                accounts={accounts}
                selectedPlatform={previewPlatform}
                onSelectPlatform={(id) => {
                  setPreviewPlatform(id);
                  if (overrides[id]?.enabled) {
                    setActiveTweakerTab(id);
                  }
                }}
              />
            </View>
          </View>
        </ScrollView>
      ) : (
        <View style={{ flex: 1 }}>
          <View
            style={[
              styles.mobileSubBar,
              { borderBottomColor: palette.border },
            ]}
          >
            <Pressable
              onPress={() => setMobileView('write')}
              style={[
                styles.mobileTab,
                mobileView === 'write' && {
                  borderBottomColor: palette.text,
                },
              ]}
            >
              <Text
                style={{
                  fontSize: 13,
                  fontWeight: mobileView === 'write' ? '600' : '400',
                  color:
                    mobileView === 'write'
                      ? palette.text
                      : palette.textSecondary,
                }}
              >
                Compose
              </Text>
            </Pressable>

            <Pressable
              onPress={() => setMobileView('preview')}
              style={[
                styles.mobileTab,
                mobileView === 'preview' && {
                  borderBottomColor: palette.text,
                },
              ]}
            >
              <Text
                style={{
                  fontSize: 13,
                  fontWeight: mobileView === 'preview' ? '600' : '400',
                  color:
                    mobileView === 'preview'
                      ? palette.text
                      : palette.textSecondary,
                }}
              >
                Preview
              </Text>
            </Pressable>
          </View>

          <ScrollView
            contentContainerStyle={styles.mobileContent}
            keyboardShouldPersistTaps="handled"
          >
            {mobileView === 'write' ? (
              renderComposerSheet()
            ) : (
              <VideoPreviewCard
                video={video}
                photos={photos}
                master={master}
                overrides={overrides}
                accounts={accounts}
                selectedPlatform={previewPlatform}
                onSelectPlatform={(id) => {
                  setPreviewPlatform(id);
                  if (overrides[id]?.enabled) {
                    setActiveTweakerTab(id);
                  }
                }}
              />
            )}
          </ScrollView>
        </View>
      )}
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safe: {
    flex: 1,
  },
  desktopContainer: {
    maxWidth: 1080,
    width: '100%',
    alignSelf: 'center',
    paddingHorizontal: 20,
    paddingVertical: 28,
  },
  desktopColumns: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: 36,
  },
  leftMain: {
    flex: 1,
  },
  rightRailCol: {
    width: 288,
  },
  sheet: {
    borderRadius: 12,
    borderWidth: 1,
    overflow: 'hidden',
  },
  editingBanner: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 20,
    paddingVertical: 9,
    borderBottomWidth: 1,
  },
  editingText: {
    fontSize: 12,
    fontWeight: '500',
  },
  accountsBar: {
    paddingHorizontal: 20,
    paddingVertical: 15,
    borderBottomWidth: 1,
    gap: 10,
  },
  accountsTopRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    flexWrap: 'wrap',
    gap: 8,
  },
  presetFilterLinks: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
  },
  sectionMicroLabel: {
    fontSize: 12,
    fontWeight: '500',
  },
  quietTextBtn: {
    fontSize: 12,
    textDecorationLine: 'underline',
  },
  chipsWrap: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 7,
  },
  accountChip: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    paddingHorizontal: 10,
    paddingVertical: 6.5,
    borderRadius: 8,
    borderWidth: 1,
  },
  chipName: {
    fontSize: 12.5,
  },
  mediaSection: {
    padding: 20,
    borderBottomWidth: 1,
  },
  emptyDropzone: {
    borderWidth: 1,
    borderStyle: 'dashed',
    borderRadius: 10,
    paddingVertical: 18,
    paddingHorizontal: 18,
    alignItems: 'center',
    gap: 10,
  },
  pickerActionBtns: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    justifyContent: 'center',
    gap: 10,
  },
  mediaTypeBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    borderWidth: 1,
    borderRadius: 8,
    paddingHorizontal: 13,
    paddingVertical: 8,
  },
  mediaTypeBtnText: {
    fontSize: 13,
    fontWeight: '600',
  },
  dropSub: {
    fontSize: 12.5,
    textAlign: 'center',
  },
  sampleInlineRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    justifyContent: 'center',
    alignItems: 'center',
    gap: 6,
  },
  sampleHint: {
    fontSize: 12,
  },
  sampleLink: {
    fontSize: 12,
    textDecorationLine: 'underline',
  },
  attachedMediaRow: {
    flexDirection: 'row',
    alignItems: 'center',
    flexWrap: 'wrap',
    gap: 12,
    padding: 11,
    borderRadius: 9,
    borderWidth: 1,
  },
  miniThumb: {
    width: 40,
    height: 48,
    borderRadius: 6,
    backgroundColor: '#1E1E1C',
    alignItems: 'center',
    justifyContent: 'center',
  },
  attachedName: {
    fontSize: 13.5,
    fontWeight: '600',
  },
  attachedMeta: {
    fontSize: 12,
    marginTop: 2,
  },
  editsActiveText: {
    fontSize: 11.5,
    fontWeight: '600',
    marginTop: 3,
  },
  mediaRightLinks: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
  },
  trimCropBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 5,
    borderWidth: 1,
    borderRadius: 7,
    paddingHorizontal: 10,
    paddingVertical: 6,
  },
  trimCropBtnText: {
    fontSize: 12.5,
    fontWeight: '600',
  },
  mediaLinkText: {
    fontSize: 12.5,
    fontWeight: '500',
    textDecorationLine: 'underline',
  },
  photoStripHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'flex-start',
    flexWrap: 'wrap',
    gap: 10,
  },
  carouselCapSub: {
    fontSize: 11.5,
    lineHeight: 16,
  },
  carouselHeaderActions: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 11,
  },
  photoGridWrap: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 9,
  },
  photoTilesRow: {
    gap: 10,
    paddingVertical: 2,
  },
  photoTile: {
    width: 72,
    height: 88,
    borderRadius: 8,
    borderWidth: 1,
    overflow: 'hidden',
    position: 'relative',
  },
  photoTileImg: {
    width: '100%',
    height: '100%',
    resizeMode: 'cover',
  },
  sampleThumbCenter: {
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 4,
    paddingBottom: 14,
    gap: 3,
  },
  sampleTileMicroLabel: {
    color: 'rgba(255,255,255,0.72)',
    fontSize: 9.5,
    fontWeight: '600',
  },
  emptySlotNum: {
    fontSize: 10.5,
    fontWeight: '500',
  },
  photoIndexBadge: {
    position: 'absolute',
    top: 4,
    left: 4,
    backgroundColor: 'rgba(0,0,0,0.68)',
    paddingHorizontal: 5,
    paddingVertical: 1,
    borderRadius: 4,
  },
  photoIndexText: {
    color: '#FFF',
    fontSize: 10,
    fontWeight: '700',
  },
  photoRemoveBadge: {
    position: 'absolute',
    top: 4,
    right: 4,
    width: 17,
    height: 17,
    borderRadius: 9,
    backgroundColor: 'rgba(0,0,0,0.68)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  photoReorderBar: {
    position: 'absolute',
    bottom: 0,
    left: 0,
    right: 0,
    height: 20,
    backgroundColor: 'rgba(0,0,0,0.58)',
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 5,
  },
  addMorePhotoTile: {
    width: 72,
    height: 88,
    borderRadius: 8,
    borderWidth: 1,
    borderStyle: 'dashed',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 2,
  },
  errorBar: {
    paddingHorizontal: 20,
    paddingVertical: 10,
    borderTopWidth: 1,
  },
  sheetFooter: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    flexWrap: 'wrap',
    paddingHorizontal: 20,
    paddingVertical: 13,
    borderTopWidth: 1,
    gap: 12,
  },
  footerLeft: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
  },
  draftBtn: {
    paddingVertical: 6,
  },
  draftBtnText: {
    fontSize: 13,
    fontWeight: '500',
    textDecorationLine: 'underline',
  },
  footerRight: {
    flexDirection: 'row',
    alignItems: 'center',
    flexWrap: 'wrap',
    gap: 8,
  },
  schedulePillWrap: {
    flexDirection: 'row',
    alignItems: 'center',
    borderWidth: 1,
    borderRadius: 8,
    overflow: 'hidden',
  },
  scheduleBtnInner: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    paddingHorizontal: 12,
    paddingVertical: 9,
  },
  scheduleBtnText: {
    fontSize: 13,
  },
  scheduleClearBtn: {
    paddingHorizontal: 8,
    paddingVertical: 9,
    borderLeftColor: 'transparent',
    borderLeftWidth: 1,
  },
  postBtn: {
    paddingHorizontal: 18,
    paddingVertical: 10,
    borderRadius: 8,
    minWidth: 148,
    alignItems: 'center',
    justifyContent: 'center',
  },
  postBtnText: {
    fontSize: 13.5,
    fontWeight: '600',
  },
  mobileSubBar: {
    flexDirection: 'row',
    paddingHorizontal: 20,
    gap: 20,
    borderBottomWidth: 1,
  },
  mobileTab: {
    paddingVertical: 10,
    borderBottomWidth: 2,
    borderBottomColor: 'transparent',
  },
  mobileContent: {
    padding: 16,
    paddingBottom: 28,
  },
});
