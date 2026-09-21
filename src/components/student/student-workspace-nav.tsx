import { StudentPendingLink } from "@/components/student/student-pending-link";
import { translate } from "@/lib/i18n/messages";
import { getRequestLocale } from "@/lib/i18n/server";

type StudentWorkspaceNavItem = {
  href: string;
  label: string;
};

export async function StudentWorkspaceNav() {
  const locale = await getRequestLocale();
  const t = (key: Parameters<typeof translate>[1]) => translate(locale, key);
  const studentWorkspaceNavItems: StudentWorkspaceNavItem[] = [
    { href: "/student", label: t("student.dashboard") },
    { href: "/student/work", label: t("student.myWork") },
    { href: "/student/classrooms", label: t("student.myClasses") },
    { href: "/practice", label: t("student.practice") },
    { href: "/mistakes", label: t("student.mistakes") },
    { href: "/student/public-library", label: t("student.publicLibrary") },
    { href: "/student/progress", label: t("student.progressFeedback") },
  ];

  return (
    <nav
      aria-label={t("student.workspace")}
      className="flex flex-wrap gap-1 rounded-[14px] border border-[#D2D2D7] bg-white p-2 shadow-none"
    >
      {studentWorkspaceNavItems.map((item) => (
        <StudentPendingLink
          className="student-focus-ring inline-flex min-h-11 items-center rounded-[10px] px-3 py-2 text-sm font-medium text-[#6E6E73] transition-colors duration-200 hover:bg-[#F5F5F7] hover:text-[#1D1D1F]"
          href={item.href}
          feedback="page"
          key={`${item.href}-${item.label}`}
        >
          {item.label}
        </StudentPendingLink>
      ))}
    </nav>
  );
}
