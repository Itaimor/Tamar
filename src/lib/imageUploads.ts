import { supabase } from "@/lib/supabase";

export const USER_UPLOADS_BUCKET = "user-uploads";

const MAX_IMAGE_BYTES = 6 * 1024 * 1024;

const extensionForFile = (file: File) => {
  const fromName = file.name.split(".").pop()?.toLowerCase();
  if (fromName && /^[a-z0-9]+$/.test(fromName)) return fromName;
  return file.type.split("/")[1]?.toLowerCase() || "jpg";
};

const publicUrlForPath = (path: string) => {
  if (!supabase) throw new Error("Tamar is not connected to Supabase yet.");
  const { data } = supabase.storage.from(USER_UPLOADS_BUCKET).getPublicUrl(path);
  return data.publicUrl;
};

export const validateImageFile = (file: File) => {
  if (!file.type.startsWith("image/")) {
    throw new Error("Choose an image file.");
  }
  if (file.size > MAX_IMAGE_BYTES) {
    throw new Error("Choose an image smaller than 6 MB.");
  }
};

export const uploadUserImage = async ({
  userId,
  file,
  folder,
}: {
  userId: string;
  file: File;
  folder: "meal-logs" | "personal-recipes";
}) => {
  if (!supabase) throw new Error("Tamar is not connected to Supabase yet.");
  validateImageFile(file);

  const extension = extensionForFile(file);
  const path = `${userId}/${folder}/${crypto.randomUUID()}.${extension}`;
  const { error } = await supabase.storage.from(USER_UPLOADS_BUCKET).upload(path, file, {
    cacheControl: "3600",
    contentType: file.type || "image/jpeg",
    upsert: false,
  });

  if (error) throw error;
  return publicUrlForPath(path);
};
