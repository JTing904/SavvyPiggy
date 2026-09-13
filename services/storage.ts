import { ref, uploadBytes, getDownloadURL, deleteObject } from 'firebase/storage';
import { storage } from '../lib/firebase';
import { m } from '../i18n';

const MAX_BYTES = 5 * 1024 * 1024;

/** Uploads a goal cover image and returns its public download URL. */
export const uploadGoalImage = async (uid: string, file: File) => {
  if (!file.type.startsWith('image/')) throw new Error(m().errors.chooseImage);
  if (file.size > MAX_BYTES) throw new Error(m().errors.imageTooLarge);

  const ext = file.name.split('.').pop()?.toLowerCase() || 'jpg';
  const path = `users/${uid}/goals/${crypto.randomUUID()}.${ext}`;
  const fileRef = ref(storage, path);

  await uploadBytes(fileRef, file, { contentType: file.type });
  return getDownloadURL(fileRef);
};

/** Best-effort cleanup; a missing or foreign URL is simply ignored. */
export const deleteGoalImage = async (url: string) => {
  if (!url.includes('firebasestorage')) return;
  try {
    await deleteObject(ref(storage, url));
  } catch {
    /* already gone */
  }
};
