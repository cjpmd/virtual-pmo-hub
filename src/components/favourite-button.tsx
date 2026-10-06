import { Star } from "lucide-react";
import { Button } from "@/components/ui/button";
import { useFavourites, type FavouriteTarget } from "@/hooks/use-favourites";

/** Star a project or programme; favourites show in the sidebar and follow the user across devices. */
export function FavouriteButton({ target }: { target: FavouriteTarget }) {
  const { isFavourite, toggle } = useFavourites();
  const active = isFavourite(target);
  return (
    <Button
      variant="ghost"
      size="icon"
      disabled={toggle.isPending}
      onClick={() => toggle.mutate(target)}
      aria-label={active ? "Remove from favourites" : "Add to favourites"}
      aria-pressed={active}
    >
      <Star className={active ? "fill-primary text-primary" : ""} />
    </Button>
  );
}
