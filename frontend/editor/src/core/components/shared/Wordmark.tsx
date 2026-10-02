import React from "react";
import { useLogoAssets } from "@app/hooks/useLogoAssets";

interface WordmarkProps extends React.ImgHTMLAttributes<HTMLImageElement> {
  alt?: string;
  muted?: boolean;
}

export function Wordmark({
  alt = "KRUGER PDF",
  muted: _muted,
  ...props
}: WordmarkProps) {
  const { wordmark } = useLogoAssets();
  return <img src={wordmark.black} alt={alt} {...props} />;
}
