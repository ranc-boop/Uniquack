import Link from "next/link";

type StudentWorkspaceNavItem = {
  href: string;
  label: string;
};

const studentWorkspaceNavItems: StudentWorkspaceNavItem[] = [
  { href: "/student", label: "Dashboard" },
  { href: "/student/work", label: "My Work" },
  { href: "/practice", label: "Practice" },
  { href: "/mistakes", label: "Mistakes" },
  { href: "/student/library", label: "Study Library" },
  { href: "/student/groups", label: "Study Groups" },
  { href: "/student/public-library", label: "Public Library" },
  { href: "/student/progress", label: "Progress / Feedback" },
];

export function StudentWorkspaceNav() {
  return (
    <nav
      aria-label="Student workspace"
      className="flex flex-wrap gap-2 rounded-lg border border-slate-200 bg-white p-2 shadow-sm"
    >
      {studentWorkspaceNavItems.map((item) => (
        <Link
          className="student-focus-ring rounded-md px-3 py-2 text-sm font-semibold text-slate-600 transition hover:bg-sky-50 hover:text-sky-800"
          href={item.href}
          key={`${item.href}-${item.label}`}
        >
          {item.label}
        </Link>
      ))}
    </nav>
  );
}
