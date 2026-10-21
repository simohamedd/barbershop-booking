import { PageHead } from "@/components/site";
import { LookupForm } from "./forms";

export const metadata = { title: "Find my booking" };

export default function FindBookingPage() {
  return (
    <>
      <PageHead title="Find my booking">Use the reference from your confirmation and the mobile number you booked with.</PageHead>
      <div className="wrap max-w-md py-12"><LookupForm /></div>
    </>
  );
}
