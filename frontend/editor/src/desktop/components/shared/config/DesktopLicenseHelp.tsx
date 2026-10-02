import { Stack, Text, Anchor, Badge, Group, Card } from "@mantine/core";
import { useTranslation } from "react-i18next";

/**
 * Desktop-specific license and customization information card.
 * Displayed in Settings > About section to show open-source components and KRUGER modifications.
 */
export function DesktopLicenseHelp() {
  const { t } = useTranslation();

  return (
    <Card withBorder padding="lg">
      <Stack gap="md">
        <div>
          <Text fw={600} size="lg" mb="sm">
            {t(
              "settings.desktop.licensing.title",
              "KRUGER Customizations & Licensing",
            )}
          </Text>
          <Text size="sm" c="dimmed">
            {t(
              "settings.desktop.licensing.description",
              "Stirling PDF is open-source under the GNU Affero General Public License (AGPL v3). KRUGER customizations preserve this license and remain open source.",
            )}
          </Text>
        </div>

        <div>
          <Text fw={600} size="sm" mb="xs">
            {t(
              "settings.desktop.licensing.components",
              "Open Source Components",
            )}
          </Text>
          <Stack gap="xs">
            <Group>
              <Badge size="sm" variant="light">
                Stirling PDF
              </Badge>
              <Text size="xs" c="dimmed">
                Core application —{" "}
                <Anchor
                  href="https://github.com/Frooodle/Stirling-PDF"
                  target="_blank"
                  rel="noopener noreferrer"
                  size="xs"
                >
                  GitHub
                </Anchor>
              </Text>
            </Group>
            <Group>
              <Badge size="sm" variant="light">
                Backend
              </Badge>
              <Text size="xs" c="dimmed">
                Spring Boot, PDFBox, LibreOffice
              </Text>
            </Group>
            <Group>
              <Badge size="sm" variant="light">
                Frontend
              </Badge>
              <Text size="xs" c="dimmed">
                React, TypeScript, Mantine UI, TailwindCSS
              </Text>
            </Group>
            <Group>
              <Badge size="sm" variant="light">
                Desktop
              </Badge>
              <Text size="xs" c="dimmed">
                Tauri (Rust), native app framework
              </Text>
            </Group>
          </Stack>
        </div>

        <div>
          <Text fw={600} size="sm" mb="xs">
            {t(
              "settings.desktop.licensing.kruger_changes",
              "KRUGER Modifications",
            )}
          </Text>
          <Stack gap="xs">
            <Text size="xs" c="dimmed">
              • {t("settings.desktop.licensing.change1", "Removed Supabase authentication")}
            </Text>
            <Text size="xs" c="dimmed">
              • {t("settings.desktop.licensing.change2", "Hardcoded LOCAL mode — no cloud sync")}
            </Text>
            <Text size="xs" c="dimmed">
              • {t("settings.desktop.licensing.change3", "Desktop-only application")}
            </Text>
            <Text size="xs" c="dimmed">
              • {t("settings.desktop.licensing.change4", "All processing local — no telemetry")}
            </Text>
          </Stack>
        </div>

        <div>
          <Text fw={600} size="sm" mb="xs">
            {t("settings.desktop.licensing.license", "License")}
          </Text>
          <Text size="xs" c="dimmed">
            {t(
              "settings.desktop.licensing.license_text",
              "AGPL-v3 — modifications must be shared. All code remains open source under the same license.",
            )}{" "}
            <Anchor
              href="https://github.com/Frooodle/Stirling-PDF/blob/main/LICENSE"
              target="_blank"
              rel="noopener noreferrer"
              size="xs"
            >
              {t("settings.desktop.licensing.view_license", "View full license")}
            </Anchor>
          </Text>
        </div>
      </Stack>
    </Card>
  );
}
