import { useMemo } from "react";
import { BASE_PATH } from "@app/constants/app";

export function useLogoAssets() {
  return useMemo(() => {
    const logoPath = `${BASE_PATH}/images/logo.png`;
    const markPath = logoPath;

    return {
      folderPath: `${BASE_PATH}/images`,
      getAssetPath: (name: string) =>
        name.startsWith("mark-") ? markPath : logoPath,
      wordmark: {
        black: logoPath,
        grey: logoPath,
        white: logoPath,
      },
      tooltipLogo: markPath,
      firstPage: logoPath,
      favicon: logoPath,
      logo192: `${BASE_PATH}/images/logo192.png`,
      logo512: `${BASE_PATH}/images/logo512.png`,
      manifestHref: `${BASE_PATH}/manifest.json`,
    };
  }, []);
}
