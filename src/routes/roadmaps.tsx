import { createFileRoute, redirect } from "@tanstack/react-router";
export const Route=createFileRoute("/roadmaps")({beforeLoad:()=>{throw redirect({to:"/portfolio/roadmap",replace:true})}});
