import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { createPageUrl } from '@/utils';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { useAuth } from '@/lib/AuthContext';
import { loginCustomer, signupCustomer } from '@/lib/customerAuth';

export default function Account() {
  const navigate = useNavigate();
  const { user, isAuthenticated, refreshSession, logout } = useAuth();

  const [loginForm, setLoginForm] = useState({ email: '', password: '' });
  const [signupForm, setSignupForm] = useState({ fullName: '', email: '', phone: '', password: '' });
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);

  const handleLogin = async (e) => {
    e.preventDefault();
    setError('');
    setLoading(true);
    try {
      await loginCustomer(loginForm);
      await refreshSession();
      navigate(createPageUrl('Home'));
    } catch (err) {
      setError(err.message || 'Connexion impossible.');
    } finally {
      setLoading(false);
    }
  };

  const handleSignup = async (e) => {
    e.preventDefault();
    setError('');
    setLoading(true);
    try {
      await signupCustomer(signupForm);
      await refreshSession();
      navigate(createPageUrl('Home'));
    } catch (err) {
      setError(err.message || 'Inscription impossible.');
    } finally {
      setLoading(false);
    }
  };

  if (isAuthenticated && user) {
    return (
      <div className="min-h-screen bg-gray-50 p-4">
        <div className="max-w-xl mx-auto pt-10">
          <Card className="p-6 space-y-4">
            <h1 className="text-2xl font-semibold">Mon compte</h1>
            <p className="text-sm text-gray-600">Connecté en tant que {user.fullName}</p>
            <div className="space-y-2 text-sm">
              <p>
                <strong>Email:</strong> {user.email}
              </p>
              <p>
                <strong>Téléphone:</strong> {user.phone || 'Non renseigné'}
              </p>
            </div>
            <div className="flex gap-2">
              <Button onClick={() => navigate(createPageUrl('MesCommandes'))}>Mes commandes</Button>
              <Button variant="outline" onClick={logout}>
                Déconnexion
              </Button>
            </div>
          </Card>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gray-50 p-4">
      <div className="max-w-xl mx-auto pt-10">
        <Card className="p-6">
          <h1 className="text-2xl font-semibold mb-4">Connexion / Inscription</h1>
          {error && <p className="text-sm text-red-600 mb-4">{error}</p>}

          <Tabs defaultValue="login">
            <TabsList className="grid grid-cols-2 mb-4">
              <TabsTrigger value="login">Connexion</TabsTrigger>
              <TabsTrigger value="signup">Inscription</TabsTrigger>
            </TabsList>

            <TabsContent value="login">
              <form onSubmit={handleLogin} className="space-y-3">
                <Input
                  placeholder="Email"
                  type="email"
                  required
                  value={loginForm.email}
                  onChange={(e) => setLoginForm({ ...loginForm, email: e.target.value })}
                />
                <Input
                  placeholder="Mot de passe"
                  type="password"
                  required
                  value={loginForm.password}
                  onChange={(e) => setLoginForm({ ...loginForm, password: e.target.value })}
                />
                <Button type="submit" disabled={loading} className="w-full">
                  {loading ? 'Connexion...' : 'Se connecter'}
                </Button>
              </form>
            </TabsContent>

            <TabsContent value="signup">
              <form onSubmit={handleSignup} className="space-y-3">
                <Input
                  placeholder="Nom complet"
                  required
                  value={signupForm.fullName}
                  onChange={(e) => setSignupForm({ ...signupForm, fullName: e.target.value })}
                />
                <Input
                  placeholder="Email"
                  type="email"
                  required
                  value={signupForm.email}
                  onChange={(e) => setSignupForm({ ...signupForm, email: e.target.value })}
                />
                <Input
                  placeholder="Téléphone (optionnel)"
                  value={signupForm.phone}
                  onChange={(e) => setSignupForm({ ...signupForm, phone: e.target.value })}
                />
                <Input
                  placeholder="Mot de passe (6 caractères min)"
                  type="password"
                  required
                  minLength={6}
                  value={signupForm.password}
                  onChange={(e) => setSignupForm({ ...signupForm, password: e.target.value })}
                />
                <Button type="submit" disabled={loading} className="w-full">
                  {loading ? 'Création...' : "Créer mon compte"}
                </Button>
              </form>
            </TabsContent>
          </Tabs>
        </Card>
      </div>
    </div>
  );
}