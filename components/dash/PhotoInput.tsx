"use client";
/* eslint-disable @next/next/no-img-element */
import { useState } from "react";

/** Resizes an uploaded photo in the browser to a 400px square JPEG and stores it as a data URL (no file storage needed). */
export function PhotoInput({ name, initial }: { name: string; initial: string }) {
  const [value, setValue] = useState(initial);
  const [err, setErr] = useState<string | null>(null);
  async function onFile(f: File | undefined) {
    setErr(null);
    if (!f) return;
    if (!f.type.startsWith("image/")) return setErr("Choose an image file.");
    const img = new Image();
    img.src = URL.createObjectURL(f);
    await img.decode().catch(() => setErr("That image couldn't be read."));
    const size = 400, c = document.createElement("canvas");
    c.width = c.height = size;
    const s = Math.min(img.width, img.height);
    c.getContext("2d")!.drawImage(img, (img.width - s) / 2, (img.height - s) / 2, s, s, 0, 0, size, size);
    setValue(c.toDataURL("image/jpeg", 0.82));
  }
  return (
    <div className="flex items-center gap-4">
      {value ? <img src={value} alt="" className="h-20 w-20 rounded-full object-cover" /> : <span className="flex h-20 w-20 items-center justify-center rounded-full border border-dashed border-line text-xs text-smoke">No photo</span>}
      <div className="space-y-2">
        <input type="file" accept="image/*" onChange={(e) => onFile(e.target.files?.[0])} className="block text-sm file:mr-3 file:rounded-md file:border-0 file:bg-ink file:px-3 file:py-1.5 file:text-white" aria-label="Upload photo" />
        {value && <button type="button" className="text-xs text-smoke underline" onClick={() => setValue("")}>Remove photo</button>}
        {err && <p className="text-xs text-red-700">{err}</p>}
      </div>
      <input type="hidden" name={name} value={value} />
    </div>
  );
}
