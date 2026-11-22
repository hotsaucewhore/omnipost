import { Ionicons } from '@expo/vector-icons';
import { useRouter } from 'expo-router';
import React, { useEffect, useState } from 'react';
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
import { BioCustomLink, formatCompactNumber } from '../../shared/platforms';
import { useOmniPost } from '../context/OmniPostContext';

export function BioModal() {
  const router = useRouter();
  const {
    palette,
    activeWorkspace,
    bioConfig,
    bioModalOpen,
    closeBioModal,
    saveBioConfig,
  } = useOmniPost();

  const [slug, setSlug] = useState('');
  const [headline, setHeadline] = useState('');
  const [bio, setBio] = useState('');
  const [theme, setTheme] = useState<'paper' | 'graphite'>('paper');
  const [links, setLinks] = useState<BioCustomLink[]>([]);
  const [newLabel, setNewLabel] = useState('');
  const [newUrl, setNewUrl] = useState('');
  const [saving, setSaving] = useState(false);
  const [copied, setCopied] = useState(false);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);

  useEffect(() => {
    if (!bioModalOpen || !bioConfig) return;
    setSlug(bioConfig.slug);
    setHeadline(bioConfig.headline);
    setBio(bioConfig.bio);
    setTheme(bioConfig.theme);
    setLinks(bioConfig.customLinks || []);
    setErrorMsg(null);
  }, [bioModalOpen, bioConfig]);

  const handleAddLink = () => {
    if (!newLabel.trim() || !newUrl.trim()) return;
    const cleanUrl = /^https?:\/\//i.test(newUrl.trim())
      ? newUrl.trim()
      : `https://${newUrl.trim()}`;
    setLinks((prev) => [
      ...prev,
      {
        id: `lnk_${Date.now()}`,
        label: newLabel.trim(),
        url: cleanUrl,
        clicks: 0,
      },
    ]);
    setNewLabel('');
    setNewUrl('');
  };

  const handleSave = async () => {
    if (saving) return;
    setSaving(true);
    setErrorMsg(null);
    try {
      await saveBioConfig({
        slug,
        headline,
        bio,
        theme,
        customLinks: links,
      });
      closeBioModal();
    } catch (err: any) {
      setErrorMsg(err?.message || 'Could not save Link-in-Bio settings.');
    } finally {
      setSaving(false);
    }
  };

  const publicUrl = `${
    Platform.OS === 'web' && typeof window !== 'undefined'
      ? window.location.origin
      : 'http://localhost:8081'
  }/u/${slug || bioConfig?.slug || 'studio'}`;

  const handleCopyUrl = async () => {
    if (
      Platform.OS === 'web' &&
      typeof navigator !== 'undefined' &&
      navigator.clipboard?.writeText
    ) {
      try {
        await navigator.clipboard.writeText(publicUrl);
      } catch {
        // Ignore clipboard errors
      }
    }
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  return (
    <Modal
      visible={bioModalOpen}
      transparent
      animationType="fade"
      onRequestClose={closeBioModal}
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
                Link-in-Bio page · {activeWorkspace.name}
              </Text>
              <Text style={[styles.sub, { color: palette.textSecondary }]}>
                Public mobile landing page with pinned links & auto-synced post cards
              </Text>
            </View>
            <Pressable onPress={closeBioModal} style={{ padding: 4 }}>
              <Ionicons name="close" size={20} color={palette.textSecondary} />
            </Pressable>
          </View>

          <ScrollView style={{ maxHeight: 500 }}>
            <View style={styles.body}>
              {/* Live Attribution Strip */}
              <View
                style={[
                  styles.statsStrip,
                  {
                    backgroundColor: palette.surfaceSubtle,
                    borderColor: palette.border,
                  },
                ]}
              >
                <View style={{ flexDirection: 'row', gap: 20 }}>
                  <View>
                    <Text
                      style={{ fontSize: 11, color: palette.textMuted }}
                    >
                      Page views
                    </Text>
                    <Text
                      style={{
                        fontSize: 16,
                        fontWeight: '700',
                        color: palette.text,
                      }}
                    >
                      {formatCompactNumber(bioConfig?.totalViews ?? 0)}
                    </Text>
                  </View>
                  <View>
                    <Text
                      style={{ fontSize: 11, color: palette.textMuted }}
                    >
                      Attributed clicks
                    </Text>
                    <Text
                      style={{
                        fontSize: 16,
                        fontWeight: '700',
                        color: palette.accent,
                      }}
                    >
                      {formatCompactNumber(bioConfig?.totalClicks ?? 0)}
                    </Text>
                  </View>
                </View>

                <View style={{ flexDirection: 'row', gap: 8 }}>
                  <Pressable
                    onPress={() => void handleCopyUrl()}
                    style={[
                      styles.smallBtn,
                      {
                        borderColor: palette.border,
                        backgroundColor: palette.surface,
                      },
                    ]}
                  >
                    <Text
                      style={{
                        fontSize: 12,
                        fontWeight: '600',
                        color: copied ? palette.success : palette.text,
                      }}
                    >
                      {copied ? 'Copied ✓' : 'Copy link'}
                    </Text>
                  </Pressable>

                  <Pressable
                    onPress={() => {
                      closeBioModal();
                      router.push(
                        `/u/${bioConfig?.slug || slug || 'creatorstudio'}` as any
                      );
                    }}
                    style={[
                      styles.smallBtn,
                      {
                        borderColor: palette.borderStrong,
                        backgroundColor: palette.surface,
                      },
                    ]}
                  >
                    <Text
                      style={{
                        fontSize: 12,
                        fontWeight: '600',
                        color: palette.text,
                      }}
                    >
                      Open /u/{bioConfig?.slug || slug} ↗
                    </Text>
                  </Pressable>
                </View>
              </View>

              {/* Slug, Headline & Theme */}
              <View style={styles.rowInputs}>
                <View style={{ flex: 1, gap: 5 }}>
                  <Text
                    style={[styles.label, { color: palette.textSecondary }]}
                  >
                    Handle slug (/u/slug)
                  </Text>
                  <TextInput
                    style={[
                      styles.input,
                      {
                        color: palette.text,
                        backgroundColor: palette.surfaceSubtle,
                        borderColor: palette.borderStrong,
                      },
                    ]}
                    autoCapitalize="none"
                    value={slug}
                    onChangeText={setSlug}
                    placeholder="creatorstudio"
                    placeholderTextColor={palette.textMuted}
                  />
                </View>

                <View style={{ gap: 5 }}>
                  <Text
                    style={[styles.label, { color: palette.textSecondary }]}
                  >
                    Page theme
                  </Text>
                  <View style={{ flexDirection: 'row', gap: 6 }}>
                    {(['paper', 'graphite'] as const).map((t) => {
                      const active = theme === t;
                      return (
                        <Pressable
                          key={t}
                          onPress={() => setTheme(t)}
                          style={[
                            styles.smallBtn,
                            {
                              paddingVertical: 8,
                              backgroundColor: active
                                ? palette.ctaBg
                                : palette.surfaceSubtle,
                              borderColor: active
                                ? palette.ctaBg
                                : palette.border,
                            },
                          ]}
                        >
                          <Text
                            style={{
                              fontSize: 12,
                              fontWeight: '600',
                              color: active
                                ? palette.ctaText
                                : palette.textSecondary,
                            }}
                          >
                            {t === 'paper' ? 'Paper & Ink' : 'Matte Graphite'}
                          </Text>
                        </Pressable>
                      );
                    })}
                  </View>
                </View>
              </View>

              <View style={{ gap: 5 }}>
                <Text style={[styles.label, { color: palette.textSecondary }]}>
                  Headline & short bio
                </Text>
                <TextInput
                  style={[
                    styles.input,
                    {
                      color: palette.text,
                      backgroundColor: palette.surfaceSubtle,
                      borderColor: palette.borderStrong,
                    },
                  ]}
                  value={headline}
                  onChangeText={setHeadline}
                  placeholder="Studio or brand title"
                  placeholderTextColor={palette.textMuted}
                />
                <TextInput
                  multiline
                  style={[
                    styles.input,
                    {
                      minHeight: 54,
                      color: palette.text,
                      backgroundColor: palette.surfaceSubtle,
                      borderColor: palette.border,
                    },
                  ]}
                  value={bio}
                  onChangeText={setBio}
                  placeholder="One-sentence bio shown under your name"
                  placeholderTextColor={palette.textMuted}
                />
              </View>

              {/* Custom Pinned Links */}
              <View style={{ gap: 8 }}>
                <Text style={[styles.label, { color: palette.textSecondary }]}>
                  Pinned CTA links ({links.length})
                </Text>

                {links.map((lnk) => (
                  <View
                    key={lnk.id}
                    style={[
                      styles.linkRow,
                      {
                        borderColor: palette.border,
                        backgroundColor: palette.surfaceSubtle,
                      },
                    ]}
                  >
                    <View style={{ flex: 1 }}>
                      <Text
                        style={{
                          fontSize: 13,
                          fontWeight: '600',
                          color: palette.text,
                        }}
                        numberOfLines={1}
                      >
                        {lnk.label}
                      </Text>
                      <Text
                        style={{ fontSize: 11.5, color: palette.textMuted }}
                        numberOfLines={1}
                      >
                        {lnk.url} · {lnk.clicks} clicks
                      </Text>
                    </View>
                    <Pressable
                      onPress={() =>
                        setLinks((prev) => prev.filter((x) => x.id !== lnk.id))
                      }
                      style={{ padding: 4 }}
                    >
                      <Ionicons
                        name="trash-outline"
                        size={15}
                        color={palette.textMuted}
                      />
                    </Pressable>
                  </View>
                ))}

                <View style={styles.addLinkRow}>
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
                    placeholder="Button label (e.g. Free Gear Guide)"
                    placeholderTextColor={palette.textMuted}
                    value={newLabel}
                    onChangeText={setNewLabel}
                  />
                  <TextInput
                    style={[
                      styles.input,
                      {
                        flex: 1.1,
                        color: palette.text,
                        backgroundColor: palette.surface,
                        borderColor: palette.borderStrong,
                      },
                    ]}
                    autoCapitalize="none"
                    placeholder="https://..."
                    placeholderTextColor={palette.textMuted}
                    value={newUrl}
                    onChangeText={setNewUrl}
                  />
                  <Pressable
                    disabled={!newLabel.trim() || !newUrl.trim()}
                    onPress={handleAddLink}
                    style={[
                      styles.smallBtn,
                      {
                        paddingVertical: 8,
                        backgroundColor:
                          newLabel.trim() && newUrl.trim()
                            ? palette.surfaceMuted
                            : palette.surfaceSubtle,
                        borderColor: palette.borderStrong,
                      },
                    ]}
                  >
                    <Text
                      style={{
                        fontSize: 12,
                        fontWeight: '600',
                        color: palette.text,
                      }}
                    >
                      + Add
                    </Text>
                  </Pressable>
                </View>
              </View>

              {errorMsg && (
                <Text style={{ fontSize: 12, color: palette.danger }}>
                  {errorMsg}
                </Text>
              )}
            </View>
          </ScrollView>

          <View
            style={[styles.footer, { borderTopColor: palette.border }]}
          >
            <Text style={{ fontSize: 11.5, color: palette.textMuted }}>
              Published posts with 1st-comment links appear automatically
            </Text>
            <Pressable
              disabled={saving}
              onPress={() => void handleSave()}
              style={[styles.saveBtn, { backgroundColor: palette.ctaBg }]}
            >
              <Text style={{ fontSize: 13, fontWeight: '600', color: palette.ctaText }}>
                {saving ? 'Saving…' : 'Save bio page'}
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
    backgroundColor: 'rgba(15, 15, 14, 0.5)',
    alignItems: 'center',
    justifyContent: 'center',
    padding: 16,
  },
  dialog: {
    width: '100%',
    maxWidth: 590,
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
  },
  body: {
    padding: 18,
    gap: 14,
  },
  statsStrip: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    flexWrap: 'wrap',
    gap: 12,
    padding: 13,
    borderRadius: 10,
    borderWidth: 1,
  },
  smallBtn: {
    paddingHorizontal: 10,
    paddingVertical: 6,
    borderRadius: 7,
    borderWidth: 1,
    alignItems: 'center',
    justifyContent: 'center',
  },
  rowInputs: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 12,
  },
  label: {
    fontSize: 12,
    fontWeight: '600',
  },
  input: {
    minWidth: 140,
    borderWidth: 1,
    borderRadius: 8,
    paddingHorizontal: 11,
    paddingVertical: 8,
    fontSize: 13,
  },
  linkRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    paddingHorizontal: 12,
    paddingVertical: 9,
    borderRadius: 8,
    borderWidth: 1,
  },
  addLinkRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 8,
    alignItems: 'center',
  },
  footer: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    flexWrap: 'wrap',
    gap: 10,
    paddingHorizontal: 20,
    paddingVertical: 12,
    borderTopWidth: 1,
  },
  saveBtn: {
    paddingHorizontal: 16,
    paddingVertical: 8,
    borderRadius: 7,
  },
});
