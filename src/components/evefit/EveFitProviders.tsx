"use client";

import {
  createContext,
  useCallback,
  useContext,
  useMemo,
  useState,
  type ReactNode,
} from "react";
import {
  DEFAULT_FIT,
  calculateFitStats,
  clampSlotList,
  decodeFit,
  encodeFit,
  getHullById,
  type Fit,
  type FitStats,
  type SlotType,
} from "./localData";

type EveFitContextValue = {
  fit: Fit;
  stats: FitStats;
  encodedFit: string;
  setFit: (fit: Fit) => void;
  setHull: (hullId: string) => void;
  addModule: (slot: SlotType, moduleId: string) => void;
  removeModule: (slot: SlotType, index: number) => void;
  clearFit: () => void;
  importFit: (encoded: string) => Fit | null;
};

const EveFitContext = createContext<EveFitContextValue | null>(null);

const slotKey = (slot: SlotType): "highs" | "mids" | "lows" => {
  if (slot === "high") return "highs";
  if (slot === "mid") return "mids";
  return "lows";
};

export function EveFitProviders({ children }: { children: ReactNode }) {
  const [fit, setFit] = useState<Fit>(DEFAULT_FIT);

  const setHull = useCallback((hullId: string) => {
    setFit({
      hullId,
      highs: [],
      mids: [],
      lows: [],
    });
  }, []);

  const addModule = useCallback((slot: SlotType, moduleId: string) => {
    setFit((prev) => {
      const hull = getHullById(prev.hullId);
      if (!hull) return prev;

      const key = slotKey(slot);
      const maxSlots = hull[key];
      const existing = prev[key].slice(0, maxSlots);

      if (existing.length >= maxSlots) {
        existing[maxSlots - 1] = moduleId;
      } else {
        existing.push(moduleId);
      }

      return {
        ...prev,
        [key]: existing,
      };
    });
  }, []);

  const removeModule = useCallback((slot: SlotType, index: number) => {
    setFit((prev) => {
      const key = slotKey(slot);
      const next = prev[key].slice();
      if (index < 0 || index >= next.length) return prev;
      next.splice(index, 1);
      return {
        ...prev,
        [key]: next,
      };
    });
  }, []);

  const clearFit = useCallback(() => {
    setFit(DEFAULT_FIT);
  }, []);

  const importFit = useCallback((encoded: string) => decodeFit(encoded), []);

  const sanitizedFit = useMemo(() => {
    const hull = getHullById(fit.hullId);
    if (!hull) return fit;
    return ["high", "mid", "low"].reduce<Fit>((acc, slot) => {
      const keyed = clampSlotList(acc, hull, slot as SlotType);
      return keyed;
    }, fit);
  }, [fit]);

  const stats = useMemo(() => calculateFitStats(sanitizedFit), [sanitizedFit]);
  const encodedFit = useMemo(() => encodeFit(sanitizedFit), [sanitizedFit]);

  const value = useMemo(
    () => ({
      fit: sanitizedFit,
      stats,
      encodedFit,
      setFit,
      setHull,
      addModule,
      removeModule,
      clearFit,
      importFit,
    }),
    [sanitizedFit, stats, encodedFit, setHull, addModule, removeModule, clearFit, importFit],
  );

  return <EveFitContext.Provider value={value}>{children}</EveFitContext.Provider>;
}

export const useEveFit = () => {
  const ctx = useContext(EveFitContext);
  if (!ctx) {
    throw new Error("useEveFit must be used within EveFitProviders");
  }
  return ctx;
};
