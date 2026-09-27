/** Where the API serves the library's media (the backend's `mediaUrl`). */
export const MEDIA_PATH = '/api/v1/media/';

/** The address of a library media, by its id. */
export function mediaUrl(id: string): string {
  return `${MEDIA_PATH}${id}`;
}
