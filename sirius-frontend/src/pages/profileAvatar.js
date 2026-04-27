import { supabase } from "../supabaseClient";

const AVATAR_BUCKET = "avatars";
const SIGNED_URL_EXPIRY_SEC = 3600;

/**
 * Storage path for a user's avatar (always avatar.png in user folder).
 * @param {string} userId
 * @returns {string}
 */
export function getAvatarStoragePath(userId) {
  return `${userId}/avatar.png`;
}

/**
 * Get a signed URL for viewing an avatar from the private bucket.
 * @param {string} storagePath - Path in bucket (e.g. "userId/avatar.png")
 * @returns {Promise<string|null>}
 */
export async function getSignedAvatarUrl(storagePath) {
  if (!storagePath) return null;
  const { data, error } = await supabase.storage
    .from(AVATAR_BUCKET)
    .createSignedUrl(storagePath, SIGNED_URL_EXPIRY_SEC);
  if (error) return null;
  return data?.signedUrl ?? null;
}

/**
 * Upload avatar file to storage and return the storage path.
 * Replaces existing file if present (upsert).
 * @param {string} userId
 * @param {File} file
 * @returns {Promise<{ path: string } | { error: string }>}
 */
export async function uploadAvatarFile(userId, file) {
  const path = getAvatarStoragePath(userId);
  const { error } = await supabase.storage
    .from(AVATAR_BUCKET)
    .upload(path, file, { upsert: true });
  if (error) return { error: error.message };
  return { path };
}

const MAX_AVATAR_BYTES = 2 * 1024 * 1024;
const ALLOWED_TYPES = ["image/jpeg", "image/png", "image/webp"];

/**
 * Validate avatar file (type and size).
 * @param {File} file
 * @returns {{ valid: true } | { valid: false; error: string }}
 */
export function validateAvatarFile(file) {
  if (!ALLOWED_TYPES.includes(file.type)) {
    return { valid: false, error: "Please use a JPG, PNG, or WebP image." };
  }
  if (file.size > MAX_AVATAR_BYTES) {
    return { valid: false, error: "Image must be 2MB or smaller." };
  }
  return { valid: true };
}
