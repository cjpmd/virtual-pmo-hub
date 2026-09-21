import { createFileRoute, redirect } from "@tanstack/react-router";
export const Route=createFileRoute("/decisions/forum")({beforeLoad:()=>{throw redirect({to:"/governance/forum",replace:true})}});
