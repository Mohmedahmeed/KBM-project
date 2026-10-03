"use client";

export function PrintButton() {
  return <button className="management-print-button no-print" onClick={() => window.print()} type="button">Imprimer / Enregistrer en PDF</button>;
}
