"use client";

import { useEffect, useRef } from "react";
import { useEveFit } from "./EveFitProviders";

export function LocationHash() {
  const { importFit, setFit, encodedFit } = useEveFit();
  const didImportRef = useRef(false);

  useEffect(() => {
    if (typeof window === "undefined" || didImportRef.current) return;
    didImportRef.current = true;

    const urlParams = new URLSearchParams(window.location.search);
    const hash = urlParams.get("fit");
    if (hash && hash.length > 1) {
      const fit = importFit(hash);
      if (fit) {
        setFit(fit);
      }
    }
  }, [importFit, setFit]);

  useEffect(() => {
    if (typeof window === "undefined") return;
    if (!encodedFit) return;

    const url = new URL(window.location.href);
    url.searchParams.set("fit", encodedFit);
    window.history.replaceState(null, "", url.toString());
  }, [encodedFit]);

  return null;
}
