"use client";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { useEffect, useState } from "react";

export function MobileNav({ items }: { items: { href: string; label: string }[] }) {
  const [open, setOpen] = useState(false);
  const path = usePathname();
  useEffect(() => setOpen(false), [path]);
  return (
    <div className="flex items-center gap-2 md:hidden">
      <Link href="/book" className="btn-gold btn-sm">Book</Link>
      <button
        type="button"
        aria-expanded={open}
        aria-controls="mobile-menu"
        onClick={() => setOpen((o) => !o)}
        className="rounded-md p-2 text-white/80 hover:text-white"
      >
        <span className="sr-only">Menu</span>
        <svg width="22" height="22" viewBox="0 0 24 24" aria-hidden fill="none" stroke="currentColor" strokeWidth="1.8">
          {open ? <path d="M6 6l12 12M18 6 6 18" /> : <path d="M4 7h16M4 12h16M4 17h16" />}
        </svg>
      </button>
      {open && (
        <nav id="mobile-menu" aria-label="Mobile" className="absolute inset-x-0 top-[72px] border-b border-white/10 bg-ink px-4 pb-6 pt-2">
          {items.map((i) => (
            <Link key={i.href} href={i.href} className="block border-b border-white/10 py-3.5 text-base text-white/85">{i.label}</Link>
          ))}
        </nav>
      )}
    </div>
  );
}
