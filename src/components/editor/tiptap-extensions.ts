import Mathematics from "@tiptap/extension-mathematics";
import StarterKit from "@tiptap/starter-kit";

export const baseTiptapExtensions = [
  StarterKit,
  Mathematics.configure({
    katexOptions: {
      throwOnError: false,
    },
  }),
];
