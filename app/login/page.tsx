import { redirect } from "next/navigation";
import { Wordmark } from "@/components/ui";
import { getUser } from "@/lib/auth";
import { getSettings } from "@/lib/settings";
import { LoginForm } from "./LoginForm";
import { needsSetup } from "../setup/actions";

export const metadata = { title: "Staff login", robots: { index: false } };
export const dynamic = "force-dynamic";

export default async function LoginPage({ searchParams }: { searchParams: Promise<{ next?: string }> }) {
  const u = await getUser();
  if (u) redirect(u.role === "ADMIN" ? "/admin" : "/barber");
  if (await needsSetup()) redirect("/setup");
  const [s, sp] = await Promise.all([getSettings(), searchParams]);
  return (
    <div className="grid min-h-screen bg-ink lg:grid-cols-2">
      <div className="hidden flex-col justify-between p-12 text-white lg:flex">
        <Wordmark name={s.shop_name} logo={s.logo_url} light />
        <p className="display max-w-md text-5xl leading-tight">Today's chairs, requests and diary in one place.</p>
        <p className="text-sm text-white/50">Staff area. Customers can <a className="underline" href="/booking">find their booking here</a>.</p>
      </div>
      <div className="flex items-center justify-center bg-white px-4 py-16">
        <div className="w-full max-w-sm">
          <div className="lg:hidden"><Wordmark name={s.shop_name} logo={s.logo_url} /></div>
          <h1 className="display mt-8 text-4xl lg:mt-0">Staff login</h1>
          <p className="mt-2 text-smoke">For barbers and shop admins.</p>
          <LoginForm next={sp.next ?? ""} />
        </div>
      </div>
    </div>
  );
}
