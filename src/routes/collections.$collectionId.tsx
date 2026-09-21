import { createFileRoute, redirect } from "@tanstack/react-router";
export const Route=createFileRoute("/collections/$collectionId")({beforeLoad:({params})=>{throw redirect({to:"/portfolio/collections/$collectionId",params,replace:true})}});
