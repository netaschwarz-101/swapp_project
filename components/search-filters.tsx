"use client";

import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  CATEGORIES,
  CATEGORY_LABELS,
  CITIES,
  CONDITIONS,
  CONDITION_LABELS,
} from "@/lib/constants";

type Props = {
  defaultValues: {
    q: string;
    category: string;
    condition: string;
    city: string;
  };
};

// A plain GET form — no client-side submit handler needed, the browser's
// default form navigation produces a shareable/bookmarkable
// /search?q=...&category=... URL, which is also what makes the Prev/Next
// pagination links on the results page trivial (they just carry these
// same params forward). Radix's Select still needs "use client" (it's
// built on React context/portals), but nothing here reacts to state.
export function SearchFilters({ defaultValues }: Props) {
  return (
    <form
      method="get"
      action="/search"
      className="flex flex-col gap-3 sm:flex-row sm:flex-wrap sm:items-end"
    >
      <div className="flex flex-1 flex-col gap-1.5">
        <label htmlFor="q" className="text-sm font-medium">
          Search
        </label>
        <Input
          id="q"
          name="q"
          placeholder="Item title…"
          defaultValue={defaultValues.q}
        />
      </div>

      <div className="flex flex-col gap-1.5">
        <label className="text-sm font-medium">Category</label>
        <Select name="category" defaultValue={defaultValues.category}>
          <SelectTrigger className="w-[160px]">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All categories</SelectItem>
            {CATEGORIES.map((c) => (
              <SelectItem key={c} value={c}>
                {CATEGORY_LABELS[c]}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>

      <div className="flex flex-col gap-1.5">
        <label className="text-sm font-medium">Condition</label>
        <Select name="condition" defaultValue={defaultValues.condition}>
          <SelectTrigger className="w-[140px]">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">Any condition</SelectItem>
            {CONDITIONS.map((c) => (
              <SelectItem key={c} value={c}>
                {CONDITION_LABELS[c]}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>

      <div className="flex flex-col gap-1.5">
        <label className="text-sm font-medium">City</label>
        <Select name="city" defaultValue={defaultValues.city}>
          <SelectTrigger className="w-[160px]">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All cities</SelectItem>
            {CITIES.map((c) => (
              <SelectItem key={c} value={c}>
                {c}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>

      <Button type="submit">Search</Button>
    </form>
  );
}
