import { Link } from "react-router-dom";
import { createPageUrl } from "@/utils";
import { useState, useEffect } from "react";
import { base44 } from "@/api/base44Client";
import PrivacyPolicyModal from "@/components/PrivacyPolicyModal";
import { getCart, cartCount } from "@/components/cartStore";
import { ShoppingCart } from "lucide-react";

export default function Layout({ children, currentPageName }) {
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);
  const [user, setUser] = useState(null);
  const [loading, setLoading] = useState(true);
  const [showPrivacy, setShowPrivacy] = useState(false);
  const [showScrollTop, setShowScrollTop] = useState(false);
  const [itemCount, setItemCount] = useState(cartCount(getCart()));

  useEffect(() => {
    // Track visit - one per session per day
    const today = new Date().toISOString().split("T")[0];
    const sessionKey = `visit_tracked_${today}`;
    if (!sessionStorage.getItem(sessionKey)) {
      sessionStorage.setItem(sessionKey, "1");
      const sessionId = sessionStorage.getItem("session_id") || Math.random().toString(36).slice(2);
      sessionStorage.setItem("session_id", sessionId);
      base44.entities.Visit.create({ date: today, page: currentPageName, session_id: sessionId }).catch(() => {});
    }
  }, []);

  useEffect(() => {
    const handleScroll = () => setShowScrollTop(window.scrollY > 400);
    window.addEventListener("scroll", handleScroll);
    return () => window.removeEventListener("scroll", handleScroll);
  }, []);

  useEffect(() => {
    const update = () => setItemCount(cartCount(getCart()));
    window.addEventListener("storage", update);
    const interval = setInterval(update, 500);
    return () => { window.removeEventListener("storage", update); clearInterval(interval); };
  }, []);

  const scrollToTop = () => window.scrollTo({ top: 0, behavior: "smooth" });

  useEffect(() => {
    const checkAuth = async () => {
      try {
        const currentUser = await base44.auth.me();
        setUser(currentUser);
      } catch {
        setUser(null);
      } finally {
        setLoading(false);
      }
    };
    checkAuth();
  }, []);

  // Don't show public nav on admin pages
  const isAdmin = ["AdminDashboard", "AdminLogin", "OrderReceiver", "DevicePair"].includes(currentPageName);
  if (isAdmin) return <>{children}</>;

  const navLinks = [
    { name: "Menu", page: "Menu" },
    { name: "A propos", page: "APropos" },
    { name: "Reservation", page: "Reservation" },
    { name: "Mes commandes", page: "MesCommandes" },
  ];

  const CartIcon = () => (
    <Link to={createPageUrl("Panier")} className="relative flex items-center gap-1 text-sm font-medium text-gray-700 hover:text-black transition-colors">
      <ShoppingCart className="w-5 h-5" />
      {itemCount > 0 && (
        <span className="absolute -top-1.5 -right-2 w-4 h-4 bg-[#b5122a] text-white text-[10px] font-bold rounded-full flex items-center justify-center">{itemCount}</span>
      )}
    </Link>
  );

  return (
    <div className="min-h-screen flex flex-col">
      <style>{`
        @import url('https://fonts.googleapis.com/css2?family=Playfair+Display:ital,wght@0,400;0,600;1,400;1,600&family=Inter:wght@300;400;500;600&display=swap');
        body { font-family: 'Inter', sans-serif; }
        .font-serif { font-family: 'Playfair Display', serif; }
      `}</style>

      {/* Top info bar */}
      <div className="hidden md:block border-b border-gray-200 bg-white">
        <div className="max-w-6xl mx-auto px-4 py-3 grid grid-cols-3 items-start text-sm">
          {/* Horaires */}
          <div>
            <p className="font-semibold text-gray-800 mb-1">Heures d'ouverture</p>
            <p className="text-gray-600"><span className="font-semibold">Lundi:</span> fermé</p>
            <p className="text-gray-600"><span className="font-semibold">Ma - Ven:</span> 10h00 - 14h00 &amp; 17h00 - 22h00</p>
            <p className="text-gray-600"><span className="font-semibold">Samedi:</span> 10h00 - 23h00 non stop</p>
            <p className="text-gray-600"><span className="font-semibold">Dimanche:</span> 12h00 - 21h00 non stop</p>
          </div>
          {/* Logo centré */}
          <div className="flex justify-center items-center">
            <Link to={createPageUrl("Home")}>
              <img
                src="https://qtrypzzcjebvfcihiynt.supabase.co/storage/v1/object/public/base44-prod/public/user_6988e8d4fc295c9d940c5901/05562fbc0_Alalouche-logo.png"
                alt="À la louche"
                className="h-24"
              />
            </Link>
          </div>
          {/* Contact */}
          <div className="text-right">
            <p className="font-semibold text-gray-800 mb-1">Contact</p>
            <a href="tel:0263034561" className="flex items-center justify-end gap-1 text-[#b5122a] hover:underline mb-1">
              <span>📞</span> 026 303 45 61
            </a>
            <p className="text-[#b5122a]">
              <span>📍</span> Rte de Chantemerle 58<br />
              <span className="ml-4">1763 Granges-Paccot</span>
            </p>
          </div>
        </div>
      </div>

      {/* Navbar */}
      <nav className="bg-white border-b border-gray-200 sticky top-0 z-50">
        <div className="max-w-6xl mx-auto px-4 flex items-center justify-between h-20 md:h-12">
          {/* Logo mobile only */}
          <Link to={createPageUrl("Home")} className="md:hidden">
            <img
              src="https://qtrypzzcjebvfcihiynt.supabase.co/storage/v1/object/public/base44-prod/public/user_6988e8d4fc295c9d940c5901/05562fbc0_Alalouche-logo.png"
              alt="À la louche"
              className="h-16"
              style={{ imageRendering: "crisp-edges" }}
            />
          </Link>

          {/* Desktop nav */}
          <div className="hidden md:flex items-center gap-8">
            {navLinks.map(link => (
              <Link
                key={link.page}
                to={createPageUrl(link.page)}
                className={`text-sm font-medium transition-colors pb-0.5 border-b-2 ${
                  currentPageName === link.page
                    ? "text-[#b5122a] border-[#b5122a]"
                    : "text-gray-700 border-transparent hover:text-black hover:border-gray-300"
                }`}
              >
                {link.name}
              </Link>
            ))}
          </div>

          <div className="hidden md:flex items-center gap-3">
            <CartIcon />
            {!loading && (
              user ? (
                <>
                  <Link
                    to={createPageUrl("Account")}
                    className="px-4 py-2 text-gray-700 text-sm font-medium hover:text-black transition-colors"
                  >
                    Mon Compte
                  </Link>
                  <button
                    onClick={() => base44.auth.logout()}
                    className="px-4 py-2 text-gray-700 text-sm font-medium hover:text-black transition-colors"
                  >
                    Déconnexion
                  </button>
                </>
              ) : (
                <button
                  onClick={() => base44.auth.redirectToLogin(window.location.href)}
                  className="px-4 py-2 text-gray-700 text-sm font-medium hover:text-black transition-colors"
                >
                  Connexion / S'inscrire
                </button>
              )
            )}
            <Link
              to={createPageUrl("Order")}
              className="px-5 py-2 bg-[#b5122a] text-white text-sm font-medium hover:bg-[#8f0e21] transition-colors"
            >
              Commander
            </Link>
          </div>

          {/* Mobile cart icon */}
          <div className="md:hidden mr-1">
            <CartIcon />
          </div>

          {/* Mobile menu button */}
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

        {/* Mobile menu */}
        {mobileMenuOpen && (
          <div className="md:hidden border-t border-gray-100 bg-white px-6 py-5 space-y-1">
            <Link
              to={createPageUrl("Panier")}
              onClick={() => setMobileMenuOpen(false)}
              className={`flex items-center gap-2 text-sm font-medium py-3 border-b border-gray-50 transition-colors ${currentPageName === "Panier" ? "text-[#b5122a]" : "text-gray-700"}`}
            >
              <ShoppingCart className="w-4 h-4" />
              Panier {itemCount > 0 && <span className="ml-1 px-1.5 py-0.5 bg-[#b5122a] text-white text-[10px] rounded-full font-bold">{itemCount}</span>}
            </Link>
            {navLinks.map(link => (
              <Link
                key={link.page}
                to={createPageUrl(link.page)}
                onClick={() => setMobileMenuOpen(false)}
                className={`block text-sm font-medium py-3 border-b border-gray-50 transition-colors ${
                  currentPageName === link.page ? "text-[#b5122a]" : "text-gray-700"
                }`}
              >
                {link.name}
              </Link>
            ))}
            <div className="pt-3 space-y-2">
              {!loading && (
                user ? (
                  <>
                    <Link
                      to={createPageUrl("Account")}
                      onClick={() => setMobileMenuOpen(false)}
                      className="block w-full text-center px-5 py-3 border border-gray-200 text-gray-700 text-sm font-medium rounded"
                    >
                      Mon Compte
                    </Link>
                    <button
                      onClick={() => base44.auth.logout()}
                      className="block w-full text-center px-5 py-3 border border-gray-200 text-gray-700 text-sm font-medium rounded"
                    >
                      Déconnexion
                    </button>
                  </>
                ) : (
                  <button
                    onClick={() => base44.auth.redirectToLogin(window.location.href)}
                    className="block w-full text-center px-5 py-3 border border-gray-200 text-gray-700 text-sm font-medium rounded"
                  >
                    Connexion / S'inscrire
                  </button>
                )
              )}
              <Link
                to={createPageUrl("Order")}
                onClick={() => setMobileMenuOpen(false)}
                className="block w-full text-center px-5 py-3 bg-[#b5122a] text-white text-sm font-medium rounded"
              >
                Commander
              </Link>
            </div>
          </div>
        )}
      </nav>

      {/* Page content */}
      <main className="flex-1">
        {children}
      </main>

      {/* Footer */}
      {showScrollTop && (
        <button
          onClick={scrollToTop}
          className="fixed bottom-6 right-6 z-50 w-11 h-11 bg-[#b5122a] text-white rounded-full shadow-lg flex items-center justify-center hover:bg-[#8f0e21] transition-colors"
          aria-label="Retour en haut"
        >
          <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 15l7-7 7 7" />
          </svg>
        </button>
      )}

      <footer className="bg-black text-white">
        <div className="max-w-6xl mx-auto px-8 py-10 flex flex-col md:flex-row items-center md:items-center justify-between gap-8">
          {/* Logo gauche */}
          <div className="flex-shrink-0">
            <img
              src="https://qtrypzzcjebvfcihiynt.supabase.co/storage/v1/object/public/base44-prod/public/699f6d055b5dc5582a3c406f/109735483_Footer-logo.png"
              alt="À la louche"
              className="h-72" style={{imageRendering: "crisp-edges"}}
            />
          </div>
          {/* Infos droite */}
          <div className="text-right text-sm">
            <h3 className="font-serif italic text-2xl mb-2 text-white">À la louche</h3>
            <div className="text-gray-300 mb-1">
              <span>📍</span> Rte de Chantemerle 58<br />
              <span className="ml-5">1763 Granges-Paccot</span>
            </div>
            <div className="text-gray-300 mb-1">
              <span>📞</span>{" "}
              <a href="tel:0263034561" className="hover:text-white transition-colors">026 303 45 61</a>
            </div>
            <div className="text-gray-300">
              <span>✉</span>{" "}
              <a href="mailto:info@alalouche.ch" className="hover:text-white transition-colors">info@alalouche.ch</a>
            </div>
          </div>
        </div>
        <div className="border-t border-gray-800 px-4 py-4 text-center text-gray-600 text-xs">
          © {new Date().getFullYear()} À la louche.{" "}
          <button onClick={() => setShowPrivacy(true)} className="text-gray-400 hover:text-white transition-colors underline">
            Politique de confidentialité
          </button>
          {" "}| Web by{" "}
          <a href="https://kodlantis.com" target="_blank" rel="noopener noreferrer" className="text-gray-400 hover:text-white transition-colors">
            Kodlantis
          </a>
        </div>
        <PrivacyPolicyModal open={showPrivacy} onClose={setShowPrivacy} />
      </footer>
    </div>
  );
}