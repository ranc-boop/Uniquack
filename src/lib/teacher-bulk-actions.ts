export type TeacherBulkActionState = {
  message: string;
  processedCount: number;
  receipt: string;
  status: "error" | "idle" | "success";
};

export const initialTeacherBulkActionState: TeacherBulkActionState = {
  message: "",
  processedCount: 0,
  receipt: "initial",
  status: "idle",
};
