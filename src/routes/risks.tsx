import { createFileRoute, redirect } from "@tanstack/react-router";
export const Route=createFileRoute("/risks")({beforeLoad:()=>{throw redirect({to:"/governance/raidd",replace:true})}});
