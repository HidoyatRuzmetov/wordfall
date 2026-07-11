/**
 * Thin, defensive wrappers around the Devvit client SDK so the same game code
 * also runs in a plain browser (standalone preview / graceful fallback).
 */
import { navigateTo as devvitNavigate, context } from '@devvit/web/client';

/** Best-effort current username from Devvit context. */
export const getContextUsername = (): string | undefined => {
  try {
    return context?.username ?? undefined;
  } catch {
    return undefined;
  }
};

/** Are we actually running inside a Devvit webview? */
export const isDevvit = (): boolean => {
  try {
    return Boolean(context?.postId);
  } catch {
    return false;
  }
};

export const safeNavigate = (url: string): void => {
  try {
    devvitNavigate(url);
  } catch {
    try {
      window.open(url, '_blank');
    } catch {
      /* no-op */
    }
  }
};
