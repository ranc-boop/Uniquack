"use client";

import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";

export type QuestionDetailImage = {
  id: string;
  originalFilename: string;
  publicUrl: string;
};

export function QuestionDetailImageGallery({
  images,
}: {
  images: QuestionDetailImage[];
}) {
  if (!images.length) {
    return null;
  }

  return (
    <div className="grid gap-3 sm:grid-cols-2">
      {images.map((image) => (
        <Dialog key={image.id}>
          <DialogTrigger asChild>
            <button
              type="button"
              className="group overflow-hidden rounded-md border bg-muted/20 p-2 text-left transition-colors hover:bg-muted focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 motion-reduce:transition-none"
              aria-label={`Enlarge ${image.originalFilename}`}
            >
              {/* Storage URLs are dynamic and should be rendered without optimization. */}
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img
                src={image.publicUrl}
                alt={image.originalFilename}
                decoding="async"
                loading="lazy"
                className="h-56 w-full rounded object-contain transition-transform group-hover:scale-[1.02] motion-reduce:transform-none motion-reduce:transition-none"
              />
            </button>
          </DialogTrigger>
          <DialogContent className="max-h-[92vh] max-w-5xl overflow-auto p-4">
            <DialogTitle className="pr-8 text-sm">
              {image.originalFilename}
            </DialogTitle>
            <DialogDescription className="sr-only">
              Enlarged question image
            </DialogDescription>
            {/* Storage URLs are dynamic and should be rendered without optimization. */}
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img
              src={image.publicUrl}
              alt={image.originalFilename}
              decoding="async"
              className="max-h-[80vh] w-full object-contain"
            />
          </DialogContent>
        </Dialog>
      ))}
    </div>
  );
}
