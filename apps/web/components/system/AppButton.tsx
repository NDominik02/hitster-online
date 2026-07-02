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
        className={clsx(
          "inline-flex items-center justify-center gap-2 font-bold transition-colors duration-150 ease-out rounded-[var(--radius-button)] min-h-11",
          "disabled:opacity-40 disabled:cursor-not-allowed",
          {
            // variant
            "bg-accent text-white hover:bg-accent-hover active:brightness-95":
              variant === "primary" && !disabled,
            "bg-surface-2 text-text border border-border hover:border-accent":
              variant === "secondary" && !disabled,
            "bg-transparent text-text-muted hover:text-text hover:bg-surface":
              variant === "ghost" && !disabled,
            "bg-danger text-white hover:brightness-95": variant === "danger" && !disabled,
            "bg-surface-2 text-text-muted": disabled,
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
