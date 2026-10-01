import { createFileRoute } from "@tanstack/react-router";
import JournalStudio from "@/components/journal/JournalStudio";

export const Route = createFileRoute("/_authenticated/journal/$journalId")({
  head: () => ({
    meta: [
      { title: "Journal — Tucked Away" },
      { name: "description", content: "Edit your junk journal pages." },
      { property: "og:title", content: "Journal — Tucked Away" },
      { property: "og:description", content: "A tactile junk journal in progress." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
      { name: "robots", content: "noindex" },
    ],
  }),
  component: JournalRoute,
});

function JournalRoute() {
  const { journalId } = Route.useParams();
  return <JournalStudio key={journalId} journalId={journalId} />;
}
