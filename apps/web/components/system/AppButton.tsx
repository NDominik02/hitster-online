"use client";

import { ButtonHTMLAttributes, forwardRef } from "react";
import clsx from "clsx";

export interface AppButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: "primary" | "secondary" | "ghost" | "danger";
  size?: "sm" | "md" | "lg";
  fullWidth?: boolean;
}

/**
 * Egységes gomb — DESIGN.md 5.3 komponenslista + 6. style guide.
 * Touch-target minimum 44x44px minden méretnél (accessibility minimum, DESIGN 7.).
 */
export const AppButton = forwardRef<HTMLButtonElement, AppButtonProps>(
  ({ variant = "primary", size = "md", fullWidth, className, disabled, children, ...rest }, ref) => {
    return (
      <button
        ref={ref}
        disabled={disabled}
        style={{ fontFamily: "var(--font-heading)" }}
        className={clsx(
          "inline-flex items-center justify-center gap-2 font-bold rounded-[var(--radius-button)] min-h-11",
          "transition-[background-color,border-color,color,opacity,transform] duration-150 ease-out",
          "disabled:opacity-40 disabled:cursor-not-allowed disabled:grayscale-[0.3]",
          {
            // variant — enabled. Az accent/danger amber/coral világos tónusok, ezért sötét
            // (var(--bg)) szöveg kell rájuk kontrasztnak — nem a régi lila-alapú fehér szöveg.
            "bg-accent hover:bg-accent-hover active:brightness-95 cursor-pointer shadow-[0_0_0_1px_rgba(245,182,46,0.4)] text-[var(--bg)]":
              variant === "primary" && !disabled,
            // secondary enabled: accent-colored border + subtle glow so it reads as clearly
            // "ready" — a plain bg-surface-2 border was nearly identical to the disabled
            // state (opacity was the only cue), which made the button look inert on mobile.
            "bg-surface-2 text-text border-2 border-accent hover:bg-surface hover:border-accent-hover cursor-pointer shadow-[0_0_12px_rgba(245,182,46,0.25)]":
              variant === "secondary" && !disabled,
            "bg-transparent text-text-muted hover:text-text hover:bg-surface cursor-pointer":
              variant === "ghost" && !disabled,
            "bg-danger hover:brightness-95 cursor-pointer text-[var(--bg)]": variant === "danger" && !disabled,
            // variant — disabled: flat, borderless, no glow — unmistakably inert
            "bg-surface-2 text-text-muted border-2 border-transparent shadow-none": disabled,
            // size
            "px-4 py-2 text-sm": size === "sm",
            "px-6 py-3 text-base": size === "md",
            "px-8 py-4 text-lg": size === "lg",
            // width
            "w-full": fullWidth,
          },
          className
        )}
        {...rest}
      >
        {children}
      </button>
    );
  }
);
AppButton.displayName = "AppButton";
