import { Star } from "lucide-react";
import { Button } from "@/components/ui/button";
import { useFavourites, FavouriteItem } from "@/hooks/use-favourites";
import { cn } from "@/lib/utils";

export function FavouriteButton({ item }: { item: FavouriteItem }) {
  const { isFavourite, toggleFavourite } = useFavourites();
  const active = isFavourite(item.id);

  return (
    <Button
      variant="ghost"
      size="icon"
      className={cn(
        "size-9 transition-colors",
        active ? "text-amber-400 hover:text-amber-500" : "text-muted-foreground hover:text-foreground"
      )}
      onClick={() => toggleFavourite(item)}
      aria-label={active ? "Remove from favourites" : "Add to favourites"}
    >
      <Star className={cn("size-5", active && "fill-current")} />
    </Button>
  );
}
