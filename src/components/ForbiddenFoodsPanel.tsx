import { FormEvent, useCallback, useEffect, useState } from "react";
import { AlertTriangle, Loader2, Plus, ShieldAlert, Trash2 } from "lucide-react";
import { toast } from "sonner";
import {
  deleteHardRestriction,
  fetchActiveHardRestrictions,
  HARD_RESTRICTION_TYPE_OPTIONS,
  HARD_RESTRICTIONS_UPDATED_EVENT,
  HardRestriction,
  HardRestrictionType,
  normalizeIngredientName,
  notifyHardRestrictionsUpdated,
  upsertHardRestrictions,
} from "@/lib/recommendationSafety";

const restrictionLabel = (value: string | null | undefined) =>
  HARD_RESTRICTION_TYPE_OPTIONS.find((option) => option.value === value)?.label ||
  "Strict restriction";

const displayIngredientName = (value: string | null | undefined) =>
  String(value || "")
    .split(" ")
    .filter(Boolean)
    .map((word) => word.charAt(0).toUpperCase() + word.slice(1))
    .join(" ");

type ForbiddenFoodsPanelProps = {
  userId: string;
  editable?: boolean;
};

const ForbiddenFoodsPanel = ({
  userId,
  editable = false,
}: ForbiddenFoodsPanelProps) => {
  const [restrictions, setRestrictions] = useState<HardRestriction[]>([]);
  const [ingredientName, setIngredientName] = useState("");
  const [restrictionType, setRestrictionType] =
    useState<HardRestrictionType>("forbidden_ingredient");
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [deletingId, setDeletingId] = useState<number | null>(null);
  const [error, setError] = useState<string | null>(null);

  const loadRestrictions = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      setRestrictions(await fetchActiveHardRestrictions(userId));
    } catch (loadError) {
      console.error("Failed to load forbidden foods:", loadError);
      setRestrictions([]);
      setError("Tamar could not verify your forbidden foods right now.");
    } finally {
      setLoading(false);
    }
  }, [userId]);

  useEffect(() => {
    loadRestrictions();
  }, [loadRestrictions]);

  useEffect(() => {
    const handleRestrictionChange = (event: Event) => {
      const detail = (event as CustomEvent<{ userId?: string }>).detail;
      if (detail?.userId === userId) loadRestrictions();
    };

    window.addEventListener(
      HARD_RESTRICTIONS_UPDATED_EVENT,
      handleRestrictionChange,
    );
    return () =>
      window.removeEventListener(
        HARD_RESTRICTIONS_UPDATED_EVENT,
        handleRestrictionChange,
      );
  }, [loadRestrictions, userId]);

  const submitRestriction = async (event: FormEvent) => {
    event.preventDefault();
    const normalizedName = normalizeIngredientName(ingredientName);
    if (!normalizedName) {
      toast.error("Enter a food or ingredient to forbid.");
      return;
    }

    setSaving(true);
    try {
      await upsertHardRestrictions({
        userId,
        ingredientNames: [normalizedName],
        restrictionType,
        notes: "Added from the Diary forbidden-foods section.",
      });
      setIngredientName("");
      notifyHardRestrictionsUpdated(userId);
      toast.success(`${displayIngredientName(normalizedName)} is now excluded from recommendations.`);
    } catch (saveError) {
      console.error("Failed to save forbidden food:", saveError);
      toast.error("Could not save that forbidden food.");
    } finally {
      setSaving(false);
    }
  };

  const removeRestriction = async (restriction: HardRestriction) => {
    if (!restriction.id) return;
    const name = displayIngredientName(
      restriction.ingredient_name || restriction.normalized_name,
    );
    const confirmed = window.confirm(
      `Remove ${name || "this food"} from your forbidden foods? Future recommendations may include it again.`,
    );
    if (!confirmed) return;

    setDeletingId(restriction.id);
    try {
      await deleteHardRestriction(userId, restriction.id);
      notifyHardRestrictionsUpdated(userId);
      toast.success(`${name || "Food"} removed from forbidden foods.`);
    } catch (deleteError) {
      console.error("Failed to remove forbidden food:", deleteError);
      toast.error("Could not remove that forbidden food.");
    } finally {
      setDeletingId(null);
    }
  };

  return (
    <section className="rounded-lg border border-rose-200/15 bg-rose-200/[0.045] p-5">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <div className="flex items-center gap-2 text-white">
            <ShieldAlert size={18} className="text-rose-200" />
            <h2 className="text-base font-semibold">Forbidden foods</h2>
          </div>
          <p className="mt-1 max-w-2xl text-sm leading-relaxed text-white/50">
            These are strict safety filters. Tamar excludes recipes containing
            them before scoring recommendations.
          </p>
        </div>
        <span className="rounded-full border border-rose-200/20 bg-rose-200/10 px-3 py-1 text-xs text-rose-100">
          {loading ? "Checking" : `${restrictions.length} active`}
        </span>
      </div>

      {editable && (
        <form
          onSubmit={submitRestriction}
          className="mt-5 grid gap-3 rounded-lg border border-white/10 bg-black/15 p-3 md:grid-cols-[minmax(0,1fr)_minmax(10rem,0.55fr)_auto]"
        >
          <label className="grid min-w-0 gap-2">
            <span className="text-xs font-medium text-white/55">Food or ingredient</span>
            <input
              value={ingredientName}
              onChange={(event) => setIngredientName(event.target.value)}
              placeholder="Potatoes"
              className="h-11 min-w-0 rounded-lg border border-white/10 bg-black/20 px-3 text-sm text-white outline-none transition placeholder:text-white/25 focus:border-rose-200/60"
            />
          </label>
          <label className="grid min-w-0 gap-2">
            <span className="text-xs font-medium text-white/55">Reason</span>
            <select
              value={restrictionType}
              onChange={(event) =>
                setRestrictionType(event.target.value as HardRestrictionType)
              }
              className="h-11 min-w-0 rounded-lg border border-white/10 bg-black/20 px-3 text-sm text-white outline-none transition focus:border-rose-200/60"
            >
              {HARD_RESTRICTION_TYPE_OPTIONS.map((option) => (
                <option key={option.value} value={option.value} className="bg-[#203629]">
                  {option.label}
                </option>
              ))}
            </select>
          </label>
          <button
            type="submit"
            disabled={saving || !ingredientName.trim()}
            className="inline-flex h-11 items-center justify-center gap-2 self-end rounded-lg bg-rose-200 px-4 text-sm font-semibold text-slate-950 transition hover:bg-rose-100 disabled:cursor-not-allowed disabled:opacity-60"
          >
            {saving ? <Loader2 size={16} className="animate-spin" /> : <Plus size={16} />}
            Add
          </button>
        </form>
      )}

      <div className="mt-4">
        {loading ? (
          <div className="flex items-center gap-2 rounded-lg border border-white/10 bg-black/10 px-4 py-3 text-sm text-white/55">
            <Loader2 size={15} className="animate-spin text-rose-200" />
            Verifying your safety filters
          </div>
        ) : error ? (
          <div className="flex items-start gap-2 rounded-lg border border-amber-200/20 bg-amber-200/[0.08] px-4 py-3 text-sm text-amber-50">
            <AlertTriangle size={16} className="mt-0.5 shrink-0" />
            {error}
          </div>
        ) : restrictions.length > 0 ? (
          <div className="flex flex-wrap gap-2">
            {restrictions.map((restriction) => {
              const name = displayIngredientName(
                restriction.ingredient_name || restriction.normalized_name,
              );
              return (
                <div
                  key={`${restriction.id || name}-${restriction.restriction_type}`}
                  className="inline-flex min-w-0 items-center gap-2 rounded-lg border border-rose-200/20 bg-rose-200/[0.08] px-3 py-2"
                >
                  <div className="min-w-0">
                    <p className="truncate text-sm font-medium text-white">
                      {name || "Unnamed restriction"}
                    </p>
                    <p className="text-[11px] text-rose-100/65">
                      {restrictionLabel(restriction.restriction_type)}
                    </p>
                  </div>
                  {editable && restriction.id && (
                    <button
                      type="button"
                      onClick={() => removeRestriction(restriction)}
                      disabled={deletingId === restriction.id}
                      aria-label={`Remove ${name || "forbidden food"}`}
                      className="grid h-8 w-8 shrink-0 place-items-center rounded-md text-white/45 transition hover:bg-rose-200/10 hover:text-rose-100 disabled:opacity-50"
                    >
                      {deletingId === restriction.id ? (
                        <Loader2 size={14} className="animate-spin" />
                      ) : (
                        <Trash2 size={14} />
                      )}
                    </button>
                  )}
                </div>
              );
            })}
          </div>
        ) : (
          <div className="rounded-lg border border-dashed border-white/15 bg-black/10 p-4">
            <p className="text-sm font-medium text-white">No forbidden foods saved</p>
            <p className="mt-1 text-sm leading-relaxed text-white/50">
              {editable
                ? "Add an allergy, strict sensitivity, forbidden ingredient, or diet restriction above."
                : "Use the Diary to add foods Tamar must always exclude."}
            </p>
          </div>
        )}
      </div>
    </section>
  );
};

export default ForbiddenFoodsPanel;
