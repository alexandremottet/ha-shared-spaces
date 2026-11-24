import { afterEach, describe, expect, it } from "vitest";
import { registerTranslations, resolveLanguage, setLanguage, t } from "./i18n";

registerTranslations("fr", { "My place": "Mon espace", "{n} hours": "{n} heures" });

afterEach(() => setLanguage("en"));

describe("i18n", () => {
  it("follows HA's language and falls back to French", () => {
    expect(resolveLanguage("en-GB")).toBe("en");
    expect(resolveLanguage("fr")).toBe("fr");
    expect(resolveLanguage("de")).toBe("fr");
    expect(resolveLanguage(undefined)).toBe("fr");
  });

  it("translates, fills placeholders and keeps untranslated text", () => {
    setLanguage("fr");
    expect(t("My place")).toBe("Mon espace");
    expect(t("{n} hours", { n: 3 })).toBe("3 heures");
    expect(t("Not translated")).toBe("Not translated");
    setLanguage("en");
    expect(t("My place")).toBe("My place");
  });
});
