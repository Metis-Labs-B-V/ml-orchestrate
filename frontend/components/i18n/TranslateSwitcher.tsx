import { MLSelect, MLSelectContent, MLSelectItem, MLSelectTrigger, MLSelectValue } from "ml-uikit";

import { useI18n } from "../../lib/i18n";

export default function TranslateSwitcher() {
  const { language, options, setLanguage, t } = useI18n();

  return (
    <div className="translate-switcher">
      <label htmlFor="language" className="translate-label">
        {t("settings.language")}
      </label>
      <MLSelect value={language} onValueChange={setLanguage}>
        <MLSelectTrigger id="language" className="translate-select">
          <MLSelectValue placeholder={t("settings.language")} />
        </MLSelectTrigger>
        <MLSelectContent>
          {options.map((option) => (
            <MLSelectItem key={option.code} value={option.code}>
              {option.label}
            </MLSelectItem>
          ))}
        </MLSelectContent>
      </MLSelect>
    </div>
  );
}
