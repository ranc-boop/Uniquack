import { redirect } from "next/navigation";

export default function TeacherHomePage() {
  redirect("/teacher/classrooms");
}
