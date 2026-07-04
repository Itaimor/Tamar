import React, { useState, useEffect, useRef } from "react";
import { cn } from "@/lib/utils";
import { Skeleton } from "@/components/ui/skeleton";

interface ImageWithSkeletonProps extends React.ImgHTMLAttributes<HTMLImageElement> {
  skeletonClassName?: string;
}

export const ImageWithSkeleton = ({
  src,
  alt,
  className,
  skeletonClassName,
  ...props
}: ImageWithSkeletonProps) => {
  const [loaded, setLoaded] = useState(false);
  const [error, setError] = useState(false);
  const imgRef = useRef<HTMLImageElement>(null);

  useEffect(() => {
    const img = imgRef.current;
    if (img) {
      if (img.complete) {
        if (img.naturalWidth === 0) {
          setError(true);
          setLoaded(false);
        } else {
          setLoaded(true);
          setError(false);
        }
      } else {
        setLoaded(false);
        setError(false);
      }
    } else {
      setLoaded(false);
      setError(false);
    }
  }, [src]);

  const handleLoad = () => {
    setLoaded(true);
    setError(false);
  };

  const handleError = () => {
    setError(true);
    setLoaded(false);
  };

  return (
    <div className="relative w-full h-full overflow-hidden">
      {!loaded && !error && (
        <Skeleton
          className={cn(
            "absolute inset-0 w-full h-full bg-secondary/80 animate-pulse rounded-none",
            skeletonClassName
          )}
        />
      )}
      <img
        ref={imgRef}
        src={src}
        alt={alt}
        className={cn(
          className,
          "transition-opacity duration-300 ease-in-out",
          loaded ? "opacity-100" : "opacity-0 absolute inset-0 pointer-events-none"
        )}
        onLoad={handleLoad}
        onError={handleError}
        {...props}
      />
      {error && (
        <div className="absolute inset-0 flex items-center justify-center bg-secondary border border-primary/10 text-[#667864] font-medium text-xs text-center p-2">
          Image not available
        </div>
      )}
    </div>
  );
};

export default ImageWithSkeleton;
