import { Button } from "@/components/ui/button";
import { isAllowedVideoEmbedUrl } from "@/lib/validations/video";

type VideoPlayerFrameProps = {
  embedUrl: string;
  videoUrl: string;
};

export function VideoPlayerFrame({ embedUrl, videoUrl }: VideoPlayerFrameProps) {
  if (!isAllowedVideoEmbedUrl(embedUrl)) {
    return (
      <div className="flex aspect-video items-center justify-center rounded-md border bg-muted/40 p-6 text-center text-sm text-muted-foreground">
        <div className="space-y-3">
          <p>This embed URL is not supported for inline playback.</p>
          <Button asChild variant="outline" size="sm">
            <a href={videoUrl} target="_blank" rel="noreferrer">
              Open original video
            </a>
          </Button>
        </div>
      </div>
    );
  }

  return (
    <div className="overflow-hidden rounded-md border bg-black">
      <iframe
        className="aspect-video w-full"
        src={embedUrl}
        title="Video player"
        loading="lazy"
        allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture; web-share"
        allowFullScreen
      />
    </div>
  );
}
