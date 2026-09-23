import { useTranslations } from "next-intl";

/**
 * A hook that provides a function to translate dynamic core tags (e.g., TradeResult, SetupTag, EmotionTag).
 * It replaces spaces and slashes with underscores to match the i18n keys.
 * If the tag is a custom tag (not present in the dictionary), it safely falls back to the original tag string.
 */
export function useTagTranslation() {
  const t = useTranslations("Tags");

  return (tag: string) => {
    if (!tag) return tag;
    
    // Convert tag to key format: "Break Even" -> "Break_Even", "Support/Resistance" -> "Support_Resistance"
    const key = tag.replace(/[\s\/]/g, '_');
    
    if (t.has(key)) {
      return t(key);
    }
    
    // Fallback to the original tag if translation is missing (e.g. for user custom tags)
    return tag;
  };
}
