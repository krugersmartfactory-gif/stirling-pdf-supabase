import "@app/components/shared/BrandMark.css";
import { BASE_PATH } from "@app/constants/app";

interface BrandMarkProps {
  /** Height of the mark (CSS length). */
  height?: string;
  className?: string;
}

/** KRUGER PDF logo used throughout the quick navigation. */
export function BrandMark({ height = "1.6rem", className }: BrandMarkProps) {
  return (
    <img
      className={`sui-brandmark${className ? ` ${className}` : ""}`}
      src={`${BASE_PATH}/images/logo.png`}
      alt="KRUGER PDF"
      style={{ height, width: "auto", objectFit: "contain" }}
    />
  );
}
