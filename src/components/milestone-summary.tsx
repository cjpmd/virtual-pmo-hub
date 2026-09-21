import { formatDate } from "@/lib/format";
import { Link } from "@tanstack/react-router";
import { DeliveryStatusIcon } from "@/components/board-workspace";
import type { PortfolioMilestone } from "@/services/pmo";

export function MilestoneSummary({items,limit=5}:{items:PortfolioMilestone[];limit?:number}){
  const visible=[...items].filter(item=>item.status!=="Completed").sort((a,b)=>a.forecastDate.localeCompare(b.forecastDate)).slice(0,limit);
  return <div className="divide-y">{visible.map(item=><Link key={`${item.projectId}-${item.id}`} to="/portfolio/projects/$projectId" params={{projectId:item.projectId}} className="flex items-start gap-3 py-3 hover:bg-accent/30"><DeliveryStatusIcon status={item.status}/><div className="min-w-0 flex-1"><p className="truncate text-sm font-medium">{item.title}</p><p className="truncate text-xs text-muted-foreground">{item.projectName} · {item.type}</p></div><div className="shrink-0 text-right"><p className="text-xs font-medium">{formatDate(item.forecastDate)}</p>{item.slipDays>0&&<p className="text-[10px] text-health-warn-foreground">+{item.slipDays} days</p>}</div></Link>)}{visible.length===0&&<p className="py-5 text-sm text-muted-foreground">No upcoming milestones.</p>}</div>
}