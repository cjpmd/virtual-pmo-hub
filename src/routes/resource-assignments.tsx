import { createFileRoute, redirect } from "@tanstack/react-router";
export const Route=createFileRoute("/resource-assignments")({beforeLoad:()=>{throw redirect({to:"/resources/assignments",replace:true})}});
