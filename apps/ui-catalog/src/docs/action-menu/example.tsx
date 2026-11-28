/** Show the workspace's four command groups with submenus anchored to individual rows. */
import { ActionMenu } from "chulane_ui";
import { KnowledgeWorkspace } from "../../examples/knowledge-workspace/knowledge-workspace";
export default function Example() {
  const panels = "catalog-menu-panels";
  return (
    <KnowledgeWorkspace
      renderMenus={(groups) => (
        <div className={panels}>
          {groups.map((group) => (
            <ActionMenu key={group.id} presentation="panel" {...group} />
          ))}
        </div>
      )}
    />
  );
}
