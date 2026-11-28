/** Show a linked path to the current document. */
import { Fragment } from "react";
import {
  Breadcrumb,
  BreadcrumbList,
  BreadcrumbItem,
  BreadcrumbLink,
  BreadcrumbSeparator,
} from "../../components/ui/breadcrumb.js";

import type { BreadcrumbsProps } from "./types.js";

/**
 * Show a linked path to the current document.
 *
 * The host supplies the ordered links. The component labels the final link as the current page.
 *
 * @param props Content and attributes for the root element.
 * @returns The rendered Breadcrumbs.
 * @example
 * <Breadcrumbs items={path} />
 */
export function Breadcrumbs({ items, className, ...rest }: BreadcrumbsProps) {
  const toolbarClassName = "cu-toolbar";
  return (
    <Breadcrumb aria-label="Breadcrumb" {...rest} className={className}>
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
