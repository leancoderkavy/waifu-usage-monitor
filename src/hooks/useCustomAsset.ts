import { useEffect, useState } from "react";
import { api, type CustomKind } from "../api";

/**
 * Object URL for an uploaded avatar, portrait or model, or null when none is set.
 * `version` is the upload time from settings; a new upload changes it and reloads.
 */
export function useCustomAsset(kind: CustomKind, version: number | undefined): string | null {
  const [url, setUrl] = useState<string | null>(null);
  useEffect(() => {
    if (!version) {
      setUrl(null);
      return;
    }
    let alive = true;
    let made: string | null = null;
    api
      .readCustomAsset(kind)
      .then((bytes) => {
        if (!alive || bytes.byteLength === 0) return;
        made = URL.createObjectURL(new Blob([bytes]));
        setUrl(made);
      })
      .catch((e) => console.warn(`custom ${kind} failed to load`, e));
    return () => {
      alive = false;
      if (made) URL.revokeObjectURL(made);
    };
  }, [kind, version]);
  return url;
}
