import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';

export default function PrivacyPolicyModal({ open, onClose, tenant }) {
  const brandName = tenant?.name || 'notre restaurant';
  const website = typeof window !== 'undefined' ? window.location.origin : 'https://example.com';
  const contactEmail = tenant?.contactInfo?.email || 'contact@example.com';
  const contactPhone = tenant?.contactInfo?.phone || 'N/A';

  return (
    <Dialog open={open} onOpenChange={onClose}>
      <DialogContent className="max-w-3xl max-h-[80vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="text-xl font-serif">Politique de confidentialité pour {brandName}</DialogTitle>
        </DialogHeader>
        <div className="text-sm text-gray-700 space-y-4 leading-relaxed">
          <p>
            Chez {brandName}, accessible depuis{' '}
            <a href={website} className="text-[#b5122a] hover:underline">
              {website}
            </a>
            , l'une de nos principales priorités est la confidentialité de nos visiteurs.
          </p>
          <p>Si vous avez des questions supplémentaires ou avez besoin de plus d'informations sur notre politique de confidentialité, n'hésitez pas à nous contacter.</p>
          <p>
            Cette politique de confidentialité s'applique uniquement à nos activités en ligne et est valable pour les visiteurs de notre site Web en ce qui concerne les
            informations qu'ils ont partagées et/ou collectées sur{' '}
            <a href={website} className="text-[#b5122a] hover:underline">
              {website}
            </a>
            .
          </p>

          <h2 className="font-semibold text-gray-900 text-base">Consentement</h2>
          <p>En utilisant notre site Web, vous consentez par la présente à notre politique de confidentialité et acceptez ses conditions.</p>

          <h2 className="font-semibold text-gray-900 text-base">Informations que nous collectons</h2>
          <p>Les informations personnelles demandées vous seront clairement indiquées au moment de la collecte.</p>

          <h2 className="font-semibold text-gray-900 text-base">Comment nous utilisons vos informations</h2>
          <ul className="list-disc list-inside space-y-1 ml-2">
            <li>Fournir, exploiter et entretenir notre site Web</li>
            <li>Améliorer, personnaliser et développer notre site Web</li>
            <li>Détecter et prévenir la fraude</li>
          </ul>

          <h2 className="font-semibold text-gray-900 text-base">Fichiers journaux</h2>
          <p>{brandName} suit une procédure standard d'utilisation des fichiers journaux pour l'exploitation du service.</p>

          <h2 className="font-semibold text-gray-900 text-base">Cookies et balises Web</h2>
          <p>Comme tout autre site Internet, notre plateforme utilise des cookies pour améliorer l'expérience utilisateur.</p>

          <h2 className="font-semibold text-gray-900 text-base">Droits de protection des données RGPD</h2>
          <p>Vous pouvez demander l'accès, la rectification, l'effacement, la limitation, l'opposition et la portabilité de vos données selon la réglementation applicable.</p>

          <h2 className="font-semibold text-gray-900 text-base">Informations pour les enfants</h2>
          <p>
            Si vous pensez qu'un enfant nous a fourni des informations personnelles via{' '}
            <a href={website} className="text-[#b5122a] hover:underline">
              {website}
            </a>
            , contactez-nous pour suppression rapide.
          </p>

          <h2 className="font-semibold text-gray-900 text-base">Contactez-nous</h2>
          <p>
            Email: {contactEmail}
            <br />
            Téléphone: {contactPhone}
          </p>
        </div>
      </DialogContent>
    </Dialog>
  );
}
