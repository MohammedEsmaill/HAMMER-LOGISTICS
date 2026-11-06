/** Where uploaded files live. Services depend on this, not on a vendor SDK. */
export interface FileStorage {
  upload(
    file: Buffer,
    options: { folder: string; fileName: string },
  ): Promise<StoredFile>;
  remove(publicId: string): Promise<void>;
}

export interface StoredFile {
  url: string;
  publicId: string;
}

export const FILE_STORAGE = Symbol('FILE_STORAGE');
