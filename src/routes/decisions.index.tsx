import { createFileRoute, redirect } from "@tanstack/react-router";
export const Route=createFileRoute("/decisions/")({beforeLoad:()=>{throw redirect({to:"/governance/raidd",replace:true})}});
