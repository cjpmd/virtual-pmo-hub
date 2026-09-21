import { createFileRoute, redirect } from "@tanstack/react-router";
export const Route=createFileRoute("/lessons/actions")({beforeLoad:()=>{throw redirect({to:"/governance/improvement-actions",replace:true})}});
