import { PasswordForm } from "@/components/dash/PasswordForm";
import { PageTitle } from "@/components/dash/Shell";
import { requireBarber } from "@/lib/auth";

export const metadata = { title: "Account" };

export default async function Account() {
  const u = await requireBarber();
  return (
    <>
      <PageTitle title="Account">{u.email}</PageTitle>
      <section className="panel p-5"><h2 className="mb-4 font-semibold">Change password</h2><PasswordForm /></section>
    </>
  );
}
