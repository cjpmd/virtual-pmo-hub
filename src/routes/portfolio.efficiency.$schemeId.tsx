import { createFileRoute } from "@tanstack/react-router";
import { SchemeDetailPage } from "@/components/efficiency/scheme-detail";

// NHS-4: one efficiency / savings scheme (details, stage, phasing, validation, impact assessment).
const title = "Savings scheme — ORMO PMO",
  description =
    "A savings scheme's stage, monthly phasing, finance validation and impact assessment.";
export const Route = createFileRoute("/portfolio/efficiency/$schemeId")({
  head: () => ({
    meta: [
      { title },
      { name: "description", content: description },
      { property: "og:title", content: title },
      { property: "og:description", content: description },
      { property: "og:type", content: "website" },
    ],
  }),
  component: SchemePage,
});

function SchemePage() {
  const { schemeId } = Route.useParams();
  return <SchemeDetailPage schemeId={schemeId} />;
}
