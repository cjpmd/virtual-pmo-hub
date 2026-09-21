import { createFileRoute, redirect } from "@tanstack/react-router";
export const Route=createFileRoute("/resource-allocation")({beforeLoad:()=>{throw redirect({to:"/resources/allocation",replace:true})}});
