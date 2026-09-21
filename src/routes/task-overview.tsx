import { createFileRoute, redirect } from "@tanstack/react-router";
export const Route=createFileRoute("/task-overview")({beforeLoad:()=>{throw redirect({to:"/delivery/tasks",replace:true})}});
