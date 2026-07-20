import { it, expect, describe } from "vitest";
import { isPureGreeting } from "../../src/lib/agent-v3/guards.server";
import { selectRelevantModules } from "../../src/lib/agent-v3/module-selector.server";

describe("V3 Bug Fix Regression", () => {
  it("should correctly identify pure greetings", () => {
    expect(isPureGreeting("Boa noite")).toBe(true);
    expect(isPureGreeting("Oi!")).toBe(true);
    expect(isPureGreeting("Tudo bem?")).toBe(true);
    expect(isPureGreeting("quero comprar plays")).toBe(false);
    expect(isPureGreeting("boa noite, quero plays")).toBe(false);
  });

  it("should associate 'plays' keyword specifically with Spotify", () => {
    const enabled = ["spotify", "youtube", "tiktok", "instagram"];
    const selected = selectRelevantModules("quero comprar plays", enabled);
    expect(selected).toContain("spotify");
    // Ensure it doesn't just guess others if 'plays' is present
    // Note: selectRelevantModules might include base modules too
  });
  
  it("should associate 'views' with multiple but 'plays' only with Spotify", () => {
    const enabled = ["spotify", "youtube", "tiktok", "instagram"];
    
    const spotifyOnly = selectRelevantModules("quero plays", enabled);
    expect(spotifyOnly).toContain("spotify");
    expect(spotifyOnly).not.toContain("youtube");
    
    const views = selectRelevantModules("quero views", enabled);
    expect(views).toContain("youtube");
    expect(views).toContain("tiktok");
  });
});
