import { createFileRoute, redirect } from "@tanstack/react-router";
export const Route=createFileRoute("/assumptions")({beforeLoad:()=>{throw redirect({to:"/governance/raidd",replace:true})}});
