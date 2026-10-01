import { createFileRoute } from "@tanstack/react-router";
import JournalStudio from "@/components/journal/JournalStudio";

export const Route = createFileRoute("/")({
  head: () => ({
    meta: [
      { title: "Tucked Away — Junk Journal Studio" },
      { name: "description", content: "A tactile, freeform digital junk journal for collecting photos, scraps, notes, and little memories." },
      { property: "og:title", content: "Tucked Away — Junk Journal Studio" },
      { property: "og:description", content: "Make a cozy, layered junk journal with photos, paper scraps, tape, stickers, and handwritten notes." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary_large_image" },
    ],
  }),
  component: Index,
});

function Index() {
  return <JournalStudio />;
}
