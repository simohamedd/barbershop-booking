import { PageHead } from "@/components/site";
import { LookupForm } from "./forms";

export const metadata = { title: "Find my booking" };

export default function FindBookingPage() {
  return (
    <>
      <PageHead title="Find my booking">Use the reference from your confirmation and the mobile number you booked with.</PageHead>
      <div className="bg-ivory"><div className="wrap py-16"><div className="mx-auto max-w-md border border-line bg-white p-8"><LookupForm /></div></div></div>
    </>
  );
}
