import { useState, useEffect } from "react";
import { base44 } from "@/api/base44Client";
import { reservationRequestEmail, newReservationNotifyEmail } from "@/components/emails/emailTemplates";

export default function Reservation() {
  const [form, setForm] = useState({ name: "", email: "", phone: "", date: "", time: "", guests: 2, notes: "" });
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    base44.auth.me().then(user => {
      if (user) {
        setForm(prev => ({
          ...prev,
          name: user.full_name || "",
          email: user.email || "",
          phone: user.phone || "",
        }));
      }
    }).catch(() => {});
  }, []);
  const [success, setSuccess] = useState(false);
  const [error, setError] = useState("");

  const TIMES = ["11:30", "12:00", "12:30", "13:00", "13:30", "18:00", "18:30", "19:00", "19:30", "20:00", "20:30", "21:00"];

  const handleSubmit = async (e) => {
    e.preventDefault();
    setLoading(true);
    setError("");
    // Create reservation
    await base44.entities.Reservation.create({ ...form, guests: Number(form.guests), status: "pending" });

    // Send acknowledgement email to customer (non-blocking)
    try {
      await base44.integrations.Core.SendEmail({
        to: form.email,
        subject: "Demande de réservation reçue — À la louche",
        body: reservationRequestEmail({ name: form.name, date: form.date, time: form.time, guests: form.guests, notes: form.notes })
      });
    } catch (e) { console.warn("Email client failed", e); }

    try {
      await base44.integrations.Core.SendEmail({
        to: "kodlantiswiss@gmail.com",
        subject: `🔔 Nouvelle réservation — ${form.name} — ${form.date} à ${form.time}`,
        body: newReservationNotifyEmail({ name: form.name, email: form.email, phone: form.phone, date: form.date, time: form.time, guests: form.guests, notes: form.notes })
      });
    } catch (e) { console.warn("Email restaurant failed", e); }

    setSuccess(true);
    setForm({ name: "", email: "", phone: "", date: "", time: "", guests: 2, notes: "" });
    setLoading(false);
  };

  const tomorrow = new Date();
  tomorrow.setDate(tomorrow.getDate() + 1);
  const minDate = tomorrow.toISOString().split("T")[0];

  return (
    <div className="min-h-screen bg-white">
      <div className="bg-black text-white py-16 text-center">
        <h1 className="text-4xl font-serif italic mb-2">Réservation</h1>
        <p className="text-gray-400">Réservez votre table en ligne</p>
      </div>

      <div className="max-w-2xl mx-auto px-4 py-16">
        {success ? (
          <div className="text-center py-16">
            <div className="w-16 h-16 bg-green-100 rounded-full flex items-center justify-center mx-auto mb-4">
              <svg className="w-8 h-8 text-green-600" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
              </svg>
            </div>
            <h2 className="text-2xl font-semibold mb-2">Demande envoyée !</h2>
            <p className="text-gray-600 mb-2">Votre demande de réservation a bien été reçue.</p>
            <p className="text-gray-500 text-sm mb-8">Vous recevrez un email de confirmation ou d'annulation dès que notre équipe aura traité votre demande.</p>
            <button onClick={() => setSuccess(false)} className="px-6 py-2 bg-black text-white hover:bg-gray-800 transition-colors">
              Nouvelle réservation
            </button>
          </div>
        ) : (
          <form onSubmit={handleSubmit} className="space-y-6">
            <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Nom complet *</label>
                <input
                  required
                  value={form.name}
                  onChange={e => setForm({ ...form, name: e.target.value })}
                  className="w-full border border-gray-300 px-4 py-3 focus:outline-none focus:border-black transition-colors"
                  placeholder="Votre nom"
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Email *</label>
                <input
                  required
                  type="email"
                  value={form.email}
                  onChange={e => setForm({ ...form, email: e.target.value })}
                  className="w-full border border-gray-300 px-4 py-3 focus:outline-none focus:border-black transition-colors"
                  placeholder="votre@email.com"
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Téléphone *</label>
                <input
                  required
                  value={form.phone}
                  onChange={e => setForm({ ...form, phone: e.target.value })}
                  className="w-full border border-gray-300 px-4 py-3 focus:outline-none focus:border-black transition-colors"
                  placeholder="026 303 45 61"
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Nombre de personnes *</label>
                <select
                  value={form.guests}
                  onChange={e => setForm({ ...form, guests: e.target.value })}
                  className="w-full border border-gray-300 px-4 py-3 focus:outline-none focus:border-black transition-colors bg-white"
                >
                  {[1,2,3,4,5,6,7,8,9,10].map(n => (
                    <option key={n} value={n}>{n} personne{n > 1 ? "s" : ""}</option>
                  ))}
                </select>
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Date *</label>
                <input
                  required
                  type="date"
                  min={minDate}
                  value={form.date}
                  onChange={e => setForm({ ...form, date: e.target.value })}
                  className="w-full border border-gray-300 px-4 py-3 focus:outline-none focus:border-black transition-colors"
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Heure *</label>
                <select
                  required
                  value={form.time}
                  onChange={e => setForm({ ...form, time: e.target.value })}
                  className="w-full border border-gray-300 px-4 py-3 focus:outline-none focus:border-black transition-colors bg-white"
                >
                  <option value="">Choisir une heure</option>
                  {TIMES.map(t => <option key={t} value={t}>{t}</option>)}
                </select>
              </div>
            </div>

            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Notes (optionnel)</label>
              <textarea
                rows={3}
                value={form.notes}
                onChange={e => setForm({ ...form, notes: e.target.value })}
                className="w-full border border-gray-300 px-4 py-3 focus:outline-none focus:border-black transition-colors resize-none"
                placeholder="Allergies, occasion spéciale..."
              />
            </div>

            {error && <p className="text-red-600 text-sm">{error}</p>}

            <button
              type="submit"
              disabled={loading}
              className="w-full py-4 bg-[#b5122a] text-white font-semibold text-lg hover:bg-[#8f0e21] transition-colors disabled:opacity-60"
            >
              {loading ? "Envoi en cours..." : "Confirmer la réservation"}
            </button>
          </form>
        )}
      </div>
    </div>
  );
}