import { createFileRoute } from "@tanstack/react-router";
import { handleLume } from "@/lib/lume/http.server";

export const Route = createFileRoute("/api/lume")({
  server: {
    handlers: {
      GET: ({ request }) => handleLume(request),
      POST: ({ request }) => handleLume(request),
    },
  },
});
