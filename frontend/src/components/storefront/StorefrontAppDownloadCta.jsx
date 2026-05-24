import { ANDROID_PLAY_STORE_URL, IOS_APP_STORE_URL } from '@/lib/storefrontAppLinks';

const cx = (...values) => values.filter(Boolean).join(' ');

export default function StorefrontAppDownloadCta({ className = '' }) {
  return (
    <div className={cx('rounded-lg border border-gray-200 bg-gray-50 px-4 py-4', className)}>
      <p className="text-sm font-semibold text-gray-900">Commandez plus vite avec notre application</p>
      <p className="mt-1 text-xs leading-relaxed text-gray-600">
        Retrouvez le menu, vos commandes et vos favoris directement sur mobile.
      </p>
      <div className="mt-3 flex flex-col gap-2 sm:flex-row sm:flex-wrap">
        <a
          href={IOS_APP_STORE_URL}
          target="_blank"
          rel="noopener noreferrer"
          className="inline-flex items-center justify-center rounded-md border border-gray-300 bg-white px-3 py-2 text-xs font-medium text-gray-800 transition-colors hover:bg-gray-100"
        >
          Télécharger sur l&apos;App Store
        </a>
        <a
          href={ANDROID_PLAY_STORE_URL}
          target="_blank"
          rel="noopener noreferrer"
          className="inline-flex items-center justify-center rounded-md border border-gray-300 bg-white px-3 py-2 text-xs font-medium text-gray-800 transition-colors hover:bg-gray-100"
        >
          Disponible sur Google Play
        </a>
      </div>
    </div>
  );
}
