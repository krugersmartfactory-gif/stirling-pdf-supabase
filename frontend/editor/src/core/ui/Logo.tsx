import type { CSSProperties } from "react";
import { BASE_PATH } from "@app/constants/app";
import "@app/ui/Logo.css";

/** Layout-compatible KRUGER logo used in the shared application chrome. */
export type LogoVariant = "iconOnly" | "iconAndText" | "textOnly";

interface LogoProps {
  variant?: LogoVariant;
  /** Layout for iconAndText: mark left of text, or stacked above it. */
  orientation?: "horizontal" | "vertical";
  /** Height of the mark (CSS length). */
  iconHeight?: string;
  /** Height of the wordmark (CSS length). */
  textHeight?: string;
  /** Gap between mark and wordmark. */
  gap?: string;
  className?: string;
  style?: CSSProperties;
  alt?: string;
}

/**
 * Shared KRUGER logo used across the editor and processor.
 */
export function Logo({
  variant = "iconAndText",
  orientation = "horizontal",
  iconHeight = "1.75rem",
  textHeight = "1rem",
  gap = "0.5rem",
  className,
  style,
  alt = "KRUGER PDF",
}: LogoProps) {
  const cls = [
    "sui-logo",
    orientation === "vertical" ? "sui-logo--vertical" : "",
    className ?? "",
  ]
    .filter(Boolean)
    .join(" ");

  // Layout set inline so a consumer's className can't restack the lockup.
  const layoutStyle: CSSProperties = {
    display: orientation === "vertical" ? "flex" : "inline-flex",
    flexDirection: orientation === "vertical" ? "column" : "row",
    alignItems: "center",
    gap,
  };

  const height =
    variant === "textOnly"
      ? textHeight
      : orientation === "vertical" && variant === "iconAndText"
        ? `calc(${iconHeight} + ${textHeight} + ${gap})`
        : iconHeight;
  if (variant === "textOnly") {
    return (
      <span className={cls} style={{ ...layoutStyle, ...style }}>
        <span
          className="sui-logo__wordmark"
          style={{
            color: "var(--c-text)",
            fontSize: textHeight,
            fontWeight: 700,
            lineHeight: 1,
          }}
        >
          KRUGER
        </span>
      </span>
    );
  }

  return (
    <span className={cls} style={{ ...layoutStyle, ...style }}>
      <img
        className="sui-logo__mark"
        src={`${BASE_PATH}/images/logo.png`}
        alt={alt}
        style={{ height, width: "auto", objectFit: "contain" }}
      />
    </span>
  );
}
