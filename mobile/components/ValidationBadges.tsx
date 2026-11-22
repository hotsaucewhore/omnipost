import { Ionicons } from '@expo/vector-icons';
import React from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import { PLATFORM_SPECS, PlatformId } from '../../shared/platforms';
import { PlatformValidationSummary } from '../../shared/validator';
import { useOmniPost } from '../context/OmniPostContext';

interface Props {
  validations: Record<PlatformId, PlatformValidationSummary>;
  focusedPlatform?: PlatformId | 'master';
  onQuickDisablePlatform?: (id: PlatformId) => void;
  onQuickAutoReframe?: () => void;
  onQuickTrimToSec?: (maxSec: number) => void;
  onQuickMatchPostType?: () => void;
  onSelectPlatformTab?: (id: PlatformId) => void;
}

export function ValidationBadges({
  validations,
  focusedPlatform = 'master',
  onQuickDisablePlatform,
  onQuickAutoReframe,
  onQuickTrimToSec,
  onQuickMatchPostType,
  onSelectPlatformTab,
}: Props) {
  const { palette } = useOmniPost();

  const targetIds =
    focusedPlatform === 'master'
      ? (Object.keys(validations) as PlatformId[]).filter(
          (id) => validations[id].enabled
        )
      : validations[focusedPlatform]?.enabled
      ? [focusedPlatform]
      : [];

  const rawIssues = targetIds
    .flatMap((id) => validations[id].issues)
    .filter(
      (iss) =>
        iss.code !== 'VIDEO_MISSING' &&
        iss.code !== 'TEXT_EMPTY' &&
        (iss.severity === 'error' || iss.severity === 'warning')
    );

  if (rawIssues.length === 0) {
    return null;
  }

  // Collapse multiple MEDIA_REQUIRED_FOR_PLATFORM issues into a single calm line
  const mediaReqPlatforms = rawIssues
    .filter((i) => i.code === 'MEDIA_REQUIRED_FOR_PLATFORM')
    .map((i) => PLATFORM_SPECS[i.platformId].shortName);
  const otherIssues = rawIssues.filter(
    (i) => i.code !== 'MEDIA_REQUIRED_FOR_PLATFORM'
  );

  return (
    <View
      style={[
        styles.wrap,
        {
          borderTopColor: palette.border,
          backgroundColor: palette.surfaceSubtle,
        },
      ]}
    >
      {mediaReqPlatforms.length > 0 && (
        <View style={styles.row}>
          <Ionicons
            name="alert-circle-outline"
            size={15}
            color={palette.danger}
            style={{ marginTop: 1 }}
          />
          <Text style={[styles.msg, { color: palette.text }]}>
            <Text style={{ fontWeight: '600', color: palette.danger }}>
              {mediaReqPlatforms.join(', ')}:{' '}
            </Text>
            Requires a photo or video (cannot post text-only).
          </Text>
          {onQuickMatchPostType && (
            <Pressable
              onPress={onQuickMatchPostType}
              style={[
                styles.fixLink,
                {
                  borderColor: palette.text,
                  backgroundColor: palette.surface,
                },
              ]}
            >
              <Text style={[styles.fixLinkText, { color: palette.text }]}>
                Switch to text accounts
              </Text>
            </Pressable>
          )}
        </View>
      )}

      {otherIssues.map((issue, idx) => {
        const spec = PLATFORM_SPECS[issue.platformId];
        const isErr = issue.severity === 'error';
        const tone = isErr ? palette.danger : palette.warning;

        return (
          <View
            key={`${issue.platformId}_${issue.code}_${idx}`}
            style={styles.row}
          >
            <Ionicons
              name={
                isErr ? 'alert-circle-outline' : 'information-circle-outline'
              }
              size={15}
              color={tone}
              style={{ marginTop: 1 }}
            />
            <Text style={[styles.msg, { color: palette.text }]}>
              <Text style={{ fontWeight: '600', color: tone }}>
                {spec.shortName}:{' '}
              </Text>
              {issue.message}
            </Text>

            <View style={styles.actionsWrap}>
              {(issue.code === 'YT_SHORTS_MUST_BE_VERTICAL' ||
                issue.code === 'TIKTOK_HORIZONTAL' ||
                issue.code === 'IG_HORIZONTAL') &&
                onQuickAutoReframe && (
                  <Pressable
                    onPress={onQuickAutoReframe}
                    style={[
                      styles.fixLink,
                      {
                        borderColor: palette.text,
                        backgroundColor: palette.surface,
                      },
                    ]}
                  >
                    <Text style={[styles.fixLinkText, { color: palette.text }]}>
                      Auto-reframe 9:16
                    </Text>
                  </Pressable>
                )}

              {issue.code === 'DURATION_TOO_LONG' && onQuickTrimToSec && (
                <Pressable
                  onPress={() =>
                    onQuickTrimToSec(Math.max(1, spec.maxDurationSec - 2))
                  }
                  style={[
                    styles.fixLink,
                    {
                      borderColor: palette.text,
                      backgroundColor: palette.surface,
                    },
                  ]}
                >
                  <Text style={[styles.fixLinkText, { color: palette.text }]}>
                    Trim to fit
                  </Text>
                </Pressable>
              )}

              {issue.code === 'CAPTION_TOO_LONG' && onSelectPlatformTab && (
                <Pressable
                  onPress={() => onSelectPlatformTab(issue.platformId)}
                  style={[
                    styles.fixLink,
                    {
                      borderColor: palette.text,
                      backgroundColor: palette.surface,
                    },
                  ]}
                >
                  <Text style={[styles.fixLinkText, { color: palette.text }]}>
                    Shorten for {spec.shortName}
                  </Text>
                </Pressable>
              )}

              {isErr && issue.field === 'video' && onQuickDisablePlatform && (
                <Pressable
                  onPress={() => onQuickDisablePlatform(issue.platformId)}
                  style={[styles.fixLink, { borderColor: palette.borderStrong }]}
                >
                  <Text
                    style={[
                      styles.fixLinkText,
                      { color: palette.textSecondary },
                    ]}
                  >
                    Unselect {spec.shortName}
                  </Text>
                </Pressable>
              )}
            </View>
          </View>
        );
      })}
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: {
    borderTopWidth: 1,
    paddingHorizontal: 20,
    paddingVertical: 12,
    gap: 8,
  },
  row: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    flexWrap: 'wrap',
    gap: 8,
  },
  msg: {
    flex: 1,
    minWidth: 180,
    fontSize: 13,
    lineHeight: 18,
  },
  actionsWrap: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
  },
  fixLink: {
    borderWidth: 1,
    borderRadius: 6,
    paddingHorizontal: 8,
    paddingVertical: 3,
  },
  fixLinkText: {
    fontSize: 12,
    fontWeight: '600',
  },
});
