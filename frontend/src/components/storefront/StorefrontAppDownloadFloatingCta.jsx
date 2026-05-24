import { useEffect, useId, useRef, useState } from 'react';
import { ANDROID_PLAY_STORE_URL, IOS_APP_STORE_URL } from '@/lib/storefrontAppLinks';

const cx = (...values) => values.filter(Boolean).join(' ');

const VARIANT_WRAPPER = {
  default:
    'top-[max(env(safe-area-inset-top),6rem)] right-[max(env(safe-area-inset-right),0.75rem)] md:top-[6.25rem] md:right-6',
  menu:
    'top-[max(env(safe-area-inset-top),6.25rem)] right-[max(env(safe-area-inset-right),0.75rem)] md:top-[6.5rem] md:right-6',
};

export default function StorefrontAppDownloadFloatingCta({
  className = '',
  isSuppressed = false,
  variant = 'default',
}) {
  const [isOpen, setIsOpen] = useState(false);
  const rootRef = useRef(null);
  const popoverId = useId();

  useEffect(() => {
    if (!isOpen) return;

    const handlePointerDown = (event) => {
      if (!rootRef.current) return;
      if (!rootRef.current.contains(event.target)) {
        setIsOpen(false);
      }
    };

    const handleEscape = (event) => {
      if (event.key === 'Escape') {
        setIsOpen(false);
      }
    };

    document.addEventListener('mousedown', handlePointerDown);
    document.addEventListener('touchstart', handlePointerDown, { passive: true });
    window.addEventListener('keydown', handleEscape);

    return () => {
      document.removeEventListener('mousedown', handlePointerDown);
      document.removeEventListener('touchstart', handlePointerDown);
      window.removeEventListener('keydown', handleEscape);
    };
  }, [isOpen]);

  useEffect(() => {
    if (isSuppressed) {
      setIsOpen(false);
    }
  }, [isSuppressed]);

  if (isSuppressed) return null;

  const wrapperPosition = VARIANT_WRAPPER[variant] || VARIANT_WRAPPER.default;
  const buttonStyle =
    variant === 'menu'
      ? 'border border-white/65 shadow-[0_0_0_1px_rgba(255,255,255,0.18)]'
      : '';

  return (
    <div
      ref={rootRef}
      className={cx('fixed z-30 flex flex-col items-end gap-2 pointer-events-none', wrapperPosition, className)}
    >
      <button
        type="button"
        onClick={() => setIsOpen((previous) => !previous)}
        className={cx(
          "pointer-events-auto min-h-11 rounded-full bg-black px-4 py-2 text-sm font-medium text-white shadow-lg transition-colors hover:bg-gray-800 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-black",
          buttonStyle,
        )}
        aria-expanded={isOpen}
        aria-controls={popoverId}
      >
        <span className="sm:hidden">Télécharger l’app</span>
        <span className="hidden sm:inline">Télécharger l’app</span>
      </button>

      {isOpen && (
        <div
          id={popoverId}
          className="pointer-events-auto w-[min(16rem,calc(100vw-1.5rem))] rounded-xl border border-black/10 bg-[#fffdf8] p-3 shadow-[0_16px_38px_-20px_rgba(0,0,0,0.65),0_12px_26px_-18px_rgba(0,0,0,0.45)] backdrop-blur-[1px]"
          role="dialog"
          aria-label="Options de téléchargement de l’application"
        >
          <p className="text-sm font-semibold text-gray-900">Notre app mobile</p>
          <p className="mt-1 text-xs text-gray-600">Commandez plus vite sur votre téléphone.</p>
          <div className="mt-3 grid grid-cols-2 gap-2">
            <a
              href={IOS_APP_STORE_URL}
              target="_blank"
              rel="noopener noreferrer"
              className="inline-flex min-h-10 items-center justify-center rounded-lg border border-gray-300/90 bg-white/90 px-2 py-2 text-xs font-medium text-gray-800 shadow-sm transition-colors hover:bg-gray-100 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-black/40"
            >
              App Store
            </a>
            <a
              href={ANDROID_PLAY_STORE_URL}
              target="_blank"
              rel="noopener noreferrer"
              className="inline-flex min-h-10 items-center justify-center rounded-lg border border-gray-300/90 bg-white/90 px-2 py-2 text-xs font-medium text-gray-800 shadow-sm transition-colors hover:bg-gray-100 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-black/40"
            >
              Google Play
            </a>
          </div>
        </div>
      )}
    </div>
  );
}
