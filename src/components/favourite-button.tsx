import { useEffect, useState } from "react";
import { Star } from "lucide-react";
import { Button } from "@/components/ui/button";
export interface Favourite {id:string;label:string;to:string;type:"Project"|"Programme"|"View"}
const key="virtual-pmo-favourites";
export function FavouriteButton({item}:{item:Favourite}){const [active,setActive]=useState(false);useEffect(()=>{try{const items=JSON.parse(localStorage.getItem(key)??"[]") as Favourite[];setActive(items.some(entry=>entry.id===item.id))}catch{setActive(false)}},[item.id]);const toggle=()=>{let items:Favourite[]=[];try{items=JSON.parse(localStorage.getItem(key)??"[]") as Favourite[]}catch{items=[]}const next=active?items.filter(entry=>entry.id!==item.id):[...items,item];localStorage.setItem(key,JSON.stringify(next));setActive(!active);window.dispatchEvent(new Event("favourites-changed"))};return <Button variant="ghost" size="icon" onClick={toggle} aria-label={active?"Remove from favourites":"Add to favourites"}><Star className={active?"fill-primary text-primary":""}/></Button>}
export function readFavourites(){try{return JSON.parse(localStorage.getItem(key)??"[]") as Favourite[]}catch{return[]}}
