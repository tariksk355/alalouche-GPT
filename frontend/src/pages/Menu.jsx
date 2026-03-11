import { useState, useEffect } from "react";
import { Link, useNavigate } from "react-router-dom";
import { createPageUrl } from "@/utils";
import { addItem, getCart, cartCount as getCartCount } from "@/components/cartStore";
import { listMenuCatalog } from "@/lib/api/storefrontOps";

const CATEGORIES = [
  {
    key: "Sandwichs et menu",
    title: "Sandwichs et menu",
    subtitle: "rapide, généreux, savoureux",
    description: "Nos sandwichs et menus combinent viande de qualité, pain maison et sauces gourmandes pour un plaisir immédiat, seul ou en menu complet.",
  },
  {
    key: "Nos sauces chaudes",
    title: "Nos sauces chaudes",
    subtitle: "Fondantes et réconfortantes",
    description: "Fromages fondus et champignons parfumés, des sauces qui ajoutent une touche crémeuse et gourmande à votre kebab.",
  },
  {
    key: "Nos sauces froides",
    title: "Nos sauces froides",
    subtitle: "Fraîcheur et caractère",
    description: "Des classiques comme mayonnaise et ketchup aux saveurs relevées algérienne ou piquante, composez votre kebab à votre goût.",
  },
  {
    key: "Plats et Pide",
    title: "Plats et Pide",
    subtitle: "Tradition et générosité",
    description: "Découvrez l'authenticité turque avec nos assiettes, pide variées et lahmacun, des plats cuisinés pour prendre le temps de savourer.",
  },
  {
    key: "Boissons",
    title: "Boissons",
    subtitle: "Pour accompagner chaque bouchée",
    description: "Sodas, eaux, thés glacés et spécialités comme Ayran ou Uludag, des boissons pour tous les goûts et toutes les envies.",
  },
  {
    key: "Bières & Alcools",
    title: "Bières & Alcools",
    subtitle: "Rafraîchissement et convivialité",
    description: "Une sélection de bières locales et internationales ainsi que des spiritueux turcs et vins pour agrémenter votre repas.",
  },
  {
    key: "Vins",
    title: "Vins",
    subtitle: "Élégance à table",
    description: "Une carte de vins soigneusement choisis pour accompagner vos plats et sublimer l'expérience culinaire.",
  },
  {
    key: "Desserts",
    title: "Desserts",
    subtitle: "La touche sucrée",
    description: "Terminez en douceur avec notre fondue chocolat, servie avec fraises ou bananes, pour un moment gourmand et convivial.",
  },
];

export default function Menu() {
  const [items, setItems] = useState([]);
  const [activeCategory, setActiveCategory] = useState(null);
  const [loading, setLoading] = useState(true);
  const [cart, setCart] = useState(getCart());
  const [added, setAdded] = useState(null); // item id just added
  const navigate = useNavigate();

  const handleAddToCart = (item) => {
    const updated = addItem(item);
    setCart(updated);
    setAdded(item.id);
    setTimeout(() => setAdded(null), 1200);
  };

  useEffect(() => {
    listMenuCatalog().then(data => {
      const normalized = data.map(item => ({
        id: item.id,
        name: item.name,
        description: item.description,
        price: Number(item.price || 0),
        category: item.category,
        image_url: item.imageUrl,
        allergens: item.allergens,
      }));
      setItems(normalized);
      setLoading(false);
    }).catch(() => setLoading(false));
  }, []);

  const activeCategoryData = activeCategory
    ? CATEGORIES.find(c => c.key === activeCategory)
    : null;

  const categoryItems = activeCategory
    ? items.filter(i => i.category === activeCategory)
    : [];

  if (activeCategory && activeCategoryData) {
    const cartTotal = cart.reduce((s, i) => s + i.price * i.quantity, 0);
    const count = getCartCount(cart);
    return (
      <div className="min-h-screen bg-white pb-24">
        {/* Category Header */}
        <div className="bg-white border-b border-gray-100 px-4 py-3">
          <div className="flex items-center mb-4">
            <button
              onClick={() => setActiveCategory(null)}
              className="text-[#b5122a] text-sm flex items-center gap-1"
            >
              ← Retour au menu
            </button>
          </div>
          <p className="text-[#b5122a] text-sm font-medium text-center">{activeCategoryData.subtitle}</p>
          <h1 className="text-3xl font-serif italic text-center text-gray-900 mt-1 mb-2">{activeCategoryData.title}</h1>
          <p className="text-gray-500 text-sm text-center leading-relaxed max-w-md mx-auto">{activeCategoryData.description}</p>
        </div>

        {/* Items */}
        <div className="max-w-2xl mx-auto px-4 py-6">
          {loading ? (
            <div className="text-center py-20 text-gray-400">Chargement...</div>
          ) : categoryItems.length === 0 ? (
            <div className="text-center py-20 text-gray-400">Aucun article disponible.</div>
          ) : (
            categoryItems.map((item, idx) => (
              <div key={item.id} className={`py-5 ${idx < categoryItems.length - 1 ? "border-b border-gray-100" : ""}`}>
                <div className="flex justify-between items-start gap-4">
                  <div className="flex-1">
                    <h3 className="text-lg font-semibold text-gray-900">{item.name}</h3>
                    {item.description && (
                      <p className="text-gray-500 text-sm mt-0.5">{item.description}</p>
                    )}
                    {item.allergens && (
                      <p className="text-gray-400 text-xs mt-1">Allergènes: {item.allergens}</p>
                    )}
                  </div>
                  <span className="text-[#b5122a] font-semibold whitespace-nowrap text-base">CHF {item.price?.toFixed(2)}</span>
                </div>
                <div className="mt-3">
                  <button
                    onClick={() => handleAddToCart(item)}
                    className={`inline-block px-5 py-2 text-white text-sm font-medium transition-colors ${added === item.id ? "bg-green-600" : "bg-[#b5122a] hover:bg-[#8f0e21]"}`}
                  >
                    {added === item.id ? "✓ Ajouté !" : "Ajouter à la commande"}
                  </button>
                </div>
              </div>
            ))
          )}
        </div>

        {/* Sticky Cart Footer */}
        {count > 0 && (
          <div className="fixed bottom-0 left-0 right-0 z-50 bg-[#b5122a] shadow-lg">
            <button
              onClick={() => navigate(createPageUrl("Panier"))}
              className="w-full flex items-center justify-between px-6 py-4 text-white font-medium hover:bg-[#8f0e21] transition-colors"
            >
              <span className="bg-white text-[#b5122a] rounded-full w-6 h-6 flex items-center justify-center text-sm font-bold">{count}</span>
              <span className="text-base font-semibold">Voir mon panier</span>
              <span className="font-semibold">CHF {cartTotal.toFixed(2)}</span>
            </button>
          </div>
        )}
      </div>
    );
  }

  // Category list view
  return (
    <div className="min-h-screen bg-white">
      {/* Header */}
      <div className="bg-black text-white py-14 text-center px-4">
        <h1 className="text-4xl font-serif italic mb-2">Notre Menu</h1>
        <p className="text-gray-400 text-sm">Fraîcheur et générosité à chaque bouchée</p>
      </div>

      {/* Category List */}
      <div className="max-w-2xl mx-auto px-4 py-6">
        {CATEGORIES.map((cat, idx) => (
          <button
            key={cat.key}
            onClick={() => setActiveCategory(cat.key)}
            className={`w-full text-left py-5 flex justify-between items-center gap-4 transition-colors hover:bg-gray-50 px-2 -mx-2 rounded ${
              idx < CATEGORIES.length - 1 ? "border-b border-gray-100" : ""
            }`}
          >
            <div>
              <h2 className="text-lg font-semibold text-gray-900">{cat.title}</h2>
              <p className="text-[#b5122a] text-sm mt-0.5">{cat.subtitle}</p>
            </div>
            <span className="text-gray-300 text-xl flex-shrink-0">›</span>
          </button>
        ))}
      </div>

    </div>
  );
}
