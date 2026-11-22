import { Ionicons } from '@expo/vector-icons';
import { useRouter } from 'expo-router';
import React, { useMemo, useState } from 'react';
import {
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  useWindowDimensions,
  View,
} from 'react-native';
import {
  formatCompactNumber,
  PLATFORM_ORDER,
  PLATFORM_SPECS,
  PublishJob,
} from '../../shared/platforms';
import { PLATFORM_ICONS } from '../constants/theme';
import { useOmniPost } from '../context/OmniPostContext';
import { ScheduleModal } from './ScheduleModal';

type CalendarMode = 'month' | 'week';

const WEEKDAY_LABELS = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];

function toDayKey(d: Date): string {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(
    d.getDate()
  ).padStart(2, '0')}`;
}

function parseDayKey(key: string): Date {
  const [y, m, day] = key.split('-').map(Number);
  return new Date(y, (m || 1) - 1, day || 1, 9, 30, 0, 0);
}

function startOfDay(d: Date): Date {
  return new Date(d.getFullYear(), d.getMonth(), d.getDate(), 0, 0, 0, 0);
}

function formatCompactTime(iso?: string): string {
  if (!iso) return '';
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return '';
  const h = d.getHours();
  const m = d.getMinutes();
  const suffix = h >= 12 ? 'p' : 'a';
  const h12 = h % 12 || 12;
  return m === 0
    ? `${h12}${suffix}`
    : `${h12}:${String(m).padStart(2, '0')}${suffix}`;
}

function buildMonthGrid(cursor: Date): Date[][] {
  const year = cursor.getFullYear();
  const month = cursor.getMonth();
  const firstOfMonth = new Date(year, month, 1);
  const lastOfMonth = new Date(year, month + 1, 0);

  const start = new Date(firstOfMonth);
  start.setDate(firstOfMonth.getDate() - firstOfMonth.getDay());

  const end = new Date(lastOfMonth);
  end.setDate(lastOfMonth.getDate() + (6 - lastOfMonth.getDay()));

  const weeks: Date[][] = [];
  const iter = new Date(start);
  while (iter <= end) {
    const row: Date[] = [];
    for (let i = 0; i < 7; i++) {
      row.push(new Date(iter));
      iter.setDate(iter.getDate() + 1);
    }
    weeks.push(row);
  }
  return weeks;
}

function buildWeekGrid(cursor: Date): Date[][] {
  const start = new Date(cursor);
  start.setDate(cursor.getDate() - cursor.getDay());
  const row: Date[] = [];
  for (let i = 0; i < 7; i++) {
    const d = new Date(start);
    d.setDate(start.getDate() + i);
    row.push(d);
  }
  return [row];
}

interface Props {
  onShareReviewLink: (job: PublishJob) => Promise<void>;
  copiedJobId: string | null;
}

export function ContentCalendar({ onShareReviewLink, copiedJobId }: Props) {
  const router = useRouter();
  const { width } = useWindowDimensions();
  const isCompact = width < 700;

  const {
    palette,
    activeWorkspace,
    effectiveRole,
    openBatchModal,
    submitTeamApproval,
    jobs,
    analytics,
    setEditingJob,
    setPrefillScheduleIso,
    rescheduleJob,
    publishScheduledNow,
    deleteJob,
  } = useOmniPost();

  const today = useMemo(() => startOfDay(new Date()), []);
  const todayKey = useMemo(() => toDayKey(today), [today]);

  const [mode, setMode] = useState<CalendarMode>('month');
  const [cursorDate, setCursorDate] = useState<Date>(() => new Date());

  // Default selected day to tomorrow if tomorrow has a scheduled post, else today
  const [selectedDayKey, setSelectedDayKey] = useState<string>(() => {
    const tmr = new Date();
    tmr.setDate(tmr.getDate() + 1);
    return toDayKey(tmr);
  });

  const [reschedulingJob, setReschedulingJob] = useState<PublishJob | null>(
    null
  );

  // Map every scheduled or published job onto its calendar day key
  const jobsByDay = useMemo(() => {
    const map = new Map<string, PublishJob[]>();
    for (const job of jobs) {
      const lc = job.lifecycle ?? 'active';
      if (lc === 'draft') continue;
      const dateStr = lc === 'scheduled' ? job.scheduledAt : job.createdAt;
      if (!dateStr) continue;
      const d = new Date(dateStr);
      if (Number.isNaN(d.getTime())) continue;
      const key = toDayKey(d);
      const list = map.get(key) ?? [];
      list.push(job);
      map.set(key, list);
    }
    for (const [, list] of map) {
      list.sort((a, b) => {
        const ta = a.lifecycle === 'scheduled' ? a.scheduledAt ?? '' : a.createdAt;
        const tb = b.lifecycle === 'scheduled' ? b.scheduledAt ?? '' : b.createdAt;
        return ta.localeCompare(tb);
      });
    }
    return map;
  }, [jobs]);

  const draftJobs = useMemo(
    () => jobs.filter((j) => j.lifecycle === 'draft'),
    [jobs]
  );

  const weeks = useMemo(
    () =>
      mode === 'month' ? buildMonthGrid(cursorDate) : buildWeekGrid(cursorDate),
    [mode, cursorDate]
  );

  const selectedDateObj = useMemo(
    () => parseDayKey(selectedDayKey),
    [selectedDayKey]
  );
  const selectedDayJobs = jobsByDay.get(selectedDayKey) ?? [];
  const isSelectedFutureOrToday =
    startOfDay(selectedDateObj).getTime() >= today.getTime();

  // Compute 3 smart Best-Time-to-Post slots for the selected day
  const bestTimeSlots = useMemo(() => {
    const topChannelName = analytics.topPlatform
      ? PLATFORM_SPECS[analytics.topPlatform.platformId].shortName
      : 'Short-form & feed';

    const templates = [
      {
        label: '9:30 AM',
        note: `Morning peak (${topChannelName})`,
        h: 9,
        m: 30,
      },
      {
        label: '12:15 PM',
        note: 'Midday break window',
        h: 12,
        m: 15,
      },
      {
        label: '6:00 PM',
        note: 'Evening engagement peak',
        h: 18,
        m: 0,
      },
    ];

    const nowMs = Date.now();
    return templates.map((tpl) => {
      const slotDate = new Date(
        selectedDateObj.getFullYear(),
        selectedDateObj.getMonth(),
        selectedDateObj.getDate(),
        tpl.h,
        tpl.m,
        0,
        0
      );
      const isPastSlot = slotDate.getTime() < nowMs + 5 * 60_000;
      const isBooked = selectedDayJobs.some((j) => {
        if (j.lifecycle !== 'scheduled' || !j.scheduledAt) return false;
        const diffMin =
          Math.abs(new Date(j.scheduledAt).getTime() - slotDate.getTime()) /
          60_000;
        return diffMin <= 45;
      });
      return {
        ...tpl,
        iso: slotDate.toISOString(),
        isPastSlot,
        isBooked,
      };
    });
  }, [selectedDateObj, selectedDayJobs, analytics.topPlatform]);

  const pickSmartIsoForDate = (day: Date): string => {
    const candidates = [
      [9, 30],
      [12, 15],
      [18, 0],
      [20, 0],
    ];
    const dayJobs = jobsByDay.get(toDayKey(day)) ?? [];
    const nowMs = Date.now();

    for (const [h, m] of candidates) {
      const candidate = new Date(
        day.getFullYear(),
        day.getMonth(),
        day.getDate(),
        h,
        m,
        0,
        0
      );
      if (candidate.getTime() < nowMs + 10 * 60_000) continue;
      const collision = dayJobs.some((j) => {
        if (!j.scheduledAt) return false;
        return (
          Math.abs(new Date(j.scheduledAt).getTime() - candidate.getTime()) <
          45 * 60_000
        );
      });
      if (!collision) return candidate.toISOString();
    }

    const fallback = new Date(
      day.getFullYear(),
      day.getMonth(),
      day.getDate(),
      9,
      30,
      0,
      0
    );
    if (fallback.getTime() < nowMs + 10 * 60_000) {
      return new Date(nowMs + 60 * 60_000).toISOString();
    }
    return fallback.toISOString();
  };

  const handleStartNewPostAtIso = (iso: string) => {
    setPrefillScheduleIso(iso);
    router.push('/');
  };

  const handleStepPeriod = (dir: -1 | 1) => {
    setCursorDate((prev) => {
      const next = new Date(prev);
      if (mode === 'month') {
        next.setMonth(prev.getMonth() + dir, 1);
      } else {
        next.setDate(prev.getDate() + dir * 7);
      }
      return next;
    });
  };

  const handleJumpToday = () => {
    const now = new Date();
    setCursorDate(now);
    setSelectedDayKey(toDayKey(now));
  };

  const periodHeading = useMemo(() => {
    if (mode === 'month') {
      return cursorDate.toLocaleDateString([], {
        month: 'long',
        year: 'numeric',
      });
    }
    const row = weeks[0] ?? [];
    if (row.length < 7) return '';
    const first = row[0].toLocaleDateString([], {
      month: 'short',
      day: 'numeric',
    });
    const last = row[6].toLocaleDateString([], {
      month: 'short',
      day: 'numeric',
      year: 'numeric',
    });
    return `${first} – ${last}`;
  }, [mode, cursorDate, weeks]);

  const renderGridBody = () => (
    <View style={{ minWidth: isCompact ? 630 : undefined }}>
      {/* Weekday Header Row */}
      <View
        style={[
          styles.weekdayRow,
          {
            borderBottomColor: palette.border,
            backgroundColor: palette.surfaceSubtle,
          },
        ]}
      >
        {WEEKDAY_LABELS.map((w) => (
          <View key={w} style={styles.weekdayCell}>
            <Text style={[styles.weekdayText, { color: palette.textMuted }]}>
              {w}
            </Text>
          </View>
        ))}
      </View>

      {/* Week Rows */}
      {weeks.map((week, wIdx) => (
        <View
          key={`wk_${wIdx}`}
          style={[
            styles.weekRow,
            wIdx < weeks.length - 1 && {
              borderBottomWidth: 1,
              borderBottomColor: palette.border,
            },
          ]}
        >
          {week.map((day, dIdx) => {
            const key = toDayKey(day);
            const isToday = key === todayKey;
            const isSelected = key === selectedDayKey;
            const inCurrentMonth =
              mode === 'week' || day.getMonth() === cursorDate.getMonth();
            const isFutureOrToday =
              startOfDay(day).getTime() >= today.getTime();
            const cellJobs = jobsByDay.get(key) ?? [];
            const maxVisiblePills = mode === 'week' ? 5 : 3;
            const shownPills = cellJobs.slice(0, maxVisiblePills);
            const overflowCount = cellJobs.length - shownPills.length;

            return (
              <Pressable
                key={key}
                onPress={() => setSelectedDayKey(key)}
                style={[
                  styles.dayCell,
                  { minHeight: mode === 'week' ? 168 : 106 },
                  dIdx < 6 && {
                    borderRightWidth: 1,
                    borderRightColor: palette.border,
                  },
                  isSelected && {
                    backgroundColor: palette.surfaceSubtle,
                  },
                  !inCurrentMonth && { opacity: 0.45 },
                ]}
              >
                <View style={styles.dayCellTop}>
                  <View
                    style={[
                      styles.dayNumBadge,
                      isToday && { backgroundColor: palette.text },
                      isSelected &&
                        !isToday && {
                          borderWidth: 1,
                          borderColor: palette.text,
                        },
                    ]}
                  >
                    <Text
                      style={[
                        styles.dayNumText,
                        {
                          color: isToday ? palette.surface : palette.text,
                          fontWeight: isToday || isSelected ? '700' : '500',
                        },
                      ]}
                    >
                      {day.getDate()}
                    </Text>
                  </View>

                  {isFutureOrToday && (
                    <Pressable
                      onPress={(e) => {
                        e.stopPropagation();
                        handleStartNewPostAtIso(pickSmartIsoForDate(day));
                      }}
                      accessibilityLabel={`Schedule post on ${key}`}
                      style={[
                        styles.cellAddBtn,
                        {
                          borderColor: palette.border,
                          backgroundColor: palette.surface,
                        },
                      ]}
                    >
                      <Ionicons
                        name="add"
                        size={12}
                        color={palette.textSecondary}
                      />
                    </Pressable>
                  )}
                </View>

                <View style={styles.cellPillsStack}>
                  {shownPills.map((job) => {
                    const isScheduled = job.lifecycle === 'scheduled';
                    const dotColor = isScheduled
                      ? job.approval?.status === 'approved'
                        ? palette.success
                        : job.approval?.status === 'changes_requested'
                        ? palette.warning
                        : palette.accent
                      : palette.success;
                    const firstEnabled = PLATFORM_ORDER.find(
                      (pid) => job.overrides[pid]?.enabled
                    );
                    const timeStr = formatCompactTime(
                      isScheduled ? job.scheduledAt : job.createdAt
                    );
                    const label =
                      job.master.title ||
                      job.master.caption.split('\n')[0] ||
                      job.video?.fileName ||
                      'Post';

                    return (
                      <View
                        key={job.id}
                        style={[
                          styles.postPill,
                          {
                            backgroundColor: isScheduled
                              ? palette.surface
                              : palette.surfaceMuted,
                            borderColor: palette.border,
                          },
                        ]}
                      >
                        <View
                          style={[
                            styles.pillDot,
                            { backgroundColor: dotColor },
                          ]}
                        />
                        {firstEnabled && (
                          <Ionicons
                            name={PLATFORM_ICONS[firstEnabled]}
                            size={10}
                            color={
                              firstEnabled === 'x' || firstEnabled === 'threads'
                                ? palette.text
                                : PLATFORM_SPECS[firstEnabled].brandColor
                            }
                          />
                        )}
                        <Text
                          style={[styles.pillText, { color: palette.text }]}
                          numberOfLines={1}
                        >
                          {timeStr ? `${timeStr} ` : ''}
                          {label}
                        </Text>
                      </View>
                    );
                  })}

                  {overflowCount > 0 && (
                    <Text
                      style={[styles.moreCount, { color: palette.textMuted }]}
                    >
                      +{overflowCount} more
                    </Text>
                  )}
                </View>
              </Pressable>
            );
          })}
        </View>
      ))}
    </View>
  );

  return (
    <View style={{ gap: 18 }}>
      <ScheduleModal
        visible={Boolean(reschedulingJob)}
        initialIso={reschedulingJob?.scheduledAt}
        onClose={() => setReschedulingJob(null)}
        onApplySchedule={(nextIso) => {
          if (!reschedulingJob) return;
          if (nextIso) {
            void rescheduleJob(reschedulingJob.id, nextIso, 'scheduled');
            setSelectedDayKey(toDayKey(new Date(nextIso)));
          } else {
            void rescheduleJob(reschedulingJob.id, null, 'draft');
          }
          setReschedulingJob(null);
        }}
      />

      {/* Main Calendar Sheet */}
      <View
        style={[
          styles.calendarSheet,
          {
            backgroundColor: palette.surface,
            borderColor: palette.border,
          },
        ]}
      >
        {/* Calendar Toolbar */}
        <View
          style={[
            styles.toolbar,
            { borderBottomColor: palette.border },
          ]}
        >
          <View style={styles.toolbarLeft}>
            <Text style={[styles.monthTitle, { color: palette.text }]}>
              {periodHeading}
            </Text>

            <View style={styles.navArrowsGroup}>
              <Pressable
                onPress={() => handleStepPeriod(-1)}
                style={[
                  styles.navBtn,
                  {
                    borderColor: palette.border,
                    backgroundColor: palette.surfaceSubtle,
                  },
                ]}
              >
                <Ionicons
                  name="chevron-back"
                  size={14}
                  color={palette.textSecondary}
                />
              </Pressable>

              <Pressable
                onPress={handleJumpToday}
                style={[
                  styles.todayBtn,
                  {
                    borderColor: palette.border,
                    backgroundColor: palette.surfaceSubtle,
                  },
                ]}
              >
                <Text style={[styles.todayBtnText, { color: palette.text }]}>
                  Today
                </Text>
              </Pressable>

              <Pressable
                onPress={() => handleStepPeriod(1)}
                style={[
                  styles.navBtn,
                  {
                    borderColor: palette.border,
                    backgroundColor: palette.surfaceSubtle,
                  },
                ]}
              >
                <Ionicons
                  name="chevron-forward"
                  size={14}
                  color={palette.textSecondary}
                />
              </Pressable>
            </View>
          </View>

          <View style={styles.toolbarRight}>
            <View style={styles.legendRow}>
              <View style={styles.legendItem}>
                <View
                  style={[
                    styles.pillDot,
                    { backgroundColor: palette.accent },
                  ]}
                />
                <Text
                  style={[styles.legendText, { color: palette.textMuted }]}
                >
                  Scheduled
                </Text>
              </View>
              <View style={styles.legendItem}>
                <View
                  style={[
                    styles.pillDot,
                    { backgroundColor: palette.success },
                  ]}
                />
                <Text
                  style={[styles.legendText, { color: palette.textMuted }]}
                >
                  Approved / Sent
                </Text>
              </View>
            </View>

            <View
              style={[
                styles.modeToggle,
                {
                  borderColor: palette.border,
                  backgroundColor: palette.surfaceSubtle,
                },
              ]}
            >
              {(
                [
                  ['month', 'Month'],
                  ['week', 'Week'],
                ] as [CalendarMode, string][]
              ).map(([val, label]) => {
                const active = mode === val;
                return (
                  <Pressable
                    key={val}
                    onPress={() => setMode(val)}
                    style={[
                      styles.modeBtn,
                      active && { backgroundColor: palette.surface },
                    ]}
                  >
                    <Text
                      style={[
                        styles.modeBtnText,
                        {
                          color: active ? palette.text : palette.textSecondary,
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

            <Pressable
              onPress={openBatchModal}
              style={[
                styles.smallOutlineBtn,
                {
                  borderColor: palette.borderStrong,
                  backgroundColor: palette.surface,
                },
              ]}
            >
              <Text style={[styles.smallOutlineText, { color: palette.text }]}>
                + Batch
              </Text>
            </Pressable>
          </View>
        </View>

        {isCompact ? (
          <ScrollView horizontal showsHorizontalScrollIndicator={false}>
            {renderGridBody()}
          </ScrollView>
        ) : (
          renderGridBody()
        )}
      </View>

      {/* Selected Day Inspector + Best-Time-to-Post Slots */}
      <View
        style={[
          styles.inspectorSheet,
          {
            backgroundColor: palette.surface,
            borderColor: palette.border,
          },
        ]}
      >
        <View
          style={[
            styles.inspectorHead,
            { borderBottomColor: palette.border },
          ]}
        >
          <View style={{ gap: 2 }}>
            <Text style={[styles.inspectorTitle, { color: palette.text }]}>
              {selectedDateObj.toLocaleDateString([], {
                weekday: 'long',
                month: 'long',
                day: 'numeric',
              })}
            </Text>
            <Text
              style={[styles.inspectorSub, { color: palette.textSecondary }]}
            >
              {selectedDayJobs.length === 0
                ? 'Open day — pick a recommended slot below to schedule a post'
                : `${selectedDayJobs.length} ${
                    selectedDayJobs.length === 1 ? 'post' : 'posts'
                  } on this date`}
            </Text>
          </View>

          {isSelectedFutureOrToday && (
            <Pressable
              onPress={() =>
                handleStartNewPostAtIso(pickSmartIsoForDate(selectedDateObj))
              }
              style={[
                styles.scheduleDayBtn,
                { backgroundColor: palette.ctaBg },
              ]}
            >
              <Ionicons name="add" size={14} color={palette.ctaText} />
              <Text
                style={[styles.scheduleDayBtnText, { color: palette.ctaText }]}
              >
                Schedule on this day
              </Text>
            </Pressable>
          )}
        </View>

        {/* Smart Best-Time-to-Post Windows */}
        {isSelectedFutureOrToday && (
          <View
            style={[
              styles.slotsSection,
              {
                borderBottomColor: palette.border,
                backgroundColor: palette.surfaceSubtle,
              },
            ]}
          >
            <Text
              style={[styles.slotsSectionLabel, { color: palette.textSecondary }]}
            >
              Recommended windows for this day
            </Text>

            <View style={styles.slotsRow}>
              {bestTimeSlots.map((slot) => {
                const disabled = slot.isPastSlot || slot.isBooked;
                return (
                  <Pressable
                    key={slot.label}
                    disabled={disabled}
                    onPress={() => handleStartNewPostAtIso(slot.iso)}
                    style={[
                      styles.slotCard,
                      {
                        backgroundColor: palette.surface,
                        borderColor: slot.isBooked
                          ? palette.success
                          : palette.border,
                        opacity: slot.isPastSlot ? 0.45 : 1,
                      },
                    ]}
                  >
                    <View style={styles.slotCardTop}>
                      <Text
                        style={[styles.slotTimeText, { color: palette.text }]}
                      >
                        {slot.label}
                      </Text>
                      <Text
                        style={{
                          fontSize: 11,
                          fontWeight: '600',
                          color: slot.isBooked
                            ? palette.success
                            : palette.accent,
                        }}
                      >
                        {slot.isBooked
                          ? '✓ Booked'
                          : slot.isPastSlot
                          ? 'Passed'
                          : '+ Schedule'}
                      </Text>
                    </View>
                    <Text
                      style={[styles.slotNoteText, { color: palette.textMuted }]}
                    >
                      {slot.note}
                    </Text>
                  </Pressable>
                );
              })}
            </View>
          </View>
        )}

        {/* 1-Click Drop Saved Draft onto Selected Day */}
        {isSelectedFutureOrToday && draftJobs.length > 0 && (
          <View
            style={[
              styles.draftAssignSection,
              { borderBottomColor: palette.border },
            ]}
          >
            <Text
              style={[styles.slotsSectionLabel, { color: palette.textMuted }]}
            >
              Unscheduled drafts — click to place onto{' '}
              {selectedDateObj.toLocaleDateString([], {
                month: 'short',
                day: 'numeric',
              })}
            </Text>
            <View style={{ gap: 7 }}>
              {draftJobs.slice(0, 3).map((draft) => {
                const targetIso = pickSmartIsoForDate(selectedDateObj);
                return (
                  <View
                    key={draft.id}
                    style={[
                      styles.draftQuickRow,
                      {
                        borderColor: palette.border,
                        backgroundColor: palette.surfaceSubtle,
                      },
                    ]}
                  >
                    <Text
                      style={[styles.draftQuickTitle, { color: palette.text }]}
                      numberOfLines={1}
                    >
                      {draft.master.title ||
                        draft.master.caption ||
                        'Untitled draft'}
                    </Text>
                    <Pressable
                      onPress={() =>
                        void rescheduleJob(draft.id, targetIso, 'scheduled')
                      }
                      style={[
                        styles.placeDraftBtn,
                        {
                          borderColor: palette.borderStrong,
                          backgroundColor: palette.surface,
                        },
                      ]}
                    >
                      <Text
                        style={[
                          styles.placeDraftBtnText,
                          { color: palette.text },
                        ]}
                      >
                        Place @ {formatCompactTime(targetIso)}
                      </Text>
                    </Pressable>
                  </View>
                );
              })}
            </View>
          </View>
        )}

        {/* Day's Posts List */}
        {selectedDayJobs.length > 0 && (
          <View style={styles.dayPostsList}>
            {selectedDayJobs.map((job, idx) => {
              const isScheduled = job.lifecycle === 'scheduled';
              const enabled = PLATFORM_ORDER.filter(
                (pid) => job.overrides[pid]?.enabled
              );
              const totalViews = Object.values(job.results).reduce(
                (acc, r) => acc + (r?.metrics?.views ?? 0),
                0
              );

              return (
                <View
                  key={job.id}
                  style={[
                    styles.dayPostRow,
                    idx > 0 && {
                      borderTopWidth: 1,
                      borderTopColor: palette.border,
                    },
                  ]}
                >
                  <View style={{ flex: 1, gap: 4 }}>
                    <View style={styles.dayPostMetaLine}>
                      <Text
                        style={[
                          styles.dayPostTime,
                          {
                            color: isScheduled
                              ? palette.accent
                              : palette.success,
                          },
                        ]}
                      >
                        {isScheduled
                          ? `Scheduled · ${new Date(
                              job.scheduledAt!
                            ).toLocaleTimeString([], {
                              hour: 'numeric',
                              minute: '2-digit',
                            })}`
                          : `Published · ${new Date(
                              job.createdAt
                            ).toLocaleTimeString([], {
                              hour: 'numeric',
                              minute: '2-digit',
                            })}`}
                      </Text>

                      <View style={styles.dayIconsRow}>
                        {enabled.map((pid) => (
                          <Ionicons
                            key={pid}
                            name={PLATFORM_ICONS[pid]}
                            size={13}
                            color={
                              pid === 'x' || pid === 'threads'
                                ? palette.text
                                : PLATFORM_SPECS[pid].brandColor
                            }
                          />
                        ))}
                      </View>

                      {job.approval && (
                        <Pressable
                          onPress={() =>
                            router.push(
                              `/review/${job.approval!.shareToken}` as any
                            )
                          }
                        >
                          <Text
                            style={{
                              fontSize: 11.5,
                              fontWeight: '600',
                              textDecorationLine: 'underline',
                              color:
                                job.approval.status === 'approved'
                                  ? palette.success
                                  : job.approval.status === 'changes_requested'
                                  ? palette.warning
                                  : palette.textSecondary,
                            }}
                          >
                            {job.approval.status === 'approved'
                              ? `✓ Approved${
                                  job.approval.reviewerName
                                    ? ` (${job.approval.reviewerName})`
                                    : ''
                                } ↗`
                              : job.approval.status === 'changes_requested'
                              ? 'Changes requested ↗'
                              : 'Client review pending ↗'}
                          </Text>
                        </Pressable>
                      )}
                    </View>

                    <Text
                      style={[styles.dayPostTitle, { color: palette.text }]}
                      numberOfLines={2}
                    >
                      {job.master.title ||
                        job.master.caption ||
                        job.video?.fileName ||
                        'Post'}
                    </Text>
                  </View>

                  <View style={styles.dayPostActions}>
                    {isScheduled ? (
                      <>
                        <Pressable
                          onPress={() => void onShareReviewLink(job)}
                          style={[
                            styles.smallOutlineBtn,
                            {
                              borderColor: palette.border,
                              backgroundColor: palette.surfaceSubtle,
                            },
                          ]}
                        >
                          <Text
                            style={[
                              styles.smallOutlineText,
                              { color: palette.textSecondary },
                            ]}
                          >
                            {copiedJobId === job.id
                              ? 'Copied ✓'
                              : job.approval
                              ? 'Copy review'
                              : 'Share review'}
                          </Text>
                        </Pressable>

                        <Pressable
                          onPress={() => setReschedulingJob(job)}
                          style={[
                            styles.smallOutlineBtn,
                            { borderColor: palette.borderStrong },
                          ]}
                        >
                          <Text
                            style={[
                              styles.smallOutlineText,
                              { color: palette.text },
                            ]}
                          >
                            Move time
                          </Text>
                        </Pressable>

                        <Pressable
                          onPress={() => {
                            setEditingJob(job);
                            router.push('/');
                          }}
                          style={[
                            styles.smallOutlineBtn,
                            { borderColor: palette.borderStrong },
                          ]}
                        >
                          <Text
                            style={[
                              styles.smallOutlineText,
                              { color: palette.text },
                            ]}
                          >
                            Edit
                          </Text>
                        </Pressable>

                        {effectiveRole !== 'editor' &&
                          job.approval?.status !== 'approved' &&
                          (Boolean(job.approval) ||
                            Boolean(activeWorkspace.requireApproval) ||
                            job.createdByRole === 'editor') && (
                            <Pressable
                              onPress={() =>
                                void submitTeamApproval(job.id, 'approved')
                              }
                              style={[
                                styles.smallSolidBtn,
                                { backgroundColor: palette.success },
                              ]}
                            >
                              <Text
                                style={[
                                  styles.smallSolidText,
                                  { color: '#FFFFFF' },
                                ]}
                              >
                                Approve ✓
                              </Text>
                            </Pressable>
                          )}

                        {effectiveRole !== 'editor' && (
                          <Pressable
                            onPress={() => void publishScheduledNow(job.id)}
                            style={[
                              styles.smallSolidBtn,
                              { backgroundColor: palette.ctaBg },
                            ]}
                          >
                            <Text
                              style={[
                                styles.smallSolidText,
                                { color: palette.ctaText },
                              ]}
                            >
                              Post now
                            </Text>
                          </Pressable>
                        )}

                        <Pressable
                          onPress={() => void deleteJob(job.id)}
                          style={{ padding: 4 }}
                        >
                          <Ionicons
                            name="trash-outline"
                            size={15}
                            color={palette.textMuted}
                          />
                        </Pressable>
                      </>
                    ) : (
                      <Pressable
                        onPress={() => router.push('/insights')}
                        style={[
                          styles.smallOutlineBtn,
                          {
                            borderColor: palette.border,
                            backgroundColor: palette.surfaceSubtle,
                          },
                        ]}
                      >
                        <Text
                          style={[
                            styles.smallOutlineText,
                            { color: palette.textSecondary },
                          ]}
                        >
                          {totalViews > 0
                            ? `${formatCompactNumber(totalViews)} views · Insights`
                            : 'Insights'}
                        </Text>
                      </Pressable>
                    )}
                  </View>
                </View>
              );
            })}
          </View>
        )}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  calendarSheet: {
    borderWidth: 1,
    borderRadius: 12,
    overflow: 'hidden',
  },
  toolbar: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    flexWrap: 'wrap',
    paddingHorizontal: 18,
    paddingVertical: 13,
    borderBottomWidth: 1,
    gap: 12,
  },
  toolbarLeft: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
  },
  monthTitle: {
    fontSize: 16.5,
    fontWeight: '700',
    letterSpacing: -0.3,
  },
  navArrowsGroup: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 5,
  },
  navBtn: {
    width: 28,
    height: 28,
    borderRadius: 6,
    borderWidth: 1,
    alignItems: 'center',
    justifyContent: 'center',
  },
  todayBtn: {
    height: 28,
    paddingHorizontal: 10,
    borderRadius: 6,
    borderWidth: 1,
    alignItems: 'center',
    justifyContent: 'center',
  },
  todayBtnText: {
    fontSize: 12,
    fontWeight: '600',
  },
  toolbarRight: {
    flexDirection: 'row',
    alignItems: 'center',
    flexWrap: 'wrap',
    gap: 14,
  },
  legendRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
  },
  legendItem: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 5,
  },
  legendText: {
    fontSize: 11.5,
  },
  modeToggle: {
    flexDirection: 'row',
    borderWidth: 1,
    borderRadius: 7,
    padding: 2,
    gap: 2,
  },
  modeBtn: {
    paddingHorizontal: 10,
    paddingVertical: 4.5,
    borderRadius: 5,
  },
  modeBtnText: {
    fontSize: 12,
  },
  weekdayRow: {
    flexDirection: 'row',
    borderBottomWidth: 1,
  },
  weekdayCell: {
    flex: 1,
    paddingVertical: 8,
    paddingHorizontal: 10,
  },
  weekdayText: {
    fontSize: 11.5,
    fontWeight: '600',
  },
  weekRow: {
    flexDirection: 'row',
  },
  dayCell: {
    flex: 1,
    padding: 7,
    gap: 6,
  },
  dayCellTop: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  dayNumBadge: {
    minWidth: 24,
    height: 24,
    borderRadius: 12,
    paddingHorizontal: 5,
    alignItems: 'center',
    justifyContent: 'center',
  },
  dayNumText: {
    fontSize: 12,
  },
  cellAddBtn: {
    width: 20,
    height: 20,
    borderRadius: 5,
    borderWidth: 1,
    alignItems: 'center',
    justifyContent: 'center',
  },
  cellPillsStack: {
    gap: 4,
  },
  postPill: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    paddingHorizontal: 5,
    paddingVertical: 3,
    borderRadius: 5,
    borderWidth: 1,
  },
  pillDot: {
    width: 6,
    height: 6,
    borderRadius: 3,
  },
  pillText: {
    flex: 1,
    fontSize: 10.5,
    fontWeight: '500',
  },
  moreCount: {
    fontSize: 10.5,
    paddingLeft: 4,
  },
  inspectorSheet: {
    borderWidth: 1,
    borderRadius: 12,
    overflow: 'hidden',
  },
  inspectorHead: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    flexWrap: 'wrap',
    paddingHorizontal: 18,
    paddingVertical: 14,
    borderBottomWidth: 1,
    gap: 10,
  },
  inspectorTitle: {
    fontSize: 15.5,
    fontWeight: '700',
    letterSpacing: -0.2,
  },
  inspectorSub: {
    fontSize: 12.5,
  },
  scheduleDayBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 5,
    paddingHorizontal: 12,
    paddingVertical: 7.5,
    borderRadius: 7,
  },
  scheduleDayBtnText: {
    fontSize: 12.5,
    fontWeight: '600',
  },
  slotsSection: {
    paddingHorizontal: 18,
    paddingVertical: 13,
    borderBottomWidth: 1,
    gap: 9,
  },
  slotsSectionLabel: {
    fontSize: 11.5,
    fontWeight: '600',
  },
  slotsRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 9,
  },
  slotCard: {
    flex: 1,
    minWidth: 185,
    borderWidth: 1,
    borderRadius: 8,
    paddingHorizontal: 11,
    paddingVertical: 9,
    gap: 2,
  },
  slotCardTop: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: 8,
  },
  slotTimeText: {
    fontSize: 13,
    fontWeight: '700',
  },
  slotNoteText: {
    fontSize: 11.5,
  },
  draftAssignSection: {
    paddingHorizontal: 18,
    paddingVertical: 12,
    borderBottomWidth: 1,
    gap: 8,
  },
  draftQuickRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: 10,
    borderWidth: 1,
    borderRadius: 8,
    paddingHorizontal: 11,
    paddingVertical: 7,
  },
  draftQuickTitle: {
    flex: 1,
    fontSize: 12.5,
    fontWeight: '500',
  },
  placeDraftBtn: {
    borderWidth: 1,
    borderRadius: 6,
    paddingHorizontal: 9,
    paddingVertical: 4.5,
  },
  placeDraftBtnText: {
    fontSize: 11.5,
    fontWeight: '600',
  },
  dayPostsList: {
    gap: 0,
  },
  dayPostRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    flexWrap: 'wrap',
    paddingHorizontal: 18,
    paddingVertical: 14,
    gap: 12,
  },
  dayPostMetaLine: {
    flexDirection: 'row',
    alignItems: 'center',
    flexWrap: 'wrap',
    gap: 9,
  },
  dayPostTime: {
    fontSize: 12,
    fontWeight: '600',
  },
  dayIconsRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 5,
  },
  dayPostTitle: {
    fontSize: 14,
    fontWeight: '600',
    lineHeight: 20,
  },
  dayPostActions: {
    flexDirection: 'row',
    alignItems: 'center',
    flexWrap: 'wrap',
    gap: 7,
  },
  smallOutlineBtn: {
    borderWidth: 1,
    borderRadius: 6,
    paddingHorizontal: 9,
    paddingVertical: 5.5,
  },
  smallOutlineText: {
    fontSize: 12,
    fontWeight: '600',
  },
  smallSolidBtn: {
    borderRadius: 6,
    paddingHorizontal: 11,
    paddingVertical: 6,
  },
  smallSolidText: {
    fontSize: 12,
    fontWeight: '600',
  },
});
