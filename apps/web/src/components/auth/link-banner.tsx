import type { LinkBannerData } from '@/lib/link-preview';

import styles from './auth-page.module.css';

/** Who invited you and what you are joining, above the form. A bad link says so and offers a code. */
export function LinkBanner({ data }: { data: LinkBannerData }) {
  return (
    <section
      className={data.kind === 'problem' ? styles.bannerProblem : styles.banner}
      role={data.kind === 'problem' ? 'alert' : undefined}
      aria-label={data.title}
    >
      <h3 className={styles.bannerTitle}>{data.title}</h3>
      <p className={styles.bannerBody}>{data.body}</p>
    </section>
  );
}
