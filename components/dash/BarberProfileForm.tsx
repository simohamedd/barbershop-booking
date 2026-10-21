import { saveBarber } from "@/app/admin/actions";
import { ActionForm, Submit } from "./forms";
import { PhotoInput } from "./PhotoInput";

export function BarberProfileForm({ b }: { b?: { id: string; name: string; title: string; specialties: string; bio: string; phone: string; photo: string; sort_order: number } }) {
  return (
    <ActionForm action={saveBarber} className="grid gap-4 sm:grid-cols-2">
      {b && <input type="hidden" name="id" value={b.id} />}
      <div className="sm:col-span-2"><p className="label">Photo</p><PhotoInput name="photo" initial={b?.photo ?? ""} /></div>
      <div><label className="label" htmlFor="b-name">Name</label><input id="b-name" name="name" required defaultValue={b?.name} className="field" /></div>
      <div><label className="label" htmlFor="b-title">Title</label><input id="b-title" name="title" defaultValue={b?.title} className="field" placeholder="e.g. Senior barber" /></div>
      <div><label className="label" htmlFor="b-phone">Phone <span className="font-normal text-smoke">(staff only)</span></label><input id="b-phone" name="phone" defaultValue={b?.phone} className="field" /></div>
      <div><label className="label" htmlFor="b-sort">Order on website</label><input id="b-sort" name="sort_order" type="number" min={0} defaultValue={b?.sort_order ?? 0} className="field" /></div>
      <div className="sm:col-span-2"><label className="label" htmlFor="b-spec">Specialties</label><input id="b-spec" name="specialties" defaultValue={b?.specialties} className="field" placeholder="e.g. Skin fades, beard sculpting" /></div>
      <div className="sm:col-span-2"><label className="label" htmlFor="b-bio">About</label><textarea id="b-bio" name="bio" rows={3} defaultValue={b?.bio} className="field" maxLength={800} /></div>
      <div className="sm:col-span-2"><Submit>{b ? "Save profile" : "Add barber"}</Submit></div>
    </ActionForm>
  );
}
