import { BarberProfileForm } from "@/components/dash/BarberProfileForm";
import { PageTitle } from "@/components/dash/Shell";

export const metadata = { title: "Add barber" };

export default function NewBarber() {
  return (
    <>
      <PageTitle title="Add barber">They start with the shop's opening hours and every service. You can change both next.</PageTitle>
      <div className="panel max-w-3xl p-5"><BarberProfileForm /></div>
    </>
  );
}
