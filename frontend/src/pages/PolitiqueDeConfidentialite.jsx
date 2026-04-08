export default function PolitiqueDeConfidentialite() {
  const website = 'https://www.alalouche.ch';
  const contactEmail = 'info@alalouche.ch';
  const contactPhone = '026 303 45 61';

  return (
    <section className="mx-auto w-full max-w-4xl px-4 py-10 sm:px-6">
      <div className="rounded-2xl border border-gray-200 bg-white p-6 shadow-sm sm:p-8">
        <h1 className="text-2xl font-serif text-gray-900 sm:text-3xl">Politique de confidentialité</h1>

        <div className="mt-6 space-y-4 text-sm leading-relaxed text-gray-700 sm:text-base">
          <p>
            Chez À la Louche, accessible depuis{' '}
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

          <h2 className="pt-1 text-base font-semibold text-gray-900">Consentement</h2>
          <p>En utilisant notre site Web, vous consentez par la présente à notre politique de confidentialité et acceptez ses conditions.</p>

          <h2 className="pt-1 text-base font-semibold text-gray-900">Informations que nous collectons</h2>
          <p>Les informations personnelles demandées vous seront clairement indiquées au moment de la collecte.</p>

          <h2 className="pt-1 text-base font-semibold text-gray-900">Comment nous utilisons vos informations</h2>
          <ul className="ml-4 list-disc space-y-1">
            <li>Fournir, exploiter et entretenir notre site Web</li>
            <li>Améliorer, personnaliser et développer notre site Web</li>
            <li>Détecter et prévenir la fraude</li>
          </ul>

          <h2 className="pt-1 text-base font-semibold text-gray-900">Fichiers journaux</h2>
          <p>À la Louche suit une procédure standard d'utilisation des fichiers journaux pour l'exploitation du service.</p>

          <h2 className="pt-1 text-base font-semibold text-gray-900">Cookies et balises Web</h2>
          <p>Comme tout autre site Internet, notre plateforme utilise des cookies pour améliorer l'expérience utilisateur.</p>

          <h2 className="pt-1 text-base font-semibold text-gray-900">Droits de protection des données RGPD</h2>
          <p>Vous pouvez demander l'accès, la rectification, l'effacement, la limitation, l'opposition et la portabilité de vos données selon la réglementation applicable.</p>

          <h2 className="pt-1 text-base font-semibold text-gray-900">Informations pour les enfants</h2>
          <p>
            Si vous pensez qu'un enfant nous a fourni des informations personnelles via{' '}
            <a href={website} className="text-[#b5122a] hover:underline">
              {website}
            </a>
            , contactez-nous pour suppression rapide.
          </p>

          <h2 className="pt-1 text-base font-semibold text-gray-900">Contactez-nous</h2>
          <p>
            Email: {contactEmail}
            <br />
            Téléphone: {contactPhone}
          </p>
        </div>
      </div>
    </section>
  );
}
