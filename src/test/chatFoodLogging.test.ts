import { describe, expect, it } from "vitest";
import { classifyChatFoodEntry, isCancelChatFlowIntent } from "@/lib/chatFoodLogging";

describe("chat food logging input guard", () => {
  it.each([
    "hey",
    "hello",
    "okay",
    "thanks",
    "how are you?",
    "can you help me",
    "this is random text",
    "Analyze my Lunch",
  ])("rejects non-food chat without treating %j as a meal", (text) => {
    expect(classifyChatFoodEntry(text)).toBe("not_food");
  });

  it.each([
    "rice bowl with chicken",
    "an apple",
    "pizza",
    "2 eggs and toast",
    "Greek yogurt with berries",
    "salmon, potato and salad",
    "falafel with tahini",
    "a glass of water",
  ])("accepts concrete food and drink descriptions such as %j", (text) => {
    expect(classifyChatFoodEntry(text)).toBe("food");
  });

  it.each([
    "cancel",
    "stop logging",
    "never mind",
    "please cancel this",
    "I don't want to",
  ])("recognizes %j as an explicit way out of the guided flow", (text) => {
    expect(isCancelChatFlowIntent(text)).toBe(true);
    expect(classifyChatFoodEntry(text)).toBe("cancel");
  });

  it("does not accept a food word inside a question as a meal log", () => {
    expect(classifyChatFoodEntry("do you like pizza?")).toBe("not_food");
  });
});
