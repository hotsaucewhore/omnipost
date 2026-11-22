import { ScrollViewStyleReset } from 'expo-router/html';
import type { ReactNode } from 'react';

export default function Root({ children }: { children: ReactNode }) {
  return (
    <html lang="en" style={{ backgroundColor: '#F5F4F0' }}>
      <head>
        <meta charSet="utf-8" />
        <meta httpEquiv="X-UA-Compatible" content="IE=edge" />
        <meta
          name="viewport"
          content="width=device-width, initial-scale=1, shrink-to-fit=no"
        />
        <title>OmniPost</title>
        <ScrollViewStyleReset />
      </head>
      <body style={{ backgroundColor: '#F5F4F0', margin: 0 }}>{children}</body>
    </html>
  );
}
