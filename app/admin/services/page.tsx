import { removeService, saveService } from "@/app/admin/actions";
import { ActionForm, Submit } from "@/components/dash/forms";
import { PageTitle } from "@/components/dash/Shell";
import { q } from "@/lib/db";
import { formatMoney, getSettings } from "@/lib/settings";

export const metadata = { title: "Services" };

type Svc = { id: string; name: string; description: string; price_pence: number; duration_min: number; active: boolean; sort_order: number; barber_ids: string[] };

export default async function Services() {
  const [s, services, barbers] = await Promise.all([
    getSettings(),
    q<Svc>(`SELECT s.*, COALESCE((SELECT array_agg(barber_id) FROM barber_services WHERE service_id = s.id), '{}') barber_ids FROM services s WHERE deleted_at IS NULL ORDER BY sort_order, name`),
    q<{ id: string; name: string }>(`SELECT id, name FROM barbers WHERE deleted_at IS NULL ORDER BY sort_order, name`),
  ]);
  const buffer = s.buffer_minutes;
  return (
    <>
      <PageTitle title="Services">Changes apply to new bookings. {buffer > 0 && `A ${buffer}-minute buffer is added after each appointment (change it in Settings).`}</PageTitle>
      <div className="space-y-3">
        {services.map((v) => (
          <details key={v.id} className="panel group">
            <summary className="flex cursor-pointer list-none flex-wrap items-center gap-x-4 gap-y-1 px-5 py-4">
              <span className="flex-1 font-semibold">{v.name}{!v.active && <span className="ml-2 text-xs font-normal text-smoke">(hidden from website)</span>}</span>
              <span className="text-sm text-smoke">{v.duration_min} min</span>
              <span className="w-16 text-right font-semibold tabular-nums">{formatMoney(v.price_pence, s.currency)}</span>
              <span className="text-sm text-smoke">{v.barber_ids.length} barber{v.barber_ids.length === 1 ? "" : "s"}</span>
              <span className="text-sm underline group-open:hidden">Edit</span>
            </summary>
            <div className="border-t border-line p-5">
              <ServiceForm v={v} barbers={barbers} currency={s.currency} />
              <ActionForm action={removeService} className="mt-4 border-t border-line pt-4"><input type="hidden" name="id" value={v.id} /><Submit className="btn-danger btn-sm" confirm={`Remove ${v.name}? Existing bookings keep it.`}>Remove service</Submit></ActionForm>
            </div>
          </details>
        ))}
      </div>
      <section className="panel mt-6 p-5">
        <h2 className="mb-4 font-semibold">Add a service</h2>
        <ServiceForm barbers={barbers} currency={s.currency} />
      </section>
    </>
  );
}

function ServiceForm({ v, barbers, currency }: { v?: Svc; barbers: { id: string; name: string }[]; currency: string }) {
  const k = v?.id ?? "new";
  return (
    <ActionForm action={saveService} className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4" resetOnOk={!v}>
      {v && <input type="hidden" name="id" value={v.id} />}
      <div className="lg:col-span-2"><label className="label" htmlFor={`n-${k}`}>Name</label><input id={`n-${k}`} name="name" required defaultValue={v?.name} className="field" /></div>
      <div><label className="label" htmlFor={`p-${k}`}>Price ({currency})</label><input id={`p-${k}`} name="price" type="number" min={0} step="0.01" required defaultValue={v ? (v.price_pence / 100).toFixed(2) : ""} className="field" /></div>
      <div><label className="label" htmlFor={`d-${k}`}>Duration (minutes)</label><input id={`d-${k}`} name="duration_min" type="number" min={5} max={480} step={5} required defaultValue={v?.duration_min ?? 30} className="field" /></div>
      <div className="sm:col-span-2 lg:col-span-3"><label className="label" htmlFor={`ds-${k}`}>Description</label><input id={`ds-${k}`} name="description" defaultValue={v?.description} className="field" maxLength={300} /></div>
      <div><label className="label" htmlFor={`o-${k}`}>Order</label><input id={`o-${k}`} name="sort_order" type="number" min={0} defaultValue={v?.sort_order ?? 0} className="field" /></div>
      <fieldset className="sm:col-span-2 lg:col-span-4">
        <legend className="label">Barbers who do this</legend>
        <div className="flex flex-wrap gap-x-5 gap-y-1.5">
          {barbers.map((b) => <label key={b.id} className="flex items-center gap-2 text-sm"><input type="checkbox" name="barber" value={b.id} defaultChecked={v ? v.barber_ids.includes(b.id) : true} />{b.name}</label>)}
        </div>
      </fieldset>
      <label className="flex items-center gap-2 text-sm sm:col-span-2 lg:col-span-4"><input type="checkbox" name="active" defaultChecked={v?.active ?? true} /> Show on website and allow booking</label>
      <div><Submit>{v ? "Save service" : "Add service"}</Submit></div>
    </ActionForm>
  );
}
