import { TreePalm, type LucideIcon, Sparkles } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";

export type CanopyUpgradeDialogConfig = {
  title: string;
  description: string;
  primaryLabel?: string;
  secondaryLabel?: string;
  onSecondary?: () => void;
};

type CanopyUpgradeDialogProps = {
  open: boolean;
  config: CanopyUpgradeDialogConfig | null;
  onOpenChange: (open: boolean) => void;
  onUpgrade: () => void;
};

export const CanopyUpgradeDialog = ({
  open,
  config,
  onOpenChange,
  onUpgrade,
}: CanopyUpgradeDialogProps) => (
  <Dialog open={open} onOpenChange={onOpenChange}>
    <DialogContent className="border-[#d7b86f]/40 bg-[#fffaf0] text-[#203629] shadow-2xl shadow-[#2f7a4b]/20 sm:max-w-md">
      <DialogHeader>
        <div className="mb-1 grid h-11 w-11 place-items-center rounded-lg bg-[#203629] text-[#f7c873]">
          <TreePalm className="h-5 w-5" />
        </div>
        <DialogTitle className="text-2xl text-[#203629]">{config?.title || "Canopy+"}</DialogTitle>
        <DialogDescription className="text-[#667864]">
          {config?.description || "Upgrade to keep Tamar's premium tools available."}
        </DialogDescription>
      </DialogHeader>
      <div className="grid gap-2 rounded-lg border border-[#d7b86f]/35 bg-white/70 p-3 text-sm text-[#536451]">
        <span className="inline-flex items-center gap-2 font-semibold text-[#203629]">
          <Sparkles className="h-4 w-4 text-[#b78032]" />
          Canopy+ includes macro tracking, camera uploads, and Analysis testing.
        </span>
      </div>
      <DialogFooter className="gap-2 sm:justify-between sm:space-x-0">
        {config?.secondaryLabel && (
          <Button
            type="button"
            variant="ghost"
            onClick={() => {
              onOpenChange(false);
              config.onSecondary?.();
            }}
            className="text-[#536451] hover:bg-[#2f7a4b]/10 hover:text-[#203629]"
          >
            {config.secondaryLabel}
          </Button>
        )}
        <Button
          type="button"
          onClick={() => {
            onOpenChange(false);
            onUpgrade();
          }}
          className="bg-[#203629] text-[#fffaf0] hover:bg-[#2f4f3d]"
        >
          {config?.primaryLabel || "See Canopy+"}
        </Button>
      </DialogFooter>
    </DialogContent>
  </Dialog>
);

type CanopyFeaturePanelProps = {
  icon: LucideIcon;
  title: string;
  body: string;
  onUpgrade: () => void;
  className?: string;
};

export const CanopyFeaturePanel = ({
  icon: Icon,
  title,
  body,
  onUpgrade,
  className = "",
}: CanopyFeaturePanelProps) => (
  <div className={`rounded-lg border border-[#d7b86f]/35 bg-[#fffaf0]/92 p-5 text-[#203629] ${className}`}>
    <div className="flex flex-wrap items-start justify-between gap-4">
      <div className="flex min-w-0 gap-3">
        <span className="grid h-10 w-10 shrink-0 place-items-center rounded-lg bg-[#203629] text-[#f7c873]">
          <Icon className="h-5 w-5" />
        </span>
        <div className="min-w-0">
          <p className="text-sm font-semibold">{title}</p>
          <p className="mt-1 text-sm leading-relaxed text-[#667864]">{body}</p>
        </div>
      </div>
      <Button
        type="button"
        onClick={onUpgrade}
        className="shrink-0 bg-[#203629] text-[#fffaf0] hover:bg-[#2f4f3d]"
      >
        <TreePalm className="h-4 w-4" />
        Canopy+
      </Button>
    </div>
  </div>
);
