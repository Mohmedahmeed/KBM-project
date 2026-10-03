"use client";

import Link from "next/link";
import { useState, type FormEvent } from "react";

type Message = { role: "user" | "assistant"; text: string };

function isChatResponse(value: unknown): value is { answer: string } {
  return typeof value === "object" && value !== null && "answer" in value &&
    typeof value.answer === "string" && Boolean(value.answer.trim());
}

function isChatError(value: unknown): value is { error: string } {
  return typeof value === "object" && value !== null && "error" in value && typeof value.error === "string";
}

export function BusinessAssistant() {
  const [messages, setMessages] = useState<Message[]>([]);
  const [question, setQuestion] = useState("");
  const [error, setError] = useState("");
  const [pending, setPending] = useState(false);

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const prompt = question.trim();
    if (!prompt || pending) return;
    setQuestion("");
    setError("");
    setMessages((current) => [...current, { role: "user", text: prompt }]);
    setPending(true);
    try {
      const response = await fetch("/api/assistant/chat", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ question: prompt }),
      });
      const result: unknown = await response.json();
      if (!response.ok) {
        setError(isChatError(result) ? result.error : "La réponse du service IA est invalide.");
      } else if (!isChatResponse(result)) {
        setError("La réponse du service IA est invalide.");
      } else {
        setMessages((current) => [...current, { role: "assistant", text: result.answer }]);
      }
    } catch {
      setError("Impossible de joindre l’assistant. Réessayez lorsque le webhook est disponible.");
    } finally {
      setPending(false);
    }
  }

  return (
    <main className="business-assistant-page" dir="ltr" lang="fr">
      <header className="business-assistant-header">
        <div><p>KBM STOCK / ASSISTANT</p><h1>Assistant commercial</h1><p>Posez une question à l’agent KBM pour vous aider sur l’activité. Le site transmet uniquement votre question au webhook n8n.</p></div>
        <Link href="/management">Retour à la gestion</Link>
      </header>
      <section className="business-assistant-panel">
        <div className="business-assistant-messages" aria-live="polite">
          {messages.length === 0
            ? <p className="business-assistant-empty">Exemples : « Quels produits sont en rupture ? », « Quel client a le plus grand solde ? »</p>
            : messages.map((message, index) => <article className={`business-assistant-message ${message.role}`} key={`${message.role}-${index}`}><span>{message.role === "user" ? "Vous" : "Assistant KBM"}</span><p dir="auto">{message.text}</p></article>)}
          {pending && <p className="business-assistant-pending" role="status">L’agent prépare sa réponse…</p>}
        </div>
        <form className="business-assistant-form" onSubmit={submit}>
          <label htmlFor="business-assistant-question">Votre question (1 500 caractères max.)</label>
          <textarea id="business-assistant-question" value={question} maxLength={1500} onChange={(event) => setQuestion(event.target.value)} placeholder="Écrivez votre question…" required disabled={pending} />
          {error && <p className="business-assistant-error" role="alert">{error}</p>}
          <div><span>{question.length}/1500</span><button type="submit" disabled={pending || !question.trim()}>{pending ? "En cours…" : "Envoyer à l’agent"}</button></div>
        </form>
        <p className="business-assistant-footnote">L’assistant peut se tromper. Vérifiez les chiffres dans les pages métier avant une décision commerciale. Cette conversation n’est pas enregistrée par le site.</p>
      </section>
    </main>
  );
}
