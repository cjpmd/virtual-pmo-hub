import { createFileRoute } from "@tanstack/react-router";
import { EfficiencyPipelinePage } from "@/components/efficiency/efficiency-pipeline";

export const Route = createFileRoute("/portfolio/efficiency/")({
  component: EfficiencyPipelinePage,
});
