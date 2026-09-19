import type { Category } from "../api";

const CATEGORY_LABEL: Record<Category, string> = {
  BL_COMPARISON: "BL Comparison",
  SI_REQUEST: "SI Request",
  INVOICE_QUERY: "Invoice Query",
  GENERAL: "General",
  SPAM: "Spam",
};

export function categoryLabel(category: Category): string {
  return CATEGORY_LABEL[category] ?? category;
}

export function CategoryPill({ category }: { category: Category }) {
  return (
    <span className={`category-pill category-${category.toLowerCase()}`}>
      {categoryLabel(category)}
    </span>
  );
}
