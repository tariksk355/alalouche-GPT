import { Link } from "react-router-dom";
import { createPageUrl } from "@/utils";
import { useState, useEffect } from "react";
import { listMenuCatalog } from "@/lib/api/storefrontOps";
import StorefrontAppDownloadFloatingCta from "@/components/storefront/StorefrontAppDownloadFloatingCta";

export default function Home() {
  const [menuItems, setMenuItems] = useState([]);

  const scrollToTopAfterNavigation = () => {
    window.setTimeout(() => {
      window.scrollTo({ top: 0, left: 0, behavior: "auto" });
    }, 0);
  };

  useEffect(() => {
    listMenuCatalog().then(items => setMenuItems(items.slice(0, 6))).catch(() => setMenuItems([]));
  }, []);

  return (
    <div className="min-h-screen bg-white">
      <StorefrontAppDownloadFloatingCta />
      {/* About / Hero Section */}
      <section className="py-12 px-4">
        <div className="max-w-5xl mx-auto grid md:grid-cols-2 gap-10 items-stretch">
          {/* Image */}
          <div className="self-stretch">
            <img
              src="https://qtrypzzcjebvfcihiynt.supabase.co/storage/v1/object/public/base44-prod/public/699f6d055b5dc5582a3c406f/d035e89cd_Donerspit.png"
              alt="Döner à la louche"
              className="w-full object-contain"
              style={{ maxHeight: "75%", height: "75%", imageRendering: "crisp-edges" }}
            />
          </div>
          {/* Text */}
          <div>
            <p className="text-gray-500 text-sm mb-1">À la louche</p>
            <h1 className="font-serif italic text-3xl md:text-4xl text-gray-900 mb-5">
              L'expérience kebab maison
            </h1>
            <p className="text-gray-700 text-sm leading-relaxed mb-4">
              Chez À la louche, nous croyons qu'un kebab peut être bien plus qu'un simple repas rapide : il peut devenir une véritable expérience gourmande. Notre engagement est simple : qualité, authenticité et générosité. Nous travaillons avec des viandes sélectionnées avec soin, préparées avec exigence, et un pain maison cuit chaque jour dans notre cuisine. Autour de ces bases, nous proposons une variété de sauces chaudes et froides, des recettes traditionnelles aux saveurs originales, pour que chacun compose son plaisir.
            </p>
            <p className="text-gray-700 text-sm leading-relaxed mb-4">
              Notre carte s'élargit également à des spécialités comme le pide, le lahmacun ou l'iskender, ainsi qu'à des plats savoureux et équilibrés, accompagnés de boissons variées, de vins et de bières soigneusement choisis. Et pour finir sur une note sucrée, nos desserts maison invitent à partager un moment gourmand et convivial.
            </p>
            <p className="text-gray-700 text-sm leading-relaxed">
              Notre ambition est d'aller toujours plus loin : développer une cuisine qui allie savoir-faire artisanal et plaisir moderne, pour que chaque visite soit un instant de découverte et de satisfaction.
            </p>
          </div>
        </div>
      </section>

      {/* Philosophy */}
      <section className="py-16 px-4 border-t border-gray-100">
        <div className="max-w-5xl mx-auto grid md:grid-cols-2 gap-12 items-center">
          <div className="text-center md:text-left">
            <h2 className="font-serif italic text-3xl md:text-4xl text-gray-800 mb-8">
              Notre philosophie en bref
            </h2>
            <p className="text-gray-600 text-base mb-4">Un pain maison, une viande de qualité, des saveurs authentiques.</p>
            <p className="text-gray-600 text-base mb-4">Un kebab réinventé, généreux et moderne.</p>
            <p className="text-gray-600 text-base mb-8">Une expérience gourmande à partager.</p>
            <div className="flex gap-4 flex-wrap justify-center md:justify-start">
              <Link to={createPageUrl("Menu")} onClick={scrollToTopAfterNavigation} className="px-7 py-3 bg-black text-white font-medium hover:bg-gray-800 transition-colors text-sm">
                Voir le menu
              </Link>
              <Link to={createPageUrl("Reservation")} onClick={scrollToTopAfterNavigation} className="px-7 py-3 bg-[#b5122a] text-white font-medium hover:bg-[#8f0e21] transition-colors text-sm">
                Réserver
              </Link>
            </div>
          </div>
          <div className="rounded-lg overflow-hidden shadow-lg">
            <img
              src="https://images.unsplash.com/photo-1544025162-d76694265947?w=800&q=80"
              alt="Notre cuisine"
              className="w-full h-72 md:h-80 object-cover"
            />
          </div>
        </div>
      </section>


    </div>
  );
}
