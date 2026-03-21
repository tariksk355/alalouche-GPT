import { useEffect, useState } from "react";
import { StorefrontNotice } from "@/components/storefront/feedback";

function formatPromotionValue(promotion) {
  if (!promotion) return "";
  if (promotion.discountType === "percentage") {
    return `${Number(promotion.discountValue || 0)}%`;
  }
  return `CHF ${Number(promotion.discountValue || 0).toFixed(2)}`;
}

export function StorefrontPromoCodeCard({
  promoInput,
  appliedPromotion,
  loading,
  feedback,
  onPromoInputChange,
  onApply,
  onRemove,
  defaultOpen = false,
}) {
  const [expanded, setExpanded] = useState(defaultOpen);

  useEffect(() => {
    if (appliedPromotion) {
      setExpanded(true);
    }
  }, [appliedPromotion]);

  return (
    <div className="rounded-lg border border-gray-200 bg-white">
      <button
        type="button"
        onClick={() => setExpanded((current) => !current)}
        className="w-full px-4 py-3 flex items-center justify-between gap-3 text-left"
      >
        <div>
          <div className="text-sm font-medium text-gray-900">Code promo</div>
          <div className="text-xs text-gray-500">
            {appliedPromotion ? `Appliqué : ${appliedPromotion.promotionCode}` : "Ajouter un code promo"}
          </div>
        </div>
        <span className="text-xs font-medium text-[#b5122a]">{expanded ? "Masquer" : "Ajouter"}</span>
      </button>

      {expanded && (
        <div className="px-4 pb-4 space-y-3 border-t border-gray-100">
          {appliedPromotion ? (
            <div className="pt-3 space-y-3">
              <div className="rounded-lg border border-green-200 bg-green-50 px-3 py-3">
                <div className="flex items-start justify-between gap-3">
                  <div>
                    <div className="text-sm font-semibold text-green-800">{appliedPromotion.promotionCode}</div>
                    <div className="text-xs text-green-700 mt-1">
                      Remise {formatPromotionValue(appliedPromotion)} · économie CHF {Number(appliedPromotion.discountAmount || 0).toFixed(2)}
                    </div>
                  </div>
                  <button type="button" onClick={onRemove} className="text-xs font-medium text-green-700 hover:text-green-900">
                    Retirer
                  </button>
                </div>
              </div>
              {feedback && <StorefrontNotice type={feedback.type}>{feedback.message}</StorefrontNotice>}
            </div>
          ) : (
            <div className="pt-3 space-y-3">
              <div className="flex gap-2">
                <input
                  value={promoInput}
                  onChange={(event) => onPromoInputChange(event.target.value.toUpperCase())}
                  className="flex-1 border border-gray-300 px-3 py-2 rounded-md focus:outline-none focus:border-black uppercase"
                  placeholder="ALALOUCHE-XXXX"
                />
                <button
                  type="button"
                  onClick={onApply}
                  disabled={loading || !promoInput.trim()}
                  className="px-4 py-2 rounded-md bg-black text-white text-sm font-medium hover:bg-gray-800 disabled:opacity-60"
                >
                  {loading ? "..." : "Appliquer"}
                </button>
              </div>
              {feedback && <StorefrontNotice type={feedback.type}>{feedback.message}</StorefrontNotice>}
            </div>
          )}
        </div>
      )}
    </div>
  );
}
