import * as React from "react";
import * as DialogPrimitive from "@radix-ui/react-dialog";
import { X } from "lucide-react";
import type { LucideIcon } from "lucide-react";
import { useTranslation } from "react-i18next";
import { cn } from "@/lib/utils";
import { IconTile, Strip, type StripTone } from "./tone";

export const Dialog = DialogPrimitive.Root;
export const DialogTrigger = DialogPrimitive.Trigger;
export const DialogClose = DialogPrimitive.Close;

export const DialogContent = React.forwardRef<
  React.ElementRef<typeof DialogPrimitive.Content>,
  React.ComponentPropsWithoutRef<typeof DialogPrimitive.Content>
>(({ className, children, ...props }, ref) => {
  const { t } = useTranslation();
  return (
    <DialogPrimitive.Portal>
      <DialogPrimitive.Overlay className="fixed inset-0 z-50 bg-black/50 data-[state=open]:animate-in data-[state=open]:fade-in-0" />
      <DialogPrimitive.Content
        ref={ref}
        className={cn(
          // The one place a shadow is allowed: dialogs/popovers.
          "fixed left-1/2 top-1/2 z-50 w-full max-w-md -translate-x-1/2 -translate-y-1/2 rounded-[16px] border border-border bg-surface p-5 shadow-[0_24px_60px_rgba(0,0,0,0.3)] outline-none data-[state=open]:animate-in data-[state=open]:fade-in-0 data-[state=open]:zoom-in-95",
          className,
        )}
        {...props}
      >
        {children}
        <DialogPrimitive.Close className="absolute end-4 top-4 rounded-[6px] p-0.5 text-muted outline-none transition-colors hover:text-foreground focus-visible:ring-2 focus-visible:ring-accent/40">
          <X className="size-4" />
          <span className="sr-only">{t("common.actions.close")}</span>
        </DialogPrimitive.Close>
      </DialogPrimitive.Content>
    </DialogPrimitive.Portal>
  );
});
DialogContent.displayName = "DialogContent";

export function DialogHeader({ className, ...props }: React.HTMLAttributes<HTMLDivElement>) {
  return <div className={cn("mb-4 flex flex-col gap-1", className)} {...props} />;
}

export const DialogTitle = React.forwardRef<
  React.ElementRef<typeof DialogPrimitive.Title>,
  React.ComponentPropsWithoutRef<typeof DialogPrimitive.Title>
>(({ className, ...props }, ref) => (
  <DialogPrimitive.Title
    ref={ref}
    className={cn("text-[16px] font-semibold tracking-[-0.02em] text-foreground", className)}
    {...props}
  />
));
DialogTitle.displayName = "DialogTitle";

export const DialogDescription = React.forwardRef<
  React.ElementRef<typeof DialogPrimitive.Description>,
  React.ComponentPropsWithoutRef<typeof DialogPrimitive.Description>
>(({ className, ...props }, ref) => (
  <DialogPrimitive.Description
    ref={ref}
    className={cn("text-[13px] text-secondary", className)}
    {...props}
  />
));
DialogDescription.displayName = "DialogDescription";

/**
 * Titled header strip: hued tile + title + description on the tone's tint. Runs edge to edge over
 * DialogContent's p-5; `pe-12` keeps the text clear of the close button. Shown at every width.
 */
export function DialogHead({
  icon,
  tone,
  title,
  description,
}: {
  icon: LucideIcon;
  tone: StripTone;
  title: React.ReactNode;
  description?: React.ReactNode;
}) {
  return (
    <Strip
      tone={tone}
      always
      className="-mx-5 -mt-5 mb-5 flex items-center gap-3.5 rounded-t-[15px] border-b px-5 py-[18px] pe-12"
    >
      <IconTile icon={icon} tone={tone} size="lg" always />
      <div className="flex min-w-0 flex-col gap-0.5">
        <DialogTitle className="text-[17px]">{title}</DialogTitle>
        {description && <DialogDescription className="text-[12.5px]">{description}</DialogDescription>}
      </div>
    </Strip>
  );
}

/** Footer bar that closes a DialogHead dialog: edge to edge, hairline on top, page-background fill. */
export function DialogFoot({ className, ...props }: React.HTMLAttributes<HTMLDivElement>) {
  return (
    <div
      className={cn(
        "-mx-5 -mb-5 mt-5 flex items-center justify-end gap-2 rounded-b-[15px] border-t border-border bg-background px-5 py-3.5",
        className,
      )}
      {...props}
    />
  );
}
