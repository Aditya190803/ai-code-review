export const SUPPORTED_LANGUAGES = [
    { label: 'English', value: 'en' },
    { label: 'Hindi', value: 'hi' },
    { label: 'Spanish', value: 'es' },
    { label: 'French', value: 'fr' },
    { label: 'German', value: 'de' },
    { label: 'Japanese', value: 'ja' },
    { label: 'Chinese (Simplified)', value: 'zh-CN' },
    { label: 'Portuguese (Brazil)', value: 'pt-BR' },
    { label: 'Korean', value: 'ko' },
    { label: 'Russian', value: 'ru' },
] as const;

export const DEFAULT_REVIEW_LANGUAGE = 'en';
export const DEFAULT_UI_LANGUAGE = 'en';

export function getLanguageLabel(code: string | undefined | null): string {
    return SUPPORTED_LANGUAGES.find((language) => language.value === code)?.label || 'English';
}
