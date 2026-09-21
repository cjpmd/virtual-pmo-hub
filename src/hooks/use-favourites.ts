import { useState, useEffect } from "react";

export type FavouriteItem = {
  id: string;
  type: "project" | "programme";
  name: string;
};

export function useFavourites() {
  const [favourites, setFavourites] = useState<FavouriteItem[]>([]);

  useEffect(() => {
    const stored = localStorage.getItem("vpmo_favourites");
    if (stored) {
      try {
        setFavourites(JSON.parse(stored));
      } catch (e) {
        console.error("Failed to parse favourites", e);
      }
    }
  }, []);

  const toggleFavourite = (item: FavouriteItem) => {
    setFavourites((prev) => {
      const exists = prev.find((i) => i.id === item.id);
      const next = exists
        ? prev.filter((i) => i.id !== item.id)
        : [...prev, item];
      localStorage.setItem("vpmo_favourites", JSON.stringify(next));
      return next;
    });
  };

  const isFavourite = (id: string) => favourites.some((i) => i.id === id);

  return { favourites, toggleFavourite, isFavourite };
}
