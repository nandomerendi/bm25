import { previewPathPrefix } from "@/lib/preview-path-prefix";

export function lumeUrl(): string {
  if (typeof window === "undefined") return "/api/lume";
  const prefix = previewPathPrefix(window.location.hostname, window.location.pathname);
  return `${prefix ?? ""}/api/lume`;
}
