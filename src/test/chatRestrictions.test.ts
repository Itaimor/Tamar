import { beforeEach, describe, expect, it, vi } from "vitest";

const { fromMock, upsertMock } = vi.hoisted(() => ({
  fromMock: vi.fn(),
  upsertMock: vi.fn(),
}));

vi.mock("@/lib/supabase", () => ({
  supabase: {
    from: fromMock,
  },
}));

import {
  extractExplicitAllergyNames,
  saveChatAllergies,
} from "@/lib/chatRestrictions";

describe("explicit allergy chat intent", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    upsertMock.mockResolvedValue({ error: null });
    fromMock.mockReturnValue({ upsert: upsertMock });
  });

  it.each([
    ["I'm allergic to potatoes", ["potato"]],
    ["I am severely allergic to tomatoes.", ["tomato"]],
    ["I have an allergy to dairy products", ["dairy"]],
    ["I have allergies to peanuts, eggs and tree nuts", ["peanut", "egg", "tree nut"]],
    [
      "I told the chatbot that i'm allergic to potatoes but it still recommends them",
      ["potato"],
    ],
    ["I'm allergic to potatoes and I need help changing my recommendations", ["potato"]],
  ])("extracts explicit first-person allergy statement %j", (text, expected) => {
    expect(extractExplicitAllergyNames(text)).toEqual(expected);
  });

  it.each([
    "Am I allergic to potatoes?",
    "I'm not allergic to potatoes",
    "I think I am allergic to potatoes",
    "Maybe I am allergic to potatoes",
    "What should I do if I am allergic to potatoes?",
    "My friend is allergic to potatoes",
    "I used to be allergic to potatoes",
  ])("does not persist uncertain, negated, hypothetical, or third-party text %j", (text) => {
    expect(extractExplicitAllergyNames(text)).toEqual([]);
  });

  it("upserts normalized strict allergy rows using the database uniqueness key", async () => {
    await expect(
      saveChatAllergies("user-1", ["potatoes", "Potato"]),
    ).resolves.toEqual(["potato"]);

    expect(fromMock).toHaveBeenCalledWith("user_restrictions");
    expect(upsertMock).toHaveBeenCalledWith(
      [
        expect.objectContaining({
          user_id: "user-1",
          ingredient_name: "potato",
          normalized_name: "potato",
          restriction_type: "allergy",
          severity: "strict",
          is_strict: true,
        }),
      ],
      { onConflict: "user_id,normalized_name,restriction_type" },
    );
  });
});
