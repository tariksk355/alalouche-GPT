import { useState } from 'react';
import { createPageUrl } from '@/utils';
import { backendClient } from '@/api/backendClient';
import { setStoredAdminSession } from '@/lib/customerAuth';
import { useTenant } from '@/lib/TenantContext';

const DEFAULT_LOGO =
  'https://qtrypzzcjebvfcihiynt.supabase.co/storage/v1/object/public/base44-prod/public/user_6988e8d4fc295c9d940c5901/05562fbc0_Alalouche-logo.png';

export default function AdminLogin() {
  const { tenant } = useTenant();
  const [form, setForm] = useState({ username: '', password: '' });
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);

  const brandName = tenant?.name || 'Restaurant';
  const logoUrl = tenant?.branding?.logoUrl || DEFAULT_LOGO;
  const city = tenant?.contactInfo?.city || '';
  const subtitle = city ? `${brandName} — ${city}` : brandName;

  const handleSubmit = async (e) => {
    e.preventDefault();
    setLoading(true);
    setError('');
    try {
      const resp = await backendClient.request('/admin/auth/login', {
        method: 'POST',
        body: JSON.stringify({ username: form.username, password: form.password }),
      });

      setStoredAdminSession(resp.data);
      window.location.href = createPageUrl('AdminDashboard');
    } catch (err) {
      setError(err.message || 'Identifiants incorrects.');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen bg-gray-50 flex items-center justify-center px-4">
      <div className="w-full max-w-sm">
        <div className="text-center mb-8">
          <img src={logoUrl} alt={brandName} className="w-24 mx-auto mb-4" />
          <h1 className="text-gray-900 text-2xl font-semibold">Espace Administration</h1>
          <p className="text-gray-500 text-sm mt-1">{subtitle}</p>
        </div>

        <form onSubmit={handleSubmit} className="bg-white rounded-xl p-8 space-y-5 border border-gray-200 shadow-sm">
          <div>
            <label className="block text-sm font-medium text-gray-600 mb-1">Nom d'utilisateur</label>
            <input
              required
              value={form.username}
              onChange={(e) => setForm({ ...form, username: e.target.value })}
              className="w-full bg-gray-50 border border-gray-200 text-gray-900 px-4 py-3 rounded-lg focus:outline-none focus:border-gray-400 transition-colors"
              placeholder="admin"
              autoComplete="username"
            />
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-600 mb-1">Mot de passe</label>
            <input
              required
              type="password"
              value={form.password}
              onChange={(e) => setForm({ ...form, password: e.target.value })}
              className="w-full bg-gray-50 border border-gray-200 text-gray-900 px-4 py-3 rounded-lg focus:outline-none focus:border-gray-400 transition-colors"
              placeholder="••••••••"
              autoComplete="current-password"
            />
          </div>

          {error && <div className="bg-red-50 border border-red-200 text-red-600 px-4 py-3 rounded-lg text-sm">{error}</div>}

          <button type="submit" disabled={loading} className="w-full py-3 bg-[#b5122a] text-white font-semibold rounded-lg hover:bg-[#8f0e21] transition-colors disabled:opacity-60">
            {loading ? 'Connexion...' : 'Se connecter'}
          </button>
        </form>
      </div>
    </div>
  );
}
