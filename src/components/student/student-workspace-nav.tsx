import { StudentPendingLink } from "@/components/student/student-pending-link";

type StudentWorkspaceNavItem = {
  href: string;
  label: string;
};

const studentWorkspaceNavItems: StudentWorkspaceNavItem[] = [
  { href: "/student", label: "Dashboard" },
  { href: "/student/work", label: "My Work" },
  { href: "/student/classrooms", label: "My Classes" },
  { href: "/practice", label: "Practice" },
  { href: "/mistakes", label: "Mistakes" },
  { href: "/student/public-library", label: "Public Library" },
  { href: "/student/progress", label: "Progress / Feedback" },
];

export function StudentWorkspaceNav() {
  return (
    <nav
      aria-label="Student workspace"
      className="flex flex-wrap gap-1 rounded-[14px] border border-[#D2D2D7] bg-white p-2 shadow-none"
    >
      {studentWorkspaceNavItems.map((item) => (
        <StudentPendingLink
          className="student-focus-ring inline-flex min-h-11 items-center rounded-[10px] px-3 py-2 text-sm font-medium text-[#6E6E73] transition-colors duration-200 hover:bg-[#F5F5F7] hover:text-[#1D1D1F]"
          href={item.href}
          key={`${item.href}-${item.label}`}
        >
          {item.label}
        </StudentPendingLink>
      ))}
    </nav>
  );
}
