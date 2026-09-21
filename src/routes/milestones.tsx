import { createFileRoute, redirect } from "@tanstack/react-router";
export const Route=createFileRoute("/milestones")({beforeLoad:()=>{throw redirect({to:"/delivery/milestones",replace:true})}});
