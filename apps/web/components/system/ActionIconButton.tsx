"use client";

import clsx from "clsx";
import { AppButton, type AppButtonProps } from "./AppButton";

type ActionIconName = "eye" | "pen" | "trash";

interface ActionIconButtonProps extends Omit<AppButtonProps, "children"> {
  icon: ActionIconName;
  label: string;
}

export function ActionIconButton({ icon, label, className, title, ...props }: ActionIconButtonProps) {
  return (
    <AppButton
      {...props}
      aria-label={label}
      title={title ?? label}
      className={clsx("h-11 w-11 shrink-0 px-0 py-0", className)}
    >
      <ActionIcon name={icon} />
    </AppButton>
  );
}

function ActionIcon({ name }: { name: ActionIconName }) {
  const commonProps = {
    className: "h-5 w-5",
    viewBox: "0 0 24 24",
    fill: "none",
    stroke: "currentColor",
    strokeWidth: 2,
    strokeLinecap: "round" as const,
    strokeLinejoin: "round" as const,
    "aria-hidden": true,
  };

  if (name === "eye") {
    return (
      <svg {...commonProps}>
        <path d="M2 12s3.5-7 10-7 10 7 10 7-3.5 7-10 7-10-7-10-7Z" />
        <circle cx="12" cy="12" r="3" />
      </svg>
    );
  }

  if (name === "pen") {
    return (
      <svg {...commonProps}>
        <path d="M12 20h9" />
        <path d="M16.5 3.5a2.1 2.1 0 0 1 3 3L7 19l-4 1 1-4Z" />
      </svg>
    );
  }

  return (
    <svg {...commonProps}>
      <path d="M3 6h18" />
      <path d="M8 6V4h8v2" />
      <path d="M6 6l1 14h10l1-14" />
      <path d="M10 11v5" />
      <path d="M14 11v5" />
    </svg>
  );
}
