import { createFileRoute, redirect } from "@tanstack/react-router";
export const Route=createFileRoute("/delivery/")({beforeLoad:()=>{throw redirect({to:"/delivery/tasks",replace:true})}});
