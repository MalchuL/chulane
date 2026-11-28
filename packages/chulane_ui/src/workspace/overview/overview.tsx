/** Renders a workspace overview from links supplied by its host. */
import { Card, CardHeader, CardTitle, CardContent } from "../../components/ui/card.js";
import { cn } from "../../lib/utils.js";
import type { WorkspaceOverviewProps } from "./types.js";

/**
 * Show grouped links to projects and recently opened documents.
 *
 * The host supplies group labels, links and their order. The overview hides
 * empty groups and renders links that follow normal browser navigation.
 *
 * @param props Overview content and root section attributes.
 * @returns The overview section.
 * @example
 * ```tsx
 * <WorkspaceOverview
 *   title="Personal"
 *   sections={[{
 *     label: "Recent documents",
 *     items: [{ id: "field", label: "Field notes", href: "/pages/field" }],
 *   }]}
 * />
 * ```
 */
export function WorkspaceOverview({ title, sections, className, ...rest }: WorkspaceOverviewProps) {
  const panelStackClassName = "cu-panel cu-stack";
  const cardClassName = "cu-card";
  return (
    <section {...rest} className={cn(panelStackClassName, className)}>
      <h2>{title}</h2>
      {sections
        .filter((section) => section.items.length > 0)
        .map((section) => (
          <Card className={cardClassName} key={section.label}>
            <CardHeader>
              <CardTitle>{section.label}</CardTitle>
            </CardHeader>
            <CardContent>
              <ul>
                {section.items.map((item) => (
                  <li key={item.id}>
                    <a href={item.href}>{item.label}</a>
                  </li>
                ))}
              </ul>
            </CardContent>
          </Card>
        ))}
    </section>
  );
}
