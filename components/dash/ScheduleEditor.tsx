import { q } from "@/lib/db";
import { getSettings } from "@/lib/settings";
import { fmtDateTime, WEEKDAYS } from "@/lib/time";
import { addTimeOff, removeTimeOff, saveWeek } from "@/app/actions/schedule";
import { ActionForm, Submit } from "./forms";
import { AllDayToggle } from "./AllDayToggle";

/** Weekly hours (+ breaks for barbers) and one-off blocked time. target = barber id or "shop". */
export async function ScheduleEditor({ target, readOnly = false }: { target: string; readOnly?: boolean }) {
  const isShop = target === "shop";
  const barberId = isShop ? null : target;
  const [s, hours, breaks, off] = await Promise.all([
    getSettings(),
    q<{ weekday: number; start: string; end: string }>(`SELECT weekday, to_char(start_time,'HH24:MI') start, to_char(end_time,'HH24:MI') "end" FROM working_hours WHERE barber_id IS NOT DISTINCT FROM $1 ORDER BY start_time`, [barberId]),
    isShop ? Promise.resolve([]) : q<{ weekday: number; start: string; end: string }>(`SELECT weekday, to_char(start_time,'HH24:MI') start, to_char(end_time,'HH24:MI') "end" FROM breaks WHERE barber_id = $1`, [barberId]),
    q(`SELECT id, start_at, end_at, kind, reason FROM time_off WHERE barber_id IS NOT DISTINCT FROM $1 AND end_at > now() ORDER BY start_at`, [barberId]),
  ]);
  const kindLabel: Record<string, string> = { BLOCK: "Blocked", HOLIDAY: "Holiday", DAY_OFF: "Day off", CLOSURE: "Shop closed" };

  return (
    <div className="space-y-6">
      <section className="panel p-5">
        <h2 className="font-semibold">{isShop ? "Opening hours" : "Weekly working hours"}</h2>
        <p className="mt-1 text-sm text-smoke">{isShop ? "Barbers can only be booked when the shop is open, whatever their own hours." : "Bookable times are these hours, minus breaks and blocked time, inside the shop's opening hours."}</p>
        <ActionForm action={saveWeek} className="mt-4">
          <input type="hidden" name="target" value={target} />
          <fieldset disabled={readOnly} className="overflow-x-auto">
            <table className="table min-w-[36rem]">
              <thead><tr><th>Day</th><th>{isShop ? "Open" : "Working"}</th><th>From</th><th>To</th>{!isShop && <><th>Break from</th><th>Break to</th></>}</tr></thead>
              <tbody>
                {WEEKDAYS.map((name, i) => {
                  const d = i + 1;
                  const h = hours.find((x) => x.weekday === d);
                  const b = breaks.find((x) => x.weekday === d);
                  return (
                    <tr key={d}>
                      <td className="font-semibold">{name}</td>
                      <td><input type="checkbox" name={`d${d}_on`} defaultChecked={!!h} aria-label={`${name} ${isShop ? "open" : "working"}`} className="h-4 w-4" /></td>
                      <td><input type="time" name={`d${d}_start`} defaultValue={h?.start ?? "09:00"} step={300} className="field w-28 py-1.5" aria-label={`${name} from`} /></td>
                      <td><input type="time" name={`d${d}_end`} defaultValue={h?.end ?? "18:00"} step={300} className="field w-28 py-1.5" aria-label={`${name} to`} /></td>
                      {!isShop && <>
                        <td><input type="time" name={`d${d}_bstart`} defaultValue={b?.start ?? ""} step={300} className="field w-28 py-1.5" aria-label={`${name} break from`} /></td>
                        <td><input type="time" name={`d${d}_bend`} defaultValue={b?.end ?? ""} step={300} className="field w-28 py-1.5" aria-label={`${name} break to`} /></td>
                      </>}
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </fieldset>
          {!readOnly && <div className="mt-4"><Submit>Save hours</Submit></div>}
        </ActionForm>
      </section>

      <section className="panel p-5">
        <h2 className="font-semibold">{isShop ? "Closures and bank holidays" : "Days off, holidays and blocked time"}</h2>
        {off.length === 0 ? <p className="mt-2 text-sm text-smoke">Nothing coming up.</p> : (
          <ul className="mt-3 divide-y divide-line">
            {off.map((o: any) => (
              <li key={o.id} className="flex flex-wrap items-center justify-between gap-3 py-3 text-sm">
                <span><span className="font-semibold">{kindLabel[o.kind] ?? o.kind}</span>{o.reason ? ` (${o.reason})` : ""}: {fmtDateTime(o.start_at, s.timezone)} to {fmtDateTime(o.end_at, s.timezone)}</span>
                {!readOnly && <ActionForm action={removeTimeOff}><input type="hidden" name="id" value={o.id} /><Submit className="btn-line btn-sm" confirm="Remove this block? Those times become bookable again.">Remove</Submit></ActionForm>}
              </li>
            ))}
          </ul>
        )}
        {!readOnly && (
          <ActionForm action={addTimeOff} className="mt-5 border-t border-line pt-5" resetOnOk>
            <input type="hidden" name="target" value={target} />
            <AllDayToggle isShop={isShop} />
            <div className="mt-4"><Submit>{isShop ? "Add closure" : "Block this time"}</Submit></div>
          </ActionForm>
        )}
      </section>
    </div>
  );
}
