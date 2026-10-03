import type { Metadata } from "next";
import Link from "next/link";
import { PackageOpen } from "lucide-react";
import { SignInForm } from "./sign-in-form";

export const metadata: Metadata = {
  title: "Connexion | KBM Stock",
};

export default function LoginPage() {
  return (
    <main className="login-shell">
      <section className="login-panel">
        <Link className="brand login-brand" href="/" aria-label="KBM Stock">
          <span className="brand-mark"><PackageOpen size={21} strokeWidth={2.1} /></span>
          <span className="brand-name">KBM<span>STOCK</span></span>
        </Link>
        <p className="eyebrow">ESPACE ADMINISTRATEUR</p>
        <h1>Connectez-vous à votre espace.</h1>
        <p className="login-description">Accédez aux stocks, expéditions et ventes de KBM.</p>
        <SignInForm />
      </section>
      <p className="login-footnote">Accès réservé au compte administrateur autorisé.</p>
    </main>
  );
}