import test from "node:test";
import assert from "node:assert/strict";
import { category, isRestricted, normalizeSourceUrl, subtractCalendarYear, titleKey } from "./resource-pack-utils.mjs";

test("source URL canonicalization removes tracking noise and fragments",()=>{
 assert.equal(normalizeSourceUrl("https://WWW.Example.com/packs/demo/?utm_source=x&b=2#gallery"),"https://example.com/packs/demo?b=2");
});
test("URL canonicalization rejects insecure and malformed URLs",()=>{
 assert.equal(normalizeSourceUrl("http://example.com/pack"),"");
 assert.equal(normalizeSourceUrl("not a url"),"");
});
test("category mapping handles Japanese and English synonyms",()=>{
 assert.equal(category("Realistic shader pack"),"シェーダー");
 assert.equal(category("自然な草と木"),"自然・植物");
 assert.equal(category("日本語フォント"),"言語・フォント");
});
test("safety filter normalizes full-width text and Japanese terms",()=>{
 assert.equal(isRestricted("full-width text ＷＥＡＰＯＮ pack"),true);
 assert.equal(isRestricted("日本語の武器テーマ"),true);
 assert.equal(isRestricted("soft sky clouds"),false);
});
test("title key normalizes compatibility forms and punctuation",()=>{
 assert.equal(titleKey("Ｃｌｏｕｄ Ｐａｃｋ!"),"cloudpack");
});
test("calendar retention subtracts one calendar year and clamps leap day",()=>{
 assert.equal(subtractCalendarYear(new Date("2024-02-29T12:00:00.000Z")).toISOString(),"2023-02-28T12:00:00.000Z");
});
