import { createFileRoute, redirect } from "@tanstack/react-router";
export const Route=createFileRoute("/projects/$projectId")({beforeLoad:({params})=>{throw redirect({to:"/portfolio/projects/$projectId",params,replace:true})}});
