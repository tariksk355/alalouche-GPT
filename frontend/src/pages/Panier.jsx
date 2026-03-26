import { useState, useEffect } from "react";
import { useNavigate } from "react-router-dom";
import { createPageUrl } from "@/utils";
import { getCart, saveCart, clearCart } from "@/components/cartStore";
import { Trash2 } from "lucide-react";
import { StorefrontPromoCodeCard } from "@/components/storefront/StorefrontPromoCodeCard";
import { createStorefrontOrder, getStoredCheckoutDefaults, getStorefrontCustomerPrefill, getStorefrontOrder, previewStorefrontPromotion, saveCheckoutDefaults } from "@/lib/api/storefrontOps";
import { StorefrontNotice } from "@/components/storefront/feedback";

const BASE_FORM = {
  customer_name: "",
  customer_phone: "",
  customer_email: "",
  customer_address: "",
  order_type: "takeaway",
  payment_method: "cash",
  notes: "",
};

export default function Panier() {
  const [cart, setCart] = useState(getCart());
  const [step, setStep] = useState("cart"); // cart | details
  const [form, setForm] = useState({
    ...BASE_FORM,
  });
  const [loading, setLoading] = useState(false);
  const [submitError, setSubmitError] = useState('');
  const [success, setSuccess] = useState(null);
  const [orderStatus, setOrderStatus] = useState(null);
  const [checkingStatus, setCheckingStatus] = useState(false);
  const [promoInput, setPromoInput] = useState('');
  const [promoLoading, setPromoLoading] = useState(false);
  const [promoFeedback, setPromoFeedback] = useState(null);
  const [appliedPromotion, setAppliedPromotion] = useState(null);
  const navigate = useNavigate();

  useEffect(() => {
    const checkoutDefaults = getStoredCheckoutDefaults();
    if (checkoutDefaults) {
      setForm(prev => ({ ...prev, ...checkoutDefaults }));
    }

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

  const updateQty = (lineKey, delta) => {
    const updated = cart.map(c => (c.lineKey || c.id) === lineKey ? { ...c, quantity: c.quantity + delta } : c).filter(c => c.quantity > 0);
    setCart(updated);
    saveCart(updated);
  };

  const removeItem = (lineKey) => {
    const updated = cart.filter(c => (c.lineKey || c.id) !== lineKey);
    setCart(updated);
    saveCart(updated);
  };

  const cartTotal = cart.reduce((s, i) => s + i.price * i.quantity, 0);
  const cartCount = cart.reduce((s, i) => s + i.quantity, 0);
  const finalTotal = appliedPromotion?.totalAmount ?? cartTotal;

  useEffect(() => {
    if (!appliedPromotion) return;
    setAppliedPromotion(null);
    setPromoFeedback({ type: 'info', message: 'Le panier a changé. Veuillez réappliquer votre code promo.' });
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
      setPromoFeedback({ type: 'success', message: 'Code promo appliqué.' });
    } catch (error) {
      setAppliedPromotion(null);
      setPromoFeedback({ type: 'error', message: error.message || "Impossible d'appliquer ce code promo." });
    } finally {
      setPromoLoading(false);
    }
  };

  const removePromotion = () => {
    setAppliedPromotion(null);
    setPromoInput('');
    setPromoFeedback({ type: 'info', message: 'Code promo retiré.' });
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    setLoading(true);
    setSubmitError('');

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
        items: cart.map(i => ({
          id: i.id,
          name: i.name,
          price: Number(i.price || 0),
          quantity: i.quantity,
          selectedOptions: Array.isArray(i.selectedOptions) ? i.selectedOptions.map((option) => ({
            groupName: option.groupName,
            optionLabel: option.optionLabel,
            priceDelta: Number(option.priceDelta || 0),
          })) : [],
        })),
      });

      saveCheckoutDefaults({
        customer_address: form.customer_address,
        order_type: form.order_type,
        payment_method: form.payment_method,
      });

      clearCart();
      setAppliedPromotion(null);
      setPromoInput('');
      setPromoFeedback(null);
      setSuccess({ orderNumber: created.order_number });
    } catch (e) {
      setSubmitError(e.message || "La commande n'a pas pu être envoyée.");
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
    new: "text-yellow-600", accepted: "text-blue-600",
    ready: "text-green-600", completed: "text-gray-500", cancelled: "text-red-600"
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
          <p className="text-gray-600 mb-1">N° : <strong>{success.orderNumber}</strong></p>
          <p className="text-gray-500 text-sm mb-6">Paiement à la caisse. Nous préparons votre commande.</p>

          <div className="border border-gray-200 rounded-lg p-5 mb-6 text-left">
            <div className="flex items-center justify-between mb-3">
              <h3 className="font-semibold text-gray-800">Statut</h3>
              <button onClick={checkOrderStatus} disabled={checkingStatus} className="text-xs text-[#b5122a] hover:underline disabled:opacity-50">
                {checkingStatus ? "..." : "Actualiser"}
              </button>
            </div>
            {orderStatus ? (
              <>
                <p className={`font-semibold text-lg ${statusColors[orderStatus.status]}`}>{statusLabels[orderStatus.status]}</p>
                {orderStatus.prep_time_minutes && (orderStatus.status === "accepted" || orderStatus.status === "new") && (
                  <div className="mt-3 bg-blue-50 rounded-md px-4 py-3">
                    <p className="text-blue-800 text-sm font-medium">⏱ Temps estimé : <strong>{orderStatus.prep_time_minutes} min</strong></p>
                    {orderStatus.ready_at && (
                      <p className="text-blue-600 text-sm mt-1">Prête vers : <strong>{new Date(orderStatus.ready_at).toLocaleTimeString("fr-CH", { timeZone: "Europe/Zurich", hour: "2-digit", minute: "2-digit" })}</strong></p>
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
                <button onClick={checkOrderStatus} disabled={checkingStatus} className="px-5 py-2 bg-black text-white text-sm font-medium hover:bg-gray-800 disabled:opacity-50">
                  {checkingStatus ? "Chargement..." : "Vérifier le statut"}
                </button>
              </div>
            )}
          </div>

          <button onClick={() => navigate(createPageUrl("Menu"))} className="w-full py-3 bg-[#b5122a] text-white font-medium hover:bg-[#8f0e21] transition-colors">
            Retour au menu
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-white">
      <div className="bg-black text-white py-14 text-center">
        <h1 className="text-4xl font-serif italic mb-2">Mon panier</h1>
        <p className="text-gray-400 text-sm">{cartCount} article{cartCount > 1 ? "s" : ""}</p>
      </div>

      <div className="max-w-xl mx-auto px-4 py-8">
        {step === "cart" && (
          <>
            {cart.length === 0 ? (
              <div className="text-center py-20 text-gray-400">
                <p className="text-lg mb-4">Votre panier est vide</p>
                <button onClick={() => navigate(createPageUrl("Menu"))} className="px-6 py-3 bg-[#b5122a] text-white text-sm font-medium hover:bg-[#8f0e21]">
                  Retour au menu
                </button>
              </div>
            ) : (
              <>
                <div className="space-y-4 mb-6">
                  {cart.map(item => (
                    <div key={item.lineKey || item.id} className="flex items-center justify-between border-b border-gray-100 pb-4">
                      <div className="flex-1">
                        <p className="font-medium text-gray-900">{item.name}</p>
                        {Array.isArray(item.selectedOptions) && item.selectedOptions.length > 0 && (
                          <div className="mt-1 space-y-0.5">
                            {item.selectedOptions.map((option, index) => (
                              <p key={`${option.groupName}-${option.optionLabel}-${index}`} className="text-xs text-gray-500">
                                {option.groupName}: {option.optionLabel}
                              </p>
                            ))}
                          </div>
                        )}
                        <p className="text-[#b5122a] text-sm font-semibold">CHF {item.price?.toFixed(2)}</p>
                      </div>
                      <div className="flex items-center gap-3">
                        <button onClick={() => updateQty(item.lineKey || item.id, -1)} className="w-7 h-7 bg-gray-100 rounded-full flex items-center justify-center font-bold hover:bg-gray-200">−</button>
                        <span className="w-5 text-center font-semibold">{item.quantity}</span>
                        <button onClick={() => updateQty(item.lineKey || item.id, 1)} className="w-7 h-7 bg-black text-white rounded-full flex items-center justify-center font-bold hover:bg-gray-800">+</button>
                        <button onClick={() => removeItem(item.lineKey || item.id)} className="w-7 h-7 flex items-center justify-center text-gray-400 hover:text-red-500 transition-colors ml-1">
                          <Trash2 className="w-4 h-4" />
                        </button>
                      </div>
                      <span className="ml-2 font-semibold text-sm w-20 text-right">CHF {(item.price * item.quantity).toFixed(2)}</span>
                    </div>
                  ))}
                </div>

                <div className="border-t border-gray-200 pt-4 mb-6 space-y-3">
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
                  <div className="flex justify-between font-bold text-lg">
                    <span>Total</span>
                    <span>CHF {finalTotal.toFixed(2)}</span>
                  </div>
                </div>

                <div className="flex gap-3">
                  <button onClick={() => navigate(createPageUrl("Menu"))} className="flex-1 py-3 rounded-lg border border-gray-300 text-gray-700 text-sm font-medium hover:border-black transition-colors">
                    ← Continuer les achats
                  </button>
                  <button onClick={() => setStep("details")} className="flex-1 py-3 rounded-lg bg-[#b5122a] text-white font-medium hover:bg-[#8f0e21] transition-colors">
                    Commander
                  </button>
                </div>
              </>
            )}
          </>
        )}

        {step === "details" && (
          <>
            <button onClick={() => setStep("cart")} className="text-gray-500 hover:text-black text-sm mb-6">← Retour au panier</button>
            <h2 className="text-2xl font-semibold mb-6">Vos informations</h2>

            <form onSubmit={handleSubmit} className="space-y-5">
              <StorefrontNotice type="info">
                Paiement à la caisse au retrait/livraison. Vérifiez vos coordonnées pour recevoir les mises à jour de commande.
              </StorefrontNotice>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-2">Type de commande</label>
                <div className="grid grid-cols-2 gap-3">
                  {[{ value: "takeaway", label: "À emporter" }, { value: "delivery", label: "Livraison" }].map(opt => (
                    <button key={opt.value} type="button" onClick={() => setForm({ ...form, order_type: opt.value })}
                      className={`py-3 border-2 font-medium transition-colors ${form.order_type === opt.value ? "border-black bg-black text-white" : "border-gray-200 text-gray-600 hover:border-gray-400"}`}>
                      {opt.label}
                    </button>
                  ))}
                </div>
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-700 mb-2">Paiement</label>
                <div className="grid grid-cols-2 gap-3">
                  {[{ value: "cash", label: "Espèces" }, { value: "card", label: "Carte" }].map(opt => (
                    <button key={opt.value} type="button" onClick={() => setForm({ ...form, payment_method: opt.value })}
                      className={`py-3 border-2 font-medium transition-colors ${form.payment_method === opt.value ? "border-black bg-black text-white" : "border-gray-200 text-gray-600 hover:border-gray-400"}`}>
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
                  <input required value={form.customer_address} onChange={e => setForm({ ...form, customer_address: e.target.value })}
                    className="w-full border border-gray-300 px-4 py-3 focus:outline-none focus:border-black" placeholder="Rue, numéro, ville" />
                </div>
              )}

              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Notes</label>
                <textarea rows={2} value={form.notes} onChange={e => setForm({ ...form, notes: e.target.value })}
                  className="w-full border border-gray-300 px-4 py-3 focus:outline-none focus:border-black resize-none" placeholder="Allergies, demandes spéciales..." />
              </div>

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
                className="w-full py-4 rounded-lg bg-[#b5122a] text-white font-semibold text-lg hover:bg-[#8f0e21] transition-colors disabled:opacity-60">
                {loading ? "Envoi en cours..." : `Confirmer — CHF ${finalTotal.toFixed(2)}`}
              </button>
            </form>
          </>
        )}
      </div>
    </div>
  );
}
