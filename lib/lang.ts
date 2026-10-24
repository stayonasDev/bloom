// 언어 코드 정규화 — 프론트(app/sell)는 UI 언어 "이름"의 앞 2글자를 보낸다: "English"→EN, "한국어"→"한국", "日本語"→"日本", "Filipino"→FI, "Español"→ES, "Deutsch"→DE.
// 서버는 ISO 639-1 대문자 2글자로 저장하고, Claude 출력 언어는 이 코드로 정한다.

const BY_PREFIX: [RegExp, string][] = [
  [/^(en|english)/i, "EN"],
  [/^(ko|한국|korean)/i, "KO"],
  [/^(ja|日本|japanese)/i, "JA"],
  [/^(tl|fi|filipino|tagalog|taglish)/i, "TL"],
  [/^(es|espa|spanish)/i, "ES"],
  [/^(de|deutsch|german)/i, "DE"],
  [/^(zh|中文|chinese|mandarin)/i, "ZH"],
  [/^(fr|fran|french)/i, "FR"],
  [/^(pt|portug)/i, "PT"],
  [/^(vi|tiếng|vietnam)/i, "VI"],
  [/^(th|ไทย|thai)/i, "TH"],
  [/^(id|bahasa|indonesia)/i, "ID"],
  [/^(hi|हिन्दी|hindi)/i, "HI"],
];

const NAMES: Record<string, string> = {
  EN: "English", KO: "Korean", JA: "Japanese", TL: "Filipino (Tagalog)", ES: "Spanish", DE: "German",
  ZH: "Chinese", FR: "French", PT: "Portuguese", VI: "Vietnamese", TH: "Thai", ID: "Indonesian", HI: "Hindi",
};

/** 어떤 입력이든 2글자 대문자 코드로. 모르면 라틴 2글자면 그대로, 아니면 EN. */
export function normalizeLanguage(input: string | null | undefined): string {
  const s = (input ?? "").trim();
  if (!s) return "EN";
  for (const [re, code] of BY_PREFIX) if (re.test(s)) return code;
  const two = s.slice(0, 2).toUpperCase();
  return /^[A-Z]{2}$/.test(two) ? two : "EN";
}

/** Claude 프롬프트용 언어 이름 */
export function languageName(code: string): string {
  return NAMES[code.toUpperCase()] ?? `the language with ISO 639-1 code "${code.toUpperCase()}"`;
}
