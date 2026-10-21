"use client";
import { useActionState, useCallback, useEffect, useRef } from "react";
import { useFormStatus } from "react-dom";
import { toast } from "./Toaster";

export type ActionResult = { ok?: string; error?: string; issues?: { code: string; message: string }[] } | null;
// eslint-disable-next-line @typescript-eslint/no-explicit-any
type Act = (prev: any, fd: FormData) => Promise<ActionResult>;

export function ActionForm({ action, children, className, resetOnOk = false }: { action: Act; children: React.ReactNode; className?: string; resetOnOk?: boolean }) {
  // Success goes to a toast (the form may unmount once the page refreshes); errors stay inline.
  const wrapped = useCallback(async (prev: ActionResult, fd: FormData) => {
    const r = await action(prev, fd);
    if (r?.ok) toast(r.ok);
    return r;
  }, [action]);
  const [state, run] = useActionState(wrapped, null);
  const ref = useRef<HTMLFormElement>(null);
  useEffect(() => { if (resetOnOk && state?.ok) ref.current?.reset(); }, [state, resetOnOk]);
  return (
    <form ref={ref} action={run} className={className}>
      {children}
      {state?.error && <Result state={state} />}
    </form>
  );
}

export function Result({ state }: { state: ActionResult }) {
  if (!state) return null;
  if (state.error)
    return (
      <div role="alert" className="mt-3 rounded-md border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-900">
        {state.error}
        {state.issues && state.issues.length > 1 && <ul className="mt-1 list-disc pl-5">{state.issues.slice(1).map((i) => <li key={i.code}>{i.message}</li>)}</ul>}
      </div>
    );
  return <p role="status" className="mt-3 rounded-md border border-emerald-200 bg-emerald-50 px-3 py-2 text-sm text-emerald-900">{state.ok}</p>;
}

export function Submit({ children, className = "btn-dark", pendingText, confirm }: { children: React.ReactNode; className?: string; pendingText?: string; confirm?: string }) {
  const { pending } = useFormStatus();
  return (
    <button
      className={className}
      disabled={pending}
      onClick={(e) => { if (confirm && !window.confirm(confirm)) e.preventDefault(); }}
    >
      {pending ? pendingText ?? "Saving…" : children}
    </button>
  );
}
