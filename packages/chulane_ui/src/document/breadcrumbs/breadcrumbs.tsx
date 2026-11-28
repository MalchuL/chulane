/** breadcrumbs presentation and interaction contract. */
import { Fragment } from "react";
import {
  Breadcrumb,
  BreadcrumbList,
  BreadcrumbItem,
  BreadcrumbLink,
  BreadcrumbSeparator,
} from "../../components/ui/breadcrumb.js";

import type { BreadcrumbsProps } from "./types.js";
export type { PageReference, BreadcrumbsProps } from "./types.js";

/**
 * Give a readable path back to a collection or document.
 * @param props Presentation values and host callbacks described by the public props type.
 * @returns The rendered Breadcrumbs view.
 */
export function Breadcrumbs({ items }: BreadcrumbsProps) {
  const toolbarClassName = "cu-toolbar";
  return (
    <Breadcrumb aria-label="Breadcrumb">
      <BreadcrumbList className={toolbarClassName}>
        {items.map((item, i) => (
          <Fragment key={item.id}>
            {i > 0 && <BreadcrumbSeparator />}
            <BreadcrumbItem>
              <BreadcrumbLink
                href={item.href}
                aria-current={i === items.length - 1 ? "page" : undefined}
              >
                {item.label}
              </BreadcrumbLink>
            </BreadcrumbItem>
          </Fragment>
        ))}
      </BreadcrumbList>
    </Breadcrumb>
  );
}
