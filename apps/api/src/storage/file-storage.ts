/** Where uploaded files live. Services depend on this, not on a vendor SDK. */
export interface FileStorage {
  upload(
    file: Buffer,
    options: { folder: string; fileName: string; ext?: FileExt },
  ): Promise<StoredFile>;
  /** Removes the file, and its copy on disk when its key is given. */
  remove(publicId: string, localKey?: string | null): Promise<void>;
}

export interface StoredFile {
  url: string;
  /** Cloudinary's id, or local:<key> while the file is on this server's disk only */
  publicId: string;
  /** the copy kept on this server's disk */
  localKey?: string;
}

/** A file waits on disk to go up to Cloudinary. */
export const isLocal = (publicId: string) => publicId.startsWith('local:');

/** A folder or file name Cloudinary accepts: no slashes or URL-special characters. */
export const safeName = (name: string) =>
  name.replace(/[\\/?&#%<>:"|*]+/g, ' ').replace(/\s+/g, ' ').trim().slice(0, 80) || '-';

/** The kinds of file kept: PDFs, and photos of papers. */
export type FileExt = 'pdf' | 'jpg' | 'png';

export const FILE_STORAGE = Symbol('FILE_STORAGE');
