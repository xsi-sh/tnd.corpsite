"use client";

import Link from "next/link";
import { AlertCircle } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardHeader,
  CardTitle,
  CardDescription,
  CardContent,
} from "@/components/ui/card";

export default function AppError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  return (
    <main className="mx-auto flex min-h-[calc(100vh-3.5rem-3.5rem)] max-w-6xl items-center px-4 py-8 sm:px-6 sm:py-10 lg:py-12">
      <div className="w-full">
        <Card className="border border-rose-500/40 bg-zinc-950/80">
          <CardHeader className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
            <div className="flex items-center gap-2 text-rose-200">
              <AlertCircle className="h-5 w-5" />
              <div>
                <CardTitle className="text-base sm:text-lg">
                  Something went wrong loading this panel
                </CardTitle>
                <CardDescription className="text-xs text-rose-100/80">
                  {error.message || "An unexpected error occurred."}
                </CardDescription>
              </div>
            </div>
          </CardHeader>
          <CardContent className="flex flex-wrap items-center gap-3 text-xs text-zinc-300">
            <Button
              type="button"
              variant="outline"
              size="sm"
              onClick={() => reset()}
            >
              Try again
            </Button>
            <Link
              href="/"
              className="inline-flex items-center rounded-md border border-zinc-700/70 bg-zinc-900/70 px-3 py-1.5 text-[0.75rem] text-zinc-200 transition-colors hover:border-emerald-500/60 hover:text-emerald-100"
            >
              Back to home
            </Link>
            {error.digest && (
              <span className="ml-auto text-[0.7rem] text-zinc-500">
                Error id: {error.digest}
              </span>
            )}
          </CardContent>
        </Card>
      </div>
    </main>
  );
}
