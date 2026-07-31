"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";

type AppPrimaryNavItem = {
  href: string;
  label: string;
};

export function AppPrimaryNav({ items }: { items: AppPrimaryNavItem[] }) {
  const pathname = usePathname() ?? "";

  return (
    <>
      {items.map((item) => {
        const active =
          item.href === "/teacher"
            ? pathname === item.href
            : pathname === item.href || pathname.startsWith(`${item.href}/`);

        return (
          <Link
            aria-current={active ? "page" : undefined}
            className={[
              "inline-flex min-h-10 shrink-0 items-center rounded-md px-3 py-2 text-sm font-semibold transition-colors duration-200 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-sky-500 focus-visible:ring-offset-2",
              active
                ? "bg-sky-100 text-sky-950"
                : "text-slate-600 hover:bg-sky-50 hover:text-sky-800",
            ].join(" ")}
            href={item.href}
            key={item.href}
          >
            {item.label}
          </Link>
        );
      })}
    </>
  );
}
