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
  icon?: React.ReactNode;
  highlightText?: string;
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
    <DialogContent className="rounded-3xl sm:rounded-3xl border-[#d7b86f]/40 bg-[#fffaf0] text-[#203629] shadow-2xl shadow-[#2f7a4b]/20 w-[92vw] max-w-[420px] p-6 sm:p-7">
      <DialogHeader className="items-center text-center sm:text-center">
        <div className="mb-2 grid h-14 w-14 place-items-center rounded-2xl bg-gradient-to-br from-[#203629] via-[#2a4736] to-[#16251c] text-[#f7c873] shadow-lg ring-4 ring-[#203629]/10">
          {config?.icon || <TreePalm className="h-7 w-7" />}
        </div>
        <DialogTitle className="text-2xl font-extrabold tracking-tight text-[#203629]">
          {config?.title || "Canopy+"}
        </DialogTitle>
        <DialogDescription className="text-[#667864] text-sm leading-relaxed max-w-xs mx-auto mt-1">
          {config?.description || "Upgrade to keep Tamar's premium tools available."}
        </DialogDescription>
      </DialogHeader>
      <div className="my-1.5 grid gap-2 rounded-2xl border border-[#d7b86f]/35 bg-white/80 p-4 text-sm text-[#536451] shadow-sm">
        <span className="inline-flex items-center gap-2.5 font-semibold text-[#203629]">
          <Sparkles className="h-4.5 w-4.5 shrink-0 text-[#b78032]" />
          {config?.highlightText || "Canopy+ includes macro tracking, camera uploads, and Analysis testing."}
        </span>
      </div>
      <DialogFooter className="flex-col gap-2 sm:flex-col sm:space-x-0">
        <Button
          type="button"
          onClick={() => {
            onOpenChange(false);
            onUpgrade();
          }}
          className="w-full h-12 rounded-full bg-[#203629] text-[#fffaf0] font-bold text-base hover:bg-[#2f4f3d] shadow-md transition-all active:scale-[0.98]"
        >
          {config?.primaryLabel || "See Canopy+"}
        </Button>
        {config?.secondaryLabel && (
          <Button
            type="button"
            variant="ghost"
            onClick={() => {
              onOpenChange(false);
              config.onSecondary?.();
            }}
            className="w-full h-10 rounded-full text-[#536451] font-medium hover:bg-[#2f7a4b]/10 hover:text-[#203629]"
          >
            {config.secondaryLabel}
          </Button>
        )}
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
