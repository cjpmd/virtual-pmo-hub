import { createFileRoute, redirect } from "@tanstack/react-router";
export const Route=createFileRoute("/programmes/")({beforeLoad:()=>{throw redirect({to:"/portfolio/programmes",replace:true})}});
