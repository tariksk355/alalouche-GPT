import { useState, useEffect, useMemo } from "react";
import { useNavigate } from "react-router-dom";
import { createPageUrl } from "@/utils";
import { addItem, getCart, cartCount as getCartCount } from "@/components/cartStore";
import { listMenuCatalog } from "@/lib/api/storefrontOps";
import { useTenant } from "@/lib/TenantContext";
import StorefrontAppDownloadFloatingCta from "@/components/storefront/StorefrontAppDownloadFloatingCta";

const CATEGORY_METADATA = [
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
  const getCategoryFromUrl = () => {
    if (typeof window === "undefined") return null;
    const value = new URLSearchParams(window.location.search).get("category");
    return typeof value === "string" && value.trim() ? value.trim() : null;
  };
  const setCategoryInUrl = (category) => {
    if (typeof window === "undefined") return;
    const url = new URL(window.location.href);
    if (typeof category === "string" && category.trim()) {
      url.searchParams.set("category", category.trim());
    } else {
      url.searchParams.delete("category");
    }
    window.history.replaceState({}, "", `${url.pathname}${url.search}${url.hash}`);
  };

  const { tenant } = useTenant();
  const [items, setItems] = useState([]);
  const [activeCategory, setActiveCategory] = useState(() => getCategoryFromUrl());
  const [zoomedImage, setZoomedImage] = useState(null);
  const [configuringItem, setConfiguringItem] = useState(null);
  const [selectedOptionsByGroup, setSelectedOptionsByGroup] = useState({});
  const [optionValidationError, setOptionValidationError] = useState("");
  const [loading, setLoading] = useState(true);
  const [cart, setCart] = useState(getCart());
  const [added, setAdded] = useState(null); // item id just added
  const navigate = useNavigate();
  const isViewOnlyMenu = typeof window !== 'undefined'
    && new URLSearchParams(window.location.search).get('mode') === 'menu-only';

  const closeConfigurationModal = () => {
    setConfiguringItem(null);
    setSelectedOptionsByGroup({});
    setOptionValidationError("");
  };

  const buildCartLineFromSelection = (item, selectedByGroup) => {
    const optionGroups = Array.isArray(item.optionGroups) ? item.optionGroups : [];
    const selectedOptions = optionGroups.flatMap((group) => {
      const selectedIds = Array.isArray(selectedByGroup[group.id]) ? selectedByGroup[group.id] : [];
      const optionById = new Map((Array.isArray(group.options) ? group.options : []).map((option) => [option.id, option]));
      return selectedIds
        .map((optionId) => optionById.get(optionId))
        .filter(Boolean)
        .map((option) => ({
          groupId: group.id,
          groupName: group.name,
          optionId: option.id,
          optionLabel: option.label,
          priceDelta: Number(option.priceDelta || 0),
        }));
    });

    const optionTotal = selectedOptions.reduce((sum, option) => sum + Number(option.priceDelta || 0), 0);
    const lineKey = `${item.id}::${selectedOptions.map((option) => `${option.groupId}:${option.optionId}`).sort().join('|')}`;
    return {
      ...item,
      basePrice: Number(item.price || 0),
      price: Number(item.price || 0) + optionTotal,
      selectedOptions,
      lineKey,
    };
  };

  const validateRequiredOptions = (item, selectedByGroup) => {
    const optionGroups = Array.isArray(item.optionGroups) ? item.optionGroups : [];
    for (const group of optionGroups) {
      const selectedIds = Array.isArray(selectedByGroup[group.id]) ? selectedByGroup[group.id] : [];
      if (group.required && selectedIds.length === 0) {
        return `Veuillez choisir une option pour "${group.name}".`;
      }
      if (group.selectionType === "single") {
        continue;
      }
      if (Number.isFinite(Number(group.minSelections)) && selectedIds.length < Number(group.minSelections)) {
        return `Veuillez sélectionner au moins ${group.minSelections} option(s) pour "${group.name}".`;
      }
      const maxSelectionsValue = Number(group.maxSelections);
      if (Number.isFinite(maxSelectionsValue) && maxSelectionsValue > 0 && selectedIds.length > maxSelectionsValue) {
        return `Veuillez sélectionner au maximum ${maxSelectionsValue} option(s) pour "${group.name}".`;
      }
    }
    return "";
  };

  const handleConfirmConfiguredAdd = () => {
    if (!configuringItem) return;
    const validationError = validateRequiredOptions(configuringItem, selectedOptionsByGroup);
    if (validationError) {
      setOptionValidationError(validationError);
      return;
    }
    const cartLine = buildCartLineFromSelection(configuringItem, selectedOptionsByGroup);
    if (isViewOnlyMenu) return;
    const updated = addItem(cartLine);
    setCart(updated);
    setAdded(configuringItem.id);
    closeConfigurationModal();
    setTimeout(() => setAdded(null), 1200);
  };

  const handleAddToCart = (item) => {
    if (isViewOnlyMenu) return;
    const optionGroups = Array.isArray(item.optionGroups) ? item.optionGroups : [];
    if (optionGroups.length === 0) {
      const updated = addItem(item);
      setCart(updated);
      setAdded(item.id);
      setTimeout(() => setAdded(null), 1200);
      return;
    }

    const defaults = optionGroups.reduce((acc, group) => {
      const options = Array.isArray(group.options) ? group.options : [];
      if (group.selectionType === "single") {
        const defaultOption = options.find((option) => option.isDefault) || null;
        acc[group.id] = defaultOption ? [defaultOption.id] : [];
      } else {
        acc[group.id] = options.filter((option) => option.isDefault).map((option) => option.id);
      }
      return acc;
    }, {});

    closeConfigurationModal();
    setConfiguringItem(item);
    setSelectedOptionsByGroup(defaults);
  };

  const handleBackToMenu = () => {
    setActiveCategory(null);
    setCategoryInUrl(null);
    setTimeout(() => {
      window.scrollTo({ top: 0, behavior: "smooth" });
    }, 0);
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
        optionGroups: Array.isArray(item.optionGroups) ? item.optionGroups : [],
      }));
      setItems(normalized);
      setLoading(false);
    }).catch(() => setLoading(false));
  }, []);

  const toggleMultiOption = (groupId, optionId, checked) => {
    setSelectedOptionsByGroup((prev) => {
      const current = Array.isArray(prev[groupId]) ? prev[groupId] : [];
      if (checked) {
        return { ...prev, [groupId]: Array.from(new Set([...current, optionId])) };
      }
      return { ...prev, [groupId]: current.filter((id) => id !== optionId) };
    });
  };

  useEffect(() => {
    if (!zoomedImage) return;
    const previousOverflow = document.body.style.overflow;
    const previousHtmlOverflow = document.documentElement.style.overflow;
    const handleEscape = (event) => {
      if (event.key === "Escape") {
        setZoomedImage(null);
      }
    };

    document.body.style.overflow = "hidden";
    document.documentElement.style.overflow = "hidden";
    window.addEventListener("keydown", handleEscape);

    return () => {
      document.body.style.overflow = previousOverflow;
      document.documentElement.style.overflow = previousHtmlOverflow;
      window.removeEventListener("keydown", handleEscape);
    };
  }, [zoomedImage]);

  const menuCategories = useMemo(() => {
    const dynamicCategories = items
      .map((item) => (typeof item.category === "string" ? item.category.trim() : ""))
      .filter(Boolean);
    const configuredOrder = Array.isArray(tenant?.orderingSettings?.categoryOrder)
      ? tenant.orderingSettings.categoryOrder
          .map((value) => (typeof value === "string" ? value.trim() : ""))
          .filter(Boolean)
      : [];
    const ordered = Array.from(new Set(configuredOrder));
    const discovered = Array.from(new Set(dynamicCategories));
    const keys = [...ordered, ...discovered.filter((category) => !ordered.includes(category))];
    const metadataByKey = new Map(CATEGORY_METADATA.map((category) => [category.key, category]));

    return keys.map((key) => {
      const metadata = metadataByKey.get(key);
      return metadata || {
        key,
        title: key,
        subtitle: "Nos spécialités",
        description: "Découvrez les articles disponibles dans cette catégorie.",
      };
    });
  }, [items, tenant?.orderingSettings?.categoryOrder]);

  const activeCategoryData = activeCategory
    ? menuCategories.find(c => c.key === activeCategory)
    : null;

  useEffect(() => {
    if (!activeCategory) return;
    if (menuCategories.some((category) => category.key === activeCategory)) return;
    setActiveCategory(null);
    setCategoryInUrl(null);
  }, [activeCategory, menuCategories]);

  const categoryItems = useMemo(() => {
    if (!activeCategory) return [];
    const currentItems = items.filter((item) => item.category === activeCategory);
    const configuredOrder = Array.isArray(tenant?.orderingSettings?.productOrderByCategory?.[activeCategory])
      ? tenant.orderingSettings.productOrderByCategory[activeCategory]
      : [];
    if (configuredOrder.length === 0) return currentItems;

    const indexById = new Map(configuredOrder.map((id, index) => [id, index]));
    return [...currentItems].sort((a, b) => {
      const aIndex = indexById.has(a.id) ? indexById.get(a.id) : Number.POSITIVE_INFINITY;
      const bIndex = indexById.has(b.id) ? indexById.get(b.id) : Number.POSITIVE_INFINITY;
      if (aIndex !== bIndex) return aIndex - bIndex;
      return 0;
    });
  }, [activeCategory, items, tenant?.orderingSettings?.productOrderByCategory]);

  if (activeCategory && activeCategoryData) {
    const cartTotal = cart.reduce((s, i) => s + i.price * i.quantity, 0);
    const count = getCartCount(cart);
    return (
      <div className="min-h-screen bg-white pb-24">
        <StorefrontAppDownloadFloatingCta variant="menu" isSuppressed={Boolean(zoomedImage || configuringItem)} />
        {/* Category Header */}
        <div className="bg-white border-b border-gray-100 px-4 py-3">
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
                <div className="flex flex-col gap-4 sm:flex-row sm:justify-between sm:items-start">
                  <div className="flex flex-1 gap-4">
                    {item.image_url && (
                      <img
                        src={item.image_url}
                        alt={item.name}
                        className="h-24 w-24 rounded-xl object-cover border border-gray-100 flex-shrink-0 cursor-zoom-in"
                        loading="lazy"
                        role="button"
                        tabIndex={0}
                        aria-haspopup="dialog"
                        aria-label={`Agrandir l'image de ${item.name}`}
                        onClick={() => setZoomedImage({ src: item.image_url, alt: item.name })}
                        onKeyDown={(event) => {
                          if (event.key === "Enter" || event.key === " ") {
                            event.preventDefault();
                            setZoomedImage({ src: item.image_url, alt: item.name });
                          }
                        }}
                      />
                    )}
                    <div className="flex-1">
                      <h3 className="text-lg font-semibold text-gray-900">{item.name}</h3>
                      {item.description && (
                        <p className="text-gray-500 text-sm mt-0.5">{item.description}</p>
                      )}
                      {item.allergens && (
                        <p className="text-gray-400 text-xs mt-1">Allergènes: {item.allergens}</p>
                      )}
                    </div>
                  </div>
                  <span className="text-[#b5122a] font-semibold whitespace-nowrap text-base sm:pt-1">CHF {item.price?.toFixed(2)}</span>
                </div>
                <div className="mt-3">
                  {!isViewOnlyMenu && (
                    <button
                      onClick={() => handleAddToCart(item)}
                      className={`inline-block px-5 py-2 text-white text-sm font-medium transition-colors ${added === item.id ? "bg-green-600" : "bg-[#b5122a] hover:bg-[#8f0e21]"}`}
                    >
                      {added === item.id ? "✓ Ajouté !" : "Ajouter à la commande"}
                    </button>
                  )}
                </div>
              </div>
            ))
          )}
        </div>

        <div className="max-w-2xl mx-auto px-4 pb-6">
          <button
            onClick={handleBackToMenu}
            className="w-full sm:w-auto min-h-11 px-4 py-3 bg-[#b5122a] text-white rounded-lg font-medium text-sm hover:bg-[#8f0e21] transition-colors"
          >
            ← Retour au menu
          </button>
        </div>

        {/* Sticky Cart Footer */}
        {!isViewOnlyMenu && count > 0 && (
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

        {zoomedImage && (
          <div
            className="fixed inset-0 z-[120] bg-black/80 p-4 sm:p-8"
            onClick={() => setZoomedImage(null)}
          >
            <button
              type="button"
              onClick={() => setZoomedImage(null)}
              className="absolute top-4 right-4 sm:top-6 sm:right-6 bg-white/90 text-gray-900 w-10 h-10 rounded-full text-xl leading-none hover:bg-white"
              aria-label="Fermer l'image"
            >
              ×
            </button>
            <div className="w-full h-full overflow-auto flex items-center justify-center">
              <img
                src={zoomedImage.src}
                alt={zoomedImage.alt}
                className="w-auto h-auto max-w-[92vw] max-h-[88vh] object-contain rounded-lg"
                style={{ touchAction: "pinch-zoom" }}
                onClick={(event) => event.stopPropagation()}
              />
            </div>
          </div>
        )}

        {configuringItem && (
          <div className="fixed inset-0 z-[130] bg-black/60 p-4" onClick={closeConfigurationModal}>
            <div className="mx-auto mt-8 w-full max-w-lg rounded-xl bg-white p-4 sm:p-5" onClick={(event) => event.stopPropagation()}>
              <div className="flex items-start justify-between gap-3">
                <div>
                  <h3 className="text-lg font-semibold text-gray-900">{configuringItem.name}</h3>
                  <p className="text-sm text-gray-500">Personnalisez votre article avant ajout.</p>
                </div>
                <button type="button" onClick={closeConfigurationModal} className="text-gray-500 hover:text-gray-800">✕</button>
              </div>

              <div className="mt-4 space-y-4 max-h-[65vh] overflow-y-auto pr-1">
                {(Array.isArray(configuringItem.optionGroups) ? configuringItem.optionGroups : []).map((group) => {
                  const selectedIds = Array.isArray(selectedOptionsByGroup[group.id]) ? selectedOptionsByGroup[group.id] : [];
                  return (
                    <div key={group.id} className="rounded-lg border border-gray-200 p-3">
                      <div className="mb-2 flex items-center justify-between gap-2">
                        <p className="text-sm font-medium text-gray-800">{group.name}</p>
                        <span className={`text-xs ${group.required ? "text-red-600" : "text-gray-500"}`}>
                          {group.required ? "Obligatoire" : "Optionnel"}
                        </span>
                      </div>
                      <div className="space-y-2">
                        {(Array.isArray(group.options) ? group.options : []).map((option) => {
                          const delta = Number(option.priceDelta || 0);
                          const priceDeltaLabel = delta > 0 ? ` (+CHF ${delta.toFixed(2)})` : "";
                          if (group.selectionType === "single") {
                            return (
                              <label key={option.id} className="flex cursor-pointer items-center justify-between gap-3 rounded border border-gray-100 px-2 py-1.5">
                                <span className="text-sm text-gray-700">{option.label}{priceDeltaLabel}</span>
                                <input
                                  type="radio"
                                  name={`group-${group.id}`}
                                  checked={selectedIds.includes(option.id)}
                                  onChange={() => setSelectedOptionsByGroup((prev) => ({ ...prev, [group.id]: [option.id] }))}
                                />
                              </label>
                            );
                          }
                          return (
                            <label key={option.id} className="flex cursor-pointer items-center justify-between gap-3 rounded border border-gray-100 px-2 py-1.5">
                              <span className="text-sm text-gray-700">{option.label}{priceDeltaLabel}</span>
                              <input
                                type="checkbox"
                                checked={selectedIds.includes(option.id)}
                                onChange={(event) => toggleMultiOption(group.id, option.id, event.target.checked)}
                              />
                            </label>
                          );
                        })}
                      </div>
                    </div>
                  );
                })}
              </div>

              {optionValidationError && (
                <p className="mt-3 text-sm text-red-600">{optionValidationError}</p>
              )}

              <div className="mt-4 flex gap-2">
                <button type="button" onClick={closeConfigurationModal} className="flex-1 rounded-lg border border-gray-300 px-3 py-2 text-sm text-gray-700">
                  Annuler
                </button>
                <button type="button" onClick={handleConfirmConfiguredAdd} className="flex-1 rounded-lg bg-[#b5122a] px-3 py-2 text-sm font-medium text-white hover:bg-[#8f0e21]">
                  Ajouter au panier
                </button>
              </div>
            </div>
          </div>
        )}
      </div>
    );
  }

  // Category list view
  return (
    <div className="min-h-screen bg-white">
      <StorefrontAppDownloadFloatingCta variant="menu" isSuppressed={Boolean(zoomedImage || configuringItem)} />
      {/* Header */}
      <div className="bg-black text-white py-14 text-center px-4">
        <h1 className="text-4xl font-serif italic mb-2">Notre Menu</h1>
        <p className="text-gray-400 text-sm">Fraîcheur et générosité à chaque bouchée</p>
        {isViewOnlyMenu && (
          <p className="text-yellow-200 text-xs mt-2">Mode consultation: menu uniquement</p>
        )}
      </div>

      {/* Category List */}
      <div className="max-w-2xl mx-auto px-4 py-6">
        {!isViewOnlyMenu && (
          <div className="mb-5 rounded-lg border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-900">
            <p className="font-medium">Livraison disponible uniquement dans certaines zones de Fribourg.</p>
            <p className="mt-1">Le minimum de commande et les frais de livraison dépendent du code postal.</p>
            <button
              type="button"
              onClick={() => navigate(`${createPageUrl("Panier")}?checkDelivery=1`)}
              className="mt-2 inline-flex text-xs font-semibold underline underline-offset-2 hover:text-amber-700"
            >
              Vérifier ma zone de livraison
            </button>
          </div>
        )}
        {menuCategories.map((cat, idx) => (
          <button
            key={cat.key}
            onClick={() => {
              setActiveCategory(cat.key);
              setCategoryInUrl(cat.key);
            }}
            className={`w-full text-left py-5 flex justify-between items-center gap-4 transition-colors hover:bg-gray-50 px-2 -mx-2 rounded ${
              idx < menuCategories.length - 1 ? "border-b border-gray-100" : ""
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

      {zoomedImage && (
        <div
          className="fixed inset-0 z-[120] bg-black/80 p-4 sm:p-8"
          onClick={() => setZoomedImage(null)}
        >
          <button
            type="button"
            onClick={() => setZoomedImage(null)}
            className="absolute top-4 right-4 sm:top-6 sm:right-6 bg-white/90 text-gray-900 w-10 h-10 rounded-full text-xl leading-none hover:bg-white"
            aria-label="Fermer l'image"
          >
            ×
          </button>
          <div className="w-full h-full overflow-auto flex items-center justify-center">
            <img
              src={zoomedImage.src}
              alt={zoomedImage.alt}
              className="w-auto h-auto max-w-[92vw] max-h-[88vh] object-contain rounded-lg"
              style={{ touchAction: "pinch-zoom" }}
              onClick={(event) => event.stopPropagation()}
            />
          </div>
        </div>
      )}

    </div>
  );
}
