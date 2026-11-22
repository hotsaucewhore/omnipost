import {
  ImportedRssFeed,
  ImportedRssItem,
  ImportedUrlPreview,
} from '../../shared/platforms';

function decodeHtmlEntities(input: string): string {
  return input
    .replace(/<!\[CDATA\[([\s\S]*?)\]\]>/gi, '$1')
    .replace(/&amp;/gi, '&')
    .replace(/&quot;/gi, '"')
    .replace(/&#39;|&apos;/gi, "'")
    .replace(/&lt;/gi, '<')
    .replace(/&gt;/gi, '>')
    .replace(/&nbsp;/gi, ' ')
    .replace(/&#(\d+);/g, (_m, code) => {
      const n = Number(code);
      return Number.isFinite(n) ? String.fromCharCode(n) : '';
    });
}

function stripTags(html: string): string {
  return decodeHtmlEntities(
    html
      .replace(/<script[\s\S]*?<\/script>/gi, ' ')
      .replace(/<style[\s\S]*?<\/style>/gi, ' ')
      .replace(/<[^>]+>/g, ' ')
      .replace(/\s+/g, ' ')
      .trim()
  );
}

function extractMetaContent(html: string, keys: string[]): string {
  for (const key of keys) {
    const escaped = key.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    const regexes = [
      new RegExp(
        `<meta[^>]+(?:property|name)=["']${escaped}["'][^>]+content=["']([^"']+)["'][^>]*>`,
        'i'
      ),
      new RegExp(
        `<meta[^>]+content=["']([^"']+)["'][^>]+(?:property|name)=["']${escaped}["'][^>]*>`,
        'i'
      ),
    ];
    for (const re of regexes) {
      const match = html.match(re);
      if (match?.[1]) {
        return decodeHtmlEntities(match[1].trim());
      }
    }
  }
  return '';
}

function deriveKeywordsAsHashtags(
  rawKeywords: string,
  title: string,
  hostname: string
): string {
  const fromKeywords = rawKeywords
    .split(/[,\s]+/)
    .map((t) => t.replace(/[^a-zA-Z0-9]/g, '').toLowerCase())
    .filter((t) => t.length >= 3 && t.length <= 22);

  if (fromKeywords.length >= 2) {
    return Array.from(new Set(fromKeywords)).slice(0, 4).join(' ');
  }

  const stop = new Set([
    'the',
    'and',
    'for',
    'with',
    'from',
    'that',
    'this',
    'your',
    'into',
    'how',
    'why',
    'our',
    'new',
  ]);
  const words = title
    .toLowerCase()
    .replace(/[^a-z0-9\s]/g, ' ')
    .split(/\s+/)
    .filter((w) => w.length >= 4 && !stop.has(w));
  const brandToken = hostname
    .replace(/^www\./i, '')
    .split('.')[0]
    .replace(/[^a-z0-9]/gi, '')
    .toLowerCase();
  return Array.from(new Set([brandToken, ...words].filter(Boolean)))
    .slice(0, 3)
    .join(' ');
}

export function extractUrlMetadata(
  html: string,
  targetUrl: string
): ImportedUrlPreview {
  let hostname = 'article';
  try {
    hostname = new URL(targetUrl).hostname.replace(/^www\./i, '');
  } catch {
    // Keep fallback hostname
  }

  const titleTagMatch = html.match(/<title[^>]*>([\s\S]*?)<\/title>/i);
  const title =
    extractMetaContent(html, ['og:title', 'twitter:title']) ||
    (titleTagMatch ? stripTags(titleTagMatch[1]) : '') ||
    hostname;

  let description = extractMetaContent(html, [
    'og:description',
    'twitter:description',
    'description',
  ]);
  if (!description) {
    const pMatch = html.match(/<p[^>]*>([\s\S]{40,400}?)<\/p>/i);
    if (pMatch) {
      description = stripTags(pMatch[1]).slice(0, 220);
    }
  }

  const siteName =
    extractMetaContent(html, ['og:site_name']) || hostname;
  const rawImage = extractMetaContent(html, ['og:image', 'twitter:image']);
  let imageUrl: string | undefined;
  if (rawImage) {
    try {
      imageUrl = new URL(rawImage, targetUrl).toString();
    } catch {
      imageUrl = rawImage;
    }
  }

  const keywords = extractMetaContent(html, ['keywords', 'article:tag']);
  const suggestedHashtags = deriveKeywordsAsHashtags(keywords, title, hostname);

  const captionLines = [title];
  if (description && description.toLowerCase() !== title.toLowerCase()) {
    captionLines.push(description);
  }

  return {
    url: targetUrl,
    siteName,
    title,
    description,
    imageUrl,
    suggestedCaption: captionLines.join('\n\n').trim(),
    suggestedHashtags,
    suggestedFirstComment: `Full link -> ${targetUrl}`,
  };
}

export async function fetchAndExtractUrl(
  rawUrl: string
): Promise<ImportedUrlPreview> {
  const cleanUrl = rawUrl.trim();
  let parsed: URL;
  try {
    parsed = new URL(
      /^https?:\/\//i.test(cleanUrl) ? cleanUrl : `https://${cleanUrl}`
    );
  } catch {
    throw new Error('Enter a valid URL starting with https://');
  }

  // Built-in instant demo URLs for studio.example.com so offline/sandbox testing works immediately
  if (parsed.hostname.endsWith('example.com')) {
    const slugTitle = parsed.pathname
      .replace(/^\/+|\/+$/g, '')
      .replace(/[-_/]+/g, ' ')
      .trim();
    const headline = slugTitle
      ? slugTitle.charAt(0).toUpperCase() + slugTitle.slice(1)
      : 'How we cut weekly studio editing time by 6 hours';
    return {
      url: parsed.toString(),
      siteName: parsed.hostname,
      title: headline,
      description:
        'A practical breakdown of our lighting setup, preset audio chain, and one-pass publishing checklist.',
      suggestedCaption: `${headline}\n\nA practical breakdown of our lighting setup, preset audio chain, and one-pass publishing checklist.`,
      suggestedHashtags: 'creatorstudio workflow behindthescenes',
      suggestedFirstComment: `Read the full breakdown -> ${parsed.toString()}`,
    };
  }

  const res = await fetch(parsed.toString(), {
    headers: {
      'User-Agent': 'OmniPostLinkPreview/1.0 (+https://omnipost.app)',
      Accept: 'text/html,application/xhtml+xml,*/*',
    },
    signal: AbortSignal.timeout(6500),
  });
  if (!res.ok) {
    throw new Error(`Target URL returned HTTP ${res.status}.`);
  }
  const html = await res.text();
  return extractUrlMetadata(html, parsed.toString());
}

function extractXmlTag(block: string, tag: string): string {
  const re = new RegExp(`<${tag}(?:\\s[^>]*)?>([\\s\\S]*?)<\\/${tag}>`, 'i');
  const m = block.match(re);
  return m?.[1] ? stripTags(m[1]) : '';
}

export function parseRssOrAtomXml(
  xml: string,
  feedUrl: string
): ImportedRssFeed {
  const isAtom = /<feed[\s>]/i.test(xml) && /<entry[\s>]/i.test(xml);
  let feedTitle = 'Imported Feed';

  if (isAtom) {
    const headChunk = xml.split(/<entry[\s>]/i)[0] || xml;
    feedTitle = extractXmlTag(headChunk, 'title') || feedTitle;
  } else {
    const headChunk = xml.split(/<item[\s>]/i)[0] || xml;
    feedTitle = extractXmlTag(headChunk, 'title') || feedTitle;
  }

  const items: ImportedRssItem[] = [];
  const blockRegex = isAtom
    ? /<entry(?:\s[^>]*)?>([\s\S]*?)<\/entry>/gi
    : /<item(?:\s[^>]*)?>([\s\S]*?)<\/item>/gi;

  let match: RegExpExecArray | null;
  while ((match = blockRegex.exec(xml)) !== null && items.length < 15) {
    const chunk = match[1];
    const title = extractXmlTag(chunk, 'title');
    let link = extractXmlTag(chunk, 'link');
    if (!link) {
      const atomHref = chunk.match(/<link[^>]+href=["']([^"']+)["'][^>]*>/i);
      if (atomHref?.[1]) link = decodeHtmlEntities(atomHref[1].trim());
    }
    const rawDesc =
      extractXmlTag(chunk, 'description') ||
      extractXmlTag(chunk, 'summary') ||
      extractXmlTag(chunk, 'content:encoded') ||
      extractXmlTag(chunk, 'content');
    const summary = rawDesc.slice(0, 200);
    const publishedAt =
      extractXmlTag(chunk, 'pubDate') ||
      extractXmlTag(chunk, 'published') ||
      extractXmlTag(chunk, 'updated') ||
      undefined;

    if (!title && !summary) continue;

    const cleanCaption = [title, summary]
      .filter(Boolean)
      .join('\n\n')
      .trim();

    items.push({
      title: title || summary.slice(0, 64),
      link: link || feedUrl,
      summary,
      publishedAt,
      suggestedCaption: cleanCaption,
      suggestedFirstComment: link ? `Read the full post -> ${link}` : '',
    });
  }

  return {
    feedUrl,
    feedTitle,
    items,
  };
}

export async function fetchAndExtractRss(
  rawFeedUrl: string
): Promise<ImportedRssFeed> {
  const cleanUrl = rawFeedUrl.trim();
  let parsed: URL;
  try {
    parsed = new URL(
      /^https?:\/\//i.test(cleanUrl) ? cleanUrl : `https://${cleanUrl}`
    );
  } catch {
    throw new Error('Enter a valid RSS or Atom feed URL.');
  }

  if (parsed.hostname.endsWith('example.com')) {
    return {
      feedUrl: parsed.toString(),
      feedTitle: 'Creator Studio Dispatch (RSS)',
      items: [
        {
          title: 'Why a single 60W key light beats three cheap LED panels',
          link: 'https://studio.example.com/posts/single-60w-key-light',
          summary:
            'Soft wall bounce gives cleaner eye catchlights and takes 90 seconds to set up.',
          suggestedCaption:
            'Why a single 60W key light beats three cheap LED panels\n\nSoft wall bounce gives cleaner eye catchlights and takes 90 seconds to set up.',
          suggestedFirstComment:
            'Read the full post -> https://studio.example.com/posts/single-60w-key-light',
        },
        {
          title: 'Our 15-minute Friday content batching checklist',
          link: 'https://studio.example.com/posts/friday-batch-checklist',
          summary:
            'How we export vertical & horizontal cuts once and queue Monday through Friday.',
          suggestedCaption:
            'Our 15-minute Friday content batching checklist\n\nHow we export vertical & horizontal cuts once and queue Monday through Friday.',
          suggestedFirstComment:
            'Read the full post -> https://studio.example.com/posts/friday-batch-checklist',
        },
        {
          title: 'Clean vocal EQ settings for untreated home offices',
          link: 'https://studio.example.com/posts/untreated-room-eq',
          summary:
            'High-pass at 85Hz and a gentle 3dB cut at 320Hz removes boxy room resonance immediately.',
          suggestedCaption:
            'Clean vocal EQ settings for untreated home offices\n\nHigh-pass at 85Hz and a gentle 3dB cut at 320Hz removes boxy room resonance immediately.',
          suggestedFirstComment:
            'Read the full post -> https://studio.example.com/posts/untreated-room-eq',
        },
      ],
    };
  }

  const res = await fetch(parsed.toString(), {
    headers: {
      'User-Agent': 'OmniPostFeedReader/1.0 (+https://omnipost.app)',
      Accept: 'application/rss+xml,application/atom+xml,application/xml,text/xml,*/*',
    },
    signal: AbortSignal.timeout(6500),
  });
  if (!res.ok) {
    throw new Error(`RSS feed returned HTTP ${res.status}.`);
  }
  const xml = await res.text();
  return parseRssOrAtomXml(xml, parsed.toString());
}
