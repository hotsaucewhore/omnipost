import { AccountGroupId } from '../../../shared/platforms';
import { blueskyAdapter } from './bluesky';
import { facebookAdapter } from './facebook';
import { instagramAdapter } from './instagram';
import { linkedinAdapter } from './linkedin';
import { threadsAdapter } from './threads';
import { tiktokAdapter } from './tiktok';
import { PlatformAdapter } from './types';
import { xAdapter } from './x';
import { youtubeAdapter } from './youtube';

export const ADAPTER_REGISTRY: Record<AccountGroupId, PlatformAdapter> = {
  tiktok: tiktokAdapter,
  instagram: instagramAdapter,
  youtube: youtubeAdapter,
  facebook: facebookAdapter,
  x: xAdapter,
  threads: threadsAdapter,
  bluesky: blueskyAdapter,
  linkedin: linkedinAdapter,
};
