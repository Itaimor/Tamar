import { ChangeEvent, DragEvent, useId, useState } from "react";
import { Image as ImageIcon, Loader2, Upload, X } from "lucide-react";
import { toast } from "sonner";
import { uploadUserImage, validateImageFile } from "@/lib/imageUploads";

type ImageUploadDropzoneProps = {
  userId: string;
  folder: "meal-logs" | "personal-recipes";
  imageUrl: string;
  onImageUrlChange: (url: string) => void;
  label: string;
  dark?: boolean;
  capture?: "user" | "environment";
  primaryText?: string;
  helperText?: string;
  onBeforeUpload?: () => boolean;
};

const ImageUploadDropzone = ({
  userId,
  folder,
  imageUrl,
  onImageUrlChange,
  label,
  dark = false,
  capture,
  primaryText,
  helperText,
  onBeforeUpload,
}: ImageUploadDropzoneProps) => {
  const inputId = useId();
  const [dragging, setDragging] = useState(false);
  const [uploading, setUploading] = useState(false);

  const uploadFile = async (file: File | null | undefined) => {
    if (!file) return;
    if (onBeforeUpload?.() === false) {
      setDragging(false);
      return;
    }

    setUploading(true);
    try {
      validateImageFile(file);
      const url = await uploadUserImage({ userId, file, folder });
      onImageUrlChange(url);
      toast.success("Image uploaded.");
    } catch (error) {
      console.error("Image upload failed:", error);
      toast.error(error instanceof Error ? error.message : "Could not upload that image.");
    } finally {
      setUploading(false);
      setDragging(false);
    }
  };

  const handleInputChange = async (event: ChangeEvent<HTMLInputElement>) => {
    await uploadFile(event.target.files?.[0]);
    event.target.value = "";
  };

  const handleDrop = async (event: DragEvent<HTMLLabelElement>) => {
    event.preventDefault();
    await uploadFile(event.dataTransfer.files?.[0]);
  };

  const borderClass = dragging
    ? dark
      ? "border-cyan-200/70 bg-cyan-200/[0.08]"
      : "border-primary/50 bg-primary/5"
    : dark
      ? "border-white/10 bg-black/20 hover:border-cyan-200/45"
      : "border-primary/15 bg-white hover:border-primary/40";

  return (
    <div className="grid gap-2">
      <span className={dark ? "text-xs font-medium text-white/55" : "text-xs font-bold text-[#667864]"}>{label}</span>
      {imageUrl ? (
        <div className={dark ? "rounded-lg border border-white/10 bg-black/20 p-2" : "rounded-lg border border-primary/15 bg-white p-2"}>
          <div className="flex gap-3">
            <img src={imageUrl} alt="" className="h-20 w-28 rounded-lg object-cover" />
            <div className="flex min-w-0 flex-1 flex-col justify-between">
              <p className={dark ? "truncate text-sm text-white/70" : "truncate text-sm text-[#536451]"}>Image uploaded</p>
              <button
                type="button"
                onClick={() => onImageUrlChange("")}
                className={dark
                  ? "inline-flex w-fit items-center gap-1.5 rounded-lg border border-white/10 px-2.5 py-1 text-xs text-white/65 hover:bg-white/[0.06]"
                  : "inline-flex w-fit items-center gap-1.5 rounded-lg border border-primary/15 px-2.5 py-1 text-xs text-[#536451] hover:bg-primary/5"}
              >
                <X size={13} />
                Remove
              </button>
            </div>
          </div>
        </div>
      ) : (
        <label
          htmlFor={inputId}
          onDragEnter={(event) => {
            event.preventDefault();
            setDragging(true);
          }}
          onDragOver={(event) => event.preventDefault()}
          onDragLeave={() => setDragging(false)}
          onDrop={handleDrop}
          className={`grid min-h-28 cursor-pointer place-items-center rounded-lg border border-dashed px-4 py-5 text-center transition ${borderClass}`}
        >
          <input
            id={inputId}
            type="file"
            accept="image/*"
            capture={capture}
            className="sr-only"
            onChange={handleInputChange}
            disabled={uploading}
          />
          <div className="grid place-items-center gap-2">
            <div className={dark ? "grid h-10 w-10 place-items-center rounded-lg bg-white/[0.06] text-cyan-100" : "grid h-10 w-10 place-items-center rounded-lg bg-primary/10 text-primary"}>
              {uploading ? <Loader2 size={18} className="animate-spin" /> : dragging ? <Upload size={18} /> : <ImageIcon size={18} />}
            </div>
            <div>
              <p className={dark ? "text-sm font-medium text-white/75" : "text-sm font-semibold text-[#344c38]"}>
                {uploading ? "Uploading..." : primaryText || "Drop an image here or browse"}
              </p>
              <p className={dark ? "mt-1 text-xs text-white/40" : "mt-1 text-xs text-[#667864]"}>
                {helperText || "JPG, PNG, or WebP under 6 MB"}
              </p>
            </div>
          </div>
        </label>
      )}
    </div>
  );
};

export default ImageUploadDropzone;
