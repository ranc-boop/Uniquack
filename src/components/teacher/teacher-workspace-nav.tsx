import Link from "next/link";

type TeacherWorkspaceNavItem = {
  href: string;
  label: string;
};

const teacherWorkspaceNavItems: TeacherWorkspaceNavItem[] = [
  { href: "/teacher", label: "Teacher Studio" },
  { href: "/teacher/banks", label: "Banks / Library" },
  { href: "/admin/imports/pdf", label: "Imports" },
  { href: "/admin/review", label: "Review Drafts" },
  { href: "/teacher/classrooms", label: "Classrooms" },
  { href: "/teacher/course-builder", label: "Course Builder" },
];

export function TeacherWorkspaceNav() {
  return (
    <nav
      aria-label="Teacher workflow"
      className="flex flex-wrap gap-2 rounded-lg border border-slate-200 bg-white p-2 shadow-sm"
    >
      {teacherWorkspaceNavItems.map((item) => (
        <Link
          className="rounded-md px-3 py-2 text-sm font-semibold text-slate-600 transition hover:bg-sky-50 hover:text-sky-800 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-sky-500 focus-visible:ring-offset-2"
          href={item.href}
          key={item.href}
        >
          {item.label}
        </Link>
      ))}
    </nav>
  );
}

