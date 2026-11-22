import { Ionicons } from '@expo/vector-icons';
import { AccountGroupId, PlatformId } from '../../shared/platforms';

export type IoniconName = React.ComponentProps<typeof Ionicons>['name'];

export interface ThemePalette {
  mode: 'light' | 'dark';
  bg: string;
  surface: string;
  surfaceSubtle: string;
  surfaceMuted: string;
  border: string;
  borderStrong: string;
  text: string;
  textSecondary: string;
  textMuted: string;
  ctaBg: string;
  ctaText: string;
  ctaDisabledBg: string;
  ctaDisabledText: string;
  accent: string;
  success: string;
  successBg: string;
  warning: string;
  warningBg: string;
  danger: string;
  dangerBg: string;
}

export const LIGHT_PALETTE: ThemePalette = {
  mode: 'light',
  bg: '#F5F4F0',
  surface: '#FFFFFF',
  surfaceSubtle: '#FAF9F6',
  surfaceMuted: '#EFECE6',
  border: '#E4E2DC',
  borderStrong: '#CFCBC2',
  text: '#181816',
  textSecondary: '#66635B',
  textMuted: '#969289',
  ctaBg: '#181816',
  ctaText: '#FFFFFF',
  ctaDisabledBg: '#E2DFD7',
  ctaDisabledText: '#969289',
  accent: '#D95D39',
  success: '#1E7A4C',
  successBg: '#EDF7F1',
  warning: '#A16207',
  warningBg: '#FEF7E6',
  danger: '#C93B2B',
  dangerBg: '#FDF0EE',
};

export const DARK_PALETTE: ThemePalette = {
  mode: 'dark',
  bg: '#131312',
  surface: '#1B1B19',
  surfaceSubtle: '#161614',
  surfaceMuted: '#242421',
  border: '#2B2B27',
  borderStrong: '#3B3B36',
  text: '#F2F0EB',
  textSecondary: '#9E9B93',
  textMuted: '#6E6B64',
  ctaBg: '#F2F0EB',
  ctaText: '#131312',
  ctaDisabledBg: '#272724',
  ctaDisabledText: '#66635C',
  accent: '#E06D4B',
  success: '#34A86C',
  successBg: 'rgba(52, 168, 108, 0.12)',
  warning: '#D99B26',
  warningBg: 'rgba(217, 155, 38, 0.12)',
  danger: '#E05243',
  dangerBg: 'rgba(224, 82, 67, 0.12)',
};

export const PLATFORM_ICONS: Record<PlatformId, IoniconName> = {
  tiktok: 'logo-tiktok',
  instagram_reels: 'logo-instagram',
  youtube_shorts: 'logo-youtube',
  youtube_long: 'logo-youtube',
  facebook_video: 'logo-facebook',
  x: 'logo-x',
  threads: 'at',
  bluesky: 'cloud',
  linkedin: 'logo-linkedin',
};

export const ACCOUNT_GROUP_ICONS: Record<AccountGroupId, IoniconName> = {
  tiktok: 'logo-tiktok',
  instagram: 'logo-instagram',
  youtube: 'logo-youtube',
  facebook: 'logo-facebook',
  x: 'logo-x',
  threads: 'at',
  bluesky: 'cloud',
  linkedin: 'logo-linkedin',
};
