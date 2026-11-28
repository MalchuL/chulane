/** Public data and callback contracts for breadcrumbs. */

export type PageReference = { id: string; label: string; href: string };
export type BreadcrumbsProps = { items: PageReference[] };
