import React from "react";
import { useLogoPath } from "@app/hooks/useLogoPath";

interface LogoIconProps extends React.ImgHTMLAttributes<HTMLImageElement> {
  alt?: string;
}

export function LogoIcon({ alt = "KRUGER PDF", ...props }: LogoIconProps) {
  const logoPaths = useLogoPath();
  return <img src={logoPaths.light} alt={alt} {...props} />;
}
