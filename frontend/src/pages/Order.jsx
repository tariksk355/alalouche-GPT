import { useState, useEffect } from "react";
import { StorefrontNotice } from "@/components/storefront/feedback";
import { StorefrontPromoCodeCard } from "@/components/storefront/StorefrontPromoCodeCard";
import { createStorefrontOrder, getStoredCheckoutDefaults, getStorefrontCustomerPrefill, getStorefrontOrder, listMenuCatalog, previewStorefrontPromotion, saveCheckoutDefaults } from "@/lib/api/storefrontOps";

const BASE_FORM = {
  customer_name: "",
  customer_phone: "",
  customer_email: "",
  customer_address: "",
  order_type: "takeaway",
  payment_method: "cash",
  notes: "",
};

const CATEGORIES = ["Sandwichs et menu", "Nos sauces chaudes", "Nos sauces froides", "Plats et Pide", "Boissons", "Bières & Alcools", "Vins", "Desserts"];

export default function Order() {
  const [menuItems, setMenuItems] = useState([]);
  const [cart, setCart] = useState([]);
  const [step, setStep] = useState("menu"); // menu | details | confirm
  const [activeCategory, setActiveCategory] = useState("all");
  const [form, setForm] = useState({
    ...BASE_FORM,
  });
  const [loading, setLoading] = useState(false);
  const [submitError, setSubmitError] = useState("");
  const [success, setSuccess] = useState(null); // { orderNumber, phone }
  const [orderStatus, setOrderStatus] = useState(null);
  const [checkingStatus, setCheckingStatus] = useState(false);
  const [promoInput, setPromoInput] = useState("");
  const [promoLoading, setPromoLoading] = useState(false);
  const [promoFeedback, setPromoFeedback] = useState(null);
  const [appliedPromotion, setAppliedPromotion] = useState(null);

  useEffect(() => {
    const checkoutDefaults = getStoredCheckoutDefaults();
    if (checkoutDefaults) {
      setForm(prev => ({ ...prev, ...checkoutDefaults }));
    }

    listMenuCatalog().then(data => {
      const normalized = data.map(item => ({
        id: item.id,
        name: item.name,
        description: item.description,
        price: Number(item.price || 0),
        category: item.category,
        image_url: item.imageUrl,
      }));
      setMenuItems(normalized);
    });

    getStorefrontCustomerPrefill().then(user => {
      if (user) {
        setForm(prev => ({
          ...prev,
          customer_name: user.customer_name || "",
          customer_email: user.customer_email || "",
          customer_phone: user.customer_phone || "",
          customer_address: user.customer_address || "",
        }));
      }
    }).catch(() => {});
  }, []);

  const filtered = activeCategory === "all" ? menuItems : menuItems.filter(i => i.category === activeCategory);

  const addToCart = (item) => {
    setCart(prev => {
      const existing = prev.find(c => c.id === item.id);
      if (existing) return prev.map(c => c.id === item.id ? { ...c, quantity: c.quantity + 1 } : c);
      return [...prev, { ...item, quantity: 1 }];
    });
  };

  const removeFromCart = (id) => {
    setCart(prev => {
      const existing = prev.find(c => c.id === id);
      if (existing?.quantity === 1) return prev.filter(c => c.id !== id);
      return prev.map(c => c.id === id ? { ...c, quantity: c.quantity - 1 } : c);
    });
  };

  const cartTotal = cart.reduce((sum, i) => sum + i.price * i.quantity, 0);
  const cartCount = cart.reduce((sum, i) => sum + i.quantity, 0);
  const finalTotal = appliedPromotion?.totalAmount ?? cartTotal;

  useEffect(() => {
    if (!appliedPromotion) return;
    setAppliedPromotion(null);
    setPromoFeedback({ type: "info", message: "Le panier a changé. Veuillez réappliquer votre code promo." });
  }, [cart]);

  const applyPromotion = async () => {
    if (!promoInput.trim()) return;
    setPromoLoading(true);
    setPromoFeedback(null);

    try {
      const promotion = await previewStorefrontPromotion({
        promotionCode: promoInput.trim(),
        customerEmail: form.customer_email || undefined,
        customerPhone: form.customer_phone || undefined,
        items: cart.map((item) => ({ id: item.id, price: Number(item.price || 0), quantity: item.quantity })),
      });

      setAppliedPromotion(promotion);
      setPromoInput(promotion.promotionCode);
      setPromoFeedback({ type: "success", message: "Code promo appliqué." });
    } catch (error) {
      setAppliedPromotion(null);
      setPromoFeedback({ type: "error", message: error.message || "Impossible d’appliquer ce code promo." });
    } finally {
      setPromoLoading(false);
    }
  };

  const removePromotion = () => {
    setAppliedPromotion(null);
    setPromoInput("");
    setPromoFeedback({ type: "info", message: "Code promo retiré." });
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    setLoading(true);
    setSubmitError("");

    try {
      const created = await createStorefrontOrder({
        customerName: form.customer_name,
        customerPhone: form.customer_phone,
        customerEmail: form.customer_email || undefined,
        customerAddress: form.customer_address || undefined,
        orderType: form.order_type,
        paymentMethod: form.payment_method,
        notes: form.notes || undefined,
        promotionCode: appliedPromotion?.promotionCode || undefined,
        items: cart.map(i => ({ id: i.id, name: i.name, price: Number(i.price || 0), quantity: i.quantity })),
      });

      saveCheckoutDefaults({
        customer_address: form.customer_address,
        order_type: form.order_type,
        payment_method: form.payment_method,
      });

      const successData = { orderNumber: created.order_number, phone: form.customer_phone };
      setSuccess(successData);
      setCart([]);
      setAppliedPromotion(null);
      setPromoInput("");
      setPromoFeedback(null);
      setForm({
        ...BASE_FORM,
        ...getStoredCheckoutDefaults(),
        customer_name: form.customer_name,
        customer_phone: form.customer_phone,
        customer_email: form.customer_email,
      });
      setStep("menu");
      setOrderStatus(null);
    } catch (error) {
      setSubmitError(error.message || "La commande n'a pas pu être envoyée.");
    } finally {
      setLoading(false);
    }
  };

  const checkOrderStatus = async () => {
    setCheckingStatus(true);
    try {
      const order = await getStorefrontOrder(success.orderNumber);
      setOrderStatus(order);
    } finally {
      setCheckingStatus(false);
    }
  };

  const statusLabels = {
    new: "En attente de confirmation",
    accepted: "Acceptée — en préparation",
    ready: "Prête !",
    completed: "Complétée",
    cancelled: "Annulée"
  };

  const statusColors = {
    new: "text-yellow-600",
    accepted: "text-blue-600",
    ready: "text-green-600",
    completed: "text-gray-500",
    cancelled: "text-red-600"
  };

  if (success) {
    return (
      <div className="min-h-screen bg-white flex items-center justify-center px-4">
        <div className="text-center max-w-md w-full">
          <div className="w-16 h-16 bg-green-100 rounded-full flex items-center justify-center mx-auto mb-4">
            <svg className="w-8 h-8 text-green-600" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
            </svg>
          </div>
          <h2 className="text-2xl font-semibold mb-2">Commande reçue !</h2>
          <p className="text-gray-600 mb-1">N° de commande : <strong>{success.orderNumber}</strong></p>
          <p className="text-gray-500 text-sm mb-6">Paiement à la caisse. Nous préparons votre commande.</p>

          {/* Order status */}
          <div className="border border-gray-200 rounded-lg p-5 mb-6 text-left">
            <div className="flex items-center justify-between mb-3">
              <h3 className="font-semibold text-gray-800">Statut de la commande</h3>
              <button
                onClick={checkOrderStatus}
                disabled={checkingStatus}
                className="text-xs text-[#b5122a] hover:underline disabled:opacity-50"
              >
                {checkingStatus ? "Actualisation..." : "Actualiser"}
              </button>
            </div>
            {orderStatus ? (
              <>
                <p className={`font-semibold text-lg ${statusColors[orderStatus.status]}`}>
                  {statusLabels[orderStatus.status]}
                </p>
                {orderStatus.prep_time_minutes && (orderStatus.status === "accepted" || orderStatus.status === "new") && (
                  <div className="mt-3 bg-blue-50 rounded-md px-4 py-3">
                    <p className="text-blue-800 text-sm font-medium">
                      ⏱ Temps de préparation estimé : <strong>{orderStatus.prep_time_minutes} minutes</strong>
                    </p>
                    {orderStatus.ready_at && (
                      <p className="text-blue-600 text-sm mt-1">
                        Prête vers : <strong>{new Date(orderStatus.ready_at).toLocaleTimeString("fr-CH", { hour: "2-digit", minute: "2-digit" })}</strong>
                      </p>
                    )}
                  </div>
                )}
                {orderStatus.status === "ready" && (
                  <div className="mt-3 bg-green-50 rounded-md px-4 py-3">
                    <p className="text-green-700 text-sm font-medium">🎉 Votre commande est prête !</p>
                  </div>
                )}
              </>
            ) : (
              <div className="text-center py-2">
                <button
                  onClick={checkOrderStatus}
                  disabled={checkingStatus}
                  className="px-5 py-2 bg-black text-white text-sm font-medium hover:bg-gray-800 transition-colors disabled:opacity-50"
                >
                  {checkingStatus ? "Chargement..." : "Vérifier le statut"}
                </button>
              </div>
            )}
          </div>

          <button onClick={() => { setSuccess(null); setOrderStatus(null); }} className="w-full py-3 bg-[#b5122a] text-white font-medium hover:bg-[#8f0e21] transition-colors">
            Nouvelle commande
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-white">
      <div className="bg-black text-white py-16 text-center">
        <h1 className="text-4xl font-serif italic mb-2">Commander</h1>
        <p className="text-gray-400">À emporter ou en livraison — paiement à la caisse</p>
      </div>

      <div className="max-w-6xl mx-auto px-4 py-8">
        {step === "menu" && (
          <div className="flex flex-col lg:flex-row gap-8">
            {/* Menu */}
            <div className="flex-1">
              {/* Category tabs */}
              <div className="overflow-x-auto mb-6">
                <div className="flex gap-2 min-w-max">
                  <button
                    onClick={() => setActiveCategory("all")}
                    className={`px-4 py-2 text-sm font-medium border transition-colors ${activeCategory === "all" ? "bg-black text-white border-black" : "border-gray-300 text-gray-600 hover:border-black"}`}
                  >
                    Tout
                  </button>
                  {CATEGORIES.map(cat => menuItems.some(i => i.category === cat) && (
                    <button
                      key={cat}
                      onClick={() => setActiveCategory(cat)}
                      className={`px-4 py-2 text-sm font-medium border transition-colors ${activeCategory === cat ? "bg-black text-white border-black" : "border-gray-300 text-gray-600 hover:border-black"}`}
                    >
                      {cat}
                    </button>
                  ))}
                </div>
              </div>

              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                {filtered.map(item => {
                  const inCart = cart.find(c => c.id === item.id);
                  return (
                    <div key={item.id} className="flex gap-3 p-4 border border-gray-100 rounded-lg hover:border-gray-200 transition-all">
                      {item.image_url && (
                        <img src={item.image_url} alt={item.name} className="w-16 h-16 object-cover rounded-md flex-shrink-0" />
                      )}
                      <div className="flex-1 min-w-0">
                        <div className="flex justify-between items-start gap-2 mb-1">
                          <h3 className="font-medium text-gray-900 text-sm">{item.name}</h3>
                          <span className="text-[#b5122a] font-bold text-sm whitespace-nowrap">CHF {item.price?.toFixed(2)}</span>
                        </div>
                        {item.description && <p className="text-gray-400 text-xs mb-2 line-clamp-1">{item.description}</p>}
                        <div className="flex items-center gap-2">
                          {inCart ? (
                            <div className="flex items-center gap-2">
                              <button onClick={() => removeFromCart(item.id)} className="w-6 h-6 bg-gray-200 rounded-full flex items-center justify-center text-sm font-bold hover:bg-gray-300">−</button>
                              <span className="text-sm font-semibold w-4 text-center">{inCart.quantity}</span>
                              <button onClick={() => addToCart(item)} className="w-6 h-6 bg-black rounded-full flex items-center justify-center text-sm font-bold text-white hover:bg-gray-800">+</button>
                            </div>
                          ) : (
                            <button onClick={() => addToCart(item)} className="px-3 py-1 bg-black text-white text-xs font-medium hover:bg-gray-800 transition-colors">
                              Ajouter
                            </button>
                          )}
                        </div>
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>

            {/* Cart */}
            <div className="lg:w-80">
              <div className="sticky top-4 border border-gray-200 rounded-lg p-5">
                <h2 className="font-semibold text-lg mb-4">Votre commande {cartCount > 0 && <span className="bg-[#b5122a] text-white text-xs rounded-full px-2 py-0.5 ml-1">{cartCount}</span>}</h2>
                {cart.length === 0 ? (
                  <p className="text-gray-400 text-sm text-center py-8">Votre panier est vide</p>
                ) : (
                  <>
                    <div className="space-y-3 mb-4">
                      {cart.map(item => (
                        <div key={item.id} className="flex justify-between items-center text-sm">
                          <div>
                            <span className="font-medium">{item.name}</span>
                            <span className="text-gray-400 ml-1">x{item.quantity}</span>
                          </div>
                          <span className="font-medium">CHF {(item.price * item.quantity).toFixed(2)}</span>
                        </div>
                      ))}
                    </div>
                    <div className="border-t border-gray-100 pt-3 mb-5">
                      <div className="flex justify-between text-sm mb-2">
                        <span>Sous-total</span>
                        <span>CHF {cartTotal.toFixed(2)}</span>
                      </div>
                      <StorefrontPromoCodeCard
                        promoInput={promoInput}
                        appliedPromotion={appliedPromotion}
                        loading={promoLoading}
                        feedback={promoFeedback}
                        onPromoInputChange={setPromoInput}
                        onApply={applyPromotion}
                        onRemove={removePromotion}
                      />
                      {appliedPromotion && (
                        <div className="flex justify-between text-sm text-green-700 mt-3">
                          <span>Remise ({appliedPromotion.promotionCode})</span>
                          <span>- CHF {Number(appliedPromotion.discountAmount || 0).toFixed(2)}</span>
                        </div>
                      )}
                      <div className="flex justify-between font-bold mt-3">
                        <span>Total</span>
                        <span>CHF {finalTotal.toFixed(2)}</span>
                      </div>
                    </div>
                    <button
                      onClick={() => setStep("details")}
                      className="w-full py-3 bg-[#b5122a] text-white font-medium hover:bg-[#8f0e21] transition-colors"
                    >
                      Passer la commande
                    </button>
                  </>
                )}
              </div>
            </div>
          </div>
        )}

        {step === "details" && (
          <div className="max-w-xl mx-auto">
            <button onClick={() => setStep("menu")} className="flex items-center gap-2 text-gray-500 hover:text-black mb-6 text-sm">
              ← Retour au menu
            </button>
            <h2 className="text-2xl font-semibold mb-6">Vos informations</h2>

            <form onSubmit={handleSubmit} className="space-y-5">
              {/* Order type */}
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-2">Type de commande</label>
                <div className="grid grid-cols-2 gap-3">
                  {[{ value: "takeaway", label: "À emporter" }, { value: "delivery", label: "Livraison" }].map(opt => (
                    <button
                      key={opt.value}
                      type="button"
                      onClick={() => setForm({ ...form, order_type: opt.value })}
                      className={`py-3 border-2 font-medium transition-colors ${form.order_type === opt.value ? "border-black bg-black text-white" : "border-gray-200 text-gray-600 hover:border-gray-400"}`}
                    >
                      {opt.label}
                    </button>
                  ))}
                </div>
              </div>

              {/* Payment method */}
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-2">Paiement</label>
                <div className="grid grid-cols-2 gap-3">
                  {[{ value: "cash", label: "Espèces" }, { value: "card", label: "Carte" }].map(opt => (
                    <button
                      key={opt.value}
                      type="button"
                      onClick={() => setForm({ ...form, payment_method: opt.value })}
                      className={`py-3 border-2 font-medium transition-colors ${form.payment_method === opt.value ? "border-black bg-black text-white" : "border-gray-200 text-gray-600 hover:border-gray-400"}`}
                    >
                      {opt.label}
                    </button>
                  ))}
                </div>
              </div>

              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">Nom *</label>
                  <input required value={form.customer_name} onChange={e => setForm({ ...form, customer_name: e.target.value })}
                    className="w-full border border-gray-300 px-4 py-3 focus:outline-none focus:border-black" placeholder="Votre nom" />
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">Téléphone *</label>
                  <input required value={form.customer_phone} onChange={e => setForm({ ...form, customer_phone: e.target.value })}
                    className="w-full border border-gray-300 px-4 py-3 focus:outline-none focus:border-black" placeholder="026 303 45 61" />
                </div>
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Email</label>
                <input type="email" value={form.customer_email} onChange={e => setForm({ ...form, customer_email: e.target.value })}
                  className="w-full border border-gray-300 px-4 py-3 focus:outline-none focus:border-black" placeholder="votre@email.com (optionnel)" />
              </div>
              {form.order_type === "delivery" && (
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">Adresse de livraison *</label>
                  <input required={form.order_type === "delivery"} value={form.customer_address} onChange={e => setForm({ ...form, customer_address: e.target.value })}
                    className="w-full border border-gray-300 px-4 py-3 focus:outline-none focus:border-black" placeholder="Rue, numéro, ville" />
                </div>
              )}
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Notes</label>
                <textarea rows={2} value={form.notes} onChange={e => setForm({ ...form, notes: e.target.value })}
                  className="w-full border border-gray-300 px-4 py-3 focus:outline-none focus:border-black resize-none" placeholder="Allergies, demandes spéciales..." />
              </div>

              {/* Order summary */}
              <div className="bg-gray-50 p-4 rounded-lg">
                <h3 className="font-semibold mb-3">Récapitulatif</h3>
                {cart.map(item => (
                  <div key={item.id} className="flex justify-between text-sm mb-1">
                    <span>{item.name} x{item.quantity}</span>
                    <span>CHF {(item.price * item.quantity).toFixed(2)}</span>
                  </div>
                ))}
                <div className="border-t border-gray-200 mt-2 pt-2 space-y-3">
                  <div className="flex justify-between text-sm">
                    <span>Sous-total</span>
                    <span>CHF {cartTotal.toFixed(2)}</span>
                  </div>
                  <StorefrontPromoCodeCard
                    promoInput={promoInput}
                    appliedPromotion={appliedPromotion}
                    loading={promoLoading}
                    feedback={promoFeedback}
                    onPromoInputChange={setPromoInput}
                    onApply={applyPromotion}
                    onRemove={removePromotion}
                  />
                  {appliedPromotion && (
                    <div className="flex justify-between text-sm text-green-700">
                      <span>Remise ({appliedPromotion.promotionCode})</span>
                      <span>- CHF {Number(appliedPromotion.discountAmount || 0).toFixed(2)}</span>
                    </div>
                  )}
                  <div className="flex justify-between font-bold">
                    <span>Total</span>
                    <span>CHF {finalTotal.toFixed(2)}</span>
                  </div>
                </div>
              </div>

              {submitError && <StorefrontNotice type="error">{submitError}</StorefrontNotice>}

              <button type="submit" disabled={loading}
                className="w-full py-4 bg-[#b5122a] text-white font-semibold text-lg hover:bg-[#8f0e21] transition-colors disabled:opacity-60">
                {loading ? "Envoi en cours..." : `Confirmer — CHF ${finalTotal.toFixed(2)}`}
              </button>
            </form>
          </div>
        )}
      </div>
    </div>
  );
}
