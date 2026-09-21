import { createFileRoute, redirect } from "@tanstack/react-router";
export const Route=createFileRoute("/governance/")({beforeLoad:()=>{throw redirect({to:"/governance/raidd",replace:true})}});
