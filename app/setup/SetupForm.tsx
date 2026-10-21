"use client";
import { useActionState } from "react";
import { runSetup } from "./actions";

export function SetupForm() {
  const [state, action, pending] = useActionState(runSetup, null);
  return (
    <form key={JSON.stringify(state)} action={action} className="mt-6 space-y-4">
      <div><label className="label" htmlFor="token">Setup key</label><input id="token" name="token" required autoComplete="off" className="field" /><p className="hint">The SETUP_TOKEN value from your hosting settings.</p></div>
      <div><label className="label" htmlFor="shop_name">Shop name</label><input id="shop_name" name="shop_name" defaultValue={state?.values?.shop_name} className="field" placeholder="You can change this later in Settings" /></div>
      <div><label className="label" htmlFor="name">Your name</label><input id="name" name="name" defaultValue={state?.values?.name} required autoComplete="name" className="field" /></div>
      <div><label className="label" htmlFor="email">Email</label><input id="email" name="email" defaultValue={state?.values?.email} type="email" required autoComplete="username" className="field" /></div>
      <div><label className="label" htmlFor="password">Password</label><input id="password" name="password" type="password" required minLength={10} autoComplete="new-password" className="field" /><p className="hint">At least 10 characters with a number.</p></div>
      <label className="flex items-start gap-2 text-sm"><input type="checkbox" name="sample" defaultChecked className="mt-0.5" /><span>Add sample barbers, services and opening hours so you can try it straight away. Edit or remove them later.</span></label>
      {state?.error && <p role="alert" className="rounded-md border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-900">{state.error}</p>}
      <button className="btn-dark w-full py-3" disabled={pending}>{pending ? "Setting up…" : "Create admin account"}</button>
    </form>
  );
}
