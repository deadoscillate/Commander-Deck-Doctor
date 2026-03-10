import { describe, expect, it } from "vitest";
import { buildSellerOutboundHref, decorateSellerUrl } from "@/lib/commerce/sellerLinks";

describe("seller link helpers", () => {
  it("decorates seller URLs with configured affiliate query params", () => {
    expect(
      decorateSellerUrl("tcgplayer", "https://www.tcgplayer.com/product/123", {
        TCGPLAYER_AFFILIATE_QUERY: "utm_source=commanderdeckdoctor&partner=abc"
      } as unknown as NodeJS.ProcessEnv)
    ).toBe("https://www.tcgplayer.com/product/123?utm_source=commanderdeckdoctor&partner=abc");
  });

  it("builds internal outbound redirect paths for safe seller URLs", () => {
    expect(buildSellerOutboundHref("cardkingdom", "https://www.cardkingdom.com/test")).toBe(
      "/api/outbound?seller=cardkingdom&target=https%3A%2F%2Fwww.cardkingdom.com%2Ftest"
    );
  });

  it("rejects unsafe seller URLs", () => {
    expect(buildSellerOutboundHref("tcgplayer", "http://example.com")).toBeNull();
  });
});
