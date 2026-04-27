/**
 * Single source of truth for client-side CDM upload size checks.
 * Align with your Supabase Storage bucket `file_size_limit` and global limits.
 * Large-file architecture: browser still enforces a practical maximum before upload.
 */
export const MAX_CDM_FILE_SIZE_BYTES = 5 * 1024 * 1024 * 1024; // 5 GiB

/** Human-readable label for error messages (keep in sync with MAX_CDM_FILE_SIZE_BYTES). */
export const MAX_CDM_FILE_SIZE_LABEL = "5 GB";
