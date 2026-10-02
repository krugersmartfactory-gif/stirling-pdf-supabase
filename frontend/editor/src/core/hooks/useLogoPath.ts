import { useMemo } from "react";
import { useLogoAssets } from "@app/hooks/useLogoAssets";

/** KRUGER mark URLs used in icon-only brand placements. */
export function useLogoPath(): { dark: string; light: string } {
  const { getAssetPath } = useLogoAssets();

  return useMemo(
    () => ({
      dark: getAssetPath("mark-dark"),
      light: getAssetPath("mark-light"),
    }),
    [getAssetPath],
  );
}
