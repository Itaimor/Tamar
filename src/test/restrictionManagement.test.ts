import { beforeEach, describe, expect, it, vi } from "vitest";

const {
  deleteMock,
  eqMock,
  fromMock,
  maybeSingleMock,
  orderMock,
  selectMock,
  upsertMock,
} = vi.hoisted(() => ({
  deleteMock: vi.fn(),
  eqMock: vi.fn(),
  fromMock: vi.fn(),
  maybeSingleMock: vi.fn(),
  orderMock: vi.fn(),
  selectMock: vi.fn(),
  upsertMock: vi.fn(),
}));

vi.mock("@/lib/supabase", () => ({
  supabase: {
    from: fromMock,
  },
}));

import {
  deleteHardRestriction,
  fetchActiveHardRestrictions,
  upsertHardRestrictions,
} from "@/lib/recommendationSafety";

describe("hard-restriction database management", () => {
  const chain = {
    delete: deleteMock,
    eq: eqMock,
    maybeSingle: maybeSingleMock,
    order: orderMock,
    select: selectMock,
    upsert: upsertMock,
  };

  beforeEach(() => {
    vi.clearAllMocks();
    fromMock.mockReturnValue(chain);
    deleteMock.mockReturnValue(chain);
    eqMock.mockReturnValue(chain);
    selectMock.mockReturnValue(chain);
    upsertMock.mockResolvedValue({ error: null });
  });

  it("reads the signed-in user's active restrictions in newest-first order", async () => {
    orderMock.mockResolvedValue({
      data: [
        {
          id: 9,
          user_id: "user-1",
          ingredient_name: "potato",
          normalized_name: "potato",
          restriction_type: "forbidden_ingredient",
          severity: "strict",
          is_strict: true,
        },
      ],
      error: null,
    });

    await expect(fetchActiveHardRestrictions("user-1")).resolves.toEqual([
      expect.objectContaining({ id: 9, normalized_name: "potato" }),
    ]);
    expect(fromMock).toHaveBeenCalledWith("user_restrictions");
    expect(eqMock).toHaveBeenCalledWith("user_id", "user-1");
    expect(orderMock).toHaveBeenCalledWith("created_at", { ascending: false });
  });

  it("normalizes and upserts a Diary forbidden food on the shared uniqueness key", async () => {
    await expect(
      upsertHardRestrictions({
        userId: "user-1",
        ingredientNames: ["Potatoes"],
        restrictionType: "forbidden_ingredient",
        notes: "Added from Diary",
      }),
    ).resolves.toEqual(["potato"]);

    expect(upsertMock).toHaveBeenCalledWith(
      [
        expect.objectContaining({
          user_id: "user-1",
          ingredient_name: "potato",
          normalized_name: "potato",
          restriction_type: "forbidden_ingredient",
          is_strict: true,
        }),
      ],
      { onConflict: "user_id,normalized_name,restriction_type" },
    );
  });

  it("deletes only a restriction owned by the signed-in user", async () => {
    maybeSingleMock.mockResolvedValue({ data: { id: 9 }, error: null });

    await expect(deleteHardRestriction("user-1", 9)).resolves.toBeUndefined();
    expect(deleteMock).toHaveBeenCalledOnce();
    expect(eqMock).toHaveBeenNthCalledWith(1, "id", 9);
    expect(eqMock).toHaveBeenNthCalledWith(2, "user_id", "user-1");
    expect(selectMock).toHaveBeenCalledWith("id");
  });
});
