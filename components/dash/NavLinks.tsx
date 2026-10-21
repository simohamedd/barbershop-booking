"use client";
import Link from "next/link";
import { usePathname } from "next/navigation";

export function NavLinks({ items }: { items: { href: string; label: string }[] }) {
  const path = usePathname();
  const isActive = (href: string) => (href.split("/").length === 2 ? path === href : path === href || path.startsWith(href + "/"));
  return (
    <nav aria-label="Dashboard" className="flex gap-1 overflow-x-auto px-3 pb-3 lg:flex-col lg:overflow-visible lg:pb-0">
      {items.map((i) => (
        <Link key={i.href} href={i.href} aria-current={isActive(i.href) ? "page" : undefined}
          className={`whitespace-nowrap rounded-md px-3 py-2 text-sm ${isActive(i.href) ? "bg-white/10 font-semibold text-white" : "text-white/65 hover:bg-white/5 hover:text-white"}`}>
          {i.label}
        </Link>
      ))}
    </nav>
  );
}
