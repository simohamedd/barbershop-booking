import { redirect } from "next/navigation";
import { needsSetup } from "./actions";
import { SetupForm } from "./SetupForm";

export const dynamic = "force-dynamic";
export const metadata = { title: "Set up your shop", robots: { index: false } };

export default async function SetupPage() {
  if (!(await needsSetup())) redirect("/login");
  return (
    <div className="flex min-h-screen items-center justify-center bg-mist px-4 py-16">
      <div className="panel w-full max-w-lg p-6 sm:p-8">
        <h1 className="display text-3xl">Set up your shop</h1>
        <p className="mt-2 text-smoke">Create the owner's admin account. This page only works once: after an admin exists it sends everyone to the login page.</p>
        <SetupForm />
      </div>
    </div>
  );
}
