import { useTranslation } from "react-i18next";
import { useConfigNavSections as useProprietaryConfigNavSections } from "@proprietary/components/shared/config/configNavSections";
import { ConfigNavSection } from "@core/components/shared/config/configNavSections";
import { ConnectionSettings } from "@app/components/ConnectionSettings";
import DesktopGeneralSection from "@app/components/shared/config/configSections/GeneralSection";
import { DesktopLicenseHelp } from "./DesktopLicenseHelp";

export type {
  ConfigNavSection,
  ConfigNavItem,
} from "@core/components/shared/config/configNavSections";

/**
 * Desktop config nav sections (LOCAL mode only, no SaaS/connection switching)
 */
export const useConfigNavSections = (
  isAdmin: boolean = false,
  runningEE: boolean = false,
  loginEnabled: boolean = false,
  onRequestClose: () => void = () => {},
  showSettingsWhenNoLogin: boolean = true,
): ConfigNavSection[] => {
  const { t } = useTranslation();

  // Get the proprietary sections (includes core Preferences + admin sections)
  const sections = useProprietaryConfigNavSections(
    isAdmin,
    runningEE,
    loginEnabled,
    onRequestClose,
    showSettingsWhenNoLogin,
  );

  // Desktop adds file-association defaults and its own update controls to the
  // Preferences page; core builds the page, desktop supplies its extras.
  const preferences = sections.find((s) => s.id === "preferences");
  if (preferences) {
    preferences.items = preferences.items.map((item) =>
      item.key === "general"
        ? { ...item, component: <DesktopGeneralSection /> }
        : item,
    );
  }

  // Hardcoded LOCAL mode: only show Preferences + About
  const result: ConfigNavSection[] = [];
  if (sections.length > 0) result.push(sections[0]); // Preferences

  const aboutSection = sections.find((section) => section.id === "about");
  if (aboutSection) {
    // Add KRUGER license help as an additional item in the about section
    result.push({
      ...aboutSection,
      items: [
        ...aboutSection.items,
        {
          key: "kruger-licensing",
          label: t(
            "settings.desktop.licensing.title",
            "KRUGER Customizations & License",
          ),
          description: t(
            "settings.desktop.licensing.shortDesc",
            "Open source components and AGPL v3 license",
          ),
          icon: "info",
          component: <DesktopLicenseHelp />,
        },
      ],
    });
  }

  return result;
};
