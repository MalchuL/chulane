/** Show the workspace's four command groups with submenus anchored to individual rows. */
import { ActionMenu } from "@chulane/ui";
import { KnowledgeWorkspace } from "../../examples/knowledge-workspace/knowledge-workspace";
/** Render the same command groups used by the workspace as persistent menu panels. */
export default function Example() {
  const panels = "catalog-menu-panels";
  return (
    <KnowledgeWorkspace
      renderMenus={(groups) => (
        <div className={panels}>
          {groups.map((group) => (
            <ActionMenu
              key={group.id}
              presentation="panel"
              label={group.label}
              icon={group.icon}
              items={group.items}
            />
          ))}
        </div>
      )}
    />
  );
}
