import { ANDROID_PLAY_STORE_URL, IOS_APP_STORE_URL } from '@/lib/storefrontAppLinks';

const cx = (...values) => values.filter(Boolean).join(' ');

const CTA_VARIANTS = {
  default: {
    container: 'rounded-lg border border-gray-200 bg-gray-50 px-4 py-3.5',
    title: 'text-sm font-semibold text-gray-900',
    description: 'mt-1 text-xs leading-relaxed text-gray-600',
    actions: 'mt-2.5 flex flex-wrap justify-center gap-2',
    button: 'inline-flex items-center justify-center rounded-md border border-gray-300 bg-white px-3 py-1.5 text-xs font-medium text-gray-800 transition-colors hover:bg-gray-100',
    titleCopy: 'Commandez plus vite avec notre app',
    bodyCopy: 'Menu, commandes et favoris sur mobile.',
  },
  compact: {
    container: 'rounded-lg border border-gray-200/80 bg-gray-50/80 px-3.5 py-3',
    title: 'text-xs font-semibold uppercase tracking-wide text-gray-800',
    description: 'mt-1 text-xs leading-relaxed text-gray-600',
    actions: 'mt-2 flex flex-wrap gap-2',
    button: 'inline-flex items-center justify-center rounded-md border border-gray-300 bg-white px-2.5 py-1 text-[11px] font-medium text-gray-700 transition-colors hover:bg-gray-100',
    titleCopy: 'Notre app mobile est disponible',
    bodyCopy: 'Commandez plus vite depuis votre téléphone.',
  },
};

export default function StorefrontAppDownloadCta({ className = '', variant = 'default' }) {
  const selectedVariant = CTA_VARIANTS[variant] || CTA_VARIANTS.default;

  return (
    <div className={cx(selectedVariant.container, className)}>
      <p className={selectedVariant.title}>{selectedVariant.titleCopy}</p>
      <p className={selectedVariant.description}>{selectedVariant.bodyCopy}</p>
      <div className={selectedVariant.actions}>
        <a
          href={IOS_APP_STORE_URL}
          target="_blank"
          rel="noopener noreferrer"
          className={selectedVariant.button}
        >
          App Store
        </a>
        <a
          href={ANDROID_PLAY_STORE_URL}
          target="_blank"
          rel="noopener noreferrer"
          className={selectedVariant.button}
        >
          Google Play
        </a>
      </div>
    </div>
  );
}
