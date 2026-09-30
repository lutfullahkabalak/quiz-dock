import { createContext, useContext } from 'react';

/** Where the API serves the library's media (the backend's `mediaUrl`). */
export const MEDIA_PATH = '/api/v1/media/';

/** The address of a library media, by its id. */
export function mediaUrl(id: string): string {
  return `${MEDIA_PATH}${id}`;
}

/** Turns a media id into the address its file is served at. */
export type MediaResolver = (id: string) => string;

/**
 * Where the media of what is drawn below are served: the library by default; a
 * template's preview gives its own (its files live in the catalogue).
 */
export const MediaUrlContext = createContext<MediaResolver>(mediaUrl);

export const useMediaUrl = () => useContext(MediaUrlContext);
