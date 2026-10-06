// The product preview in the homepage hero: a stylised portfolio overview built from
// components, filled with example data (never live data).
import { cn } from "@/lib/utils";

type Rating = "On track" | "At risk" | "Off track";

interface PreviewStat {
  label: string;
  value: number;
  rating?: Rating;
}

interface PreviewProject {
  name: string;
  declared: Rating;
  evidenced: Rating;
  forecastFinish: string;
}

const example = {
  breadcrumb: "Portfolio · Digital transformation · Example data",
  menu: ["Overview", "Programmes", "Projects", "RAID", "Benefits", "Reports"],
  stats: [
    { label: "Active projects", value: 24 },
    { label: "On track", value: 15, rating: "On track" },
    { label: "At risk", value: 6, rating: "At risk" },
    { label: "Off track", value: 3, rating: "Off track" },
  ] satisfies PreviewStat[],
  projects: [
    {
      name: "Customer portal",
      declared: "On track",
      evidenced: "At risk",
      forecastFinish: "Mar 2027",
    },
    {
      name: "Finance system upgrade",
      declared: "On track",
      evidenced: "On track",
      forecastFinish: "Jun 2027",
    },
    {
      name: "Data platform",
      declared: "At risk",
      evidenced: "Off track",
      forecastFinish: "Jan → May 2027",
    },
  ] satisfies PreviewProject[],
};

const dot: Record<Rating, string> = {
  "On track": "bg-site-good",
  "At risk": "bg-site-warn",
  "Off track": "bg-site-bad",
};
const ratingText: Record<Rating, string> = {
  "On track": "text-site-good",
  "At risk": "text-site-warn",
  "Off track": "text-site-bad",
};

/** A rating with its dot. Only ratings that need attention are coloured as text. */
function RatingLabel({ rating }: { rating: Rating }) {
  return (
    <span
      className={cn(
        "inline-flex items-center gap-1.5",
        rating !== "On track" && ratingText[rating],
      )}
    >
      <span className={cn("size-2 rounded-full", dot[rating])} />
      {rating}
    </span>
  );
}

function StatTile({ stat }: { stat: PreviewStat }) {
  return (
    <div className="flex flex-[1_1_140px] flex-col gap-1.5 rounded-xl border border-site-ink-line bg-site-ink-sunken px-4 py-3.5">
      <span className="text-[0.8rem] text-site-on-ink-faint">{stat.label}</span>
      <span
        className={cn(
          "text-[1.6rem] font-semibold",
          stat.rating ? ratingText[stat.rating] : "text-site-on-ink",
        )}
      >
        {stat.value}
      </span>
    </div>
  );
}

function ProjectTable({ projects }: { projects: PreviewProject[] }) {
  return (
    <div className="overflow-x-auto rounded-xl border border-site-ink-line">
      <table className="w-full min-w-[600px] border-collapse text-[0.9rem] text-site-on-ink-table">
        <thead>
          <tr className="text-left text-[0.78rem] text-site-on-ink-faint">
            <th scope="col" className="px-4 py-3 font-medium">
              Project
            </th>
            <th scope="col" className="p-3 font-medium">
              Declared
            </th>
            <th scope="col" className="p-3 font-medium">
              Evidenced
            </th>
            <th scope="col" className="px-4 py-3 font-medium">
              Forecast finish
            </th>
          </tr>
        </thead>
        <tbody>
          {projects.map((project) => (
            <tr key={project.name} className="border-t border-site-ink-line">
              <td className="px-4 py-3">{project.name}</td>
              <td className="p-3">
                <RatingLabel rating={project.declared} />
              </td>
              <td className="p-3">
                <RatingLabel rating={project.evidenced} />
              </td>
              <td className="px-4 py-3 font-geist-mono text-[0.82rem]">{project.forecastFinish}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

export function ProductPreview() {
  return (
    <figure
      aria-label="Product preview, example data"
      className="mt-12 w-full overflow-hidden rounded-t-2xl border border-b-0 border-site-ink-edge bg-site-ink-raised text-left"
    >
      <div className="flex items-center gap-2 border-b border-site-ink-line px-4 py-3">
        {[0, 1, 2].map((i) => (
          <span key={i} className="size-2.5 rounded-full bg-site-ink-dot" />
        ))}
        <span className="ml-3 font-geist-mono text-[0.78rem] text-site-on-ink-faint">
          {example.breadcrumb}
        </span>
      </div>
      <div className="flex flex-wrap">
        <div className="flex max-w-[220px] flex-[1_1_180px] flex-col gap-1 border-r border-site-ink-line px-3.5 py-[18px] text-[0.9rem] text-site-on-ink-menu">
          {example.menu.map((item, index) => (
            <span
              key={item}
              className={cn(
                "rounded-lg px-2.5 py-2",
                index === 0 && "bg-site-ink-active font-medium text-site-on-ink",
              )}
            >
              {item}
            </span>
          ))}
        </div>
        <div className="flex min-w-0 flex-[999_1_560px] flex-col gap-4 p-5">
          <div className="flex flex-wrap gap-3">
            {example.stats.map((stat) => (
              <StatTile key={stat.label} stat={stat} />
            ))}
          </div>
          <ProjectTable projects={example.projects} />
        </div>
      </div>
    </figure>
  );
}
