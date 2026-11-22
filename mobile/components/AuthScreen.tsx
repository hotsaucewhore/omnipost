import { Ionicons } from '@expo/vector-icons';
import React, { useState } from 'react';
import {
  KeyboardAvoidingView,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useOmniPost } from '../context/OmniPostContext';
import { requestPasswordResetApi } from '../lib/api';

interface Props {
  initialMode?: 'login' | 'register';
  onBackToLanding?: () => void;
}

export function AuthScreen({ initialMode = 'register', onBackToLanding }: Props) {
  const {
    palette,
    toggleTheme,
    login,
    register,
    loginDemoFounder,
    completePasswordReset,
  } = useOmniPost();

  const [mode, setMode] = useState<'login' | 'register'>(initialMode);
  const [name, setName] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [resetMode, setResetMode] = useState(false);
  const [resetCode, setResetCode] = useState('');
  const [resetHint, setResetHint] = useState<string | null>(null);

  const handleSubmit = async () => {
    setError(null);
    setSubmitting(true);
    try {
      if (mode === 'register') {
        await register(name, email, password);
      } else {
        await login(email, password);
      }
    } catch (err: any) {
      setError(err?.message || 'Authentication failed.');
    } finally {
      setSubmitting(false);
    }
  };

  const handleDemoLogin = async () => {
    setError(null);
    setSubmitting(true);
    try {
      await loginDemoFounder();
    } catch (err: any) {
      setError(err?.message || 'Demo sign-in failed.');
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <SafeAreaView style={[styles.safe, { backgroundColor: palette.bg }]}>
      <KeyboardAvoidingView
        style={{ flex: 1 }}
        behavior={Platform.OS === 'ios' ? 'padding' : undefined}
      >
        <ScrollView contentContainerStyle={styles.scrollContent}>
          <View style={styles.topRow}>
            <Pressable
              onPress={onBackToLanding}
              disabled={!onBackToLanding}
              style={styles.brandRow}
            >
              {onBackToLanding && (
                <Ionicons
                  name="arrow-back"
                  size={15}
                  color={palette.textSecondary}
                />
              )}
              <View
                style={[styles.brandDot, { backgroundColor: palette.accent }]}
              />
              <Text style={[styles.brandWordmark, { color: palette.text }]}>
                omnipost
              </Text>
              {onBackToLanding && (
                <Text
                  style={{ fontSize: 12.5, color: palette.textSecondary }}
                >
                  · Overview
                </Text>
              )}
            </Pressable>

            <Pressable
              onPress={toggleTheme}
              style={[
                styles.themeBtn,
                {
                  borderColor: palette.border,
                  backgroundColor: palette.surface,
                },
              ]}
            >
              <Ionicons
                name={
                  palette.mode === 'light' ? 'moon-outline' : 'sunny-outline'
                }
                size={15}
                color={palette.textSecondary}
              />
            </Pressable>
          </View>

          <View
            style={[
              styles.card,
              {
                backgroundColor: palette.surface,
                borderColor: palette.border,
              },
            ]}
          >
            <View style={styles.cardIntro}>
              <Text style={[styles.heading, { color: palette.text }]}>
                {mode === 'register'
                  ? 'Start publishing everywhere at once'
                  : 'Welcome back'}
              </Text>
              <Text
                style={[styles.subheading, { color: palette.textSecondary }]}
              >
                {mode === 'register'
                  ? 'Create a free Starter account (1 brand workspace, 3 channels, 10 posts/mo) — no card required.'
                  : 'Sign in to access your brand workspaces, scheduled queue, and performance insights.'}
              </Text>
            </View>

            <View
              style={[
                styles.modeSwitch,
                {
                  backgroundColor: palette.surfaceSubtle,
                  borderColor: palette.border,
                },
              ]}
            >
              {(
                [
                  ['register', 'Create free account'],
                  ['login', 'Sign in'],
                ] as const
              ).map(([val, label]) => {
                const active = mode === val;
                return (
                  <Pressable
                    key={val}
                    onPress={() => {
                      setError(null);
                      setMode(val);
                    }}
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

            <View style={styles.fields}>
              {mode === 'register' && (
                <View style={styles.fieldGroup}>
                  <Text
                    style={[
                      styles.fieldLabel,
                      { color: palette.textSecondary },
                    ]}
                  >
                    Your name or studio
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
                    placeholder="Alex Rivera"
                    placeholderTextColor={palette.textMuted}
                    value={name}
                    onChangeText={setName}
                  />
                </View>
              )}

              <View style={styles.fieldGroup}>
                <Text
                  style={[styles.fieldLabel, { color: palette.textSecondary }]}
                >
                  Email
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
                  autoCapitalize="none"
                  keyboardType="email-address"
                  placeholder="you@company.com"
                  placeholderTextColor={palette.textMuted}
                  value={email}
                  onChangeText={setEmail}
                />
              </View>

              <View style={styles.fieldGroup}>
                <View
                  style={{
                    flexDirection: 'row',
                    justifyContent: 'space-between',
                    alignItems: 'center',
                  }}
                >
                  <Text
                    style={[styles.fieldLabel, { color: palette.textSecondary }]}
                  >
                    {resetMode ? 'New password' : 'Password'}
                  </Text>
                  {mode === 'login' && (
                    <Pressable
                      onPress={() => {
                        setResetMode((v) => !v);
                        setError(null);
                        setResetHint(null);
                      }}
                    >
                      <Text
                        style={{
                          fontSize: 12,
                          color: palette.textSecondary,
                          textDecorationLine: 'underline',
                        }}
                      >
                        {resetMode ? 'Back to sign in' : 'Forgot password?'}
                      </Text>
                    </Pressable>
                  )}
                </View>
                <TextInput
                  style={[
                    styles.input,
                    {
                      color: palette.text,
                      backgroundColor: palette.surfaceSubtle,
                      borderColor: palette.border,
                    },
                  ]}
                  secureTextEntry
                  placeholder="At least 6 characters"
                  placeholderTextColor={palette.textMuted}
                  value={password}
                  onChangeText={setPassword}
                  onSubmitEditing={() => void handleSubmit()}
                />
              </View>

              {resetMode && (
                <View style={{ gap: 8 }}>
                  <View style={{ flexDirection: 'row', gap: 8 }}>
                    <TextInput
                      style={[
                        styles.input,
                        {
                          flex: 1,
                          color: palette.text,
                          backgroundColor: palette.surfaceSubtle,
                          borderColor: palette.borderStrong,
                        },
                      ]}
                      placeholder="6-digit reset code"
                      placeholderTextColor={palette.textMuted}
                      keyboardType="numeric"
                      value={resetCode}
                      onChangeText={setResetCode}
                    />
                    <Pressable
                      disabled={!email.trim() || submitting}
                      onPress={async () => {
                        setSubmitting(true);
                        setError(null);
                        try {
                          const res = await requestPasswordResetApi(
                            email.trim()
                          );
                          setResetHint(
                            res.devResetCode
                              ? `Local dev code generated: ${res.devResetCode}`
                              : res.message
                          );
                          if (res.devResetCode) {
                            setResetCode(res.devResetCode);
                          }
                        } catch (err: any) {
                          setError(err?.message || 'Could not send reset code.');
                        } finally {
                          setSubmitting(false);
                        }
                      }}
                      style={{
                        paddingHorizontal: 12,
                        justifyContent: 'center',
                        borderRadius: 8,
                        borderWidth: 1,
                        borderColor: palette.borderStrong,
                        backgroundColor: palette.surfaceSubtle,
                      }}
                    >
                      <Text
                        style={{
                          fontSize: 12,
                          fontWeight: '600',
                          color: palette.text,
                        }}
                      >
                        Send code
                      </Text>
                    </Pressable>
                  </View>
                  {resetHint && (
                    <Text style={{ fontSize: 12, color: palette.success }}>
                      {resetHint}
                    </Text>
                  )}
                </View>
              )}

              {error ? (
                <Text style={[styles.errorText, { color: palette.danger }]}>
                  {error}
                </Text>
              ) : null}

              <Pressable
                disabled={submitting}
                onPress={async () => {
                  if (resetMode) {
                    setSubmitting(true);
                    setError(null);
                    try {
                      await completePasswordReset({
                        email: email.trim(),
                        code: resetCode.trim(),
                        newPassword: password,
                      });
                    } catch (err: any) {
                      setError(err?.message || 'Reset failed.');
                    } finally {
                      setSubmitting(false);
                    }
                    return;
                  }
                  await handleSubmit();
                }}
                style={[
                  styles.submitBtn,
                  { backgroundColor: palette.ctaBg },
                ]}
              >
                <Text
                  style={[styles.submitBtnText, { color: palette.ctaText }]}
                >
                  {submitting
                    ? 'Please wait...'
                    : resetMode
                    ? 'Reset password & sign in'
                    : mode === 'register'
                    ? 'Create free Starter account'
                    : 'Sign in'}
                </Text>
              </Pressable>
            </View>

            <View
              style={[styles.dividerRow, { borderTopColor: palette.border }]}
            >
              <Pressable
                disabled={submitting}
                onPress={() => void handleDemoLogin()}
                style={[
                  styles.demoBtn,
                  {
                    backgroundColor: palette.surfaceSubtle,
                    borderColor: palette.border,
                  },
                ]}
              >
                <View style={{ flex: 1 }}>
                  <Text style={[styles.demoTitle, { color: palette.text }]}>
                    Continue with Studio Founder demo
                  </Text>
                  <Text
                    style={[styles.demoSub, { color: palette.textSecondary }]}
                  >
                    founder@omnipost.app · Pre-loaded Creator Studio & Personal Brand
                  </Text>
                </View>
                <Ionicons
                  name="arrow-forward"
                  size={15}
                  color={palette.textSecondary}
                />
              </Pressable>
            </View>
          </View>
        </ScrollView>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safe: {
    flex: 1,
  },
  scrollContent: {
    flexGrow: 1,
    justifyContent: 'center',
    paddingHorizontal: 20,
    paddingVertical: 32,
  },
  topRow: {
    maxWidth: 420,
    width: '100%',
    alignSelf: 'center',
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: 16,
  },
  brandRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  brandDot: {
    width: 10,
    height: 10,
    borderRadius: 5,
  },
  brandWordmark: {
    fontSize: 19,
    fontWeight: '700',
    letterSpacing: -0.5,
  },
  themeBtn: {
    width: 32,
    height: 32,
    borderRadius: 8,
    borderWidth: 1,
    alignItems: 'center',
    justifyContent: 'center',
  },
  card: {
    maxWidth: 420,
    width: '100%',
    alignSelf: 'center',
    borderRadius: 14,
    borderWidth: 1,
    padding: 24,
    gap: 18,
  },
  cardIntro: {
    gap: 6,
  },
  heading: {
    fontSize: 20,
    fontWeight: '700',
    letterSpacing: -0.4,
  },
  subheading: {
    fontSize: 13.5,
    lineHeight: 19,
  },
  modeSwitch: {
    flexDirection: 'row',
    borderWidth: 1,
    borderRadius: 8,
    padding: 3,
    gap: 3,
  },
  modeBtn: {
    flex: 1,
    paddingVertical: 7,
    borderRadius: 6,
    alignItems: 'center',
  },
  modeBtnText: {
    fontSize: 12.5,
  },
  fields: {
    gap: 13,
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
    paddingHorizontal: 12,
    paddingVertical: 9.5,
    fontSize: 14,
  },
  errorText: {
    fontSize: 12.5,
    fontWeight: '500',
  },
  submitBtn: {
    marginTop: 4,
    paddingVertical: 11,
    borderRadius: 8,
    alignItems: 'center',
  },
  submitBtnText: {
    fontSize: 13.5,
    fontWeight: '600',
  },
  dividerRow: {
    borderTopWidth: 1,
    paddingTop: 16,
  },
  demoBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    borderWidth: 1,
    borderRadius: 9,
    paddingHorizontal: 12,
    paddingVertical: 10,
  },
  demoTitle: {
    fontSize: 13,
    fontWeight: '600',
  },
  demoSub: {
    fontSize: 11.5,
    marginTop: 1,
  },
});
