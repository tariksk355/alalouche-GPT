import { Link, useLocation } from 'react-router-dom';
import { createPageUrl } from '@/utils';
import { useState, useEffect } from 'react';
import { useAuth } from '@/lib/AuthContext';
import { useTenant } from '@/lib/TenantContext';
import { trackStorefrontVisit } from '@/lib/api/storefrontOps';
import PrivacyPolicyModal from '@/components/PrivacyPolicyModal';
import { getCart, cartCount } from '@/components/cartStore';
import { Info, Mail, MapPin, Phone, ShoppingCart } from 'lucide-react';

const DEFAULT_HEADER_LOGO =
  'https://qtrypzzcjebvfcihiynt.supabase.co/storage/v1/object/public/base44-prod/public/user_6988e8d4fc295c9d940c5901/05562fbc0_Alalouche-logo.png';
const DEFAULT_FOOTER_LOGO =
  'https://qtrypzzcjebvfcihiynt.supabase.co/storage/v1/object/public/base44-prod/public/699f6d055b5dc5582a3c406f/109735483_Footer-logo.png';
const RESTAURANT_HOURS = [
  { day: 'Lundi:', hours: 'fermé' },
  { day: 'Ma - Ven:', hours: '10h00 - 14h00 & 17h00 - 22h00' },
  { day: 'Samedi:', hours: '10h00 - 23h00 non stop' },
  { day: 'Dimanche:', hours: '12h00 - 21h00 non stop' },
];

const RESTAURANT_CONTACT = {
  phone: '026 303 45 61',
  addressLine1: 'Rte de Chantemerle 58',
  addressLine2: '1763 Granges-Paccot',
  email: 'info@alalouche.ch',
};

const sanitizeBrandName = (value) => {
  const normalized = value?.trim();
  if (!normalized) return 'Restaurant';
  return normalized.replace(/\s*(?:\(|-|–)?\s*local\)?\s*$/i, '').trim() || normalized;
};

const hexToRgba = (hex, alpha) => {
  if (typeof hex !== 'string') return `rgba(181, 18, 42, ${alpha})`;
  const normalized = hex.replace('#', '').trim();
  if (!/^[0-9a-fA-F]{6}$/.test(normalized)) return `rgba(181, 18, 42, ${alpha})`;

  const red = parseInt(normalized.slice(0, 2), 16);
  const green = parseInt(normalized.slice(2, 4), 16);
  const blue = parseInt(normalized.slice(4, 6), 16);

  return `rgba(${red}, ${green}, ${blue}, ${alpha})`;
};

export default function Layout({ children, currentPageName }) {
  const location = useLocation();
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);
  const { user, logout } = useAuth();
  const { tenant } = useTenant();
  const [showPrivacy, setShowPrivacy] = useState(false);
  const [showScrollTop, setShowScrollTop] = useState(false);
  const [itemCount, setItemCount] = useState(cartCount(getCart()));

  const primaryColor = tenant?.branding?.primaryColor || '#b5122a';
  const brandName = sanitizeBrandName(tenant?.name || 'À la Louche');
  const logoUrl = tenant?.branding?.logoUrl || DEFAULT_HEADER_LOGO;
  const footerLogoUrl = DEFAULT_FOOTER_LOGO;
  const storefrontAnnouncement = tenant?.orderingSettings?.storefrontAnnouncement && typeof tenant.orderingSettings.storefrontAnnouncement === 'object'
    ? tenant.orderingSettings.storefrontAnnouncement
    : null;
  const storefrontAnnouncementMessage = typeof storefrontAnnouncement?.message === 'string'
    ? storefrontAnnouncement.message.trim()
    : '';
  const showStorefrontAnnouncement = storefrontAnnouncement?.active === true && storefrontAnnouncementMessage.length > 0;
  const headerContact = {
    phone: RESTAURANT_CONTACT.phone,
    addressLine1: RESTAURANT_CONTACT.addressLine1,
    addressLine2: RESTAURANT_CONTACT.addressLine2,
  };
  const footerContact = RESTAURANT_CONTACT;

  useEffect(() => {
    if (typeof window === 'undefined') return;
    if (['AdminDashboard', 'AdminLogin', 'OrderReceiver', 'DevicePair'].includes(currentPageName)) return;

    const todayKey = new Date().toISOString().slice(0, 10);
    const storageKey = 'storefront_last_tracked_visit_day';
    const lastTrackedDay = localStorage.getItem(storageKey);
    if (lastTrackedDay === todayKey) return;
    localStorage.setItem(storageKey, todayKey);

    trackStorefrontVisit().catch(() => {
      // noop: analytics should never block storefront UX
    });
  }, [currentPageName, location.pathname, location.search]);

  useEffect(() => {
    const handleScroll = () => setShowScrollTop(window.scrollY > 400);
    window.addEventListener('scroll', handleScroll);
    return () => window.removeEventListener('scroll', handleScroll);
  }, []);

  useEffect(() => {
    const update = () => setItemCount(cartCount(getCart()));
    window.addEventListener('storage', update);
    const interval = setInterval(update, 500);
    return () => {
      window.removeEventListener('storage', update);
      clearInterval(interval);
    };
  }, []);

  const scrollToTop = () => window.scrollTo({ top: 0, behavior: 'smooth' });
  const isMenuViewOnlyMode = currentPageName === 'Menu'
    && typeof window !== 'undefined'
    && new URLSearchParams(window.location.search).get('mode') === 'menu-only';

  const isAdmin = ['AdminDashboard', 'AdminLogin', 'OrderReceiver', 'DevicePair'].includes(currentPageName);
  if (isAdmin) return <>{children}</>;

  const navLinks = [
    { name: 'Menu', page: 'Menu' },
    { name: 'A propos', page: 'APropos' },
    { name: 'Reservation', page: 'Reservation' },
    { name: 'Mes commandes', page: 'MesCommandes' },
  ];
  const navLinksInMode = isMenuViewOnlyMode ? [{ name: 'Menu', page: 'Menu' }] : navLinks;

  const CartIcon = () => (
    <Link to={createPageUrl('Panier')} className="relative flex items-center gap-1 text-sm font-medium text-gray-700 hover:text-black transition-colors">
      <ShoppingCart className="w-5 h-5" />
      {itemCount > 0 && (
        <span className="absolute -top-1.5 -right-2 w-4 h-4 text-white text-[10px] font-bold rounded-full flex items-center justify-center" style={{ backgroundColor: primaryColor }}>
          {itemCount}
        </span>
      )}
    </Link>
  );

  return (
    <div className="min-h-screen flex flex-col">
      <style>{`
        @import url('https://fonts.googleapis.com/css2?family=Allura&family=Playfair+Display:ital,wght@0,400;0,600;1,400;1,600&family=Inter:wght@300;400;500;600&display=swap');
        body { font-family: 'Inter', sans-serif; }
        .font-serif { font-family: 'Playfair Display', serif; }
        .font-script { font-family: 'Allura', 'Playfair Display', serif; }
      `}</style>

      <div className="hidden md:block border-b border-gray-200 bg-white">
        <div className="max-w-6xl mx-auto px-4 py-3 grid grid-cols-3 items-start text-sm">
          <div>
            <p className="font-script text-3xl leading-none text-gray-900 sm:text-[2.4rem]">Heures d’ouverture</p>
            <div className="mt-3 space-y-1 text-gray-600">
              {RESTAURANT_HOURS.map((line) => (
                <p key={line.day}>
                  <span className="font-semibold text-gray-800">{line.day}</span>{' '}
                  <span>{line.hours}</span>
                </p>
              ))}
            </div>
          </div>
          <div className="flex justify-center items-center">
            <Link to={createPageUrl('Home')}>
              <img src={logoUrl} alt={brandName} className="h-36 lg:h-40" />
            </Link>
          </div>
          <div className="text-right">
            <p className="font-script text-3xl leading-none text-gray-900 sm:text-[2.4rem]">Contact</p>
            <div className="mt-3 space-y-1 text-gray-600">
              <a href={`tel:${headerContact.phone.replace(/\s+/g, '')}`} className="flex items-center justify-center gap-2 hover:underline md:justify-end" style={{ color: primaryColor }}>
                <Phone className="h-4 w-4 flex-shrink-0" />
                <span>{headerContact.phone}</span>
              </a>
              <div className="flex items-start justify-end gap-2" style={{ color: primaryColor }}>
                <MapPin className="mt-0.5 h-4 w-4 flex-shrink-0" />
                <div>
                  <div>{headerContact.addressLine1}</div>
                  <div>{headerContact.addressLine2}</div>
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>

      <nav className="bg-white border-b border-gray-200 sticky top-0 z-50">
        <div className="max-w-6xl mx-auto px-4 flex items-center justify-between h-24 md:h-12">
          <Link to={createPageUrl('Home')} className="md:hidden">
            <img src={logoUrl} alt={brandName} className="h-24" style={{ imageRendering: 'crisp-edges' }} />
          </Link>

          <div className="hidden md:flex items-center gap-8">
            {navLinksInMode.map((link) => (
              <Link
                key={link.page}
                to={link.page === 'Menu' && isMenuViewOnlyMode ? `${createPageUrl('Menu')}?mode=menu-only` : createPageUrl(link.page)}
                className={`text-sm font-medium transition-colors pb-0.5 border-b-2 ${
                  currentPageName === link.page ? 'text-gray-900' : 'text-gray-700 border-transparent hover:text-black hover:border-gray-300'
                }`}
                style={currentPageName === link.page ? { borderColor: primaryColor, color: primaryColor } : undefined}
              >
                {link.name}
              </Link>
            ))}
          </div>

          <div className="hidden md:flex items-center gap-3">
            {!isMenuViewOnlyMode && <CartIcon />}
            {!isMenuViewOnlyMode && (user ? (
              <>
                <Link to={createPageUrl('Account')} className="px-4 py-2 text-gray-700 text-sm font-medium hover:text-black transition-colors">
                  Mon Compte
                </Link>
                <button onClick={logout} className="px-4 py-2 text-gray-700 text-sm font-medium hover:text-black transition-colors">
                  Déconnexion
                </button>
              </>
            ) : (
              <button
                onClick={() => (window.location.href = createPageUrl('Account'))}
                className="px-4 py-2 text-gray-700 text-sm font-medium hover:text-black transition-colors"
              >
                Connexion / S'inscrire
              </button>
            ))}
            {!isMenuViewOnlyMode && (
              <Link to={createPageUrl('Menu')} className="px-5 py-2 text-white text-sm font-medium transition-colors" style={{ backgroundColor: primaryColor }}>
                Commander
              </Link>
            )}
          </div>

          {!isMenuViewOnlyMode && (
            <div className="md:hidden mr-1">
              <CartIcon />
            </div>
          )}

          <button className="md:hidden p-2 text-gray-600 hover:text-black" onClick={() => setMobileMenuOpen(!mobileMenuOpen)}>
            {mobileMenuOpen ? (
              <svg className="w-6 h-6" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
              </svg>
            ) : (
              <svg className="w-6 h-6" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 6h16M4 12h16M4 18h16" />
              </svg>
            )}
          </button>
        </div>

        {mobileMenuOpen && (
          <div className="md:hidden border-t border-gray-100 bg-white px-6 py-5 space-y-1">
            {!isMenuViewOnlyMode && (
              <Link
                to={createPageUrl('Panier')}
                onClick={() => setMobileMenuOpen(false)}
                className={`flex items-center gap-2 text-sm font-medium py-3 border-b border-gray-50 transition-colors ${
                  currentPageName === 'Panier' ? 'text-gray-900' : 'text-gray-700'
                }`}
                style={currentPageName === 'Panier' ? { color: primaryColor } : undefined}
              >
                <ShoppingCart className="w-4 h-4" />
                Panier {itemCount > 0 && <span className="ml-1 px-1.5 py-0.5 text-white text-[10px] rounded-full font-bold" style={{ backgroundColor: primaryColor }}>{itemCount}</span>}
              </Link>
            )}
            {navLinksInMode.map((link) => (
              <Link
                key={link.page}
                to={link.page === 'Menu' && isMenuViewOnlyMode ? `${createPageUrl('Menu')}?mode=menu-only` : createPageUrl(link.page)}
                onClick={() => setMobileMenuOpen(false)}
                className={`block text-sm font-medium py-3 border-b border-gray-50 transition-colors ${
                  currentPageName === link.page ? 'text-gray-900' : 'text-gray-700'
                }`}
                style={currentPageName === link.page ? { color: primaryColor } : undefined}
              >
                {link.name}
              </Link>
            ))}
            {!isMenuViewOnlyMode && <div className="pt-3 space-y-2">
              {user ? (
                <>
                  <Link to={createPageUrl('Account')} onClick={() => setMobileMenuOpen(false)} className="block w-full text-center px-5 py-3 border border-gray-200 text-gray-700 text-sm font-medium rounded">
                    Mon Compte
                  </Link>
                  <button onClick={logout} className="block w-full text-center px-5 py-3 border border-gray-200 text-gray-700 text-sm font-medium rounded">
                    Déconnexion
                  </button>
                </>
              ) : (
                <button
                  onClick={() => (window.location.href = createPageUrl('Account'))}
                  className="block w-full text-center px-5 py-3 border border-gray-200 text-gray-700 text-sm font-medium rounded"
                >
                  Connexion / S'inscrire
                </button>
              )}
              <Link to={createPageUrl('Menu')} onClick={() => setMobileMenuOpen(false)} className="block w-full text-center px-5 py-3 text-white text-sm font-medium rounded" style={{ backgroundColor: primaryColor }}>
                Commander
              </Link>
            </div>}
          </div>
        )}
      </nav>

      {showStorefrontAnnouncement && (
        <div
          className="border-b"
          style={{
            borderColor: hexToRgba(primaryColor, 0.12),
            background: `linear-gradient(180deg, ${hexToRgba(primaryColor, 0.06)} 0%, rgba(255, 255, 255, 0.98) 100%)`,
          }}
        >
          <div className="max-w-6xl mx-auto px-4 py-3">
            <div
              className="rounded-2xl border bg-white/90 px-4 py-3 shadow-sm backdrop-blur-sm sm:px-5"
              style={{ borderColor: hexToRgba(primaryColor, 0.16) }}
            >
              <div className="flex items-start gap-3">
                <div
                  className="mt-0.5 flex h-9 w-9 flex-shrink-0 items-center justify-center rounded-full border bg-white"
                  style={{ borderColor: hexToRgba(primaryColor, 0.16), color: primaryColor }}
                  aria-hidden="true"
                >
                  <Info className="h-4 w-4" />
                </div>
                <div className="min-w-0 flex-1">
                  <p
                    className="text-[11px] font-semibold uppercase tracking-[0.18em]"
                    style={{ color: hexToRgba(primaryColor, 0.82) }}
                  >
                    Information
                  </p>
                  <p className="mt-1 break-words whitespace-pre-wrap text-sm leading-6 text-gray-700 sm:text-[15px]">
                    {storefrontAnnouncementMessage}
                  </p>
                </div>
              </div>
            </div>
          </div>
        </div>
      )}

      <main className="flex-1">{children}</main>

      {showScrollTop && (
        <button
          onClick={scrollToTop}
          className="fixed bottom-6 right-6 z-50 w-11 h-11 text-white rounded-full shadow-lg flex items-center justify-center transition-colors"
          style={{ backgroundColor: primaryColor }}
          aria-label="Retour en haut"
        >
          <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 15l7-7 7 7" />
          </svg>
        </button>
      )}

      <footer className="bg-black text-white">
        <div className="max-w-6xl mx-auto px-6 py-10">
          <div className="flex flex-col items-center text-center gap-8 md:flex-row md:items-center md:justify-between md:text-left">
            <div className="flex flex-col items-center text-center md:items-start md:text-left md:self-center">
              <img
                src={footerLogoUrl}
                alt={brandName}
                className="h-48 sm:h-56 md:h-64 lg:h-80 w-auto object-contain"
                style={{ imageRendering: 'auto' }}
              />
              <h3 className="font-script mt-3 text-4xl leading-none text-white sm:text-5xl md:hidden">
                {brandName}
              </h3>
            </div>
            <div className="space-y-3 text-sm text-gray-300 md:max-w-sm md:pt-0 md:self-center">
              <h3 className="font-script hidden text-5xl leading-none text-white md:block">{brandName}</h3>
              <div className="flex items-start justify-center gap-2 text-center leading-relaxed md:justify-start md:text-left">
                <MapPin className="mt-0.5 h-4 w-4 flex-shrink-0" />
                <span>{`${footerContact.addressLine1} · ${footerContact.addressLine2}`}</span>
              </div>
              <div className="flex items-center justify-center gap-2 md:justify-start">
                <Phone className="h-4 w-4 flex-shrink-0" />
                <a href={`tel:${footerContact.phone.replace(/\s+/g, '')}`} className="hover:text-white transition-colors">
                  {footerContact.phone}
                </a>
              </div>
              <div className="flex items-center justify-center gap-2 break-all sm:break-normal md:justify-start">
                <Mail className="h-4 w-4 flex-shrink-0" />
                <a href={`mailto:${footerContact.email}`} className="hover:text-white transition-colors">
                  {footerContact.email}
                </a>
              </div>
            </div>
          </div>
        </div>
        <div className="border-t border-gray-800 px-4 py-4 text-center text-sm text-gray-400 md:text-[15px]">
          © {new Date().getFullYear()} {brandName}.{' '}
          <button onClick={() => setShowPrivacy(true)} className="text-gray-200 hover:text-white transition-colors underline">
            Politique de Confidentialité
          </button>{' '}
          | Web by{' '}
          <a href="https://kodlantis.com" target="_blank" rel="noopener noreferrer" className="text-gray-200 hover:text-white transition-colors">
            Kodlantis
          </a>
        </div>
        <PrivacyPolicyModal open={showPrivacy} onClose={setShowPrivacy} tenant={tenant} />
      </footer>
    </div>
  );
}
