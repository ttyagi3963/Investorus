// Guards the photo upload rules (T271): a file of the wrong type or size is refused before any
// request, and an accepted file goes straight to storage (never through /bff), then is attached
// once, at the first free position.
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { act, renderHook } from "@testing-library/react";
import { createElement, type ReactNode } from "react";
import { describe, expect, it, vi } from "vitest";
import { usePhotoUpload } from "./usePhotoUpload";

const requestUpload = vi.fn();
const attach = vi.fn();
vi.mock("../../lib/bff-client", () => ({
  photos: {
    requestUpload: (...args: unknown[]) => requestUpload(...args),
    attach: (...args: unknown[]) => attach(...args),
  },
}));

const wrapper = ({ children }: { children: ReactNode }) =>
  createElement(QueryClientProvider, { client: new QueryClient() }, children);
const image = (name: string, type: string, size = 2_000) => {
  const file = new File(["x"], name, { type });
  Object.defineProperty(file, "size", { value: size });
  return file;
};

describe("usePhotoUpload", () => {
  it("refuses a file of the wrong type or size before any request", async () => {
    const storage = vi.fn();
    vi.stubGlobal("fetch", storage);
    const { result } = renderHook(() => usePhotoUpload("p1", []), { wrapper });

    await act(() => result.current.upload([image("a.gif", "image/gif")]));
    expect(result.current.error).toMatch(/a\.gif/);
    await act(() => result.current.upload([image("b.jpg", "image/jpeg", 11 * 1024 * 1024)]));
    expect(result.current.error).toMatch(/b\.jpg/);

    expect(requestUpload).not.toHaveBeenCalled();
    expect(storage).not.toHaveBeenCalled();
  });

  it("uploads straight to storage, then attaches the photo once at the first free position", async () => {
    const upload = {
      url: "http://localhost:4100/objects/k1?sig=abc",
      method: "PUT",
      headers: { "Content-Type": "image/jpeg" },
      expiresAt: "2026-10-31T12:00:00.000Z",
    };
    requestUpload.mockResolvedValue({ storageKey: "k1", upload });
    attach.mockResolvedValue({ id: "ph2" });
    const storage = vi.fn().mockResolvedValue(new Response(null, { status: 200 }));
    vi.stubGlobal("fetch", storage);
    const file = image("house.jpg", "image/jpeg");
    const { result } = renderHook(() => usePhotoUpload("p1", [{ position: 0 }]), { wrapper });

    await act(() => result.current.upload([file]));

    expect(requestUpload).toHaveBeenCalledWith("p1", {
      contentType: "image/jpeg",
      sizeBytes: 2_000,
    });
    expect(storage).toHaveBeenCalledOnce();
    expect(storage).toHaveBeenCalledWith(upload.url, {
      method: "PUT",
      headers: upload.headers,
      body: file,
    });
    expect(attach).toHaveBeenCalledOnce();
    expect(attach).toHaveBeenCalledWith("p1", { storageKey: "k1", position: 1 });
    expect(result.current.error).toBeNull();
  });
});
