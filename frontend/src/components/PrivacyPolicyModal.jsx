import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";

export default function PrivacyPolicyModal({ open, onClose }) {
  return (
    <Dialog open={open} onOpenChange={onClose}>
      <DialogContent className="max-w-3xl max-h-[80vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="text-xl font-serif">Politique de confidentialité pour À la louche</DialogTitle>
        </DialogHeader>
        <div className="text-sm text-gray-700 space-y-4 leading-relaxed">
          <p>Chez À la louche, accessible depuis <a href="https://alalouche.ch/" className="text-[#b5122a] hover:underline">https://alalouche.ch/</a>, l'une de nos principales priorités est la confidentialité de nos visiteurs. Ce document de politique de confidentialité contient les types d'informations collectées et enregistrées par <a href="https://alalouche.ch/" className="text-[#b5122a] hover:underline">https://alalouche.ch/</a> et la manière dont nous les utilisons.</p>
          <p>Si vous avez des questions supplémentaires ou avez besoin de plus d'informations sur notre politique de confidentialité, n'hésitez pas à nous contacter.</p>
          <p>Cette politique de confidentialité s'applique uniquement à nos activités en ligne et est valable pour les visiteurs de notre site Web en ce qui concerne les informations qu'ils ont partagées et/ou collectées sur <a href="https://alalouche.ch/" className="text-[#b5122a] hover:underline">https://alalouche.ch/</a>. Cette politique ne s'applique pas aux informations collectées hors ligne ou via des canaux autres que ce site Web.</p>

          <h2 className="font-semibold text-gray-900 text-base">Consentement</h2>
          <p>En utilisant notre site Web, vous consentez par la présente à notre politique de confidentialité et acceptez ses conditions.</p>

          <h2 className="font-semibold text-gray-900 text-base">Informations que nous collectons</h2>
          <p>Les informations personnelles que vous êtes invité à fournir, et les raisons pour lesquelles il vous est demandé de les fournir, vous seront clairement indiquées au moment où nous vous demanderons de fournir vos informations personnelles.</p>
          <p>Si vous nous contactez directement, nous pouvons recevoir des informations supplémentaires vous concernant, telles que votre nom, votre adresse e-mail, votre numéro de téléphone, le contenu du message et/ou des pièces jointes que vous pouvez nous envoyer, ainsi que toute autre information que vous pouvez choisir de fournir.</p>

          <h2 className="font-semibold text-gray-900 text-base">Comment nous utilisons vos informations</h2>
          <p>Nous utilisons les informations que nous collectons de diverses manières, notamment pour :</p>
          <ul className="list-disc list-inside space-y-1 ml-2">
            <li>Fournir, exploiter et entretenir notre site Web</li>
            <li>Améliorer, personnaliser et développer notre site Web</li>
            <li>Détecter et prévenir la fraude</li>
          </ul>

          <h2 className="font-semibold text-gray-900 text-base">Fichiers journaux</h2>
          <p>À la louche suit une procédure standard d'utilisation des fichiers journaux. Ces fichiers enregistrent les visiteurs lorsqu'ils visitent des sites Web. Toutes les sociétés d'hébergement le font ainsi qu'une partie des analyses des services d'hébergement. Les informations collectées par les fichiers journaux incluent les adresses de protocole Internet (IP), le type de navigateur, le fournisseur d'accès Internet (FAI), la date et l'heure, les pages de référence/de sortie et éventuellement le nombre de clics. Ceux-ci ne sont liés à aucune information personnellement identifiable. Le but de ces informations est d'analyser les tendances, d'administrer le site, de suivre les mouvements des utilisateurs sur le site Web et de recueillir des informations démographiques.</p>

          <h2 className="font-semibold text-gray-900 text-base">Cookies et balises Web</h2>
          <p>Comme tout autre site Internet, À la louche utilise des « cookies ». Ces cookies sont utilisés pour stocker des informations, notamment les préférences des visiteurs et les pages du site Web auxquelles le visiteur a accédé ou visité. Les informations sont utilisées pour optimiser l'expérience des utilisateurs en personnalisant le contenu de notre page Web en fonction du type de navigateur des visiteurs et/ou d'autres informations.</p>

          <h2 className="font-semibold text-gray-900 text-base">Politiques de confidentialité des tiers</h2>
          <p>La politique de confidentialité de À la louche ne s'applique pas aux autres sites Web. Ainsi, nous vous conseillons de consulter les politiques de confidentialité respectives de ces serveurs tiers pour des informations plus détaillées. Il peut inclure leurs pratiques et instructions sur la manière de se désinscrire de certaines options.</p>
          <p>Vous pouvez choisir de désactiver les cookies via les options de votre navigateur individuel. Pour connaître des informations plus détaillées sur la gestion des cookies avec des navigateurs Web spécifiques, elles peuvent être trouvées sur les sites Web respectifs des navigateurs.</p>

          <h2 className="font-semibold text-gray-900 text-base">Droits de protection des données RGPD</h2>
          <p>Nous souhaitons nous assurer que vous connaissez pleinement tous vos droits en matière de protection des données. Chaque utilisateur a droit aux éléments suivants :</p>
          <ul className="space-y-2 ml-2">
            <li><span className="font-medium">Le droit d'accès</span> – Vous avez le droit de demander des copies de vos données personnelles. Nous pouvons vous facturer une somme modique pour ce service.</li>
            <li><span className="font-medium">Le droit de rectification</span> – Vous avez le droit de demander que nous corrigions toute information que vous jugez inexacte. Vous avez également le droit de nous demander de compléter les informations que vous jugez incomplètes.</li>
            <li><span className="font-medium">Le droit à l'effacement</span> – Vous avez le droit de demander que nous supprimions vos données personnelles, sous certaines conditions.</li>
            <li><span className="font-medium">Le droit de limiter le traitement</span> – Vous avez le droit de demander que nous limitions le traitement de vos données personnelles, sous certaines conditions.</li>
            <li><span className="font-medium">Le droit de vous opposer au traitement</span> – Vous avez le droit de vous opposer au traitement de vos données personnelles, sous certaines conditions.</li>
            <li><span className="font-medium">Le droit à la portabilité des données</span> – Vous avez le droit de demander que nous transférions les données que nous avons collectées à une autre organisation, ou directement à vous, sous certaines conditions.</li>
          </ul>
          <p>Si vous faites une demande, nous avons un mois pour vous répondre. Si vous souhaitez exercer l'un de ces droits, veuillez nous contacter.</p>

          <h2 className="font-semibold text-gray-900 text-base">Informations pour les enfants</h2>
          <p>Une autre partie de notre priorité consiste à ajouter une protection aux enfants lorsqu'ils utilisent Internet. Nous encourageons les parents et tuteurs à observer, participer et/ou surveiller et guider leur activité en ligne.</p>
          <p><a href="https://alalouche.ch/" className="text-[#b5122a] hover:underline">https://alalouche.ch/</a> ne collecte sciemment aucune information personnelle identifiable auprès d'enfants de moins de 13 ans. Si vous pensez que votre enfant a fourni ce type d'informations sur notre site Web, nous vous encourageons fortement à nous contacter immédiatement et nous ferons de notre mieux pour supprimer rapidement ces informations de nos dossiers.</p>

          <h2 className="font-semibold text-gray-900 text-base">Modifications de cette politique de confidentialité</h2>
          <p>Nous pouvons mettre à jour notre politique de confidentialité de temps à autre. Ainsi, nous vous conseillons de consulter périodiquement cette page pour tout changement. Nous vous informerons de tout changement en publiant la nouvelle politique de confidentialité sur cette page. Ces modifications entrent en vigueur immédiatement, après leur publication sur cette page.</p>

          <h2 className="font-semibold text-gray-900 text-base">Contactez-nous</h2>
          <p>Si vous avez des questions ou des suggestions concernant notre politique de confidentialité, n'hésitez pas à nous contacter.</p>
        </div>
      </DialogContent>
    </Dialog>
  );
}