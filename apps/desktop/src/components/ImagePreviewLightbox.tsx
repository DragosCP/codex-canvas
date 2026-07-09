import {
  ChevronLeft,
  ChevronRight,
  Image as ImageIcon,
  X,
} from "lucide-react";
import { useEffect, useState } from "react";
import { desktopFileUrl, desktopInvoke } from "../desktopBridge";

const imagePreviewCache = new Map<string, string>();

export type PreviewImageItem = {
  id: string;
  title: string;
  alt?: string;
  path?: string;
  src?: string;
};

export function ImagePreviewLightbox(props: {
  images: PreviewImageItem[];
  index: number;
  onClose: () => void;
  onSelect: (index: number) => void;
}) {
  const image = props.images[props.index];
  const previewUrl = usePreviewImageSource(image);
  const multiple = props.images.length > 1;

  useEffect(() => {
    function handlePreviewKeys(event: KeyboardEvent) {
      if (event.key === "Escape") {
        props.onClose();
        return;
      }
      if (!multiple) return;
      if (event.key !== "ArrowRight" && event.key !== "ArrowLeft") return;
      event.preventDefault();
      const direction = event.key === "ArrowRight" ? 1 : -1;
      props.onSelect(
        (props.index + direction + props.images.length) % props.images.length,
      );
    }
    window.addEventListener("keydown", handlePreviewKeys);
    return () => window.removeEventListener("keydown", handlePreviewKeys);
  }, [multiple, props]);

  function move(direction: -1 | 1) {
    props.onSelect(
      (props.index + direction + props.images.length) % props.images.length,
    );
  }

  return (
    <div
      className="image-lightbox"
      role="dialog"
      aria-modal="true"
      aria-label="Image preview"
      onMouseDown={(event) => {
        if (event.target === event.currentTarget) props.onClose();
      }}
    >
      <button
        type="button"
        className="image-lightbox-close"
        onClick={props.onClose}
        aria-label="Close preview"
      >
        <X size={21} />
      </button>
      {multiple && (
        <button
          type="button"
          className="image-lightbox-nav previous"
          onClick={() => move(-1)}
          aria-label="Previous image"
        >
          <ChevronLeft size={24} />
        </button>
      )}
      <div className="image-lightbox-stage">
        {previewUrl ? (
          <img src={previewUrl} alt={image.alt ?? image.title} />
        ) : (
          <div className="image-lightbox-empty">
            <ImageIcon size={28} />
            <span>Preview unavailable</span>
          </div>
        )}
      </div>
      {multiple && (
        <button
          type="button"
          className="image-lightbox-nav next"
          onClick={() => move(1)}
          aria-label="Next image"
        >
          <ChevronRight size={24} />
        </button>
      )}
    </div>
  );
}

export function usePreviewImageSource(image: PreviewImageItem | null) {
  const key = imagePreviewKey(image);
  const [previewUrl, setPreviewUrl] = useState<string | null>(() =>
    key ? (imagePreviewCache.get(key) ?? null) : null,
  );

  useEffect(() => {
    const nextKey = imagePreviewKey(image);
    if (!image || !nextKey) {
      setPreviewUrl(null);
      return;
    }

    const cached = imagePreviewCache.get(nextKey);
    if (cached) {
      setPreviewUrl(cached);
      return;
    }

    if (image.src) {
      imagePreviewCache.set(nextKey, image.src);
      setPreviewUrl(image.src);
      return;
    }

    if (!image.path) {
      setPreviewUrl(null);
      return;
    }

    let cancelled = false;
    const fallbackUrl = imagePreviewUrl(image.path);
    const preview = desktopInvoke<string>("read_image_data_url", {
      path: image.path,
    });
    if (!preview) {
      setPreviewUrl(fallbackUrl);
      if (fallbackUrl) imagePreviewCache.set(nextKey, fallbackUrl);
      return;
    }

    preview
      .then((dataUrl) => {
        imagePreviewCache.set(nextKey, dataUrl);
        if (!cancelled) setPreviewUrl(dataUrl);
      })
      .catch(() => {
        if (fallbackUrl) imagePreviewCache.set(nextKey, fallbackUrl);
        if (!cancelled) setPreviewUrl(fallbackUrl);
      });

    return () => {
      cancelled = true;
    };
  }, [image, key]);

  return previewUrl;
}

export function imagePreviewUrl(path: string) {
  if (!path) return null;
  const nativePath = nativeFilePath(path);
  const desktopUrl = desktopFileUrl(nativePath);
  if (desktopUrl) return desktopUrl;
  if (/^[A-Za-z]:[\\/]/.test(nativePath)) {
    return encodeURI(`file:///${nativePath.replace(/\\/g, "/")}`);
  }
  if (nativePath.startsWith("/")) return encodeURI(`file://${nativePath}`);
  return null;
}

function imagePreviewKey(image: PreviewImageItem | null) {
  if (!image) return "";
  if (image.src) return `src:${image.id}:${image.src.slice(0, 96)}`;
  if (image.path) return `path:${image.path}`;
  return "";
}

function nativeFilePath(path: string) {
  const wslMatch = path.match(/^\/mnt\/([A-Za-z])\/(.+)$/);
  if (wslMatch) {
    return `${wslMatch[1].toUpperCase()}:\\${wslMatch[2].replace(/\//g, "\\")}`;
  }
  return path;
}
