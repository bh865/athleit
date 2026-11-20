import type { MetadataRoute } from 'next';

const base = (process.env.NEXT_PUBLIC_APP_URL ?? '').replace(/\/+$/, '');

export default function robots(): MetadataRoute.Robots {
  return {
    rules: [
      {
        userAgent: '*',
        allow: ['/help'],
        disallow: ['/admin', '/help/contact', '/help/requests', '/help/r/', '/help/search'],
      },
    ],
    ...(base ? { sitemap: `${base}/sitemap.xml` } : {}),
  };
}
