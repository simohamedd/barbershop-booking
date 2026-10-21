"use client";
import { useState } from "react";

export function AllDayToggle({ isShop }: { isShop: boolean }) {
  const [allDay, setAllDay] = useState(true);
  return (
    <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
      <label className="flex items-center gap-2 text-sm sm:col-span-2 lg:col-span-4"><input type="checkbox" name="all_day" checked={allDay} onChange={(e) => setAllDay(e.target.checked)} /> Whole days</label>
      <div><label className="label" htmlFor="to-sd">{allDay ? "First day" : "Date"}</label><input id="to-sd" type="date" name="start_date" required className="field" /></div>
      {allDay ? (
        <div><label className="label" htmlFor="to-ed">Last day</label><input id="to-ed" type="date" name="end_date" className="field" /><p className="hint">Leave empty for a single day.</p></div>
      ) : (
        <>
          <div><label className="label" htmlFor="to-st">From</label><input id="to-st" type="time" name="start_time" required step={300} className="field" /></div>
          <div><label className="label" htmlFor="to-et">To</label><input id="to-et" type="time" name="end_time" required step={300} className="field" /></div>
        </>
      )}
      {!isShop && (
        <div><label className="label" htmlFor="to-kind">Type</label>
          <select id="to-kind" name="kind" className="field"><option value="BLOCK">Blocked time</option><option value="DAY_OFF">Day off</option><option value="HOLIDAY">Holiday</option></select></div>
      )}
      <div className={isShop ? "lg:col-span-2" : ""}><label className="label" htmlFor="to-r">Note <span className="font-normal text-smoke">(optional)</span></label><input id="to-r" name="reason" maxLength={120} className="field" placeholder={isShop ? "e.g. Christmas Day" : "e.g. Dentist"} /></div>
    </div>
  );
}
