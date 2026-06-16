import { Button } from "@/components/ui/button";
import { isAllowedVideoEmbedUrl } from "@/lib/validations/video";

type VideoPlayerFrameProps = {
  embedUrl: string;
  videoUrl: string;
};

function stripAutoplayAndAppendZero(url: string) {
  if (!url) {
    return url;
  }

  const u = new URL(url);
  u.searchParams.set("autoplay", "0");

  if (u.hostname.includes("bilibili")) {
    u.searchParams.set("autoplay", "0");
    u.searchParams.set("high_quality", "1");
    u.searchParams.set("danmaku", "0");
  }

  if (u.hostname.includes("youtube") || u.hostname === "youtu.be") {
    u.searchParams.set("autoplay", "0");
    u.searchParams.set("rel", "0");
  }

  return u.toString();
}

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

  const safeSrc = stripAutoplayAndAppendZero(embedUrl);

  return (
    <div className="overflow-hidden rounded-md border bg-black">
      <iframe
        className="aspect-video w-full"
        src={safeSrc}
        title="Video player"
        loading="lazy"
        allow="accelerometer; clipboard-write; encrypted-media; gyroscope; picture-in-picture; web-share"
        allowFullScreen
      />
    </div>
  );
}
