import { Link } from "react-router-dom";

export default function SuppressionCompte() {
  return (
    <section className="mx-auto w-full max-w-4xl px-4 py-10 sm:px-6">
      <div className="rounded-2xl border border-gray-200 bg-white p-6 shadow-sm sm:p-8">
        <h1 className="text-2xl font-serif text-gray-900 sm:text-3xl">Suppression de compte</h1>

        <div className="mt-6 space-y-4 text-sm leading-relaxed text-gray-700 sm:text-base">
          <p>
            Si vous souhaitez demander la suppression de votre compte client À la Louche et des données associées, vous pouvez nous envoyer votre demande à l’adresse suivante :
          </p>

          <p>
            <a href="mailto:info@alalouche.ch" className="font-medium text-[#b5122a] underline">
              info@alalouche.ch
            </a>
          </p>

          <p>
            Merci d’indiquer dans votre message l’adresse e-mail utilisée pour votre compte afin de nous permettre de traiter votre demande.
          </p>

          <p>
            Certaines données peuvent être conservées lorsque la loi l’exige ou pour des raisons légitimes telles que la prévention de la fraude, la sécurité ou le respect d’obligations légales.
          </p>

          <p>
            Pour plus d’informations, veuillez consulter notre{" "}
            <Link to="/politique-de-confidentialite" className="font-medium text-[#b5122a] underline">
              Politique de confidentialité
            </Link>
            .
          </p>
        </div>
      </div>
    </section>
  );
}
