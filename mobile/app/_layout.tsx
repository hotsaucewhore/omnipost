import { useFonts } from 'expo-font';
import {
  DarkTheme,
  DefaultTheme,
  Stack,
  ThemeProvider,
  usePathname,
} from 'expo-router';
import * as SplashScreen from 'expo-splash-screen';
import { StatusBar } from 'expo-status-bar';
import { useEffect } from 'react';
import { Platform } from 'react-native';
import 'react-native-reanimated';
import { AuthScreen } from '../components/AuthScreen';
import { BatchSchedulerModal } from '../components/BatchSchedulerModal';
import { BillingModal } from '../components/BillingModal';
import { BioModal } from '../components/BioModal';
import { LandingPage } from '../components/LandingPage';
import { LaunchChecklistModal } from '../components/LaunchChecklistModal';
import { TeamModal } from '../components/TeamModal';
import { OmniPostProvider, useOmniPost } from '../context/OmniPostContext';

export { ErrorBoundary } from 'expo-router';

export const unstable_settings = {
  anchor: '(tabs)',
};

SplashScreen.preventAutoHideAsync();

function ThemedRootStack() {
  const pathname = usePathname();
  const {
    palette,
    isSignedOut,
    requestedAuthMode,
    setRequestedAuthMode,
  } = useOmniPost();

  useEffect(() => {
    if (Platform.OS === 'web' && typeof document !== 'undefined') {
      const id = 'omnipost-editorial-css';
      let styleEl = document.getElementById(id) as HTMLStyleElement | null;
      if (!styleEl) {
        styleEl = document.createElement('style');
        styleEl.id = id;
        document.head.appendChild(styleEl);
      }
      const thumb = palette.mode === 'light' ? '#D0CDC4' : '#353530';
      styleEl.textContent = `
        @import url('https://fonts.googleapis.com/css2?family=DM+Sans:ital,opsz,wght@0,9..40,400;0,9..40,500;0,9..40,600;0,9..40,700;1,9..40,400&display=swap');

        html, body, #root {
          background-color: ${palette.bg} !important;
          color-scheme: ${palette.mode};
          font-family: 'DM Sans', -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif;
          -webkit-font-smoothing: antialiased;
        }

        * {
          box-sizing: border-box;
          scrollbar-width: thin;
          scrollbar-color: ${thumb} transparent;
        }

        *::-webkit-scrollbar {
          width: 7px;
          height: 7px;
        }

        *::-webkit-scrollbar-track {
          background: transparent;
        }

        *::-webkit-scrollbar-thumb {
          background-color: ${thumb};
          border-radius: 999px;
        }

        input, textarea, select, button {
          font-family: 'DM Sans', -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif !important;
        }

        input:focus, textarea:focus {
          outline: none !important;
        }
      `;
      document.title = 'OmniPost';
    }
  }, [palette]);

  const navTheme = {
    ...(palette.mode === 'dark' ? DarkTheme : DefaultTheme),
    colors: {
      ...(palette.mode === 'dark' ? DarkTheme.colors : DefaultTheme.colors),
      background: palette.bg,
      card: palette.surface,
      border: palette.border,
      primary: palette.text,
      text: palette.text,
    },
  };

  const isPublicMarketingOrLegalRoute =
    pathname === '/welcome' ||
    pathname === '/privacy' ||
    pathname === '/terms' ||
    pathname.startsWith('/review/') ||
    pathname.startsWith('/u/');

  return (
    <ThemeProvider value={navTheme}>
      <StatusBar style={palette.mode === 'dark' ? 'light' : 'dark'} />
      <BillingModal />
      <TeamModal />
      <BatchSchedulerModal />
      <BioModal />
      <LaunchChecklistModal />
      {isSignedOut && !isPublicMarketingOrLegalRoute ? (
        requestedAuthMode === 'landing' ? (
          <LandingPage onOpenAuth={(mode) => setRequestedAuthMode(mode)} />
        ) : (
          <AuthScreen
            initialMode={requestedAuthMode}
            onBackToLanding={() => setRequestedAuthMode('landing')}
          />
        )
      ) : (
        <Stack screenOptions={{ headerShown: false }}>
          <Stack.Screen name="(tabs)" options={{ headerShown: false }} />
          <Stack.Screen name="welcome" options={{ headerShown: false }} />
          <Stack.Screen name="privacy" options={{ headerShown: false }} />
          <Stack.Screen name="terms" options={{ headerShown: false }} />
          <Stack.Screen name="review/[token]" options={{ headerShown: false }} />
          <Stack.Screen name="u/[slug]" options={{ headerShown: false }} />
          <Stack.Screen name="admin" options={{ headerShown: false }} />
        </Stack>
      )}
    </ThemeProvider>
  );
}

export default function RootLayout() {
  const [loaded, error] = useFonts({
    SpaceMono: require('../assets/fonts/SpaceMono-Regular.ttf'),
  });

  useEffect(() => {
    if (error) throw error;
  }, [error]);

  useEffect(() => {
    if (loaded) {
      SplashScreen.hideAsync();
    }
  }, [loaded]);

  if (!loaded) {
    return null;
  }

  return (
    <OmniPostProvider>
      <ThemedRootStack />
    </OmniPostProvider>
  );
}
