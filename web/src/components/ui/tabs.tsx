import * as React from "react";
import * as TabsPrimitive from "@radix-ui/react-tabs";
import { cn } from "@/lib/utils";

// Direction is fixed for the page lifetime (switching languages reloads), so reading the
// document once per render is enough; Radix would otherwise stamp dir="ltr" and un-mirror its subtree.
const documentDir = () => (document.documentElement.dir === "rtl" ? "rtl" : "ltr");
export const Tabs = (props: React.ComponentProps<typeof TabsPrimitive.Root>) => (
  <TabsPrimitive.Root dir={documentDir()} {...props} />
);

export const TabsList = React.forwardRef<
  React.ElementRef<typeof TabsPrimitive.List>,
  React.ComponentPropsWithoutRef<typeof TabsPrimitive.List>
>(({ className, ...props }, ref) => (
  <TabsPrimitive.List
    ref={ref}
    className={cn("inline-flex items-center gap-1 border-b border-border", className)}
    {...props}
  />
));
TabsList.displayName = "TabsList";

export const TabsTrigger = React.forwardRef<
  React.ElementRef<typeof TabsPrimitive.Trigger>,
  React.ComponentPropsWithoutRef<typeof TabsPrimitive.Trigger>
>(({ className, ...props }, ref) => (
  <TabsPrimitive.Trigger
    ref={ref}
    className={cn(
      "-mb-px border-b-2 border-transparent px-3 py-2 text-[13px] font-medium text-secondary outline-none transition-colors duration-150 hover:text-foreground data-[state=active]:border-accent data-[state=active]:text-accent",
      className,
    )}
    {...props}
  />
));
TabsTrigger.displayName = "TabsTrigger";

export const TabsContent = React.forwardRef<
  React.ElementRef<typeof TabsPrimitive.Content>,
  React.ComponentPropsWithoutRef<typeof TabsPrimitive.Content>
>(({ className, ...props }, ref) => (
  <TabsPrimitive.Content ref={ref} className={cn("pt-4 outline-none", className)} {...props} />
));
TabsContent.displayName = "TabsContent";
