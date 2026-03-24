import { useEffect, useMemo, useState } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { createPageUrl } from '@/utils';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { StorefrontNotice } from '@/components/storefront/feedback';
import { useAuth } from '@/lib/AuthContext';
import {
  clearStoredCustomerSession,
  deleteCustomerMe,
  getStoredCustomerSession,
  loginCustomer,
  requestCustomerPasswordReset,
  resetCustomerPassword,
  signupCustomer,
  updateCustomerMe,
  verifyCustomerEmail,
} from '@/lib/customerAuth';

export default function Account() {
  const navigate = useNavigate();
  const [searchParams, setSearchParams] = useSearchParams();
  const { user, isAuthenticated, refreshSession, logout } = useAuth();

  const [loginForm, setLoginForm] = useState({ email: '', password: '' });
  const [signupForm, setSignupForm] = useState({ fullName: '', email: '', phone: '', password: '', subscribedEmail: false });
  const [forgotPasswordForm, setForgotPasswordForm] = useState({ email: '' });
  const [resetPasswordForm, setResetPasswordForm] = useState({ password: '', confirmPassword: '' });
  const [showForgotPassword, setShowForgotPassword] = useState(false);
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);
  const [forgotPasswordLoading, setForgotPasswordLoading] = useState(false);
  const [forgotPasswordNotice, setForgotPasswordNotice] = useState('');
  const [resetPasswordLoading, setResetPasswordLoading] = useState(false);
  const [resetPasswordNotice, setResetPasswordNotice] = useState('');
  const [resetPasswordError, setResetPasswordError] = useState('');
  const [profileForm, setProfileForm] = useState({
    fullName: '',
    phone: '',
    addressLine1: '',
    addressLine2: '',
    postalCode: '',
    city: '',
    deliveryInstructions: '',
  });
  const [savingProfile, setSavingProfile] = useState(false);
  const [profileSuccess, setProfileSuccess] = useState('');
  const [verificationNotice, setVerificationNotice] = useState('');
  const [verificationError, setVerificationError] = useState('');
  const [verifyingEmail, setVerifyingEmail] = useState(false);
  const [deletingAccount, setDeletingAccount] = useState(false);
  const verificationToken = searchParams.get('verifyEmailToken');
  const resetPasswordToken = searchParams.get('resetPasswordToken');
  const hasVerificationToken = Boolean(verificationToken);
  const hasResetPasswordToken = Boolean(resetPasswordToken);
  const emailVerified = user?.emailVerified === true;
  const emailVerifiedAtLabel = useMemo(() => {
    if (!user?.emailVerifiedAt) return null;
    const date = new Date(user.emailVerifiedAt);
    if (Number.isNaN(date.getTime())) return null;
    return new Intl.DateTimeFormat('fr-CH', { dateStyle: 'medium', timeStyle: 'short' }).format(date);
  }, [user?.emailVerifiedAt]);

  useEffect(() => {
    if (!verificationToken) return;

    let cancelled = false;

    async function runVerification() {
      setVerifyingEmail(true);
      setVerificationError('');
      setVerificationNotice('');

      try {
        const result = await verifyCustomerEmail(verificationToken);
        if (cancelled) return;

        await refreshSession();
        setVerificationNotice(
          result.alreadyVerified
            ? 'Votre adresse email était déjà vérifiée.'
            : 'Votre adresse email a bien été vérifiée.',
        );

        const nextParams = new URLSearchParams(searchParams);
        nextParams.delete('verifyEmailToken');
        setSearchParams(nextParams, { replace: true });
      } catch (err) {
        if (!cancelled) {
          setVerificationError(err.message || 'Impossible de vérifier cette adresse email.');
        }
      } finally {
        if (!cancelled) {
          setVerifyingEmail(false);
        }
      }
    }

    runVerification();

    return () => {
      cancelled = true;
    };
  }, [refreshSession, searchParams, setSearchParams, verificationToken]);

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
      setVerificationNotice('Compte créé. Vérifiez maintenant votre email via le lien envoyé avant votre prochaine connexion.');
      navigate(createPageUrl('Account'));
    } catch (err) {
      setError(err.message || 'Inscription impossible.');
    } finally {
      setLoading(false);
    }
  };

  const handleForgotPassword = async (e) => {
    e.preventDefault();
    setForgotPasswordLoading(true);
    setForgotPasswordNotice('');
    setError('');

    try {
      const result = await requestCustomerPasswordReset(forgotPasswordForm);
      setForgotPasswordNotice(result.message || 'Si un compte existe avec cette adresse, un email de réinitialisation a été envoyé.');
    } catch (err) {
      setError(err.message || 'Impossible de lancer la réinitialisation.');
    } finally {
      setForgotPasswordLoading(false);
    }
  };

  const handleResetPassword = async (e) => {
    e.preventDefault();
    setResetPasswordError('');
    setResetPasswordNotice('');

    if (!resetPasswordToken) {
      setResetPasswordError('Lien de réinitialisation invalide.');
      return;
    }

    if (resetPasswordForm.password !== resetPasswordForm.confirmPassword) {
      setResetPasswordError('Les mots de passe ne correspondent pas.');
      return;
    }

    setResetPasswordLoading(true);
    try {
      const result = await resetCustomerPassword({
        token: resetPasswordToken,
        password: resetPasswordForm.password,
      });
      setResetPasswordNotice(result.message || 'Votre mot de passe a été réinitialisé.');
      setResetPasswordForm({ password: '', confirmPassword: '' });
      const nextParams = new URLSearchParams(searchParams);
      nextParams.delete('resetPasswordToken');
      setSearchParams(nextParams, { replace: true });
    } catch (err) {
      setResetPasswordError(err.message || 'Impossible de réinitialiser le mot de passe.');
    } finally {
      setResetPasswordLoading(false);
    }
  };

  if (hasResetPasswordToken) {
    return (
      <div className="min-h-screen bg-gray-50 p-4">
        <div className="max-w-xl mx-auto pt-10">
          <Card className="p-6 space-y-4">
            <h1 className="text-2xl font-semibold">Réinitialiser mon mot de passe</h1>
            <p className="text-sm text-gray-500">Choisissez un nouveau mot de passe pour votre compte client.</p>
            {resetPasswordNotice && <StorefrontNotice type="success">{resetPasswordNotice}</StorefrontNotice>}
            {resetPasswordError && <StorefrontNotice type="error">{resetPasswordError}</StorefrontNotice>}
            <form onSubmit={handleResetPassword} className="space-y-3">
              <Input
                placeholder="Nouveau mot de passe (6 caractères min)"
                type="password"
                required
                minLength={6}
                value={resetPasswordForm.password}
                onChange={(e) => setResetPasswordForm((prev) => ({ ...prev, password: e.target.value }))}
              />
              <Input
                placeholder="Confirmer le nouveau mot de passe"
                type="password"
                required
                minLength={6}
                value={resetPasswordForm.confirmPassword}
                onChange={(e) => setResetPasswordForm((prev) => ({ ...prev, confirmPassword: e.target.value }))}
              />
              <Button type="submit" disabled={resetPasswordLoading} className="w-full">
                {resetPasswordLoading ? 'Réinitialisation en cours...' : 'Enregistrer le nouveau mot de passe'}
              </Button>
            </form>
            <Button type="button" variant="outline" onClick={() => navigate(createPageUrl('Account'))}>
              Retour à la connexion
            </Button>
          </Card>
        </div>
      </div>
    );
  }

  if (isAuthenticated && user) {
    const effectiveProfile = {
      fullName: profileForm.fullName || user.fullName || '',
      phone: profileForm.phone || user.phone || '',
      addressLine1: profileForm.addressLine1 || user.addressLine1 || '',
      addressLine2: profileForm.addressLine2 || user.addressLine2 || '',
      postalCode: profileForm.postalCode || user.postalCode || '',
      city: profileForm.city || user.city || '',
      deliveryInstructions: profileForm.deliveryInstructions || user.deliveryInstructions || '',
    };

    const handleProfileSave = async (e) => {
      e.preventDefault();
      setError('');
      setProfileSuccess('');
      setSavingProfile(true);

      try {
        const session = getStoredCustomerSession();
        if (!session?.token) throw new Error('Connexion expirée.');

        await updateCustomerMe(session.token, {
          fullName: effectiveProfile.fullName,
          phone: effectiveProfile.phone,
          addressLine1: effectiveProfile.addressLine1,
          addressLine2: effectiveProfile.addressLine2,
          postalCode: effectiveProfile.postalCode,
          city: effectiveProfile.city,
          deliveryInstructions: effectiveProfile.deliveryInstructions,
        });
        await refreshSession();
        setProfileSuccess('Profil mis à jour avec succès.');
        setTimeout(() => setProfileSuccess(''), 3000);
      } catch (err) {
        setError(err.message || 'Mise à jour impossible.');
      } finally {
        setSavingProfile(false);
      }
    };

    const handleDeleteAccount = async () => {
      if (deletingAccount) return;
      const session = getStoredCustomerSession();
      if (!session?.token) {
        setError('Connexion expirée.');
        return;
      }

      const confirmed = window.confirm('Confirmez-vous la suppression de votre compte ? Cette action désactive votre accès et anonymise vos données de profil.');
      if (!confirmed) return;

      setDeletingAccount(true);
      setError('');
      setProfileSuccess('');

      try {
        await deleteCustomerMe(session.token);
        clearStoredCustomerSession();
        logout();
        navigate(createPageUrl('Account'));
        setVerificationNotice('Votre compte a été supprimé. Vos commandes existantes restent conservées pour l’historique opérationnel.');
      } catch (err) {
        setError(err.message || 'Suppression du compte impossible.');
      } finally {
        setDeletingAccount(false);
      }
    };

    return (
      <div className="min-h-screen bg-gray-50 p-4">
        <div className="max-w-xl mx-auto pt-10">
          <Card className="p-6 space-y-4">
            <h1 className="text-2xl font-semibold">Mon compte</h1>
            <p className="text-sm text-gray-600">Connecté en tant que {user.fullName}</p>
            {verificationNotice && <StorefrontNotice type="success">{verificationNotice}</StorefrontNotice>}
            {verificationError && <StorefrontNotice type="error">{verificationError}</StorefrontNotice>}
            {profileSuccess && <StorefrontNotice type="success">{profileSuccess}</StorefrontNotice>}
            {error && <StorefrontNotice type="error">{error}</StorefrontNotice>}
            <div className="space-y-2 text-sm">
              <p>
                <strong>Email:</strong> {user.email}
              </p>
              <p>
                <strong>Téléphone:</strong> {user.phone || 'Non renseigné'}
              </p>
              <p>
                <strong>Email vérifié:</strong> {emailVerified ? `Oui${emailVerifiedAtLabel ? ` · ${emailVerifiedAtLabel}` : ''}` : 'Non'}
              </p>
            </div>

            {!emailVerified && (
              <StorefrontNotice type="info">
                Votre adresse email n’est pas encore vérifiée. Utilisez le lien reçu par email pour confirmer votre compte.
              </StorefrontNotice>
            )}

            <form onSubmit={handleProfileSave} className="space-y-3 border-t border-gray-200 pt-4">
              <p className="text-sm font-medium">Mettre à jour mes informations</p>
              <Input
                placeholder="Nom complet"
                value={effectiveProfile.fullName}
                onChange={(e) => setProfileForm((prev) => ({ ...prev, fullName: e.target.value }))}
                required
              />
              <Input
                placeholder="Téléphone"
                value={effectiveProfile.phone}
                onChange={(e) => setProfileForm((prev) => ({ ...prev, phone: e.target.value }))}
              />

              <p className="text-sm font-medium pt-2">Adresse de livraison sauvegardée</p>
              <Input
                placeholder="Adresse ligne 1"
                value={effectiveProfile.addressLine1}
                onChange={(e) => setProfileForm((prev) => ({ ...prev, addressLine1: e.target.value }))}
              />
              <Input
                placeholder="Adresse ligne 2 (optionnel)"
                value={effectiveProfile.addressLine2}
                onChange={(e) => setProfileForm((prev) => ({ ...prev, addressLine2: e.target.value }))}
              />
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <Input
                  placeholder="Code postal"
                  value={effectiveProfile.postalCode}
                  onChange={(e) => setProfileForm((prev) => ({ ...prev, postalCode: e.target.value }))}
                />
                <Input
                  placeholder="Ville"
                  value={effectiveProfile.city}
                  onChange={(e) => setProfileForm((prev) => ({ ...prev, city: e.target.value }))}
                />
              </div>
              <Input
                placeholder="Instructions de livraison (optionnel)"
                value={effectiveProfile.deliveryInstructions}
                onChange={(e) => setProfileForm((prev) => ({ ...prev, deliveryInstructions: e.target.value }))}
              />
              <Button type="submit" disabled={savingProfile}>
                {savingProfile ? 'Enregistrement...' : 'Enregistrer'}
              </Button>
            </form>

            <div className="flex flex-col sm:flex-row gap-2">
              <Button onClick={() => navigate(createPageUrl('MesCommandes'))}>Mes commandes</Button>
              <Button variant="outline" onClick={logout}>
                Déconnexion
              </Button>
            </div>

            <div className="border-t border-red-100 pt-4 space-y-3">
              <div>
                <p className="text-sm font-semibold text-red-700">Supprimer mon compte</p>
                <p className="text-sm text-gray-600">
                  Cette action désactive votre accès client et anonymise vos données de profil. Les commandes existantes sont conservées pour ne pas casser l’historique opérationnel.
                </p>
              </div>
              <Button type="button" variant="outline" onClick={handleDeleteAccount} disabled={deletingAccount} className="border-red-200 text-red-700 hover:bg-red-50 hover:text-red-800">
                {deletingAccount ? 'Suppression en cours...' : 'Supprimer mon compte'}
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
          <p className="text-sm text-gray-500 mb-4">Connectez-vous pour suivre vos commandes et gagner du temps lors des prochains achats.</p>
          {verifyingEmail && <StorefrontNotice className="mb-4">Vérification de votre adresse email en cours...</StorefrontNotice>}
          {verificationNotice && <StorefrontNotice type="success" className="mb-4">{verificationNotice}</StorefrontNotice>}
          {verificationError && <StorefrontNotice type="error" className="mb-4">{verificationError}</StorefrontNotice>}
          {forgotPasswordNotice && <StorefrontNotice type="success" className="mb-4">{forgotPasswordNotice}</StorefrontNotice>}
          {resetPasswordNotice && <StorefrontNotice type="success" className="mb-4">{resetPasswordNotice}</StorefrontNotice>}
          {hasVerificationToken && !verifyingEmail && !verificationError && !verificationNotice && (
            <StorefrontNotice className="mb-4">Traitement du lien de vérification…</StorefrontNotice>
          )}
          {error && <StorefrontNotice type="error" className="mb-4">{error}</StorefrontNotice>}

          <Tabs defaultValue="login">
            <TabsList className="grid grid-cols-2 mb-4">
              <TabsTrigger value="login">Connexion</TabsTrigger>
              <TabsTrigger value="signup">Inscription</TabsTrigger>
            </TabsList>

            <TabsContent value="login">
              {showForgotPassword ? (
                <form onSubmit={handleForgotPassword} className="space-y-3">
                  <p className="text-sm text-gray-600">Saisissez votre adresse email. Si un compte existe, nous vous enverrons un lien de réinitialisation.</p>
                  <Input
                    placeholder="Email"
                    type="email"
                    required
                    value={forgotPasswordForm.email}
                    onChange={(e) => setForgotPasswordForm({ email: e.target.value })}
                  />
                  <Button type="submit" disabled={forgotPasswordLoading} className="w-full">
                    {forgotPasswordLoading ? 'Envoi en cours...' : 'Envoyer le lien de réinitialisation'}
                  </Button>
                  <Button type="button" variant="outline" onClick={() => setShowForgotPassword(false)} className="w-full">
                    Retour à la connexion
                  </Button>
                </form>
              ) : (
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
                  <div className="flex justify-end">
                    <button type="button" onClick={() => { setShowForgotPassword(true); setForgotPasswordNotice(''); setError(''); }} className="text-sm font-medium text-[#b5122a] hover:text-[#8f0e21] transition-colors">
                      Mot de passe oublié ?
                    </button>
                  </div>
                  <Button type="submit" disabled={loading} className="w-full">
                    {loading ? 'Connexion en cours...' : 'Se connecter'}
                  </Button>
                </form>
              )}
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
                <label className="flex items-start gap-3 rounded-lg border border-gray-200 bg-gray-50 px-4 py-3">
                  <input
                    type="checkbox"
                    checked={signupForm.subscribedEmail}
                    onChange={(e) => setSignupForm({ ...signupForm, subscribedEmail: e.target.checked })}
                    className="mt-1 h-4 w-4 rounded border-gray-300 text-[#b5122a] focus:ring-[#b5122a]"
                  />
                  <div className="text-sm">
                    <div className="font-medium text-gray-900">Je souhaite recevoir les offres et actualités par email</div>
                    <div className="text-gray-500">Optionnel. Vous pouvez laisser cette case décochée et créer votre compte normalement.</div>
                  </div>
                </label>
                <Button type="submit" disabled={loading} className="w-full">
                  {loading ? 'Création du compte...' : 'Créer mon compte'}
                </Button>
              </form>
            </TabsContent>
          </Tabs>
        </Card>
      </div>
    </div>
  );
}
