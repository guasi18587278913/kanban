'use client';

import { useMediaQuery } from './use-media-query';

export function useMedia(query: string): boolean {
  return useMediaQuery(query, true);
}
