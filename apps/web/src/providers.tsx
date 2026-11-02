"use client";
// The app's client-side providers, composed once (T093's Sprint 1 part, constitution XIII): React
// Query holds the server state the screens read (packages, photos), with the app's settings from
// lib/query-client.ts (T334), and the one toast region every screen can post to (T422).
import { Toaster } from "@clever/ui";
import { QueryClientProvider } from "@tanstack/react-query";
import { useState, type ReactNode } from "react";
import { createQueryClient } from "@/lib/query-client";

export function Providers({ children }: { children: ReactNode }) {
  const [client] = useState(createQueryClient);
  return (
    <QueryClientProvider client={client}>
      {children}
      <Toaster />
    </QueryClientProvider>
  );
}
