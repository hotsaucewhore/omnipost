import { Ionicons } from '@expo/vector-icons';
import React, { useEffect, useMemo, useState } from 'react';
import {
  Modal,
  Platform,
  Pressable,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import { formatScheduleLabel } from '../../shared/platforms';
import { useOmniPost } from '../context/OmniPostContext';

interface Props {
  visible: boolean;
  initialIso?: string;
  onClose: () => void;
  onApplySchedule: (iso: string | undefined) => void;
}

function toLocalDateInputValue(d: Date): string {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${y}-${m}-${day}`;
}

function toLocalTimeInputValue(d: Date): string {
  const h = String(d.getHours()).padStart(2, '0');
  const min = String(d.getMinutes()).padStart(2, '0');
  return `${h}:${min}`;
}

function defaultInitialDate(): Date {
  const d = new Date();
  d.setDate(d.getDate() + 1);
  d.setHours(9, 0, 0, 0);
  return d;
}

export function ScheduleModal({
  visible,
  initialIso,
  onClose,
  onApplySchedule,
}: Props) {
  const { palette } = useOmniPost();

  const [selectedDate, setSelectedDate] = useState<Date>(defaultInitialDate);

  useEffect(() => {
    if (!visible) return;
    if (initialIso) {
      const parsed = new Date(initialIso);
      if (!Number.isNaN(parsed.getTime())) {
        setSelectedDate(parsed);
        return;
      }
    }
    setSelectedDate(defaultInitialDate());
  }, [visible, initialIso]);

  const quickPresets = useMemo(() => {
    const now = new Date();

    const inOneHour = new Date(now.getTime() + 60 * 60 * 1000);
    inOneHour.setSeconds(0, 0);

    const tomorrowMorning = new Date(now);
    tomorrowMorning.setDate(now.getDate() + 1);
    tomorrowMorning.setHours(9, 0, 0, 0);

    const tomorrowNoon = new Date(now);
    tomorrowNoon.setDate(now.getDate() + 1);
    tomorrowNoon.setHours(12, 0, 0, 0);

    const tomorrowEvening = new Date(now);
    tomorrowEvening.setDate(now.getDate() + 1);
    tomorrowEvening.setHours(18, 0, 0, 0);

    const nextWeek = new Date(now);
    const daysUntilMon = ((8 - now.getDay()) % 7) || 7;
    nextWeek.setDate(now.getDate() + daysUntilMon);
    nextWeek.setHours(9, 0, 0, 0);

    return [
      { id: '1h', label: 'In 1 hour', date: inOneHour },
      { id: 'tm_9', label: 'Tomorrow · 9:00 AM', date: tomorrowMorning },
      { id: 'tm_12', label: 'Tomorrow · 12:00 PM', date: tomorrowNoon },
      { id: 'tm_18', label: 'Tomorrow · 6:00 PM', date: tomorrowEvening },
      { id: 'mon_9', label: 'Next Mon · 9:00 AM', date: nextWeek },
    ];
  }, [visible]);

  const upcomingDays = useMemo(() => {
    const list: { label: string; offset: number; dateObj: Date }[] = [];
    const base = new Date();
    for (let i = 0; i < 6; i++) {
      const d = new Date(base);
      d.setDate(base.getDate() + i);
      const label =
        i === 0
          ? 'Today'
          : i === 1
          ? 'Tomorrow'
          : d.toLocaleDateString([], { weekday: 'short', day: 'numeric' });
      list.push({ label, offset: i, dateObj: d });
    }
    return list;
  }, [visible]);

  const timeChoices = [
    { label: '9:00 AM', h: 9, m: 0 },
    { label: '12:00 PM', h: 12, m: 0 },
    { label: '3:00 PM', h: 15, m: 0 },
    { label: '6:00 PM', h: 18, m: 0 },
    { label: '8:30 PM', h: 20, m: 30 },
  ];

  const handleSetDayPart = (year: number, monthIdx: number, day: number) => {
    const next = new Date(selectedDate);
    next.setFullYear(year, monthIdx, day);
    setSelectedDate(next);
  };

  const handleSetTimePart = (hours: number, minutes: number) => {
    const next = new Date(selectedDate);
    next.setHours(hours, minutes, 0, 0);
    setSelectedDate(next);
  };

  const isPast = selectedDate.getTime() < Date.now() - 60_000;

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
            style={[
              styles.header,
              { borderBottomColor: palette.border },
            ]}
          >
            <View>
              <Text style={[styles.title, { color: palette.text }]}>
                Schedule post
              </Text>
              <Text style={[styles.sub, { color: palette.textSecondary }]}>
                {formatScheduleLabel(selectedDate.toISOString())}
              </Text>
            </View>

            <Pressable onPress={onClose} style={{ padding: 4 }}>
              <Ionicons name="close" size={20} color={palette.textSecondary} />
            </Pressable>
          </View>

          <View style={styles.body}>
            {/* Quick Slots */}
            <View style={styles.group}>
              <Text style={[styles.label, { color: palette.textSecondary }]}>
                Quick slots
              </Text>
              <View style={styles.chipsRow}>
                {quickPresets.map((p) => {
                  const active =
                    Math.abs(selectedDate.getTime() - p.date.getTime()) < 60_000;
                  return (
                    <Pressable
                      key={p.id}
                      onPress={() => setSelectedDate(new Date(p.date))}
                      style={[
                        styles.slotChip,
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
                          styles.slotChipText,
                          {
                            color: active ? palette.text : palette.textSecondary,
                            fontWeight: active ? '600' : '400',
                          },
                        ]}
                      >
                        {p.label}
                      </Text>
                    </Pressable>
                  );
                })}
              </View>
            </View>

            {/* Custom Date & Time */}
            <View
              style={[
                styles.group,
                { borderTopWidth: 1, borderTopColor: palette.border, paddingTop: 14 },
              ]}
            >
              <Text style={[styles.label, { color: palette.textSecondary }]}>
                Custom date & time
              </Text>

              {Platform.OS === 'web' ? (
                <View style={styles.webInputsRow}>
                  {React.createElement('input', {
                    type: 'date',
                    value: toLocalDateInputValue(selectedDate),
                    min: toLocalDateInputValue(new Date()),
                    onChange: (e: any) => {
                      const val = String(e.target.value || '');
                      const [y, m, d] = val.split('-').map(Number);
                      if (y && m && d) {
                        handleSetDayPart(y, m - 1, d);
                      }
                    },
                    style: {
                      flex: 1,
                      padding: '9px 11px',
                      borderRadius: 8,
                      border: `1px solid ${palette.borderStrong}`,
                      backgroundColor: palette.surfaceSubtle,
                      color: palette.text,
                      fontSize: 13.5,
                    },
                  })}
                  {React.createElement('input', {
                    type: 'time',
                    value: toLocalTimeInputValue(selectedDate),
                    onChange: (e: any) => {
                      const val = String(e.target.value || '');
                      const [h, min] = val.split(':').map(Number);
                      if (!Number.isNaN(h) && !Number.isNaN(min)) {
                        handleSetTimePart(h, min);
                      }
                    },
                    style: {
                      width: 132,
                      padding: '9px 11px',
                      borderRadius: 8,
                      border: `1px solid ${palette.borderStrong}`,
                      backgroundColor: palette.surfaceSubtle,
                      color: palette.text,
                      fontSize: 13.5,
                    },
                  })}
                </View>
              ) : (
                <>
                  <View style={styles.chipsRow}>
                    {upcomingDays.map((d) => {
                      const active =
                        d.dateObj.getDate() === selectedDate.getDate() &&
                        d.dateObj.getMonth() === selectedDate.getMonth();
                      return (
                        <Pressable
                          key={d.offset}
                          onPress={() =>
                            handleSetDayPart(
                              d.dateObj.getFullYear(),
                              d.dateObj.getMonth(),
                              d.dateObj.getDate()
                            )
                          }
                          style={[
                            styles.slotChip,
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
                              styles.slotChipText,
                              {
                                color: active
                                  ? palette.text
                                  : palette.textSecondary,
                                fontWeight: active ? '600' : '400',
                              },
                            ]}
                          >
                            {d.label}
                          </Text>
                        </Pressable>
                      );
                    })}
                  </View>

                  <View style={styles.chipsRow}>
                    {timeChoices.map((tc) => {
                      const active =
                        selectedDate.getHours() === tc.h &&
                        selectedDate.getMinutes() === tc.m;
                      return (
                        <Pressable
                          key={tc.label}
                          onPress={() => handleSetTimePart(tc.h, tc.m)}
                          style={[
                            styles.slotChip,
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
                              styles.slotChipText,
                              {
                                color: active
                                  ? palette.text
                                  : palette.textSecondary,
                                fontWeight: active ? '600' : '400',
                              },
                            ]}
                          >
                            {tc.label}
                          </Text>
                        </Pressable>
                      );
                    })}
                  </View>
                </>
              )}

              {isPast && (
                <Text style={{ color: palette.danger, fontSize: 12 }}>
                  Pick a time in the future to schedule.
                </Text>
              )}
            </View>
          </View>

          <View
            style={[
              styles.footer,
              {
                backgroundColor: palette.surfaceSubtle,
                borderTopColor: palette.border,
              },
            ]}
          >
            {initialIso ? (
              <Pressable
                onPress={() => {
                  onApplySchedule(undefined);
                  onClose();
                }}
              >
                <Text
                  style={[styles.clearLink, { color: palette.textSecondary }]}
                >
                  Clear (Post immediately)
                </Text>
              </Pressable>
            ) : (
              <View />
            )}

            <View style={styles.footerBtns}>
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
                disabled={isPast}
                onPress={() => {
                  onApplySchedule(selectedDate.toISOString());
                  onClose();
                }}
                style={[
                  styles.confirmBtn,
                  {
                    backgroundColor: isPast
                      ? palette.ctaDisabledBg
                      : palette.ctaBg,
                  },
                ]}
              >
                <Text
                  style={[
                    styles.confirmText,
                    {
                      color: isPast
                        ? palette.ctaDisabledText
                        : palette.ctaText,
                    },
                  ]}
                >
                  Set schedule
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
    backgroundColor: 'rgba(15, 15, 14, 0.5)',
    alignItems: 'center',
    justifyContent: 'center',
    padding: 16,
  },
  dialog: {
    width: '100%',
    maxWidth: 460,
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
    fontSize: 12.5,
    marginTop: 2,
  },
  body: {
    padding: 20,
    gap: 16,
  },
  group: {
    gap: 10,
  },
  label: {
    fontSize: 12.5,
    fontWeight: '600',
  },
  chipsRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 7,
  },
  slotChip: {
    paddingHorizontal: 11,
    paddingVertical: 6,
    borderRadius: 7,
    borderWidth: 1,
  },
  slotChipText: {
    fontSize: 12.5,
  },
  webInputsRow: {
    flexDirection: 'row',
    gap: 10,
  },
  footer: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 20,
    paddingVertical: 12,
    borderTopWidth: 1,
  },
  clearLink: {
    fontSize: 12.5,
    textDecorationLine: 'underline',
  },
  footerBtns: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  cancelBtn: {
    borderWidth: 1,
    borderRadius: 7,
    paddingHorizontal: 12,
    paddingVertical: 8,
  },
  cancelText: {
    fontSize: 13,
    fontWeight: '500',
  },
  confirmBtn: {
    borderRadius: 7,
    paddingHorizontal: 16,
    paddingVertical: 8,
  },
  confirmText: {
    fontSize: 13,
    fontWeight: '600',
  },
});
