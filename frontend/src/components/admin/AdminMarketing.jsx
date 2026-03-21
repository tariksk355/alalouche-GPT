import { useEffect, useMemo, useRef, useState } from "react";
import {
  createAdminPromotion,
  getAdminMarketingRecipientCount,
  listAdminMarketingRecipients,
  listAdminPromotions,
  sendAdminMarketingBulkEmail,
  updateAdminPromotion,
} from "@/lib/api/adminMarketing";

function AdminNotice({ type = "success", children }) {
  const styles = type === "error"
    ? "bg-red-50 border-red-200 text-red-700"
    : type === "info"
      ? "bg-blue-50 border-blue-200 text-blue-700"
      : "bg-green-50 border-green-200 text-green-700";
  return <div className={`border px-4 py-3 rounded-lg text-sm ${styles}`}>{children}</div>;
}

function AdminLoadingState({ label = "Chargement..." }) {
  return <div className="text-center text-gray-400 py-12">{label}</div>;
}

function AdminEmptyState({ label }) {
  return <div className="text-center text-gray-400 py-12 border border-dashed border-gray-200 rounded-xl bg-white">{label}</div>;
}

const PROMOTION_DEFAULTS = {
  name: "",
  code: "",
  discountType: "percentage",
  discountValue: "10",
  startsAt: "",
  endsAt: "",
  isActive: true,
  usageLimit: "",
  perCustomerLimit: "",
};

function generatePromoCode() {
  const alphabet = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";
  let suffix = "";
  for (let index = 0; index < 8; index += 1) {
    suffix += alphabet[Math.floor(Math.random() * alphabet.length)];
  }
  return `ALALOUCHE-${suffix}`;
}

function formatPromotionValue(promotion) {
  const numericValue = Number(promotion?.discountValue || 0);
  if (promotion?.discountType === "percentage") {
    return `${numericValue}%`;
  }
  return `${numericValue.toFixed(2)} CHF`;
}

function formatDateLabel(value) {
  if (!value) return "Non définie";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "Non définie";
  return date.toLocaleDateString("fr-CH", {
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  });
}

function getPromotionBadge(promotion) {
  if (!promotion?.isActive) {
    return { label: "Inactive", className: "bg-gray-100 text-gray-700 border-gray-200" };
  }

  const now = Date.now();
  const startsAt = promotion?.startsAt ? new Date(promotion.startsAt).getTime() : null;
  const endsAt = promotion?.endsAt ? new Date(promotion.endsAt).getTime() : null;

  if (endsAt && endsAt < now) {
    return { label: "Expirée", className: "bg-amber-50 text-amber-700 border-amber-200" };
  }

  if (startsAt && startsAt > now) {
    return { label: "Planifiée", className: "bg-blue-50 text-blue-700 border-blue-200" };
  }

  return { label: "Active", className: "bg-green-50 text-green-700 border-green-200" };
}

function normalizePromotionPayload(formState) {
  return {
    name: formState.name.trim(),
    code: formState.code.trim().toUpperCase(),
    discountType: formState.discountType,
    discountValue: Number(formState.discountValue),
    startsAt: formState.startsAt || undefined,
    endsAt: formState.endsAt || undefined,
    isActive: Boolean(formState.isActive),
    usageLimit: formState.usageLimit ? Number(formState.usageLimit) : undefined,
    perCustomerLimit: formState.perCustomerLimit ? Number(formState.perCustomerLimit) : undefined,
  };
}

function buildPromotionSnippet(promotion, part = "block") {
  const expiry = promotion?.endsAt ? formatDateLabel(promotion.endsAt) : null;
  const cta = "Commandez dès maintenant sur notre site.";
  const mapping = {
    value: `Offre : ${formatPromotionValue(promotion)}`,
    code: `Code promo : ${promotion?.code || ""}`,
    expiry: expiry ? `Valable jusqu'au ${expiry}` : "",
    cta,
    block: [
      `🎁 Offre spéciale : ${formatPromotionValue(promotion)}`,
      `Utilisez le code ${promotion?.code || ""}`,
      expiry ? `Valable jusqu'au ${expiry}.` : "",
      cta,
    ].filter(Boolean).join("\n"),
  };

  return mapping[part] || "";
}

function PromotionFormModal({ open, mode, initialValue, busy, onClose, onSubmit }) {
  const [form, setForm] = useState(PROMOTION_DEFAULTS);

  useEffect(() => {
    if (!open) return;
    if (!initialValue) {
      setForm({
        ...PROMOTION_DEFAULTS,
        code: generatePromoCode(),
      });
      return;
    }

    setForm({
      name: initialValue.name || "",
      code: initialValue.code || "",
      discountType: initialValue.discountType || "percentage",
      discountValue: String(Number(initialValue.discountValue || 0)),
      startsAt: initialValue.startsAt ? String(initialValue.startsAt).slice(0, 10) : "",
      endsAt: initialValue.endsAt ? String(initialValue.endsAt).slice(0, 10) : "",
      isActive: Boolean(initialValue.isActive),
      usageLimit: initialValue.usageLimit ? String(initialValue.usageLimit) : "",
      perCustomerLimit: initialValue.perCustomerLimit ? String(initialValue.perCustomerLimit) : "",
    });
  }, [initialValue, open]);

  if (!open) return null;

  const handleSubmit = async (event) => {
    event.preventDefault();
    await onSubmit(normalizePromotionPayload(form));
  };

  return (
    <div className="fixed inset-0 z-40 bg-black/40 px-4 py-8 overflow-auto">
      <div className="max-w-2xl mx-auto bg-white rounded-2xl shadow-xl border border-gray-200">
        <div className="px-6 py-5 border-b border-gray-200 flex items-start justify-between gap-4">
          <div>
            <h3 className="text-lg font-semibold text-gray-900">{mode === "edit" ? "Modifier le code promo" : "Nouveau code promo"}</h3>
            <p className="text-sm text-gray-500 mt-1">Version simple pour vos campagnes email et votre lancement.</p>
          </div>
          <button type="button" onClick={onClose} className="text-sm text-gray-500 hover:text-gray-700">Fermer</button>
        </div>

        <form onSubmit={handleSubmit} className="p-6 space-y-4">
          <div className="grid gap-4 md:grid-cols-2">
            <div className="md:col-span-2">
              <label className="block text-sm text-gray-500 mb-1">Nom interne *</label>
              <input
                required
                value={form.name}
                onChange={(event) => setForm((current) => ({ ...current, name: event.target.value }))}
                className="w-full bg-gray-50 border border-gray-200 text-gray-900 px-4 py-2 rounded-lg focus:outline-none focus:border-gray-400"
                placeholder="Promo lancement printemps"
              />
            </div>

            <div className="md:col-span-2">
              <div className="flex items-center justify-between gap-3 mb-1">
                <label className="block text-sm text-gray-500">Code promo *</label>
                <button
                  type="button"
                  onClick={() => setForm((current) => ({ ...current, code: generatePromoCode() }))}
                  className="text-xs font-medium text-[#b5122a] hover:text-[#8f0e21]"
                >
                  Génération automatique
                </button>
              </div>
              <input
                required
                value={form.code}
                onChange={(event) => setForm((current) => ({ ...current, code: event.target.value.toUpperCase() }))}
                className="w-full bg-gray-50 border border-gray-200 text-gray-900 px-4 py-2 rounded-lg focus:outline-none focus:border-gray-400 uppercase"
                placeholder="ALALOUCHE-PRINTEMPS"
              />
            </div>

            <div>
              <label className="block text-sm text-gray-500 mb-1">Type de remise *</label>
              <select
                value={form.discountType}
                onChange={(event) => setForm((current) => ({ ...current, discountType: event.target.value }))}
                className="w-full bg-gray-50 border border-gray-200 text-gray-900 px-4 py-2 rounded-lg focus:outline-none focus:border-gray-400"
              >
                <option value="percentage">Pourcentage</option>
                <option value="fixed_amount">Montant fixe</option>
              </select>
            </div>

            <div>
              <label className="block text-sm text-gray-500 mb-1">Valeur *</label>
              <input
                required
                min="0"
                step="0.01"
                type="number"
                value={form.discountValue}
                onChange={(event) => setForm((current) => ({ ...current, discountValue: event.target.value }))}
                className="w-full bg-gray-50 border border-gray-200 text-gray-900 px-4 py-2 rounded-lg focus:outline-none focus:border-gray-400"
                placeholder={form.discountType === "percentage" ? "10" : "5.00"}
              />
            </div>

            <div>
              <label className="block text-sm text-gray-500 mb-1">Début</label>
              <input
                type="date"
                value={form.startsAt}
                onChange={(event) => setForm((current) => ({ ...current, startsAt: event.target.value }))}
                className="w-full bg-gray-50 border border-gray-200 text-gray-900 px-4 py-2 rounded-lg focus:outline-none focus:border-gray-400"
              />
            </div>

            <div>
              <label className="block text-sm text-gray-500 mb-1">Fin</label>
              <input
                type="date"
                value={form.endsAt}
                onChange={(event) => setForm((current) => ({ ...current, endsAt: event.target.value }))}
                className="w-full bg-gray-50 border border-gray-200 text-gray-900 px-4 py-2 rounded-lg focus:outline-none focus:border-gray-400"
              />
            </div>

            <div>
              <label className="block text-sm text-gray-500 mb-1">Limite totale d'utilisation</label>
              <input
                min="1"
                step="1"
                type="number"
                value={form.usageLimit}
                onChange={(event) => setForm((current) => ({ ...current, usageLimit: event.target.value }))}
                className="w-full bg-gray-50 border border-gray-200 text-gray-900 px-4 py-2 rounded-lg focus:outline-none focus:border-gray-400"
                placeholder="Optionnel"
              />
            </div>

            <div>
              <label className="block text-sm text-gray-500 mb-1">Limite par client</label>
              <input
                min="1"
                step="1"
                type="number"
                value={form.perCustomerLimit}
                onChange={(event) => setForm((current) => ({ ...current, perCustomerLimit: event.target.value }))}
                className="w-full bg-gray-50 border border-gray-200 text-gray-900 px-4 py-2 rounded-lg focus:outline-none focus:border-gray-400"
                placeholder="Optionnel"
              />
            </div>
          </div>

          <label className="flex items-center gap-3 rounded-lg border border-gray-200 bg-gray-50 px-4 py-3">
            <input
              type="checkbox"
              checked={form.isActive}
              onChange={(event) => setForm((current) => ({ ...current, isActive: event.target.checked }))}
              className="h-4 w-4 rounded border-gray-300 text-[#b5122a] focus:ring-[#b5122a]"
            />
            <div>
              <div className="text-sm font-medium text-gray-900">Code actif</div>
              <div className="text-xs text-gray-500">Désactivez ce code si vous voulez le préparer sans l'utiliser tout de suite.</div>
            </div>
          </label>

          <div className="flex justify-end gap-3 pt-2">
            <button type="button" onClick={onClose} className="px-4 py-2 border border-gray-300 text-gray-700 rounded-lg">
              Annuler
            </button>
            <button type="submit" disabled={busy} className="px-4 py-2 bg-[#b5122a] text-white rounded-lg hover:bg-[#8f0e21] disabled:opacity-60">
              {busy ? "Enregistrement..." : mode === "edit" ? "Enregistrer" : "Créer le code"}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}

export default function AdminMarketing() {
  const [activeTab, setActiveTab] = useState("campaigns");
  const [emailForm, setEmailForm] = useState({ subject: "", body: "" });
  const [loading, setLoading] = useState(false);
  const [success, setSuccess] = useState("");
  const [error, setError] = useState("");
  const [customerCount, setCustomerCount] = useState(0);
  const [recipients, setRecipients] = useState([]);
  const [loadingRecipients, setLoadingRecipients] = useState(false);
  const [excludedRecipientIds, setExcludedRecipientIds] = useState([]);
  const [promotions, setPromotions] = useState([]);
  const [promotionsLoading, setPromotionsLoading] = useState(false);
  const [promotionSearch, setPromotionSearch] = useState("");
  const [promotionStatus, setPromotionStatus] = useState("all");
  const [promotionMode, setPromotionMode] = useState("none");
  const [selectedPromotionId, setSelectedPromotionId] = useState("");
  const [promotionModalState, setPromotionModalState] = useState({ open: false, mode: "create", promotion: null, attachOnSave: false });
  const [promotionSaveLoading, setPromotionSaveLoading] = useState(false);
  const textareaRef = useRef(null);

  const loadRecipients = async () => {
    setLoadingRecipients(true);
    setError("");
    try {
      const [count, subscribedRecipients] = await Promise.all([
        getAdminMarketingRecipientCount(),
        listAdminMarketingRecipients(),
      ]);
      setCustomerCount(count);
      setRecipients(subscribedRecipients);
      setExcludedRecipientIds((prev) => prev.filter((id) => subscribedRecipients.some((recipient) => recipient.id === id)));
    } catch (requestError) {
      setError(requestError.message || "Impossible de charger les destinataires marketing.");
    } finally {
      setLoadingRecipients(false);
    }
  };

  const loadPromotions = async (options = {}) => {
    const searchValue = options.search ?? promotionSearch;
    const statusValue = options.status ?? promotionStatus;
    setPromotionsLoading(true);
    setError("");
    try {
      const rows = await listAdminPromotions({ search: searchValue, status: statusValue });
      setPromotions(rows);
      setSelectedPromotionId((current) => {
        if (!current) return current;
        return rows.some((promotion) => promotion.id === current) ? current : "";
      });
    } catch (requestError) {
      setError(requestError.message || "Impossible de charger les codes promo.");
    } finally {
      setPromotionsLoading(false);
    }
  };

  useEffect(() => {
    loadRecipients();
  }, []);

  useEffect(() => {
    const timeoutId = window.setTimeout(() => {
      loadPromotions();
    }, 250);

    return () => window.clearTimeout(timeoutId);
  }, [promotionSearch, promotionStatus]);

  const attachablePromotions = useMemo(
    () => promotions.filter((promotion) => promotion.isActive && (!promotion.endsAt || new Date(promotion.endsAt).getTime() >= Date.now())),
    [promotions],
  );

  const selectedPromotion = useMemo(
    () => promotions.find((promotion) => promotion.id === selectedPromotionId) || null,
    [promotions, selectedPromotionId],
  );

  const targetedCount = Math.max(recipients.length - excludedRecipientIds.length, 0);

  const toggleExcludedRecipient = (customerId) => {
    setExcludedRecipientIds((prev) => (
      prev.includes(customerId)
        ? prev.filter((id) => id !== customerId)
        : [...prev, customerId]
    ));
  };

  const openCreatePromotionModal = (attachOnSave = false) => {
    setPromotionModalState({
      open: true,
      mode: "create",
      promotion: null,
      attachOnSave,
    });
  };

  const openEditPromotionModal = (promotion) => {
    setPromotionModalState({
      open: true,
      mode: "edit",
      promotion,
      attachOnSave: false,
    });
  };

  const closePromotionModal = () => {
    if (promotionSaveLoading) return;
    setPromotionModalState({ open: false, mode: "create", promotion: null, attachOnSave: false });
  };

  const handlePromotionSubmit = async (payload) => {
    setPromotionSaveLoading(true);
    setError("");
    setSuccess("");
    try {
      const savedPromotion = promotionModalState.mode === "edit" && promotionModalState.promotion?.id
        ? await updateAdminPromotion(promotionModalState.promotion.id, payload)
        : await createAdminPromotion(payload);

      await loadPromotions();
      if (promotionModalState.attachOnSave) {
        setPromotionMode("existing");
        setSelectedPromotionId(savedPromotion.id);
        setActiveTab("campaigns");
      }

      setSuccess(promotionModalState.mode === "edit" ? "Code promo mis à jour." : "Code promo créé avec succès.");
      setPromotionModalState({ open: false, mode: "create", promotion: null, attachOnSave: false });
    } catch (requestError) {
      setError(requestError.message || "Impossible d'enregistrer le code promo.");
    } finally {
      setPromotionSaveLoading(false);
    }
  };

  const insertIntoBody = (snippet) => {
    if (!snippet) return;
    setEmailForm((current) => {
      const textarea = textareaRef.current;
      if (!textarea) {
        return { ...current, body: current.body ? `${current.body}\n${snippet}` : snippet };
      }

      const selectionStart = textarea.selectionStart ?? current.body.length;
      const selectionEnd = textarea.selectionEnd ?? current.body.length;
      const prefix = current.body.slice(0, selectionStart);
      const suffix = current.body.slice(selectionEnd);
      const glueBefore = prefix && !prefix.endsWith("\n") ? "\n" : "";
      const glueAfter = suffix && !suffix.startsWith("\n") ? "\n" : "";
      const nextBody = `${prefix}${glueBefore}${snippet}${glueAfter}${suffix}`;

      window.requestAnimationFrame(() => {
        const nextCursor = prefix.length + glueBefore.length + snippet.length;
        textarea.focus();
        textarea.setSelectionRange(nextCursor, nextCursor);
      });

      return { ...current, body: nextBody };
    });
  };

  const sendBulkEmail = async (event) => {
    event.preventDefault();
    if (loading) return;
    setLoading(true);
    setSuccess("");
    setError("");

    try {
      const result = await sendAdminMarketingBulkEmail({
        subject: emailForm.subject,
        body: emailForm.body,
        excludedCustomerIds: excludedRecipientIds,
        promotionId: promotionMode === "existing" && selectedPromotionId ? selectedPromotionId : undefined,
      });

      if (result.recipientsMatched === 0) {
        setSuccess("Aucun client abonné à l'email marketing.");
      } else {
        const exclusionMessage = result.excludedCount > 0 ? ` (${result.excludedCount} exclu${result.excludedCount > 1 ? "s" : ""})` : "";
        const promotionMessage = result.promotion?.code ? ` Code joint : ${result.promotion.code}.` : "";
        setSuccess(`✅ Envoi traité pour ${result.recipientsDispatched} client(s) sur ${result.recipientsMatched} ciblé(s)${exclusionMessage}.${promotionMessage}`);
      }

      setEmailForm({ subject: "", body: "" });
      setExcludedRecipientIds([]);
      setPromotionMode("none");
      setSelectedPromotionId("");
      await Promise.all([loadRecipients(), loadPromotions()]);
    } catch (requestError) {
      setError(requestError.message || "Impossible d'envoyer la campagne marketing.");
    } finally {
      setLoading(false);
      window.setTimeout(() => {
        setSuccess("");
        setError("");
      }, 6000);
    }
  };

  return (
    <div className="space-y-4">
      {success && <AdminNotice>{success}</AdminNotice>}
      {error && <AdminNotice type="error">{error}</AdminNotice>}

      <div className="inline-flex rounded-xl border border-gray-200 bg-white p-1 shadow-sm">
        {[
          { id: "campaigns", label: "Campagnes email" },
          { id: "promotions", label: "Codes promo" },
        ].map((tab) => (
          <button
            key={tab.id}
            type="button"
            onClick={() => setActiveTab(tab.id)}
            className={`px-4 py-2 rounded-lg text-sm font-medium transition-colors ${activeTab === tab.id ? "bg-[#b5122a] text-white" : "text-gray-600 hover:text-gray-900"}`}
          >
            {tab.label}
          </button>
        ))}
      </div>

      {activeTab === "campaigns" && (
        <div className="max-w-5xl grid gap-6 xl:grid-cols-[1.1fr_0.9fr]">
          <form onSubmit={sendBulkEmail} className="bg-white rounded-xl border border-gray-200 p-6 space-y-4 shadow-sm">
            <div className="flex flex-wrap items-center justify-between gap-3">
              <div>
                <p className="text-gray-900 font-semibold">Campagne email</p>
                <p className="text-gray-500 text-sm">{customerCount} clients abonnés aux emails</p>
              </div>
              <div className="text-xs text-gray-500 bg-gray-50 border border-gray-200 rounded-full px-3 py-1">
                Envoi via Resend
              </div>
            </div>

            <AdminNotice type="info">
              Cette action envoie immédiatement la campagne aux clients abonnés. Vous pouvez exclure certains destinataires avant l’envoi.
            </AdminNotice>

            <div className="rounded-lg border border-gray-200 bg-gray-50 p-4 space-y-3">
              <div className="flex items-center justify-between gap-3">
                <div>
                  <p className="text-sm font-medium text-gray-900">Promotion</p>
                  <p className="text-xs text-gray-500">Ajoutez un code promo existant ou créez-en un sans quitter la campagne.</p>
                </div>
                <button
                  type="button"
                  onClick={() => openCreatePromotionModal(true)}
                  className="px-3 py-2 text-sm font-medium text-[#b5122a] border border-[#b5122a]/30 rounded-lg hover:bg-[#b5122a]/5"
                >
                  Créer un code
                </button>
              </div>

              <div className="grid gap-2 sm:grid-cols-3">
                {[
                  { id: "none", label: "Aucune promotion" },
                  { id: "existing", label: "Code existant" },
                  { id: "create", label: "Créer un nouveau code" },
                ].map((option) => (
                  <button
                    key={option.id}
                    type="button"
                    onClick={() => {
                      if (option.id === "create") {
                        openCreatePromotionModal(true);
                        return;
                      }
                      setPromotionMode(option.id);
                      if (option.id === "none") {
                        setSelectedPromotionId("");
                      }
                    }}
                    className={`rounded-lg border px-4 py-3 text-left text-sm transition-colors ${promotionMode === option.id ? "border-[#b5122a] bg-[#b5122a]/5 text-[#8f0e21]" : "border-gray-200 bg-white text-gray-700 hover:border-gray-300"}`}
                  >
                    {option.label}
                  </button>
                ))}
              </div>

              {promotionMode === "existing" && (
                <div className="space-y-3">
                  <select
                    value={selectedPromotionId}
                    onChange={(event) => setSelectedPromotionId(event.target.value)}
                    className="w-full bg-white border border-gray-200 text-gray-900 px-4 py-2 rounded-lg focus:outline-none focus:border-gray-400"
                  >
                    <option value="">Sélectionnez un code promo</option>
                    {attachablePromotions.map((promotion) => (
                      <option key={promotion.id} value={promotion.id}>
                        {promotion.code} · {promotion.name} · {formatPromotionValue(promotion)}
                      </option>
                    ))}
                  </select>
                  {attachablePromotions.length === 0 && (
                    <p className="text-xs text-amber-700 bg-amber-50 border border-amber-200 rounded-lg px-3 py-2">
                      Aucun code actif disponible. Créez-en un pour l’ajouter à cette campagne.
                    </p>
                  )}
                </div>
              )}

              {selectedPromotion && promotionMode === "existing" && (
                <div className="rounded-lg border border-[#b5122a]/15 bg-white p-4">
                  <div className="flex flex-wrap items-start justify-between gap-3">
                    <div>
                      <div className="text-xs uppercase tracking-wide text-gray-500">Code promo joint</div>
                      <div className="text-lg font-semibold text-gray-900 mt-1">{selectedPromotion.code}</div>
                      <div className="text-sm text-gray-500 mt-1">{selectedPromotion.name}</div>
                    </div>
                    <div className="text-right">
                      <div className="text-sm font-semibold text-[#8f0e21]">{formatPromotionValue(selectedPromotion)}</div>
                      <div className="text-xs text-gray-500 mt-1">Expire le {formatDateLabel(selectedPromotion.endsAt)}</div>
                    </div>
                  </div>
                  <div className="flex flex-wrap gap-2 mt-4">
                    <button type="button" onClick={() => insertIntoBody(buildPromotionSnippet(selectedPromotion, "block"))} className="px-3 py-2 text-xs font-medium border border-gray-200 rounded-lg hover:bg-gray-50">
                      Insérer le bloc promo
                    </button>
                    <button type="button" onClick={() => insertIntoBody(buildPromotionSnippet(selectedPromotion, "value"))} className="px-3 py-2 text-xs font-medium border border-gray-200 rounded-lg hover:bg-gray-50">
                      Insérer l’offre
                    </button>
                    <button type="button" onClick={() => insertIntoBody(buildPromotionSnippet(selectedPromotion, "code"))} className="px-3 py-2 text-xs font-medium border border-gray-200 rounded-lg hover:bg-gray-50">
                      Insérer le code
                    </button>
                    <button type="button" onClick={() => insertIntoBody(buildPromotionSnippet(selectedPromotion, "expiry"))} className="px-3 py-2 text-xs font-medium border border-gray-200 rounded-lg hover:bg-gray-50">
                      Insérer la date limite
                    </button>
                    <button type="button" onClick={() => insertIntoBody(buildPromotionSnippet(selectedPromotion, "cta"))} className="px-3 py-2 text-xs font-medium border border-gray-200 rounded-lg hover:bg-gray-50">
                      Insérer le CTA
                    </button>
                  </div>
                </div>
              )}
            </div>

            <div>
              <label className="block text-sm text-gray-500 mb-1">Sujet *</label>
              <input
                required
                value={emailForm.subject}
                onChange={(event) => setEmailForm({ ...emailForm, subject: event.target.value })}
                className="w-full bg-gray-50 border border-gray-200 text-gray-900 px-4 py-2 rounded-lg focus:outline-none focus:border-gray-400"
                placeholder="Promotion du week-end !"
              />
            </div>

            <div>
              <div className="flex items-center justify-between gap-3 mb-1">
                <label className="block text-sm text-gray-500">Message *</label>
                {selectedPromotion && promotionMode === "existing" && (
                  <span className="text-xs text-gray-500">Astuce : utilisez les boutons ci-dessus pour insérer rapidement le contenu promo.</span>
                )}
              </div>
              <textarea
                ref={textareaRef}
                required
                rows={10}
                value={emailForm.body}
                onChange={(event) => setEmailForm({ ...emailForm, body: event.target.value })}
                className="w-full bg-gray-50 border border-gray-200 text-gray-900 px-4 py-2 rounded-lg focus:outline-none focus:border-gray-400 resize-none"
                placeholder="Votre message..."
              />
            </div>

            <button type="submit" disabled={loading || targetedCount === 0} className="w-full py-3 bg-[#b5122a] text-white font-semibold rounded-lg hover:bg-[#8f0e21] disabled:opacity-60 transition-colors">
              {loading ? "Envoi en cours..." : targetedCount === customerCount ? "Envoyer à tous les abonnés" : `Envoyer à ${targetedCount} abonné${targetedCount > 1 ? "s" : ""}`}
            </button>
          </form>

          <div className="bg-white rounded-xl border border-gray-200 p-6 shadow-sm space-y-4">
            <div className="flex items-center justify-between gap-3">
              <div>
                <p className="text-gray-900 font-semibold">Destinataires abonnés</p>
                <p className="text-xs text-gray-500">{targetedCount} destinataire{targetedCount > 1 ? "s" : ""} ciblé{targetedCount > 1 ? "s" : ""} après exclusions.</p>
              </div>
              {excludedRecipientIds.length > 0 && (
                <button type="button" onClick={() => setExcludedRecipientIds([])} className="text-xs text-gray-500 hover:text-gray-700">
                  Réinitialiser
                </button>
              )}
            </div>

            {loadingRecipients ? (
              <AdminLoadingState label="Chargement des abonnés..." />
            ) : recipients.length === 0 ? (
              <AdminEmptyState label="Aucun client abonné à l'email marketing." />
            ) : (
              <div className="space-y-2 max-h-[34rem] overflow-auto">
                {recipients.map((recipient) => {
                  const isExcluded = excludedRecipientIds.includes(recipient.id);
                  return (
                    <label key={recipient.id} className={`flex items-start gap-3 rounded-lg border px-3 py-3 cursor-pointer ${isExcluded ? "border-red-200 bg-red-50" : "border-gray-200 bg-white"}`}>
                      <input
                        type="checkbox"
                        checked={isExcluded}
                        onChange={() => toggleExcludedRecipient(recipient.id)}
                        className="mt-1 h-4 w-4 rounded border-gray-300 text-[#b5122a] focus:ring-[#b5122a]"
                      />
                      <div className="min-w-0">
                        <div className="text-sm font-medium text-gray-900">{recipient.fullName}</div>
                        <div className="text-xs text-gray-500 break-all">{recipient.email}</div>
                      </div>
                      <span className={`ml-auto text-xs font-medium ${isExcluded ? "text-red-600" : "text-green-600"}`}>
                        {isExcluded ? "Exclu" : "Inclus"}
                      </span>
                    </label>
                  );
                })}
              </div>
            )}
          </div>
        </div>
      )}

      {activeTab === "promotions" && (
        <div className="max-w-6xl space-y-4">
          <div className="bg-white rounded-xl border border-gray-200 p-6 shadow-sm space-y-4">
            <div className="flex flex-wrap items-center justify-between gap-3">
              <div>
                <h3 className="text-lg font-semibold text-gray-900">Codes promo</h3>
                <p className="text-sm text-gray-500">Gérez vos offres simples à relayer dans vos campagnes email.</p>
              </div>
              <button onClick={() => openCreatePromotionModal(false)} className="px-4 py-2 bg-[#b5122a] text-white rounded-lg hover:bg-[#8f0e21]">
                Créer un code promo
              </button>
            </div>

            <div className="grid gap-3 md:grid-cols-[1fr_220px]">
              <input
                value={promotionSearch}
                onChange={(event) => setPromotionSearch(event.target.value)}
                placeholder="Rechercher par nom ou code"
                className="w-full bg-gray-50 border border-gray-200 text-gray-900 px-4 py-2 rounded-lg focus:outline-none focus:border-gray-400"
              />
              <select
                value={promotionStatus}
                onChange={(event) => setPromotionStatus(event.target.value)}
                className="w-full bg-gray-50 border border-gray-200 text-gray-900 px-4 py-2 rounded-lg focus:outline-none focus:border-gray-400"
              >
                <option value="all">Tous les statuts</option>
                <option value="active">Actifs</option>
                <option value="inactive">Inactifs</option>
              </select>
            </div>
          </div>

          {promotionsLoading ? (
            <AdminLoadingState label="Chargement des codes promo..." />
          ) : promotions.length === 0 ? (
            <AdminEmptyState label="Aucun code promo pour le moment." />
          ) : (
            <div className="grid gap-4 lg:grid-cols-2">
              {promotions.map((promotion) => {
                const badge = getPromotionBadge(promotion);
                return (
                  <div key={promotion.id} className="bg-white rounded-xl border border-gray-200 p-5 shadow-sm">
                    <div className="flex items-start justify-between gap-4">
                      <div>
                        <div className="text-xs uppercase tracking-wide text-gray-500">Code</div>
                        <div className="text-xl font-semibold text-gray-900 mt-1">{promotion.code}</div>
                        <div className="text-sm text-gray-500 mt-1">{promotion.name}</div>
                      </div>
                      <span className={`inline-flex items-center rounded-full border px-3 py-1 text-xs font-medium ${badge.className}`}>
                        {badge.label}
                      </span>
                    </div>

                    <div className="grid grid-cols-2 gap-3 mt-4 text-sm">
                      <div className="rounded-lg bg-gray-50 border border-gray-200 px-3 py-3">
                        <div className="text-xs uppercase tracking-wide text-gray-500">Remise</div>
                        <div className="font-semibold text-gray-900 mt-1">{formatPromotionValue(promotion)}</div>
                      </div>
                      <div className="rounded-lg bg-gray-50 border border-gray-200 px-3 py-3">
                        <div className="text-xs uppercase tracking-wide text-gray-500">Utilisations</div>
                        <div className="font-semibold text-gray-900 mt-1">
                          {promotion.usageCount}
                          {promotion.usageLimit ? ` / ${promotion.usageLimit}` : ""}
                        </div>
                      </div>
                      <div className="rounded-lg bg-gray-50 border border-gray-200 px-3 py-3">
                        <div className="text-xs uppercase tracking-wide text-gray-500">Début</div>
                        <div className="font-medium text-gray-900 mt-1">{formatDateLabel(promotion.startsAt)}</div>
                      </div>
                      <div className="rounded-lg bg-gray-50 border border-gray-200 px-3 py-3">
                        <div className="text-xs uppercase tracking-wide text-gray-500">Fin</div>
                        <div className="font-medium text-gray-900 mt-1">{formatDateLabel(promotion.endsAt)}</div>
                      </div>
                    </div>

                    <div className="flex flex-wrap items-center justify-between gap-3 mt-4">
                      <div className="text-xs text-gray-500">
                        {promotion.perCustomerLimit ? `Max ${promotion.perCustomerLimit} utilisation(s) par client` : "Pas de limite par client"}
                      </div>
                      <div className="flex gap-2">
                        <button type="button" onClick={() => { setPromotionMode("existing"); setSelectedPromotionId(promotion.id); setActiveTab("campaigns"); }} className="px-3 py-2 text-sm border border-gray-300 text-gray-700 rounded-lg hover:bg-gray-50">
                          Utiliser dans une campagne
                        </button>
                        <button type="button" onClick={() => openEditPromotionModal(promotion)} className="px-3 py-2 text-sm bg-[#b5122a] text-white rounded-lg hover:bg-[#8f0e21]">
                          Modifier
                        </button>
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </div>
      )}

      <PromotionFormModal
        open={promotionModalState.open}
        mode={promotionModalState.mode}
        initialValue={promotionModalState.promotion}
        busy={promotionSaveLoading}
        onClose={closePromotionModal}
        onSubmit={handlePromotionSubmit}
      />
    </div>
  );
}
