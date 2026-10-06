import { createFileRoute } from "@tanstack/react-router";
import { BenefitProfile } from "@/components/benefit-profile";
import { QueryState } from "@/components/query-state";
import { Breadcrumbs } from "@/components/section-nav";
import { useBenefits } from "@/hooks/use-benefits";

export const Route = createFileRoute("/benefits/$benefitId")({
  head: () => ({
    meta: [
      { title: "Benefit — Virtual PMO" },
      { name: "description", content: "Benefit profile and realisation evidence." },
      { property: "og:title", content: "Benefit — Virtual PMO" },
      { property: "og:description", content: "Benefit profile and realisation evidence." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary_large_image" },
    ],
  }),
  component: Page,
});

function Page() {
  const { benefitId } = Route.useParams();
  const benefits = useBenefits();
  return (
    <QueryState query={benefits}>
      {(data) => {
        const benefit = data.benefits.find((item) => item.id === benefitId);
        if (!benefit)
          return (
            <p className="rounded-lg border border-dashed p-10 text-center text-sm text-muted-foreground">
              We couldn't find that benefit. It may have been deleted, or you may not have access.
            </p>
          );
        return (
          <div className="space-y-6">
            <Breadcrumbs
              trail={[
                { label: "Benefits", to: "/benefits" },
                { label: "Register", to: "/benefits/register" },
                { label: `${benefit.reference} · ${benefit.title}` },
              ]}
            />
            <BenefitProfile benefit={benefit} data={data} />
          </div>
        );
      }}
    </QueryState>
  );
}
