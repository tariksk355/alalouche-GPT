import { useEffect, useMemo, useState } from 'react';
import { backendClient } from '@/api/backendClient';
import { useAuth } from '@/lib/AuthContext';
import { StorefrontNotice } from '@/components/storefront/feedback';

export default function Reservation() {
  const MINIMUM_NOTICE_MINUTES = 30;
  const { user } = useAuth();
  const [form, setForm] = useState({ name: '', email: '', phone: '', date: '', time: '', guests: 2, notes: '' });
  const [loading, setLoading] = useState(false);
  const [success, setSuccess] = useState(false);
  const [error, setError] = useState('');

  useEffect(() => {
    if (!user) return;
    setForm((prev) => ({
      ...prev,
      name: user.fullName || prev.name,
      email: user.email || prev.email,
      phone: user.phone || prev.phone,
    }));
  }, [user]);

  const TIMES = ['11:30', '12:00', '12:30', '13:00', '13:30', '18:00', '18:30', '19:00', '19:30', '20:00', '20:30', '21:00'];

  const toLocalDateInputValue = (date = new Date()) => {
    const year = date.getFullYear();
    const month = String(date.getMonth() + 1).padStart(2, '0');
    const day = String(date.getDate()).padStart(2, '0');
    return `${year}-${month}-${day}`;
  };

  const minDate = useMemo(() => toLocalDateInputValue(new Date()), []);

  useEffect(() => {
    console.debug('[storefront-reservation] reservation_same_day_enabled true');
  }, []);

  useEffect(() => {
    if (!form.date) return;
    console.debug(`[storefront-reservation] reservation_date_selected value=${form.date}`);
  }, [form.date]);

  const availableTimes = useMemo(() => {
    if (!form.date) {
      return TIMES;
    }

    const now = new Date();
    const nowWithNotice = new Date(now.getTime() + MINIMUM_NOTICE_MINUTES * 60 * 1000);
    const todayLocal = toLocalDateInputValue(now);
    const isSameDay = form.date === todayLocal;

    const filtered = TIMES.filter((slot) => {
      if (!isSameDay) {
        console.debug(`[storefront-reservation] reservation_time_slot_filtered slot=${slot} reason=valid`);
        return true;
      }

      const [hours, minutes] = slot.split(':').map(Number);
      const slotDate = new Date(now);
      slotDate.setHours(hours, minutes, 0, 0);

      const pastTime = slotDate.getTime() <= now.getTime();
      if (pastTime) {
        console.debug(`[storefront-reservation] reservation_time_slot_filtered slot=${slot} reason=past_time`);
        return false;
      }

      const respectsNotice = slotDate.getTime() >= nowWithNotice.getTime();
      if (!respectsNotice) {
        console.debug(`[storefront-reservation] reservation_time_slot_filtered slot=${slot} reason=minimum_notice`);
        return false;
      }

      console.debug(`[storefront-reservation] reservation_time_slot_filtered slot=${slot} reason=valid`);
      return true;
    });

    console.debug(`[storefront-reservation] reservation_available_slots_count date=${form.date} count=${filtered.length}`);
    return filtered;
  }, [form.date]);

  useEffect(() => {
    if (!form.time) return;
    if (availableTimes.includes(form.time)) return;
    setForm((prev) => ({ ...prev, time: '' }));
  }, [availableTimes, form.time]);

  const handleSubmit = async (e) => {
    e.preventDefault();
    setLoading(true);
    setError('');

    try {
      await backendClient.request('/reservations', {
        method: 'POST',
        body: JSON.stringify({
          name: form.name,
          email: form.email,
          phone: form.phone,
          date: form.date,
          time: form.time,
          guests: Number(form.guests),
          notes: form.notes,
        }),
      });

      setSuccess(true);
      setForm({ name: '', email: '', phone: '', date: '', time: '', guests: 2, notes: '' });
    } catch (submitError) {
      setError(submitError.message || "La réservation n'a pas pu être envoyée.");
    } finally {
      setLoading(false);
    }
  };

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
            <StorefrontNotice type="info">
              Votre demande est gratuite et sans engagement. Nous vous confirmerons rapidement par email.
            </StorefrontNotice>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Nom complet *</label>
                <input
                  required
                  value={form.name}
                  onChange={(e) => setForm({ ...form, name: e.target.value })}
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
                  onChange={(e) => setForm({ ...form, email: e.target.value })}
                  className="w-full border border-gray-300 px-4 py-3 focus:outline-none focus:border-black transition-colors"
                  placeholder="votre@email.com"
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Téléphone *</label>
                <input
                  required
                  value={form.phone}
                  onChange={(e) => setForm({ ...form, phone: e.target.value })}
                  className="w-full border border-gray-300 px-4 py-3 focus:outline-none focus:border-black transition-colors"
                  placeholder="026 303 45 61"
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Nombre de personnes *</label>
                <select
                  value={form.guests}
                  onChange={(e) => setForm({ ...form, guests: Number(e.target.value) })}
                  className="w-full border border-gray-300 px-4 py-3 focus:outline-none focus:border-black transition-colors bg-white"
                >
                  {[1, 2, 3, 4, 5, 6, 7, 8, 9, 10].map((n) => (
                    <option key={n} value={n}>
                      {n} personne{n > 1 ? 's' : ''}
                    </option>
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
                  onChange={(e) => setForm({ ...form, date: e.target.value })}
                  className="w-full border border-gray-300 px-4 py-3 focus:outline-none focus:border-black transition-colors"
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Heure *</label>
                <select
                  required
                  value={form.time}
                  onChange={(e) => setForm({ ...form, time: e.target.value })}
                  className="w-full border border-gray-300 px-4 py-3 focus:outline-none focus:border-black transition-colors bg-white"
                >
                  <option value="">Choisir une heure</option>
                  {availableTimes.map((t) => (
                    <option key={t} value={t}>
                      {t}
                    </option>
                  ))}
                </select>
              </div>
            </div>

            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Notes (optionnel)</label>
              <textarea
                rows={3}
                value={form.notes}
                onChange={(e) => setForm({ ...form, notes: e.target.value })}
                className="w-full border border-gray-300 px-4 py-3 focus:outline-none focus:border-black transition-colors resize-none"
                placeholder="Allergies, occasion spéciale..."
              />
            </div>

            {error && <StorefrontNotice type="error">{error}</StorefrontNotice>}

            <button
              type="submit"
              disabled={loading}
              className="w-full py-4 rounded-lg bg-[#b5122a] text-white font-semibold text-lg hover:bg-[#8f0e21] transition-colors disabled:opacity-60"
            >
              {loading ? 'Envoi en cours...' : 'Confirmer la réservation'}
            </button>
          </form>
        )}
      </div>
    </div>
  );
}
