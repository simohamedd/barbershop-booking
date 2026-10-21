"use client";
import { useEffect, useState } from "react";

/** Confirmation toasts that survive the page refresh after a server action (the form that triggered it may disappear). */
export function toast(message: string) {
  window.dispatchEvent(new CustomEvent("app-toast", { detail: message }));
}

export function Toaster() {
  const [items, setItems] = useState<{ id: number; text: string }[]>([]);
  useEffect(() => {
    const on = (e: Event) => {
      const id = Date.now() + Math.random();
      setItems((xs) => [...xs, { id, text: (e as CustomEvent<string>).detail }]);
      setTimeout(() => setItems((xs) => xs.filter((x) => x.id !== id)), 5000);
    };
    window.addEventListener("app-toast", on);
    return () => window.removeEventListener("app-toast", on);
  }, []);
  return (
    <div aria-live="polite" role="status" className="pointer-events-none fixed inset-x-0 bottom-4 z-50 flex flex-col items-center gap-2 px-4">
      {items.map((t) => (
        <div key={t.id} className="pointer-events-auto flex max-w-md items-start gap-3 rounded-md bg-ink px-4 py-3 text-sm text-white shadow-lg">
          <span className="mt-1 h-2 w-2 shrink-0 rounded-full bg-emerald-400" aria-hidden />
          <span className="flex-1">{t.text}</span>
          <button type="button" className="text-white/60 hover:text-white" onClick={() => setItems((xs) => xs.filter((x) => x.id !== t.id))} aria-label="Dismiss">×</button>
        </div>
      ))}
    </div>
  );
}
