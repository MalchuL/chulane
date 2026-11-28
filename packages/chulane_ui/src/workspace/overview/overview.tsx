/** overview presentation and interaction contract. */
import { Card, CardHeader, CardTitle, CardContent } from "../../components/ui/card.js";

import type { WorkspaceOverviewProps } from "./types.js";
export type { WorkspaceOverviewProps } from "./types.js";

/**
 * Give pinned projects and recently opened documents a home outside the sidebar.
 * @param props Presentation values and host callbacks described by the public props type.
 * @returns The rendered WorkspaceOverview view.
 */
export function WorkspaceOverview({ title, sections }: WorkspaceOverviewProps) {
  const panelStackClassName = "cu-panel cu-stack";
  const cardClassName = "cu-card";
  return (
    <section className={panelStackClassName}>
      <h2>{title}</h2>
      {sections
        .filter((s) => s.items.length)
        .map((s) => (
          <Card className={cardClassName} key={s.label}>
            <CardHeader>
              <CardTitle>{s.label}</CardTitle>
            </CardHeader>
            <CardContent>
              <ul>
                {s.items.map((i) => (
                  <li key={i.id}>
                    <a href={i.href}>{i.label}</a>
                  </li>
                ))}
              </ul>
            </CardContent>
          </Card>
        ))}
    </section>
  );
}
